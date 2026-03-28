# タスク 027: Assignment エンティティの可変長メンバー対応

## 概要
Assignment エンティティの `memberIds` を2人固定タプルから可変長配列（2〜3人）に変更する。DBスキーマに `member_id_3` カラムを追加する。

## 依存タスク
なし（最初に着手）

## 対象ファイル
- `src/domain/entities/assignment.ts`
- `src/infrastructure/persistence/sqlite-assignment-repository.ts`
- `src/infrastructure/persistence/migrations/` — 新規マイグレーション追加
- `src/domain/repositories/assignment-repository.ts` — 変更なし（インターフェースは Assignment を使うため自動追従）

## 実装手順

### Step 1: Assignment エンティティの型変更

`src/domain/entities/assignment.ts`:

1. `memberIds` の型を `readonly [MemberId, MemberId]` → `readonly MemberId[]` に変更
2. `AssignmentProps` の `memberIds` も同様に変更
3. `create()` の引数を `memberIds: MemberId[]` に変更（2〜3人バリデーション追加）
4. `replaceMember()` の戻り値の型を更新
5. `containsMember()` は変更不要（`includes` で動作する）

```typescript
static create(
  scheduleId: ScheduleId,
  groupNumber: 1 | 2,
  memberIds: MemberId[],
): Assignment {
  if (memberIds.length < 2 || memberIds.length > 3) {
    throw new Error('Assignment requires 2 or 3 members');
  }
  return new Assignment({
    id: createAssignmentId(),
    scheduleId,
    groupNumber,
    memberIds,
  });
}
```

### Step 2: DBマイグレーション追加

`src/infrastructure/persistence/migrations/` に新規マイグレーションファイルを追加:

```sql
ALTER TABLE assignments ADD COLUMN member_id_3 TEXT DEFAULT NULL;
```

- `member_id_3` は NULL 許容（合同日=3人、分級日=2人でNULL）

### Step 3: SqliteAssignmentRepository の更新

`src/infrastructure/persistence/sqlite-assignment-repository.ts`:

1. `AssignmentRow` に `member_id_3: string | null` を追加
2. `rowToAssignment()`: `member_id_3` が非NULLなら3人配列を生成
3. `save()`: `member_id_3` を含む INSERT 文に更新
4. `findByMemberAndFiscalYear()`: WHERE に `OR a.member_id_3 = ?` を追加
5. `countByMember()`: 同上
6. `countAllByFiscalYear()`: UNION ALL に `member_id_3` の SELECT を追加

## テスト方針

- Assignment.create() に2人・3人を渡してそれぞれ正しく生成されること
- Assignment.create() に1人・4人を渡して例外がスローされること
- replaceMember() が2人・3人の両方で動作すること
- containsMember() が3人目のメンバーも検出すること
- DB保存/復元で3人の memberIds が正しくラウンドトリップすること
- DB保存/復元で2人の場合も既存動作が維持されること

## 完了条件
- [ ] `memberIds` が可変長配列になっている
- [ ] 2〜3人のバリデーションが入っている
- [ ] DBマイグレーションが追加されている
- [ ] SQLiteリポジトリが3人に対応している
- [ ] 既存の2人ケースが引き続き動作する
- [ ] ユニットテストが通る
