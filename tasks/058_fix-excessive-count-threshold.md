# タスク 058: 割り当て偏り警告の閾値改善

## 概要
`checkExcessiveCount` の閾値に最小絶対差（+2）を追加し、目安回数が低い場合の誤警告を防ぐ。

## 対象ファイル
- `src/domain/services/constraint-checker.ts`（変更: 閾値ロジック）
- `tests/domain/constraint-checker.test.ts`（変更: テスト追加）

## 実装手順

### 1. `checkExcessiveCount` の閾値修正

`constraint-checker.ts:167,176` を変更:

```typescript
// 修正前
if (count > expectedCount * 1.5) { ... }
else if (count < expectedCount * 0.5 && count > 0) { ... }

// 修正後
const tooManyThreshold = Math.max(expectedCount * 1.5, expectedCount + 2);
const tooFewThreshold = Math.min(expectedCount * 0.5, expectedCount - 2);
if (count > tooManyThreshold) { ... }
else if (count < tooFewThreshold && count > 0) { ... }
```

### 2. 既存テスト更新

`constraint-checker.test.ts` の既存テストケースを確認し、閾値変更による影響を修正:
- 既存の `returns violations for imbalanced counts` は `totalSlots=40, 2人, counts=[31,15]` → expected=20, tooMany=30 → 31>30 ✓ パスするはず
- 既存の `detects both too-many and too-few` は `totalSlots=48, 3人, counts=[25,7,25]` → expected=16, tooMany=24, tooFew=6 → 25>24 ✓, 7>6 なので too-few は出なくなる → **要修正**

### 3. テスト追加

以下のテストケースを追加:

1. **低 expected で count = ceil(expected) は警告なし**
   - `totalSlots=28, 22人` → expected≈1.27, count=2 → 2 < 3.27 → 警告なし

2. **低 expected で本当に多い場合は警告あり**
   - `totalSlots=28, 22人` → expected≈1.27, count=4 → 4 > 3.27 → 「多すぎ」

3. **高 expected では従来通り**
   - `totalSlots=168, 22人` → expected≈7.6, count=12 → 12 > 11.4 → 「多すぎ」

4. **少なすぎ: 低 expected では発動しにくい**
   - `totalSlots=28, 22人` → expected≈1.27, tooFew=min(0.64, -0.73)=-0.73 → 正のcountでは発動しない

## 依存タスク
なし

## テスト方針
- ユニットテスト: `constraint-checker.test.ts` で閾値の境界値を検証
- 手動テスト: 4月生成→5月生成で「多すぎ」警告が出ないこと確認

## 完了条件
- [x] `checkExcessiveCount` の閾値が `max(1.5x, +2)` / `min(0.5x, -2)` に変更されている
- [x] 既存テストが閾値変更に合わせて更新されている（変更不要だった）
- [x] 低 expected / 高 expected の境界値テストが追加されている（4件追加）
- [x] 全テストがパスする（domain 167件 + application 31件）
