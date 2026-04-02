# 同性制限の仕様変更: 多数派ルール

## 概要
`sameGenderOnly` の判定ロジックを「ペア内で同性かどうか」から「グループ内で自分の性別が少数派でないかどうか」に変更する。

## 背景
合同日では3人1グループになるケースがある。現行の2人ペア前提のチェックでは3人グループの実態に合わない。

## 新しいルール
`sameGenderOnly=true` のメンバーは、**グループ内で自分の性別が少数派にならなければOK**。

### 具体例（本人が女性で `sameGenderOnly=true` の場合）

| グループ構成 | 判定 | 理由 |
|---|---|---|
| 男2 + 女1（本人） | NG | 女性が少数派 |
| 男1 + 女2（本人含む） | OK | 女性が多数派 |
| 男2 + 女2（本人含む） | OK | 同数（少数派ではない） |
| 女2（本人含む） | OK | 同性のみ |

※男性で `sameGenderOnly=true` の場合も同様（逆パターン）。

### 2人ペアの場合
- 同性ペア → OK（従来通り）
- 異性ペア → NG（従来通り、少数派＝1人 vs 1人は同数なので…）

**決定**: 2人ペア（1:1）は従来通りNG。ルールは「自分の性別が**過半数**（strictly majority）」とする。

## 影響範囲
- `src/domain/services/assignment-generator.ts` — スコアリングの同性チェック（現在2人前提）
- `src/domain/services/constraint-checker.ts` — `checkSameGender()` を2人→N人対応に変更
- `src/presentation/controllers/assignment-controller.ts` — candidates APIの警告判定

## 関連
- `notes/2026-03-28_combined-day-3-leaders.md` — 合同日3人グループ仕様
- `notes/2026-03-14_group-composition-rules.md` — グループ構成ルール
- `requirements.md` 3.2 — 同性ペア制限
