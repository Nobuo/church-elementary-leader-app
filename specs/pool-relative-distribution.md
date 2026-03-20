# 仕様書: プール内相対均等配分

## 機能概要

均等配分ペナルティの基準を「全メンバーの最小count」から「同一プール（候補配列）内の最小count」に変更する。グループ間の構造的な回数差（LOWER > UPPER）は維持しつつ、プール内の均等性を向上させる。

### 背景

- LOWER 10人 vs UPPER 13人の人数差により、LOWER は平均 5.2回、UPPER は平均 4.0回と構造的に差がある
- UPPERにEN専門が0人のため BOTH が毎回必須 → UPPER BOTH 5回台 vs UPPER JP 3回台
- 現在の均等配分は全メンバーのminCount（= UPPER JPの3回）を基準にしているため、LOWER メンバー（5回）は `(5-3)*50 = +100` のペナルティを受ける
- しかし LOWER 内では5回は平均的であり、本来ペナルティを受けるべきではない
- 結果として回数順ソートが「階段状」になり、ランダム感がない

## ビジネスルール

### R1: プール内最小countを基準にする

`scorePair()` の均等配分ペナルティを、候補プール内の最小countに変更する。

```
変更前:
  minCount = min(全アクティブメンバーのcount)
  penalty = (memberCount - minCount) * 50

変更後:
  poolMinCount = min(候補プール内のcount)
  penalty = (memberCount - poolMinCount) * 50
```

### R2: プール＝候補配列

「プール」は `pickBestPairSameGrade()` に渡される候補配列（`candidates`）を指す。

- 通常: upperMembers / remainingLower
- 分級日クロスオーバー時: クロスオーバー込みの拡張プール
- G2: G1使用済みメンバーを除外した残りプール

### R3: 既存の優先度関係は変更なし

ハード制約、BOTH温存、ヘルパー後回し、配偶者回避、ペア多様性、日付指定優先 — 全て従来通り。ペナルティ値（50/回差）も変更なし。

### R4: 全体minCountの削除

`scorePair()` の引数から `context` 経由で全メンバーを参照する必要がなくなる（プール情報は `pickBestPairSameGrade` 内で計算）。

## ドメインモデル

### 変更対象

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/services/assignment-generator.ts` | `pickBestPairSameGrade()` でプール内minCountを計算し `scorePair()` に渡す |
| `tests/domain/assignment-generator.test.ts` | テスト追加・既存テスト確認 |

### 変更不要

- アプリケーション層・インフラ層・プレゼンテーション層 — 変更なし

### 実装方針

`scorePair()` に `poolMinCount` を引数として追加する（`pickBestPairSameGrade` 内で1回計算してループ内で使い回す）。

```typescript
function pickBestPairSameGrade(candidates, context, ...) {
  const counts = context.assignmentCounts;
  const poolMinCount = Math.min(...candidates.map(m => counts.get(m.id) ?? 0));
  // ...
  for (i) for (j) {
    scorePair(..., poolMinCount);
  }
}

function scorePair(..., poolMinCount: number) {
  // Equal distribution
  for (const m of [member1, member2]) {
    const memberCount = counts.get(m.id) ?? 0;
    score += (memberCount - poolMinCount) * 50;
  }
}
```

## ユースケース

### UC1: UPPER プール内の均等化

**前提:** UPPER BOTH(count=4) + UPPER JP(count=3) vs UPPER BOTH(count=4) + UPPER JP(count=3)

**変更前:** minCount=3（全体）→ BOTH ペナルティ (4-3)*50=+50, JP ペナルティ 0 → 合計 +50
**変更後:** poolMinCount=3（UPPER内）→ 同じ +50

この場合は変化なし。

### UC2: LOWER プール内の均等化

**前提:** LOWER JP(count=5) + LOWER EN(count=5) vs LOWER JP(count=5) + LOWER EN(count=6)

**変更前:** minCount=3（UPPER JPが引き下げ）→ JP: (5-3)*50=+100, EN: (5-3)*50=+100 → 合計 +200
**変更後:** poolMinCount=5（LOWER内）→ JP: 0, EN: 0 → 合計 0

差が消え、ペア選択に均等配分ペナルティが不必要に介入しなくなる。

### UC3: G2プール（G1使用済み除外後）

**前提:** G1で count=3 のメンバーが使用済み → G2プールの最小は count=4

**変更前:** minCount=3（G1で使われた人含む）→ G2候補全員に (4-3)*50=+50 以上のペナルティ
**変更後:** poolMinCount=4（G2プール内）→ count=4 のメンバーはペナルティ 0

G2プール内での相対的な均等性が正しく評価される。

## 受け入れ基準

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | プール内で count が均一な場合、均等配分ペナルティが 0 | ペナルティ差なし |
| T2 | プール内で count 差があるメンバーは低 count が優先 | 低 count メンバーが選出 |
| T3 | 異なるプール間の count 差はペナルティに影響しない | LOWER count=5 でも LOWER プール内 min=5 なら 0 |
| T4 | ハード制約（言語バランス等）は従来通り遵守 | 既存テスト全パス |
