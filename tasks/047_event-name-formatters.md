# タスク047: イベント名 — LINE・CSVフォーマッター

## 概要
LINE用テキストとCSV出力にイベント名を表示する。言語に応じた名前の選択とフォールバックロジックを実装。

## 対象ファイル
- `src/domain/services/line-message-formatter.ts`
- `src/domain/services/csv-formatter.ts`
- `tests/domain/line-message-formatter.test.ts`
- `tests/domain/csv-formatter.test.ts`

## 実装手順
1. ヘルパー関数 `getEventLabel(schedule, lang)` を作成:
   - `isEvent=false` → `null`（表示なし）
   - `isEvent=true` → lang対応名 ?? 他言語名 ?? デフォルト（`🎉 イベント日` / `🎉 Event Day`）
2. `line-message-formatter.ts`: 日付ラベル生成部分で `getEventLabel` を呼び、タグがあれば dateLabel に追加
3. `csv-formatter.ts`: 「イベント日」列で `getEventLabel` のロジックを使用（lang対応名 ?? 他言語名 ?? `TRUE`）
4. テスト追加（仕様書 7-17）

## 依存タスク
- タスク045（Schedule エンティティにイベント名プロパティ必要）

## テスト方針
- LINE: 7件（JA名あり、EN名あり、JAフォールバック、ENフォールバック、両方null(ja/en)、isEvent=false）
- CSV: 4件（JA名、EN名、名前なしTRUE、isEvent=false空文字）

## 完了条件
- LINE出力にイベント名が表示される（フォールバック含む）
- CSV出力にイベント名が表示される
- フォーマッターテスト11件が通る

## ステータス
- [x] 完了
