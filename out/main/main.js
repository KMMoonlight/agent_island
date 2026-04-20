import { app, shell, ipcMain, Tray, Menu, nativeImage, BrowserWindow, screen } from "electron";
import path from "node:path";
import log from "electron-log";
import { readFileSync, existsSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import Parser from "rss-parser";
import { Buffer } from "node:buffer";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
if (!app.isPackaged) {
  const devUserDataPath = `${app.getPath("userData")}-dev`;
  app.setPath("userData", devUserDataPath);
}
const IPC_CHANNELS = {
  OVERLAY: {
    GET_STATE: "overlay:get-state",
    UPDATED: "overlay:updated"
  },
  CONFIG: {
    RELOAD: "config:reload"
  },
  APP: {
    OPEN_TARGET: "app:open-target",
    GET_STATUS: "app:get-status",
    SET_OVERLAY_EXPANDED: "app:set-overlay-expanded"
  }
};
async function openExternalTarget(targetUrl) {
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    return false;
  }
  await shell.openExternal(targetUrl);
  return true;
}
function registerAppControlHandlers(sourceStore2, actions) {
  ipcMain.handle(IPC_CHANNELS.APP.GET_STATUS, () => sourceStore2.getStatus());
  ipcMain.handle(IPC_CHANNELS.APP.OPEN_TARGET, async (_event, targetUrl) => {
    if (typeof targetUrl !== "string") {
      return false;
    }
    return openExternalTarget(targetUrl);
  });
  ipcMain.handle(IPC_CHANNELS.APP.SET_OVERLAY_EXPANDED, (_event, expanded) => {
    if (typeof expanded !== "boolean") {
      return actions.getOverlayMode();
    }
    return actions.setOverlayExpanded(expanded);
  });
}
function registerConfigHandlers(sourcePoller2, sourceStore2) {
  ipcMain.handle(IPC_CHANNELS.CONFIG.RELOAD, async () => {
    await sourcePoller2.reload();
    return sourceStore2.getState();
  });
}
function registerOverlayHandlers(sourceStore2) {
  ipcMain.handle(IPC_CHANNELS.OVERLAY.GET_STATE, () => sourceStore2.getState());
}
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}";
log.transports.console.format = "[{level}] {text}";
const logger$1 = log;
const APP_CONFIG = {
  window: {
    compactWidth: 400,
    compactHeight: 60,
    expandedWidth: 600,
    expandedHeight: 360,
    topMargin: 8
  },
  rotationIntervalMs: 1e4,
  polling: {
    defaultRefreshIntervalMs: 6e4,
    minRefreshIntervalMs: 15e3
  },
  detailItemDefaults: {
    json: 1,
    rss: 3
  }
};
const sourceTypeSchema = z.enum(["json", "rss"]);
const slotMappingSchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional(),
  timestamp: z.string().optional(),
  detail: z.string().optional(),
  icon: z.string().optional(),
  target: z.string().optional()
});
const sourceConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: sourceTypeSchema,
  url: z.string().url(),
  icon: z.string().optional(),
  refreshIntervalMs: z.number().int().min(APP_CONFIG.polling.minRefreshIntervalMs).default(APP_CONFIG.polling.defaultRefreshIntervalMs),
  detailItemCount: z.number().int().positive().optional(),
  fieldMappings: slotMappingSchema,
  clickTarget: z.object({
    source: z.string().optional(),
    item: z.string().optional()
  }).optional()
});
const appConfigSchema = z.object({
  rotationIntervalMs: z.number().int().positive().default(APP_CONFIG.rotationIntervalMs),
  sources: z.array(sourceConfigSchema).min(1)
});
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
function resolveTemplatePath() {
  const appPath = typeof app.getAppPath === "function" ? app.getAppPath() : process.cwd();
  const candidatePaths = [
    path.join(appPath, "config", "example.sources.yaml"),
    path.resolve(process.cwd(), "config/example.sources.yaml"),
    path.resolve(__dirname$1, "../../config/example.sources.yaml")
  ];
  const templatePath = candidatePaths.find((candidatePath) => existsSync(candidatePath));
  if (!templatePath) {
    throw new Error("Example config template not found");
  }
  return templatePath;
}
function getExampleConfigContents() {
  return readFileSync(resolveTemplatePath(), "utf8");
}
function formatZodError(error) {
  return error.issues.map((issue) => issue.message).join("; ");
}
class ConfigService {
  logger = logger$1.scope("config");
  config = null;
  getConfigPath() {
    return path.join(app.getPath("userData"), "sources.yaml");
  }
  revealConfigFile() {
    this.ensureConfigFile();
    void shell.showItemInFolder(this.getConfigPath());
  }
  ensureConfigFile() {
    const configPath = this.getConfigPath();
    const configDir = path.dirname(configPath);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    if (!existsSync(configPath)) {
      const templatePath = path.join(app.getPath("userData"), "sources.example.yaml");
      copyFileSync(this.createExampleFile(templatePath), configPath);
      this.logger.info("Created default config file", { configPath });
    }
    return configPath;
  }
  getConfig() {
    if (this.config) {
      return this.config;
    }
    return this.reloadConfig();
  }
  reloadConfig() {
    const configPath = this.ensureConfigFile();
    const rawConfig = readFileSync(configPath, "utf8");
    const parsed = parse(rawConfig);
    const result = appConfigSchema.safeParse(parsed);
    if (!result.success) {
      const message = formatZodError(result.error);
      this.logger.error("Config validation failed", { message, configPath });
      throw new Error(`Config validation failed: ${message}`);
    }
    this.config = result.data;
    this.logger.info("Config loaded", {
      configPath,
      sourceCount: result.data.sources.length
    });
    return this.config;
  }
  createExampleFile(targetPath) {
    const configDir = path.dirname(targetPath);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    const template = getExampleConfigContents();
    writeFileSync(targetPath, template, "utf8");
    return targetPath;
  }
}
function getValueAtPath(input, path2) {
  if (!path2) {
    return void 0;
  }
  const segments = path2.split(".").filter(Boolean);
  let current = input;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return void 0;
    }
    current = current[segment];
  }
  if (current === null || current === void 0) {
    return void 0;
  }
  if (typeof current === "string") {
    return current;
  }
  if (typeof current === "number" || typeof current === "boolean") {
    return String(current);
  }
  return void 0;
}
function parseTimestampToMillis(input) {
  if (!input) {
    return null;
  }
  const date = new Date(input);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}
