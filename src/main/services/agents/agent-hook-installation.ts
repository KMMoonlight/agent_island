import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  AGENT_TOOL_LABELS,
  codexInstallVariantIdSchema,
  type CodexInstallVariantId,
  type AgentHookInstallStatus,
  type AgentTool,
} from '../../../shared/types/agent-hook';

const CODEX_HOOK_TIMEOUT_SECONDS = 45;
const CODEX_PERMISSION_REQUEST_TIMEOUT_SECONDS = 600;
const CLAUDE_HOOK_TIMEOUT_SECONDS = 10;
const MANIFEST_PREFIX = 'agent-island';
const CLAUDE_COMPATIBLE_SOURCES: AgentTool[] = ['claude', 'qoder', 'qwen', 'factory', 'codebuddy'];
const INSTALLABLE_AGENT_SOURCES: AgentTool[] = [
  'codex',
  'claude',
  'qoder',
  'qwen',
  'factory',
  'codebuddy',
  'cursor',
  'gemini',
  'kimi',
  'opencode',
];
const DEFAULT_CODEX_INSTALL_VARIANT: CodexInstallVariantId = 'standard';

type CodexManifest = {
  hookCommand: string;
  enabledCodexHooksFeature: boolean;
  variantId: CodexInstallVariantId;
  installedAt: string;
};

type HookManifest = {
  hookCommand: string;
  installedAt: string;
};

type JsonObject = Record<string, unknown>;

type HookGroupSpec = {
  event: string;
  matcher?: string;
  timeoutSeconds?: number;
  name?: string;
};

type InstallDirectoryDescriptor = {
  source: AgentTool;
  directoryPath: string;
  configPaths: string[];
};

const INSTALL_DIRECTORIES: Record<AgentTool, InstallDirectoryDescriptor> = {
  codex: {
    source: 'codex',
    directoryPath: path.join(os.homedir(), '.codex'),
    configPaths: ['~/.codex/config.toml', '~/.codex/hooks.json'],
  },
  claude: {
    source: 'claude',
    directoryPath: path.join(os.homedir(), '.claude'),
    configPaths: ['~/.claude/settings.json'],
  },
  qoder: {
    source: 'qoder',
    directoryPath: path.join(os.homedir(), '.qoder'),
    configPaths: ['~/.qoder/settings.json'],
  },
  qwen: {
    source: 'qwen',
    directoryPath: path.join(os.homedir(), '.qwen'),
    configPaths: ['~/.qwen/settings.json'],
  },
  factory: {
    source: 'factory',
    directoryPath: path.join(os.homedir(), '.factory'),
    configPaths: ['~/.factory/settings.json'],
  },
  codebuddy: {
    source: 'codebuddy',
    directoryPath: path.join(os.homedir(), '.codebuddy'),
    configPaths: ['~/.codebuddy/settings.json'],
  },
  cursor: {
    source: 'cursor',
    directoryPath: path.join(os.homedir(), '.cursor'),
    configPaths: ['~/.cursor/hooks.json'],
  },
  gemini: {
    source: 'gemini',
    directoryPath: path.join(os.homedir(), '.gemini'),
    configPaths: ['~/.gemini/settings.json'],
  },
  kimi: {
    source: 'kimi',
    directoryPath: path.join(os.homedir(), '.kimi'),
    configPaths: ['~/.kimi/config.toml'],
  },
  opencode: {
    source: 'opencode',
    directoryPath: path.join(os.homedir(), '.config', 'opencode'),
    configPaths: ['~/.config/opencode/plugins/open-island.js'],
  },
};

const OPENCODE_PLUGIN_FILE_NAME = 'open-island.js';

const CODEX_SESSION_START_HOOK_SPEC: HookGroupSpec = {
  event: 'SessionStart',
  matcher: 'startup|resume',
  timeoutSeconds: CODEX_HOOK_TIMEOUT_SECONDS,
};

const CODEX_USER_PROMPT_SUBMIT_HOOK_SPEC: HookGroupSpec = {
  event: 'UserPromptSubmit',
  timeoutSeconds: CODEX_HOOK_TIMEOUT_SECONDS,
};

const CODEX_STOP_HOOK_SPEC: HookGroupSpec = {
  event: 'Stop',
  timeoutSeconds: CODEX_HOOK_TIMEOUT_SECONDS,
};

const CODEX_BASE_HOOK_SPECS: HookGroupSpec[] = [
  CODEX_SESSION_START_HOOK_SPEC,
  CODEX_USER_PROMPT_SUBMIT_HOOK_SPEC,
  CODEX_STOP_HOOK_SPEC,
];

const CODEX_PRE_TOOL_USE_HOOK_SPEC: HookGroupSpec = {
  event: 'PreToolUse',
  timeoutSeconds: CODEX_PERMISSION_REQUEST_TIMEOUT_SECONDS,
};

const CODEX_HOOK_SPECS: HookGroupSpec[] = [
  CODEX_SESSION_START_HOOK_SPEC,
  CODEX_USER_PROMPT_SUBMIT_HOOK_SPEC,
  CODEX_PRE_TOOL_USE_HOOK_SPEC,
  CODEX_STOP_HOOK_SPEC,
];

const CODEX_HOOK_SPECS_WITHOUT_PRE_TOOL_USE: HookGroupSpec[] = [...CODEX_BASE_HOOK_SPECS];
const CODEX_MANAGED_EVENT_NAMES = CODEX_HOOK_SPECS.map((spec) => spec.event);

const CLAUDE_COMPATIBLE_HOOK_SPECS: HookGroupSpec[] = [
  { event: 'SessionStart', timeoutSeconds: CLAUDE_HOOK_TIMEOUT_SECONDS },
  { event: 'UserPromptSubmit', timeoutSeconds: CLAUDE_HOOK_TIMEOUT_SECONDS },
  { event: 'PermissionRequest', matcher: '*', timeoutSeconds: CLAUDE_HOOK_TIMEOUT_SECONDS },
  { event: 'Stop', timeoutSeconds: CLAUDE_HOOK_TIMEOUT_SECONDS },
  { event: 'StopFailure', timeoutSeconds: CLAUDE_HOOK_TIMEOUT_SECONDS },
  { event: 'SessionEnd', timeoutSeconds: CLAUDE_HOOK_TIMEOUT_SECONDS },
];

const CURSOR_HOOK_EVENTS = [
  'beforeSubmitPrompt',
  'beforeShellExecution',
  'beforeMCPExecution',
  'beforeReadFile',
  'afterFileEdit',
  'stop',
];

