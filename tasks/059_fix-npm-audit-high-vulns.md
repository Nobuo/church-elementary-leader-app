# 059: CI失敗の修正 — npm audit high 脆弱性の解消

## タスク概要

CI run 30231058306（schedule 実行）が `npm audit --audit-level=high`（`.github/workflows/ci.yml:21`）で exit 1 になり失敗した。
high 3件を解消し、`npm audit --audit-level=high` が exit 0 になる状態にする。

### 調査済みの事実（2026-07-28 時点）

クリーンな `npm ci` 状態での high 3件（**すべて devDependencies の推移的依存**。本番依存の high は無い）:

| パッケージ | 検出版 | 経路 | Advisory | 修正版 |
|---|---|---|---|---|
| js-yaml | 4.2.0 | eslint → @eslint/eslintrc | GHSA-52cp-r559-cp3m | 4.3.0 |
| postcss | 8.5.15 | vitest → vite | GHSA-r28c-9q8g-f849 | 8.5.18+ |
| brace-expansion | 5.0.6 | @typescript-eslint/typescript-estree → minimatch@10.2.4 | GHSA-mh99-v99m-4gvg 他 | 5.0.8 |
| brace-expansion | 1.1.13 | eslint / @eslint/config-array / @eslint/eslintrc → minimatch@3 | GHSA-mh99-v99m-4gvg | **1.x に修正版なし**（1.1.16 も脆弱判定。安全なのは 5.0.8 のみ） |

重要な注意:
- `npm audit fix` は不安定（実行すると別の依存が引き上げられ high が増える）。**使わない**。手動 overrides + `npm install` で対処する。
- `npm audit fix --force` は eslint@10 への breaking 変更を提案してくる。
- low の body-parser / esbuild はゲート（--audit-level=high）に影響しないため本タスクの対象外。

### 現在の作業ツリー状態（コミット前・調査時の途中変更あり）

`package.json` に以下の overrides が既に追加済み、`npm install` 済みで `package-lock.json` も変更されている:

```json
"overrides": {
  "brace-expansion@1": "^1.1.14",
  "brace-expansion@5": "^5.0.8",
  "js-yaml@4": "^4.3.0",
  "postcss": "^8.5.18"
}
```

この状態で js-yaml / postcss / brace-expansion@5 系は解消済みだが、eslint 系チェーンの brace-expansion@1（1.1.16）が依然 high 判定で残っている（1.x に修正版が存在しないため）。
`"brace-expansion@1": "^1.1.14"` の行は**効果がないので削除**すること。

## 対象ファイル

- `package.json`（overrides / devDependencies）
- `package-lock.json`（npm install で再生成）
- 最終手段の場合のみ: `.github/workflows/ci.yml`, `.github/workflows/release.yml`

## 実装手順

前提: 作業ディレクトリは `/Users/nobuo/ghq/github.com/Nobuo/church-elementary-leader-app`。コミットはしない（レビュー後に行う）。

### Step 1: overrides の整理

`package.json` の overrides から `"brace-expansion@1": "^1.1.14"` を削除し、以下だけ残す:

```json
"overrides": {
  "brace-expansion@5": "^5.0.8",
  "js-yaml@4": "^4.3.0",
  "postcss": "^8.5.18"
}
```

### Step 2: eslint@10 へのアップグレード（本命）

eslint@10 は minimatch@10 / brace-expansion@5 系を使うため、brace-expansion@1 チェーンごと消える見込み。

1. 互換性確認:
   - `npm view eslint dist-tags.latest`
   - `npm view typescript-eslint@latest peerDependencies`（eslint 10 を許容するか）
   - `npm view @eslint/js dist-tags.latest`
2. typescript-eslint が eslint@10 対応済みなら:
   - `eslint` / `@eslint/js` を ^10 系へ、`typescript-eslint` / `@typescript-eslint/parser` / `@typescript-eslint/eslint-plugin` を対応版へ package.json 上で更新
   - `npm install`
3. `npm run lint` が正常終了することを確認（flat config `eslint.config.*` を使用しているので大きな移行作業は不要の見込み。エラーが出たら設定を最小修正）

### Step 3: フォールバック A — minimatch override（Step 2 が不可の場合のみ）

typescript-eslint が eslint@10 未対応、または lint が壊れて修正困難な場合:

1. overrides に `"minimatch@3": "^10.2.4"` を追加して minimatch@3 チェーンを 10 系へ強制（brace-expansion@5.0.8 になる）
2. `npm install` 後、**必ず `npm run lint` を実行**して eslint がランタイムで壊れていないか確認（minimatch 3→10 は major。CJS/ESM 問題で require が失敗する可能性あり）
3. 壊れる場合は override を戻し、フォールバック B へ

### Step 4: フォールバック B — CI の audit スコープを本番依存に限定（最終手段）

Step 2 も 3 も不可の場合のみ:

- `.github/workflows/ci.yml` と `release.yml` の audit 行を `npm audit --audit-level=high --omit=dev` に変更
- 残る high はすべて dev 専用（lint ツールチェーン）で、本番コードに載らない旨をタスクファイル末尾に追記

### Step 5: 検証

以下をすべて実行し、出力を確認する:

```bash
npm audit --audit-level=high   # exit 0 であること（echo $? で確認）
npm run typecheck
npm run lint
npm run test
npm run build
```

## 依存タスク

なし

## テスト方針

新規テストは不要。既存の typecheck / lint / unit・integration test / build がすべて通ることをもって回帰なしとする。

## 完了条件

- [ ] `npm audit --audit-level=high` が exit 0（high/critical 0件）
- [ ] `npm run typecheck` / `npm run lint` / `npm run test` / `npm run build` すべて成功
- [ ] `npm audit fix` を使っていない（手動 overrides / バージョン更新のみ）
- [ ] コミットはしていない（レビュー待ち状態）
- [ ] どの Step（2 / 3 / 4）で解決したかを報告に明記
