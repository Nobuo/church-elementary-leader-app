# タスク 013: AssignmentDto変更とadjustAssignmentのgroupNumberベース判定

## 概要

AssignmentDtoから`role`を削除し、`gradeGroup`をグループレベルで追加する。`adjustAssignment`のGRADE_GROUP_MISMATCHチェックを位置ベースから`groupNumber`ベースに変更する。

## 仕様書

`specs/group-by-grade.md`

## 依存タスク

- タスク 012（アルゴリズム変更が先）

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/application/use-cases/generate-assignments.ts` | `AssignmentMemberDto`から`role`削除、`AssignmentDto`に`gradeGroup`追加、DTO生成3箇所変更、`adjustAssignment`の判定変更 |

## 実装手順

### Step 1: AssignmentMemberDto から role を削除

```typescript
export interface AssignmentMemberDto {
  id: string;
  name: string;
  gradeGroup: string;
  // role 削除
}
```

### Step 2: AssignmentDto に gradeGroup を追加

```typescript
export interface AssignmentDto {
  id: string;
  scheduleId: string;
  date: string;
  groupNumber: number;
  gradeGroup: string;  // 追加: 'UPPER' | 'LOWER'
  members: AssignmentMemberDto[];
}
```

### Step 3: DTO生成3箇所を更新

**generateMonthlyAssignments（約127行）:**

```typescript
{
  id: a.id,
  scheduleId: a.scheduleId,
  date: scheduleDateMap.get(a.scheduleId) ?? '',
  groupNumber: a.groupNumber,
  gradeGroup: a.groupNumber === 1 ? GradeGroup.UPPER : GradeGroup.LOWER,
  members: a.memberIds.map((mid) => ({
    id: mid,
    name: memberMap.get(mid)?.name ?? 'Unknown',
    gradeGroup: memberMap.get(mid)?.gradeGroup ?? GradeGroup.LOWER,
  })),
}
```

**adjustAssignment（約250行）:**

```typescript
{
  id: updated.id,
  scheduleId: updated.scheduleId,
  date,
  groupNumber: updated.groupNumber,
  gradeGroup: updated.groupNumber === 1 ? GradeGroup.UPPER : GradeGroup.LOWER,
  members: updated.memberIds.map((mid) => ({
    id: mid,
    name: memberLookup.get(mid)?.name ?? 'Unknown',
    gradeGroup: memberLookup.get(mid)?.gradeGroup ?? GradeGroup.LOWER,
  })),
}
```

**getAssignmentsForMonth（約299行）:**

```typescript
{
  id: a.id,
  scheduleId: a.scheduleId,
  date: scheduleDateMap.get(a.scheduleId) ?? '',
  groupNumber: a.groupNumber,
  gradeGroup: a.groupNumber === 1 ? GradeGroup.UPPER : GradeGroup.LOWER,
  members: a.memberIds.map((mid) => ({
    id: mid,
    name: memberMap.get(mid)?.name ?? 'Unknown',
    gradeGroup: memberMap.get(mid)?.gradeGroup ?? GradeGroup.LOWER,
  })),
}
```

### Step 4: adjustAssignment の GRADE_GROUP_MISMATCH チェック変更

```typescript
// 変更前
const roleIndex = updated.memberIds.indexOf(asMemberId(newMemberId));
const expectedGrade = roleIndex === 0 ? GradeGroup.UPPER : GradeGroup.LOWER;

// 変更後
const expectedGrade = updated.groupNumber === 1 ? GradeGroup.UPPER : GradeGroup.LOWER;
```

### Step 5: 型チェック

```bash
npm run typecheck
```

## テスト方針

### 既存テスト修正

`tests/application/adjust-assignment.test.ts` のテスト:
- `dto.members[0].role` / `dto.members[1].role` のアサーションを削除
- `gradeGroup` のアサーションに変更
- GRADE_GROUP_MISMATCH テストは `groupNumber` ベースに合わせる

### 新規テスト

| # | テスト | 期待結果 |
|---|--------|----------|
| T8 | 同区分メンバーに差し替え（groupNumber=1, UPPER）| 違反なし |
| T9 | 異区分メンバーに差し替え（groupNumber=2, UPPER）| GRADE_GROUP_MISMATCH 警告 |
| T10 | DTO に gradeGroup がグループレベルで含まれる | `dto.gradeGroup === 'UPPER'` or `'LOWER'` |

## 完了条件

- [ ] `AssignmentMemberDto` から `role` が削除されている
- [ ] `AssignmentDto` に `gradeGroup` が追加されている
- [ ] DTO生成3箇所すべてが更新されている
- [ ] `adjustAssignment` の判定が `groupNumber` ベース
- [ ] 既存テスト（修正後）が全パスする
- [ ] `npm run typecheck` が通る
