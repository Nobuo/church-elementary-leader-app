# タスク 023: スケジュール処理順シャッフル

## 概要

`generateAssignments()` のスケジュール処理順を日付順固定からランダム順に変更し、毎回異なる割り当て結果を生み出す。

## 仕様書

`specs/schedule-order-shuffle.md`（R1〜R4）

## 依存タスク

なし

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/services/assignment-generator.ts` | `activeDates` のソートをシャッフルに変更（1行） |
| `tests/domain/assignment-generator.test.ts` | T1〜T3 テスト追加 |

## 実装手順

### Step 1: スケジュール処理順を変更

```typescript
// 変更前
const activeDates = schedules.filter((s) => !s.isExcluded).sort((a, b) => a.date.localeCompare(b.date));

// 変更後
const activeDates = shuffle(schedules.filter((s) => !s.isExcluded));
```

### Step 2: 型チェック

```bash
npm run typecheck
```

### Step 3: テスト追加

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | 複数回生成で異なる割り当て結果が出る | 10回中2種類以上 |
| T2 | ハード制約が常に遵守される（50回） | 言語バランス違反なし |
| T3 | 全日程に割り当てが生成される | 日数 × 2 の割り当て |

### Step 4: 全テスト実行

```bash
npm test
npm run typecheck
npm run lint
```

## 完了条件

- [x] `activeDates` がシャッフルされている
- [x] 複数回生成で異なる結果が出ることをテストで確認
- [x] ハード制約が常に遵守されることをテストで確認
- [x] 既存テスト＋新規テストが全パスする
- [x] `npm run typecheck` / `npm run lint` が通る
