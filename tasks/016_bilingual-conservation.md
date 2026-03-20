# タスク 016: バイリンガル(BOTH)メンバー温存

## 概要

`scorePair()` のBOTH関連スコアリングを変更し、BOTHメンバーの不必要な消費を防ぐ。分級日のBOTH優遇をGroup 2のみに限定し、全日程でBOTH温存ペナルティを追加する。

## 仕様書

`specs/bilingual-conservation.md`

## 依存タスク

- タスク 012（同区分ペアアルゴリズム — 完了済み）

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/services/assignment-generator.ts` | `scorePair()` のBOTH優遇条件変更 + BOTH温存ペナルティ追加 |
| `tests/domain/assignment-generator.test.ts` | BOTH温存関連テスト追加 |

## 実装手順

### Step 1: scorePair() のBOTH優遇条件を変更

**変更前（76-83行付近）:**
```typescript
// Split-class day: prefer BOTH members to ensure bilingual coverage
if (isSplitClassDay) {
  for (const m of [member1, member2]) {
    if (m.language === Language.BOTH) {
      score -= 5;
    }
  }
}
```

**変更後:**
```typescript
// BOTH conservation: prefer non-BOTH members when possible
for (const m of [member1, member2]) {
  if (m.language === Language.BOTH) {
    score += 3;
  }
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

### Step 2: 型チェック

```bash
npm run typecheck
```

### Step 3: テスト追加

`tests/domain/assignment-generator.test.ts` に以下のテストを追加:

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | 通常日: BOTH+JP と BOTH+BOTH が可能な場合、BOTH+JP が優先 | Group 1 に BOTH 1人のみ |
| T2 | 通常日: BOTHが言語バランスに必須の場合、正しく選出される | BOTH+JP が選出される |
| T3 | 分級日 Group 1: BOTH+JP が BOTH+BOTH より優先 | Group 1 に BOTH 1人のみ |
| T4 | 分級日 Group 2: BOTH+BOTH が優先（バイリンガルカバレッジ） | Group 2 に BOTH 2人 |
| T5 | 月4日間で BOTH 5人が重複なく割り当て | 月内重複なし |

### Step 4: 既存テスト修正（必要な場合）

温存ペナルティによりBOTH選出順が変わる可能性がある既存テストを確認・修正。

### Step 5: 全テスト実行

```bash
npm test
npm run typecheck
npm run lint
```

## 完了条件

- [x] 通常日: BOTH温存ペナルティ（`+3`/BOTH人）が適用される
- [x] 分級日G1: 単独BOTH優遇（`-1`）＋二重BOTHペナルティ（`+5`）が適用される
- [x] 分級日BOTH優遇が Group 2（classContextあり）のみに限定される
- [x] 通常日・分級日G1 で BOTH+JP が BOTH+BOTH より優先される
- [x] 分級日G2 で BOTH+BOTH が優先される
- [x] 新規テスト5件追加（T1〜T5）
- [x] 既存テスト＋新規テストが全パスする（242件）
- [x] `npm run typecheck` / `npm run lint` が通る
