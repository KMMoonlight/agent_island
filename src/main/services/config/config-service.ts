import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { app, shell } from 'electron';
import { parse } from 'yaml';
import { ZodError } from 'zod';

import { logger as baseLogger } from '../logger';

import { appConfigSchema, type AppConfig } from '../../../shared/types/config';

import { getExampleConfigContents } from './example-config';

function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join('; ');
}

export class ConfigService {
  private readonly logger = baseLogger.scope('config');

  private config: AppConfig | null = null;

  getConfigPath(): string {
    return path.join(app.getPath('userData'), 'sources.yaml');
  }

  revealConfigFile(): void {
    this.ensureConfigFile();
    void shell.showItemInFolder(this.getConfigPath());
  }

  ensureConfigFile(): string {
    const configPath = this.getConfigPath();
    const configDir = path.dirname(configPath);

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    if (!existsSync(configPath)) {
      const templatePath = path.join(app.getPath('userData'), 'sources.example.yaml');
      copyFileSync(this.createExampleFile(templatePath), configPath);
      this.logger.info('Created default config file', { configPath });
    }

    return configPath;
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
    const parsed = parse(rawConfig) as unknown;
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

  private createExampleFile(targetPath: string): string {
    const configDir = path.dirname(targetPath);

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    const template = getExampleConfigContents();
    writeFileSync(targetPath, template, 'utf8');

    return targetPath;
  }
}
