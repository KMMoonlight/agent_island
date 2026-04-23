/* global __dirname, module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');

let cachedBinding;
let cachedDiagnostics = [];

const candidatePaths = [
  path.join(__dirname, 'build/Release/macos_overlay_panel.node'),
  path.resolve(__dirname, '../../../../native/macos-overlay-panel/build/Release/macos_overlay_panel.node'),
];

for (const candidatePath of candidatePaths) {
  try {
    if (!fs.existsSync(candidatePath)) {
      cachedDiagnostics.push(`missing: ${candidatePath}`);
      continue;
    }

    // We try the packaged location first, then fall back to the source tree for dev builds.
    cachedBinding = require(candidatePath);
    cachedDiagnostics = [`loaded: ${candidatePath}`];
    break;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cachedDiagnostics.push(`failed: ${candidatePath} (${message})`);
  }
}

const loadDiagnostics = cachedDiagnostics.join('; ');

module.exports = cachedBinding ?? {
  isSupported() {
    return false;
  },
  getUnavailableReason() {
    return loadDiagnostics || 'Native macOS overlay bridge binary is unavailable.';
  },
  getLoadDiagnostics() {
    return loadDiagnostics || null;
  },
  createPanel() {
    return null;
  },
  destroyPanel() {
    return false;
  },
  loadPanelUrl() {
    return false;
  },
  loadPanelFile() {
    return false;
  },
  setPanelMessageCallback() {
    return false;
  },
  dispatchPanelMessage() {
    return false;
  },
  setPanelFrame() {
    return false;
  },
  getPanelFrame() {
    return null;
  },
  getPanelDiagnostics() {
    return null;
  },
  syncPanelPointerState() {
    return false;
  },
  orderPanelFrontRegardless() {
    return false;
  },
  orderPanelOut() {
    return false;
  },
};
