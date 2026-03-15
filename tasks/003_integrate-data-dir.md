# 003: エントリポイントへのデータディレクトリ統合

## タスク概要
`main.ts` と `main-bun.ts` のDBパス解決ロジックを `data-dir.ts` に統合し、旧DBの自動移行を組み込む。

## 対象ファイル
- `src/infrastructure/persistence/database.ts` — `createDatabase()` の改修
- `src/main.ts` — DB初期化フロー変更
- `src/main-bun.ts` — DB初期化フロー変更

## 依存タスク
- 001（data-dir.ts）
- 002（Migration型）

## 実装手順

### Step 1: `database.ts` の改修

`createDatabase()` のデフォルトパスを `resolveDbPath()` に変更:

```typescript
import { resolveDbPath, migrateOldDbIfNeeded } from '@infrastructure/config/data-dir';

export function createDatabase(path?: string): AppDatabase {
  const dbPath = path ?? resolveDbPath();
  migrateOldDbIfNeeded(dbPath);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  handleMigrateTarget(db);  // DB_MIGRATE_TARGET対応
  return db;
}
```

### Step 2: `main.ts` の変更

変更は最小限。`createDatabase()` 引数なし呼び出しはそのまま。
起動ログにDBパスを表示:

```typescript
console.log(`Server running at http://localhost:${PORT}`);
console.log(`Database: ${dbPath}`);
```

### Step 3: `main-bun.ts` の変更

`resolveDbPath()` を使用するように変更:

```typescript
import { resolveDbPath, migrateOldDbIfNeeded } from '@infrastructure/config/data-dir';

const dbPath = resolveDbPath();
migrateOldDbIfNeeded(dbPath);
const db = new Database(dbPath) as unknown as AppDatabase;
```

### Step 4: `DB_MIGRATE_TARGET` 対応

`database.ts` または `migrations/index.ts` に以下のロジックを追加:

```typescript
function handleMigrateTarget(db: AppDatabase): void {
  const target = process.env.DB_MIGRATE_TARGET;
  if (target !== undefined) {
    const targetVersion = parseInt(target, 10);
    if (isNaN(targetVersion) || targetVersion < 0) {
      throw new Error(`Invalid DB_MIGRATE_TARGET: ${target}`);
    }
    rollbackMigrations(db, targetVersion);
  }
}
```

## テスト方針
- `DB_PATH` 設定時に指定パスが使われることを確認（既存テストの維持）
- `DB_MIGRATE_TARGET` 設定時にロールバックが実行されることをインテグレーションテストで確認
- 起動ログにDBパスが表示されることを確認

## 完了条件
- [x] `main.ts` がユーザーデータディレクトリのDBを使用する
- [x] `main-bun.ts` がユーザーデータディレクトリのDBを使用する
- [x] `DB_PATH` 環境変数による上書きが引き続き動作する
- [x] `DB_MIGRATE_TARGET` でロールバックが動作する
- [x] 起動ログにDBパスが表示される
- [x] 既存テスト（ユニット・インテグレーション・E2E）が通る
