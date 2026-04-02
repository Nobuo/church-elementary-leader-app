# タスク045: イベント名 — ドメイン・マイグレーション・リポジトリ

## 概要
Schedule エンティティに `eventNameJa`, `eventNameEn` プロパティと `setEventName()` メソッドを追加。DBマイグレーション010で2カラム追加。リポジトリの読み書きを対応。

## 対象ファイル
- `src/domain/entities/schedule.ts`
- `src/infrastructure/persistence/migrations/010-event-name.ts`
- `src/infrastructure/persistence/migrations/index.ts`
- `src/infrastructure/persistence/sqlite-schedule-repository.ts`
- `tests/domain/schedule.test.ts`
- `tests/infrastructure/persistence/migrations.test.ts`

## 実装手順
1. `schedule.ts` の `ScheduleProps` に `eventNameJa: string | null`, `eventNameEn: string | null` 追加
2. コンストラクタ、`create()`（null初期化）、`reconstruct()` に反映
3. `setEventName(nameJa, nameEn)` メソッド追加（新インスタンス返却）
4. マイグレーション010を作成（ALTER TABLE × 2カラム、down は backup-restore）
5. `migrations/index.ts` に010を登録
6. `sqlite-schedule-repository.ts` の `ScheduleRow`, `rowToSchedule`, `save()` を更新
7. テスト: ドメインテスト6件 + マイグレーションラウンドトリップ1件
8. 既存テストの `Schedule.reconstruct()` 呼び出しに `eventNameJa: null, eventNameEn: null` を追加

## 依存タスク
- なし

## テスト方針
- 仕様書の受け入れ基準 1-6, 24

## 完了条件
- Schedule エンティティに2つのイベント名プロパティがある
- マイグレーション010が動作する
- リポジトリが読み書きできる
- ドメインテスト・マイグレーションテストが通る

## ステータス
- [x] 完了
