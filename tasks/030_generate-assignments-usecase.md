# タスク 030: generate-assignments ユースケースの合同日対応

## 概要
アプリケーション層のユースケースを合同日3人×1グループに対応させる。DTO変換、手動調整、差し替え候補取得を更新する。

## 依存タスク
- 027（Assignment エンティティ）
- 028（generator の合同日ロジック）
- 029（constraint-checker の3人対応）

## 対象ファイル
- `src/application/use-cases/generate-assignments.ts`

## 実装手順

### Step 1: generateMonthlyAssignments の更新

1. **AssignmentDto の gradeGroup**: 合同日（groupNumber=1 で3人）の場合、`gradeGroup` は `'MIXED'` とする
2. **members の可変長対応**: `AssignmentDto.members` は既に配列なので変更不要
3. **checkExcessiveCount のスロット数**: 合同日3 + 分級日4 で totalSlots を計算して渡す

```typescript
// スロット数計算
const totalSlots = assignedSundays.reduce((sum, s) => sum + (s.isSplitClass ? 4 : 3), 0);
const excessiveViolations = checkExcessiveCount(members, updatedCountMap, totalSlots);
```

### Step 2: adjustAssignment の更新

1. **合同日判定**: `schedule.isSplitClass === false` の場合
2. **同性ペア制限スキップ**: 合同日の場合は `checkSameGender` を呼ばない
3. **言語バランス**: 3人全員で `checkLanguageBalanceGroup` を使用
4. **夫婦回避**: 3人全員で `checkSpouseSameGroupMulti` を使用
5. **分級日のクラス言語カバレッジ**: 既存ロジックを維持（ただし memberIds が可変長になるため対応）

```typescript
if (!schedule.isSplitClass) {
  // 合同日: 3人グループの制約チェック
  const allMembers = updated.memberIds.map(mid => memberRepo.findById(mid)).filter(Boolean);
  const langViolation = checkLanguageBalanceGroup(allMembers);
  // 同性チェックはスキップ
  const spouseViolation = checkSpouseSameGroupMulti(allMembers);
} else {
  // 分級日: 既存の2人ペアチェック
}
```

### Step 3: getAssignmentsForMonth の更新

- `gradeGroup` の決定ロジックを更新:

```typescript
// 変更前
gradeGroup: a.groupNumber === 1 ? GradeGroup.UPPER : GradeGroup.LOWER,

// 変更後
gradeGroup: a.memberIds.length === 3 ? 'MIXED' : (a.groupNumber === 1 ? GradeGroup.UPPER : GradeGroup.LOWER),
```

### Step 4: GradeGroup に MIXED を追加（必要に応じて）

`src/domain/value-objects/grade-group.ts` に `MIXED = 'MIXED'` を追加するか、DTO レベルでのみ 'MIXED' 文字列を使うか判断。

## テスト方針

- generateMonthlyAssignments: 合同日に3人の AssignmentDto が返ること
- generateMonthlyAssignments: 分級日に2人の AssignmentDto が返ること
- adjustAssignment: 合同日の3人 Assignment の差し替えが動作すること
- adjustAssignment: 合同日の差し替え時に同性チェックがスキップされること
- adjustAssignment: 合同日の差し替え時に言語バランスが3人でチェックされること
- getAssignmentsForMonth: 合同日の gradeGroup が MIXED であること

## 完了条件
- [ ] 合同日の AssignmentDto が3人×1グループで返される
- [ ] 手動調整が3人 Assignment に対応している
- [ ] 合同日の制約チェックが正しく動作する
- [ ] 分級日の既存動作が維持される（リグレッションなし）
- [ ] ユニットテストが通る
