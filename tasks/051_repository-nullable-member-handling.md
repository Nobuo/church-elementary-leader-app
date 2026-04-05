# タスク 051: リポジトリの NULL スロット対応

## 概要
SqliteAssignmentRepository の読み書きを NULL スロット（1人のみの割り当て）に対応させる。

## 対象ファイル
- `src/infrastructure/persistence/sqlite-assignment-repository.ts`（変更）

## 実装手順

1. `AssignmentRow` の型を変更
   ```typescript
   member_id_1: string | null;  // 変更
   member_id_2: string | null;  // 変更
   member_id_3: string | null;  // 変更なし
   ```

2. `rowToAssignment` を変更
   - 3つのスロットすべてで NULL チェックしてから push
   ```typescript
   const memberIds: MemberId[] = [];
   if (row.member_id_1) memberIds.push(asMemberId(row.member_id_1));
   if (row.member_id_2) memberIds.push(asMemberId(row.member_id_2));
   if (row.member_id_3) memberIds.push(asMemberId(row.member_id_3));
   ```

3. `save` メソッドを変更
   - スロット詰め: memberIds を member_id_1 から順に詰める
   ```typescript
   assignment.memberIds[0] ?? null,
   assignment.memberIds[1] ?? null,
   assignment.memberIds[2] ?? null,
   ```

4. `countAllByFiscalYear` の UNION ALL クエリを変更
   - `WHERE a.member_id_1 IS NOT NULL` を追加
   - `WHERE a.member_id_2 IS NOT NULL` を追加
   - `member_id_3` は既に `IS NOT NULL` チェック済み

5. `findByMemberAndFiscalYear` のWHERE句は変更不要（NULL と比較すると FALSE になるため）

## 依存タスク
- タスク049（DBマイグレーション）

## テスト方針
- タスク053のインテグレーションテストで結合確認

## 完了条件
- [x] 1人のみの割り当てが正しく保存・読み取りできる
- [x] スロット詰めが正しく動作する
- [x] 担当回数カウントで NULL スロットがカウントされない
