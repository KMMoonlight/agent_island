import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Menu, Tray, app, nativeImage } from 'electron';

import { formatFocusTimerRuntimeLabel, type FocusTimerConfigOption } from '../../shared/types/config';
import type { AppStatus } from '../../shared/types/ipc';
import type { ActiveFocusTimer } from '../../shared/types/source-data';

type TrayMenuActions = {
  onOpenConfig: () => void;
  onStartFocusTimer: (option: FocusTimerConfigOption) => void;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAkElEQVR42mNgGJbAEoizgLgBipOBWJkYjaJAvB+I/+PAc4CYHZ8Bx4D4FRDHoCkEGTwVaghIjQM2ze5QBX5Y5EDO/wHF/3Gpa4BKYAMVQPwRajPMgB3YFP3H4UeYAX74DLCESlSQ6wUQWAWV7IM6VwuK3ZFiZweuQGSAOr8PzSYY/ghNG0QBPiTbYZidYfgCAPWnM5FAScAmAAAAAElFTkSuQmCC';
const TRAY_ICON_RETINA_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAqElEQVR42mNgGAWDEFgCcRYQN0BxMhAr08NiUSDeD8T/ceA5QMxOSwccA+JXQByDZhHIYVOhjgCpcaCF5e5QC/ywyIGC/wcU/8ejjiLQADUYG6gA4o9Qn8McsIPaDqiAGsyOxwF+tHSAJdTgioGKAhBYBTW8DxrcWlDsjpQ7dtAqETJAg78Pzacw/BFaNtAF8CH5HobZGUbBKBgFo2AUjIJRMApGwXAFANCYM5FHDofCAAAAAElFTkSuQmCC';

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
  const iconFromPath = nativeImage.createFromPath(iconPath);
  const icon = iconFromPath.isEmpty()
    ? nativeImage.createFromDataURL(TRAY_ICON_DATA_URL)
    : iconFromPath;

  icon.setTemplateImage(true);

  const retinaIconFromPath = nativeImage.createFromPath(retinaIconPath);
  const retinaIcon = retinaIconFromPath.isEmpty()
    ? nativeImage.createFromDataURL(TRAY_ICON_RETINA_DATA_URL)
    : retinaIconFromPath;

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

  update(
    _status: AppStatus,
    focusTimerOptions: FocusTimerConfigOption[] = [],
    activeFocusTimer: ActiveFocusTimer | null = null
  ): void {
    if (!this.tray) {
      return;
    }

    const enabledFocusTimerOptions = focusTimerOptions.filter((option) => option.enabled);
    const focusTimerMenuItems = enabledFocusTimerOptions.length > 0
      ? enabledFocusTimerOptions.map((option) => ({
        label: activeFocusTimer?.optionId === option.id
          ? `${formatFocusTimerRuntimeLabel(option)} (进行中)`
          : formatFocusTimerRuntimeLabel(option),
        click: () => {
          this.actions.onStartFocusTimer(option);
        },
      }))
      : [
        {
          label: '未启用专注时钟',
          enabled: false,
        },
      ];

    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Open settings',
          click: () => {
            this.actions.onOpenConfig();
          },
        },
        {
          type: 'separator',
        },
        ...focusTimerMenuItems,
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
