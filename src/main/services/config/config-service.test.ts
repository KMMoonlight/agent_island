import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

    const configPath = service.getConfigPath();
    const legacyConfigPath = path.join(path.dirname(configPath), 'sources.yaml');

    if (existsSync(configPath)) {
      rmSync(configPath);
    }

    if (existsSync(legacyConfigPath)) {
      rmSync(legacyConfigPath);
    }
  });

  it('creates an empty persisted JSON config when no files exist', () => {
    const configPath = service.ensureConfigFile();
    const contents = readFileSync(configPath, 'utf8');

    expect(configPath.endsWith('sources.json')).toBe(true);
    expect(JSON.parse(contents)).toEqual({
      rotationIntervalMs: 10000,
      sources: [],
    });
  });

  it('loads a valid JSON configuration with defaults', () => {
    const configPath = service.getConfigPath();
    writeFileSync(
      configPath,
      JSON.stringify({
        rotationIntervalMs: 15000,
        sources: [
          {
            id: 'sample-json',
            name: 'Sample JSON',
            request: {
              url: 'https://example.com/data.json',
              method: 'GET',
              headers: [],
              params: [],
              body: '{"hello":"world"}',
            },
            fieldMappings: {
              title: 'current.title',
            },
          },
        ],
      }),
      'utf8'
    );

    const config = service.reloadConfig();

    expect(config.rotationIntervalMs).toBe(15000);
    expect(config.sources).toHaveLength(1);
    expect(config.sources[0]?.refreshIntervalMs).toBe(60000);
    expect(config.sources[0]?.request.body).toBe('{"hello":"world"}');
  });

  it('migrates legacy YAML json sources and skips rss sources', () => {
    const legacyConfigPath = path.join(path.dirname(service.getConfigPath()), 'sources.yaml');
    writeFileSync(
      legacyConfigPath,
      [
        'rotationIntervalMs: 15000',
        'sources:',
        '  - id: sample-json',
        '    name: Sample JSON',
        '    type: json',
        '    url: https://example.com/data.json',
        '    fieldMappings:',
        '      title: current.title',
        '  - id: sample-rss',
        '    name: Sample RSS',
        '    type: rss',
        '    url: https://example.com/feed.xml',
        '    fieldMappings:',
        '      title: title',
      ].join('\n'),
      'utf8'
    );

    const config = service.reloadConfig();

    expect(config.rotationIntervalMs).toBe(15000);
    expect(config.sources).toHaveLength(1);
    expect(config.sources[0]).toMatchObject({
      id: 'sample-json',
      request: {
        url: 'https://example.com/data.json',
        method: 'GET',
      },
    });
    expect(config.sources[0]?.request.body).toBeUndefined();
  });

  it('throws when JSON fails validation', () => {
    const configPath = service.getConfigPath();
    writeFileSync(
      configPath,
      JSON.stringify({
        sources: [
          {
            id: 'invalid',
            name: 'Invalid Feed',
            request: {
              url: 'https://example.com/data.json',
              method: 'GET',
              headers: [],
              params: [],
            },
            refreshIntervalMs: 1000,
            fieldMappings: {
              title: 'title',
            },
          },
        ],
      }),
      'utf8'
    );

    expect(() => service.reloadConfig()).toThrow(/Config validation failed/);
  });
});