function getDetailCount(config) {
  return config.detailItemCount ?? APP_CONFIG.detailItemDefaults[config.type];
}
function getItemClickTarget(config, item) {
  const mappedTarget = getValueAtPath(item, config.fieldMappings.target);
  if (mappedTarget) {
    return mappedTarget;
  }
  return config.clickTarget?.item ?? config.clickTarget?.source;
}
function createOverlayItem(config, item, index) {
  const title = getValueAtPath(item, config.fieldMappings.title) ?? `${config.name} ${index + 1}`;
  const summary = getValueAtPath(item, config.fieldMappings.summary);
  const detail = getValueAtPath(item, config.fieldMappings.detail) ?? summary;
  const timestampValue = getValueAtPath(item, config.fieldMappings.timestamp);
  const icon = getValueAtPath(item, config.fieldMappings.icon) ?? config.icon;
  return {
    id: `${config.id}-${index}`,
    title,
    summary,
    detail,
    timestampMs: parseTimestampToMillis(timestampValue),
    icon,
    clickTarget: getItemClickTarget(config, item)
  };
}
function createEmptySourceState(config) {
  return {
    id: config.id,
    name: config.name,
    type: config.type,
    icon: config.icon,
    status: "idle",
    summary: {
      title: config.name,
      text: "Waiting for first update"
    },
    items: [],
    lastFetchedAtMs: null,
    lastError: null
  };
}
function markSourceLoading(config, currentState) {
  const fallback = currentState ?? createEmptySourceState(config);
  return {
    ...fallback,
    status: fallback.items.length > 0 ? fallback.status : "loading"
  };
}
function normalizeSourceState(config, result) {
  const items = result.items.slice(0, getDetailCount(config)).map((item, index) => createOverlayItem(config, item, index));
  const firstItem = items[0];
  return {
    id: config.id,
    name: config.name,
    type: config.type,
    icon: config.icon,
    status: "ready",
    summary: {
      title: firstItem?.title ?? config.name,
      text: firstItem?.summary ?? firstItem?.detail ?? "No details available"
    },
    items,
    lastFetchedAtMs: result.fetchedAtMs,
    lastError: null
  };
}
function withSourceError(config, currentState, error) {
  const fallback = currentState ?? createEmptySourceState(config);
  return {
    ...fallback,
    status: "error",
    lastError: {
      message: error.message,
      timestampMs: Date.now()
    }
  };
}
function toJsonItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (typeof payload === "object" && payload !== null) {
    const record = payload;
    const values = Object.values(record);
    const firstArray = values.find((value) => Array.isArray(value));
    if (Array.isArray(firstArray)) {
      return firstArray;
    }
    return [record];
  }
  return [{ value: payload }];
}
class JsonSource {
  logger = logger$1.scope("sources:json");
  async fetch(config) {
    const response = await fetch(config.url);
    if (!response.ok) {
      throw new Error(`JSON source request failed with ${response.status}`);
    }
    const payload = await response.json();
    const items = toJsonItems(payload);
    this.logger.debug("Fetched JSON source", {
      sourceId: config.id,
      itemCount: items.length
    });
    return {
      items,
      fetchedAtMs: Date.now()
    };
  }
}
class RssSource {
  parser = new Parser();
  logger = logger$1.scope("sources:rss");
  async fetch(config) {
    const feed = await this.parser.parseURL(config.url);
    const items = feed.items.map((item) => ({
      title: item.title,
      contentSnippet: item.contentSnippet,
      content: item.content,
      isoDate: item.isoDate,
      link: item.link
    }));
    this.logger.debug("Fetched RSS source", {
      sourceId: config.id,
      itemCount: items.length
    });
    return {
      items,
      fetchedAtMs: Date.now()
    };
  }
}
class SourceRegistry {
  jsonSource = new JsonSource();
  rssSource = new RssSource();
  getFetcher(config) {
    switch (config.type) {
      case "json": {
        return this.jsonSource;
      }
      case "rss": {
        return this.rssSource;
      }
      default: {
        const _exhaustive = config.type;
        throw new Error(`Unsupported source type: ${String(_exhaustive)}`);
      }
    }
  }
  async fetch(config) {
    return this.getFetcher(config).fetch(config);
  }
}
class SourcePoller {
  constructor(configService2, sourceStore2) {
    this.configService = configService2;
    this.sourceStore = sourceStore2;
  }
  logger = logger$1.scope("sources:poller");
  registry = new SourceRegistry();
  timers = /* @__PURE__ */ new Map();
  async start() {
    const config = this.configService.getConfig();
    await this.applyConfig(config);
  }
  async reload() {
    const config = this.configService.reloadConfig();
    await this.applyConfig(config);
  }
  stop() {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }
  async applyConfig(config) {
    this.stop();
    this.sourceStore.initialize(config);
    await Promise.all(config.sources.map(async (source) => {
      await this.refreshSource(source);
      const timer = setInterval(() => {
        void this.refreshSource(source);
      }, source.refreshIntervalMs);
      this.timers.set(source.id, timer);
    }));
  }
  async refreshSource(config) {
    this.sourceStore.updateSource(markSourceLoading(config, this.sourceStore.getSourceState(config.id)));
    try {
      const result = await this.registry.fetch(config);
      const nextState = normalizeSourceState(config, result);
      this.sourceStore.updateSource(nextState);
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error("Unknown source error");
      this.logger.error("Source refresh failed", {
        sourceId: config.id,
        message: normalizedError.message
      });
      this.sourceStore.updateSource(
        withSourceError(config, this.sourceStore.getSourceState(config.id), normalizedError)
      );
    }
  }
}
function cloneState(state) {
  return {
    ...state,
    sources: state.sources.map((source) => ({
      ...source,
      summary: { ...source.summary },
      items: source.items.map((item) => ({ ...item })),
      lastError: source.lastError ? { ...source.lastError } : null
    }))
  };
}
class SourceStore {
  state = {
    rotationIntervalMs: APP_CONFIG.rotationIntervalMs,
    sources: [],
    updatedAtMs: Date.now(),
    hasErrors: false
  };
  listeners = /* @__PURE__ */ new Set();
  initialize(config) {
    this.state = {
      rotationIntervalMs: config.rotationIntervalMs,
      sources: config.sources.map((source) => createEmptySourceState(source)),
      updatedAtMs: Date.now(),
      hasErrors: false
    };
    this.emit();
  }
  getState() {
    return cloneState(this.state);
  }
  getSourceState(sourceId) {
    return this.state.sources.find((source) => source.id === sourceId);
  }
  getStatus() {
    return {
      hasErrors: this.state.hasErrors,
      sourceCount: this.state.sources.length,
      updatedAtMs: this.state.updatedAtMs
    };
  }
  updateSource(nextSource) {
    const sources = this.state.sources.map((source) => source.id === nextSource.id ? nextSource : source);
    this.state = {
      ...this.state,
      sources,
      updatedAtMs: Date.now(),
      hasErrors: sources.some((source) => source.status === "error")
    };
    this.emit();
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  emit() {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <path
        fill="#000000"
        fill-rule="evenodd"
        d="M2.25 11a5.25 5.25 0 0 1 5.25-5.25h7a5.25 5.25 0 1 1 0 10.5h-7A5.25 5.25 0 0 1 2.25 11Zm10.55 0a2.1 2.1 0 1 0 4.2 0a2.1 2.1 0 0 0-4.2 0Z"
      />
    </svg>
  `;
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`).resize({ width: 18, height: 18 });
  icon.setTemplateImage(true);
  return icon;
}
class TrayMenu {
  constructor(actions) {
    this.actions = actions;
  }
  tray = null;
  create(initialStatus) {
    const trayIcon = createTrayIcon();
    this.tray = new Tray(trayIcon);
    if (process.platform === "darwin") {
      this.tray.setImage(trayIcon);
    }
    this.tray.setToolTip("Dynamic Island Content");
    this.update(initialStatus);
  }
  update(status) {
    if (!this.tray) {
      return;
    }
    const statusLabel = status.hasErrors ? `Status: ${status.sourceCount} source(s), errors present` : `Status: ${status.sourceCount} source(s), healthy`;
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: statusLabel,
          enabled: false
        },
        {
          label: "Open config file",
          click: () => {
            this.actions.onOpenConfig();
          }
        },
        {
          label: "Reload config",
          click: () => {
            this.actions.onReload();
          }
        },
        {
          type: "separator"
        },
        {
          label: "Quit",
          click: () => {
            app.quit();
          }
        }
      ])
    );
  }
}
const WINDOW_MODE_ANIMATION_MS = 220;
const windowAnimationTimers = /* @__PURE__ */ new WeakMap();
function getOverlayBounds(mode) {
  const displayBounds = screen.getPrimaryDisplay().workArea;
  const width = mode === "expanded" ? APP_CONFIG.window.expandedWidth : APP_CONFIG.window.compactWidth;
  const height = mode === "expanded" ? APP_CONFIG.window.expandedHeight : APP_CONFIG.window.compactHeight;
  const x = Math.round(displayBounds.x + (displayBounds.width - width) / 2);
  const y = displayBounds.y + APP_CONFIG.window.topMargin;
  return { x, y, width, height };
}
function clearWindowAnimation(window) {
  const activeTimer = windowAnimationTimers.get(window);
  if (!activeTimer) {
    return;
  }
  clearInterval(activeTimer);
  windowAnimationTimers.delete(window);
}
function easeInOutCubic(progress) {
  return progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}
