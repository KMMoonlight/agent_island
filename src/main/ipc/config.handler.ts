import { ZodError } from 'zod';
import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/constants/channels';
import type { AppConfig } from '../../shared/types/config';
import type { ConfigValidationResult } from '../../shared/types/ipc';
import type { ConfigService } from '../services/config/config-service';
import type { SourcePoller } from '../services/sources/source-poller';

function formatValidationError(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join('; ');
}

function toValidationResult(error: unknown): ConfigValidationResult {
  if (error instanceof ZodError) {
    return {
      ok: false,
      error: formatValidationError(error),
    };
  }

  if (error instanceof Error) {
    return {
      ok: false,
      error: error.message,
    };
  }

  return {
    ok: false,
    error: 'Config validation failed',
  };
}

export function registerConfigHandlers(configService: ConfigService, sourcePoller: SourcePoller): void {
  ipcMain.handle(IPC_CHANNELS.CONFIG.GET, () => configService.getConfig());
  ipcMain.handle(IPC_CHANNELS.CONFIG.SAVE, async (_event, candidate: unknown) => {
    const validatedConfig = configService.validateConfig(candidate) as AppConfig;
    configService.saveConfig(validatedConfig);
    sourcePoller.reload();
    return validatedConfig;
  });
  ipcMain.handle(IPC_CHANNELS.CONFIG.VALIDATE, (_event, candidate: unknown): ConfigValidationResult => {
    try {
      const config = configService.validateConfig(candidate);
      return {
        ok: true,
        config,
      };
    } catch (error) {
      return toValidationResult(error);
    }
  });
  ipcMain.handle(IPC_CHANNELS.CONFIG.REFRESH_SOURCES, async () => {
    sourcePoller.reload();
    return sourcePoller.getState();
  });
}
