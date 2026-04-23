import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { createConnection } from 'node:net';
import { promisify } from 'node:util';

import type { AgentJumpTarget } from '../../shared/types/agent-hook';
import { logger as baseLogger } from '../services/logger';

const execFileAsync = promisify(execFile);
const logger = baseLogger.scope('jump-to-terminal');
const HOME_DIRECTORY = process.env.HOME ?? '';

type TerminalDescriptor = {
  bundleId: string;
  aliases: string[];
  alternateBundleIds?: string[];
  appPaths?: string[];
  scriptAppNames?: string[];
};

const TERMINAL_DESCRIPTORS: TerminalDescriptor[] = [
  {
    bundleId: 'com.googlecode.iterm2',
    aliases: ['iterm', 'iterm2', 'iterm.app'],
    appPaths: ['/Applications/iTerm.app', `${HOME_DIRECTORY}/Applications/iTerm.app`],
    scriptAppNames: ['iTerm', 'iTerm2'],
  },
  {
    bundleId: 'com.cmuxterm.app',
    aliases: ['cmux'],
  },
  {
    bundleId: 'com.mitchellh.ghostty',
    aliases: ['ghostty'],
    appPaths: ['/Applications/Ghostty.app', `${HOME_DIRECTORY}/Applications/Ghostty.app`],
  },
  {
    bundleId: 'com.apple.Terminal',
    aliases: ['terminal', 'apple_terminal', 'terminal.app'],
    appPaths: ['/System/Applications/Utilities/Terminal.app', '/Applications/Utilities/Terminal.app'],
  },
  {
    bundleId: 'dev.warp.Warp-Stable',
    aliases: ['warp', 'warpterminal'],
    appPaths: ['/Applications/Warp.app', `${HOME_DIRECTORY}/Applications/Warp.app`],
  },
  {
    bundleId: 'com.github.wez.wezterm',
    aliases: ['wezterm'],
    appPaths: ['/Applications/WezTerm.app', `${HOME_DIRECTORY}/Applications/WezTerm.app`],
  },
  {
    bundleId: 'com.openai.codex',
    aliases: ['codex.app'],
  },
  {
    bundleId: 'fun.tw93.kaku',
    aliases: ['kaku'],
    appPaths: ['/Applications/Kaku.app', `${HOME_DIRECTORY}/Applications/Kaku.app`],
  },
  {
    bundleId: 'com.todesktop.230313mzl4w4u92',
    aliases: ['cursor'],
  },
  {
    bundleId: 'com.microsoft.VSCode',
    aliases: ['vscode', 'vs code', 'visual studio code', 'code'],
  },
  {
    bundleId: 'com.microsoft.VSCodeInsiders',
    aliases: ['vscode-insiders', 'vs code insiders', 'code-insiders'],
  },
  {
    bundleId: 'com.exafunction.windsurf',
    aliases: ['windsurf'],
  },
  {
    bundleId: 'com.trae.app',
    aliases: ['trae', 'trae cn', 'trae-cn', 'traecn'],
    alternateBundleIds: ['cn.trae.app'],
  },
  {
    bundleId: 'com.jetbrains.intellij',
    aliases: ['intellij idea', 'intellij', 'idea'],
  },
  {
    bundleId: 'com.jetbrains.WebStorm',
    aliases: ['webstorm'],
  },
  {
    bundleId: 'com.jetbrains.pycharm',
    aliases: ['pycharm'],
  },
  {
    bundleId: 'com.jetbrains.goland',
    aliases: ['goland'],
  },
  {
    bundleId: 'com.jetbrains.CLion',
    aliases: ['clion'],
  },
  {
    bundleId: 'com.jetbrains.rubymine',
    aliases: ['rubymine'],
  },
  {
    bundleId: 'com.jetbrains.PhpStorm',
    aliases: ['phpstorm'],
  },
  {
    bundleId: 'com.jetbrains.rider',
    aliases: ['rider'],
  },
  {
    bundleId: 'com.jetbrains.rustrover',
    aliases: ['rustrover'],
  },
];

