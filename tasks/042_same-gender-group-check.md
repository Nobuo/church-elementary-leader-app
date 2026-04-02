# タスク042: constraint-checker に checkSameGenderGroup を実装

## 概要
`checkSameGender(member1, member2)` を `checkSameGenderGroup(members: Member[])` に拡張し、過半数ルールで同性制限を判定する。

## 対象ファイル
- `src/domain/services/constraint-checker.ts`
- `tests/domain/constraint-checker.test.ts`（新規）

## 実装手順
1. `constraint-checker.ts` に `checkSameGenderGroup(members: Member[])` を追加
   - `sameGenderOnly=true` のメンバーごとに `sameGenderCount > members.length / 2` をチェック
   - 違反時は最初の違反者の情報で `ConstraintViolation` を返す
2. 既存の `checkSameGender(member1, member2)` は `checkSameGenderGroup([member1, member2])` にラップして後方互換を維持
3. `checkAll()` も `checkSameGenderGroup` を使うよう更新
4. テストファイル `tests/domain/constraint-checker.test.ts` を新規作成し、仕様書の12ケースを実装

## 依存タスク
- なし

## テスト方針
仕様書の受け入れ基準 1-12 のドメインテスト:
- 2人グループ: 異性NG、同性OK
- 3人グループ: 過半数OK、少数派NG、全員同性OK
- 4人グループ: 同数NG、過半数OK
- sameGenderOnly=false のみ → 常にOK
- 複数sameGenderOnly（同性/異性）

## 完了条件
- `checkSameGenderGroup` が実装されている
- `checkSameGender` が後方互換ラッパーとして動作する
- 12件のドメインテストが通る

## ステータス
- [x] 完了
