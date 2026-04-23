import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import {
  AGENT_TOOL_LABELS,
  type AgentApprovalOption,
  type AgentApprovalRequest,
  type AgentJumpTarget,
  type AgentReminder,
  type AgentReminderTone,
  type AgentSession,
  type AgentSessionPhase,
  type AgentTool,
} from '../../../shared/types/agent-hook';

const codexHookEventNameSchema = z.enum([
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'Stop',
]);

const codexHookPayloadSchema = z.object({
  cwd: z.string(),
  hook_event_name: codexHookEventNameSchema,
  session_id: z.string(),
  transcript_path: z.string().optional(),
  prompt: z.string().optional(),
  tool_name: z.string().optional(),
  tool_input: z
    .object({
      command: z.string().optional(),
      description: z.string().optional(),
      prompt: z.string().optional(),
    })
    .passthrough()
    .optional(),
  terminal_app: z.string().optional(),
  terminal_session_id: z.string().optional(),
  terminal_tty: z.string().optional(),
  terminal_title: z.string().optional(),
  last_assistant_message: z.string().optional(),
  cmux_socket_path: z.string().optional(),
  tmux_target: z.string().optional(),
  tmux_socket_path: z.string().optional(),
});

const claudeHookEventNameSchema = z.enum([
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'Notification',
  'Stop',
  'StopFailure',
]);

const claudeHookPayloadSchema = z.object({
  cwd: z.string(),
  hook_event_name: claudeHookEventNameSchema,
  session_id: z.string(),
  transcript_path: z.string().optional(),
  prompt: z.string().optional(),
  tool_name: z.string().optional(),
  tool_input: z.unknown().optional(),
  terminal_app: z.string().optional(),
  terminal_session_id: z.string().optional(),
  terminal_tty: z.string().optional(),
  terminal_title: z.string().optional(),
  title: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  last_assistant_message: z.string().optional(),
  cmux_socket_path: z.string().optional(),
  tmux_target: z.string().optional(),
  tmux_socket_path: z.string().optional(),
});

const cursorHookEventNameSchema = z.enum([
  'beforeSubmitPrompt',
  'beforeShellExecution',
  'beforeMCPExecution',
  'beforeReadFile',
  'afterFileEdit',
  'stop',
]);

const cursorHookPayloadSchema = z.object({
  hook_event_name: cursorHookEventNameSchema,
  conversation_id: z.string(),
  generation_id: z.string(),
  workspace_roots: z.array(z.string()).default([]),
  prompt: z.string().optional(),
  command: z.string().optional(),
  cwd: z.string().optional(),
  server: z.string().optional(),
  tool_name: z.string().optional(),
  tool_input: z.string().optional(),
  file_path: z.string().optional(),
  edits: z
    .array(
      z.object({
        old_string: z.string(),
        new_string: z.string(),
      })
    )
    .optional(),
  content: z.string().optional(),
  status: z.string().optional(),
  attachments: z.array(z.unknown()).optional(),
  model: z.string().optional(),
  cursor_version: z.string().optional(),
  transcript_path: z.string().optional(),
  sandbox: z.boolean().optional(),
});

const geminiHookEventNameSchema = z.enum([
  'SessionStart',
  'SessionEnd',
  'BeforeAgent',
  'AfterAgent',
  'Notification',
]);

const geminiHookPayloadSchema = z.object({
  cwd: z.string(),
  hook_event_name: geminiHookEventNameSchema,
  session_id: z.string(),
  transcript_path: z.string().optional(),
  timestamp: z.string().optional(),
  prompt: z.string().optional(),
  prompt_response: z.string().optional(),
  source: z.string().optional(),
  reason: z.string().optional(),
  notification_type: z.string().optional(),
  message: z.string().optional(),
  details: z.unknown().optional(),
  stop_hook_active: z.boolean().optional(),
  terminal_app: z.string().optional(),
  terminal_session_id: z.string().optional(),
  terminal_tty: z.string().optional(),
  terminal_title: z.string().optional(),
  cmux_socket_path: z.string().optional(),
  tmux_target: z.string().optional(),
  tmux_socket_path: z.string().optional(),
});

export type AgentHookEventUpdate = {
  session: AgentSession;
  reminder: AgentReminder | null;
};

const TRANSCRIPT_TAIL_BYTES = 1024 * 1024;
const CLAUDE_COMPATIBLE_TOOLS: AgentTool[] = ['claude', 'qoder', 'qwen', 'factory', 'codebuddy', 'kimi'];

const STANDARD_PERMISSION_OPTIONS: AgentApprovalOption[] = [
  { id: 'deny', label: '拒绝' },
  { id: 'allow-once', label: '同意' },
];

