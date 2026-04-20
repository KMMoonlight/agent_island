import { app } from 'electron';

if (!app.isPackaged) {
  const devUserDataPath = `${app.getPath('userData')}-dev`;
  app.setPath('userData', devUserDataPath);
}

export {};
