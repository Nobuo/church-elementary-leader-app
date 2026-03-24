# タスク026: フロントエンドのグラフ判定修正 & i18n ✅ 完了

## 概要

担当回数グラフの「多すぎ/少なすぎ」判定を、未割り当て週がある場合に抑制する。自動生成時の「全週割り当て済み」メッセージを表示する。翻訳キーを追加する。

## 対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `public/js/assignments.js` | `renderAssignmentCounts` 判定修正、`generateAssignmentsAction` メッセージ対応 |
| `public/index.html` | 未割り当て情報メッセージ用の要素追加 |
| `public/js/i18n.js` | 翻訳キー追加 |
| `src/presentation/i18n/ja.ts` | 翻訳キー追加 |
| `src/presentation/i18n/en.ts` | 翻訳キー追加 |

## 依存タスク

- タスク025（`unassignedWeeks` がAPIレスポンスに含まれている必要がある）

## 実装手順

### Step 1: i18n翻訳キーの追加

3ファイルに以下のキーを追加:

| キー | 日本語 | 英語 |
|------|--------|------|
| `allWeeksAssigned` | `すべての週にすでに割り当てがあります。クリアしてから再生成してください。` | `All weeks already have assignments. Clear some first to regenerate.` |
| `unassignedWeeksInfo` | `未割り当ての週が{count}件あります` | `{count} week(s) have no assignments yet` |

追加先:
- `public/js/i18n.js` — フロントエンドi18n辞書
- `src/presentation/i18n/ja.ts` — サーバーサイド日本語
- `src/presentation/i18n/en.ts` — サーバーサイド英語

### Step 2: `public/index.html` に情報メッセージ要素を追加

`assignment-counts-section` 内（counts-summaryの下、counts-listの上あたり）に:

```html
<div id="counts-info" class="counts-info" style="display:none"></div>
```

### Step 3: `renderAssignmentCounts` のグラフ判定を修正

`public/js/assignments.js` の `renderAssignmentCounts(data)` 関数内:

```javascript
// Step 3a: 未割り当て週メッセージの表示/非表示
const infoEl = document.getElementById('counts-info');
if (infoEl) {
  if (data.unassignedWeeks > 0) {
    infoEl.textContent = t('unassignedWeeksInfo').replace('{count}', data.unassignedWeeks);
    infoEl.style.display = 'block';
  } else {
    infoEl.style.display = 'none';
  }
}

// Step 3b: バー表示の判定を修正
// 現行:
if (avg > 0 && m.count > avg * 1.5) { ... too-many ... }
else if (avg > 0 && m.count < avg * 0.5 && m.count > 0) { ... too-few ... }

// 変更後: 未割り当て週がない場合のみ判定
if (data.unassignedWeeks === 0) {
  if (avg > 0 && m.count > avg * 1.5) { ... too-many ... }
  else if (avg > 0 && m.count < avg * 0.5 && m.count > 0) { ... too-few ... }
}
```

### Step 4: `generateAssignmentsAction` のメッセージ対応

`public/js/assignments.js` の `generateAssignmentsAction()` 関数内:

```javascript
// 生成結果の message をチェック
const result = await API.post('/api/assignments/generate', { year: calYear, month });
if (result.message === 'allWeeksAssigned') {
  alert(t('allWeeksAssigned'));
  return;
}
// 以降は既存のloadAssignments()呼び出し
```

### Step 5: CSSスタイル追加（任意）

`public/css/style.css` に `.counts-info` のスタイルを追加（情報メッセージの見た目）:

```css
.counts-info {
  color: #6b7280;
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
  padding: 0.25rem 0;
}
```

## テスト方針

- フロントエンドのテストは手動確認を主とする
- 以下のシナリオを手動で確認:
  1. 全週割り当て済み → グラフに「多すぎ/少なすぎ」が正しく表示される
  2. 1週クリア → グラフの赤い「多すぎ」が消える、「未割り当ての週が1件あります」表示
  3. 全週クリア → グラフが非表示（割り当てなし）
  4. 全週割り当て済みで自動生成 → 「すべての週に…」メッセージ表示
  5. 1週クリア後に自動生成 → クリアした週のみ生成、他は保持
- 統合テスト（`tests/integration/assignment-api.test.ts`）でcountsレスポンスの`unassignedWeeks`を検証

## 完了条件

- [ ] 未割り当て週がある場合、「多すぎ/少なすぎ」ラベルが表示されない
- [ ] 未割り当て週がある場合、情報メッセージが表示される
- [ ] 全週割り当て済みの場合、従来通りの判定が行われる
- [ ] 全週割り当て済みで自動生成するとメッセージが表示される
- [ ] 翻訳キーが日英両方に追加されている
- [ ] 既存テストが全て通る
