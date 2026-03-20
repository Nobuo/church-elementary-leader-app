# タスク: リリース Changelog 自動生成

## ステータス: 完了

## 概要
GitHub Releases にカテゴリ別の Changelog を自動生成する。

## 関連仕様書
- `specs/release-changelog.md`

## 実装内容
- `.github/workflows/release.yml` に `Generate changelog` ステップを追加
- Conventional Commits プレフィックスでカテゴリ分け（feat / fix / security / その他）
- `generate_release_notes: true` を削除し、生成した Changelog を `body` に渡す

## 完了条件
- [ ] Changelog 生成ステップが追加されている
- [ ] カテゴリ分類が正しく動作する
- [ ] 前回タグなし（初回リリース）でもエラーにならない
- [ ] バイナリファイルの添付が引き続き動作する
