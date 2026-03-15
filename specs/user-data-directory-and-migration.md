# ユーザーデータディレクトリ & スキーママイグレーション仕様

## 1. 機能概要

### 1.1 背景・課題

現在、DBファイル (`leader-app.db`) はアプリの実行ディレクトリに作成される。これにより以下の問題がある:

- **データ消失リスク**: アプリディレクトリごと削除するとDBも消える
- **バージョンアップ時の消失**: Bun compileバイナリを上書き配布する際、同梱ディレクトリを差し替えるとDBが失われる
- **OS慣習の不遵守**: macOS/Windowsにはアプリデータの標準格納場所があり、それに従っていない

### 1.2 解決策

1. **ユーザーデータディレクトリ**: OS標準のアプリケーションデータディレクトリにDBを格納する
2. **スキーママイグレーション強化**: バージョンアップ時のスキーマ変更に対応するため、ロールバック機能を追加する

---

## 2. ユーザーデータディレクトリ

### 2.1 OS別格納パス

| OS | パス | 例 |
|----|------|-----|
| macOS | `~/Library/Application Support/leader-app/` | `/Users/nobuo/Library/Application Support/leader-app/` |
| Windows | `%LOCALAPPDATA%\leader-app\` | `C:\Users\nobuo\AppData\Local\leader-app\` |
| Linux | `$XDG_DATA_HOME/leader-app/` or `~/.local/share/leader-app/` | `/home/nobuo/.local/share/leader-app/` |

### 2.2 アプリ名

ディレクトリ名: `leader-app`

### 2.3 ディレクトリ構成

```
<user-data-dir>/leader-app/
├── leader-app.db        # メインDBファイル
├── leader-app.db-wal    # WALファイル（SQLite自動生成）
└── leader-app.db-shm    # 共有メモリファイル（SQLite自動生成）
```

### 2.4 パス解決ロジック

優先順位（高い方が優先）:

1. **環境変数 `DB_PATH`** が設定されている場合 → そのパスを使用（開発・テスト用）
2. **OSのユーザーデータディレクトリ** → `<user-data-dir>/leader-app/leader-app.db`

```typescript
function resolveDataDir(appName: string): string {
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
      const xdgDataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
      return path.join(xdgDataHome, appName);
    }
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

