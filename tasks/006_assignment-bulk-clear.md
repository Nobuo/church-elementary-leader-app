# 006: 未来の月の割り当て一括クリア

## ステータス: 完了

## タスク概要

割り当て画面のツールバーに「月一括クリア」ボタンを追加し、未来月の割り当てを一括削除できるようにする。当月・過去月はクリア不可。バックエンドにも過去月防御を追加する。

## 仕様書

`specs/assignment-bulk-clear.md`

## 依存タスク

なし

## 対象ファイル

- `src/presentation/controllers/assignment-controller.ts` — `DELETE /` に当月・過去月チェック追加
- `public/index.html` — ツールバーにボタン追加
- `public/js/assignments.js` — ボタン表示制御・クリア処理
- `public/js/i18n.js` — 翻訳キー3件追加
- `src/presentation/i18n/ja.ts` — 翻訳キー3件追加
- `src/presentation/i18n/en.ts` — 翻訳キー3件追加
- `tests/integration/full-workflow.test.ts` — テスト追加

## 実装手順

### Step 1: バックエンド — `DELETE /` に過去月・当月チェック追加

`src/presentation/controllers/assignment-controller.ts` の `router.delete('/')` 内、バリデーション通過後・`deleteAssignments()` 呼び出し前に追加:

```typescript
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;
if (year < currentYear || (year === currentYear && month <= currentMonth)) {
  res.status(400).json({ error: 'Cannot clear current or past month assignments' });
  return;
}
```

### Step 2: テスト追加（テストファースト）

`tests/integration/full-workflow.test.ts` に以下のテストケースを追加:

1. **未来月の一括クリアが成功する**: 未来月のスケジュール・割り当てを作成 → `DELETE /api/assignments?year=YYYY&month=MM` → 200 OK、割り当てが0件になる
2. **当月の一括クリアが拒否される**: 当月の年月で `DELETE /api/assignments?year=YYYY&month=MM` → 400エラー
3. **過去月の一括クリアが拒否される**: 過去月の年月で `DELETE /api/assignments?year=YYYY&month=MM` → 400エラー

### Step 3: 翻訳キー追加

以下の3ファイルに翻訳キーを追加:

**`public/js/i18n.js`** — `assignments` セクション内:
- `clearMonth`: `月一括クリア` / `Clear All`
- `clearMonthConfirm`: `この月の割り当てを全てクリアしますか？` / `Clear all assignments for this month?`
- `cannotClearPastMonth`: `当月以前の割り当ては一括クリアできません` / `Cannot clear current or past month assignments`

**`src/presentation/i18n/ja.ts`** と **`src/presentation/i18n/en.ts`** — `assignments` セクション内に同じキーを追加。

### Step 4: HTML — ツールバーにボタン追加

`public/index.html` の `#page-assignments > .toolbar` 内、自動生成ボタンの後に追加:

```html
<button id="btn-clear-month" class="btn-danger" style="display:none">月一括クリア</button>
```

初期状態は `display:none`（JS側で表示制御するため）。

### Step 5: フロントエンド — ボタン表示制御・クリア処理

`public/js/assignments.js` に以下を追加:

1. **`updateClearMonthButton(assignments)`** 関数: 選択中の月が未来月かつ割り当てありの場合のみボタンを表示
2. **`clearMonthAssignments()`** 関数: `confirm()` → `API.del()` → `loadAssignments()`
3. **`loadAssignments()`** 内で `updateClearMonthButton()` を呼び出す
4. ボタンのイベントリスナー登録

### Step 6: 既存テスト確認

`npm test` で全テストが通ることを確認。

## テスト方針

- **結合テスト**: APIレベルで未来月クリア成功・当月拒否・過去月拒否を検証
- **回帰テスト**: 既存の日単位クリア (`DELETE /api/assignments/by-date`) が影響を受けないことを確認
- **フロントエンド**: 手動テストで表示制御・確認ダイアログ・クリア動作を確認

## 完了条件

- [ ] `DELETE /api/assignments` に当月・過去月チェックが追加されている
- [ ] ツールバーに「月一括クリア」ボタンが表示される（未来月のみ）
- [ ] ボタンクリックで確認ダイアログが表示される
- [ ] 確認後に月の全割り当てが削除され画面が更新される
- [ ] 翻訳キーが日英両方に追加されている
- [ ] 結合テストが追加されている
- [ ] 既存テストが全て通る
- [ ] タスクファイルのステータスが「完了」に更新されている
