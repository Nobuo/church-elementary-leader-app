# Security Policy

教会小学科リーダー担当決めアプリのセキュリティ運用。

## 依存管理

Node.js 24.15.0 / pnpm 12.10.1をmise・packageManager・CIで固定します。
`pnpm install --frozen-lockfile` を通常のセットアップに使い、`pnpm-lock.yaml` をレビュー対象にします。
`preinstall` は異なるNode / パッケージマネージャーによるインストールを拒否します。

`pnpm-workspace.yaml` の設定:

- `minimumReleaseAge: 10080`: 公開後7日待機。推移依存と既存lockfileにも適用し、公開日時不明のパッケージや待機未満へのフォールバックを拒否します。
- `trustPolicy: no-downgrade`: 過去の公開版からtrusted publishing / provenanceの信頼レベルが低下したパッケージを拒否します。すべてのパッケージにprovenanceを要求する設定ではありません。
- `blockExoticSubdeps: true`: 推移依存のGit / 任意tarballなどの取得元を拒否します。
- `strictDepBuilds: true` と `allowBuilds`: 未審査のビルドスクリプトでinstallを失敗させます。esbuild 0.28.1のバイナリ選択・検証だけ許可し、fsevents 2.3.3のスクリプトは拒否します。更新時はスクリプトを確認してバージョン単位で許可します。
- ストアの整合性検証を有効にし、副作用キャッシュを無効化します。依存の状態が古い場合、コマンド実行時の自動installを行わずエラーにします。
- 新規追加は完全なバージョンを保存し、Nodeとpeer依存の互換性を厳格に確認します。

公式資料: [pnpm supply chain security](https://pnpm.io/supply-chain-security)、[依存解決](https://pnpm.io/settings/dependency-resolution)、[ビルド許可](https://pnpm.io/settings/build)。

## 脆弱性の自動チェックと通知

- **週次監査**: `.github/workflows/security-audit.yml` が毎週木曜09:00(JST)に `pnpm audit --audit-level=high` を実行します。失敗時はsecurity-auditラベルのGitHub Issueで通知し、緑に戻れば自動クローズします。install自体の失敗もRunログで確認してください。
- **CIゲート**: push/PR・リリース前にも全依存の `pnpm audit --audit-level=high` を実行します。
- **依存更新**: Dependabotのパッケージ種別はpnpmでも `npm` のままです。通常更新は7日待機、majorは14日待機。セキュリティPRはcooldownの対象外ですが、install時の7日待機は別途適用されます。
- GitHub ActionsはコミットSHAで固定します。

## 対応手順

1. 通知Issueまたは赤いCIのログを確認し、ローカルで `pnpm audit` を実行します。
2. Dependabotの該当PRをレビューするか、対象の直接依存を `pnpm update <package>` で更新します。推移依存は親依存の更新を優先し、必要なら範囲を限定した `overrides` を使います。
3. lockfile差分、型・lint・テスト・ビルド・監査を確認します。`pnpm audit --fix` による広範なoverride追加は通常の修正手順にしません。
4. 修正版が公開7日未満なら、公式の公開元・変更内容を確認して `pnpm-workspace.yaml` に対象と完全なバージョンだけ例外を追加します:

   ```yaml
   minimumReleaseAgeExclude:
     - example-package@1.2.3
   ```

   通常の依存更新と同じ検証を行い、理由をPRに記載します。7日経過後は例外を削除します。`minimumReleaseAge: 0`、ワイルドカード例外、全ビルドスクリプトの許可は使いません。
5. 次の週次監査かActionsの手動実行でIssueの状態を確認します。

## Cloudflare CLI

このアプリはExpress / SQLiteのローカルアプリです。Wrangler依存やCloudflare構成はありません。
Cloudflare公式の新CLIはベータの `cf` ですが、このリポジトリには移行対象がないため追加しません。
[公式CLI資料](https://developers.cloudflare.com/cf/)。

## 脆弱性の報告

GitHub Issueで報告してください。非公開の報告はリポジトリオーナーへ直接連絡してください。