function resolveDbPath(): string {
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
  }
  const dataDir = resolveDataDir('leader-app');
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'leader-app.db');
}
```

### 2.5 配置場所

`src/infrastructure/config/data-dir.ts` に新規作成する。

---

## 3. スキーママイグレーション強化

### 3.1 現状の仕組み

- `schema_migrations` テーブルでバージョン追跡（forward-only）
- 5つのマイグレーション (001〜005) が存在
- ロールバック機能なし

### 3.2 改善方針

既存の `schema_migrations` テーブルによるバージョン管理を維持しつつ、各マイグレーションに `down` 関数を追加する。

### 3.3 マイグレーション定義の型

```typescript
export interface Migration {
  version: number;
  description: string;
  up: (db: AppDatabase) => void;
  down: (db: AppDatabase) => void;
}
```

### 3.4 既存マイグレーションの down 定義

| Version | Up (既存) | Down (新規) |
|---------|-----------|-------------|
| 001 | CREATE TABLE members | DROP TABLE members |
| 002 | CREATE TABLE schedules + indexes | DROP TABLE schedules |
| 003 | CREATE TABLE assignments + index | DROP TABLE assignments |
| 004 | ALTER TABLE schedules ADD is_event | テーブル再作成（SQLiteはALTER TABLE DROP COLUMNを未サポートのバージョンがあるため） |
| 005 | ALTER TABLE schedules ADD is_split_class | テーブル再作成（同上） |

### 3.5 SQLiteのALTER TABLE DROP COLUMN制約

SQLite 3.35.0+ は `ALTER TABLE DROP COLUMN` をサポートするが、古いバージョンとの互換性のために、カラム削除を伴うdownマイグレーションではテーブル再作成パターンを使用する:

```sql
-- 1. 新テーブル作成（削除対象カラムなし）
CREATE TABLE schedules_new (...);
-- 2. データコピー
INSERT INTO schedules_new SELECT id, date, ... FROM schedules;
-- 3. 旧テーブル削除
DROP TABLE schedules;
-- 4. リネーム
ALTER TABLE schedules_new RENAME TO schedules;
-- 5. インデックス再作成
CREATE INDEX ...;
```

### 3.6 ロールバック実行フロー

```typescript
function rollbackMigration(db: AppDatabase, targetVersion: number): void {
  const currentVersions = getAppliedVersions(db);
  const maxVersion = Math.max(...currentVersions);

  if (targetVersion >= maxVersion) {
    return; // すでに目標バージョン以下
  }

  // 高いバージョンから順にロールバック
  for (let v = maxVersion; v > targetVersion; v--) {
    if (!currentVersions.has(v)) continue;
    db.transaction(() => {
      migrations[v - 1].down(db);
      db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(v);
    })();
  }
}
```

### 3.7 ロールバックの実行方法

ロールバックは通常のアプリ起動では実行しない。以下の方法でのみ実行可能:

- **環境変数**: `DB_MIGRATE_TARGET=3` のように指定して起動すると、バージョン3までロールバック
- **CLIフラグ**（将来拡張）: `--migrate-target 3`

### 3.8 バージョンアップ時のフロー

```
アプリ起動
  ├── DBファイルが存在しない場合
  │     └── 新規作成 → 全マイグレーション実行
  ├── DBファイルが存在する場合
  │     ├── schema_migrations を確認
  │     ├── 未適用のマイグレーションがある場合
  │     │     └── forward マイグレーション実行
  │     └── すべて適用済み
  │           └── 何もしない
  └── DB_MIGRATE_TARGET が設定されている場合
        └── 指定バージョンまでロールバック
```

---

## 4. ユースケース

### 4.1 正常系

| # | ユースケース | 期待動作 |
|---|-------------|---------|
| 1 | 初回起動（macOS） | `~/Library/Application Support/leader-app/leader-app.db` を作成、全マイグレーション実行 |
| 2 | 初回起動（Windows） | `%LOCALAPPDATA%\leader-app\leader-app.db` を作成、全マイグレーション実行 |
| 3 | アプリバージョンアップ後の起動 | 既存DBを検出、未適用マイグレーションのみ実行 |
| 4 | DB_PATH指定での起動 | 指定パスのDBを使用（テスト・開発用） |
| 5 | ロールバック実行 | `DB_MIGRATE_TARGET=N` で指定バージョンまで戻す |

### 4.2 異常系

| # | ユースケース | 期待動作 |
|---|-------------|---------|
| 1 | データディレクトリの作成権限がない | エラーメッセージを表示して終了 |
| 2 | DBファイルが破損している | SQLiteのエラーをキャッチし、ユーザーに通知 |
| 3 | マイグレーション中にエラー | トランザクションロールバック、部分適用なし |
| 4 | 未来のバージョンのDBを開いた（ダウングレード） | 警告メッセージを表示して起動（データは維持） |

---

## 5. 既存DBからの移行

### 5.1 初回移行フロー

旧パス（実行ディレクトリ直下）にDBが存在し、新パス（ユーザーデータディレクトリ）にDBが存在しない場合:

1. 旧パスのDBを新パスにコピー（移動ではなくコピーで安全に）
2. コンソールに移行完了メッセージを表示
3. 旧パスのDBファイルはそのまま残す（ユーザーが手動で削除）

```
[leader-app] データベースをユーザーデータディレクトリに移行しました:
  旧: ./leader-app.db
  新: ~/Library/Application Support/leader-app/leader-app.db
  ※ 旧ファイルは手動で削除できます
