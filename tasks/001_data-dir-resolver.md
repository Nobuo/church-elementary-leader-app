# 001: データディレクトリ解決モジュールの作成

## タスク概要
OS別のユーザーデータディレクトリを解決する `data-dir.ts` を新規作成し、DBパスの解決ロジックを実装する。

## 対象ファイル
- `src/infrastructure/config/data-dir.ts` — **新規作成**

## 依存タスク
なし（最初に着手）

## 実装手順

### Step 1: `src/infrastructure/config/data-dir.ts` を作成

以下の関数をexportする:

1. **`resolveDataDir(appName: string): string`**
   - `process.platform` で分岐
   - macOS: `~/Library/Application Support/<appName>/`
   - Windows: `%LOCALAPPDATA%/<appName>/`
   - Linux: `$XDG_DATA_HOME/<appName>/` (未設定時 `~/.local/share/<appName>/`)
   - 未対応OSは `Error` をthrow

2. **`resolveDbPath(): string`**
   - `process.env.DB_PATH` があればそのまま返す
   - なければ `resolveDataDir('leader-app')` + `leader-app.db`
   - ディレクトリが存在しなければ `mkdirSync({ recursive: true })` で作成

3. **`migrateOldDbIfNeeded(newDbPath: string): void`**
   - `process.cwd()` 直下の `leader-app.db` が存在し、`newDbPath` が存在しない場合
   - DBファイル + WAL/SHMファイルをコピー
   - コンソールに移行メッセージを表示

### Step 2: アプリ名定数

```typescript
const APP_NAME = 'leader-app';
const DB_FILENAME = 'leader-app.db';
```

## テスト方針
- `resolveDataDir()` のOS別パス解決をユニットテスト
- `process.platform` と `process.env` をモック/スタブして各OS分岐をテスト
- `migrateOldDbIfNeeded()` はtmpディレクトリでの実ファイルコピーテスト

## 完了条件
- [ ] `resolveDataDir()` が macOS/Windows/Linux で正しいパスを返す
- [ ] `resolveDbPath()` が `DB_PATH` 優先で動作する
- [ ] `migrateOldDbIfNeeded()` がコピーと非破壊を保証する
- [ ] ユニットテストが通る
