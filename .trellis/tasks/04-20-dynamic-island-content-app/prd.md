# brainstorm: dynamic island content app

## Goal

Build a desktop app inspired by the iPhone Dynamic Island. The app stays fixed at the top center of the screen, shows compact summary information by default, and expands into a larger rectangular floating panel on hover to show more detail. Content comes from configurable sources such as RSS feeds or generic HTTP endpoints, and the displayed content should support formatting rules, including user-defined presentation.

## What I already know

* The desired primary interaction is a compact island at the top center of the screen that expands on mouse hover.
* The product should support configurable content sources, including RSS links and HTTP links.
* The compact state shows summary content; the expanded state shows richer details.
* Users should be able to define how fetched content is formatted for display.
* The MVP should pull from multiple configured sources at the same time.
* In compact mode, the island should show the summary for only one source at a time.
* The compact summary should auto-rotate across sources every 10 seconds by default.
* On hover, the expanded panel should show detailed information for all configured sources together.
* The first version should target macOS only.
* Visual inspiration should be taken from `https://vibeisland.app/zh/`.
* The reference product emphasizes a top-edge, pill-shaped floating surface, translucent dark HUD styling, subtle layered polish, compact progress/status presentation, and non-focus-stealing desktop behavior.
* The current repository appears to be at a very early stage: top-level contents are `.trellis/`, `.claude/`, and `AGENTS.md`, with no application source files yet.
* Existing Trellis specs are oriented around an Electron + React + TypeScript desktop stack, which is a likely fit for this app.

## Assumptions (temporary)

* This task is for an MVP desktop application rather than a mobile or browser-only implementation.
* The app will likely be built with Electron for desktop window control and top-center positioning.
* The first version can start with a limited set of source adapters and a simple formatting model, then expand later.

## Open Questions

* None.

## Requirements (evolving)

* The first version targets macOS only.
* The app remains visible at the top center of the screen in a compact state.
* The app should behave as a globally always-on-top desktop surface rather than a normal application window.
* Hovering over the compact state expands it into a larger floating detail panel.
* The visual direction should reference the polished floating-island feel of Vibe Island: pill-like compact state, refined translucent layering, and lightweight non-focus-stealing desktop presence.
* The user configures the app through a local YAML configuration file rather than an in-app settings UI.
* The YAML configuration file should contain clear comments or equivalent guidance so users understand each option.
* The user can configure multiple content sources.
* The system supports RSS and JSON-based HTTP sources for the MVP.
* Each source configuration must declare its source structure/type explicitly so the app knows whether to parse it as RSS or JSON.
* The app pulls data from all configured sources concurrently.
* Each source can define its own refresh interval.
* Source fetch failures should be visible in the UI rather than failing silently.
* In compact mode, the displayed summary rotates across configured sources automatically.
* The default compact rotation interval is 10 seconds and should be configurable.
* The compact state should display an icon plus text summary for the currently active source.
* In expanded mode, the panel shows detailed information for all configured sources together, including error states for failed sources.
* Expanded content supports optional click actions, but clicking does nothing by default.
* Users can configure a custom jump target per source or item so expanded content can open a user-defined destination when clicked.
* JSON sources should show 1 detail item by default and RSS sources should show 3 detail items by default.
* Users can override the detail item count per source in configuration.
* The displayed content is transformed into a compact summary view and a richer detail view.
* User-defined rendering for the MVP uses field mapping rather than free-form templates or scripts.
* The configuration model lets users map fetched fields into predefined UI slots such as title, summary, timestamp, and detail text.
* The app should feel ambient and low-interruption rather than stealing focus during normal desktop use.
* The app should provide a minimal macOS menu bar entry for quitting, reloading configuration, and viewing error status.

## Acceptance Criteria (evolving)

