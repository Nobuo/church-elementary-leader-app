# タスク 028: 合同日の割り当て生成ロジック（3人×1グループ）

## 概要
`assignment-generator.ts` を変更し、合同日（`isSplitClass = false`）では UPPER/LOWER 混合プールから3人を選出して1グループのみ生成するようにする。

## 依存タスク
- 027（Assignment エンティティの可変長対応）

## 対象ファイル
- `src/domain/services/assignment-generator.ts`

## 実装手順

### Step 1: 合同日の処理分岐を追加

`generateAssignments()` 内の `for (const schedule of activeDates)` ループ:

```
if (!schedule.isSplitClass) {
  // === 合同日: 3人×1グループ ===
  // UPPER + LOWER の全有効メンバーから3人を選出
} else {
  // === 分級日: 2人×2グループ（既存ロジック）===
}
```

### Step 2: 合同日用の3人選出関数を追加

```typescript
function pickBestTrioMixed(
  candidates: Member[],
  context: GenerationContext,
  monthAssignments: Assignment[],
  dayAssignments: Assignment[],
  pastPairCounts: Map<string, number>,
): TrioResult | null;
```

- 全メンバー（UPPER + LOWER、イベント日ならHELPER除外済み）を候補プールとする
- 全3人組み合わせ（C(n,3)）をスコアリング
- 最低スコアの組み合わせを選出

### Step 3: 3人グループ用スコアリング関数を追加

```typescript
function scoreTrioCombined(
  members: [Member, Member, Member],
  context: GenerationContext,
  monthAssignments: Assignment[],
  dayAssignments: Assignment[],
  pastPairCounts: Map<string, number>,
  poolMinCount: number,
): { score: number; violations: ConstraintViolation[] };
```

**スコアリングルール（合同日3人）:**

| 制約 | ロジック |
|------|---------|
| 言語バランス | 3人中に EN≧1 & JP≧1（ハード: +100000） |
| 同性ペア制限 | **適用しない** |
| 夫婦回避 | 3人中の全2人組み合わせ（3ペア）で夫婦がいたら +30/組 |
| BOTH温存 | BOTH 1人につき +3 |
| 月内重複 | 月内に既に割り当て済みのメンバー +100/人 |
| 均等性 | (担当回数 - poolMin) × 50/人 |
| 参加日優先 | availableDates 制限ありの人 -30/人 |
| HELPER後回し | 月内重複かつHELPER +5/人 |
| ペア多様性 | 3人中の3ペア分の過去カウント × 10/ペア |

### Step 4: 合同日の Assignment 生成

- `Assignment.create(schedule.id, 1, [m1.id, m2.id, m3.id])` — groupNumber は常に 1
- counts / pastPairCounts を3人分更新（3ペア分）

### Step 5: pastPairCounts の初期化を可変長対応

`generateAssignments()` 内の既存 pastPairCounts 初期化:
```typescript
// 変更前: 2人固定
const pk = pairKey(a.memberIds[0], a.memberIds[1]);

// 変更後: 2人 or 3人対応
for (let i = 0; i < a.memberIds.length; i++) {
  for (let j = i + 1; j < a.memberIds.length; j++) {
    const pk = pairKey(a.memberIds[i], a.memberIds[j]);
    pastPairCounts.set(pk, (pastPairCounts.get(pk) ?? 0) + 1);
  }
}
```

## テスト方針

- 合同日に Assignment が1つ（groupNumber=1）、3人で生成されること
- 分級日に Assignment が2つ（groupNumber=1,2）、各2人で生成されること（リグレッション）
- 合同日の3人に EN≧1 & JP≧1 が含まれること
- 合同日で UPPER と LOWER のメンバーが混在して選出されること
- 合同日で同性ペア制限が適用されないこと
- 合同日で夫婦が同一グループに含まれないこと
- 合同日で BOTH 温存（+3/人）が適用されること
- 月間で担当回数が均等に分散されること

## 完了条件
- [ ] 合同日が3人×1グループで生成される
- [ ] 分級日が2人×2グループのまま（リグレッションなし）
- [ ] スコアリングルールが仕様通り適用される
- [ ] pastPairCounts が3人ペアに対応している
- [ ] ユニットテストが通る
