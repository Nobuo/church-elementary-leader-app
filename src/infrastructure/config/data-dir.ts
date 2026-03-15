import path from 'path';
import os from 'os';
import fs from 'fs';

const APP_NAME = 'leader-app';
const DB_FILENAME = 'leader-app.db';

export function resolveDataDir(appName: string): string {
  const platform = process.platform;

  switch (platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', appName);
    case 'win32': {
      const localAppData = process.env.LOCALAPPDATA;
      if (!localAppData) {
        throw new Error('LOCALAPPDATA environment variable is not set');
      }
      return path.join(localAppData, appName);
    }
    case 'linux': {
      const xdgDataHome =
        process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
      return path.join(xdgDataHome, appName);
    }
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

export function resolveDbPath(): string {
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
  }
  const dataDir = resolveDataDir(APP_NAME);
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, DB_FILENAME);
}

export function migrateOldDbIfNeeded(newDbPath: string): void {
  // Check both cwd and executable directory for old DB files
  const candidates = [
    path.join(process.cwd(), DB_FILENAME),
    path.join(path.dirname(process.execPath), DB_FILENAME),
  ];
  const oldDbPath = candidates.find((p) => fs.existsSync(p));

  if (oldDbPath && !fs.existsSync(newDbPath)) {
    fs.mkdirSync(path.dirname(newDbPath), { recursive: true });
    fs.copyFileSync(oldDbPath, newDbPath);
    for (const ext of ['-wal', '-shm']) {
      const src = oldDbPath + ext;
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, newDbPath + ext);
      }
    }
    console.log(
      `[leader-app] データベースを移行しました:\n  旧: ${oldDbPath}\n  新: ${newDbPath}\n  ※ 旧ファイルは手動で削除できます`,
    );
  }
}
