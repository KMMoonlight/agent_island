# Dynamic Island Content App / 灵动岛内容助手

Dynamic Island Content App is a macOS-first Electron desktop overlay inspired by the iPhone Dynamic Island. It stays pinned near the top center of the screen, shows compact ambient information by default, and expands into a richer panel when you hover over it.

灵动岛内容助手是一款优先面向 macOS 的 Electron 桌面悬浮应用，交互灵感来自 iPhone Dynamic Island。它固定在屏幕顶部中间，默认展示紧凑信息，鼠标悬停时展开为更完整的信息面板。

The app is designed for lightweight, glanceable desktop context: JSON polling requests, focus timers, and agent workflow reminders can all surface in a compact island without stealing focus from your current work.

它适合承载轻量、可快速瞥一眼的桌面上下文：JSON 轮询请求、专注计时器、Agent 工作流提醒，都可以显示在紧凑的灵动岛里，并且不会打断当前工作。

## Features / 功能

- Always-on-top macOS overlay with compact and expanded island states.
- macOS 置顶悬浮窗，支持紧凑态和展开态。
- Configurable island width, language, and rotation interval.
- 支持配置灵动岛宽度、界面语言和内容轮转间隔。
- JSON polling sources with request method, query params, headers, body, refresh interval, and field mappings.
- 支持 JSON 轮询源，可配置请求方法、查询参数、Header、Body、刷新间隔和字段映射。
- Compact summary rotation across configured sources.
- 紧凑态会在已配置的数据源之间自动轮转展示摘要。
- Expanded view with source details, errors, focus timer state, and agent session activity.
- 展开态展示数据源详情、错误状态、专注计时器状态和 Agent 会话活动。
- Menu bar controls for opening settings, starting enabled focus timers, and quitting the app.
- 菜单栏入口支持打开设置、启动已启用的专注计时器、退出应用。
- Agent Hook integration for Codex, Claude Code, Qoder, Qwen Code, Factory, CodeBuddy, Cursor, Gemini CLI, Kimi CLI, and OpenCode.
- 支持 Codex、Claude Code、Qoder、Qwen Code、Factory、CodeBuddy、Cursor、Gemini CLI、Kimi CLI、OpenCode 的 Agent Hook 集成。
- Native macOS overlay host with a BrowserWindow fallback when the native host cannot start.
- 优先使用原生 macOS 悬浮宿主，原生宿主启动失败时回退到 BrowserWindow 宿主。

## Tech Stack / 技术栈

- Electron + electron-vite
- React + TypeScript
- Vitest
- ESLint
- pnpm
- Native macOS panel addon built with node-gyp
- 使用 node-gyp 构建的原生 macOS 面板插件

## Requirements / 环境要求

- macOS
- Node.js 22 or compatible / Node.js 22 或兼容版本
- pnpm 10.6.3 or compatible / pnpm 10.6.3 或兼容版本
- Xcode Command Line Tools, required by the native macOS overlay addon / Xcode 命令行工具，用于构建原生 macOS 悬浮插件

## Installation / 安装

Install dependencies:

安装依赖：

```bash
pnpm install
```

If you want to use the native macOS overlay host, build the native addon:

如果需要使用原生 macOS 悬浮宿主，请构建原生插件：

```bash
pnpm native:build
```

## Development / 开发

Start the app in normal development mode:

以普通开发模式启动：

```bash
pnpm dev
```

Start with the native macOS overlay host explicitly enabled:

显式启用原生 macOS 悬浮宿主：

```bash
pnpm dev:native
```

Start with the BrowserWindow overlay host explicitly enabled:

显式启用 BrowserWindow 悬浮宿主：

```bash
pnpm dev:browser-host
```

The app also passes `-ApplePersistenceIgnoreState YES` during development to avoid macOS restoring stale Electron window state.

开发模式会传入 `-ApplePersistenceIgnoreState YES`，避免 macOS 恢复过期的 Electron 窗口状态。

## Build And Preview / 构建与预览

Create a production build:

创建生产构建：

```bash
pnpm build
```

Preview the built app:

预览构建结果：

```bash
pnpm preview
```

## Quality Checks / 质量检查

Run linting:

运行 lint：

```bash
pnpm lint
```

Run TypeScript checks:

运行 TypeScript 类型检查：

