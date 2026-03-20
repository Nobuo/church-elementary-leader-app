# タスク 010: 手動差し替え時の担当区分チェック ✅ 完了

## 概要

手動差し替え（adjustAssignment）に担当区分チェックを追加し、candidates APIで担当区分によるフィルタリングを実装する。

## 仕様書

`specs/grade-group-display-and-crossover.md` — ビジネスルール R4 / UC5, UC6

## 依存タスク

- タスク 008（ViolationType、AssignmentDto）
- タスク 009（区分横断の概念）

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/application/use-cases/generate-assignments.ts` | `adjustAssignment()` に GRADE_GROUP_MISMATCH チェック追加 |
| `src/presentation/controllers/assignment-controller.ts` | candidates API に `role` パラメータ追加、区分フィルタリング |

## 実装手順

### Step 1: adjustAssignment() に区分チェック追加

`src/application/use-cases/generate-assignments.ts` の `adjustAssignment()` 関数内、差し替え実行後の制約チェックセクションに追加:

```typescript
// Grade group mismatch check
const roleIndex = updated.memberIds.indexOf(newMemberId);
const expectedGrade = roleIndex === 0 ? GradeGroup.UPPER : GradeGroup.LOWER;
if (newMember.gradeGroup !== expectedGrade) {
  violations.push({
    type: ViolationType.GRADE_GROUP_MISMATCH,
    severity: Severity.WARNING,
    memberIds: [newMemberId],
    message: `${newMember.name} is ${newMember.gradeGroup} but assigned to ${expectedGrade} slot`,
    messageKey: 'violations.gradeGroupMismatch',
    messageParams: {
      name: newMember.name,
      registered: newMember.gradeGroup,
      assigned: expectedGrade,
    },
  });
}
```

### Step 2: candidates API に role パラメータ追加

`src/presentation/controllers/assignment-controller.ts` の candidates エンドポイント:

**クエリパラメータ追加:**
```typescript
const role = (req.query.role as string) || undefined; // 'UPPER' | 'LOWER'
```

**フィルタリングロジック追加（利用可能メンバーのフィルタ後）:**

```typescript
// Grade group filtering
if (role) {
  const isSplitClass = schedule?.isSplitClass ?? false;
  candidates = candidates.filter((m) => {
    // 同じ区分のメンバーは常に候補
    if (m.gradeGroup === role) return true;
    // 分級日かつBOTHメンバーは区分横断候補として含める
    if (isSplitClass && m.language === Language.BOTH) return true;
    // それ以外は除外
    return false;
  });
}
```

**候補レスポンスに `gradeGroup` と `isCrossover` を追加:**

```typescript
{
  id: m.id,
  name: m.name,
  count: ...,
  isRecommended: ...,
  warnings: [...],
  gradeGroup: m.gradeGroup,
  isCrossover: role ? m.gradeGroup !== role : false,
}
```

**区分横断候補への警告追加:**

分級日で区分横断候補（`isCrossover = true`）に `GRADE_GROUP_MISMATCH` 警告を付与:

```typescript
if (role && m.gradeGroup !== role) {
  warnings.push('gradeGroupMismatch');
}
```

### Step 3: フロントエンドの差し替えボタンに role 情報を付与

`public/js/assignments.js` の `renderAssignments()` で、差し替えボタンの `data-*` 属性に `role` を追加:

```javascript
const role = idx === 0 ? 'UPPER' : 'LOWER';
// ... data-role="${role}" を追加
```

`startReplace()` で candidates API 呼び出し時に `role` を送信:

```javascript
const role = btn.dataset.role;
const url = `/api/assignments/candidates?date=${date}&excludeIds=${excludeIds}&partnerId=${partnerId}&role=${role}`;
```

### Step 4: 型チェック

```bash
npm run typecheck
```

## テスト方針

### 単体テスト（adjustAssignment）

| # | テスト | 期待結果 |
|---|--------|----------|
| T7 | 同区分メンバーに差し替え | GRADE_GROUP_MISMATCH 違反なし |
| T8 | 異区分メンバーに差し替え | GRADE_GROUP_MISMATCH 警告あり |
| T9 | 分級日 + BOTHメンバーで区分横断差し替え | 警告あり（差し替え成功） |

### 結合テスト（API）

| # | テスト | 期待結果 |
|---|--------|----------|
| T11 | 通常日: candidates に role=UPPER → UPPERのみ | LOWERが含まれない |
| T12 | 分級日: candidates に role=LOWER → LOWER + UPPERのBOTH | isCrossover=true |
| T13 | 通常日: candidates に role=LOWER → LOWERのみ | UPPERのBOTHも含まれない |

## 完了条件

- [ ] adjustAssignment が区分不一致を GRADE_GROUP_MISMATCH 警告で返す
- [ ] candidates API が `role` パラメータで区分フィルタリングする
- [ ] 通常日: 同区分メンバーのみ候補に出る
- [ ] 分級日: 同区分 + 反対区分のBOTHが候補に出る
- [ ] フロントエンドの差し替えが `role` を送信する
- [ ] 既存テスト・新規テストが全パスする
