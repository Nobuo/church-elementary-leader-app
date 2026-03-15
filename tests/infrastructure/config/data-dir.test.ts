import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

// We need to dynamically import the module after stubbing process.platform
async function importModule() {
  // Clear module cache to pick up new stubs
  vi.resetModules();
  return import('@infrastructure/config/data-dir');
}

describe('resolveDataDir', () => {
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = { ...originalEnv };
  });

  it('macOSで ~/Library/Application Support/<appName> を返す', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const { resolveDataDir } = await importModule();
    const result = resolveDataDir('leader-app');
    expect(result).toBe(path.join(os.homedir(), 'Library', 'Application Support', 'leader-app'));
  });

  it('Windowsで %LOCALAPPDATA%/<appName> を返す', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
    const { resolveDataDir } = await importModule();
    const result = resolveDataDir('leader-app');
    expect(result).toBe(path.join('C:\\Users\\test\\AppData\\Local', 'leader-app'));
  });

  it('WindowsでLOCALAPPDATA未設定時にエラーをthrowする', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    delete process.env.LOCALAPPDATA;
    const { resolveDataDir } = await importModule();
    expect(() => resolveDataDir('leader-app')).toThrow('LOCALAPPDATA');
  });

  it('Linuxで ~/.local/share/<appName> を返す', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    delete process.env.XDG_DATA_HOME;
    const { resolveDataDir } = await importModule();
    const result = resolveDataDir('leader-app');
    expect(result).toBe(path.join(os.homedir(), '.local', 'share', 'leader-app'));
  });

  it('LinuxでXDG_DATA_HOME設定時にそれを優先する', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.XDG_DATA_HOME = '/custom/data';
    const { resolveDataDir } = await importModule();
    const result = resolveDataDir('leader-app');
    expect(result).toBe(path.join('/custom/data', 'leader-app'));
  });

  it('未対応OSでエラーをthrowする', async () => {
    Object.defineProperty(process, 'platform', { value: 'freebsd' });
    const { resolveDataDir } = await importModule();
    expect(() => resolveDataDir('leader-app')).toThrow('Unsupported platform');
  });
});

describe('resolveDbPath', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('DB_PATHが設定されていればその値を返す', async () => {
    process.env.DB_PATH = '/tmp/test-custom.db';
    const { resolveDbPath } = await importModule();
    expect(resolveDbPath()).toBe('/tmp/test-custom.db');
  });

  it('DB_PATH未設定ならユーザーデータディレクトリのパスを返す', async () => {
    delete process.env.DB_PATH;
    const { resolveDbPath } = await importModule();
    const result = resolveDbPath();
    expect(result).toContain('leader-app');
    expect(result).toMatch(/leader-app\.db$/);
  });
});

describe('migrateOldDbIfNeeded', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'data-dir-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('旧パスにDBがあり新パスにない場合、コピーする', async () => {
    const oldDbPath = path.join(tmpDir, 'old', 'leader-app.db');
    const newDbPath = path.join(tmpDir, 'new', 'leader-app.db');
    fs.mkdirSync(path.dirname(oldDbPath), { recursive: true });
    fs.writeFileSync(oldDbPath, 'test-db-content');

    const { migrateOldDbIfNeeded } = await importModule();

    // Mock process.cwd to return old dir
    const originalCwd = process.cwd;
    process.cwd = () => path.join(tmpDir, 'old');
    try {
      migrateOldDbIfNeeded(newDbPath);
    } finally {
      process.cwd = originalCwd;
    }

    expect(fs.existsSync(newDbPath)).toBe(true);
    expect(fs.readFileSync(newDbPath, 'utf-8')).toBe('test-db-content');
  });

  it('WAL/SHMファイルも一緒にコピーする', async () => {
    const oldDbPath = path.join(tmpDir, 'old', 'leader-app.db');
    const newDbPath = path.join(tmpDir, 'new', 'leader-app.db');
    fs.mkdirSync(path.dirname(oldDbPath), { recursive: true });
    fs.writeFileSync(oldDbPath, 'db');
    fs.writeFileSync(oldDbPath + '-wal', 'wal');
    fs.writeFileSync(oldDbPath + '-shm', 'shm');

    const { migrateOldDbIfNeeded } = await importModule();
    const originalCwd = process.cwd;
    process.cwd = () => path.join(tmpDir, 'old');
    try {
      migrateOldDbIfNeeded(newDbPath);
    } finally {
      process.cwd = originalCwd;
    }

    expect(fs.readFileSync(newDbPath + '-wal', 'utf-8')).toBe('wal');
    expect(fs.readFileSync(newDbPath + '-shm', 'utf-8')).toBe('shm');
  });

  it('旧パスのファイルは残す（非破壊）', async () => {
    const oldDbPath = path.join(tmpDir, 'old', 'leader-app.db');
    const newDbPath = path.join(tmpDir, 'new', 'leader-app.db');
    fs.mkdirSync(path.dirname(oldDbPath), { recursive: true });
    fs.writeFileSync(oldDbPath, 'original');

    const { migrateOldDbIfNeeded } = await importModule();
    const originalCwd = process.cwd;
    process.cwd = () => path.join(tmpDir, 'old');
    try {
      migrateOldDbIfNeeded(newDbPath);
    } finally {
      process.cwd = originalCwd;
    }

    expect(fs.existsSync(oldDbPath)).toBe(true);
    expect(fs.readFileSync(oldDbPath, 'utf-8')).toBe('original');
  });

  it('新パスに既にDBがある場合、何もしない', async () => {
    const oldDbPath = path.join(tmpDir, 'old', 'leader-app.db');
    const newDbPath = path.join(tmpDir, 'new', 'leader-app.db');
    fs.mkdirSync(path.dirname(oldDbPath), { recursive: true });
    fs.mkdirSync(path.dirname(newDbPath), { recursive: true });
    fs.writeFileSync(oldDbPath, 'old-content');
    fs.writeFileSync(newDbPath, 'existing-content');

    const { migrateOldDbIfNeeded } = await importModule();
    const originalCwd = process.cwd;
    process.cwd = () => path.join(tmpDir, 'old');
    try {
      migrateOldDbIfNeeded(newDbPath);
    } finally {
      process.cwd = originalCwd;
    }

    expect(fs.readFileSync(newDbPath, 'utf-8')).toBe('existing-content');
  });

  it('旧パスにDBがない場合、何もしない', async () => {
    const emptyDir = path.join(tmpDir, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    const newDbPath = path.join(tmpDir, 'new', 'leader-app.db');

    const { migrateOldDbIfNeeded } = await importModule();
    const originalCwd = process.cwd;
    process.cwd = () => emptyDir;
    try {
      migrateOldDbIfNeeded(newDbPath);
    } finally {
      process.cwd = originalCwd;
    }

    expect(fs.existsSync(newDbPath)).toBe(false);
  });
});