```bash
pnpm typecheck
```

Run tests:

运行测试：

```bash
pnpm test
```

Run tests in watch mode:

以监听模式运行测试：

```bash
pnpm test:watch
```

## User Manual / 使用手册

### Launching The App / 启动应用

Run `pnpm dev` during development. The island appears near the top center of the screen. It remains compact until you hover over it, then expands to show richer content.

开发时运行 `pnpm dev`。灵动岛会出现在屏幕顶部中间，默认保持紧凑态；鼠标悬停后会展开并展示更丰富的内容。

Use the menu bar icon to:

可以通过菜单栏图标执行：

- Open settings. / 打开设置。
- Start enabled focus timers. / 启动已启用的专注计时器。
- Quit the app. / 退出应用。

### Settings / 设置

Open the menu bar item and choose **Open settings**. The settings window includes:

点击菜单栏图标并选择 **Open settings** 打开设置窗口。设置窗口包含：

- **General**: language, island width, and compact rotation interval.
- **通用配置**：语言、灵动岛宽度、紧凑态轮转间隔。
- **Focus Timer**: enabled timer presets and custom timer duration.
- **专注时钟**：启用计时器预设和自定义计时时长。
- **Polling Requests**: JSON HTTP requests and display mappings.
- **轮询请求**：JSON HTTP 请求和展示字段映射。
- **Agent**: Agent Hook bridge status and managed hook installation controls.
- **Agent**：Agent Hook bridge 状态和托管 Hook 安装控制。

Settings are persisted in the Electron user data directory as `sources.json`. On macOS during development, this is typically under:

设置会以 `sources.json` 的形式保存在 Electron 用户数据目录。macOS 开发环境下通常位于：

```text
~/Library/Application Support/dynamic-island-content-app/sources.json
```

Older `sources.yaml` files can be migrated automatically when the app first creates `sources.json`.

旧版 `sources.yaml` 会在应用首次创建 `sources.json` 时尝试自动迁移。

### Polling Requests / 轮询请求

Polling requests fetch JSON data and map fields into the island UI.

轮询请求用于拉取 JSON 数据，并通过字段映射把数据展示到灵动岛界面里。

Each polling source supports:

每个轮询源支持：

- `id`: stable source identifier. / 稳定的数据源 ID。
- `name`: display name. / 展示名称。
- `icon`: optional compact icon text. / 可选的紧凑态图标文字。
- `refreshIntervalMs`: polling interval. The minimum is 15000 ms. / 轮询间隔，最小值为 15000 毫秒。
- `detailItemCount`: number of items shown in expanded mode. / 展开态展示的条目数量。
- `request.url`: JSON endpoint URL. / JSON 接口地址。
- `request.method`: `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`. / 请求方法，可选 `GET`、`POST`、`PUT`、`PATCH`、`DELETE`。
- `request.headers`: key/value headers. / Header 键值对。
- `request.params`: key/value query parameters. / 查询参数键值对。
- `request.body`: optional request body for `POST`, `PUT`, and `PATCH`. / `POST`、`PUT`、`PATCH` 可使用的请求体。
- `fieldMappings`: maps JSON fields into display slots. / 将 JSON 字段映射到展示槽位。
- `clickTarget`: optional fallback URL opened when source or item content is clicked. / 点击数据源或条目时打开的可选备用 URL。

The JSON normalizer treats a top-level array as the item list. For a top-level object, it uses the first array property if one exists; otherwise the object itself becomes one item.

JSON 归一化逻辑会把顶层数组作为条目列表；如果顶层是对象，会优先使用对象里的第一个数组字段，否则将整个对象作为一个条目。

### Field Mappings / 字段映射

Field mappings can reference item fields with dot notation:

字段映射可以用点号路径引用条目字段：

```json
{
  "title": "name",
  "summary": "status.label",
  "detail": "description",
  "timestamp": "updatedAt",
  "target": "url"
}
```

Mappings can also use simple templates against the full payload:

字段映射也可以使用基于完整响应数据的简单模板：

```json
{
  "title": "{{ $data.current.temperature_2m }} C",
  "summary": "Weather code {{ $data.current.weather_code }}",
  "detail": "{{ 100 - $data.current.humidity_2m }}% remaining"
}
```

Required slot:

必填槽位：

- `title`

Optional slots:

