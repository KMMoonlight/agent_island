import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Menu, Tray, app, nativeImage } from 'electron';

import type { AppStatus } from '../../shared/types/ipc';

type TrayMenuActions = {
  onRefreshSources: () => void;
  onOpenConfig: () => void;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveTrayIconPath(fileName: string): string {
  const developmentPath = path.join(process.cwd(), 'src/main/tray', fileName);

  if (existsSync(developmentPath)) {
    return developmentPath;
  }

  return path.join(__dirname, fileName);
}

function createTrayIcon() {
  const iconPath = resolveTrayIconPath('trayTemplate.png');
  const retinaIconPath = resolveTrayIconPath('trayTemplate@2x.png');
  const icon = nativeImage.createFromPath(iconPath);

  icon.setTemplateImage(true);

  const retinaIcon = nativeImage.createFromPath(retinaIconPath);

  if (!retinaIcon.isEmpty()) {
    icon.addRepresentation({
      scaleFactor: 2,
      width: 32,
      height: 32,
      buffer: retinaIcon.toPNG(),
    });
  }

  return icon;
}

export class TrayMenu {
  private tray: Tray | null = null;

  constructor(private readonly actions: TrayMenuActions) {}

  create(initialStatus: AppStatus): void {
    const trayIcon = createTrayIcon();

    this.tray = new Tray(trayIcon);

    if (process.platform === 'darwin') {
      this.tray.setImage(trayIcon);
    }

    this.tray.setToolTip('Dynamic Island Content');
    this.update(initialStatus);
  }

  update(status: AppStatus): void {
    if (!this.tray) {
      return;
    }

    const statusLabel = status.hasErrors
      ? `Status: ${status.sourceCount} source(s), errors present`
      : `Status: ${status.sourceCount} source(s), healthy`;

    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: statusLabel,
          enabled: false,
        },
        {
          label: 'Open settings',
          click: () => {
            this.actions.onOpenConfig();
          },
        },
        {
          label: 'Refresh sources now',
          click: () => {
            this.actions.onRefreshSources();
          },
        },
        {
          type: 'separator',
        },
        {
          label: 'Quit',
          click: () => {
            app.quit();
          },
        },
      ])
    );
  }
}
