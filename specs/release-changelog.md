# リリース Changelog 自動生成 仕様書

## 機能概要

GitHub Releases にタグ間の変更内容を整理した Changelog を自動生成して掲載する。現在の `generate_release_notes: true` によるコミットメッセージ羅列を、Conventional Commits プレフィックスに基づくカテゴリ別の変更履歴に置き換える。

## 背景・動機

- 直接 main ブランチにコミットする運用のため、GitHub 自動生成リリースノートはコミットメッセージの羅列になる
- リリースごとに「何が変わったか」が一目でわかるようにしたい
- ユーザー向け（新機能・修正）と開発者向け（リファクタ・テスト）の変更を区別したい

## ユースケース

### 正常系

#### UC-1: 初回リリースの Changelog 生成
- **事前条件:** 過去のタグが存在しない
- **トリガー:** `v*` タグの push
- **処理:** HEADまでの全コミットをカテゴリ分けして Changelog を生成
- **結果:** GitHub Release にカテゴリ別の Changelog が掲載される

#### UC-2: 通常リリースの Changelog 生成
- **事前条件:** 前回のタグが存在する
- **トリガー:** `v*` タグの push
- **処理:** 前回タグ〜今回タグ間のコミットをカテゴリ分けして Changelog を生成
- **結果:** GitHub Release にカテゴリ別の Changelog が掲載される

### 異常系

#### UC-3: コミットに Conventional Commits プレフィックスがない場合
- **処理:** 「その他」カテゴリに分類する
- **結果:** 未分類のコミットも漏れなく Changelog に含まれる

## 入出力の定義

### 入力

| 項目 | 説明 |
|------|------|
| `GITHUB_REF_NAME` | push されたタグ名（例: `v1.2.0`） |
| `git log` | 前回タグ〜今回タグ間のコミット履歴 |

### 出力

GitHub Release の body に以下の形式で出力:

```markdown
## 🆕 新機能
- feat: ○○機能の追加
- feat: △△の実装

## 🐛 バグ修正
- fix: ○○の修正

## 🔒 セキュリティ
- security: ○○対応

## 🔧 その他
- refactor: ○○のリファクタリング
- test: テスト追加
- chore: 依存関係更新
```

### カテゴリ分類ルール

| プレフィックス | カテゴリ |
|---------------|---------|
| `feat:` | 🆕 新機能 |
| `fix:` | 🐛 バグ修正 |
| `security:` | 🔒 セキュリティ |
| 上記以外 | 🔧 その他 |

## 実装方針

### 方式: ワークフロー内でコミットログから生成（方式B）

現在の運用（直接コミット、Conventional Commits 風のメッセージ）を活かし、`git log` でタグ間の差分を取得してカテゴリ分けする。

### 変更対象ファイル

- `.github/workflows/release.yml` — build ジョブの `Create Release` ステップを変更

### 変更内容

1. `Create Release` ステップの前に `Generate changelog` ステップを追加
2. `git describe --tags --abbrev=0 HEAD^` で前回タグを取得
3. 前回タグ〜HEAD 間のコミットログを取得し、プレフィックスでカテゴリ分け
4. `softprops/action-gh-release` の `body` パラメータに生成した Changelog を渡す
5. `generate_release_notes: true` を削除する

### ワークフロー変更箇所

```yaml
# 追加するステップ
- name: Generate changelog
  id: changelog
  run: |
    PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
    if [ -z "$PREV_TAG" ]; then
      COMMITS=$(git log --pretty=format:"%s" HEAD)
    else
      COMMITS=$(git log --pretty=format:"%s" "${PREV_TAG}..HEAD")
    fi

    FEAT=""
    FIX=""
    SEC=""
    OTHER=""

    while IFS= read -r line; do
      [ -z "$line" ] && continue
      case "$line" in
        feat:*)     FEAT="$FEAT"$'\n'"- $line" ;;
        fix:*)      FIX="$FIX"$'\n'"- $line" ;;
        security:*) SEC="$SEC"$'\n'"- $line" ;;
        *)          OTHER="$OTHER"$'\n'"- $line" ;;
      esac
    done <<< "$COMMITS"

    {
      echo "BODY<<CHANGELOG_EOF"
      [ -n "$FEAT" ] && printf '## 🆕 新機能\n%s\n\n' "$FEAT"
      [ -n "$FIX" ] && printf '## 🐛 バグ修正\n%s\n\n' "$FIX"
      [ -n "$SEC" ] && printf '## 🔒 セキュリティ\n%s\n\n' "$SEC"
      [ -n "$OTHER" ] && printf '## 🔧 その他\n%s\n\n' "$OTHER"
      echo "CHANGELOG_EOF"
    } >> "$GITHUB_OUTPUT"

# 変更するステップ
- name: Create Release
  uses: softprops/action-gh-release@b25b93d384199fc0fc8c2e126b2d937a0cbeb2ae # v2
  with:
    body: ${{ steps.changelog.outputs.BODY }}
    files: |
      dist/leader-app-${{ steps.version.outputs.VERSION }}-darwin-arm64.tar.gz
      dist/leader-app-${{ steps.version.outputs.VERSION }}-darwin-x64.tar.gz
      dist/leader-app-${{ steps.version.outputs.VERSION }}-windows-x64.zip
```

## ドメインモデル（DDD観点）

この機能はドメイン層には影響しない。CI/CDインフラ層の変更のみ。

## 制約・ビジネスルール

- Conventional Commits プレフィックスに基づく分類を行うが、プレフィックスがないコミットも「その他」として必ず含める（コミットの欠落を防ぐ）
- 前回タグが存在しない場合（初回リリース）も正常に動作すること
- SHAピン留めによるアクションのバージョン固定は維持すること

## 受け入れ基準（テスト観点）

- [ ] `v*` タグ push 時に GitHub Release にカテゴリ別の Changelog が表示される
- [ ] `feat:` プレフィックスのコミットが「新機能」カテゴリに表示される
- [ ] `fix:` プレフィックスのコミットが「バグ修正」カテゴリに表示される
- [ ] `security:` プレフィックスのコミットが「セキュリティ」カテゴリに表示される
- [ ] プレフィックス無しのコミットが「その他」カテゴリに表示される
- [ ] 該当コミットがないカテゴリは見出し自体が表示されない
- [ ] 前回タグが存在しない場合（初回リリース）でもエラーにならない
- [ ] バイナリファイルが引き続き Release に添付される

## 将来の拡張

- PR ベースの運用に移行した場合は `.github/release.yml`（リリースノート設定）でのカテゴリ分けを併用可能
- `docs:`, `refactor:`, `test:`, `chore:` 等のプレフィックスを追加してカテゴリを細分化可能
