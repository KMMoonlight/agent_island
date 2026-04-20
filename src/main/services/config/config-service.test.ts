import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => {
  const userDataPath = mkdtempSync(path.join(os.tmpdir(), 'dynamic-island-config-'));
  mkdirSync(userDataPath, { recursive: true });

  return {
    app: {
      getPath: (name: string) => {
        if (name !== 'userData') {
          throw new Error(`Unexpected path request: ${name}`);
        }

        return userDataPath;
      },
    },
  };
});

import { ConfigService } from './config-service';

describe('ConfigService', () => {
  let service: ConfigService;

  beforeEach(() => {
    service = new ConfigService();
  });

  it('creates a default config file from the example template', () => {
    const configPath = service.ensureConfigFile();
    const contents = readFileSync(configPath, 'utf8');

    expect(contents).toContain('rotationIntervalMs: 10000');
    expect(contents).toContain('type: rss');
  });

  it('loads a valid YAML configuration with defaults', () => {
    const configPath = service.getConfigPath();
    writeFileSync(
      configPath,
      [
        'rotationIntervalMs: 15000',
        'sources:',
        '  - id: sample-json',
        '    name: Sample JSON',
        '    type: json',
        '    url: https://example.com/data.json',
        '    fieldMappings:',
        '      title: current.title',
      ].join('\n'),
      'utf8'
    );

    const config = service.reloadConfig();

    expect(config.rotationIntervalMs).toBe(15000);
    expect(config.sources).toHaveLength(1);
    expect(config.sources[0]?.refreshIntervalMs).toBe(60000);
  });

  it('throws when YAML fails validation', () => {
    const configPath = service.getConfigPath();
    writeFileSync(
      configPath,
      [
        'sources:',
        '  - id: invalid',
        '    name: Invalid Feed',
        '    type: json',
        '    url: https://example.com/data.json',
        '    refreshIntervalMs: 1000',
        '    fieldMappings:',
        '      title: title',
      ].join('\n'),
      'utf8'
    );

    expect(() => service.reloadConfig()).toThrow(/Config validation failed/);
  });
});
