# タスク 021: ヘルパー後回し（HELPER deferral）

## 概要

`scorePair()` にヘルパーペナルティ（+5/人）を追加し、同等条件では親を優先的に選出する。

## 仕様書

`specs/helper-deferral.md`（R1〜R4）

## 依存タスク

なし

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/services/assignment-generator.ts` | `scorePair()` にヘルパーペナルティ追加 |
| `tests/domain/assignment-generator.test.ts` | T1〜T3 テスト追加 |

## 実装手順

### Step 1: `scorePair()` にヘルパーペナルティを追加

ペア多様性の直前（`return` の前）に追加:

```typescript
// SOFT: HELPER deferral — prefer PARENT members when scores are close
for (const m of [member1, member2]) {
  if (m.memberType === MemberType.HELPER) {
    score += 5;
  }
}
```

### Step 2: 型チェック

```bash
npm run typecheck
```

### Step 3: テスト追加

`tests/domain/assignment-generator.test.ts` に `describe('HELPER deferral')` を追加:

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | 同条件（count=0）で親ペア vs ヘルパーペア | 親ペアが選出される頻度が高い |
| T2 | ヘルパーのcountが十分低い場合 | ヘルパーが選出される（均等配分優先） |
| T3 | ハード制約は常に遵守（50回実行） | 言語バランス違反なし |

### Step 4: 全テスト実行

```bash
npm test
npm run typecheck
npm run lint
```

## 完了条件

- [x] `scorePair()` にヘルパーペナルティ（+5/人）が追加されている
- [x] 同条件で親が優先されることをテストで確認
- [x] 均等配分がヘルパーペナルティに勝つことをテストで確認
- [x] 既存テスト＋新規テストが全パスする
- [x] `npm run typecheck` / `npm run lint` が通る
