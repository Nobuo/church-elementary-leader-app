# 002: マイグレーション型の導入と down 関数の追加

## タスク概要
`Migration` 型を定義し、既存マイグレーション (001〜005) に `down` 関数を追加する。

## 対象ファイル
- `src/infrastructure/persistence/migrations/index.ts` — Migration型定義、runMigrations改修
- `src/infrastructure/persistence/migrations/001-initial-schema.ts` — down追加
- `src/infrastructure/persistence/migrations/002-schedules.ts` — down追加
- `src/infrastructure/persistence/migrations/003-assignments.ts` — down追加
- `src/infrastructure/persistence/migrations/004-schedule-events.ts` — down追加
- `src/infrastructure/persistence/migrations/005-schedule-split-class.ts` — down追加

## 依存タスク
なし（001と並行可能）

## 実装手順

### Step 1: Migration型を定義

`migrations/index.ts` に以下の型を追加:

```typescript
export interface Migration {
  version: number;
  description: string;
  up: (db: AppDatabase) => void;
  down: (db: AppDatabase) => void;
}
```

### Step 2: 既存マイグレーションを Migration 型に変換

各マイグレーションファイルのexportを `migration001` 関数から `Migration` オブジェクトに変更:

```typescript
// Before
export function migration001(db: AppDatabase): void { ... }

// After
export const migration001: Migration = {
  version: 1,
  description: 'Create members table',
  up(db) { ... },
  down(db) { db.exec('DROP TABLE IF EXISTS members'); },
};
```

### Step 3: 各マイグレーションの down 実装

| Version | down の内容 |
|---------|------------|
| 001 | `DROP TABLE IF EXISTS members` |
| 002 | `DROP INDEX IF EXISTS idx_schedules_year; DROP INDEX IF EXISTS idx_schedules_date; DROP TABLE IF EXISTS schedules;` |
| 003 | `DROP INDEX IF EXISTS idx_assignments_schedule; DROP TABLE IF EXISTS assignments;` |
| 004 | テーブル再作成パターン（is_eventカラムを除去） |
| 005 | テーブル再作成パターン（is_split_classカラムを除去） |

004, 005の down ではSQLiteの制約上、テーブル再作成パターンを使用:
```sql
CREATE TABLE schedules_backup AS SELECT id, date, is_excluded, year FROM schedules;
DROP TABLE schedules;
CREATE TABLE schedules (... /* is_eventなし */);
INSERT INTO schedules SELECT * FROM schedules_backup;
DROP TABLE schedules_backup;
-- インデックス再作成
```

### Step 4: `runMigrations()` を Migration 型対応に更新

`migrations` 配列を `Migration[]` に変更し、`migrations[i](db)` → `migrations[i].up(db)` に修正。

### Step 5: `rollbackMigrations()` を追加

```typescript
export function rollbackMigrations(db: AppDatabase, targetVersion: number): void
```
- 現在の適用済みバージョンを取得
- `targetVersion` より大きいバージョンを降順で `down` 実行
- 各ロールバックはトランザクション内

## テスト方針
- 各マイグレーションの `up` → `down` → `up` の往復テスト
- `rollbackMigrations()` でバージョン指定ロールバック
- ロールバック後の `schema_migrations` テーブルの状態確認

## 完了条件
- [x] 全マイグレーションに `down` 関数が実装されている
- [x] `runMigrations()` が従来通り動作する（後方互換）
- [x] `rollbackMigrations()` が指定バージョンまでロールバックできる
- [x] `up` → `down` → `up` の往復でテーブル構造が正しく復元される
- [x] ユニットテストが通る
