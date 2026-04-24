import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nativeOverlayDir = path.resolve(__dirname, 'native/macos-overlay-panel');
const nativeOverlayLoader = path.join(nativeOverlayDir, 'index.cjs');
const nativeOverlayBinary = path.join(nativeOverlayDir, 'build/Release/macos_overlay_panel.node');
const trayAssetDir = path.resolve(__dirname, 'src/main/tray');
const trayAssetNames = ['trayTemplate.png', 'trayTemplate@2x.png'] as const;

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

function copyTrayAssets(outDir: string): void {
  const targetDir = path.resolve(__dirname, outDir);
  fs.mkdirSync(targetDir, { recursive: true });

  for (const assetName of trayAssetNames) {
    const sourcePath = path.join(trayAssetDir, assetName);
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, path.join(targetDir, assetName));
    }
  }
}

function stripRendererCrossOrigin(outDir: string): void {
  const indexPath = path.resolve(__dirname, outDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return;
  }

  const html = fs.readFileSync(indexPath, 'utf8');
  const nextHtml = html
    .replace(/\s+crossorigin(?=[\s>])/g, '')
    .replace(/\s+type="module"(?=[\s>])/g, ' defer')
    .replace(/\n\s*<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>\n/, '\n');

  if (nextHtml !== html) {
    fs.writeFileSync(indexPath, nextHtml);
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
          copyTrayAssets('out/main');
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
    plugins: [
      react(),
      {
        name: 'strip-renderer-crossorigin-for-native-webview',
        closeBundle() {
          stripRendererCrossOrigin('out/renderer');
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer/src'),
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
    },
  },
});
