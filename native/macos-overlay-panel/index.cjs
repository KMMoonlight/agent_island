/* global __dirname, module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('node:path');

let cachedBinding;
let cachedError = null;

const candidatePaths = [
  path.join(__dirname, 'build/Release/macos_overlay_panel.node'),
  path.resolve(__dirname, '../../../../native/macos-overlay-panel/build/Release/macos_overlay_panel.node'),
];

for (const candidatePath of candidatePaths) {
  try {
    // We try the packaged location first, then fall back to the source tree for dev builds.
    cachedBinding = require(candidatePath);
    cachedError = null;
    break;
  } catch (error) {
    cachedError = error;
  }
}

module.exports = cachedBinding ?? {
  isSupported() {
    return false;
  },
  getUnavailableReason() {
    if (cachedError instanceof Error) {
      return cachedError.message;
    }

    return 'Native macOS overlay bridge binary is unavailable.';
  },
  configureWindow() {
    return false;
  },
  setFrame() {
    return false;
  },
  getFrame() {
    return null;
  },
  orderFrontRegardless() {
    return false;
  },
};
