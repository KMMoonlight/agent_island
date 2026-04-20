import { Buffer } from 'node:buffer';

import { Menu, Tray, app, nativeImage } from 'electron';

import type { AppStatus } from '../../shared/types/ipc';

type TrayMenuActions = {
  onReload: () => void;
  onOpenConfig: () => void;
};

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

  const icon = nativeImage
    .createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
    .resize({ width: 18, height: 18 });

  icon.setTemplateImage(true);

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
          label: 'Open config file',
          click: () => {
            this.actions.onOpenConfig();
          },
        },
        {
          label: 'Reload config',
          click: () => {
            this.actions.onReload();
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
