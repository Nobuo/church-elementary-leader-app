# タスク044: candidates API の同性制限チェックをグループ対応

## 概要
candidates API の差し替え候補判定で `checkSameGender(m, partner)` を `checkSameGenderGroup` に変更し、合同日3人グループの差し替え時にも過半数ルールが適用されるようにする。

## 対象ファイル
- `src/presentation/controllers/assignment-controller.ts`
- `tests/integration/assignment-api.test.ts`

## 実装手順
1. `assignment-controller.ts` の candidates API 内で `checkSameGender(m, partner)` を特定
2. 既存グループメンバー＋候補者の配列で `checkSameGenderGroup` を呼ぶよう変更
   - 2人グループ: `[candidate, partner]`（従来と同じ結果）
   - 3人グループ: `[candidate, ...existingMembers]`（過半数ルール適用）
3. インテグレーションテスト追加（仕様書の受け入れ基準 16）

## 依存タスク
- タスク042（checkSameGenderGroup の実装）

## テスト方針
- candidates API: 3人グループの差し替え候補で過半数ルール違反が warnings に含まれる
- 既存の2人グループ用テストが引き続きパス

## 完了条件
- candidates API が `checkSameGenderGroup` を使用している
- インテグレーションテストが通る
- 全テストがパスする

## ステータス
- [x] 完了
