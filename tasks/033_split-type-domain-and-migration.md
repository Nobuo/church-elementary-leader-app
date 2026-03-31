# タスク 033: splitType ドメイン・マイグレーション追加 ✅ 完了

## タスク概要
Schedule エンティティに `splitType` プロパティを追加し、DBマイグレーションで `split_type` カラムを追加する。

## 依存タスク
なし（最初に着手）

## 対象ファイル
- `src/domain/entities/schedule.ts`
- `src/infrastructure/persistence/migrations/008-schedule-split-type.ts`
- `src/infrastructure/persistence/migrations/index.ts`
- `src/infrastructure/persistence/sqlite-schedule-repository.ts`

## 実装手順

### 1. SplitType 値オブジェクトの定義
- `src/domain/entities/schedule.ts` に `SplitType` 型を追加
  ```typescript
  export type SplitType = 'standard' | 'senior_discussion';
  ```

### 2. Schedule エンティティの拡張
- `ScheduleProps` に `splitType: SplitType | null` を追加
- `Schedule` クラスに `splitType` プロパティ追加
- `setSplitType(type: SplitType | null): Schedule` メソッド追加
- `create()` で `splitType: null` を初期値に設定
- `toggleSplitClass()` で分級OFFにした時に `splitType` も `null` にリセット
- 有効な `splitType` 値を取得するゲッター `effectiveSplitType` を追加（`null` → `'standard'` フォールバック）

### 3. マイグレーション作成
- `008-schedule-split-type.ts` を作成
  ```sql
  ALTER TABLE schedules ADD COLUMN split_type TEXT DEFAULT NULL;
  ```
- `index.ts` に `migration008` を追加

### 4. リポジトリ更新
- `ScheduleRow` に `split_type: string | null` を追加
- `rowToSchedule` で `split_type` → `splitType` のマッピング追加
- `save()` の INSERT 文に `split_type` カラム追加

## テスト方針
- Schedule エンティティのテスト: `setSplitType` メソッドの動作確認
- `toggleSplitClass` で分級OFFにすると `splitType` が `null` になることを確認
- `effectiveSplitType` が `null` → `'standard'` にフォールバックすることを確認

## 完了条件
- [ ] `SplitType` 型が定義されている
- [ ] Schedule に `splitType` プロパティがある
- [ ] `setSplitType()` メソッドが動作する
- [ ] マイグレーション `008` が作成されている
- [ ] リポジトリが `split_type` を読み書きできる
- [ ] 既存データ（`split_type=NULL`）でエラーにならない