可选槽位：

- `summary`
- `detail`
- `timestamp`
- `icon`
- `target`

When `target` resolves to a URL, clicking the item opens it externally. If no item target is mapped, the app falls back to `clickTarget.item` and then `clickTarget.source`.

当 `target` 解析为 URL 时，点击条目会在外部打开该地址。如果条目没有映射目标地址，应用会依次回退到 `clickTarget.item` 和 `clickTarget.source`。

### Example Configuration / 配置示例

```json
{
  "language": "zh-CN",
  "islandWidthPreset": "medium",
  "rotationIntervalMs": 10000,
  "sources": [
    {
      "id": "weather",
      "name": "Weather",
      "icon": "WX",
      "refreshIntervalMs": 90000,
      "detailItemCount": 1,
      "request": {
        "url": "https://api.open-meteo.com/v1/forecast",
        "method": "GET",
        "headers": [],
        "params": [
          { "key": "latitude", "value": "31.23" },
          { "key": "longitude", "value": "121.47" },
          { "key": "current", "value": "temperature_2m,weather_code" }
        ],
        "body": ""
      },
      "fieldMappings": {
        "title": "{{ $data.current.temperature_2m }} C",
        "summary": "Weather code {{ $data.current.weather_code }}",
        "timestamp": "current.time",
        "detail": "{{ $data.current.temperature_2m }} C"
      },
      "clickTarget": {
        "source": "https://open-meteo.com/"
      }
    }
  ],
  "focusTimers": {
    "options": [
      {
        "id": "countdown-25",
        "label": "25 minute countdown",
        "durationMinutes": 25,
        "enabled": true
      }
    ]
  }
}
```

### Focus Timers / 专注计时器

Enable focus timer options from the settings window. Enabled timers appear in the menu bar menu. Starting a timer surfaces it in the island rotation, and completion remains visible briefly before clearing automatically.

在设置窗口中启用专注计时器选项。启用后的计时器会出现在菜单栏菜单里。启动计时器后，它会进入灵动岛轮转内容；计时完成后会短暂显示完成状态，然后自动清除。

### Agent Hook Integration / Agent Hook 集成

The Agent tab can install managed hooks for supported coding agents. These hooks report session starts, prompts, approvals, questions, stops, and reminders into the island.

Agent 标签页可以为支持的编码 Agent 安装托管 Hook。这些 Hook 会把会话开始、提示词、审批请求、问题、停止事件和提醒同步到灵动岛。

Supported tools:

支持的工具：

- Codex
- Claude Code
- Qoder
- Qwen Code
- Factory
- CodeBuddy
- Cursor
- Gemini CLI
- Kimi CLI
- OpenCode

Managed installs write to each tool's configuration directory and create backups before changing existing config files.

托管安装会写入对应工具的配置目录，并在修改已有配置文件前自动创建备份。

## Project Structure / 项目结构

```text
src/main/                  Electron main process, IPC handlers, tray, source polling, agent hooks
src/preload/               Context bridge API exposed to renderer windows
src/renderer/              React overlay and settings UI
src/shared/                Shared types, constants, and IPC contracts
native/macos-overlay-panel Native macOS overlay panel addon
config/                    Example legacy source configuration
.trellis/                  Project workflow, task history, and development guidelines
```

```text
src/main/                  Electron 主进程、IPC 处理器、菜单栏、数据源轮询、Agent Hook
src/preload/               暴露给渲染进程窗口的 Context Bridge API
src/renderer/              React 灵动岛界面和设置界面
src/shared/                共享类型、常量和 IPC 契约
native/macos-overlay-panel 原生 macOS 悬浮面板插件
config/                    旧版示例数据源配置
.trellis/                  项目工作流、任务历史和开发规范
```

## Notes And Limitations / 说明与限制

- The current polling implementation supports JSON sources. RSS source support is not active.
- 当前轮询实现支持 JSON 数据源，RSS 数据源支持未启用。
- The app is macOS-first. Other platforms are not a supported target for the native overlay experience.
- 应用优先面向 macOS，其他平台不是当前原生悬浮体验的支持目标。
- If the native overlay host fails to start, the app falls back to a BrowserWindow overlay host.
- 如果原生悬浮宿主启动失败，应用会回退到 BrowserWindow 悬浮宿主。
