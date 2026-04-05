# タスク 056: フロントエンド — 「外す」ボタンと空きスロット UI

## 概要
割り当て結果画面に「外す」ボタンと空きスロット表示・「割り当て」ボタンを追加する。

## 対象ファイル
- `public/js/assignments.js`（変更）
- `public/css/style.css`（変更）

## 実装手順

### 1. renderAssignments の変更

#### 「外す」ボタン追加
既存の差し替えボタンの横に「外す」ボタンを追加:
```javascript
` <button class="unassign-btn" data-action="unassign" 
    data-assignment-id="${g.id}" data-member-id="${m.id}" 
    data-date="${date}">${t('unassign')}</button>`;
```

#### 空きスロット表示
`g.vacantSlots > 0` の場合、メンバーリストの末尾に空きスロットを表示:
```javascript
if (g.vacantSlots > 0) {
  for (let i = 0; i < g.vacantSlots; i++) {
    // 「--- [割り当て]」を表示
  }
}
```

#### 「割り当て」ボタン
空きスロットの横に「割り当て」ボタンを追加:
```javascript
`<span class="vacant-slot">${t('vacant')} 
  <button class="assign-btn" data-action="start-assign" 
    data-assignment-id="${g.id}" data-date="${date}" 
    data-assigned='${JSON.stringify([...assignedOnDate])}'
    data-role="${g.gradeGroup || ''}">${t('assign')}</button>
</span>`
```

### 2. イベントハンドラ追加

#### unassign アクション
```javascript
if (action === 'unassign') doUnassign(btn.dataset.assignmentId, btn.dataset.memberId, btn.dataset.date);
```

`doUnassign` 関数:
1. 過去日なら `pastAssignmentWarning` 確認
2. `unassignConfirm` 確認ダイアログ
3. `API.put(/api/assignments/${id}/unassign, { memberId })` 呼び出し
4. `loadAssignments()` で再読み込み

#### start-assign アクション
既存の `startReplace` と同様のフローで候補ドロップダウンを表示。
`doAssign` 関数で `API.put(/api/assignments/${id}/assign, { memberId })` を呼び出す。

### 3. CSS

```css
.unassign-btn {
  /* replace-btn と同様のスタイル */
}
.assign-btn {
  /* replace-btn と同様のスタイル */
}
.vacant-slot {
  color: #999;
  font-style: italic;
}
```

## 依存タスク
- タスク053（API エンドポイント）
- タスク054（i18n キー）

## テスト方針
- ブラウザで手動テスト:
  - メンバーの横に「外す」ボタンが表示される
  - クリック→確認→解除後に「---」と「割り当て」ボタンが表示される
  - 「割り当て」で候補ドロップダウンが表示される
  - 選択→確定でメンバーが割り当てられる
  - 担当回数が正しく更新される

## 完了条件
- [x] 「外す」ボタンが全メンバーの横に表示される
- [x] 確認ダイアログが表示される
- [x] 解除後に空きスロットが「---」で表示される
- [x] 空きスロットに「割り当て」ボタンが表示される
- [x] 「割り当て」で候補ドロップダウンが動作する
- [x] 過去日で警告が表示される
- [x] 日本語・英語切り替えが正しく動作する
