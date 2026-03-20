# タスク 016: バイリンガル(BOTH)メンバー温存

## 概要

`scorePair()` のBOTH関連スコアリングを変更し、合同日はBOTHの消費を抑え、分級日はG1（UPPER）でカバレッジを完結させてG2（LOWER）のBOTHを解放する。

## 仕様書

`specs/bilingual-conservation.md`

## 依存タスク

- タスク 012（同区分ペアアルゴリズム — 完了済み）

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/services/assignment-generator.ts` | `scorePair()` のBOTH関連スコアリング3箇所を1ブロックに統合 |
| `tests/domain/assignment-generator.test.ts` | BOTH温存関連テストを更新・追加 |

## 実装手順

### Step 1: scorePair() のBOTH関連ロジックを変更

**変更前（現在の実装）:**
```typescript
// BOTH conservation: prevent unnecessary consumption of bilingual members
if (!isSplitClassDay) {
  for (const m of [member1, member2]) {
    if (m.language === Language.BOTH) {
      score += 3;
    }
  }
} else if (!classContext) {
  const bothInPair = [member1, member2].filter((m) => m.language === Language.BOTH).length;
  if (bothInPair === 1) score -= 1;
  if (bothInPair === 2) score += 5;
}

// Split-class day Group 2: prefer BOTH for bilingual coverage
if (classContext) {
  for (const m of [member1, member2]) {
    if (m.language === Language.BOTH) {
      score -= 5;
    }
  }
}
```

**変更後:**
```typescript
// BOTH conservation / split-day optimization
if (!isSplitClassDay) {
  // 合同日: BOTH温存（非BOTHを優先）
  for (const m of [member1, member2]) {
    if (m.language === Language.BOTH) {
      score += 3;
    }
  }
} else if (!classContext) {
  // 分級日 Group 1: ちょうど1 BOTHを狙う
  const bothInPair = [member1, member2].filter((m) => m.language === Language.BOTH).length;
  if (bothInPair === 0) score += 5; // G1はBOTHを1人出すべき
  if (bothInPair === 2) score += 3; // BOTH+BOTHは過剰消費
}
// 分級日 Group 2: BOTH優遇なし（ハード制約のみ）
```

### スコア表

| シナリオ | BOTH+BOTH | BOTH+JP | JP+EN |
|----------|-----------|---------|-------|
| 合同日 | +6 | +3 | 0 |
| 分級日 G1 | **+3** | **0** | +5 |
| 分級日 G2 | 0 | 0 | 0 |

### Step 2: 型チェック

```bash
npm run typecheck
```

### Step 3: テスト更新・追加

`tests/domain/assignment-generator.test.ts` の `BOTH conservation` describe を更新:

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | 合同日: BOTH+JP と BOTH+BOTH が可能な場合、BOTH+JP が優先 | Group 1 に BOTH 1人のみ |
| T2 | 合同日: BOTHが言語バランスに必須の場合、正しく選出される | BOTH+JP が選出される |
| T3 | 分級日 Group 1: BOTH+JP が BOTH+BOTH より優先される | Group 1 に BOTH 1人 |
| T4 | 分級日 Group 2: ハード制約でCLASS_LANGUAGE_COVERAGE担保 | 違反なし |
| T5 | 分級日: G1がJP+ENを選ばない（0人ペナルティ） | G1にBOTH 1人 |
| T6 | 月4日間で UPPER BOTHメンバーが重複しない | 各UPPER BOTH月1回以下 |

### Step 4: 既存テスト修正（必要な場合）

分級日G1でのBOTH選出方向が逆転する（温存→推奨）ため、既存テストの期待値を確認・修正。

### Step 5: 全テスト実行

```bash
npm test
npm run typecheck
npm run lint
```

## 完了条件

- [x] 合同日: BOTH温存ペナルティ（`+3`/BOTH人）が適用される
- [x] 分級日G1: 1 BOTH狙い（0人: `+5`, 2人: `+3`, 1人: `0`）
- [x] 分級日G2: BOTH優遇が削除され、ハード制約のみでカバレッジ担保
- [x] UPPER BOTHメンバーが月内重複しない
- [x] 既存テスト＋新規テストが全パスする（243 passed）
- [x] `npm run typecheck` / `npm run lint` が通る