function interpolate(start, end, progress) {
  return Math.round(start + (end - start) * progress);
}
function animateOverlayWindow(window, targetBounds) {
  clearWindowAnimation(window);
  if (window.isDestroyed()) {
    return;
  }
  const initialBounds = window.getBounds();
  const hasChanges = initialBounds.x !== targetBounds.x || initialBounds.y !== targetBounds.y || initialBounds.width !== targetBounds.width || initialBounds.height !== targetBounds.height;
  if (!hasChanges) {
    return;
  }
  const startedAt = Date.now();
  const applyFrame = () => {
    if (window.isDestroyed()) {
      clearWindowAnimation(window);
      return;
    }
    const elapsed = Date.now() - startedAt;
    const linearProgress = Math.min(elapsed / WINDOW_MODE_ANIMATION_MS, 1);
    const easedProgress = easeInOutCubic(linearProgress);
    window.setBounds(
      {
        x: interpolate(initialBounds.x, targetBounds.x, easedProgress),
        y: interpolate(initialBounds.y, targetBounds.y, easedProgress),
        width: interpolate(initialBounds.width, targetBounds.width, easedProgress),
        height: interpolate(initialBounds.height, targetBounds.height, easedProgress)
      },
      false
    );
    if (linearProgress >= 1) {
      clearWindowAnimation(window);
    }
  };
  applyFrame();
  const timer = setInterval(() => {
    applyFrame();
  }, 1e3 / 60);
  windowAnimationTimers.set(window, timer);
}
function setOverlayWindowMode(window, mode) {
  if (window.isDestroyed()) {
    return mode;
  }
  animateOverlayWindow(window, getOverlayBounds(mode));
  return mode;
}
function createOverlayWindow() {
  const window = new BrowserWindow({
    ...getOverlayBounds("compact"),
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hiddenInMissionControl: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      sandbox: false
    }
  });
  window.setAlwaysOnTop(true, "screen-saver");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setFullScreenable(false);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  return window;
}
const logger = logger$1.scope("main");
const configService = new ConfigService();
const sourceStore = new SourceStore();
const sourcePoller = new SourcePoller(configService, sourceStore);
const trayMenu = new TrayMenu({
  onReload: () => {
    void reloadSources();
  },
  onOpenConfig: () => {
    configService.revealConfigFile();
  }
});
let overlayWindow = null;
let overlayWindowMode = "compact";
async function loadRenderer(window) {
  if (process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(process.env.ELECTRON_RENDERER_URL);
    return;
  }
  await window.loadFile(path.join(__dirname, "../renderer/index.html"));
}
async function createApp() {
  overlayWindowMode = "compact";
  overlayWindow = createOverlayWindow();
  await loadRenderer(overlayWindow);
  overlayWindow.once("ready-to-show", () => {
    overlayWindow?.showInactive();
  });
  overlayWindow.on("closed", () => {
    overlayWindow = null;
    overlayWindowMode = "compact";
  });
}
async function reloadSources() {
  try {
    await sourcePoller.reload();
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error("Unknown reload error");
    logger.error("Config reload failed", { message: normalizedError.message });
  }
}
function wireStoreUpdates() {
  sourceStore.subscribe((state) => {
    trayMenu.update(sourceStore.getStatus());
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return;
    }
    overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY.UPDATED, state);
  });
}
app.whenReady().then(async () => {
  registerOverlayHandlers(sourceStore);
  registerConfigHandlers(sourcePoller, sourceStore);
  registerAppControlHandlers(sourceStore, {
    getOverlayMode: () => overlayWindowMode,
    setOverlayExpanded: (expanded) => {
      overlayWindowMode = expanded ? "expanded" : "compact";
      if (!overlayWindow || overlayWindow.isDestroyed()) {
        return overlayWindowMode;
      }
      return setOverlayWindowMode(overlayWindow, overlayWindowMode);
    }
  });
  wireStoreUpdates();
  await sourcePoller.start();
  trayMenu.create(sourceStore.getStatus());
  await createApp();
  app.on("activate", async () => {
    if (overlayWindow === null || overlayWindow.isDestroyed()) {
      await createApp();
      return;
    }
    overlayWindow.showInactive();
  });
});
app.on("before-quit", () => {
  sourcePoller.stop();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