function normalizeText(value: string | undefined, maxLength = 160): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeMultilineText(value: string | undefined, maxLength?: number): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (normalized.length === 0) {
    return undefined;
  }

  if (maxLength === undefined || normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeApprovalCommand(value: string | undefined): string | undefined {
  return normalizeMultilineText(value);
}

type TranscriptLine = {
  type?: string;
  payload?: {
    type?: string;
    role?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  };
};

function readTranscriptTail(transcriptPath: string): { text: string; hasPartialHead: boolean } | undefined {
  if (!existsSync(transcriptPath)) {
    return undefined;
  }

  let fileDescriptor: number | null = null;

  try {
    const fileSize = statSync(transcriptPath).size;
    const bytesToRead = Math.min(fileSize, TRANSCRIPT_TAIL_BYTES);
    const start = Math.max(fileSize - bytesToRead, 0);
    const buffer = Buffer.alloc(bytesToRead);

    fileDescriptor = openSync(transcriptPath, 'r');
    readSync(fileDescriptor, buffer, 0, bytesToRead, start);

    return {
      text: buffer.toString('utf8'),
      hasPartialHead: start > 0,
    };
  } catch {
    return undefined;
  } finally {
    if (fileDescriptor !== null) {
      closeSync(fileDescriptor);
    }
  }
}

function extractTranscriptAssistantMessage(transcriptPath: string | undefined): string | undefined {
  if (!transcriptPath) {
    return undefined;
  }

  const tail = readTranscriptTail(transcriptPath);

  if (!tail) {
    return undefined;
  }

  const lines = tail.text.split('\n');

  if (lines.length === 0) {
    return undefined;
  }

  if (tail.hasPartialHead) {
    lines.shift();
  }

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();

    if (!line) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as TranscriptLine;
      if (parsed.type !== 'response_item') {
        continue;
      }

      if (parsed.payload?.type !== 'message' || parsed.payload.role !== 'assistant') {
        continue;
      }

      const text = (parsed.payload.content ?? [])
        .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
        .map((item) => item.text ?? '')
        .join('\n')
        .trim();

      return normalizeMultilineText(text);
    } catch {
      continue;
    }
  }

  return undefined;
}

function buildWorkspaceName(cwd: string): string {
  const normalizedPath = cwd.trim();
  const workspaceName = path.basename(normalizedPath);

  if (workspaceName.length > 0) {
    return workspaceName;
  }

  return normalizedPath.length > 0 ? normalizedPath : 'workspace';
}

function buildSessionId(tool: AgentTool, rawSessionId: string): string {
  return `${tool}:${rawSessionId}`;
}

function buildTerminalLabel(terminalApp: string | undefined, terminalTitle: string | undefined): string | undefined {
  const parts = [normalizeText(terminalApp, 40), normalizeText(terminalTitle, 60)].filter((value): value is string => Boolean(value));

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join(' · ');
}

function normalizeOptionalText(value: string | undefined, maxLength: number): string | undefined {
  return normalizeText(value, maxLength);
}

function stringifyUnknown(value: unknown, maxLength = 180): string | undefined {
  if (typeof value === 'string') {
    return normalizeMultilineText(value, maxLength);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value === null || value === undefined) {
    return undefined;
  }

  try {
    return normalizeMultilineText(JSON.stringify(value), maxLength);
  } catch {
    return undefined;
  }
}

function buildJumpTarget({
  cwd,
  terminalApp,
  terminalTitle,
  terminalSessionId,
  terminalTty,
  codexThreadId,
  cmuxSocketPath,
  tmuxTarget,
  tmuxSocketPath,
}: {
  cwd: string;
  terminalApp?: string;
  terminalTitle?: string;
  terminalSessionId?: string;
  terminalTty?: string;
  codexThreadId?: string;
  cmuxSocketPath?: string;
  tmuxTarget?: string;
  tmuxSocketPath?: string;
}): AgentJumpTarget | undefined {
  const normalizedTerminalApp = normalizeOptionalText(terminalApp, 40);
  const normalizedTerminalTitle = normalizeOptionalText(terminalTitle, 120);
  const normalizedTerminalSessionId = normalizeOptionalText(terminalSessionId, 160);
  const normalizedTerminalTty = normalizeOptionalText(terminalTty, 160);
  const normalizedCodexThreadId = normalizeOptionalText(codexThreadId, 160);
  const normalizedCmuxSocketPath = normalizeOptionalText(cmuxSocketPath, 240);
  const normalizedTmuxTarget = normalizeOptionalText(tmuxTarget, 160);
  const normalizedTmuxSocketPath = normalizeOptionalText(tmuxSocketPath, 240);
  const resolvedTerminalApp = normalizedTerminalApp
    ?? (normalizedTmuxTarget ? 'tmux' : undefined)
    ?? (normalizedCodexThreadId ? 'Codex.app' : undefined);

  if (!resolvedTerminalApp) {
    return undefined;
  }

  return {
    terminalApp: resolvedTerminalApp,
    workingDirectory: cwd.trim() || undefined,
    terminalSessionId: normalizedTerminalSessionId,
    terminalTty: normalizedTerminalTty,
    terminalTitle: normalizedTerminalTitle,
    codexThreadId: normalizedCodexThreadId,
    cmuxSocketPath: normalizedCmuxSocketPath,
    tmuxTarget: normalizedTmuxTarget,
    tmuxSocketPath: normalizedTmuxSocketPath,
  };
}