const ZELLIJ_PARENT_BUNDLE_IDS = TERMINAL_DESCRIPTORS
  .map((descriptor) => descriptor.bundleId)
  .filter((bundleId) => bundleId !== 'com.cmuxterm.app' && bundleId !== 'com.openai.codex');

const VSCODE_FAMILY_CLI: Record<string, string> = {
  'com.microsoft.VSCode': 'code',
  'com.microsoft.VSCodeInsiders': 'code-insiders',
  'com.todesktop.230313mzl4w4u92': 'cursor',
  'com.exafunction.windsurf': 'windsurf',
  'com.trae.app': 'trae',
  'cn.trae.app': 'trae',
};

const JETBRAINS_FAMILY_CLI: Record<string, string> = {
  'com.jetbrains.intellij': 'idea',
  'com.jetbrains.WebStorm': 'webstorm',
  'com.jetbrains.pycharm': 'pycharm',
  'com.jetbrains.goland': 'goland',
  'com.jetbrains.CLion': 'clion',
  'com.jetbrains.rubymine': 'rubymine',
  'com.jetbrains.PhpStorm': 'phpstorm',
  'com.jetbrains.rider': 'rider',
  'com.jetbrains.rustrover': 'rustrover',
};

function normalizeTerminalAppName(terminalApp: string | undefined): string {
  return terminalApp?.trim().toLowerCase() ?? '';
}

function resolveTerminalDescriptor(terminalApp: string | undefined): TerminalDescriptor | null {
  const normalizedTerminalApp = normalizeTerminalAppName(terminalApp);

  if (normalizedTerminalApp.length === 0) {
    return null;
  }

  return TERMINAL_DESCRIPTORS.find((descriptor) => descriptor.aliases.includes(normalizedTerminalApp)) ?? null;
}

function descriptorBundleIds(descriptor: TerminalDescriptor): string[] {
  return [descriptor.bundleId, ...(descriptor.alternateBundleIds ?? [])];
}

