# タスク 050: Assignment エンティティに removeMember / addMember を追加

## 概要
Assignment エンティティに `removeMember()` と `addMember()` メソッドを追加し、空きスロットを持つ割り当てを表現可能にする。

## 対象ファイル
- `src/domain/entities/assignment.ts`（変更）
- `tests/domain/assignment.test.ts`（テスト追加）

## 実装手順

1. `Assignment.removeMember(memberId: MemberId): Assignment | null` を追加
   - 指定メンバーが memberIds に存在しなければ例外
   - メンバー除去後、残りが0人なら `null` を返す
   - 残りが1人以上なら新しい Assignment を返す

2. `Assignment.addMember(memberId: MemberId, maxMembers: number): Assignment` を追加
   - `memberIds.length >= maxMembers` なら例外（「Assignment is full」）
   - メンバーを追加した新しい Assignment を返す

3. `Assignment.reconstruct()` の最低人数チェックを緩和
   - 現状は暗黙的に制約なし（private constructor 直呼び）なので変更不要のはず
   - ただし `create()` の 2-3人制約は維持すること

4. ユニットテスト追加（`tests/domain/assignment.test.ts`）
   - `removeMember`: 2人→1人、3人→2人、1人→null
   - `removeMember`: 存在しないメンバーで例外
   - `addMember`: 1人→2人、2人→3人
   - `addMember`: 満員時に例外
   - `create` は引き続き2-3人の制約を維持

## 依存タスク
なし（タスク049と並行可能）

## テスト方針
- ユニットテスト: 上記の正常系・異常系を網羅

## 完了条件
- [x] `removeMember()` が正しく動作する
- [x] `addMember()` が正しく動作する
- [x] `create()` の2-3人制約は維持されている
- [x] ユニットテストが全てパスする
