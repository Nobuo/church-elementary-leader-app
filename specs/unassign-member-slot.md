# 仕様書: メンバー個別解除（担当外し）機能

## 機能概要

割り当て済みのグループから特定のメンバーを解除し、空きスロットの状態で保存できるようにする。現在の「差し替え」は新メンバー選択が必須だが、本機能により「一旦外す → 後から割り当てる」という2段階のワークフローを可能にする。

## 背景

- 現在のUIでは「差し替え」ボタンから直接代わりのメンバーを選ぶ必要がある
- 実運用では「この人は外したいが、代わりがまだ決まっていない」ケースがある
- 日単位のクリア（全グループ削除）はあるが、グループ内の1人だけを外す手段がない

## ユースケース

### UC-1: メンバーを解除する（正常系）

1. 割り当て結果画面で、メンバー名の横にある「外す」ボタンをクリック
2. 確認ダイアログが表示される
3. 「OK」を押すと、そのメンバーがグループから解除される
4. 画面上では解除されたスロットが「---」と表示される
5. 担当回数カウントから当該メンバーが除外される

### UC-2: 空きスロットに新しいメンバーを割り当てる（正常系）

1. 空きスロット「---」の横にある「割り当て」ボタンをクリック
2. 候補メンバーのドロップダウンが表示される（既存の差し替え候補APIを流用）
3. メンバーを選択して「確定」を押す
4. 空きスロットが選択したメンバーに置き換わる

### UC-3: 過去の割り当てからメンバーを解除する（異常系）

1. 過去日の割り当てで「外す」ボタンをクリック
2. 「過去の割り当てを変更しようとしています。続けますか？」の確認ダイアログが表示される
3. OKを押した場合のみ解除を実行する（既存の差し替え時と同じ挙動）

### UC-4: 全メンバーが解除された場合

1. グループの全メンバーを解除すると、割り当てレコード自体が削除される
2. 両グループが空になった場合、その日は「未割当」状態に戻る（インクリメンタル自動生成の対象になる）

## ドメインモデル変更

### Assignment エンティティ

現状の `memberIds: readonly MemberId[]` は最低2人を要求している。以下のように変更する:

```typescript
// 変更前
static create(scheduleId, groupNumber, memberIds) {
  if (memberIds.length < 2 || memberIds.length > 3) {
    throw new Error('Assignment requires 2 or 3 members');
  }
}

// 変更後
// create() は自動生成用なので2-3人の制約を維持
// 手動操作用に removeMember() を追加
removeMember(memberId: MemberId): Assignment | null {
  // メンバーを除去した新しい memberIds を作成
  // 残りが0人の場合は null を返す（呼び出し側で削除）
  // 残りが1人以上の場合は新しい Assignment を返す
}
```

**ポイント**: `memberIds` の最小値は **1人** に緩和する（`removeMember` 経由のみ。`create` の制約は維持）。

### DB スキーマ

現状の `member_id_1 TEXT NOT NULL`, `member_id_2 TEXT NOT NULL` を NULL 許容に変更する。

```sql
-- マイグレーション
ALTER TABLE assignments RENAME TO assignments_old;
CREATE TABLE assignments (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  group_number INTEGER NOT NULL CHECK (group_number IN (1, 2)),
  member_id_1 TEXT,          -- NULL許容に変更
  member_id_2 TEXT,          -- NULL許容に変更
  member_id_3 TEXT,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id),
  FOREIGN KEY (member_id_1) REFERENCES members(id),
  FOREIGN KEY (member_id_2) REFERENCES members(id),
  FOREIGN KEY (member_id_3) REFERENCES members(id)
);
```

**スロット詰め**: メンバー解除時、残りのメンバーを `member_id_1` 側に詰める。例: `[A, B]` から A を解除 → `[B, null]` ではなく `member_id_1 = B, member_id_2 = NULL`。

### SqliteAssignmentRepository

`rowToAssignment` でNULLスロットをスキップして `memberIds` を構築する（現在の `member_id_3` のNULLハンドリングと同様）。

```typescript
function rowToAssignment(row: AssignmentRow): Assignment {
  const memberIds: MemberId[] = [];
  if (row.member_id_1) memberIds.push(asMemberId(row.member_id_1));
  if (row.member_id_2) memberIds.push(asMemberId(row.member_id_2));
  if (row.member_id_3) memberIds.push(asMemberId(row.member_id_3));
  return Assignment.reconstruct({ ... memberIds });
}
```

`save` もスロット詰めを行った上で保存する。

`countAllByFiscalYear` のUNION ALLクエリに `WHERE member_id_1 IS NOT NULL` / `WHERE member_id_2 IS NOT NULL` を追加する。

## API

### PUT /api/assignments/:id/unassign

メンバーをグループから解除する。

**リクエスト:**
```json
{ "memberId": "member-uuid" }
```

**レスポンス（成功・メンバーが残っている場合）:**
```json
{
  "assignment": {
    "id": "...",
    "scheduleId": "...",
    "date": "2026-04-05",
    "groupNumber": 1,
    "gradeGroup": "UPPER",
    "members": [
      { "id": "...", "name": "...", "gradeGroup": "UPPER" }
    ],
    "vacantSlots": 1
  },
  "deleted": false
}
```

