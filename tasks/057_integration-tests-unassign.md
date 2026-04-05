# タスク 057: インテグレーションテスト

## 概要
メンバー解除・空きスロット割り当て機能のE2Eテストを追加する。

## 対象ファイル
- `tests/integration/assignment-api.test.ts`（テスト追加）

## 実装手順

### テストケース

1. **unassign: 2人グループから1人を解除**
   - スケジュール生成 → 割り当て生成 → unassign
   - レスポンスの `assignment.members` が1人、`vacantSlots` が1、`deleted` が false
   - 再度 GET で割り当てを取得し、1人のみであること

2. **unassign: 3人グループから1人を解除**
   - 合同日で3人グループ → unassign
   - `members` が2人、`vacantSlots` が1

3. **unassign: 最後の1人を解除 → 削除**
   - 2人から1人を解除 → もう1人を解除
   - 2回目のレスポンスが `deleted: true`
   - GET で当該割り当てが存在しないこと

4. **unassign: 存在しないメンバーで 400**

5. **assign: 空きスロットにメンバーを割り当て**
   - unassign で1人解除 → assign で別メンバーを割り当て
   - レスポンスの `members` が2人、`vacantSlots` が0

6. **assign: 満員のグループに割り当て → 400**

7. **担当回数の整合性**
   - unassign 後に `/api/assignments/counts` を確認
   - 解除されたメンバーのカウントが減っていること

8. **CSV/LINE エクスポートで空きスロットが表示される**
   - unassign 後に `/api/assignments/export/line` を確認
   - 出力に `(未定)` が含まれること

## 依存タスク
- タスク053（API エンドポイント）
- タスク055（フォーマッター）

## テスト方針
- 既存のインテグレーションテストのセットアップパターンを流用

## 完了条件
- [x] 全テストケースがパスする
- [x] 既存のインテグレーションテストが壊れていない