function buildSession(
  tool: AgentTool,
  sessionId: string,
  cwd: string,
  timestampMs: number,
  terminalApp: string | undefined,
  terminalTitle: string | undefined,
  terminalSessionId: string | undefined,
  terminalTty: string | undefined,
  phase: AgentSessionPhase,
  summary: string,
  lastEventName: string,
  prompt?: string,
  detail?: string,
  approvalRequest?: AgentApprovalRequest,
  extraJumpTargetFields?: Pick<AgentJumpTarget, 'codexThreadId' | 'cmuxSocketPath' | 'tmuxTarget' | 'tmuxSocketPath'>
): AgentSession {
  const workspaceName = buildWorkspaceName(cwd);
  const toolLabel = AGENT_TOOL_LABELS[tool];

  return {
    id: buildSessionId(tool, sessionId),
    tool,
    title: `${toolLabel} · ${workspaceName}`,
    workspaceName,
    cwd,
    phase,
    summary,
    prompt,
    detail,
    approvalRequest,
    lastEventName,
    terminalLabel: buildTerminalLabel(terminalApp, terminalTitle),
    jumpTarget: buildJumpTarget({
      cwd,
      terminalApp,
      terminalTitle,
      terminalSessionId,
      terminalTty,
      codexThreadId: extraJumpTargetFields?.codexThreadId,
      cmuxSocketPath: extraJumpTargetFields?.cmuxSocketPath,
      tmuxTarget: extraJumpTargetFields?.tmuxTarget,
      tmuxSocketPath: extraJumpTargetFields?.tmuxSocketPath,
    }),
    updatedAtMs: timestampMs,
  };
}

function buildWorkspaceSession(
  tool: AgentTool,
  sessionId: string,
  cwd: string,
  timestampMs: number,
  phase: AgentSessionPhase,
  summary: string,
  lastEventName: string,
  prompt?: string,
  detail?: string,
  approvalRequest?: AgentApprovalRequest,
  terminalApp?: string
): AgentSession {
  const workspaceName = buildWorkspaceName(cwd);
  const toolLabel = AGENT_TOOL_LABELS[tool];

  return {
    id: buildSessionId(tool, sessionId),
    tool,
    title: `${toolLabel} · ${workspaceName}`,
    workspaceName,
    cwd,
    phase,
    summary,
    prompt,
    detail,
    approvalRequest,
    lastEventName,
    terminalLabel: terminalApp,
    jumpTarget: buildJumpTarget({
      cwd,
      terminalApp,
    }),
    updatedAtMs: timestampMs,
  };
}

function reminderDurationMs(tone: AgentReminderTone): number {
  switch (tone) {
    case 'attention':
      return 30_000;
    case 'success':
      return 12_000;
    case 'info':
    default:
      return 8_000;
  }
}

function buildReminder(
  session: AgentSession,
  timestampMs: number,
  tone: AgentReminderTone,
  title: string,
  summary: string,
  detail?: string
): AgentReminder {
  const expiresAtMs = tone === 'attention' && session.phase !== 'completed'
    ? null
    : timestampMs + reminderDurationMs(tone);

  return {
    id: `${session.id}:${timestampMs}:${session.phase}`,
    sessionId: session.id,
    tool: session.tool,
    phase: session.phase,
    tone,
    title,
    summary,
    detail,
    createdAtMs: timestampMs,
    expiresAtMs,
    shouldExpand: tone === 'attention' || tone === 'success',
  };
}

function buildAgentCommandApproval(command: string, options: AgentApprovalOption[] = STANDARD_PERMISSION_OPTIONS): AgentApprovalRequest {
  return {
    kind: 'command',
    command,
    rememberKey: command,
    options: options.map((option) => ({ ...option })),
  };
}

