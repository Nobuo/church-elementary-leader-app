# タスク 012: 同区分ペア選出アルゴリズムへの変更

## 概要

割り当てアルゴリズムを「グループ1＝高学年2人、グループ2＝低学年2人」に変更する。`pickBestPair(upper, lower)` を `pickBestPairSameGrade(candidates)` にリファクタし、同区分から2人を選出するようにする。

## 仕様書

`specs/group-by-grade.md`

## 依存タスク

なし（本機能の最初のタスク）

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/services/assignment-generator.ts` | `PairResult` 変更、`pickBestPairSameGrade` 新設、`generateAssignments` のグループ選出ロジック変更 |

## 実装手順

### Step 1: PairResult インターフェースを変更

`PairResult` の `upper`/`lower` を `member1`/`member2` に変更:

```typescript
interface PairResult {
  member1: Member;
  member2: Member;
  violations: ConstraintViolation[];
}
```

### Step 2: pickBestPairSameGrade を実装

`pickBestPair` を `pickBestPairSameGrade` にリファクタ。1つのプールから2人を選出:

```typescript
function pickBestPairSameGrade(
  candidates: Member[],
  context: GenerationContext,
  monthAssignments: Assignment[],
  dayAssignments: Assignment[],
  pastPairCounts: Map<string, number>,
  classContext?: ClassContext,
  isSplitClassDay?: boolean,
): PairResult | null {
  if (candidates.length < 2) return null;

  let bestScore = Infinity;
  let bestPair: PairResult | null = null;

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const { score, violations } = scorePair(
        candidates[i], candidates[j],
        context, monthAssignments, dayAssignments,
        pastPairCounts, classContext, isSplitClassDay,
      );

      if (score < bestScore) {
        bestScore = score;
        bestPair = {
          member1: candidates[i],
          member2: candidates[j],
          violations: score >= 100000 ? violations : [],
        };
      }
    }
  }

  if (bestPair && bestScore >= 100000) {
    const { violations } = scorePair(
      bestPair.member1, bestPair.member2,
      context, monthAssignments, dayAssignments,
      pastPairCounts, classContext, isSplitClassDay,
    );
    bestPair.violations = violations;
  }

  return bestPair;
}
```

### Step 3: generateAssignments のグループ選出を変更

グループ1 = UPPER、グループ2 = LOWER に変更:

```typescript
// Group 1 (UPPER): pick 2 from upperPool
const group1Result = pickBestPairSameGrade(
  upperMembers, context, monthAssignments, dayAssignments,
  pastPairCounts, undefined, schedule.isSplitClass,
);

if (group1Result) {
  const assignment1 = Assignment.create(schedule.id, 1, [
    group1Result.member1.id,
    group1Result.member2.id,
  ]);
  // ... update counts, pair counts

  // Group 2 (LOWER): pick 2 from lowerPool
  // Remove any members used in Group 1 (relevant for crossover case)
  const usedIds = new Set([group1Result.member1.id, group1Result.member2.id]);
  const remainingLower = lowerMembers.filter((m) => !usedIds.has(m.id));

  const group2ClassContext = schedule.isSplitClass
    ? { group1Members: [group1Result.member1, group1Result.member2] as [Member, Member] }
    : undefined;

  const group2Result = pickBestPairSameGrade(
    remainingLower, context, monthAssignments, dayAssignments,
    pastPairCounts, group2ClassContext, schedule.isSplitClass,
  );

  if (group2Result) {
    const assignment2 = Assignment.create(schedule.id, 2, [
      group2Result.member1.id,
      group2Result.member2.id,
    ]);
    // ...
  }
}
```

### Step 4: 人数不足チェックの調整

現在は `upperMembers.length < 2 || lowerMembers.length < 2` でチェック。同区分ペアなので変更なし（各区分2人以上必要は同じ）。

### Step 5: pickBestPair を削除

旧 `pickBestPair` を削除。

### Step 6: 型チェック

```bash
npm run typecheck
```

## テスト方針

### 既存テスト修正

既存の `tests/domain/assignment-generator.test.ts` のテストは、現在 `a.memberIds[0]` = UPPER、`a.memberIds[1]` = LOWER を期待している。変更後は `groupNumber === 1` の assignment が UPPER ペア、`groupNumber === 2` が LOWER ペアになるため、アサーションを修正。

### 新規テスト

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | 通常日: グループ1の全メンバーが UPPER | `groupNumber=1` の memberIds が全員 UPPER |
| T2 | 通常日: グループ2の全メンバーが LOWER | `groupNumber=2` の memberIds が全員 LOWER |
| T3 | 各グループ内で言語バランスが取れている | JP + EN のカバレッジあり |
| T4 | 分級日 + 横断: UPPER BOTH がグループ2に入る | グループ2 に UPPER メンバー含む |
| T5 | 分級日 + 非BOTH は横断しない | JP/EN は自区分グループのみ |

## 完了条件

- [ ] `pickBestPairSameGrade` が同区分から2人を選出する
- [ ] グループ1 = UPPER ペア、グループ2 = LOWER ペアで生成される
- [ ] 分級日の区分横断が正しく動作する
- [ ] 既存テスト（修正後）が全パスする
- [ ] 新規テストが全パスする
- [ ] `npm run typecheck` が通る
