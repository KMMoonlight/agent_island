import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

type InstallationModule = typeof import('./agent-hook-installation');

const originalHome = process.env.HOME;
const temporaryHomes: string[] = [];

function createTempHome(): string {
  const directoryPath = mkdtempSync(path.join(os.tmpdir(), 'agent-hook-install-'));
  temporaryHomes.push(directoryPath);
  return directoryPath;
}

function readJsonFile(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

async function loadInstallationModule(homeDirectory: string): Promise<InstallationModule> {
  process.env.HOME = homeDirectory;
  vi.resetModules();
  return import('./agent-hook-installation');
}

afterEach(() => {
  process.env.HOME = originalHome;

  while (temporaryHomes.length > 0) {
    const directoryPath = temporaryHomes.pop();
    if (directoryPath) {
      rmSync(directoryPath, { force: true, recursive: true });
    }
  }
});

describe('AgentHookInstallationManager', () => {
  it('installs and uninstalls Codex hooks while preserving unrelated config', async () => {
    const homeDirectory = createTempHome();
    const codexDirectory = path.join(homeDirectory, '.codex');
    mkdirSync(codexDirectory, { recursive: true });

    const configPath = path.join(codexDirectory, 'config.toml');
    const hooksPath = path.join(codexDirectory, 'hooks.json');
    writeFileSync(configPath, '[features]\nother_feature = true\n', 'utf8');
    writeFileSync(hooksPath, `${JSON.stringify({
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command: 'echo user-hook',
              },
            ],
          },
        ],
      },
    }, null, 2)}\n`, 'utf8');

    const { AgentHookInstallationManager } = await loadInstallationModule(homeDirectory);
    const bridgeScriptPath = path.join(homeDirectory, 'agent-hook-bridge.sh');
    const manager = new AgentHookInstallationManager(bridgeScriptPath);

    const installStatuses = manager.install('codex');
    const installStatus = installStatuses.find((status) => status.source === 'codex');
    expect(installStatus?.isInstalled).toBe(true);
    expect(readFileSync(configPath, 'utf8')).toContain('codex_hooks = true');
    expect(readFileSync(configPath, 'utf8')).toContain('other_feature = true');
    const installedHooks = JSON.stringify(readJsonFile(hooksPath));
    expect(installedHooks).toContain(bridgeScriptPath);
    expect(installedHooks).toContain('PreToolUse');
    expect(installedHooks).not.toContain('PermissionRequest');

    const uninstallStatuses = manager.uninstall('codex');
    const uninstallStatus = uninstallStatuses.find((status) => status.source === 'codex');
    expect(uninstallStatus?.isInstalled).toBe(false);
    expect(readFileSync(configPath, 'utf8')).not.toContain('codex_hooks = true');
    expect(readFileSync(configPath, 'utf8')).toContain('other_feature = true');
    expect(readJsonFile(hooksPath)).toEqual({
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: 'command',
                command: 'echo user-hook',
              },
            ],
          },
        ],
      },
    });
  });

  it('installs Codex without PreToolUse when requested', async () => {
    const homeDirectory = createTempHome();
    const codexDirectory = path.join(homeDirectory, '.codex');
    mkdirSync(codexDirectory, { recursive: true });

    const { AgentHookInstallationManager } = await loadInstallationModule(homeDirectory);
    const bridgeScriptPath = path.join(homeDirectory, 'agent-hook-bridge.sh');
    const manager = new AgentHookInstallationManager(bridgeScriptPath);
    const hooksPath = path.join(codexDirectory, 'hooks.json');

    const installStatuses = manager.install('codex', { variantId: 'no-pretooluse' });
    const installStatus = installStatuses.find((status) => status.source === 'codex');
    expect(installStatus?.isInstalled).toBe(true);
    expect(installStatus?.statusMessage).toContain('不含 PreToolUse');

    const installedHooks = JSON.stringify(readJsonFile(hooksPath));
    expect(installedHooks).toContain('SessionStart');
    expect(installedHooks).toContain('UserPromptSubmit');
    expect(installedHooks).toContain('Stop');
    expect(installedHooks).not.toContain('PreToolUse');
  });

  it('installs and uninstalls Claude-compatible hooks without dropping user entries', async () => {
    const homeDirectory = createTempHome();
    const claudeDirectory = path.join(homeDirectory, '.claude');
    mkdirSync(claudeDirectory, { recursive: true });

    const settingsPath = path.join(claudeDirectory, 'settings.json');
    writeFileSync(settingsPath, `${JSON.stringify({
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: 'echo existing-claude-hook',
              },
            ],
          },
        ],
      },
    }, null, 2)}\n`, 'utf8');

    const { AgentHookInstallationManager } = await loadInstallationModule(homeDirectory);
    const bridgeScriptPath = path.join(homeDirectory, 'agent-hook-bridge.sh');
    const manager = new AgentHookInstallationManager(bridgeScriptPath);

    expect(manager.install('claude').find((status) => status.source === 'claude')?.isInstalled).toBe(true);
    expect(JSON.stringify(readJsonFile(settingsPath))).toContain(bridgeScriptPath);

    expect(manager.uninstall('claude').find((status) => status.source === 'claude')?.isInstalled).toBe(false);
    expect(readJsonFile(settingsPath)).toEqual({
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: 'echo existing-claude-hook',
              },
            ],
          },
        ],
      },
    });
  });

  it('installs and uninstalls Cursor hooks without removing existing commands', async () => {
    const homeDirectory = createTempHome();
    const cursorDirectory = path.join(homeDirectory, '.cursor');
    mkdirSync(cursorDirectory, { recursive: true });

    const hooksPath = path.join(cursorDirectory, 'hooks.json');
    writeFileSync(hooksPath, `${JSON.stringify({
      version: 1,
      hooks: {
        stop: [
          {
            command: 'echo existing-cursor-hook',
          },
        ],
      },
    }, null, 2)}\n`, 'utf8');

    const { AgentHookInstallationManager } = await loadInstallationModule(homeDirectory);
    const bridgeScriptPath = path.join(homeDirectory, 'agent-hook-bridge.sh');
    const manager = new AgentHookInstallationManager(bridgeScriptPath);

    expect(manager.install('cursor').find((status) => status.source === 'cursor')?.isInstalled).toBe(true);
    expect(JSON.stringify(readJsonFile(hooksPath))).toContain(bridgeScriptPath);

    expect(manager.uninstall('cursor').find((status) => status.source === 'cursor')?.isInstalled).toBe(false);
    expect(readJsonFile(hooksPath)).toEqual({
      version: 1,
      hooks: {
        stop: [
          {
            command: 'echo existing-cursor-hook',
          },
        ],
      },
    });
  });

  it('installs and uninstalls Gemini hooks', async () => {
    const homeDirectory = createTempHome();
    const { AgentHookInstallationManager } = await loadInstallationModule(homeDirectory);
    const bridgeScriptPath = path.join(homeDirectory, 'agent-hook-bridge.sh');
    const manager = new AgentHookInstallationManager(bridgeScriptPath);

    const settingsPath = path.join(homeDirectory, '.gemini', 'settings.json');

    expect(manager.install('gemini').find((status) => status.source === 'gemini')?.isInstalled).toBe(true);
    expect(existsSync(settingsPath)).toBe(true);
    expect(JSON.stringify(readJsonFile(settingsPath))).toContain('Agent Island');
    expect(JSON.stringify(readJsonFile(settingsPath))).toContain(bridgeScriptPath);

    expect(manager.uninstall('gemini').find((status) => status.source === 'gemini')?.isInstalled).toBe(false);
    expect(existsSync(settingsPath)).toBe(false);
  });

  it('installs and uninstalls Kimi hooks while keeping unrelated TOML blocks', async () => {
    const homeDirectory = createTempHome();
    const kimiDirectory = path.join(homeDirectory, '.kimi');
    mkdirSync(kimiDirectory, { recursive: true });

    const configPath = path.join(kimiDirectory, 'config.toml');
    writeFileSync(configPath, [
      '[[hooks]]',
      'event = "Notification"',
      'command = "echo existing-kimi-hook"',
      'timeout = 10',
      '',
    ].join('\n'), 'utf8');

    const { AgentHookInstallationManager } = await loadInstallationModule(homeDirectory);
    const bridgeScriptPath = path.join(homeDirectory, 'agent-hook-bridge.sh');
    const manager = new AgentHookInstallationManager(bridgeScriptPath);

    expect(manager.install('kimi').find((status) => status.source === 'kimi')?.isInstalled).toBe(true);
    expect(readFileSync(configPath, 'utf8')).toContain('# agent-island: managed hook - do not edit');
    expect(readFileSync(configPath, 'utf8')).toContain(bridgeScriptPath);

    expect(manager.uninstall('kimi').find((status) => status.source === 'kimi')?.isInstalled).toBe(false);
    expect(readFileSync(configPath, 'utf8')).not.toContain('# agent-island: managed hook - do not edit');
    expect(readFileSync(configPath, 'utf8')).toContain('echo existing-kimi-hook');
  });

  it('installs and uninstalls OpenCode plugin hooks', async () => {
    const homeDirectory = createTempHome();
    const { AgentHookInstallationManager } = await loadInstallationModule(homeDirectory);
    const bridgeScriptPath = path.join(homeDirectory, 'agent-hook-bridge.sh');
    const manager = new AgentHookInstallationManager(bridgeScriptPath);
    const pluginPath = path.join(homeDirectory, '.config', 'opencode', 'plugins', 'open-island.js');

    expect(manager.install('opencode').find((status) => status.source === 'opencode')?.isInstalled).toBe(true);
    expect(existsSync(pluginPath)).toBe(true);
    expect(readFileSync(pluginPath, 'utf8')).toContain(bridgeScriptPath);
    expect(readFileSync(pluginPath, 'utf8')).toContain("['opencode']");

    expect(manager.uninstall('opencode').find((status) => status.source === 'opencode')?.isInstalled).toBe(false);
    expect(existsSync(pluginPath)).toBe(false);
  });
});