function extractQuestionSummary(toolInput: unknown): string | undefined {
  if (typeof toolInput !== 'object' || toolInput === null) {
    return undefined;
  }

  const record = toolInput as Record<string, unknown>;
  const directQuestion = normalizeText(typeof record.question === 'string' ? record.question : undefined, 140);
  if (directQuestion) {
    return directQuestion;
  }

  const questions = Array.isArray(record.questions) ? record.questions : [];
  for (const item of questions) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }

    const question = normalizeText(
      typeof (item as Record<string, unknown>).question === 'string'
        ? ((item as Record<string, unknown>).question as string)
        : undefined,
      140
    );

    if (question) {
      return question;
    }
  }

  const title = normalizeText(typeof record.title === 'string' ? record.title : undefined, 140);
  if (title) {
    return title;
  }

  return undefined;
}

function extractToolPreview(toolInput: unknown): string | undefined {
  if (typeof toolInput !== 'object' || toolInput === null) {
    return undefined;
  }

  const record = toolInput as Record<string, unknown>;

  if (typeof record.command === 'string') {
    return normalizeText(record.command, 140);
  }

  if (typeof record.description === 'string') {
    return normalizeText(record.description, 140);
  }

  if (typeof record.prompt === 'string') {
    return normalizeText(record.prompt, 140);
  }

  return extractQuestionSummary(toolInput);
}

function isQuestionRequest(toolName: string | undefined, toolInput: unknown): boolean {
  const normalizedToolName = toolName?.trim().toLowerCase();

  if (normalizedToolName === 'request_user_input' || normalizedToolName === 'askuserquestion') {
    return true;
  }

  return extractQuestionSummary(toolInput) !== undefined;
}

