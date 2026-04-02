# タスク048: イベント名 — フロントエンドUI

## 概要
スケジュール設定画面にイベント名入力欄を追加し、割り当て結果画面のイベントタグをイベント名付きに変更する。

## 対象ファイル
- `public/js/schedules.js`（入力欄追加、blur/Enter で API 呼び出し）
- `public/js/assignments.js`（イベントタグにイベント名表示）
- `public/js/i18n.js`（i18nキー追加）
- `public/css/style.css`（入力欄スタイル）

## 実装手順
1. `i18n.js` に追加キー: `eventNamePlaceholderJa`, `eventNamePlaceholderEn`
2. `schedules.js` のカードレンダリング:
   - `isEvent=true` の場合、カード内に2つの input を表示
   - 各 input に `data-schedule-id`, `data-field`（ja/en）属性を付与
   - 初期値はスケジュールの `eventNameJa` / `eventNameEn`
3. イベントデリゲーション: blur / Enter で `saveEventName(id)` を呼ぶ
4. `saveEventName()`: カード内の2つの input の値を取得し、`PUT /api/schedules/:id/event-name` に送信
5. `assignments.js`: イベントタグ表示を更新
   - `scheduleMap[date]?.eventNameJa` / `eventNameEn` を `currentLang` に応じて使用
   - フォールバック: 対応言語なし → 他言語 → デフォルト `t('eventDay')`
6. CSS: イベント名入力欄のスタイル追加（小さめ、カード内に収まるように）

## 依存タスク
- タスク046（API エンドポイント必要）

## テスト方針
- E2E的な動作確認（手動テスト対象）
- 既存のインテグレーションテストが引き続きパス

## 完了条件
- スケジュール設定画面でイベント名入力ができる
- 割り当て結果画面にイベント名が表示される
- 全テストがパスする

## ステータス
- [x] 完了