**レスポンス（成功・全員解除で削除された場合）:**
```json
{
  "assignment": null,
  "deleted": true
}
```

**エラー:**
- 404: Assignment not found
- 400: Member not in this assignment

### PUT /api/assignments/:id/assign

空きスロットに新しいメンバーを割り当てる。

**リクエスト:**
```json
{ "memberId": "member-uuid" }
```

**レスポンス:**
```json
{
  "assignment": { ... },
  "violations": [ ... ]
}
```

既存の `adjustAssignment` と同様の制約チェック（言語バランス、同性ペア、配偶者、月内重複、最小間隔）を実行する。

**エラー:**
- 404: Assignment not found
- 400: No vacant slot / Member not found / Assignment is full

## DTO 変更

### AssignmentDto

`vacantSlots` フィールドを追加する:

```typescript
export interface AssignmentDto {
  id: string;
  scheduleId: string;
  date: string;
  groupNumber: number;
  gradeGroup: string;
  members: AssignmentMemberDto[];
  vacantSlots: number;  // 追加: 空きスロット数
}
```

`vacantSlots` の算出: 合同日（3人グループ）は `3 - members.length`、分級日（2人グループ）は `2 - members.length`。

## UI 変更

### 割り当て結果画面

**通常状態（変更なし）:**
```
4/5（日）
  グループ 1: [高] 田中 (3) [差し替え] [外す] ・ [低] 鈴木 (2) [差し替え] [外す]
```

**空きスロットがある状態:**
```
4/5（日）
  グループ 1: [高] 田中 (3) [差し替え] [外す] ・ --- [割り当て]
```

### ボタン

| ボタン | 表示条件 | アクション |
|--------|----------|------------|
| 外す | メンバーが割り当てられているスロット | `PUT /api/assignments/:id/unassign` |
| 割り当て | 空きスロット | 候補ドロップダウン → `PUT /api/assignments/:id/assign` |
| 差し替え | メンバーが割り当てられているスロット（従来通り） | `PUT /api/assignments/:id/adjust` |

### i18n 追加キー

| キー | 日本語 | English |
|------|--------|---------|
| `unassign` | 外す | Remove |
| `assign` | 割り当て | Assign |
| `unassignConfirm` | このメンバーを外しますか？ | Remove this member? |
| `vacant` | --- | --- |

## 制約・ビジネスルール

1. **空きスロットがある割り当ての制約チェック**: 空きスロットがある状態では、言語バランス・同性ペアなどの制約チェックはスキップする（不完全なグループに対してチェックしても意味がないため）
2. **担当回数カウント**: 解除されたメンバーは当該割り当ての担当回数から除外される（DB上のNULLスロットはカウントしない）
3. **インクリメンタル自動生成**: 空きスロットがあるグループの割り当ては「割り当て済み」として扱う（自動生成の対象にしない）。空きスロットの補完は手動操作のみ
4. **全員解除時の削除**: グループの全メンバーが解除された場合、割り当てレコードを削除する。両グループが削除された場合、その日は未割当となり自動生成の対象になる
5. **CSV/LINEエクスポート**: 空きスロットは「---」または「(未定)」/(TBD)」と表示する
6. **過去日の解除**: 既存の差し替えと同じ警告を表示する（ブロックはしない）

## 受け入れ基準

### ドメイン・API

- [ ] `Assignment.removeMember()` でメンバーを解除できる
- [ ] `Assignment.removeMember()` で最後のメンバーを解除すると `null` が返る
- [ ] `Assignment.create()` は引き続き2〜3人の制約を維持する
- [ ] `PUT /api/assignments/:id/unassign` が正しく動作する
- [ ] メンバー解除後の担当回数が正しくカウントされる（解除分が減る）
- [ ] 全員解除時に割り当てレコードが削除される

### 空きスロットへの割り当て

- [ ] `PUT /api/assignments/:id/assign` で空きスロットにメンバーを割り当てられる
- [ ] 割り当て時に制約チェック（言語バランス、同性ペア等）が実行される
- [ ] 既に満員の割り当てに `assign` するとエラーになる

### UI

- [ ] メンバーの横に「外す」ボタンが表示される
- [ ] 「外す」クリック時に確認ダイアログが表示される
- [ ] 解除後、空きスロットが「---」と表示される
- [ ] 空きスロットの横に「割り当て」ボタンが表示される
- [ ] 「割り当て」クリック時に候補ドロップダウンが表示される
- [ ] 過去日では警告ダイアログが先に表示される

### DBマイグレーション

- [ ] `member_id_1`, `member_id_2` がNULL許容になる
- [ ] 既存データはマイグレーション後も正しく読み取れる
- [ ] NULLスロットを含む割り当ての保存・読み取りが正しく動作する

### エクスポート

- [ ] CSV出力で空きスロットが適切に表示される
- [ ] LINEテキスト出力で空きスロットが適切に表示される
