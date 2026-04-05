# タスク 052: ユースケース — unassignMember / assignToVacantSlot

## 概要
メンバー解除と空きスロットへの割り当てのユースケース関数を作成する。

## 対象ファイル
- `src/application/use-cases/generate-assignments.ts`（関数追加）
- `tests/application/adjust-assignment.test.ts`（テスト追加）

## 実装手順

### 1. AssignmentDto に vacantSlots を追加

`generate-assignments.ts` 内の `AssignmentDto` に `vacantSlots` フィールドを追加:

```typescript
export interface AssignmentDto {
  // ...既存フィールド
  vacantSlots: number;
}
```

DTO 生成箇所すべてで `vacantSlots` を算出して設定:
- `vacantSlots` = `maxMembers - assignment.memberIds.length`
- `maxMembers` はスケジュールの `isSplitClass` で判定（分級: 2、合同: 3）
- スケジュール情報が取れない場合は 0

### 2. unassignMember 関数を追加

```typescript
export interface UnassignMemberResult {
  assignment: AssignmentDto | null;
  deleted: boolean;
}

export function unassignMember(
  assignmentId: string,
  memberId: string,
  assignmentRepo: AssignmentRepository,
  memberRepo: MemberRepository,
  scheduleRepo: ScheduleRepository,
): Result<UnassignMemberResult>
```

処理:
1. assignment を取得（見つからなければエラー）
2. `assignment.removeMember(memberId)` を呼ぶ
3. 結果が `null`（全員解除）の場合:
   - `assignmentRepo.deleteByScheduleId` ではなく、この割り当てだけ削除
   - `AssignmentRepository` に `deleteById(id)` メソッドがなければ追加が必要
   - → `{ assignment: null, deleted: true }` を返す
4. 結果が Assignment の場合:
   - `assignmentRepo.save(updated)` で保存
   - DTO に変換して返す（`vacantSlots` を含む）

**注意**: `AssignmentRepository` に `deleteById` メソッドが必要。
- `src/domain/repositories/assignment-repository.ts` にインターフェース追加
- `src/infrastructure/persistence/sqlite-assignment-repository.ts` に実装追加

### 3. assignToVacantSlot 関数を追加

```typescript
export function assignToVacantSlot(
  assignmentId: string,
  memberId: string,
  assignmentRepo: AssignmentRepository,
  memberRepo: MemberRepository,
  scheduleRepo: ScheduleRepository,
): Result<AdjustAssignmentResult>
```

処理:
1. assignment を取得
2. schedule を取得して maxMembers を算出
3. `memberIds.length >= maxMembers` ならエラー（Assignment is full）
4. `assignment.addMember(newMemberId, maxMembers)` で追加
5. 保存
6. 既存の `adjustAssignment` と同様の制約チェックを実行
7. 結果を返す

### 4. 既存 DTO 生成箇所の vacantSlots 対応

`generateMonthlyAssignments`, `getAssignmentsForMonth`, `adjustAssignment` の DTO 生成箇所に `vacantSlots` を追加。

## 依存タスク
- タスク050（Assignment エンティティ変更）
- タスク051（リポジトリ NULL 対応）

## テスト方針
- `tests/application/adjust-assignment.test.ts` にテスト追加:
  - unassignMember: 2人→1人、3人→2人、最後の1人→削除
  - unassignMember: 存在しないメンバーでエラー
  - assignToVacantSlot: 1人→2人で制約チェック実行
  - assignToVacantSlot: 満員時エラー

## 完了条件
- [x] `unassignMember` が正しく動作する
- [x] 全員解除時にレコード削除される
- [x] `assignToVacantSlot` が正しく動作する
- [x] 制約チェックが実行される
- [x] `vacantSlots` が全 DTO に含まれる
- [x] ユニットテストが全てパスする
