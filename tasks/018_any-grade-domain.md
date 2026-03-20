# タスク 018: ANY学年区分 — ドメイン層・アルゴリズム

## 概要

`GradeGroup` に `ANY` を追加し、割り当て生成アルゴリズムで ANY メンバーを UPPER/LOWER 両プールに含める。

## 仕様書

`specs/any-grade-group.md`（R1, R2, R3, R4）

## 依存タスク

なし

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/value-objects/grade-group.ts` | `ANY: 'ANY'` を追加 |
| `src/domain/services/assignment-generator.ts` | プール振り分けで `ANY` を両方に含める |
| `tests/domain/assignment-generator.test.ts` | ANY 関連テスト T1〜T4 を追加 |

## 実装手順

### Step 1: GradeGroup に ANY を追加

```typescript
export const GradeGroup = {
  LOWER: 'LOWER',
  UPPER: 'UPPER',
  ANY: 'ANY',
} as const;
```

### Step 2: assignment-generator.ts のプール振り分けを更新

```typescript
// 変更前
const upperBase = available.filter((m) => m.gradeGroup === GradeGroup.UPPER);
const lowerBase = available.filter((m) => m.gradeGroup === GradeGroup.LOWER);

// 変更後
const upperBase = available.filter((m) => m.gradeGroup === GradeGroup.UPPER || m.gradeGroup === GradeGroup.ANY);
const lowerBase = available.filter((m) => m.gradeGroup === GradeGroup.LOWER || m.gradeGroup === GradeGroup.ANY);
```

### Step 3: 型チェック

```bash
npm run typecheck
```

### Step 4: テスト追加・実行

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | ANY メンバーが G1・G2 両方の候補になる | 両グループに割り当て可能 |
| T2 | ANY メンバーが G1 で選出された場合、G2 に重複しない | usedIds で除外 |
| T3 | 分級日で ANY+BOTH メンバーが CLASS_LANGUAGE_COVERAGE に寄与 | 違反なし |
| T4 | ANY メンバーなしの場合、既存動作に影響なし | 既存テスト全パス |

### Step 5: 全テスト実行

```bash
npm test
npm run typecheck
npm run lint
```

## 完了条件

- [x] `GradeGroup.ANY` が定義されている
- [x] ANY メンバーが UPPER/LOWER 両プールに含まれる
- [x] G1/G2 重複防止が機能する
- [x] 既存テスト＋新規テストが全パスする
- [x] `npm run typecheck` / `npm run lint` が通る
