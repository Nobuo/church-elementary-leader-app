# 仕様書: CI/CD（GitHub Actions）

## 機能概要
GitHub Actionsを使ったCI自動化。プルリクエスト時のチェックに加え、定期的なビルドで経年劣化を検知し、エラー時に通知する。

## ワークフロー構成

### 1. CI（プルリクエスト / push時）
- **トリガー**: mainブランチへのPR作成・更新、mainへのpush
- **ジョブ**:
  - 依存関係インストール
  - TypeScript型チェック (`tsc --noEmit`)
  - リント (`eslint`)
  - テスト (`vitest` or `jest`)
  - ビルド
- **対象環境**: ubuntu-latest（Mac/Windows固有の問題は手動確認）

### 2. 定期ビルド（Scheduled）
- **トリガー**: cron（週1回、例: 毎週月曜 9:00 JST = 日曜 24:00 UTC）
- **ジョブ**: CIと同じ（依存インストール→型チェック→リント→テスト→ビルド）
- **目的**: 依存パッケージの更新やNode.jsバージョンの変化による経年劣化を早期検知

### 3. エラー通知
- **方法**: GitHub Actionsの失敗通知（メール）をデフォルトで利用
- **追加オプション（拡張フェーズ）**: Slack通知やGitHub Issues自動作成

## ワークフローファイル

### `.github/workflows/ci.yml`
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * 1'  # 毎週月曜 00:00 UTC（月曜 09:00 JST）

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 'lts/*'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test
      - run: npm run build
```

## 受け入れ基準
- [ ] PRを出すとCIが自動で走る
- [ ] mainへのpushでCIが自動で走る
- [ ] 週1回の定期ビルドが自動実行される
- [ ] CIが失敗した場合、GitHubの通知（メール）が届く
- [ ] 型チェック・リント・テスト・ビルドが全て実行される
