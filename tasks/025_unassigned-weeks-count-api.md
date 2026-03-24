# タスク025: 担当回数APIに未割り当て週数を追加 ✅ 完了

## 概要

`GET /api/assignments/counts` のレスポンスに `unassignedWeeks` フィールドを追加し、フロントエンドが未割り当て週の存在を判定できるようにする。

## 対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/application/use-cases/get-assignment-counts.ts` | `unassignedWeeks` 計算追加、引数に `scheduleRepo` 追加 |
| `src/presentation/controllers/assignment-controller.ts` | `getAssignmentCounts` 呼び出しに `scheduleRepo` を渡す |
| `tests/application/get-assignment-counts.test.ts` | `unassignedWeeks` のテスト追加 |

## 依存タスク

- タスク024（直接依存はないが同じ機能の一部。並行着手可能）

## 実装手順

### Step 1: `AssignmentCountsResult` に `unassignedWeeks` を追加

```typescript
export interface AssignmentCountsResult {
  fiscalYear: number;
  summary: AssignmentCountSummary;
  members: AssignmentCountDto[];
  unassignedWeeks: number;  // 追加
}
```

### Step 2: `getAssignmentCounts` に `scheduleRepo` 引数を追加

```typescript
export function getAssignmentCounts(
  fiscalYear: number,
  memberRepo: MemberRepository,
  assignmentRepo: AssignmentRepository,
  scheduleRepo: ScheduleRepository,  // 追加
): AssignmentCountsResult {
```

### Step 3: 未割り当て週数の計算ロジックを追加

関数の末尾、return文の前に追加:

```typescript
// 未割り当て週数を計算
const allSchedules = scheduleRepo.findByFiscalYear(fiscalYear);
const activeSchedules = allSchedules.filter((s) => !s.isExcluded);
const activeScheduleIds = activeSchedules.map((s) => s.id);
const allAssignments = assignmentRepo.findByScheduleIds(activeScheduleIds);
const assignedScheduleIds = new Set(allAssignments.map((a) => a.scheduleId));
const unassignedWeeks = activeSchedules.filter(
  (s) => !assignedScheduleIds.has(s.id)
).length;
```

returnに `unassignedWeeks` を追加。

### Step 4: コントローラーの呼び出しを更新

`assignment-controller.ts` の `GET /counts` ハンドラ:

```typescript
// 現行:
res.json(getAssignmentCounts(fiscalYear, memberRepo, assignmentRepo));

// 変更後:
res.json(getAssignmentCounts(fiscalYear, memberRepo, assignmentRepo, scheduleRepo));
```

### Step 5: テスト更新

`tests/application/get-assignment-counts.test.ts` に以下を追加:

1. **全週割り当て済み→unassignedWeeks: 0**
2. **1週未割り当て→unassignedWeeks: 1**
3. **全週未割り当て→unassignedWeeks: N（スケジュール数）**
4. **除外日は未割り当てにカウントしない**

## テスト方針

- 既存テストの`getAssignmentCounts`呼び出しに`scheduleRepo`引数を追加（既存テストが壊れないよう）
- モックのscheduleRepoで`findByFiscalYear`を実装
- モックのassignmentRepoで`findByScheduleIds`を実装

## 完了条件

- [ ] APIレスポンスに `unassignedWeeks` が含まれる
- [ ] 全週割り当て済みなら `unassignedWeeks: 0`
- [ ] 一部未割り当てなら正しい件数が返る
- [ ] 除外日は未割り当てにカウントされない
- [ ] 既存テストが全て通る
- [ ] 新規テストが追加されている
