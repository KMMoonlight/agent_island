import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { app } from 'electron';
import { parse } from 'yaml';
import { ZodError } from 'zod';

import { logger as baseLogger } from '../logger';

import { APP_CONFIG } from '../../../shared/constants/config';
import {
  appConfigSchema,
  type AppConfig,
  type SourceConfig,
} from '../../../shared/types/config';

function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join('; ');
}

type LegacySourceConfig = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  url?: unknown;
  icon?: unknown;
  refreshIntervalMs?: unknown;
  detailItemCount?: unknown;
  fieldMappings?: unknown;
  clickTarget?: unknown;
};

type LegacyAppConfig = {
  rotationIntervalMs?: unknown;
  sources?: unknown;
};

function isSlotMappingRecord(value: unknown): value is SourceConfig['fieldMappings'] {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.title !== 'string') {
    return false;
  }

  return Object.entries(record).every(([, entry]) => typeof entry === 'string');
}

function migrateLegacyConfig(parsed: unknown): AppConfig | null {
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const legacyConfig = parsed as LegacyAppConfig;
  const legacySources = Array.isArray(legacyConfig.sources) ? legacyConfig.sources : [];
  const migratedSources: SourceConfig[] = legacySources.flatMap((source): SourceConfig[] => {
    if (typeof source !== 'object' || source === null) {
      return [];
    }

    const legacySource = source as LegacySourceConfig;

    if (
      legacySource.type !== 'json' ||
      typeof legacySource.id !== 'string' ||
      typeof legacySource.name !== 'string' ||
      typeof legacySource.url !== 'string' ||
      !isSlotMappingRecord(legacySource.fieldMappings)
    ) {
      return [];
    }

    const migratedSource: SourceConfig = {
      id: legacySource.id,
      name: legacySource.name,
      refreshIntervalMs: APP_CONFIG.polling.defaultRefreshIntervalMs,
      request: {
        url: legacySource.url,
        method: 'GET',
        headers: [],
        params: [],
        body: undefined,
      },
      fieldMappings: legacySource.fieldMappings,
    };

    if (typeof legacySource.icon === 'string') {
      migratedSource.icon = legacySource.icon;
    }

    if (typeof legacySource.refreshIntervalMs === 'number') {
      migratedSource.refreshIntervalMs = legacySource.refreshIntervalMs;
    }

    if (typeof legacySource.detailItemCount === 'number') {
      migratedSource.detailItemCount = legacySource.detailItemCount;
    }

    if (typeof legacySource.clickTarget === 'object' && legacySource.clickTarget !== null) {
      migratedSource.clickTarget = legacySource.clickTarget as SourceConfig['clickTarget'];
    }

    return [migratedSource];
  });

  return appConfigSchema.parse({
    rotationIntervalMs: legacyConfig.rotationIntervalMs,
    sources: migratedSources,
  });
}

export class ConfigService {
  private readonly logger = baseLogger.scope('config');

  private config: AppConfig | null = null;

  getConfigPath(): string {
    return path.join(app.getPath('userData'), 'sources.json');
  }

  private getLegacyConfigPath(): string {
    return path.join(app.getPath('userData'), 'sources.yaml');
  }

  getConfig(): AppConfig {
    if (this.config) {
      return this.config;
    }

    return this.reloadConfig();
  }

  reloadConfig(): AppConfig {
    const configPath = this.ensureConfigFile();
    const rawConfig = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(rawConfig) as unknown;
    const result = appConfigSchema.safeParse(parsed);

    if (!result.success) {
      const message = formatZodError(result.error);
      this.logger.error('Config validation failed', { message, configPath });
      throw new Error(`Config validation failed: ${message}`);
    }

    this.config = result.data;
    this.logger.info('Config loaded', {
      configPath,
      sourceCount: result.data.sources.length,
    });

    return this.config;
  }

  saveConfig(nextConfig: AppConfig): AppConfig {
    const validatedConfig = appConfigSchema.parse(nextConfig);
    const configPath = this.ensureConfigFile();
    writeFileSync(configPath, JSON.stringify(validatedConfig, null, 2), 'utf8');
    this.config = validatedConfig;
    this.logger.info('Config saved', {
      configPath,
      sourceCount: validatedConfig.sources.length,
    });
    return validatedConfig;
  }

  validateConfig(candidate: unknown): AppConfig {
    return appConfigSchema.parse(candidate);
  }

  ensureConfigFile(): string {
    const configPath = this.getConfigPath();
    const configDir = path.dirname(configPath);

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    if (existsSync(configPath)) {
      return configPath;
    }

    const migratedConfig = this.migrateLegacyFile();
    const initialConfig = migratedConfig ?? appConfigSchema.parse({ sources: [] });
    writeFileSync(configPath, JSON.stringify(initialConfig, null, 2), 'utf8');

    this.logger.info('Created default persisted config', {
      configPath,
      sourceCount: initialConfig.sources.length,
    });

    return configPath;
  }

  private migrateLegacyFile(): AppConfig | null {
    const legacyConfigPath = this.getLegacyConfigPath();

    if (!existsSync(legacyConfigPath)) {
      return null;
    }

    try {
      const rawConfig = readFileSync(legacyConfigPath, 'utf8');
      const parsed = parse(rawConfig) as unknown;
      const migrated = migrateLegacyConfig(parsed);

      if (migrated) {
        this.logger.info('Migrated legacy YAML config', {
          legacyConfigPath,
          sourceCount: migrated.sources.length,
        });
      }

      return migrated;
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error('Legacy config migration failed');
      this.logger.warn('Failed to migrate legacy YAML config', {
        legacyConfigPath,
        message: normalizedError.message,
      });
      return null;
    }
  }
}
