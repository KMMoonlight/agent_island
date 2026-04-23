import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

import { app } from 'electron';

import type {
  AgentTool,
  AgentApprovalDecision,
  AgentApprovalRequest,
  AgentHookInstallStatus,
  AgentHookSetup,
  AgentHookSnippet,
  AgentOverlayState,
  AgentReminder,
  AgentSession,
} from '../../../shared/types/agent-hook';
import { AGENT_TOOL_LABELS } from '../../../shared/types/agent-hook';
import { logger as baseLogger } from '../logger';
import type { SourceStore } from '../state/source-store';
import { parseAgentHookPayload, type AgentHookEventUpdate } from './agent-hook-events';
import { AgentHookInstallationManager } from './agent-hook-installation';

const DEFAULT_PORT = 45_991;
const DEFAULT_BASE_URL = `http://127.0.0.1:${DEFAULT_PORT}/v1/hooks`;
const MAX_REQUEST_BODY_BYTES = 512 * 1024;
const MAX_SESSIONS = 8;
const BRIDGE_SCRIPT_FILE_NAME = 'agent-hook-bridge.sh';
const RUNTIME_ENV_FILE_NAME = 'agent-hook-runtime.env';
const CODEX_HOOK_TIMEOUT_SECONDS = 45;
const CODEX_PERMISSION_REQUEST_TIMEOUT_SECONDS = 600;
const CLAUDE_HOOK_TIMEOUT_SECONDS = 10;
const CODEX_APPROVAL_MAX_WAIT_MS = 44_000;
const CODEX_APPROVAL_DENIED_REASON = 'Permission denied in Agent Island.';
const SUPPORTED_HOOK_SOURCES = [
  'codex',
  'claude',
  'qoder',
  'qwen',
  'factory',
  'codebuddy',
  'cursor',
  'gemini',
  'kimi',
] as const;

type HookSource = (typeof SUPPORTED_HOOK_SOURCES)[number];

const APPROVAL_CAPABLE_SOURCES: HookSource[] = [
  'codex',
  'claude',
  'qoder',
  'qwen',
  'factory',
  'codebuddy',
  'cursor',
  'kimi',
];

const CLAUDE_COMPATIBLE_SOURCES: Array<{ source: Exclude<HookSource, 'codex' | 'cursor' | 'gemini' | 'kimi'> | 'claude'; title: string; configPath: string }> = [
  { source: 'claude', title: 'Claude Code', configPath: '~/.claude/settings.json' },
  { source: 'qoder', title: 'Qoder', configPath: '~/.qoder/settings.json' },
  { source: 'qwen', title: 'Qwen Code', configPath: '~/.qwen/settings.json' },
  { source: 'factory', title: 'Factory', configPath: '~/.factory/settings.json' },
  { source: 'codebuddy', title: 'CodeBuddy', configPath: '~/.codebuddy/settings.json' },
];

type PendingHookResponse = {
  statusCode: number;
  body?: string;
  contentType?: string;
};

type PendingApprovalRecord = {
  source: HookSource;
  resolve: (response: PendingHookResponse) => void;
  timer: ReturnType<typeof setTimeout> | null;
};