```

### 5.2 移行判定ロジック

```typescript
function migrateIfNeeded(newDbPath: string): void {
  const oldDbPath = path.join(process.cwd(), 'leader-app.db');

  if (fs.existsSync(oldDbPath) && !fs.existsSync(newDbPath)) {
    fs.mkdirSync(path.dirname(newDbPath), { recursive: true });
    fs.copyFileSync(oldDbPath, newDbPath);
    // WAL/SHMファイルもコピー
    for (const ext of ['-wal', '-shm']) {
      const src = oldDbPath + ext;
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, newDbPath + ext);
      }
    }
    console.log(`[leader-app] データベースを移行しました: ${oldDbPath} → ${newDbPath}`);
  }
}
```

---

## 6. ドメインモデル（DDD観点）

### 6.1 新規コンポーネント

| レイヤー | ファイル | 責務 |
|---------|---------|------|
| Infrastructure/Config | `data-dir.ts` | OS別データディレクトリ解決 |
| Infrastructure/Persistence | `migrations/index.ts` | マイグレーションオーケストレータ（改修） |
| Infrastructure/Persistence | `database.ts` | DB作成ファクトリ（改修） |

### 6.2 影響範囲

- `src/infrastructure/config/data-dir.ts` — **新規作成**
- `src/infrastructure/persistence/database.ts` — DBパス解決ロジックの変更
- `src/infrastructure/persistence/migrations/index.ts` — ロールバック機能追加、Migration型導入
- `src/infrastructure/persistence/migrations/001〜005` — down関数追加
- `src/main.ts` — `createDatabase()` 呼び出しの変更
- `src/main-bun.ts` — DBパス解決ロジックの変更

---

## 7. 制約・ビジネスルール

1. **環境変数 `DB_PATH` は常に最優先** — 開発・テスト・E2Eで使用するため
2. **ディレクトリ自動作成** — ユーザーデータディレクトリが存在しない場合は `mkdirSync({ recursive: true })` で作成
3. **既存DBの自動移行はコピー** — 移動ではなくコピーとし、旧ファイルは残す（安全策）
4. **マイグレーションはトランザクション内** — 失敗時に中間状態を残さない
5. **ロールバックは明示的操作のみ** — 通常起動時にはロールバックしない
6. **外部パッケージは追加しない** — `os.homedir()` と `process.platform` で十分対応可能
7. **Bun/Node.js両対応** — `process.platform` と `process.env` は両ランタイムで動作する

---

## 8. 受け入れ基準（テスト観点）

### 8.1 ユニットテスト

- [ ] `resolveDataDir()` がmacOSで `~/Library/Application Support/leader-app/` を返す
- [ ] `resolveDataDir()` がWindowsで `%LOCALAPPDATA%\leader-app\` を返す（`process.platform` をモックして検証）
- [ ] `resolveDataDir()` がLinuxで `~/.local/share/leader-app/` を返す
- [ ] `resolveDataDir()` がLinuxで `$XDG_DATA_HOME` 設定時にそれを優先する
- [ ] `DB_PATH` 環境変数が設定されている場合、その値が使われる
- [ ] `DB_PATH` 未設定の場合、OSのユーザーデータディレクトリが使われる
- [ ] 各マイグレーション (001〜005) の `down` 関数がエラーなく実行できる
- [ ] `down` → `up` の往復でデータ構造が復元される
- [ ] ロールバック後に `schema_migrations` から該当バージョンが削除される

### 8.2 インテグレーションテスト

- [ ] 空状態から全マイグレーション実行後、テーブルとインデックスが正しく作成される
- [ ] バージョン3までロールバック後、assignments/schedules関連のテーブルが再作成可能
- [ ] 旧パスDBからの自動移行が正しく動作する（コピー・WAL/SHMファイル含む）
- [ ] 旧パスDB移行後、旧ファイルが残っている

### 8.3 E2Eテスト

- [ ] アプリ起動時にユーザーデータディレクトリにDBが作成される（DB_PATH未指定時）
- [ ] 既存テストがDB_PATH指定で引き続き動作する
