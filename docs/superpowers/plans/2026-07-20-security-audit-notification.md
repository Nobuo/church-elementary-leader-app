# 定期セキュリティ監査の自動通知 Implementation Plan

**Goal:** npm依存の脆弱性を定期チェックし、検出時に確実に気づける通知(GitHub Issue)を自動化する。

**現状と欠落:**
- CI(`ci.yml`)は毎週月曜09:00 JSTのscheduleで `npm audit --audit-level=high` を実行済み。
  ただし**落ちても通知が埋もれる**(scheduled CIの失敗は気づきにくく、テスト失敗と区別もつかない)。
- **Dependabotが無い**ため、脆弱性の修正PR・依存更新PRが自動で来ない。

**方針:**
1. 専用の週次監査ワークフロー `security-audit.yml` を新設(木曜09:00 JST — 月曜のCIフルランと分散)。
   検出時は **GitHub Issueを自動起票**(既存の監査Issueが開いていればコメント追記で重複防止)。
   緑に戻ったら自動クローズ。Issue起票=GitHub通知(メール/アプリ)が飛ぶので、これが通知の実体。
2. `.github/dependabot.yml` で npm + GitHub Actions の週次更新PR(セキュリティ更新は随時PR)。
3. `SECURITY.md`(現状GitHubのダミーテンプレのまま)を実プロジェクトの内容に書き換え、運用を記録。
4. 既存CIのschedule実行は触らない(週次フルテストとして残す。監査通知は新WFが担う)。

**制約:** コミットは `main` に日本語1行メッセージ。**pushしない**(別セッションが本リポジトリで
作業中のため、pushはユーザー判断)。リポジトリのコード・テストには触らない。

---

### Task 1: security-audit.yml + dependabot.yml + SECURITY.md

**Files:**
- Create: `.github/workflows/security-audit.yml`
- Create: `.github/dependabot.yml`
- Rewrite: `SECURITY.md`

**Step 1: `.github/workflows/security-audit.yml`**(以下をそのまま使う):

```yaml
name: Security Audit

on:
  schedule:
    - cron: '0 0 * * 4' # 毎週木曜 00:00 UTC (09:00 JST)。月曜のCIフルランと分散
  workflow_dispatch:

permissions:
  contents: read
  issues: write

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6
        with:
          node-version: '24'
          cache: 'npm'
      - run: npm ci
      - name: npm audit
        run: |
          set -o pipefail
          npm audit --audit-level=high 2>&1 | tee audit.log
      - name: 検出時はIssueで通知(既存Issueがあればコメント追記)
        if: failure()
        env:
          GH_TOKEN: ${{ github.token }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          BODY="週次セキュリティ監査で high 以上の脆弱性を検出しました。

          Run: ${RUN_URL}

          \`\`\`
          $(tail -c 60000 audit.log 2>/dev/null || echo 'audit.logなし(npm ci等の失敗の可能性。Runログを確認)')
          \`\`\`

          対応: ローカルで \`npm audit\` を確認し、Dependabot PRのマージか \`npm audit fix\` で解消してください。"
          EXISTING=$(gh issue list --state open --search "security-audit in:title" --json number --jq '.[0].number')
          if [ -n "$EXISTING" ]; then
            gh issue comment "$EXISTING" --body "$BODY"
          else
            gh issue create --title "security-audit: npm依存に脆弱性を検出" --body "$BODY"
          fi
      - name: 緑に戻ったら監査Issueを自動クローズ
        if: success()
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          EXISTING=$(gh issue list --state open --search "security-audit in:title" --json number --jq '.[0].number')
          if [ -n "$EXISTING" ]; then
            gh issue close "$EXISTING" --comment "週次監査が緑に戻ったため自動クローズします。"
          fi
```

**Step 2: `.github/dependabot.yml`**(以下をそのまま使う):

```yaml
# 依存の脆弱性・更新を自動でPR化する。セキュリティ更新はスケジュール外でも随時PRが立つ。
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      minor-and-patch:
        update-types:
          - "minor"
          - "patch"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

**Step 3: `SECURITY.md` を書き換え**(ダミーテンプレを実内容に。以下をそのまま使う):

```markdown
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
```

**Step 4: 検証**

```bash
npx --yes yaml-lint .github/workflows/security-audit.yml .github/dependabot.yml
npm audit --audit-level=high   # 現状0件のまま緑であること(このタスクは依存に触らない)
git status --short             # 変更が上記3ファイル+計画mdのみであること
```

**Step 5: コミット(pushしない)**

```bash
git add .github/workflows/security-audit.yml .github/dependabot.yml SECURITY.md docs/superpowers/plans/2026-07-20-security-audit-notification.md
git commit -m "ci: 週次セキュリティ監査のIssue通知とDependabotを追加"
```

---

### 補足(運用メモ)

- 通知先はGitHub Issue。リポジトリをWatchしていればメール/アプリ通知が届く。
  Slack等へ流したくなったら、Issue通知のSlack連携(GitHub公式Slackアプリ)が最小手数。
- `workflow_dispatch` 付きなので、Actions画面からいつでも手動実行して動作確認できる。
- 初回の実動作確認はpush後に Actions → Security Audit → Run workflow で行う
  (成功時パス=Issueなしで完了、を確認。失敗パスの確認は実際に脆弱性が出たときでよい)。
