# Security Policy

教会小学科リーダー担当決めアプリのセキュリティ運用。

## 脆弱性の自動チェックと通知

- **週次監査**: `.github/workflows/security-audit.yml` が毎週木曜09:00(JST)に
  `npm audit --audit-level=high` を実行。検出時は `security-audit:` で始まるタイトルの
  GitHub Issueが自動起票される(既存Issueが開いていればコメント追記、緑に戻れば自動クローズ)。
- **CIゲート**: push/PR時にも `npm audit --audit-level=high` が走る(`ci.yml`)。
- **依存更新**: Dependabot(`.github/dependabot.yml`)が npm と GitHub Actions の
  更新PRを週次で作成。セキュリティ更新は随時PRが立つ。

## 対応手順

1. 通知Issue(または赤いCI)を確認し、ローカルで `npm audit` を実行して詳細を見る。
2. Dependabotの該当PRがあればそれをレビュー・マージ。無ければ `npm audit fix`、
   それでも残る場合は該当依存の更新・置き換えを検討する。
3. 解消後、次回の週次実行(または手動で Actions → Security Audit → Run workflow)で
   Issueが自動クローズされることを確認する。

## 脆弱性の報告

このリポジトリの利用中に脆弱性を見つけた場合は、GitHub Issue(privateにしたい場合は
リポジトリオーナーへ直接連絡)で報告してください。