const GEMINI_HOOK_SPECS: HookGroupSpec[] = [
  { event: 'SessionStart', matcher: '*', name: 'Agent Island' },
  { event: 'SessionEnd', matcher: '*', name: 'Agent Island' },
  { event: 'BeforeAgent', matcher: '*', name: 'Agent Island' },
  { event: 'AfterAgent', matcher: '*', name: 'Agent Island' },
  { event: 'Notification', matcher: '*', name: 'Agent Island' },
];

const KIMI_HOOK_SPECS: Array<{ event: string; matcher?: string }> = [
  { event: 'SessionStart', matcher: 'startup|resume' },
  { event: 'UserPromptSubmit' },
  { event: 'Stop' },
  { event: 'Notification' },
  { event: 'PreToolUse' },
  { event: 'PostToolUse' },
];

function shellQuote(value: string): string {
  if (value.length === 0) {
    return "''";
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildHookCommand(bridgeScriptPath: string, source: AgentTool): string {
  return `${shellQuote(bridgeScriptPath)} ${source}`;
}

function codexManifestPath(directoryPath: string): string {
  return path.join(directoryPath, `${MANIFEST_PREFIX}-codex-install.json`);
}

function genericManifestPath(directoryPath: string, source: AgentTool): string {
  return path.join(directoryPath, `${MANIFEST_PREFIX}-${source}-install.json`);
}

function nowIsoString(): string {
  return new Date().toISOString();
}

function ensureDirectory(directoryPath: string): void {
  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, { recursive: true });
  }
}

function backupFileIfExists(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const timestamp = nowIsoString().replace(/:/g, '-');
  const backupPath = `${filePath}.backup.${timestamp}`;
  if (existsSync(backupPath)) {
    rmSync(backupPath, { force: true });
  }
  copyFileSync(filePath, backupPath);
}

function readUtf8IfExists(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }

  return readFileSync(filePath, 'utf8');
}

function writeUtf8File(filePath: string, contents: string): void {
  writeFileSync(filePath, contents, 'utf8');
}

function writeJsonFile(filePath: string, object: JsonObject): void {
  writeUtf8File(filePath, `${JSON.stringify(object, null, 2)}\n`);
}

