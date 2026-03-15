# 004: テストの作成

## タスク概要
データディレクトリ解決とマイグレーションロールバックのユニットテスト・インテグレーションテストを作成する。

## 対象ファイル
- `tests/infrastructure/config/data-dir.test.ts` — **新規作成**
- `tests/infrastructure/persistence/migrations.test.ts` — **新規作成** or 既存追加

## 依存タスク
- 001, 002, 003（全実装完了後）

## 実装手順

### Step 1: `data-dir.test.ts` ユニットテスト

```typescript
describe('resolveDataDir', () => {
  it('macOSで ~/Library/Application Support/leader-app/ を返す');
  it('Windowsで %LOCALAPPDATA%/leader-app/ を返す');
  it('Linuxで ~/.local/share/leader-app/ を返す');
  it('Linuxで XDG_DATA_HOME が設定されていればそれを優先する');
  it('未対応OSでエラーをthrowする');
});

describe('resolveDbPath', () => {
  it('DB_PATH が設定されていればその値を返す');
  it('DB_PATH が未設定ならユーザーデータディレクトリのパスを返す');
  it('ディレクトリが存在しなければ作成する');
});

describe('migrateOldDbIfNeeded', () => {
  it('旧パスにDBがあり新パスにない場合、コピーする');
  it('WAL/SHMファイルも一緒にコピーする');
  it('旧パスのファイルは残す（非破壊）');
  it('新パスに既にDBがある場合、何もしない');
  it('旧パスにDBがない場合、何もしない');
});
```

`process.platform` のモック方法:
```typescript
vi.stubGlobal('process', { ...process, platform: 'darwin' });
```

### Step 2: `migrations.test.ts` マイグレーションテスト

```typescript
describe('Migration up/down roundtrip', () => {
  it('001: members テーブルを作成・削除・再作成できる');
  it('002: schedules テーブルを作成・削除・再作成できる');
  it('003: assignments テーブルを作成・削除・再作成できる');
  it('004: is_event カラムを追加・除去・再追加できる');
  it('005: is_split_class カラムを追加・除去・再追加できる');
});

describe('rollbackMigrations', () => {
  it('指定バージョンまでロールバックする');
  it('schema_migrations からロールバック済みバージョンが削除される');
  it('ロールバック後に再度 runMigrations で復元できる');
});

describe('handleMigrateTarget', () => {
  it('DB_MIGRATE_TARGET=3 でバージョン3までロールバック');
  it('無効な値でエラーをthrow');
});
```

インメモリSQLite (`:memory:`) を使用してテスト。

### Step 3: 既存テストの動作確認

- 既存のユニットテスト・インテグレーションテスト・E2Eテストが壊れていないことを確認
- `npm run test` で全テスト通過を確認

## テスト方針
- ユニットテスト: `process.platform` / `process.env` のモックで全OS分岐をカバー
- インテグレーションテスト: インメモリDBで実際のマイグレーション up/down を実行
- ファイル操作テスト: tmpディレクトリを使った実ファイルコピー検証

## 完了条件
- [ ] `data-dir.test.ts` の全テストケースが通る
- [ ] `migrations.test.ts` の全テストケースが通る
- [ ] 既存テスト (`npm run test`) が全て通る
- [ ] `npm run test:e2e` が通る（DB_PATH指定で既存動作を維持）
