import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveTemplatePath(): string {
  const appPath = typeof app.getAppPath === 'function' ? app.getAppPath() : process.cwd();
  const candidatePaths = [
    path.join(appPath, 'config', 'example.sources.yaml'),
    path.resolve(process.cwd(), 'config/example.sources.yaml'),
    path.resolve(__dirname, '../../config/example.sources.yaml'),
  ];
  const templatePath = candidatePaths.find((candidatePath) => existsSync(candidatePath));

  if (!templatePath) {
    throw new Error('Example config template not found');
  }

  return templatePath;
}

export function getExampleConfigContents(): string {
  return readFileSync(resolveTemplatePath(), 'utf8');
}