function readJsonObjectIfExists(filePath: string): JsonObject | null {
  const contents = readUtf8IfExists(filePath);

  if (!contents) {
    return null;
  }

  const parsed = JSON.parse(contents) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${filePath} 不是合法的 JSON 对象`);
  }

  return parsed as JsonObject;
}

function readHookManifest(manifestPath: string): HookManifest | null {
  const manifest = readJsonObjectIfExists(manifestPath);
  if (!manifest) {
    return null;
  }

  if (typeof manifest.hookCommand !== 'string') {
    return null;
  }

  return {
    hookCommand: manifest.hookCommand,
    installedAt: typeof manifest.installedAt === 'string' ? manifest.installedAt : nowIsoString(),
  };
}

function readCodexManifest(manifestPath: string): CodexManifest | null {
  const manifest = readJsonObjectIfExists(manifestPath);
  if (!manifest) {
    return null;
  }

  if (typeof manifest.hookCommand !== 'string') {
    return null;
  }

  return {
    hookCommand: manifest.hookCommand,
    enabledCodexHooksFeature: manifest.enabledCodexHooksFeature === true,
    variantId: codexInstallVariantIdSchema.safeParse(manifest.variantId).success
      ? codexInstallVariantIdSchema.parse(manifest.variantId)
      : DEFAULT_CODEX_INSTALL_VARIANT,
    installedAt: typeof manifest.installedAt === 'string' ? manifest.installedAt : nowIsoString(),
  };
}

function writeHookManifest(manifestPath: string, hookCommand: string): void {
  writeJsonFile(manifestPath, {
    hookCommand,
    installedAt: nowIsoString(),
  });
}

function writeCodexManifest(
  manifestPath: string,
  hookCommand: string,
  enabledCodexHooksFeature: boolean,
  variantId: CodexInstallVariantId
): void {
  writeJsonFile(manifestPath, {
    hookCommand,
    enabledCodexHooksFeature,
    variantId,
    installedAt: nowIsoString(),
  });
}

function removeFileIfExists(filePath: string): void {
  if (existsSync(filePath)) {
    rmSync(filePath, { force: true });
  }
}

function normalizeRecord(value: unknown): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return value as JsonObject;
}

function normalizeObjectArray(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is JsonObject => typeof item === 'object' && item !== null && !Array.isArray(item));
}

function isManagedCommand(command: string, source: AgentTool, managedCommand: string | null): boolean {
  if (managedCommand && command === managedCommand) {
    return true;
  }

  const normalized = command.toLowerCase();
  if (normalized.includes('openislandhooks') || normalized.includes('vibeislandhooks')) {
    return source === 'codex' ? !normalized.includes('--source') || normalized.includes(` ${source}`) : normalized.includes(source);
  }

  return normalized.includes('agent-hook-bridge.sh') && normalized.includes(source);
}

function createCommandHook(command: string, timeoutSeconds?: number): JsonObject {
  const hook: JsonObject = {
    type: 'command',
    command,
  };

  if (typeof timeoutSeconds === 'number') {
    hook.timeout = timeoutSeconds;
  }

  return hook;
}

function sanitizeManagedHookGroups(groups: JsonObject[], source: AgentTool, managedCommand: string | null): JsonObject[] {
  return groups.flatMap((group) => {
    const hooks = normalizeObjectArray(group.hooks).filter((hook) => {
      const command = typeof hook.command === 'string' ? hook.command : null;
      return !command || !isManagedCommand(command, source, managedCommand);
    });

    if (hooks.length === 0) {
      return [];
    }

    return [{
      ...group,
      hooks,
    }];
  });
}

function hasManagedHookGroups(groups: JsonObject[], source: AgentTool, managedCommand: string | null): boolean {
  return groups.some((group) => normalizeObjectArray(group.hooks).some((hook) => {
    const command = typeof hook.command === 'string' ? hook.command : null;
    return Boolean(command && isManagedCommand(command, source, managedCommand));
  }));
}

function installManagedHookGroups(
  rootObject: JsonObject,
  source: AgentTool,
  managedCommand: string,
  specs: HookGroupSpec[]
): JsonObject {
  const hooksObject = normalizeRecord(rootObject.hooks);
  const nextHooksObject: JsonObject = {};

  for (const [eventName, value] of Object.entries(hooksObject)) {
    const cleanedGroups = sanitizeManagedHookGroups(normalizeObjectArray(value), source, managedCommand);
    if (cleanedGroups.length > 0) {
      nextHooksObject[eventName] = cleanedGroups;
    }
  }

  for (const spec of specs) {
    const existingGroups = sanitizeManagedHookGroups(normalizeObjectArray(nextHooksObject[spec.event]), source, managedCommand);
    const managedGroup: JsonObject = {
      hooks: [createCommandHook(managedCommand, spec.timeoutSeconds)],
    };

    if (spec.matcher) {
      managedGroup.matcher = spec.matcher;
    }

    if (spec.name) {
      const hook = normalizeObjectArray(managedGroup.hooks)[0];
      if (hook) {
        hook.name = spec.name;
      }
    }

    nextHooksObject[spec.event] = [...existingGroups, managedGroup];
  }

  return {
    ...rootObject,
    hooks: nextHooksObject,
  };
}

function uninstallManagedHookGroups(
  rootObject: JsonObject,
  source: AgentTool,
  managedCommand: string | null,
  eventNames: string[]
): { rootObject: JsonObject | null; managedHooksPresent: boolean } {
  const hooksObject = normalizeRecord(rootObject.hooks);
  const nextHooksObject: JsonObject = {};
  let managedHooksPresent = false;

  for (const [eventName, value] of Object.entries(hooksObject)) {
    const existingGroups = normalizeObjectArray(value);
    if (eventNames.includes(eventName) && hasManagedHookGroups(existingGroups, source, managedCommand)) {
      managedHooksPresent = true;
    }

    const cleanedGroups = eventNames.includes(eventName)
      ? sanitizeManagedHookGroups(existingGroups, source, managedCommand)
      : existingGroups;

    if (cleanedGroups.length > 0) {
      nextHooksObject[eventName] = cleanedGroups;
    }
  }

  if (Object.keys(nextHooksObject).length === 0) {
    const remainingRoot: JsonObject = {
      ...rootObject,
    };
    delete remainingRoot.hooks;
    return {
      rootObject: Object.keys(remainingRoot).length > 0 ? remainingRoot : null,
      managedHooksPresent,
    };
  }

  return {
    rootObject: {
      ...rootObject,
      hooks: nextHooksObject,
    },
    managedHooksPresent,
  };
}

function codexFeatureState(contents: string): boolean {
  return /^\s*codex_hooks\s*=\s*true\s*$/m.test(contents);
}

function enableCodexFeature(contents: string): { contents: string; enabledByInstaller: boolean } {
  const lines = contents.split('\n');
  const featuresHeaderIndex = lines.findIndex((line) => line.trim() === '[features]');

  if (featuresHeaderIndex >= 0) {
    const nextSectionIndex = lines.findIndex((line, index) => index > featuresHeaderIndex && /^\s*\[.+\]\s*$/.test(line));
    const sectionEnd = nextSectionIndex >= 0 ? nextSectionIndex : lines.length;
    const existingKeyIndex = lines.findIndex((line, index) => index > featuresHeaderIndex && index < sectionEnd && /^\s*codex_hooks\s*=/.test(line));

    if (existingKeyIndex >= 0) {
      if (codexFeatureState(contents)) {
        return { contents, enabledByInstaller: false };
      }

      const nextLines = [...lines];
      nextLines[existingKeyIndex] = 'codex_hooks = true';
      return {
        contents: nextLines.join('\n'),
        enabledByInstaller: true,
      };
    }

    const nextLines = [...lines];
    nextLines.splice(sectionEnd, 0, 'codex_hooks = true');
    return {
      contents: nextLines.join('\n'),
      enabledByInstaller: true,
    };
  }

  const trimmed = contents.trimEnd();
  const prefix = trimmed.length > 0 ? `${trimmed}\n\n` : '';
  return {
    contents: `${prefix}[features]\ncodex_hooks = true\n`,
    enabledByInstaller: true,
  };
}

function disableCodexFeatureIfManaged(contents: string): string {
  const lines = contents.split('\n');
  const featuresHeaderIndex = lines.findIndex((line) => line.trim() === '[features]');

  if (featuresHeaderIndex < 0) {
    return contents;
  }

  const nextSectionIndex = lines.findIndex((line, index) => index > featuresHeaderIndex && /^\s*\[.+\]\s*$/.test(line));
  const sectionEnd = nextSectionIndex >= 0 ? nextSectionIndex : lines.length;
  const codexHookIndex = lines.findIndex((line, index) => index > featuresHeaderIndex && index < sectionEnd && /^\s*codex_hooks\s*=/.test(line));

  if (codexHookIndex < 0) {
    return contents;
  }

  const nextLines = [...lines];
  nextLines.splice(codexHookIndex, 1);
  const updatedSectionEnd = nextSectionIndex >= 0 ? nextSectionIndex - 1 : nextLines.length;
  const hasOtherFeatureKeys = nextLines.slice(featuresHeaderIndex + 1, updatedSectionEnd).some((line) => {
    const trimmedLine = line.trim();
    return trimmedLine.length > 0 && !trimmedLine.startsWith('#');
  });

  if (!hasOtherFeatureKeys) {
    nextLines.splice(featuresHeaderIndex, 1);
    if (featuresHeaderIndex < nextLines.length && nextLines[featuresHeaderIndex]?.trim() === '') {
      nextLines.splice(featuresHeaderIndex, 1);
    }
  }

  return nextLines.join('\n');
}

function codexHookSpecsForVariant(variantId: CodexInstallVariantId): HookGroupSpec[] {
  return variantId === 'no-pretooluse'
    ? CODEX_HOOK_SPECS_WITHOUT_PRE_TOOL_USE
    : CODEX_HOOK_SPECS;
}

function installCodex(bridgeScriptPath: string, variantId: CodexInstallVariantId = DEFAULT_CODEX_INSTALL_VARIANT): void {
  const descriptor = INSTALL_DIRECTORIES.codex;
  ensureDirectory(descriptor.directoryPath);

  const configPath = path.join(descriptor.directoryPath, 'config.toml');
  const hooksPath = path.join(descriptor.directoryPath, 'hooks.json');
  const manifestPath = codexManifestPath(descriptor.directoryPath);
  const managedCommand = buildHookCommand(bridgeScriptPath, 'codex');

  const existingConfig = readUtf8IfExists(configPath) ?? '';
  const existingHooks = readJsonObjectIfExists(hooksPath) ?? {};
  const featureMutation = enableCodexFeature(existingConfig);
  const nextHooks = installManagedHookGroups(existingHooks, 'codex', managedCommand, codexHookSpecsForVariant(variantId));

  if (featureMutation.contents !== existingConfig) {
    backupFileIfExists(configPath);
    writeUtf8File(configPath, featureMutation.contents);
  }

  if (JSON.stringify(nextHooks) !== JSON.stringify(existingHooks)) {
    backupFileIfExists(hooksPath);
    writeJsonFile(hooksPath, nextHooks);
  }

  writeCodexManifest(manifestPath, managedCommand, featureMutation.enabledByInstaller, variantId);
}

function uninstallCodex(): void {
  const descriptor = INSTALL_DIRECTORIES.codex;
  const configPath = path.join(descriptor.directoryPath, 'config.toml');
  const hooksPath = path.join(descriptor.directoryPath, 'hooks.json');
  const manifestPath = codexManifestPath(descriptor.directoryPath);
  const manifest = readCodexManifest(manifestPath);
  const existingHooks = readJsonObjectIfExists(hooksPath);

  if (existingHooks) {
    const uninstallResult = uninstallManagedHookGroups(existingHooks, 'codex', manifest?.hookCommand ?? null, CODEX_MANAGED_EVENT_NAMES);
    if (JSON.stringify(uninstallResult.rootObject) !== JSON.stringify(existingHooks)) {
      backupFileIfExists(hooksPath);
      if (uninstallResult.rootObject) {
        writeJsonFile(hooksPath, uninstallResult.rootObject);
      } else {
        removeFileIfExists(hooksPath);
      }
    }
  }

  if (manifest?.enabledCodexHooksFeature) {
    const existingConfig = readUtf8IfExists(configPath) ?? '';
    const nextConfig = disableCodexFeatureIfManaged(existingConfig);
    if (nextConfig !== existingConfig) {
      backupFileIfExists(configPath);
      writeUtf8File(configPath, nextConfig);
    }
  }

  removeFileIfExists(manifestPath);
}

function installClaudeCompatible(source: AgentTool, bridgeScriptPath: string): void {
  const descriptor = INSTALL_DIRECTORIES[source];
  ensureDirectory(descriptor.directoryPath);

  const settingsPath = path.join(descriptor.directoryPath, 'settings.json');
  const manifestPath = genericManifestPath(descriptor.directoryPath, source);
  const managedCommand = buildHookCommand(bridgeScriptPath, source);
  const existingSettings = readJsonObjectIfExists(settingsPath) ?? {};
  const nextSettings = installManagedHookGroups(existingSettings, source, managedCommand, CLAUDE_COMPATIBLE_HOOK_SPECS);

  if (JSON.stringify(nextSettings) !== JSON.stringify(existingSettings)) {
    backupFileIfExists(settingsPath);
    writeJsonFile(settingsPath, nextSettings);
  }

  writeHookManifest(manifestPath, managedCommand);
}

function uninstallClaudeCompatible(source: AgentTool): void {
  const descriptor = INSTALL_DIRECTORIES[source];
  const settingsPath = path.join(descriptor.directoryPath, 'settings.json');
  const manifestPath = genericManifestPath(descriptor.directoryPath, source);
  const manifest = readHookManifest(manifestPath);
  const existingSettings = readJsonObjectIfExists(settingsPath);

  if (existingSettings) {
    const uninstallResult = uninstallManagedHookGroups(
      existingSettings,
      source,
      manifest?.hookCommand ?? null,
      CLAUDE_COMPATIBLE_HOOK_SPECS.map((spec) => spec.event)
    );
    if (JSON.stringify(uninstallResult.rootObject) !== JSON.stringify(existingSettings)) {
      backupFileIfExists(settingsPath);
      if (uninstallResult.rootObject) {
        writeJsonFile(settingsPath, uninstallResult.rootObject);
      } else {
        removeFileIfExists(settingsPath);
      }
    }
  }

  removeFileIfExists(manifestPath);
}

function installCursor(bridgeScriptPath: string): void {
  const descriptor = INSTALL_DIRECTORIES.cursor;
  ensureDirectory(descriptor.directoryPath);

  const hooksPath = path.join(descriptor.directoryPath, 'hooks.json');
  const manifestPath = genericManifestPath(descriptor.directoryPath, 'cursor');
  const managedCommand = buildHookCommand(bridgeScriptPath, 'cursor');
  const existingHooks = readJsonObjectIfExists(hooksPath) ?? {};
  const hooksObject = normalizeRecord(existingHooks.hooks);
  const nextHooksObject: JsonObject = {
    ...hooksObject,
  };

  for (const event of CURSOR_HOOK_EVENTS) {
    const entries = normalizeObjectArray(nextHooksObject[event]).filter((entry) => {
      const command = typeof entry.command === 'string' ? entry.command : null;
      return !command || !isManagedCommand(command, 'cursor', managedCommand);
    });
    nextHooksObject[event] = [...entries, { command: managedCommand }];
  }

  const nextRoot: JsonObject = {
    ...existingHooks,
    version: 1,
    hooks: nextHooksObject,
  };

  if (JSON.stringify(nextRoot) !== JSON.stringify(existingHooks)) {
    backupFileIfExists(hooksPath);
    writeJsonFile(hooksPath, nextRoot);
  }

  writeHookManifest(manifestPath, managedCommand);
}

function uninstallCursor(): void {
  const descriptor = INSTALL_DIRECTORIES.cursor;
  const hooksPath = path.join(descriptor.directoryPath, 'hooks.json');
  const manifestPath = genericManifestPath(descriptor.directoryPath, 'cursor');
  const manifest = readHookManifest(manifestPath);
  const existingHooks = readJsonObjectIfExists(hooksPath);

  if (existingHooks) {
    const hooksObject = normalizeRecord(existingHooks.hooks);
    const nextHooksObject: JsonObject = {};

    for (const [eventName, value] of Object.entries(hooksObject)) {
      const filteredEntries = normalizeObjectArray(value).filter((entry) => {
        const command = typeof entry.command === 'string' ? entry.command : null;
        return !command || !isManagedCommand(command, 'cursor', manifest?.hookCommand ?? null);
      });

      if (filteredEntries.length > 0) {
        nextHooksObject[eventName] = filteredEntries;
      }
    }

    const nextRoot: JsonObject = { ...existingHooks };
    if (Object.keys(nextHooksObject).length > 0) {
      nextRoot.hooks = nextHooksObject;
    } else {
      delete nextRoot.hooks;
    }

    if (Object.keys(nextRoot).length === 1 && nextRoot.version === 1) {
      delete nextRoot.version;
    }

    if (JSON.stringify(nextRoot) !== JSON.stringify(existingHooks)) {
      backupFileIfExists(hooksPath);
      if (Object.keys(nextRoot).length > 0) {
        writeJsonFile(hooksPath, nextRoot);
      } else {
        removeFileIfExists(hooksPath);
      }
    }
  }

  removeFileIfExists(manifestPath);
}

function installGemini(bridgeScriptPath: string): void {
  const descriptor = INSTALL_DIRECTORIES.gemini;
  ensureDirectory(descriptor.directoryPath);

  const settingsPath = path.join(descriptor.directoryPath, 'settings.json');
  const manifestPath = genericManifestPath(descriptor.directoryPath, 'gemini');
  const managedCommand = buildHookCommand(bridgeScriptPath, 'gemini');
  const existingSettings = readJsonObjectIfExists(settingsPath) ?? {};
  const nextSettings = installManagedHookGroups(existingSettings, 'gemini', managedCommand, GEMINI_HOOK_SPECS);

  if (JSON.stringify(nextSettings) !== JSON.stringify(existingSettings)) {
    backupFileIfExists(settingsPath);
    writeJsonFile(settingsPath, nextSettings);
  }

  writeHookManifest(manifestPath, managedCommand);
}

function uninstallGemini(): void {
  const descriptor = INSTALL_DIRECTORIES.gemini;
  const settingsPath = path.join(descriptor.directoryPath, 'settings.json');
  const manifestPath = genericManifestPath(descriptor.directoryPath, 'gemini');
  const manifest = readHookManifest(manifestPath);
  const existingSettings = readJsonObjectIfExists(settingsPath);

  if (existingSettings) {
    const uninstallResult = uninstallManagedHookGroups(
      existingSettings,
      'gemini',
      manifest?.hookCommand ?? null,
      GEMINI_HOOK_SPECS.map((spec) => spec.event)
    );

    if (JSON.stringify(uninstallResult.rootObject) !== JSON.stringify(existingSettings)) {
      backupFileIfExists(settingsPath);
      if (uninstallResult.rootObject) {
        writeJsonFile(settingsPath, uninstallResult.rootObject);
      } else {
        removeFileIfExists(settingsPath);
      }
    }
  }

  removeFileIfExists(manifestPath);
}

function installKimi(bridgeScriptPath: string): void {
  const descriptor = INSTALL_DIRECTORIES.kimi;
  ensureDirectory(descriptor.directoryPath);

  const configPath = path.join(descriptor.directoryPath, 'config.toml');
  const manifestPath = genericManifestPath(descriptor.directoryPath, 'kimi');
  const managedCommand = buildHookCommand(bridgeScriptPath, 'kimi');
  const existingContents = readUtf8IfExists(configPath) ?? '';
  const cleanedContents = stripManagedKimiBlocks(existingContents, managedCommand);
  const managedBlocks = KIMI_HOOK_SPECS.map((spec) => renderKimiManagedBlock(spec.event, spec.matcher, managedCommand)).join('\n');
  const prefix = cleanedContents.trim().length > 0 ? `${cleanedContents.trimEnd()}\n\n` : '';
  const nextContents = `${prefix}${managedBlocks}`;

  if (nextContents !== existingContents) {
    backupFileIfExists(configPath);
    writeUtf8File(configPath, nextContents.endsWith('\n') ? nextContents : `${nextContents}\n`);
  }

  writeHookManifest(manifestPath, managedCommand);
}

function uninstallKimi(): void {
  const descriptor = INSTALL_DIRECTORIES.kimi;
  const configPath = path.join(descriptor.directoryPath, 'config.toml');
  const manifestPath = genericManifestPath(descriptor.directoryPath, 'kimi');
  const manifest = readHookManifest(manifestPath);
  const existingContents = readUtf8IfExists(configPath);

  if (typeof existingContents === 'string') {
    const nextContents = stripManagedKimiBlocks(existingContents, manifest?.hookCommand ?? null).trim();
    if (nextContents !== existingContents.trim()) {
      backupFileIfExists(configPath);
      if (nextContents.length > 0) {
        writeUtf8File(configPath, `${nextContents}\n`);
      } else {
        removeFileIfExists(configPath);
      }
    }
  }

  removeFileIfExists(manifestPath);
}

function stripManagedKimiBlocks(contents: string, managedCommand: string | null): string {
  const lines = contents.split('\n');
  const result: string[] = [];

  let index = 0;
  while (index < lines.length) {
    const currentLine = lines[index] ?? '';
    const trimmedLine = currentLine.trim();

    if (trimmedLine === '# agent-island: managed hook - do not edit') {
      let nextIndex = index + 1;
      while (nextIndex < lines.length && (lines[nextIndex] ?? '').trim() === '') {
        nextIndex += 1;
      }
      if ((lines[nextIndex] ?? '').trim() === '[[hooks]]') {
        index = endOfTomlBlock(lines, nextIndex);
        while (index < lines.length && (lines[index] ?? '').trim() === '') {
          index += 1;
        }
        continue;
      }
    }

    if (trimmedLine === '[[hooks]]') {
      const blockEnd = endOfTomlBlock(lines, index);
      const blockLines = lines.slice(index, blockEnd);
      if (blockMatchesManagedKimiCommand(blockLines, managedCommand)) {
        index = blockEnd;
        while (index < lines.length && (lines[index] ?? '').trim() === '') {
          index += 1;
        }
        continue;
      }
    }

    result.push(currentLine);
    index += 1;
  }

  return result.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function endOfTomlBlock(lines: string[], startIndex: number): number {
  let cursor = startIndex + 1;
  while (cursor < lines.length) {
    const trimmed = (lines[cursor] ?? '').trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return cursor;
    }
    cursor += 1;
  }
  return lines.length;
}

function decodeTomlString(raw: string): string {
  let value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    return value;
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1);
  }
  return value;
}

function blockMatchesManagedKimiCommand(blockLines: string[], managedCommand: string | null): boolean {
  return blockLines.some((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('command')) {
      return false;
    }
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex < 0) {
      return false;
    }
    const command = decodeTomlString(trimmed.slice(equalsIndex + 1));
    if (managedCommand && command === managedCommand) {
      return true;
    }
    const normalized = command.toLowerCase();
    return (normalized.includes('openislandhooks') || normalized.includes('vibeislandhooks') || normalized.includes('agent-hook-bridge.sh'))
      && normalized.includes('kimi');
  });
}

function renderKimiManagedBlock(event: string, matcher: string | undefined, command: string): string {
  const lines = [
    '# agent-island: managed hook - do not edit',
    '[[hooks]]',
    `event = "${event}"`,
  ];

  if (matcher) {
    lines.push(`matcher = "${matcher}"`);
  }

  lines.push(`command = ${JSON.stringify(command)}`);
  lines.push(`timeout = ${CLAUDE_HOOK_TIMEOUT_SECONDS}`);
  return `${lines.join('\n')}\n`;
}

function openCodePluginDirectory(directoryPath: string): string {
  return path.join(directoryPath, 'plugins');
}

function openCodePluginPath(directoryPath: string): string {
  return path.join(openCodePluginDirectory(directoryPath), OPENCODE_PLUGIN_FILE_NAME);
}

function buildOpenCodePluginContents(bridgeScriptPath: string): string {
  return `// agent-island: managed plugin - do not edit
const BRIDGE_SCRIPT_PATH = ${JSON.stringify(bridgeScriptPath)};
const RESPONSE_TIMEOUT_MS = 10 * 60 * 1000;
const importBuiltin = new Function('specifier', 'return ' + 'import(specifier)');
let spawnPromise;

async function loadSpawn() {
  spawnPromise ??= importBuiltin('node:child_process').then((module) => module.spawn);
  return spawnPromise;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function stringify(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sessionIdFrom(properties, fallback = 'opencode') {
  const info = readRecord(properties.info);
  return firstString(properties.sessionID, properties.sessionId, properties.session_id, properties.session, info.id, fallback) ?? fallback;
}

function cwdFrom(properties, context) {
  const info = readRecord(properties.info);
  const project = readRecord(context.project);
  return firstString(properties.cwd, properties.directory, properties.worktree, info.path, info.cwd, context.worktree, context.directory, project.path, process.cwd());
}

function terminalFields() {
  return {
    terminal_app: firstString(process.env.TERM_PROGRAM, process.env.TERMINAL_EMULATOR),
    terminal_session_id: firstString(process.env.TERM_SESSION_ID, process.env.TAB_ID),
    terminal_tty: firstString(process.env.TTY),
    terminal_title: firstString(process.env.TERM_TITLE),
  };
}

function sendToAgentIsland(payload, timeoutMs = RESPONSE_TIMEOUT_MS) {
  return loadSpawn().then((spawn) => new Promise((resolve) => {
    const child = spawn(BRIDGE_SCRIPT_PATH, ['opencode'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      env: process.env,
    });
    let stdout = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', () => {
      clearTimeout(timer);
      const trimmed = stdout.trim();
      if (!trimmed) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(trimmed));
      } catch {
        resolve(null);
      }
    });
    child.stdin.end(JSON.stringify(payload));
  })).catch(() => null);
}

