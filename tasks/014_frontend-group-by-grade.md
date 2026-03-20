# タスク 014: フロントエンドのグループ別学年表示

## 概要

フロントエンドの割り当て表示を「グループ1＝高学年、グループ2＝低学年」に対応させる。ラベル表示ロジックの変更、`crossoverNote`の削除、差し替え時の`role`決定方法の変更を行う。

## 仕様書

`specs/group-by-grade.md`

## 依存タスク

- タスク 013（DTOの`role`削除と`gradeGroup`追加）

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `public/js/assignments.js` | ラベル表示ロジック変更、crossoverNote削除、role決定変更 |
| `public/js/i18n.js` | `crossoverNote` キー削除 |
| `public/css/style.css` | `.crossover-note` スタイル削除 |

## 実装手順

### Step 1: assignments.js のラベル表示ロジック変更

`renderAssignments()` のメンバー表示部分（87-97行付近）を変更:

**変更前:**
```javascript
const role = idx === 0 ? 'UPPER' : 'LOWER';
const shortLabel = idx === 0 ? t('upperShort') : t('lowerShort');
const isCrossover = m.gradeGroup && m.role && m.gradeGroup !== m.role;
const crossoverClass = isCrossover ? ' crossover' : '';
const gradeForNote = m.gradeGroup === 'UPPER' ? t('upper') : t('lower');
const crossoverNote = isCrossover
  ? ` <span class="crossover-note">${t('crossoverNote').replace('{grade}', gradeForNote)}</span>`
  : '';
return `<span class="grade-label${crossoverClass}">[${shortLabel}]</span>` +
  `<span class="member-name" ...>${escapeHtml(m.name)}</span>${countStr}${crossoverNote}` +
  ` <button class="replace-btn" ... data-role="${role}">${t('replace')}</button>`;
```

**変更後:**
```javascript
const shortLabel = m.gradeGroup === 'UPPER' ? t('upperShort') : t('lowerShort');
const isCrossover = m.gradeGroup && g.gradeGroup && m.gradeGroup !== g.gradeGroup;
const crossoverClass = isCrossover ? ' crossover' : '';
return `<span class="grade-label${crossoverClass}">[${shortLabel}]</span>` +
  `<span class="member-name" ...>${escapeHtml(m.name)}</span>${countStr}` +
  ` <button class="replace-btn" ... data-role="${g.gradeGroup}">${t('replace')}</button>`;
```

主な変更:
- `shortLabel`: `idx` ベース → `m.gradeGroup` ベース
- `isCrossover`: `m.gradeGroup !== m.role` → `m.gradeGroup !== g.gradeGroup`
- `crossoverNote`: 完全削除
- `data-role`: `idx` ベース → `g.gradeGroup`（グループの区分）

### Step 2: i18n.js から crossoverNote を削除

**ja オブジェクト（109行付近）:**
```javascript
// 削除: crossoverNote: '※本来は{grade}',
```

**en オブジェクト（218行付近）:**
```javascript
// 削除: crossoverNote: '*registered as {grade}',
```

### Step 3: style.css から .crossover-note を削除

```css
/* 削除 */
.crossover-note {
  font-size: 0.75em;
  color: #e67e22;
  margin-left: 2px;
}
```

`.grade-label` と `.grade-label.crossover` は残す。

### Step 4: 動作確認

ブラウザで `http://localhost:3000` を開き:
1. 割り当て結果画面でグループ1に高学年メンバーのみ、グループ2に低学年メンバーのみ表示されること
2. 各メンバーに `[高]`/`[低]` ラベルが正しく表示されること
3. 分級日の横断ケースで低学年グループに `[高]` ラベルのメンバーが表示されること（オレンジ色）
4. 差し替えボタンが正しい `role` を送信すること

## テスト方針

### 結合テスト修正

`tests/integration/assignment-api.test.ts` のテスト:
- `role` フィールドのアサーションを削除
- `gradeGroup` のアサーション（グループレベル）を追加

## 完了条件

- [ ] ラベルがメンバーの `gradeGroup` に基づいて表示される
- [ ] `crossoverNote` が完全に削除されている
- [ ] 差し替え時の `role` がグループの `gradeGroup` から取得される
- [ ] 横断時にオレンジ色の `[高]` ラベルが低学年グループに表示される
- [ ] 既存テスト・新規テストが全パスする
