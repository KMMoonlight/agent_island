import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nativeOverlayDir = path.resolve(__dirname, 'native/macos-overlay-panel');
const nativeOverlayLoader = path.join(nativeOverlayDir, 'index.cjs');
const nativeOverlayBinary = path.join(nativeOverlayDir, 'build/Release/macos_overlay_panel.node');

function copyNativeOverlayRuntime(outDir: string): void {
  const targetDir = path.resolve(__dirname, outDir, 'native/macos-overlay-panel');
  fs.mkdirSync(path.join(targetDir, 'build/Release'), { recursive: true });

  if (fs.existsSync(nativeOverlayLoader)) {
    fs.copyFileSync(nativeOverlayLoader, path.join(targetDir, 'index.cjs'));
  }

  if (fs.existsSync(nativeOverlayBinary)) {
    fs.copyFileSync(nativeOverlayBinary, path.join(targetDir, 'build/Release/macos_overlay_panel.node'));
  }
}

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin(),
      {
        name: 'copy-native-overlay-loader',
        closeBundle() {
          copyNativeOverlayRuntime('out/main');
        },
      },
    ],
    build: {
      lib: {
        entry: path.resolve(__dirname, 'src/main/main.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: path.resolve(__dirname, 'src/preload/preload.ts'),
      },
    },
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer/src'),
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
    },
  },
});
