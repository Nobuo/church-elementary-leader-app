# 仕様書: 割り当て偏り警告の閾値改善

## 機能概要

`checkExcessiveCount` の警告閾値を改善し、目安回数が少ない（生成月数が少ない）場合に誤った「多すぎ／少なすぎ」警告が出ないようにする。

## 背景・問題

### 再現手順
1. 2026年4月のスケジュールを自動生成する
2. 2026年5月のスケジュールを自動生成する
3. 5月の結果画面で複数人に「2回（目安 ~1.3回、多すぎ）」という警告が表示される

### 原因

現在の閾値ロジック:
- **多すぎ**: `count > expectedCount * 1.5`
- **少なすぎ**: `count < expectedCount * 0.5 && count > 0`

`totalSlots` の計算自体は既に修正済み（`assignedSundays` ベース）で正確。問題は **1.5倍の閾値が低い目安回数で機能しない** こと。

#### 具体例

- 4月（4週: スロット計14）＋ 5月（4週: スロット計14）＝ 合計28スロット
- アクティブメンバー22人の場合: `expectedCount = 28 / 22 ≈ 1.27`
- 「多すぎ」閾値: `1.27 * 1.5 = 1.91`
- **2回の人は全員警告対象** (2 > 1.91)

しかし28スロットを22人で均等割すると、6人が2回・16人が1回となる。これは**最も均等な配分**であり、2回の人に警告が出るのは不適切。

### 本質的な問題

割り当て回数は離散値（整数）なので、`ceil(expectedCount)` を持つ人が出るのは必然。相対閾値（1.5倍）は `expectedCount` が大きい時は有効だが、小さい時（1〜3程度）は整数の丸め誤差に対して過敏になる。

## ユースケース

### 正常系

| # | シナリオ | expected | 修正前の「多すぎ」閾値 | 修正後の閾値 | 期待動作 |
|---|---------|----------|---------------------|------------|---------|
| 1 | 2ヶ月生成（28 slots / 22人） | ~1.3 | 1.95 → 2回で警告 | 3.3 → 4回で警告 | 2回では警告なし |
| 2 | 6ヶ月生成（84 slots / 22人） | ~3.8 | 5.7 → 6回で警告 | 5.8 → 6回で警告 | 従来と同等 |
| 3 | 12ヶ月生成（168 slots / 22人） | ~7.6 | 11.4 → 12回で警告 | 11.4 → 12回で警告 | 従来と同等 |
| 4 | 1ヶ月だけ生成（14 slots / 22人） | ~0.6 | 0.95 → 1回で警告 | 2.6 → 3回で警告 | 1回では警告なし |

### 異常系

| # | シナリオ | 期待動作 |
|---|---------|---------|
| 1 | 1人が極端に多い（expected 1.3 で 5回） | 警告が出る（5 > 3.3） |
| 2 | activeMembers = 0 | 既存のガードで violations = [] |
| 3 | totalSlots = 0 | 既存のガードで violations = [] |

## ドメインモデル（DDD観点）

### 変更対象
- `constraint-checker.ts` の `checkExcessiveCount()` — ドメインサービス

### 変更なし
- `generate-assignments.ts` — `totalSlots` 計算は既に正確。`checkExcessiveCount` の呼び出し方は変更不要
- `Assignment` エンティティ
- リポジトリ

## 制約・ビジネスルール

### 新しい閾値ルール

相対閾値に**最小絶対差**を加え、低い目安でも不要な警告を防ぐ:

```
多すぎ: count > expectedCount * 1.5  AND  count > expectedCount + 2
少なすぎ: count < expectedCount * 0.5  AND  count < expectedCount - 2  AND  count > 0
```

等価な記述:
```
多すぎ: count > Math.max(expectedCount * 1.5, expectedCount + 2)
少なすぎ: count < Math.min(expectedCount * 0.5, expectedCount - 2) && count > 0
```

#### 動作

- **expected が大きい場合**（≧4）: `1.5倍` が支配的 → 従来とほぼ同じ動作
- **expected が小さい場合**（＜4）: `+2` が支配的 → 整数離散値の影響を吸収

交差点: `expectedCount * 1.5 = expectedCount + 2` → `expected = 4` で切り替わる。

## 入出力の定義

### 変更対象: `checkExcessiveCount()`

**シグネチャ**: 変更なし

```typescript
export function checkExcessiveCount(
  members: Member[],
  assignmentCounts: Map<MemberId, number>,
  totalSlots: number,
): ConstraintViolation[]
```

**内部ロジック変更**:

```typescript
// 修正前
if (count > expectedCount * 1.5) { ... too many }
else if (count < expectedCount * 0.5 && count > 0) { ... too few }

// 修正後
const tooManyThreshold = Math.max(expectedCount * 1.5, expectedCount + 2);
const tooFewThreshold = Math.min(expectedCount * 0.5, expectedCount - 2);
if (count > tooManyThreshold) { ... too many }
else if (count < tooFewThreshold && count > 0) { ... too few }
```

## 受け入れ基準（テスト観点）

### ユニットテスト（`constraint-checker.test.ts`）

1. **expected ~1.3、count = 2 → 警告なし**（メインの修正対象）
2. **expected ~1.3、count = 4 → 「多すぎ」**（本当に多い場合は警告）
3. **expected ~7.6、count = 12 → 「多すぎ」**（高 expected は従来通り）
4. **expected ~7.6、count = 8 → 警告なし**（高 expected でも微差は許容）
5. **expected ~1.3、count = 1 → 「少なすぎ」にならない**
6. **expected ~7.6、count = 2 → 「少なすぎ」**（高 expected で大きく下回る場合）

### インテグレーションテスト

1. 4月生成 → 5月生成 → 「多すぎ」警告が出ないこと
2. 4〜9月生成 → 偏りがある場合に従来通り警告が出ること（リグレッションなし）
