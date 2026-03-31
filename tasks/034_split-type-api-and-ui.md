# タスク 034: splitType API エンドポイント・スケジュールUI ✅ 完了

## タスク概要
分級タイプを設定するAPIエンドポイントを追加し、スケジュール設定画面に分級タイプ選択UIを追加する。

## 依存タスク
- 033（splitType ドメイン・マイグレーション）

## 対象ファイル
- `src/application/use-cases/generate-monthly-schedule.ts`
- `src/presentation/controllers/schedule-controller.ts`
- `src/presentation/i18n/ja.ts`
- `src/presentation/i18n/en.ts`
- `public/js/schedules.js`
- `public/js/i18n.js`

## 実装手順

### 1. ユースケース追加
- `generate-monthly-schedule.ts` に `setSplitType(scheduleId, splitType, repo)` 関数を追加

### 2. APIエンドポイント追加
- `schedule-controller.ts` に `POST /schedules/:id/split-type` を追加
- リクエストボディ: `{ "splitType": "standard" | "senior_discussion" }`
- バリデーション: `isSplitClass=true` の場合のみ受け付ける

### 3. i18n追加
- `ja.ts` / `en.ts` に分級タイプのラベルを追加:
  - `splitTypeStandard`: 「1~3年 / 4~6年」 / "Grades 1-3 / 4-6"
  - `splitTypeSeniorDiscussion`: 「1~4年 / 5~6年」 / "Grades 1-4 / 5-6"

### 4. フロントエンドUI
- `schedules.js` の `renderSchedules` を修正:
  - 分級ボタンの横に分級タイプ選択ドロップダウンを追加
  - 分級OFFの場合はドロップダウンを非表示/disabled
  - 選択変更時に `POST /api/schedules/:id/split-type` を呼ぶ
- `i18n.js` に翻訳キーを追加

### 5. レスポンスに splitType を含める
- スケジュール一覧APIのレスポンスに `splitType` フィールドを追加

## テスト方針
- APIエンドポイントのユニットテスト: 正常系・異常系（分級OFFの場合の拒否）
- UIは手動確認

## 完了条件
- [ ] `POST /schedules/:id/split-type` が動作する
- [ ] 分級ON時にドロップダウンで分級タイプを選択できる
- [ ] 分級OFF時にドロップダウンが非表示になる
- [ ] 選択した分級タイプがDBに保存される