function escapeForDoubleQuotedShell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function shellQuote(value: string): string {
  if (value.length === 0) {
    return "''";
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildCommand(command: string | null, source: HookSource): string | null {
  if (!command) {
    return null;
  }

  return `${shellQuote(command)} ${source}`;
}

function buildCodexHooksJsonSnippet(command: string | null): string {
  const hookCommand = buildCommand(command, 'codex') ?? '/path/to/agent-hook-bridge.sh codex';
  const standardHook = {
    type: 'command',
    command: hookCommand,
    timeout: CODEX_HOOK_TIMEOUT_SECONDS,
  };
  const permissionHook = {
    type: 'command',
    command: hookCommand,
    timeout: CODEX_PERMISSION_REQUEST_TIMEOUT_SECONDS,
  };

  return JSON.stringify(
    {
      hooks: {
        SessionStart: [
          {
            matcher: 'startup|resume',
            hooks: [standardHook],
          },
        ],
        UserPromptSubmit: [
          {
            hooks: [standardHook],
          },
        ],
        PreToolUse: [
          {
            hooks: [permissionHook],
          },
        ],
        Stop: [
          {
            hooks: [standardHook],
          },
        ],
      },
    },
    null,
    2
  );
}

function buildClaudeCompatibleSettingsJsonSnippet(command: string | null, source: HookSource): string {
  const hookCommand = buildCommand(command, source) ?? `/path/to/agent-hook-bridge.sh ${source}`;
  const hook = {
    type: 'command',
    command: hookCommand,
    timeout: CLAUDE_HOOK_TIMEOUT_SECONDS,
  };

  return JSON.stringify(
    {
      hooks: {
        SessionStart: [
          {
            hooks: [hook],
          },
        ],
        UserPromptSubmit: [
          {
            hooks: [hook],
          },
        ],
        PermissionRequest: [
          {
            matcher: '*',
            hooks: [hook],
          },
        ],
        Stop: [
          {
            hooks: [hook],
          },
        ],
        StopFailure: [
          {
            hooks: [hook],
          },
        ],
        SessionEnd: [
          {
            hooks: [hook],
          },
        ],
      },
    },
    null,
    2
  );
}

function buildClaudeSettingsJsonSnippet(command: string | null): string {
  return buildClaudeCompatibleSettingsJsonSnippet(command, 'claude');
}

function buildCursorHooksJsonSnippet(command: string | null): string {
  const hookCommand = buildCommand(command, 'cursor') ?? '/path/to/agent-hook-bridge.sh cursor';
  const events = [
    'beforeSubmitPrompt',
    'beforeShellExecution',
    'beforeMCPExecution',
    'beforeReadFile',
    'afterFileEdit',
    'stop',
  ];

  return JSON.stringify(
    {
      version: 1,
      hooks: Object.fromEntries(events.map((eventName) => ([
        eventName,
        [{ command: hookCommand }],
      ]))),
    },
    null,
    2
  );
}

function buildGeminiSettingsJsonSnippet(command: string | null): string {
  const hookCommand = buildCommand(command, 'gemini') ?? '/path/to/agent-hook-bridge.sh gemini';
  const hook = {
    type: 'command',
    command: hookCommand,
    name: 'Agent Island',
  };

  return JSON.stringify(
    {
      hooks: {
        SessionStart: [{ matcher: '*', hooks: [hook] }],
        SessionEnd: [{ matcher: '*', hooks: [hook] }],
        BeforeAgent: [{ matcher: '*', hooks: [hook] }],
        AfterAgent: [{ matcher: '*', hooks: [hook] }],
        Notification: [{ matcher: '*', hooks: [hook] }],
      },
    },
    null,
    2
  );
}

function buildKimiConfigTomlSnippet(command: string | null): string {
  const hookCommand = buildCommand(command, 'kimi') ?? '/path/to/agent-hook-bridge.sh kimi';
  const eventSpecs: Array<{ event: string; matcher?: string }> = [
    { event: 'SessionStart', matcher: 'startup|resume' },
    { event: 'UserPromptSubmit' },
    { event: 'Stop' },
    { event: 'Notification' },
    { event: 'PreToolUse' },
    { event: 'PostToolUse' },
  ];

  return eventSpecs.map((spec) => [
    '[[hooks]]',
    `event = "${spec.event}"`,
    spec.matcher ? `matcher = "${spec.matcher}"` : null,
    `command = ${JSON.stringify(hookCommand)}`,
    `timeout = ${CLAUDE_HOOK_TIMEOUT_SECONDS}`,
    '',
  ].filter((line): line is string => Boolean(line)).join('\n')).join('\n');
}

function buildSetupSnippets(command: string | null): AgentHookSnippet[] {
  const snippets: AgentHookSnippet[] = [
    {
      id: 'codex-config',
      source: 'codex',
      title: 'Codex 配置开关',
      configPath: '~/.codex/config.toml',
      description: '启用 Codex 官方 hooks 功能。',
      value: '[features]\ncodex_hooks = true\n',
    },
    {
      id: 'codex-hooks',
      source: 'codex',
      title: 'Codex',
      configPath: '~/.codex/hooks.json',
      description: 'Codex CLI 的受管 hook 片段。',
      value: buildCodexHooksJsonSnippet(command),
    },
    {
      id: 'cursor-hooks',
      source: 'cursor',
      title: 'Cursor',
      configPath: '~/.cursor/hooks.json',
      description: 'Cursor hooks.json 片段。',
      value: buildCursorHooksJsonSnippet(command),
    },
    {
      id: 'gemini-settings',
      source: 'gemini',
      title: 'Gemini CLI',
      configPath: '~/.gemini/settings.json',
      description: 'Gemini CLI hooks 配置片段。',
      value: buildGeminiSettingsJsonSnippet(command),
    },
    {
      id: 'kimi-config',
      source: 'kimi',
      title: 'Kimi CLI',
      configPath: '~/.kimi/config.toml',
      description: 'Kimi CLI 的 `[[hooks]]` TOML 片段。',
      value: buildKimiConfigTomlSnippet(command),
    },
  ];

  for (const item of CLAUDE_COMPATIBLE_SOURCES) {
    snippets.push({
      id: `${item.source}-settings`,
      source: item.source,
      title: item.title,
      configPath: item.configPath,
      description: `${item.title} 兼容 Claude hooks 协议，直接复用同一类 settings.json 结构。`,
      value: buildClaudeCompatibleSettingsJsonSnippet(command, item.source),
    });
  }

  return snippets;
}

function buildInstallStatuses(bridgeScriptPath: string | null): AgentHookInstallStatus[] {
  if (!bridgeScriptPath) {
    return [];
  }

  return new AgentHookInstallationManager(bridgeScriptPath).getStatuses();
}

function buildCodexPermissionAllowResponse(): PendingHookResponse {
  return {
    statusCode: 204,
  };
}

function buildCodexPermissionDenyResponse(reason: string): PendingHookResponse {
  return {
    statusCode: 200,
    contentType: 'application/json; charset=utf-8',
    body: `${JSON.stringify({
      decision: 'block',
      reason,
    })}\n`,
  };
}

function buildClaudeCompatiblePermissionAllowResponse(): PendingHookResponse {
  return {
    statusCode: 200,
    contentType: 'application/json; charset=utf-8',
    body: `${JSON.stringify({
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: {
          behavior: 'allow',
        },
      },
    })}\n`,
  };
}

function buildClaudeCompatiblePermissionDenyResponse(reason: string): PendingHookResponse {
  return {
    statusCode: 200,
    contentType: 'application/json; charset=utf-8',
    body: `${JSON.stringify({
      continue: true,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: {
          behavior: 'deny',
          message: reason,
        },
      },
    })}\n`,
  };
}

function buildCursorPermissionAllowResponse(): PendingHookResponse {
  return {
    statusCode: 200,
    contentType: 'application/json; charset=utf-8',
    body: `${JSON.stringify({
      continue: true,
      permission: 'allow',
    })}\n`,
  };
}

function buildCursorPermissionDenyResponse(reason: string): PendingHookResponse {
  return {
    statusCode: 200,
    contentType: 'application/json; charset=utf-8',
    body: `${JSON.stringify({
      continue: true,
      permission: 'deny',
      agentMessage: reason,
    })}\n`,
  };
}

function sourceToTool(source: HookSource): AgentTool {
  return source;
}

function createDefaultSetup(bridgeScriptPath: string | null): AgentHookSetup {
  return {
    isServerRunning: false,
    statusMessage: 'Hook bridge is starting…',
    endpointBaseUrl: null,
    bridgeScriptPath,
    runtimeEnvPath: null,
    codexCommand: buildCommand(bridgeScriptPath, 'codex'),
    claudeCommand: buildCommand(bridgeScriptPath, 'claude'),
    codexHooksJsonSnippet: buildCodexHooksJsonSnippet(bridgeScriptPath),
    codexConfigTomlSnippet: '[features]\ncodex_hooks = true\n',
    claudeSettingsJsonSnippet: buildClaudeSettingsJsonSnippet(bridgeScriptPath),
    installStatuses: buildInstallStatuses(bridgeScriptPath),
    snippets: buildSetupSnippets(bridgeScriptPath),
  };
}

function cloneHookSnippet(snippet: AgentHookSnippet): AgentHookSnippet {
  return {
    ...snippet,
  };
}

function cloneInstallStatus(status: AgentHookInstallStatus): AgentHookInstallStatus {
  return {
    ...status,
    configPaths: [...status.configPaths],
  };
}

function cloneSetup(setup: AgentHookSetup): AgentHookSetup {
  return {
    ...setup,
    installStatuses: setup.installStatuses.map(cloneInstallStatus),
    snippets: setup.snippets.map(cloneHookSnippet),
  };
}

function cloneReminder(reminder: AgentReminder): AgentReminder {
  return {
    ...reminder,
  };
}

function cloneApprovalRequest(approvalRequest: AgentApprovalRequest | undefined): AgentApprovalRequest | undefined {
  if (!approvalRequest) {
    return undefined;
  }

  return {
    ...approvalRequest,
    options: approvalRequest.options.map((option) => ({ ...option })),
  };
}

function cloneSession(session: AgentSession): AgentSession {
  return {
    ...session,
    approvalRequest: cloneApprovalRequest(session.approvalRequest),
    jumpTarget: session.jumpTarget ? { ...session.jumpTarget } : undefined,
  };
}

export class AgentHookService {
  private readonly logger = baseLogger.scope('agents:hooks');

  private readonly hookDirectoryPath = path.join(app.getPath('userData'), 'agent-hooks');

  private readonly bridgeScriptPath = path.join(this.hookDirectoryPath, BRIDGE_SCRIPT_FILE_NAME);

  private readonly runtimeEnvPath = path.join(this.hookDirectoryPath, RUNTIME_ENV_FILE_NAME);

  private setup: AgentHookSetup = createDefaultSetup(this.bridgeScriptPath);

  private agentState: AgentOverlayState = {
    sessions: [],
    activeReminder: null,
  };

  private server: http.Server | null = null;

  private reminderTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly pendingApprovals = new Map<string, PendingApprovalRecord>();

  constructor(private readonly sourceStore: SourceStore) {}

  async start(): Promise<void> {
    this.ensureHookDirectory();
    this.writeBridgeScript();

    try {
      await this.startServer();
      this.logger.info('Agent hook bridge ready', {
        endpointBaseUrl: this.setup.endpointBaseUrl,
        bridgeScriptPath: this.setup.bridgeScriptPath,
      });
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error('Unknown hook bridge startup failure');
      this.setup = {
        ...this.setup,
        isServerRunning: false,
        statusMessage: `Hook bridge unavailable: ${normalizedError.message}`,
        endpointBaseUrl: null,
        bridgeScriptPath: this.bridgeScriptPath,
        runtimeEnvPath: this.runtimeEnvPath,
        codexCommand: buildCommand(this.bridgeScriptPath, 'codex'),
        claudeCommand: buildCommand(this.bridgeScriptPath, 'claude'),
        codexHooksJsonSnippet: buildCodexHooksJsonSnippet(this.bridgeScriptPath),
        codexConfigTomlSnippet: '[features]\ncodex_hooks = true\n',
        claudeSettingsJsonSnippet: buildClaudeSettingsJsonSnippet(this.bridgeScriptPath),
        installStatuses: buildInstallStatuses(this.bridgeScriptPath),
        snippets: buildSetupSnippets(this.bridgeScriptPath),
      };
      this.writeRuntimeEnv(DEFAULT_BASE_URL);
      this.logger.error('Failed to start agent hook bridge', {
        message: normalizedError.message,
      });
    }
  }

  stop(): void {
    this.flushPendingApprovals();

    if (this.reminderTimer) {
      clearTimeout(this.reminderTimer);
      this.reminderTimer = null;
    }

    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  getSetup(): AgentHookSetup {
    return cloneSetup(this.setup);
  }

  installManagedHooks(source: AgentTool): AgentHookSetup {
    this.ensureHookDirectory();
    this.writeBridgeScript();

    const installStatuses = new AgentHookInstallationManager(this.bridgeScriptPath).install(source);
    this.setup = {
      ...this.setup,
      bridgeScriptPath: this.bridgeScriptPath,
      codexCommand: buildCommand(this.bridgeScriptPath, 'codex'),
      claudeCommand: buildCommand(this.bridgeScriptPath, 'claude'),
      codexHooksJsonSnippet: buildCodexHooksJsonSnippet(this.bridgeScriptPath),
      codexConfigTomlSnippet: '[features]\ncodex_hooks = true\n',
      claudeSettingsJsonSnippet: buildClaudeSettingsJsonSnippet(this.bridgeScriptPath),
      installStatuses,
      snippets: buildSetupSnippets(this.bridgeScriptPath),
    };

    return this.getSetup();
  }

  uninstallManagedHooks(source: AgentTool): AgentHookSetup {
    const installStatuses = new AgentHookInstallationManager(this.bridgeScriptPath).uninstall(source);
    this.setup = {
      ...this.setup,
      bridgeScriptPath: this.bridgeScriptPath,
      codexCommand: buildCommand(this.bridgeScriptPath, 'codex'),
      claudeCommand: buildCommand(this.bridgeScriptPath, 'claude'),
      codexHooksJsonSnippet: buildCodexHooksJsonSnippet(this.bridgeScriptPath),
      codexConfigTomlSnippet: '[features]\ncodex_hooks = true\n',
      claudeSettingsJsonSnippet: buildClaudeSettingsJsonSnippet(this.bridgeScriptPath),
      installStatuses,
      snippets: buildSetupSnippets(this.bridgeScriptPath),
    };

    return this.getSetup();
  }

  private ensureHookDirectory(): void {
    if (!existsSync(this.hookDirectoryPath)) {
      mkdirSync(this.hookDirectoryPath, { recursive: true });
    }
  }

  private writeBridgeScript(): void {
    const runtimeEnvPath = escapeForDoubleQuotedShell(this.runtimeEnvPath);
    const fallbackBaseUrl = escapeForDoubleQuotedShell(DEFAULT_BASE_URL);
    const scriptContents = `#!/bin/sh
source_name="$1"
if [ -z "$source_name" ]; then
  exit 0
fi

if ! command -v curl >/dev/null 2>&1; then
  exit 0
fi

runtime_env_path="${runtimeEnvPath}"
if [ -f "$runtime_env_path" ]; then
  # shellcheck disable=SC1090
  . "$runtime_env_path"
fi

base_url="${fallbackBaseUrl}"
if [ -n "$AGENT_ISLAND_HOOK_BASE_URL" ]; then
  base_url="$AGENT_ISLAND_HOOK_BASE_URL"
fi

payload_json="$(cat)"
if [ -z "$payload_json" ]; then
  exit 0
fi

terminal_app=""
terminal_session_id=""
cmux_socket_path=""
tmux_target=""
tmux_socket_path=""
term_program="$(printf '%s' "$TERM_PROGRAM" | tr '[:upper:]' '[:lower:]')"
bundle_id="$(printf '%s' "$__CFBundleIdentifier" | tr '[:upper:]' '[:lower:]')"
terminal_emulator="$(printf '%s' "$TERMINAL_EMULATOR" | tr '[:upper:]' '[:lower:]')"

if [ -n "$CMUX_WORKSPACE_ID" ] || [ -n "$CMUX_SOCKET_PATH" ]; then
  terminal_app="cmux"
elif [ -n "$ZELLIJ" ]; then
  terminal_app="Zellij"
elif printf '%s' "$bundle_id" | grep -q 'openai.*codex\\|codex.*openai'; then
  terminal_app="Codex.app"
else
  case "$term_program" in
    apple_terminal)
      terminal_app="Terminal"
      ;;
    iterm.app|iterm2)
      terminal_app="iTerm"
      ;;
    *warp*)
      terminal_app="Warp"
      ;;
    *ghostty*)
      terminal_app="Ghostty"
      ;;
    *wezterm*)
      terminal_app="WezTerm"
      ;;
    kaku)
      terminal_app="Kaku"
      ;;
    vscode)
      if printf '%s' "$bundle_id" | grep -q 'cursor'; then
        terminal_app="Cursor"
      else
        terminal_app="VS Code"
      fi
      ;;
    vscode-insiders)
      terminal_app="VS Code Insiders"
      ;;
    windsurf)
      terminal_app="Windsurf"
      ;;
    trae)
      terminal_app="Trae"
      ;;
  esac
fi

if [ -z "$terminal_app" ]; then
  if [ -n "$ITERM_SESSION_ID" ] || [ "$LC_TERMINAL" = "iTerm2" ]; then
    terminal_app="iTerm"
  elif [ -n "$WARP_IS_LOCAL_SHELL_SESSION" ]; then
    terminal_app="Warp"
  elif [ -n "$GHOSTTY_RESOURCES_DIR" ]; then
    terminal_app="Ghostty"
  elif [ -n "$terminal_emulator" ] && printf '%s' "$terminal_emulator" | grep -q 'jetbrains'; then
    case "$bundle_id" in
      *webstorm*)
        terminal_app="WebStorm"
        ;;
      *pycharm*)
        terminal_app="PyCharm"
        ;;
      *goland*)
        terminal_app="GoLand"
        ;;
      *clion*)
        terminal_app="CLion"
        ;;
      *rubymine*)
        terminal_app="RubyMine"
        ;;
      *phpstorm*)
        terminal_app="PhpStorm"
        ;;
      *rider*)
        terminal_app="Rider"
        ;;
      *rustrover*)
        terminal_app="RustRover"
        ;;
      *)
        terminal_app="IntelliJ IDEA"
        ;;
    esac
  fi
fi

if [ "$terminal_app" = "iTerm" ] && [ -n "$ITERM_SESSION_ID" ]; then
  terminal_session_id="$ITERM_SESSION_ID"
elif [ "$terminal_app" = "cmux" ] && [ -n "$CMUX_SURFACE_ID" ]; then
  terminal_session_id="$CMUX_SURFACE_ID"
  cmux_socket_path="$CMUX_SOCKET_PATH"
elif [ "$terminal_app" = "Zellij" ] && [ -n "$ZELLIJ_PANE_ID" ]; then
  terminal_session_id="$ZELLIJ_PANE_ID:$ZELLIJ_SESSION_NAME"
fi

if [ -n "$TMUX" ]; then
  tmux_socket_path="$(printf '%s' "$TMUX" | cut -d',' -f1)"
  if command -v tmux >/dev/null 2>&1; then
    tmux_target="$(tmux display-message -p '#S:#I.#P' 2>/dev/null || true)"
  fi
fi

terminal_tty=""
if command -v tty >/dev/null 2>&1; then
  current_tty="$(tty 2>/dev/null || true)"
  case "$current_tty" in
    /dev/*)
      terminal_tty="$current_tty"
      ;;
    ""|"not a tty"|"??"|"-")
      terminal_tty=""
      ;;
    *)
      terminal_tty="/dev/$current_tty"
      ;;
  esac
fi

if command -v python3 >/dev/null 2>&1; then
  enriched_payload="$(
    printf '%s' "$payload_json" | \
      AGENT_ISLAND_TERMINAL_APP="$terminal_app" \
      AGENT_ISLAND_TERMINAL_SESSION_ID="$terminal_session_id" \
      AGENT_ISLAND_TERMINAL_TTY="$terminal_tty" \
      AGENT_ISLAND_CMUX_SOCKET_PATH="$cmux_socket_path" \
      AGENT_ISLAND_TMUX_TARGET="$tmux_target" \
      AGENT_ISLAND_TMUX_SOCKET_PATH="$tmux_socket_path" \
      python3 -c 'import json, os, sys
try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(1)
if not isinstance(payload, dict):
    sys.exit(1)
terminal_app = os.environ.get("AGENT_ISLAND_TERMINAL_APP") or ""
terminal_session_id = os.environ.get("AGENT_ISLAND_TERMINAL_SESSION_ID") or ""
terminal_tty = os.environ.get("AGENT_ISLAND_TERMINAL_TTY") or ""
cmux_socket_path = os.environ.get("AGENT_ISLAND_CMUX_SOCKET_PATH") or ""
tmux_target = os.environ.get("AGENT_ISLAND_TMUX_TARGET") or ""
tmux_socket_path = os.environ.get("AGENT_ISLAND_TMUX_SOCKET_PATH") or ""
if terminal_app and not payload.get("terminal_app"):
    payload["terminal_app"] = terminal_app
if terminal_session_id and not payload.get("terminal_session_id"):
    payload["terminal_session_id"] = terminal_session_id
if terminal_tty and not payload.get("terminal_tty"):
    payload["terminal_tty"] = terminal_tty
if cmux_socket_path and not payload.get("cmux_socket_path"):
    payload["cmux_socket_path"] = cmux_socket_path
if tmux_target and not payload.get("tmux_target"):
    payload["tmux_target"] = tmux_target
if tmux_socket_path and not payload.get("tmux_socket_path"):
    payload["tmux_socket_path"] = tmux_socket_path
json.dump(payload, sys.stdout, ensure_ascii=False, separators=(",", ":"))'
  )" || enriched_payload=""

  if [ -n "$enriched_payload" ]; then
    payload_json="$enriched_payload"
  fi
fi

printf '%s' "$payload_json" | curl -fsS -X POST "$base_url/$source_name" \
  -H "Content-Type: application/json" \
  --data-binary @- 2>/dev/null || true
`;

    writeFileSync(this.bridgeScriptPath, scriptContents, 'utf8');
    chmodSync(this.bridgeScriptPath, 0o755);
  }

  private writeRuntimeEnv(baseUrl: string): void {
    const contents = `AGENT_ISLAND_HOOK_BASE_URL=${shellQuote(baseUrl)}\n`;
    writeFileSync(this.runtimeEnvPath, contents, 'utf8');
  }

  private async startServer(): Promise<void> {
    let server: http.Server;

    try {
      server = await this.createListeningServer(DEFAULT_PORT);
    } catch (error) {
      const normalizedError = error as NodeJS.ErrnoException;
      if (normalizedError.code !== 'EADDRINUSE') {
        throw error;
      }

      this.logger.warn('Preferred hook bridge port is busy, retrying with a random port', {
        port: DEFAULT_PORT,
      });
      server = await this.createListeningServer(0);
    }

    this.server = server;
    const address = server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Hook bridge did not expose a TCP address.');
    }

    const endpointBaseUrl = `http://127.0.0.1:${(address as AddressInfo).port}/v1/hooks`;
    this.writeRuntimeEnv(endpointBaseUrl);
    this.setup = {
      isServerRunning: true,
      statusMessage: `Listening on ${endpointBaseUrl}`,
      endpointBaseUrl,
      bridgeScriptPath: this.bridgeScriptPath,
      runtimeEnvPath: this.runtimeEnvPath,
      codexCommand: buildCommand(this.bridgeScriptPath, 'codex'),
      claudeCommand: buildCommand(this.bridgeScriptPath, 'claude'),
      codexHooksJsonSnippet: buildCodexHooksJsonSnippet(this.bridgeScriptPath),
      codexConfigTomlSnippet: '[features]\ncodex_hooks = true\n',
      claudeSettingsJsonSnippet: buildClaudeSettingsJsonSnippet(this.bridgeScriptPath),
      installStatuses: buildInstallStatuses(this.bridgeScriptPath),
      snippets: buildSetupSnippets(this.bridgeScriptPath),
    };
  }

  private createListeningServer(port: number): Promise<http.Server> {
    const server = http.createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    return new Promise((resolve, reject) => {
      const handleError = (error: Error): void => {
        server.removeListener('listening', handleListening);
        reject(error);
      };

      const handleListening = (): void => {
        server.removeListener('error', handleError);
        resolve(server);
      };

      server.once('error', handleError);
      server.once('listening', handleListening);
      server.listen(port, '127.0.0.1');
    });
  }

  private async handleRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    if (request.method !== 'POST') {
      response.writeHead(405).end();
      return;
    }

    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const pathMatch = url.pathname.match(new RegExp(`^/v1/hooks/(${SUPPORTED_HOOK_SOURCES.join('|')})$`));

    if (!pathMatch || !pathMatch[1]) {
      response.writeHead(404).end();
      return;
    }

    const hookSource = pathMatch[1] as HookSource;

    try {
      const rawBody = await this.readRequestBody(request);

      if (rawBody.length === 0) {
        response.writeHead(204).end();
        return;
      }

      const parsedBody = JSON.parse(rawBody) as unknown;
      const eventUpdate = parseAgentHookPayload(hookSource, parsedBody);

      if (eventUpdate) {
        this.applyEventUpdate(eventUpdate);

        if (this.shouldAwaitApproval(hookSource, eventUpdate)) {
          const pendingResponse = await this.awaitPendingApproval(eventUpdate.session.id, hookSource);
          this.writeHookResponse(response, pendingResponse);
          return;
        }
      }
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error('Unknown hook bridge request failure');
      this.logger.warn('Ignoring invalid hook payload', {
        message: normalizedError.message,
      });
    }

    response.writeHead(204).end();
  }

  resolvePendingApproval(sessionId: string, decision: AgentApprovalDecision): boolean {
    const pendingSessionId = this.findPendingApprovalSessionId(sessionId);
    const pendingApproval = pendingSessionId ? this.pendingApprovals.get(pendingSessionId) : undefined;

    if (!pendingApproval) {
      this.logger.warn('Attempted to resolve a missing pending approval', {
        requestedSessionId: sessionId,
        pendingSessionIds: Array.from(this.pendingApprovals.keys()),
      });
      return false;
    }

    const resolvedSessionId = pendingSessionId as string;
    const isApproved = decision !== 'deny';
    const nextPhase = isApproved ? 'running' : 'completed';
    const normalizedDecision = decision === 'allow-always' ? 'allow-once' : decision;
    const toolLabel = AGENT_TOOL_LABELS[sourceToTool(pendingApproval.source)];
    const nextSummary = normalizedDecision === 'allow-once' ? `已同意，${toolLabel} 继续执行` : '已拒绝该权限请求';

    this.logger.info('Resolving pending agent approval', {
      sessionId: resolvedSessionId,
      source: pendingApproval.source,
      decision: normalizedDecision,
    });

    this.syncResolvedSession(resolvedSessionId, nextPhase, nextSummary);
    this.settlePendingApproval(resolvedSessionId, this.buildApprovalResponse(pendingApproval.source, isApproved));

    return true;
  }

  private readRequestBody(request: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalLength = 0;

      request.on('data', (chunk: Buffer | string) => {
        const bufferChunk = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        totalLength += bufferChunk.length;

        if (totalLength > MAX_REQUEST_BODY_BYTES) {
          reject(new Error('Hook payload exceeded the maximum supported size.'));
          request.destroy();
          return;
        }

        chunks.push(bufferChunk);
      });

      request.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });

      request.on('error', (error) => {
        reject(error);
      });
    });
  }

  private applyEventUpdate(eventUpdate: AgentHookEventUpdate): void {
    this.logger.info('Applying agent hook event', {
      sessionId: eventUpdate.session.id,
      tool: eventUpdate.session.tool,
      phase: eventUpdate.session.phase,
      lastEventName: eventUpdate.session.lastEventName,
      jumpTarget: eventUpdate.session.jumpTarget ?? null,
      reminderId: eventUpdate.reminder?.id ?? null,
    });

    const nextSessions = this.upsertSession(this.agentState.sessions, eventUpdate.session);
    const nextReminder = this.resolveNextReminder(eventUpdate);

    this.agentState = {
      sessions: nextSessions,
      activeReminder: nextReminder,
    };

    this.syncReminderTimer(nextReminder);
    this.sourceStore.setAgentState(this.agentState);
  }

  private shouldAwaitApproval(source: HookSource, eventUpdate: AgentHookEventUpdate): boolean {
    return APPROVAL_CAPABLE_SOURCES.includes(source)
      && eventUpdate.session.phase === 'needs-approval'
      && Boolean(eventUpdate.session.approvalRequest);
  }

  private awaitPendingApproval(sessionId: string, source: HookSource): Promise<PendingHookResponse> {
    this.settlePendingApproval(sessionId, { statusCode: 204 });

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.logger.warn('Timed out waiting for agent approval, handing control back to the agent', {
          sessionId,
          source,
        });
        this.syncResolvedSession(sessionId, 'running', '等待确认超时，已交还 Agent 继续处理');
        this.settlePendingApproval(sessionId, { statusCode: 204 });
      }, CODEX_APPROVAL_MAX_WAIT_MS);

      this.logger.info('Waiting for agent approval response', {
        sessionId,
        source,
      });

      this.pendingApprovals.set(sessionId, {
        source,
        resolve,
        timer,
      });
    });
  }

  private findPendingApprovalSessionId(sessionId: string): string | null {
    if (this.pendingApprovals.has(sessionId)) {
      return sessionId;
    }

    const normalizedSessionId = sessionId.includes(':') ? sessionId.slice(sessionId.indexOf(':') + 1) : sessionId;
    const candidates = new Set<string>([normalizedSessionId]);

    for (const source of APPROVAL_CAPABLE_SOURCES) {
      candidates.add(`${source}:${normalizedSessionId}`);
    }

    for (const candidate of candidates) {
      if (this.pendingApprovals.has(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private settlePendingApproval(sessionId: string, response: PendingHookResponse): void {
    const pendingApproval = this.pendingApprovals.get(sessionId);

    if (!pendingApproval) {
      return;
    }

    this.pendingApprovals.delete(sessionId);

    if (pendingApproval.timer) {
      clearTimeout(pendingApproval.timer);
    }

    pendingApproval.resolve(response);
  }

  private flushPendingApprovals(): void {
    for (const [sessionId, pendingApproval] of this.pendingApprovals.entries()) {
      if (pendingApproval.timer) {
        clearTimeout(pendingApproval.timer);
      }

      pendingApproval.resolve({ statusCode: 204 });
      this.pendingApprovals.delete(sessionId);
    }
  }

  private writeHookResponse(response: http.ServerResponse, hookResponse: PendingHookResponse): void {
    if (hookResponse.body) {
      response.writeHead(hookResponse.statusCode, {
        'Content-Type': hookResponse.contentType ?? 'text/plain; charset=utf-8',
      });
      response.end(hookResponse.body);
      return;
    }

    response.writeHead(hookResponse.statusCode).end();
  }

  private buildApprovalResponse(source: HookSource, isApproved: boolean): PendingHookResponse {
    if (source === 'codex') {
      return isApproved
        ? buildCodexPermissionAllowResponse()
        : buildCodexPermissionDenyResponse(CODEX_APPROVAL_DENIED_REASON);
    }

    if (source === 'cursor') {
      return isApproved
        ? buildCursorPermissionAllowResponse()
        : buildCursorPermissionDenyResponse(CODEX_APPROVAL_DENIED_REASON);
    }

    return isApproved
      ? buildClaudeCompatiblePermissionAllowResponse()
      : buildClaudeCompatiblePermissionDenyResponse(CODEX_APPROVAL_DENIED_REASON);
  }

  private syncResolvedSession(
    sessionId: string,
    phase: AgentSession['phase'],
    summary: string
  ): void {
    const nextSessions = this.agentState.sessions.map((session) => {
      if (session.id !== sessionId) {
        return cloneSession(session);
      }

      return {
        ...cloneSession(session),
        phase,
        summary,
        approvalRequest: phase === 'needs-approval' ? cloneApprovalRequest(session.approvalRequest) : undefined,
        updatedAtMs: Date.now(),
      };
    }).sort((left, right) => right.updatedAtMs - left.updatedAtMs);

    const activeReminder = this.agentState.activeReminder?.sessionId === sessionId
      ? null
      : this.agentState.activeReminder ? cloneReminder(this.agentState.activeReminder) : null;

    this.agentState = {
      sessions: nextSessions,
      activeReminder,
    };

    this.syncReminderTimer(activeReminder);
    this.sourceStore.setAgentState(this.agentState);
  }

  private upsertSession(currentSessions: AgentSession[], nextSession: AgentSession): AgentSession[] {
    const existingSession = currentSessions.find((session) => session.id === nextSession.id);

    const mergedSession: AgentSession = existingSession
      ? {
          ...existingSession,
          ...nextSession,
          prompt: nextSession.prompt ?? existingSession.prompt,
          detail: nextSession.detail ?? existingSession.detail,
          approvalRequest: cloneApprovalRequest(nextSession.approvalRequest),
          terminalLabel: nextSession.terminalLabel ?? existingSession.terminalLabel,
        }
      : nextSession;

    const remainingSessions = currentSessions.filter((session) => session.id !== nextSession.id);
    const nextSessions = [mergedSession, ...remainingSessions]
      .sort((left, right) => right.updatedAtMs - left.updatedAtMs)
      .slice(0, MAX_SESSIONS)
      .map(cloneSession);

    return nextSessions;
  }

  private resolveNextReminder(eventUpdate: AgentHookEventUpdate): AgentReminder | null {
    if (eventUpdate.reminder) {
      return cloneReminder(eventUpdate.reminder);
    }

    if (this.agentState.activeReminder?.sessionId === eventUpdate.session.id) {
      return null;
    }

    return this.agentState.activeReminder ? cloneReminder(this.agentState.activeReminder) : null;
  }

  private syncReminderTimer(reminder: AgentReminder | null): void {
    if (this.reminderTimer) {
      clearTimeout(this.reminderTimer);
      this.reminderTimer = null;
    }

    if (!reminder?.expiresAtMs) {
      return;
    }

    const delayMs = Math.max(reminder.expiresAtMs - Date.now(), 0);
    this.reminderTimer = setTimeout(() => {
      this.reminderTimer = null;
      this.agentState = {
        ...this.agentState,
        activeReminder:
          this.agentState.activeReminder?.id === reminder.id ? null : this.agentState.activeReminder,
      };
      this.sourceStore.setAgentState(this.agentState);
    }, delayMs);
  }
}
