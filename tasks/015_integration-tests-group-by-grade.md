# タスク 015: 結合テスト更新とグループ別学年テスト追加

## 概要

タスク012〜014の変更に合わせて既存テストを修正し、グループ別学年構成を検証する結合テストを追加する。

## 仕様書

`specs/group-by-grade.md`

## 依存タスク

- タスク 012、013、014（すべての実装が完了後）

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `tests/domain/assignment-generator.test.ts` | 既存テスト修正、同区分ペア検証テスト追加 |
| `tests/application/adjust-assignment.test.ts` | `role` アサーション削除、`groupNumber` ベースのテスト追加 |
| `tests/integration/assignment-api.test.ts` | DTO `gradeGroup` 検証、グループ構成検証テスト追加 |

## 実装手順

### Step 1: assignment-generator.test.ts の修正

既存の横断テスト（T1-T6相当）のアサーションを修正:

**変更前**（例: `does not cross grade groups on normal days`）:
```typescript
const upper = members.find((m) => m.id === a.memberIds[0])!;
const lower = members.find((m) => m.id === a.memberIds[1])!;
expect(upper.gradeGroup).toBe(GradeGroup.UPPER);
expect(lower.gradeGroup).toBe(GradeGroup.LOWER);
```

**変更後:**
```typescript
// groupNumber=1 should have all UPPER, groupNumber=2 should have all LOWER
if (a.groupNumber === 1) {
  for (const mid of a.memberIds) {
    const m = members.find((mem) => mem.id === mid)!;
    expect(m.gradeGroup).toBe(GradeGroup.UPPER);
  }
} else {
  for (const mid of a.memberIds) {
    const m = members.find((mem) => mem.id === mid)!;
    expect(m.gradeGroup).toBe(GradeGroup.LOWER);
  }
}
```

同区分ペア内の言語バランスを検証するテストを追加:

```typescript
it('each group has language balance (JP + EN coverage)', () => {
  // ...
  for (const a of assignments) {
    const m1 = members.find(m => m.id === a.memberIds[0])!;
    const m2 = members.find(m => m.id === a.memberIds[1])!;
    const hasJP = coversJapanese(m1.language) || coversJapanese(m2.language);
    const hasEN = coversEnglish(m1.language) || coversEnglish(m2.language);
    expect(hasJP).toBe(true);
    expect(hasEN).toBe(true);
  }
});
```

### Step 2: adjust-assignment.test.ts の修正

- `dto.members[0].role` / `dto.members[1].role` のアサーションを削除
- GRADE_GROUP_MISMATCH テスト: `groupNumber` で期待区分を判定するテストに変更

### Step 3: assignment-api.test.ts の修正・追加

T10/T11 のテスト修正:

```typescript
it('T10 group 1 members are all UPPER', async () => {
  // ...
  const group1Assignments = res.body.filter((a: any) => a.groupNumber === 1);
  for (const a of group1Assignments) {
    expect(a.gradeGroup).toBe('UPPER');
    for (const m of a.members) {
      expect(m.gradeGroup).toBe('UPPER');
    }
  }
});

it('T11 group 2 members are all LOWER', async () => {
  // ...
  const group2Assignments = res.body.filter((a: any) => a.groupNumber === 2);
  for (const a of group2Assignments) {
    expect(a.gradeGroup).toBe('LOWER');
    for (const m of a.members) {
      expect(m.gradeGroup).toBe('LOWER');
    }
  }
});
```

既存の `role` 関連アサーションを削除・修正。

### Step 4: 全テスト実行

```bash
npm test
npm run typecheck
npm run lint
```

## 完了条件

- [ ] 既存テストが新しいグループ構成に合わせて修正されている
- [ ] グループ1=UPPER、グループ2=LOWER を検証するテストがある
- [ ] 同区分ペア内の言語バランステストがある
- [ ] 全テストがパスする
- [ ] typecheck、lintが通る
