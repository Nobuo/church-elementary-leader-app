# タスク024: 自動生成の増分モード — バックエンド ✅ 完了

## 概要

`generateMonthlyAssignments` を「全削除→全再生成」から「未割り当て週のみ生成」に変更する。

## 対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/application/use-cases/generate-assignments.ts` | 増分生成ロジックに変更 |
| `src/application/use-cases/generate-assignments.ts` | `GenerateAssignmentsResult` に `message` フィールド追加 |
| `tests/application/generate-assignments.test.ts` | 増分生成のテスト追加 |

## 依存タスク

なし（最初に着手）

## 実装手順

### Step 1: `GenerateAssignmentsResult` に `message` フィールドを追加

```typescript
export interface GenerateAssignmentsResult {
  assignments: AssignmentDto[];
  violations: ConstraintViolation[];
  message?: string;  // 追加
}
```

### Step 2: `generateMonthlyAssignments` を増分モードに変更

1. 月内の全スケジュールIDで既存の割り当てを取得
2. 割り当て済みのスケジュールIDをSetで管理
3. 未割り当て（かつ非除外）のスケジュールのみフィルタ
4. 空きスケジュールがなければ `{ assignments: [], violations: [], message: 'allWeeksAssigned' }` を返す
5. **既存の `assignmentRepo.deleteByScheduleIds(scheduleIds)` を削除**（最重要変更点）
6. カウントマップ構築時に、当月確定済み割り当て（`existingMonthAssignments`）を含める
7. `generateAlgorithm` に渡すスケジュールを `unassignedSchedules` に変更
8. `generateAlgorithm` に渡す `existingAssignmentsAll` に当月確定済みを含める

**変更の核心（generate-assignments.ts:63-92）:**

```typescript
// 現行コード（削除）:
const scheduleIds = schedules.map((s) => s.id);
assignmentRepo.deleteByScheduleIds(scheduleIds);  // ← 削除

// 新コード:
const allScheduleIds = schedules.map((s) => s.id);
const existingMonthAssignments = assignmentRepo.findByScheduleIds(allScheduleIds);
const assignedScheduleIds = new Set(existingMonthAssignments.map((a) => a.scheduleId));
const unassignedSchedules = schedules.filter(
  (s) => !s.isExcluded && !assignedScheduleIds.has(s.id)
);

if (unassignedSchedules.length === 0) {
  return ok({ assignments: [], violations: [], message: 'allWeeksAssigned' });
}
```

### Step 3: カウントマップ構築の修正

現行は他月の割り当てのみからカウントを構築しているが、当月の確定済み割り当ても含める:

```typescript
// 他月割り当て + 当月確定済み = 全既存割り当て
const existingAssignmentsAll = [...otherMonthAssignments, ...existingMonthAssignments];

const countMap = new Map<MemberId, number>();
for (const m of members) countMap.set(m.id, 0);
for (const a of existingAssignmentsAll) {
  for (const mid of a.memberIds) {
    countMap.set(mid, (countMap.get(mid) ?? 0) + 1);
  }
}
```

### Step 4: `generateAlgorithm` に渡す引数を変更

```typescript
const { assignments, violations } = generateAlgorithm(
  unassignedSchedules,     // 空きスケジュールのみ
  members,
  existingAssignmentsAll,  // 確定済み含む全既存
  countMap,
);
```

### Step 5: バリデーション（excessiveCount）の`totalSundays`計算を修正

確定済み週 + 新規生成週の両方をカウントに含める（現行ロジックの `assignedSundays` 計算は、当月の確定済みスケジュールも含めて正しくなるよう調整）。

### Step 6: テスト追加

`tests/application/generate-assignments.test.ts` に以下のケースを追加:

1. **全週空→全週生成**（従来動作の確認）
2. **1週確定済み + 3週空→3週のみ生成、確定済み週は不変**
3. **全週確定済み→割り当て変更なし、message='allWeeksAssigned'**
4. **確定済み週のメンバーが新規生成でカウントされる**（月内重複ペナルティの確認）

## テスト方針

- 既存のgenerate-assignments.test.tsに増分生成のdescribeブロックを追加
- モックリポジトリを使い、`findByScheduleIds` が確定済み割り当てを返すケースをセットアップ
- `deleteByScheduleIds` が呼ばれないことを検証（spy）
- 生成後に確定済み週の割り当てが変わっていないことを検証

## 完了条件

- [ ] 空き週のみに割り当てが生成される
- [ ] 確定済み週の割り当てが一切変更されない
- [ ] 全週確定済みの場合、何も変更されずmessageが返る
- [ ] 確定済み週の担当回数が新規生成時に考慮される
- [ ] 既存テストが全て通る
- [ ] 新規テストが追加されている
