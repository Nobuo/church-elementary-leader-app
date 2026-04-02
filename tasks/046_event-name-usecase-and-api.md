# タスク046: イベント名 — ユースケース・API

## 概要
`setEventName` ユースケースを追加し、`PUT /api/schedules/:id/event-name` エンドポイントを実装。ScheduleDto にイベント名フィールドを追加。

## 対象ファイル
- `src/application/use-cases/generate-monthly-schedule.ts`（ScheduleDto, toScheduleDto, setEventName関数追加）
- `src/presentation/controllers/schedule-controller.ts`（PUT エンドポイント追加）
- `tests/integration/schedule-api.test.ts`

## 実装手順
1. `ScheduleDto` に `eventNameJa`, `eventNameEn` 追加
2. `toScheduleDto()` にマッピング追加
3. `setEventName()` ユースケース関数を追加（空文字→null変換、100文字バリデーション）
4. `schedule-controller.ts` に `PUT /:id/event-name` エンドポイント追加
5. インテグレーションテスト追加（仕様書 18-23）

## 依存タスク
- タスク045

## テスト方針
- 仕様書の受け入れ基準 18-23
  - 両方保存、片方だけ、空文字→null、GETレスポンス確認、400エラー2種

## 完了条件
- `PUT /api/schedules/:id/event-name` が動作する
- ScheduleDto にイベント名が含まれる
- インテグレーションテストが通る

## ステータス
- [x] 完了