function escapeAppleScript(value: string | undefined): string {
  return (value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function runAppleScript(script: string): Promise<string> {
  const { stdout } = await execFileAsync('/usr/bin/osascript', ['-e', script]);
  return stdout.trim();
}

async function execCli(command: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync(command, args);
    return true;
  } catch {
    return false;
  }
}

async function openBundle(bundleId: string): Promise<boolean> {
  return execCli('/usr/bin/open', ['-b', bundleId]);
}

async function openUrl(url: string): Promise<boolean> {
  return execCli('/usr/bin/open', [url]);
}

async function openTerminalApp(descriptor: TerminalDescriptor): Promise<boolean> {
  for (const bundleId of descriptorBundleIds(descriptor)) {
    if (await openBundle(bundleId)) {
      logger.info('Activated terminal via bundle id', {
        bundleId,
      });
      return true;
    }
  }

  for (const appPath of descriptor.appPaths ?? []) {
    if (!appPath || !existsSync(appPath)) {
      continue;
    }

    if (await execCli('/usr/bin/open', [appPath])) {
      logger.info('Activated terminal via app path', {
        bundleId: descriptor.bundleId,
        appPath,
      });
      return true;
    }
  }

  logger.warn('Failed to activate terminal app', {
    bundleId: descriptor.bundleId,
  });
  return false;
}

async function isBundleRunning(bundleId: string): Promise<boolean> {
  const script = `try\nreturn (application id "${escapeAppleScript(bundleId)}" is running) as text\non error\nreturn "false"\nend try`;

  try {
    return (await runAppleScript(script)).toLowerCase() === 'true';
  } catch {
    return false;
  }
}

async function findRunningBundleId(bundleIds: string[]): Promise<string | null> {
  for (const bundleId of bundleIds) {
    if (await isBundleRunning(bundleId)) {
      return bundleId;
    }
  }

  return null;
}

async function jumpToITermSession(target: AgentJumpTarget, appName: string): Promise<boolean> {
  const rawTerminalSessionId = target.terminalSessionId?.trim() ?? '';
  const sessionIdSegments = rawTerminalSessionId.split(':');
  const terminalSessionId = escapeAppleScript(rawTerminalSessionId);
  const terminalSessionIdPrefix = escapeAppleScript(sessionIdSegments[0] ?? '');
  const terminalSessionIdSuffix = escapeAppleScript(sessionIdSegments.length > 1 ? sessionIdSegments.slice(1).join(':') : '');
  const terminalTty = escapeAppleScript(target.terminalTty);
  const terminalTitle = escapeAppleScript(target.terminalTitle);
  const script = `
tell application "${appName}"
    if not (it is running) then return ""
    activate
    repeat with aWindow in windows
        repeat with aTab in tabs of aWindow
            repeat with aSession in sessions of aTab
                set matched to false
                set sessionIdentifier to (id of aSession as text)
                if "${terminalSessionId}" is not "" and sessionIdentifier is "${terminalSessionId}" then
                    set matched to true
                end if
                if not matched and "${terminalSessionIdPrefix}" is not "" and sessionIdentifier is "${terminalSessionIdPrefix}" then
                    set matched to true
                end if
                if not matched and "${terminalSessionIdSuffix}" is not "" and sessionIdentifier is "${terminalSessionIdSuffix}" then
                    set matched to true
                end if
                if not matched and "${terminalSessionIdPrefix}" is not "" and sessionIdentifier contains "${terminalSessionIdPrefix}" then
                    set matched to true
                end if
                if not matched and "${terminalSessionIdSuffix}" is not "" and sessionIdentifier contains "${terminalSessionIdSuffix}" then
                    set matched to true
                end if
                if not matched and "${terminalTty}" is not "" and (tty of aSession as text) is "${terminalTty}" then
                    set matched to true
                end if
                if not matched and "${terminalTitle}" is not "" and (name of aSession as text) contains "${terminalTitle}" then
                    set matched to true
                end if
                if matched then
                    select aWindow
                    tell aWindow to select aTab
                    select aSession
                    return "matched"
                end if
            end repeat
        end repeat
    end repeat
end tell
return ""
`;

  try {
    return (await runAppleScript(script)) === 'matched';
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown iTerm jump error');
    logger.warn('iTerm jump AppleScript failed', {
      appName,
      message: normalizedError.message,
    });
    return false;
  }
}

async function jumpToGhosttyTerminal(target: AgentJumpTarget): Promise<boolean> {
  const terminalSessionId = escapeAppleScript(target.terminalSessionId);
  const workingDirectory = escapeAppleScript(target.workingDirectory);
  const terminalTitle = escapeAppleScript(target.terminalTitle);
  const script = `
tell application "Ghostty"
    if not (it is running) then return ""
    activate

    set targetWindow to missing value
    set targetTab to missing value
    set targetTerminal to missing value

    repeat with aWindow in windows
        repeat with aTab in tabs of aWindow
            repeat with aTerminal in terminals of aTab
                if "${terminalSessionId}" is not "" and (id of aTerminal as text) is "${terminalSessionId}" then
                    set targetWindow to aWindow
                    set targetTab to aTab
                    set targetTerminal to aTerminal
                    exit repeat
                end if
            end repeat

            if targetTerminal is not missing value then exit repeat
        end repeat

        if targetTerminal is not missing value then exit repeat
    end repeat

    if targetTerminal is missing value and "${workingDirectory}" is not "" then
        repeat with aWindow in windows
            repeat with aTab in tabs of aWindow
                repeat with aTerminal in terminals of aTab
                    if (working directory of aTerminal as text) is "${workingDirectory}" then
                        set targetWindow to aWindow
                        set targetTab to aTab
                        set targetTerminal to aTerminal
                        exit repeat
                    end if
                end repeat

                if targetTerminal is not missing value then exit repeat
            end repeat

            if targetTerminal is not missing value then exit repeat
        end repeat
    end if

    if targetTerminal is missing value and "${terminalTitle}" is not "" then
        repeat with aWindow in windows
            repeat with aTab in tabs of aWindow
                repeat with aTerminal in terminals of aTab
                    if (name of aTerminal as text) contains "${terminalTitle}" then
                        set targetWindow to aWindow
                        set targetTab to aTab
                        set targetTerminal to aTerminal
                        exit repeat
                    end if
                end repeat

                if targetTerminal is not missing value then exit repeat
            end repeat

            if targetTerminal is not missing value then exit repeat
        end repeat
    end if

    if targetTerminal is missing value then return ""

    if targetWindow is not missing value then
        activate window targetWindow
        delay 0.08
    end if

    if targetTab is not missing value then
        select tab targetTab
        delay 0.08
    end if

    focus targetTerminal
    delay 0.08
    return "matched"
end tell
return ""
`;

  try {
    return (await runAppleScript(script)) === 'matched';
  } catch {
    return false;
  }
}

async function jumpToTerminalTab(target: AgentJumpTarget): Promise<boolean> {
  const terminalTty = escapeAppleScript(target.terminalTty);
  const terminalTitle = escapeAppleScript(target.terminalTitle);
  const script = `
tell application "Terminal"
    if not (it is running) then return ""
    activate
    repeat with aWindow in windows
        repeat with aTab in tabs of aWindow
            if "${terminalTty}" is not "" and (tty of aTab as text) is "${terminalTty}" then
                set selected of aTab to true
                set frontmost of aWindow to true
                return "matched"
            end if
            if "${terminalTitle}" is not "" and (custom title of aTab as text) contains "${terminalTitle}" then
                set selected of aTab to true
                set frontmost of aWindow to true
                return "matched"
            end if
        end repeat
    end repeat
end tell
return ""
`;

  try {
    return (await runAppleScript(script)) === 'matched';
  } catch {
    return false;
  }
}

function resolveCmuxSocketPath(target: AgentJumpTarget): string | null {
  const explicitSocketPath = target.cmuxSocketPath?.trim();
  if (explicitSocketPath && existsSync(explicitSocketPath)) {
    return explicitSocketPath;
  }

  const redirectedSocketPath = '/tmp/cmux-last-socket-path';
  if (existsSync(redirectedSocketPath)) {
    const redirected = readFileSync(redirectedSocketPath, 'utf8').trim();
    if (redirected && existsSync(redirected)) {
      return redirected;
    }
  }

  const candidates = [
    `${HOME_DIRECTORY}/Library/Application Support/cmux/cmux.sock`,
    '/tmp/cmux.sock',
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function jumpToCmuxTerminal(target: AgentJumpTarget): Promise<boolean> {
  const surfaceId = target.terminalSessionId?.trim();
  const socketPath = resolveCmuxSocketPath(target);

  if (!surfaceId || !socketPath) {
    return false;
  }

  return new Promise((resolve) => {
    const socket = createConnection(socketPath, () => {
      socket.write(`${JSON.stringify({
        jsonrpc: '2.0',
        method: 'surface.focus',
        params: {
          surface_id: surfaceId,
        },
        id: 1,
      })}\n`);
      socket.end();
      resolve(true);
    });

    socket.on('error', () => {
      resolve(false);
    });
  });
}

function tmuxSocketArgs(target: AgentJumpTarget): string[] {
  const socketPath = target.tmuxSocketPath?.trim();
  return socketPath ? ['-S', socketPath] : [];
}

async function locateExecutable(commandName: string, candidates: string[] = []): Promise<string | null> {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const { stdout } = await execFileAsync('/usr/bin/which', [commandName]);
    const executablePath = stdout.trim();
    return executablePath.length > 0 ? executablePath : null;
  } catch {
    return null;
  }
}

async function resolveTmuxPath(): Promise<string | null> {
  return locateExecutable('tmux', [
    '/opt/homebrew/bin/tmux',
    '/usr/local/bin/tmux',
    '/usr/bin/tmux',
  ]);
}

async function runTmuxCommand(tmuxPath: string, target: AgentJumpTarget, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(tmuxPath, [...tmuxSocketArgs(target), ...args]);
    return stdout.trim();
  } catch {
    return null;
  }
}

async function jumpToTmuxPane(target: AgentJumpTarget): Promise<boolean> {
  const tmuxTarget = target.tmuxTarget?.trim();
  if (!tmuxTarget) {
    return false;
  }

  const tmuxPath = await resolveTmuxPath();
  if (!tmuxPath) {
    return false;
  }

  const sessionWindow = tmuxTarget.includes('.') ? tmuxTarget.slice(0, tmuxTarget.lastIndexOf('.')) : tmuxTarget;
  const sessionName = tmuxTarget.includes(':') ? tmuxTarget.slice(0, tmuxTarget.indexOf(':')) : tmuxTarget;
  const clientTty = await runTmuxCommand(tmuxPath, target, ['list-clients', '-F', '#{client_tty}']);
  const currentClientTty = clientTty?.split('\n').find((value) => value.trim().length > 0)?.trim();

  if (currentClientTty) {
    await runTmuxCommand(tmuxPath, target, ['switch-client', '-c', currentClientTty, '-t', sessionName]);
  }

  await runTmuxCommand(tmuxPath, target, ['select-window', '-t', sessionWindow]);
  const selectPaneResult = await runTmuxCommand(tmuxPath, target, ['select-pane', '-t', tmuxTarget]);
  return selectPaneResult !== null;
}

type ZellijPaneInfo = {
  id: number;
  tab_position?: number;
};

async function resolveZellijPath(): Promise<string | null> {
  return locateExecutable('zellij', [
    `${HOME_DIRECTORY}/.local/bin/zellij`,
    '/usr/local/bin/zellij',
    '/opt/homebrew/bin/zellij',
  ]);
}

async function zellijTabPosition(zellijPath: string, target: AgentJumpTarget): Promise<number | null> {
  const encoded = target.terminalSessionId?.trim();
  if (!encoded) {
    return null;
  }

  const parts = encoded.split(':', 2);
  const paneId = Number(parts[0]);
  const sessionName = parts.length > 1 ? parts[1] : '';

  if (!Number.isFinite(paneId)) {
    return null;
  }

  const args: string[] = [];
  if (sessionName) {
    args.push('--session', sessionName);
  }
  args.push('action', 'list-panes', '--json', '--tab');

  try {
    const { stdout } = await execFileAsync(zellijPath, args);
    const panes = JSON.parse(stdout) as ZellijPaneInfo[];
    return panes.find((pane) => pane.id === paneId)?.tab_position ?? null;
  } catch {
    return null;
  }
}

async function activateLikelyZellijParent(): Promise<void> {
  for (const bundleId of ZELLIJ_PARENT_BUNDLE_IDS) {
    if (await isBundleRunning(bundleId)) {
      await openBundle(bundleId);
      return;
    }
  }
}

async function jumpToZellijPane(target: AgentJumpTarget): Promise<boolean> {
  const encoded = target.terminalSessionId?.trim();
  if (!encoded) {
    return false;
  }

  const zellijPath = await resolveZellijPath();
  if (!zellijPath) {
    return false;
  }

  const parts = encoded.split(':', 2);
  const sessionName = parts.length > 1 ? parts[1] : '';
  const tabPosition = await zellijTabPosition(zellijPath, target);
  if (tabPosition === null) {
    return false;
  }

  const args: string[] = [];
  if (sessionName) {
    args.push('--session', sessionName);
  }
  args.push('action', 'go-to-tab', `${tabPosition + 1}`);

  const didJump = await execCli(zellijPath, args);
  if (didJump) {
    await activateLikelyZellijParent();
  }
  return didJump;
}

type WeztermFamilyPane = {
  pane_id: number;
  title: string;
  cwd: string;
  tty_name?: string;
};

async function weztermFamilyCLIPath(bundleId: string): Promise<string | null> {
  if (bundleId === 'fun.tw93.kaku') {
    return locateExecutable('kaku', [
      '/Applications/Kaku.app/Contents/MacOS/kaku',
      `${HOME_DIRECTORY}/Applications/Kaku.app/Contents/MacOS/kaku`,
    ]);
  }

  if (bundleId === 'com.github.wez.wezterm') {
    return locateExecutable('wezterm', [
      '/Applications/WezTerm.app/Contents/MacOS/wezterm',
      `${HOME_DIRECTORY}/Applications/WezTerm.app/Contents/MacOS/wezterm`,
    ]);
  }

  return null;
}

function normalizeWeztermFamilyCwd(cwd: string): string {
  if (cwd.startsWith('file://')) {
    try {
      return new URL(cwd).pathname;
    } catch {
      return cwd;
    }
  }

  return cwd;
}

async function weztermFamilyListPanes(cliPath: string): Promise<WeztermFamilyPane[] | null> {
  try {
    const { stdout } = await execFileAsync(cliPath, ['cli', 'list', '--format', 'json']);
    return JSON.parse(stdout) as WeztermFamilyPane[];
  } catch {
    return null;
  }
}

async function weztermFamilyActivatePane(cliPath: string, paneId: number): Promise<boolean> {
  return execCli(cliPath, ['cli', 'activate-pane', '--pane-id', `${paneId}`]);
}

async function jumpToWeztermFamilyTerminal(
  target: AgentJumpTarget,
  cliPath: string,
  descriptor: TerminalDescriptor
): Promise<boolean> {
  const panes = await weztermFamilyListPanes(cliPath);
  if (!panes) {
    return false;
  }

  const targetSessionId = target.terminalSessionId?.trim();
  if (targetSessionId && /^\d+$/.test(targetSessionId)) {
    const paneId = Number(targetSessionId);
    if (panes.some((pane) => pane.pane_id === paneId) && await weztermFamilyActivatePane(cliPath, paneId)) {
      await openTerminalApp(descriptor);
      return true;
    }
  }

  const targetTty = target.terminalTty?.trim();
  if (targetTty) {
    const matchedByTty = panes.find((pane) => pane.tty_name === targetTty);
    if (matchedByTty && await weztermFamilyActivatePane(cliPath, matchedByTty.pane_id)) {
      await openTerminalApp(descriptor);
      return true;
    }
  }

  const targetWorkingDirectory = target.workingDirectory?.trim();
  if (targetWorkingDirectory) {
    const normalizedTargetCwd = targetWorkingDirectory;
    const matchedByCwd = panes.find((pane) => normalizeWeztermFamilyCwd(pane.cwd) === normalizedTargetCwd);
    if (matchedByCwd && await weztermFamilyActivatePane(cliPath, matchedByCwd.pane_id)) {
      await openTerminalApp(descriptor);
      return true;
    }
  }

  const targetTitle = target.terminalTitle?.trim();
  if (targetTitle) {
    const matchedByTitle = panes.find((pane) => pane.title.includes(targetTitle));
    if (matchedByTitle && await weztermFamilyActivatePane(cliPath, matchedByTitle.pane_id)) {
      await openTerminalApp(descriptor);
      return true;
    }
  }

  return false;
}

async function jumpToVSCodeFamilyWorkspace(target: AgentJumpTarget, bundleId: string): Promise<boolean> {
  const workingDirectory = target.workingDirectory?.trim();
  const cli = VSCODE_FAMILY_CLI[bundleId];
  if (!workingDirectory || !cli) {
    return false;
  }

  return execCli(cli, ['-r', workingDirectory]);
}

async function jumpToJetBrainsProject(target: AgentJumpTarget, bundleId: string): Promise<boolean> {
  const workingDirectory = target.workingDirectory?.trim();
  const cli = JETBRAINS_FAMILY_CLI[bundleId];
  if (!workingDirectory || !cli) {
    return false;
  }

  return execCli(cli, [workingDirectory]);
}

export async function jumpToTerminalWindow(target: AgentJumpTarget | undefined): Promise<boolean> {
  if (!target || process.platform !== 'darwin') {
    logger.warn('Terminal jump skipped because target is unavailable', {
      hasTarget: Boolean(target),
      platform: process.platform,
    });
    return false;
  }

  const descriptor = resolveTerminalDescriptor(target.terminalApp);

  logger.info('Attempting terminal jump', {
    terminalApp: target.terminalApp,
    workingDirectory: target.workingDirectory ?? null,
    terminalSessionId: target.terminalSessionId ?? null,
    terminalTty: target.terminalTty ?? null,
    terminalTitle: target.terminalTitle ?? null,
    codexThreadId: target.codexThreadId ?? null,
    cmuxSocketPath: target.cmuxSocketPath ?? null,
    tmuxTarget: target.tmuxTarget ?? null,
    tmuxSocketPath: target.tmuxSocketPath ?? null,
  });

  if (target.tmuxTarget) {
    const didJumpTmuxPane = await jumpToTmuxPane(target);

    if (descriptor) {
      if (descriptor.bundleId === 'com.mitchellh.ghostty' && await jumpToGhosttyTerminal(target)) {
        return true;
      }
      if (descriptor.bundleId === 'com.googlecode.iterm2') {
        for (const appName of descriptor.scriptAppNames ?? ['iTerm']) {
          if (await jumpToITermSession(target, appName)) {
            return true;
          }
        }
      }
      if (descriptor.bundleId === 'com.apple.Terminal' && await jumpToTerminalTab(target)) {
        return true;
      }
      if (didJumpTmuxPane) {
        return openTerminalApp(descriptor);
      }
    }

    if (didJumpTmuxPane) {
      return true;
    }
  }

  if (normalizeTerminalAppName(target.terminalApp) === 'zellij') {
    if (await jumpToZellijPane(target)) {
      return true;
    }
  }

  if (!descriptor) {
    logger.warn('Unsupported terminal app for jump', {
      terminalApp: target.terminalApp,
    });
    return false;
  }

  switch (descriptor.bundleId) {
    case 'com.openai.codex': {
      if (target.codexThreadId?.trim()) {
        return openUrl(`codex://threads/${target.codexThreadId.trim()}`);
      }
      return openTerminalApp(descriptor);
    }
    case 'com.googlecode.iterm2': {
      for (const appName of descriptor.scriptAppNames ?? ['iTerm']) {
        if (await jumpToITermSession(target, appName)) {
          return true;
        }
      }
      break;
    }
    case 'com.cmuxterm.app':
      if (await jumpToCmuxTerminal(target)) {
        await openTerminalApp(descriptor);
        return true;
      }
      break;
    case 'com.mitchellh.ghostty':
      if (await jumpToGhosttyTerminal(target)) {
        return true;
      }
      break;
    case 'com.apple.Terminal':
      if (await jumpToTerminalTab(target)) {
        return true;
      }
      break;
    case 'fun.tw93.kaku':
    case 'com.github.wez.wezterm': {
      const cliPath = await weztermFamilyCLIPath(descriptor.bundleId);
      if (cliPath && await jumpToWeztermFamilyTerminal(target, cliPath, descriptor)) {
        return true;
      }
      break;
    }
    default: {
      const runningBundleId = await findRunningBundleId(descriptorBundleIds(descriptor));
      const activeBundleId = runningBundleId ?? descriptor.bundleId;

      if (VSCODE_FAMILY_CLI[activeBundleId] && await jumpToVSCodeFamilyWorkspace(target, activeBundleId)) {
        return true;
      }

      if (JETBRAINS_FAMILY_CLI[activeBundleId] && await jumpToJetBrainsProject(target, activeBundleId)) {
        return true;
      }
      break;
    }
  }

  logger.info('Falling back to terminal app activation', {
    bundleId: descriptor.bundleId,
    terminalApp: target.terminalApp,
  });
  return openTerminalApp(descriptor);
}