* [ ] The app renders a compact island anchored at the top center of the desktop.
* [ ] The app remains globally always-on-top like a desktop overlay rather than disappearing behind normal app windows.
* [ ] Hovering over the island expands it into a larger detail panel and moving away collapses it back.
* [ ] A user can configure multiple RSS and JSON sources through a local YAML configuration file.
* [ ] The YAML configuration file includes clear comments or documentation next to each configurable section so a user can understand how to edit it.
* [ ] Each configured source declares its type/structure explicitly so the app parses RSS and JSON correctly.
* [ ] The app fetches all configured source data and keeps them available for display.
* [ ] Each source can define its own refresh interval and the app respects those intervals.
* [ ] If a source fetch fails, the expanded view clearly shows that the source failed, along with a readable error summary or status.
* [ ] In compact mode, the app shows one source summary at a time with an icon plus text layout and rotates to the next source every 10 seconds by default.
* [ ] In expanded mode, the app shows detailed information for all configured sources.
* [ ] JSON sources show 1 detail item by default and RSS sources show 3 detail items by default.
* [ ] Users can override the displayed detail item count per source through configuration.
* [ ] Expanded content is non-clickable by default, and when click behavior is configured it opens the user-defined destination.
* [ ] The app lets the user map source fields into predefined display slots for compact and expanded views.

## Definition of Done (team quality bar)

* Tests added or updated where appropriate.
* Lint, typecheck, and relevant checks pass.
* Behavior and configuration are documented.
* Core interactions are manually verified on desktop.

## Technical Approach

* Use an Electron + React + TypeScript architecture optimized for macOS desktop overlay behavior.
* Render a compact always-on-top island window centered at the top of the screen and expand it on hover into a larger floating panel.
* Use a YAML config file with explanatory comments to define source list, source type, fetch interval, field mappings, detail counts, rotation interval, and optional click targets.
* Implement two source adapters for the MVP: RSS parser and JSON fetch/parser.
* Normalize fetched source data into a shared view model that supports compact summary slots and expanded detail slots.
* Run per-source polling based on each source's own refresh interval, while compact summary rotation uses a separate global rotation timer.
* Provide failure-aware UI states so expanded mode clearly shows source-level fetch errors.
* Add a minimal macOS menu bar entry for operational controls such as quit, reload config, and error visibility.

## Decision (ADR-lite)

**Context**: The product needs to feel like a polished Dynamic Island-style desktop surface while remaining simple enough for an MVP.
**Decision**: Start with a macOS-only Electron app that uses a YAML config file, supports RSS and JSON sources with explicit per-source type declarations, uses field mapping for rendering, rotates one compact source summary at a time, expands to show all sources together, and provides optional user-configured click targets that are disabled by default.
**Consequences**: The MVP stays implementation-friendly and predictable, but it intentionally excludes richer templating, HTML scraping, Windows support, and in-app configuration UI until the core overlay and source model are proven.

## Out of Scope (explicit)

* Windows support in the first version.
* Mobile-native implementation.
* In-app settings editor.
* Free-form templates or custom rendering scripts.
* Arbitrary HTML page scraping.
* Advanced authentication flows for protected APIs.
* Full plugin marketplace or third-party extension ecosystem.
* Highly complex animation choreography beyond what is needed for a polished MVP.

## Technical Notes

* Task created at `.trellis/tasks/04-20-dynamic-island-content-app`.
* Existing repository inspection suggests this is a greenfield app rather than a modification of an existing codebase.
* Trellis backend/frontend/shared guidelines are present and indicate an Electron + React + TypeScript architecture is expected in this repository.
* Visual inspiration research from `https://vibeisland.app/zh/` suggests a top-edge pill surface, dark translucent HUD treatment, subtle layered polish, compact status-centric summaries, and non-focus-stealing overlay behavior.
* Per-source defaults decided so JSON sources show 1 detail item by default and RSS sources show 3 by default, with per-source override support.
* Click behavior is opt-in: no jump action by default, but user-defined destinations can be configured per source or item.