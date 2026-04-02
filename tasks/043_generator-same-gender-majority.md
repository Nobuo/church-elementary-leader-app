# タスク043: assignment-generator のスコアリングを過半数ルールに対応

## 概要
`scorePair()` と `scoreTrio()` の同性制限チェックを `checkSameGenderGroup` に統一する。特に `scoreTrio()` で「適用しない」だった同性制限を過半数ルールに変更する。

## 対象ファイル
- `src/domain/services/assignment-generator.ts`
- `tests/domain/assignment-generator.test.ts`

## 実装手順
1. `scorePair()` の同性チェック（line 112-126）を `checkSameGenderGroup([member1, member2])` に置き換え
   - スコア `+100000` とviolation追加のロジックは維持
   - 判定結果は同じ（2人の後方互換）
2. `scoreTrio()` の「Same-gender constraint: NOT applied」コメント（line 210）を削除
   - `checkSameGenderGroup(members)` による過半数チェックを追加
   - 違反時は `score += 100000` + violation追加
3. テスト追加（仕様書の受け入れ基準 13-15）

## 依存タスク
- タスク042（checkSameGenderGroup の実装）

## テスト方針
- 合同日: sameGenderOnly の女性が女性多数派グループに配置される
- 合同日: sameGenderOnly の女性が男性多数派グループに配置されない
- 分級日: 従来通り異性ペアにならない（既存テストが引き続きパス）

## 完了条件
- `scorePair` が `checkSameGenderGroup` を使用している
- `scoreTrio` で過半数ルールが適用されている
- ジェネレーターテスト3件が通る
- 既存テストがすべてパスする

## ステータス
- [x] 完了
