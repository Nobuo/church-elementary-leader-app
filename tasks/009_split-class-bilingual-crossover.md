# タスク 009: 分級日のバイリンガル区分横断 ✅ 完了

## 概要

分級日（`isSplitClass = true`）に限り、バイリンガル（`language = BOTH`）メンバーの担当区分横断を許可する。LOWERにBOTHが不足している場合、UPPERのBOTHをLOWER候補プールに追加する（逆も同様）。

## 仕様書

`specs/grade-group-display-and-crossover.md` — ビジネスルール R2, R3 / UC2, UC3, UC4

## 依存タスク

- タスク 008（ViolationType定義が必要）

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/services/assignment-generator.ts` | `generateAssignments()` の候補プール構築ロジック変更 |

## 実装手順

### Step 1: generateAssignments() の候補プール構築を変更

`src/domain/services/assignment-generator.ts` の `generateAssignments()` 内、各スケジュール日のループで、UPPER/LOWERメンバー分類後にプール拡張ロジックを追加。

現在のコード（217-218行付近）:
```typescript
const upperMembers = available.filter((m) => m.gradeGroup === GradeGroup.UPPER);
const lowerMembers = available.filter((m) => m.gradeGroup === GradeGroup.LOWER);
```

変更後:
```typescript
const upperBase = available.filter((m) => m.gradeGroup === GradeGroup.UPPER);
const lowerBase = available.filter((m) => m.gradeGroup === GradeGroup.LOWER);

let upperMembers = upperBase;
let lowerMembers = lowerBase;

// 分級日: BOTHメンバーの区分横断を検討
if (schedule.isSplitClass) {
  const upperBothCount = upperBase.filter((m) => m.language === Language.BOTH).length;
  const lowerBothCount = lowerBase.filter((m) => m.language === Language.BOTH).length;

  // LOWERにBOTHが不足し、UPPERにBOTHが余裕ある場合
  if (lowerBothCount < 1 && upperBothCount > 2) {
    lowerMembers = [
      ...lowerBase,
      ...upperBase.filter((m) => m.language === Language.BOTH),
    ];
  }
  // UPPERにBOTHが不足し、LOWERにBOTHが余裕ある場合
  if (upperBothCount < 1 && lowerBothCount > 2) {
    upperMembers = [
      ...upperBase,
      ...lowerBase.filter((m) => m.language === Language.BOTH),
    ];
  }
}
```

### Step 2: Group 2 の残りメンバー算出を修正

Group 1 でメンバーが選ばれた後の残りメンバー算出（266-267行付近）も、拡張されたプールを正しく反映する必要がある。現在のコードは `upperMembers` / `lowerMembers` を使っているのでそのまま動作する。

ただし、**同じメンバーが両プールに存在する**ケースがあるため、Group 1 で使用されたメンバーの除外ロジック（`usedIds`）が正しく動くことを確認する。

```typescript
const remainingUpper = upperMembers.filter((m) => !usedIds.has(m.id));
const remainingLower = lowerMembers.filter((m) => !usedIds.has(m.id));
```

→ `usedIds` で除外されるため、同一メンバーが両プールにいても二重割り当ては起きない。変更不要。

### Step 3: 人数不足チェックの調整

現在の人数不足チェック（220-230行付近）は `upperMembers.length` / `lowerMembers.length` を使っている。プール拡張後の変数を使うように確認。プール拡張はこのチェックの後ではなく前に行うため、順序に注意。

**実装順序:**
1. `upperBase` / `lowerBase` で分類
2. プール拡張（分級日の場合）
3. 人数チェック（拡張後のプールで判定）

### Step 4: 型チェック・既存テスト

```bash
npm run typecheck
npm test
```

## テスト方針

### 単体テスト追加（`tests/domain/services/assignment-generator.test.ts`）

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | 通常日: UPPERメンバーがLOWER枠に入らない | `memberIds[1]` が全てLOWERメンバー |
| T2 | 通常日: LOWERメンバーがUPPER枠に入らない | `memberIds[0]` が全てUPPERメンバー |
| T3 | 分級日 + LOWERにBOTH十分 → 横断なし | 全員が自分の区分枠 |
| T4 | 分級日 + LOWERにBOTH 0名 + UPPERにBOTH 3名以上 → UPPER BOTHがLOWER枠へ | BOTH 2名要件を満たす |
| T5 | 分級日 + 非BOTHは横断しない | language=JP/ENは自分の区分のみ |
| T6 | 分級日 + UPPERにBOTH不足 + LOWERにBOTH余裕 → LOWER BOTHがUPPER枠へ | BOTH 2名要件を満たす |

テストデータは既存のテストヘルパー（`tests/integration/helpers/setup.ts`）のパターンを参考に、BOTHの偏りを作成する。

## 完了条件

- [ ] 通常日で区分横断が発生しないことが確認できる
- [ ] 分級日 + LOWER BOTH不足時にUPPERのBOTHがLOWER候補プールに追加される
- [ ] 分級日 + UPPER BOTH不足時にLOWERのBOTHがUPPER候補プールに追加される
- [ ] 非BOTHメンバーは分級日でも横断しない
- [ ] 既存テストが全パスする
- [ ] 新規単体テストが全パスする
