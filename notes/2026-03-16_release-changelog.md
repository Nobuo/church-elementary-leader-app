# GitHub Releases に Changelog を書き出す

## 概要

GitHub Releases にタグ間の変更内容を整理した Changelog を自動生成して掲載する。

## 背景

現在の `release.yml` では `generate_release_notes: true` を指定しており、GitHub がコミットやPRから自動でリリースノートを生成する。しかし、直接 main ブランチにコミットしている運用のため、コミットメッセージの羅列になり、変更の概要が掴みにくい。

## 期待される効果

- リリースごとに「何が変わったか」が一目でわかる
- ユーザー向けの変更（新機能・修正）と開発者向けの変更（リファクタ・テスト）が区別される

## 実現方法の選択肢

### A: GitHub 自動生成の改善（`.github/release.yml` 設定）

`.github/release.yml`（ワークフローとは別の設定ファイル）でカテゴリ分けを定義する。PR ベースの運用に切り替えるとより効果的。

```yaml
# .github/release.yml
changelog:
  categories:
    - title: "🆕 新機能"
      labels: ["enhancement"]
    - title: "🐛 バグ修正"
      labels: ["bug"]
    - title: "🔒 セキュリティ"
      labels: ["security"]
    - title: "その他"
      labels: ["*"]
```

### B: ワークフロー内でコミットログから生成

`git log` でタグ間の差分を取得し、`feat:` / `fix:` / `security:` などの Conventional Commits プレフィックスでカテゴリ分けする。

```yaml
- name: Generate changelog
  id: changelog
  run: |
    PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
    if [ -z "$PREV_TAG" ]; then
      CHANGELOG=$(git log --pretty=format:"- %s" HEAD)
    else
      CHANGELOG=$(git log --pretty=format:"- %s" ${PREV_TAG}..HEAD)
    fi
    echo "CHANGELOG<<EOF" >> "$GITHUB_OUTPUT"
    echo "$CHANGELOG" >> "$GITHUB_OUTPUT"
    echo "EOF" >> "$GITHUB_OUTPUT"

- name: Create Release
  uses: softprops/action-gh-release@...
  with:
    body: ${{ steps.changelog.outputs.CHANGELOG }}
    files: ...
```

### 推奨

現在の運用（直接コミット、Conventional Commits 風のメッセージ）を活かすなら **B** が手軽。将来 PR ベースに移行するなら **A** も併用可能。

## 関連

- `.github/workflows/release.yml` — 現在の Release ワークフロー
- `softprops/action-gh-release` — リリース作成アクション
