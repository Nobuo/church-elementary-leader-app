# タスク 017: 同スコア時のランダム化（タイブレーク揺らぎ）

## 概要

`pickBestPairSameGrade()` で同スコアのペア候補が複数ある場合に、配列順バイアスを解消するためランダム化を導入する。

## 仕様書

`specs/shuffle-tiebreak.md`

## 依存タスク

- タスク 016（バイリンガル温存 — 完了済み）

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/services/assignment-generator.ts` | `shuffle()` 関数追加、`pickBestPairSameGrade()` 内にシャッフル＋同スコアランダム |
| `tests/domain/assignment-generator.test.ts` | 既存テストの確認・修正、ランダム化テスト追加 |

## 実装手順

### Step 1: `shuffle()` ユーティリティ関数を追加

`assignment-generator.ts` 内にファイルローカルの Fisher-Yates シャッフルを追加:

```typescript
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
```

### Step 2: `pickBestPairSameGrade()` を変更

```typescript
// 変更前
for (let i = 0; i < candidates.length; i++) {
  for (let j = i + 1; j < candidates.length; j++) {
    ...
    if (score < bestScore) {

// 変更後
const shuffled = shuffle(candidates);
for (let i = 0; i < shuffled.length; i++) {
  for (let j = i + 1; j < shuffled.length; j++) {
    ...
    if (score < bestScore || (score === bestScore && Math.random() < 0.5)) {
```

### Step 3: 型チェック

```bash
npm run typecheck
```

### Step 4: 既存テストの実行・修正

```bash
npm test
```

同スコア時の結果に依存するテストが失敗する場合:
- ハード制約の検証 → 変更不要（スコア差が大きい）
- 特定ペアの選出を前提 → 「いずれかの有効ペア」に緩和

### Step 5: 新規テスト追加

`tests/domain/assignment-generator.test.ts` に `describe('shuffle tiebreak')` を追加:

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | 同スコアペアが複数ある場合、10回実行で2種類以上のペアが出現 | 揺らぎの確認 |
| T2 | ハード制約は常に遵守される（100回実行） | 違反なし |
| T3 | 均等配分が維持される（count差があるメンバーは選ばれにくい） | count=0 が count=2 より優先 |

### Step 6: 全テスト実行

```bash
npm test
npm run typecheck
npm run lint
```

## 完了条件

- [x] `shuffle()` 関数が追加されている
- [x] `pickBestPairSameGrade()` で候補シャッフル＋同スコアランダムが適用されている
- [x] ハード制約テストが全パスする（既存243テスト全パス）
- [x] ランダム化テスト（T1〜T3）が追加されパスする（246テスト全パス）
- [x] `npm run typecheck` / `npm run lint` が通る