function buildPermissionDetail(preferred: Array<string | undefined>): string | undefined {
  for (const candidate of preferred) {
    const normalized = normalizeMultilineText(candidate, 1_200) ?? normalizeText(candidate, 180);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function firstNonEmptyString(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function parseCodexHookPayload(payload: unknown, timestampMs: number): AgentHookEventUpdate | null {
  const result = codexHookPayloadSchema.safeParse(payload);

  if (!result.success) {
    return null;
  }

  const parsed = result.data;
  const prompt = normalizeText(parsed.prompt, 140);
  const toolPreview = extractToolPreview(parsed.tool_input);
  const fullCommand = normalizeApprovalCommand(parsed.tool_input?.command);
  const codexThreadId = parsed.terminal_app === 'Codex.app' ? parsed.session_id : undefined;

  switch (parsed.hook_event_name) {
    case 'SessionStart': {
      return {
        session: buildSession(
          'codex',
          parsed.session_id,
          parsed.cwd,
          timestampMs,
          parsed.terminal_app,
          parsed.terminal_title,
          parsed.terminal_session_id,
          parsed.terminal_tty,
          'running',
          '已开始新的 Codex 会话',
          parsed.hook_event_name,
          prompt,
          undefined,
          undefined,
          {
            codexThreadId,
            cmuxSocketPath: parsed.cmux_socket_path,
            tmuxTarget: parsed.tmux_target,
            tmuxSocketPath: parsed.tmux_socket_path,
          }
        ),
        reminder: null,
      };
    }
    case 'UserPromptSubmit': {
      return {
        session: buildSession(
          'codex',
          parsed.session_id,
          parsed.cwd,
          timestampMs,
          parsed.terminal_app,
          parsed.terminal_title,
          parsed.terminal_session_id,
          parsed.terminal_tty,
          'running',
          '收到新的用户请求',
          parsed.hook_event_name,
          prompt,
          undefined,
          undefined,
          {
            codexThreadId,
            cmuxSocketPath: parsed.cmux_socket_path,
            tmuxTarget: parsed.tmux_target,
            tmuxSocketPath: parsed.tmux_socket_path,
          }
        ),
        reminder: null,
      };
    }
    case 'PreToolUse': {
      const detail = fullCommand ? normalizeMultilineText(fullCommand, 1_200) ?? toolPreview : toolPreview;
      const session = buildSession(
        'codex',
        parsed.session_id,
        parsed.cwd,
        timestampMs,
        parsed.terminal_app,
        parsed.terminal_title,
        parsed.terminal_session_id,
        parsed.terminal_tty,
        'running',
        fullCommand ? '准备执行命令' : parsed.tool_name ? `运行 ${parsed.tool_name}` : '正在执行工具',
        parsed.hook_event_name,
        prompt,
        detail,
        undefined,
        {
          codexThreadId,
          cmuxSocketPath: parsed.cmux_socket_path,
          tmuxTarget: parsed.tmux_target,
          tmuxSocketPath: parsed.tmux_socket_path,
        }
      );

      return {
        session,
        reminder: null,
      };
    }
    case 'PostToolUse': {
      return {
        session: buildSession(
          'codex',
          parsed.session_id,
          parsed.cwd,
          timestampMs,
          parsed.terminal_app,
          parsed.terminal_title,
          parsed.terminal_session_id,
          parsed.terminal_tty,
          'running',
          parsed.tool_name ? `${parsed.tool_name} 已完成` : '工具调用已完成',
          parsed.hook_event_name,
          prompt,
          toolPreview,
          undefined,
          {
            codexThreadId,
            cmuxSocketPath: parsed.cmux_socket_path,
            tmuxTarget: parsed.tmux_target,
            tmuxSocketPath: parsed.tmux_socket_path,
          }
        ),
        reminder: null,
      };
    }
    case 'PermissionRequest': {
      const needsAnswer = isQuestionRequest(parsed.tool_name, parsed.tool_input);
      const phase: AgentSessionPhase = needsAnswer ? 'needs-answer' : 'needs-approval';
      const summary = needsAnswer ? '等待你的回答' : '等待你的确认';
      const detail = buildPermissionDetail([
        fullCommand,
        parsed.tool_input?.description,
        toolPreview,
        parsed.tool_name,
      ]);
      const reminderTitle = needsAnswer ? 'Codex 等待回答' : 'Codex 需要确认';
      const reminderSummary = needsAnswer
        ? (detail ?? summary)
        : normalizeText(parsed.tool_input?.description, 300) ?? 'Codex 正在请求运行命令的权限。';
      const approvalText = fullCommand ?? detail;
      const approvalRequest = !needsAnswer && approvalText ? buildAgentCommandApproval(approvalText) : undefined;
      const session = buildSession(
        'codex',
        parsed.session_id,
        parsed.cwd,
        timestampMs,
        parsed.terminal_app,
        parsed.terminal_title,
        parsed.terminal_session_id,
        parsed.terminal_tty,
        phase,
        summary,
        parsed.hook_event_name,
        prompt,
        detail,
        approvalRequest,
        {
          codexThreadId,
          cmuxSocketPath: parsed.cmux_socket_path,
          tmuxTarget: parsed.tmux_target,
          tmuxSocketPath: parsed.tmux_socket_path,
        }
      );

      return {
        session,
        reminder: buildReminder(session, timestampMs, 'attention', reminderTitle, reminderSummary, approvalText ? detail : undefined),
      };
    }
    case 'Stop': {
      const summary = normalizeText(parsed.last_assistant_message, 140) ?? '当前回合已完成';
      const reminderSummary = extractTranscriptAssistantMessage(parsed.transcript_path)
        ?? normalizeMultilineText(parsed.last_assistant_message)
        ?? summary;
      const session = buildSession(
        'codex',
        parsed.session_id,
        parsed.cwd,
        timestampMs,
        parsed.terminal_app,
        parsed.terminal_title,
        parsed.terminal_session_id,
        parsed.terminal_tty,
        'completed',
        summary,
        parsed.hook_event_name,
        prompt,
        undefined,
        undefined,
        {
          codexThreadId,
          cmuxSocketPath: parsed.cmux_socket_path,
          tmuxTarget: parsed.tmux_target,
          tmuxSocketPath: parsed.tmux_socket_path,
        }
      );

      return {
        session,
        reminder: buildReminder(session, timestampMs, 'success', 'Codex 已完成', reminderSummary),
      };
    }
  }
}

function parseClaudeCompatibleHookPayload(tool: AgentTool, payload: unknown, timestampMs: number): AgentHookEventUpdate | null {
  const result = claudeHookPayloadSchema.safeParse(payload);

  if (!result.success) {
    return null;
  }

  const parsed = result.data;
  const prompt = normalizeText(parsed.prompt, 140);
  const toolPreview = extractToolPreview(parsed.tool_input);
  const fullCommand = normalizeApprovalCommand(
    typeof parsed.tool_input === 'object' && parsed.tool_input !== null && 'command' in parsed.tool_input
      ? typeof (parsed.tool_input as Record<string, unknown>).command === 'string'
        ? ((parsed.tool_input as Record<string, unknown>).command as string)
        : undefined
      : undefined
  );
  const toolLabel = AGENT_TOOL_LABELS[tool];
  const jumpTargetFields = {
    cmuxSocketPath: parsed.cmux_socket_path,
    tmuxTarget: parsed.tmux_target,
    tmuxSocketPath: parsed.tmux_socket_path,
  };

  switch (parsed.hook_event_name) {
    case 'SessionStart': {
      return {
        session: buildSession(
          tool,
          parsed.session_id,
          parsed.cwd,
          timestampMs,
          parsed.terminal_app,
          parsed.terminal_title,
          parsed.terminal_session_id,
          parsed.terminal_tty,
          'running',
          `已开始新的 ${toolLabel} 会话`,
          parsed.hook_event_name,
          prompt,
          undefined,
          undefined,
          jumpTargetFields
        ),
        reminder: null,
      };
    }
    case 'UserPromptSubmit': {
      return {
        session: buildSession(
          tool,
          parsed.session_id,
          parsed.cwd,
          timestampMs,
          parsed.terminal_app,
          parsed.terminal_title,
          parsed.terminal_session_id,
          parsed.terminal_tty,
          'running',
          '收到新的用户请求',
          parsed.hook_event_name,
          prompt,
          undefined,
          undefined,
          jumpTargetFields
        ),
        reminder: null,
      };
    }
    case 'PreToolUse': {
      return {
        session: buildSession(
          tool,
          parsed.session_id,
          parsed.cwd,
          timestampMs,
          parsed.terminal_app,
          parsed.terminal_title,
          parsed.terminal_session_id,
          parsed.terminal_tty,
          'running',
          parsed.tool_name ? `运行 ${parsed.tool_name}` : '正在执行工具',
          parsed.hook_event_name,
          prompt,
          fullCommand ?? toolPreview,
          undefined,
          jumpTargetFields
        ),
        reminder: null,
      };
    }
    case 'Notification': {
      const summary = normalizeText(parsed.title, 80) ?? normalizeText(parsed.message, 140) ?? `收到新的 ${toolLabel} 通知`;
      const detail = normalizeMultilineText(parsed.message, 800) ?? toolPreview;
      const session = buildSession(
        tool,
        parsed.session_id,
        parsed.cwd,
        timestampMs,
        parsed.terminal_app,
        parsed.terminal_title,
        parsed.terminal_session_id,
        parsed.terminal_tty,
        'running',
        summary,
        parsed.hook_event_name,
        prompt,
        detail,
        undefined,
        jumpTargetFields
      );

      return {
        session,
        reminder: buildReminder(session, timestampMs, 'info', `${toolLabel} 通知`, summary, detail),
      };
    }
    case 'PermissionRequest': {
      const needsAnswer = isQuestionRequest(parsed.tool_name, parsed.tool_input);
      const phase: AgentSessionPhase = needsAnswer ? 'needs-answer' : 'needs-approval';
      const summary = needsAnswer ? '等待你的回答' : '等待你的确认';
      const detail = buildPermissionDetail([
        fullCommand,
        toolPreview,
        normalizeText(parsed.message, 140),
        normalizeText(parsed.title, 120),
        normalizeText(parsed.tool_name, 120),
      ]);
      const reminderTitle = needsAnswer ? `${toolLabel} 等待回答` : `${toolLabel} 需要确认`;
      const approvalText = fullCommand ?? detail;
      const approvalRequest = !needsAnswer && approvalText ? buildAgentCommandApproval(approvalText) : undefined;
      const session = buildSession(
        tool,
        parsed.session_id,
        parsed.cwd,
        timestampMs,
        parsed.terminal_app,
        parsed.terminal_title,
        parsed.terminal_session_id,
        parsed.terminal_tty,
        phase,
        summary,
        parsed.hook_event_name,
        prompt,
        detail,
        approvalRequest,
        jumpTargetFields
      );

      return {
        session,
        reminder: buildReminder(session, timestampMs, 'attention', reminderTitle, detail ?? summary),
      };
    }
    case 'Stop':
    case 'SessionEnd':
    case 'StopFailure': {
      const summary = normalizeText(parsed.last_assistant_message, 140)
        ?? normalizeText(parsed.error, 140)
        ?? normalizeText(parsed.message, 140)
        ?? (parsed.hook_event_name === 'SessionEnd' ? '会话已结束' : '当前回合已完成');
      const reminderSummary = extractTranscriptAssistantMessage(parsed.transcript_path)
        ?? normalizeMultilineText(parsed.last_assistant_message)
        ?? normalizeMultilineText(parsed.error)
        ?? normalizeMultilineText(parsed.message)
        ?? summary;
      const tone: AgentReminderTone = parsed.hook_event_name === 'StopFailure' ? 'attention' : 'success';
      const title = parsed.hook_event_name === 'StopFailure' ? `${toolLabel} 已停止` : `${toolLabel} 已完成`;
      const session = buildSession(
        tool,
        parsed.session_id,
        parsed.cwd,
        timestampMs,
        parsed.terminal_app,
        parsed.terminal_title,
        parsed.terminal_session_id,
        parsed.terminal_tty,
        'completed',
        summary,
        parsed.hook_event_name,
        prompt,
        undefined,
        undefined,
        jumpTargetFields
      );

      return {
        session,
        reminder: buildReminder(session, timestampMs, tone, title, reminderSummary),
      };
    }
  }
}

function parseCursorHookPayload(payload: unknown, timestampMs: number): AgentHookEventUpdate | null {
  const result = cursorHookPayloadSchema.safeParse(payload);

  if (!result.success) {
    return null;
  }

  const parsed = result.data;
  const primaryWorkspaceRoot = firstNonEmptyString([
    parsed.workspace_roots[0],
    parsed.cwd,
  ]) ?? 'cursor-workspace';
  const prompt = normalizeText(parsed.prompt, 140);
  const command = normalizeApprovalCommand(parsed.command);
  const toolInput = normalizeMultilineText(parsed.tool_input, 800) ?? normalizeText(parsed.tool_input, 160);
  const filePath = normalizeText(parsed.file_path, 200);
  const detail = buildPermissionDetail([
    command,
    toolInput,
    filePath,
    normalizeText(parsed.tool_name, 120),
  ]);

  switch (parsed.hook_event_name) {
    case 'beforeSubmitPrompt': {
      return {
        session: buildWorkspaceSession(
          'cursor',
          parsed.conversation_id,
          primaryWorkspaceRoot,
          timestampMs,
          'running',
          '收到新的用户请求',
          parsed.hook_event_name,
          prompt,
          undefined,
          undefined,
          'Cursor'
        ),
        reminder: null,
      };
    }
    case 'beforeShellExecution':
    case 'beforeMCPExecution': {
      const approvalSummary = parsed.hook_event_name === 'beforeShellExecution'
        ? 'Cursor 正在请求执行命令的权限。'
        : `Cursor 正在请求调用 ${normalizeText(parsed.tool_name, 80) ?? 'MCP 工具'} 的权限。`;
      const approvalText = command
        ?? detail
        ?? approvalSummary;
      const session = buildWorkspaceSession(
        'cursor',
        parsed.conversation_id,
        primaryWorkspaceRoot,
        timestampMs,
        'needs-approval',
        '等待你的确认',
        parsed.hook_event_name,
        prompt,
        detail,
        buildAgentCommandApproval(approvalText),
        'Cursor'
      );

      return {
        session,
        reminder: buildReminder(
          session,
          timestampMs,
          'attention',
          'Cursor 需要确认',
          command ?? approvalSummary,
          detail && detail !== command ? detail : undefined
        ),
      };
    }
    case 'beforeReadFile': {
      const summary = filePath ? `正在读取 ${path.basename(filePath)}` : '正在读取文件';
      return {
        session: buildWorkspaceSession(
          'cursor',
          parsed.conversation_id,
          primaryWorkspaceRoot,
          timestampMs,
          'running',
          summary,
          parsed.hook_event_name,
          prompt,
          filePath,
          undefined,
          'Cursor'
        ),
        reminder: null,
      };
    }
    case 'afterFileEdit': {
      const editSummary = filePath ? `已更新 ${path.basename(filePath)}` : '文件已更新';
      const editDetail = filePath
        ?? (parsed.edits && parsed.edits.length > 0 ? `已修改 ${parsed.edits.length} 处内容` : undefined);
      return {
        session: buildWorkspaceSession(
          'cursor',
          parsed.conversation_id,
          primaryWorkspaceRoot,
          timestampMs,
          'running',
          editSummary,
          parsed.hook_event_name,
          prompt,
          editDetail,
          undefined,
          'Cursor'
        ),
        reminder: null,
      };
    }
    case 'stop': {
      const summary = normalizeText(parsed.content, 140)
        ?? normalizeText(parsed.status, 140)
        ?? '当前回合已完成';
      const reminderSummary = normalizeMultilineText(parsed.content)
        ?? summary;
      const session = buildWorkspaceSession(
        'cursor',
        parsed.conversation_id,
        primaryWorkspaceRoot,
        timestampMs,
        'completed',
        summary,
        parsed.hook_event_name,
        prompt,
        undefined,
        undefined,
        'Cursor'
      );

      return {
        session,
        reminder: buildReminder(session, timestampMs, 'success', 'Cursor 已完成', reminderSummary),
      };
    }
  }
}

function geminiStartSummary(source: string | undefined): string {
  switch (source?.trim().toLowerCase()) {
    case 'resume':
      return '已恢复 Gemini CLI 会话';
    case 'clear':
      return '已清空 Gemini CLI 会话';
    default:
      return '已开始新的 Gemini CLI 会话';
  }
}

function parseGeminiHookPayload(payload: unknown, timestampMs: number): AgentHookEventUpdate | null {
  const result = geminiHookPayloadSchema.safeParse(payload);

  if (!result.success) {
    return null;
  }

  const parsed = result.data;
  const prompt = normalizeText(parsed.prompt, 140);
  const responsePreview = normalizeText(parsed.prompt_response, 140);
  const responseDetail = normalizeMultilineText(parsed.prompt_response);
  const notificationSummary = normalizeText(parsed.message, 140) ?? '收到新的 Gemini CLI 通知';
  const renderedDetails = stringifyUnknown(parsed.details);
  const jumpTargetFields = {
    cmuxSocketPath: parsed.cmux_socket_path,
    tmuxTarget: parsed.tmux_target,
    tmuxSocketPath: parsed.tmux_socket_path,
  };

  switch (parsed.hook_event_name) {
    case 'SessionStart': {
      return {
        session: buildSession(
          'gemini',
          parsed.session_id,
          parsed.cwd,
          timestampMs,
          parsed.terminal_app,
          parsed.terminal_title,
          parsed.terminal_session_id,
          parsed.terminal_tty,
          'running',
          geminiStartSummary(parsed.source),
          parsed.hook_event_name,
          prompt,
          undefined,
          undefined,
          jumpTargetFields
        ),
        reminder: null,
      };
    }
    case 'BeforeAgent': {
      return {
        session: buildSession(
          'gemini',
          parsed.session_id,
          parsed.cwd,
          timestampMs,
          parsed.terminal_app,
          parsed.terminal_title,
          parsed.terminal_session_id,
          parsed.terminal_tty,
          'running',
          '收到新的用户请求',
          parsed.hook_event_name,
          prompt,
          undefined,
          undefined,
          jumpTargetFields
        ),
        reminder: null,
      };
    }
    case 'AfterAgent': {
      const summary = responsePreview ?? '当前回合已完成';
      const session = buildSession(
        'gemini',
        parsed.session_id,
        parsed.cwd,
        timestampMs,
        parsed.terminal_app,
        parsed.terminal_title,
        parsed.terminal_session_id,
        parsed.terminal_tty,
        'completed',
        summary,
        parsed.hook_event_name,
        prompt,
        undefined,
        undefined,
        jumpTargetFields
      );

      return {
        session,
        reminder: buildReminder(session, timestampMs, 'success', 'Gemini CLI 已完成', responseDetail ?? summary),
      };
    }
    case 'Notification': {
      const session = buildSession(
        'gemini',
        parsed.session_id,
        parsed.cwd,
        timestampMs,
        parsed.terminal_app,
        parsed.terminal_title,
        parsed.terminal_session_id,
        parsed.terminal_tty,
        'running',
        notificationSummary,
        parsed.hook_event_name,
        prompt,
        renderedDetails,
        undefined,
        jumpTargetFields
      );

      return {
        session,
        reminder: buildReminder(session, timestampMs, 'info', 'Gemini CLI 通知', notificationSummary, renderedDetails),
      };
    }
    case 'SessionEnd': {
      const summary = normalizeText(parsed.reason, 140) ?? '会话已结束';
      const session = buildSession(
        'gemini',
        parsed.session_id,
        parsed.cwd,
        timestampMs,
        parsed.terminal_app,
        parsed.terminal_title,
        parsed.terminal_session_id,
        parsed.terminal_tty,
        'completed',
        summary,
        parsed.hook_event_name,
        prompt,
        undefined,
        undefined,
        jumpTargetFields
      );

      return {
        session,
        reminder: buildReminder(session, timestampMs, 'success', 'Gemini CLI 已结束', summary),
      };
    }
  }
}

export function parseAgentHookPayload(
  source: string,
  payload: unknown,
  timestampMs = Date.now()
): AgentHookEventUpdate | null {
  if (source === 'codex') {
    return parseCodexHookPayload(payload, timestampMs);
  }

  if (CLAUDE_COMPATIBLE_TOOLS.includes(source as AgentTool)) {
    return parseClaudeCompatibleHookPayload(source as AgentTool, payload, timestampMs);
  }

  if (source === 'cursor') {
    return parseCursorHookPayload(payload, timestampMs);
  }

  if (source === 'gemini') {
    return parseGeminiHookPayload(payload, timestampMs);
  }

  return null;
}