async function tryClientReply(client, domain, requestId, body) {
  const target = client?.[domain]?.reply;
  if (typeof target !== 'function') {
    return false;
  }
  const attempts = [
    () => target.call(client[domain], requestId, body),
    () => target.call(client[domain], { requestID: requestId, body }),
    () => target.call(client[domain], { path: { requestID: requestId }, body }),
    () => target.call(client[domain], { param: { requestID: requestId }, body }),
  ];
  for (const attempt of attempts) {
    try {
      await attempt();
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

async function postToOpenCode(path, body) {
  const baseUrl = firstString(process.env.OPENCODE_SERVER, process.env.OPENCODE_URL, process.env.OPENCODE_HOST);
  if (!baseUrl || typeof fetch !== 'function') {
    return false;
  }
  try {
    const response = await fetch(new URL(path, baseUrl).toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function applyPermissionDirective(client, requestId, directive) {
  if (!requestId || !directive || typeof directive !== 'object') {
    return;
  }
  const reply = directive.type === 'deny' ? 'reject' : directive.reply ?? 'once';
  const body = {
    reply,
    message: directive.reason,
  };
  if (await tryClientReply(client, 'permission', requestId, body)) {
    return;
  }
  await postToOpenCode('/permission/' + encodeURIComponent(requestId) + '/reply', body);
}

async function applyQuestionDirective(client, requestId, directive) {
  if (!requestId || !directive || typeof directive !== 'object' || directive.type !== 'answer') {
    return;
  }
  const text = typeof directive.text === 'string' ? directive.text : '';
  const body = {
    answers: Array.isArray(directive.answers) ? directive.answers : [[text]],
  };
  if (await tryClientReply(client, 'question', requestId, body)) {
    return;
  }
  await postToOpenCode('/question/' + encodeURIComponent(requestId) + '/reply', body);
}

function buildPayload(context, hookEventName, properties, extra = {}) {
  return {
    hook_event_name: hookEventName,
    session_id: sessionIdFrom(properties),
    cwd: cwdFrom(properties, context),
    ...terminalFields(),
    ...extra,
  };
}

function questionText(properties) {
  const questions = Array.isArray(properties.questions) ? properties.questions : [];
  const firstQuestion = readRecord(questions[0]);
  return firstString(properties.question, properties.text, firstQuestion.question, firstQuestion.label, properties.title);
}

export const AgentIsland = async (context) => {
  const { client } = context;

  return {
    event: async ({ event }) => {
      const properties = readRecord(event?.properties);

      if (event?.type === 'session.created') {
        await sendToAgentIsland(buildPayload(context, 'SessionStart', properties));
        return;
      }

      if (event?.type === 'session.deleted') {
        await sendToAgentIsland(buildPayload(context, 'SessionEnd', properties));
        return;
      }

      if (event?.type === 'session.status' && firstString(properties.status) === 'idle') {
        await sendToAgentIsland(buildPayload(context, 'Stop', properties));
        return;
      }

      if (event?.type === 'session.idle') {
        await sendToAgentIsland(buildPayload(context, 'Stop', properties));
        return;
      }

      if (event?.type === 'session.updated' && properties.archived === true) {
        await sendToAgentIsland(buildPayload(context, 'SessionEnd', properties));
        return;
      }

      if (event?.type === 'message.updated') {
        const info = readRecord(properties.info);
        if (info.role === 'user') {
          await sendToAgentIsland(buildPayload(context, 'UserPromptSubmit', properties, {
            prompt: firstString(info.content, properties.content, properties.text),
            message_content: stringify(info.content ?? properties.content),
            model: firstString(info.model, properties.model),
          }));
        }
        return;
      }

      if (event?.type === 'permission.asked') {
        const requestId = firstString(properties.requestID, properties.permissionID, properties.id);
        const response = await sendToAgentIsland(buildPayload(context, 'PermissionRequest', properties, {
          permission_id: requestId,
          permission_title: firstString(properties.title, properties.name, properties.tool),
          permission_description: firstString(properties.description, properties.message, stringify(properties.metadata), stringify(properties.patterns)),
          tool_name: firstString(properties.tool, properties.toolName),
          tool_input: properties.input ?? properties.metadata ?? properties.patterns,
        }));
        await applyPermissionDirective(client, requestId, response?.directive);
        return;
      }

      if (event?.type === 'question.asked') {
        const requestId = firstString(properties.requestID, properties.questionID, properties.id);
        const response = await sendToAgentIsland(buildPayload(context, 'QuestionAsked', properties, {
          question_id: requestId,
          question_text: questionText(properties),
          tool_input: {
            title: firstString(properties.title, questionText(properties), 'OpenCode question'),
            questions: Array.isArray(properties.questions) ? properties.questions : [{
              header: 'Question',
              question: questionText(properties) ?? 'OpenCode has a question for you.',
              options: [],
            }],
          },
        }));
        await applyQuestionDirective(client, requestId, response?.directive);
      }
    },

    'tool.execute.before': async (input, output) => {
      await sendToAgentIsland(buildPayload(context, 'PreToolUse', readRecord(input), {
        tool_name: firstString(input?.tool, input?.name),
        tool_input: output?.args ?? input?.args,
      }));
    },

    'tool.execute.after': async (input, output) => {
      await sendToAgentIsland(buildPayload(context, 'PostToolUse', readRecord(input), {
        tool_name: firstString(input?.tool, input?.name),
        tool_input: output?.args ?? input?.args,
      }));
    },
  };
};
`;
}

function installOpenCode(bridgeScriptPath: string): void {
  const descriptor = INSTALL_DIRECTORIES.opencode;
  const pluginDirectory = openCodePluginDirectory(descriptor.directoryPath);
  const pluginPath = openCodePluginPath(descriptor.directoryPath);
  const manifestPath = genericManifestPath(descriptor.directoryPath, 'opencode');

  ensureDirectory(pluginDirectory);
  const pluginContents = buildOpenCodePluginContents(bridgeScriptPath);
  const existingContents = readUtf8IfExists(pluginPath);

  if (existingContents !== pluginContents) {
    backupFileIfExists(pluginPath);
    writeUtf8File(pluginPath, pluginContents);
  }

  writeHookManifest(manifestPath, pluginPath);
}

function uninstallOpenCode(): void {
  const descriptor = INSTALL_DIRECTORIES.opencode;
  const pluginPath = openCodePluginPath(descriptor.directoryPath);
  const manifestPath = genericManifestPath(descriptor.directoryPath, 'opencode');

  removeFileIfExists(pluginPath);
  removeFileIfExists(manifestPath);
}

function buildInstalledStatus(source: AgentTool, statusMessage: string, isInstalled: boolean, isPartiallyInstalled = false): AgentHookInstallStatus {
  const descriptor = INSTALL_DIRECTORIES[source];
  return {
    source,
    title: AGENT_TOOL_LABELS[source],
    configPaths: descriptor.configPaths,
    isInstalled,
    isPartiallyInstalled,
    statusMessage,
    errorMessage: null,
  };
}

function buildErrorStatus(source: AgentTool, errorMessage: string): AgentHookInstallStatus {
  const descriptor = INSTALL_DIRECTORIES[source];
  return {
    source,
    title: AGENT_TOOL_LABELS[source],
    configPaths: descriptor.configPaths,
    isInstalled: false,
    isPartiallyInstalled: false,
    statusMessage: '读取失败',
    errorMessage,
  };
}

function codexStatus(bridgeScriptPath: string): AgentHookInstallStatus {
  const descriptor = INSTALL_DIRECTORIES.codex;
  const configPath = path.join(descriptor.directoryPath, 'config.toml');
  const hooksPath = path.join(descriptor.directoryPath, 'hooks.json');
  const manifestPath = codexManifestPath(descriptor.directoryPath);
  const manifest = readCodexManifest(manifestPath);
  const managedCommand = manifest?.hookCommand ?? buildHookCommand(bridgeScriptPath, 'codex');
  const featureEnabled = codexFeatureState(readUtf8IfExists(configPath) ?? '');
  const hooksRoot = readJsonObjectIfExists(hooksPath);
  const hooksObject = normalizeRecord(hooksRoot?.hooks);
  const hasManagedEvent = (eventName: string): boolean => hasManagedHookGroups(
    normalizeObjectArray(hooksObject[eventName]),
    'codex',
    managedCommand
  );
  const hasManagedBaseHooks = CODEX_BASE_HOOK_SPECS.every((spec) => hasManagedEvent(spec.event));
  const hasPreToolUseHook = hasManagedEvent(CODEX_PRE_TOOL_USE_HOOK_SPEC.event);
  const hasAnyManagedHooks = CODEX_MANAGED_EVENT_NAMES.some((eventName) => hasManagedEvent(eventName));

  if (featureEnabled && hasManagedBaseHooks) {
    return buildInstalledStatus(
      'codex',
      hasPreToolUseHook ? '已自动安装（含 PreToolUse）' : '已自动安装（不含 PreToolUse）',
      true
    );
  }

  if (featureEnabled || hasAnyManagedHooks) {
    const variantSuffix = manifest?.variantId === 'no-pretooluse'
      ? '（当前记录为不含 PreToolUse）'
      : manifest?.variantId === 'standard'
        ? '（当前记录为含 PreToolUse）'
        : '';
    return buildInstalledStatus('codex', `部分已安装，建议重新安装一次${variantSuffix}`, false, true);
  }

  return buildInstalledStatus('codex', '未安装', false);
}

function claudeCompatibleStatus(source: AgentTool, bridgeScriptPath: string): AgentHookInstallStatus {
  const descriptor = INSTALL_DIRECTORIES[source];
  const settingsPath = path.join(descriptor.directoryPath, 'settings.json');
  const manifestPath = genericManifestPath(descriptor.directoryPath, source);
  const managedCommand = readHookManifest(manifestPath)?.hookCommand ?? buildHookCommand(bridgeScriptPath, source);
  const settingsRoot = readJsonObjectIfExists(settingsPath);

  if (!settingsRoot) {
    return buildInstalledStatus(source, '未安装', false);
  }

  const uninstallResult = uninstallManagedHookGroups(
    settingsRoot,
    source,
    managedCommand,
    CLAUDE_COMPATIBLE_HOOK_SPECS.map((spec) => spec.event)
  );

  return uninstallResult.managedHooksPresent
    ? buildInstalledStatus(source, '已自动安装', true)
    : buildInstalledStatus(source, '未安装', false);
}

function cursorStatus(bridgeScriptPath: string): AgentHookInstallStatus {
  const descriptor = INSTALL_DIRECTORIES.cursor;
  const hooksPath = path.join(descriptor.directoryPath, 'hooks.json');
  const manifestPath = genericManifestPath(descriptor.directoryPath, 'cursor');
  const managedCommand = readHookManifest(manifestPath)?.hookCommand ?? buildHookCommand(bridgeScriptPath, 'cursor');
  const hooksRoot = readJsonObjectIfExists(hooksPath);

  if (!hooksRoot) {
    return buildInstalledStatus('cursor', '未安装', false);
  }

  const hooksObject = normalizeRecord(hooksRoot.hooks);
  const managedHooksPresent = CURSOR_HOOK_EVENTS.some((event) => normalizeObjectArray(hooksObject[event]).some((entry) => {
    const command = typeof entry.command === 'string' ? entry.command : null;
    return Boolean(command && isManagedCommand(command, 'cursor', managedCommand));
  }));

  return managedHooksPresent
    ? buildInstalledStatus('cursor', '已自动安装', true)
    : buildInstalledStatus('cursor', '未安装', false);
}

function geminiStatus(bridgeScriptPath: string): AgentHookInstallStatus {
  const descriptor = INSTALL_DIRECTORIES.gemini;
  const settingsPath = path.join(descriptor.directoryPath, 'settings.json');
  const manifestPath = genericManifestPath(descriptor.directoryPath, 'gemini');
  const managedCommand = readHookManifest(manifestPath)?.hookCommand ?? buildHookCommand(bridgeScriptPath, 'gemini');
  const settingsRoot = readJsonObjectIfExists(settingsPath);

  if (!settingsRoot) {
    return buildInstalledStatus('gemini', '未安装', false);
  }

  const uninstallResult = uninstallManagedHookGroups(
    settingsRoot,
    'gemini',
    managedCommand,
    GEMINI_HOOK_SPECS.map((spec) => spec.event)
  );

  return uninstallResult.managedHooksPresent
    ? buildInstalledStatus('gemini', '已自动安装', true)
    : buildInstalledStatus('gemini', '未安装', false);
}

function kimiStatus(bridgeScriptPath: string): AgentHookInstallStatus {
  const descriptor = INSTALL_DIRECTORIES.kimi;
  const configPath = path.join(descriptor.directoryPath, 'config.toml');
  const manifestPath = genericManifestPath(descriptor.directoryPath, 'kimi');
  const managedCommand = readHookManifest(manifestPath)?.hookCommand ?? buildHookCommand(bridgeScriptPath, 'kimi');
  const existingContents = readUtf8IfExists(configPath);

  if (!existingContents) {
    return buildInstalledStatus('kimi', '未安装', false);
  }

  const cleanedContents = stripManagedKimiBlocks(existingContents, managedCommand);
  return cleanedContents !== existingContents.trimEnd()
    ? buildInstalledStatus('kimi', '已自动安装', true)
    : buildInstalledStatus('kimi', '未安装', false);
}

function openCodeStatus(): AgentHookInstallStatus {
  const descriptor = INSTALL_DIRECTORIES.opencode;
  const pluginPath = openCodePluginPath(descriptor.directoryPath);

  return existsSync(pluginPath)
    ? buildInstalledStatus('opencode', '已自动安装', true)
    : buildInstalledStatus('opencode', '未安装', false);
}

function statusForSource(source: AgentTool, bridgeScriptPath: string): AgentHookInstallStatus {
  try {
    switch (source) {
      case 'codex':
        return codexStatus(bridgeScriptPath);
      case 'claude':
      case 'qoder':
      case 'qwen':
      case 'factory':
      case 'codebuddy':
        return claudeCompatibleStatus(source, bridgeScriptPath);
      case 'cursor':
        return cursorStatus(bridgeScriptPath);
      case 'gemini':
        return geminiStatus(bridgeScriptPath);
      case 'kimi':
        return kimiStatus(bridgeScriptPath);
      case 'opencode':
        return openCodeStatus();
    }
  } catch (error) {
    const normalizedError = error instanceof Error ? error.message : '未知错误';
    return buildErrorStatus(source, normalizedError);
  }
}

export class AgentHookInstallationManager {
  constructor(private readonly bridgeScriptPath: string) {}

  getStatuses(): AgentHookInstallStatus[] {
    return INSTALLABLE_AGENT_SOURCES.map((source) => statusForSource(source, this.bridgeScriptPath));
  }

  install(source: AgentTool, options?: { variantId?: CodexInstallVariantId }): AgentHookInstallStatus[] {
    switch (source) {
      case 'codex':
        installCodex(this.bridgeScriptPath, options?.variantId);
        break;
      case 'claude':
      case 'qoder':
      case 'qwen':
      case 'factory':
      case 'codebuddy':
        installClaudeCompatible(source, this.bridgeScriptPath);
        break;
      case 'cursor':
        installCursor(this.bridgeScriptPath);
        break;
      case 'gemini':
        installGemini(this.bridgeScriptPath);
        break;
      case 'kimi':
        installKimi(this.bridgeScriptPath);
        break;
      case 'opencode':
        installOpenCode(this.bridgeScriptPath);
        break;
    }

    return this.getStatuses();
  }

  uninstall(source: AgentTool): AgentHookInstallStatus[] {
    switch (source) {
      case 'codex':
        uninstallCodex();
        break;
      case 'claude':
      case 'qoder':
      case 'qwen':
      case 'factory':
      case 'codebuddy':
        uninstallClaudeCompatible(source);
        break;
      case 'cursor':
        uninstallCursor();
        break;
      case 'gemini':
        uninstallGemini();
        break;
      case 'kimi':
        uninstallKimi();
        break;
      case 'opencode':
        uninstallOpenCode();
        break;
    }

    return this.getStatuses();
  }
}

export function installableAgentSources(): AgentTool[] {
  return [...INSTALLABLE_AGENT_SOURCES];
}

export function isClaudeCompatibleSource(source: AgentTool): boolean {
  return CLAUDE_COMPATIBLE_SOURCES.includes(source);
}
