# タスク 022: プール内相対均等配分

## 概要

`scorePair()` の均等配分ペナルティの基準を「全メンバーの最小count」から「候補プール内の最小count」に変更する。

## 仕様書

`specs/pool-relative-distribution.md`（R1〜R4）

## 依存タスク

なし

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/services/assignment-generator.ts` | `pickBestPairSameGrade()` で poolMinCount を計算、`scorePair()` に渡す |
| `tests/domain/assignment-generator.test.ts` | T1〜T4 テスト追加 |

## 実装手順

### Step 1: `scorePair()` に `poolMinCount` 引数を追加

```typescript
// 変更前
function scorePair(
  member1, member2, context, monthAssignments, dayAssignments,
  pastPairCounts, classContext?, isSplitClassDay?,
)

// 変更後
function scorePair(
  member1, member2, context, monthAssignments, dayAssignments,
  pastPairCounts, classContext?, isSplitClassDay?, poolMinCount?: number,
)
```

### Step 2: 均等配分ペナルティを poolMinCount 基準に変更

```typescript
// 変更前
const minCount = Math.min(...context.members.filter((m) => m.isActive).map((m) => counts.get(m.id) ?? 0));

// 変更後
const minCount = poolMinCount ?? Math.min(...context.members.filter((m) => m.isActive).map((m) => counts.get(m.id) ?? 0));
```

### Step 3: `pickBestPairSameGrade()` で poolMinCount を計算して渡す

```typescript
function pickBestPairSameGrade(candidates, context, ...) {
  const counts = context.assignmentCounts;
  const poolMinCount = Math.min(...candidates.map(m => counts.get(m.id) ?? 0));
  // ループ内で scorePair(..., poolMinCount) に渡す
}
```

### Step 4: 型チェック

```bash
npm run typecheck
```

### Step 5: テスト追加・実行

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | プール内 count 均一 → 均等配分ペナルティが効かない | 他のソフト制約で選出が決まる |
| T2 | プール内 count 差ありメンバー → 低 count が優先 | 低 count メンバー選出 |
| T3 | 異なるプール間の count 差がペナルティに影響しない | LOWER count=5 でも LOWER min=5 ならペナルティ 0 |
| T4 | ハード制約は従来通り遵守（50回実行） | 言語バランス違反なし |

### Step 6: 全テスト実行

```bash
npm test
npm run typecheck
npm run lint
```

## 完了条件

- [x] `scorePair()` に `poolMinCount` 引数が追加されている
- [x] `pickBestPairSameGrade()` でプール内 minCount を計算して渡している
- [x] プール内で均等配分が正しく機能するテストが追加されている
- [x] 既存テスト＋新規テストが全パスする
- [x] `npm run typecheck` / `npm run lint` が通る
