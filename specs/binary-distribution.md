# バイナリ配布

## 機能概要

アプリケーションをコンパイルし、GitHub Releases 経由で Windows / macOS 向けのスタンドアロンバイナリとして配布する。Git タグ（`v1.0.0` 形式）を push すると CI が自動ビルドし、リリースにバイナリを添付する。

## 技術選定

### 比較結果

| ツール | バイナリサイズ | ネイティブアドオン | 静的ファイル | クロスコンパイル | 保守状況 |
|--------|-------------|------------------|------------|----------------|---------|
| pkg | ~50 MB | 中 | 良 | 可 | **廃止** |
| Node.js SEA | ~90 MB | 手動対応要 | API変更要 | 不可 | Node.js本体 |
| **Bun compile** | **~50 MB** | bun:sqlite使用 | **優秀** | **可** | **活発** |
| nexe | ~50 MB | 不良 | 制限的 | 不安定 | ほぼ放置 |
| caxa | N/A | 良 | 良 | 不可 | **廃止** |
| boxednode | ~60 MB | 最良 | 手動 | 不可 | 低活性 |

### 採用: Bun compile

理由:

1. **バイナリサイズが最小** — macOS ~50 MB、Windows ~100 MB（Node.js SEA は ~90 MB）
2. **クロスコンパイル対応** — 1台の CI ランナーから全プラットフォーム向けビルド可能
3. **静的ファイル埋め込みが優秀** — `public/` 以下をバイナリに内包可能
4. **活発な開発** — Bun は2025年以降も活発にメンテナンスされている

### 必要な変更: better-sqlite3 → bun:sqlite

Bun では Node.js のネイティブアドオン（`.node` ファイル）をバイナリに含められない。代わりに Bun 組み込みの `bun:sqlite` を使う。

- `bun:sqlite` は `better-sqlite3` と API がほぼ互換
- Bun 環境ではさらに高速（3-6x）
- 同期 API のため、既存コードの構造を変えずに移行可能

ただし、Node.js 環境での開発・テストも維持するため、**アダプター層で切り替える設計** とする。

## 設計

### SQLite アダプター

```
src/infrastructure/persistence/
├── database.ts          # 既存 → アダプターに変更
├── database-node.ts     # better-sqlite3 実装（開発・テスト用）
└── database-bun.ts      # bun:sqlite 実装（バイナリビルド用）
```

```typescript
// database.ts — ランタイム検出で自動切り替え
export function createDatabase(path?: string): DatabaseAdapter {
  const dbPath = path ?? process.env.DB_PATH ?? 'leader-app.db';
  if (typeof Bun !== 'undefined') {
    return createBunDatabase(dbPath);
  }
  return createNodeDatabase(dbPath);
}
```

リポジトリ層（`sqlite-member-repository.ts` 等）が使う DB インターフェースは変更不要。`better-sqlite3` と `bun:sqlite` は `prepare()`, `run()`, `get()`, `all()` が共通のため、薄いアダプターで吸収する。

### 静的ファイルの埋め込み

Bun compile では `public/` ディレクトリのファイルをバイナリに埋め込む。`bunfig.toml` で指定:

```toml
[build]
assets = ["public/**/*"]
```

`server.ts` で Bun 環境時はファイルシステムではなく埋め込みアセットから配信:

```typescript
if (typeof Bun !== 'undefined') {
  // Bun の埋め込みアセットから配信
  app.use(serveBunAssets());
} else {
  // 通常のファイルシステムから配信
  app.use(express.static(path.join(__dirname, '../../public')));
}
```

### バージョン管理

`package.json` の `version` フィールドをタグから自動更新:

```json
{
  "version": "1.0.0"
}
```

CI でタグ `v1.2.3` を検出 → ビルド前に `npm version 1.2.3 --no-git-tag-version` を実行。

### ビルドコマンド

```bash
# macOS (Apple Silicon)
bun build --compile --target=bun-darwin-arm64 ./src/main.ts --outfile leader-app-darwin-arm64

# macOS (Intel)
bun build --compile --target=bun-darwin-x64 ./src/main.ts --outfile leader-app-darwin-x64

# Windows (x64)
bun build --compile --target=bun-windows-x64 ./src/main.ts --outfile leader-app-windows-x64.exe
```

### 配布バイナリ名

```
leader-app-v1.0.0-darwin-arm64       # macOS Apple Silicon
leader-app-v1.0.0-darwin-x64         # macOS Intel
leader-app-v1.0.0-windows-x64.exe    # Windows
```

## GitHub Actions ワークフロー

### トリガー

```yaml
on:
  push:
    tags:
      - 'v*'  # v1.0.0, v1.2.3-beta.1 等
```

### ワークフロー: `.github/workflows/release.yml`

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  test:
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

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install

      # バージョン抽出
      - name: Extract version
        id: version
        run: echo "VERSION=${GITHUB_REF_NAME}" >> $GITHUB_OUTPUT

      # クロスコンパイル（1ランナーで全プラットフォーム）
      - name: Build macOS ARM64
        run: bun build --compile --target=bun-darwin-arm64 ./src/main.ts --outfile dist/leader-app-darwin-arm64

      - name: Build macOS x64
        run: bun build --compile --target=bun-darwin-x64 ./src/main.ts --outfile dist/leader-app-darwin-x64

      - name: Build Windows x64
        run: bun build --compile --target=bun-windows-x64 ./src/main.ts --outfile dist/leader-app-windows-x64.exe

      # アーカイブ作成
      - name: Create archives
        run: |
          cd dist
          VERSION=${{ steps.version.outputs.VERSION }}
          tar czf leader-app-${VERSION}-darwin-arm64.tar.gz leader-app-darwin-arm64
          tar czf leader-app-${VERSION}-darwin-x64.tar.gz leader-app-darwin-x64
          zip leader-app-${VERSION}-windows-x64.zip leader-app-windows-x64.exe

      # GitHub Release 作成 + アセットアップロード
      - name: Create Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          files: |
            dist/leader-app-${{ steps.version.outputs.VERSION }}-darwin-arm64.tar.gz
            dist/leader-app-${{ steps.version.outputs.VERSION }}-darwin-x64.tar.gz
            dist/leader-app-${{ steps.version.outputs.VERSION }}-windows-x64.zip
```

### リリースフロー

```
1. コードを main にマージ
2. タグを作成: git tag v1.0.0
3. タグを push: git push origin v1.0.0
4. CI が自動実行:
   ├── test ジョブ: typecheck + lint + vitest
   └── build ジョブ（test 成功後）:
       ├── macOS ARM64 バイナリ → tar.gz
       ├── macOS x64 バイナリ → tar.gz
       └── Windows x64 バイナリ → zip
5. GitHub Release が自動作成され、バイナリが添付される
```

## ユーザーのインストール手順

### macOS

```bash
# ダウンロード＆展開
curl -L https://github.com/<owner>/church-elementary-leader-app/releases/latest/download/leader-app-v1.0.0-darwin-arm64.tar.gz | tar xz

# 実行
./leader-app-darwin-arm64
# → Server running at http://localhost:3000

# （任意）PATH に配置
mv leader-app-darwin-arm64 /usr/local/bin/leader-app
```

### Windows

1. Releases ページから `.zip` をダウンロード
2. 展開
3. `leader-app-windows-x64.exe` をダブルクリック
4. ブラウザで `http://localhost:3000` を開く

### データの保存場所

- SQLite データベースファイル `leader-app.db` がバイナリと同じディレクトリに作成される
- `DB_PATH` 環境変数で変更可能
- `PORT` 環境変数でポート変更可能（デフォルト 3000）

## 影響範囲

| ファイル | 変更内容 |
|----------|----------|
| `src/infrastructure/persistence/database.ts` | Bun/Node 自動切り替えアダプター |
| `src/presentation/server.ts` | Bun 環境での静的ファイル配信分岐 |
| `bunfig.toml` | 新規作成 — アセット埋め込み設定 |
| `.github/workflows/release.yml` | 新規作成 — タグトリガーのリリースワークフロー |
| `package.json` | `bun build` スクリプト追加 |

## 制約・注意事項

- **開発は引き続き Node.js (tsx)** で行う。Bun は配布ビルドのみに使用
- **テストは Node.js (vitest)** で実行。Bun 固有のテストは不要（アダプター層で吸収）
- `bun:sqlite` は `better-sqlite3` と API がほぼ同じだが、一部差異あり:
  - `bun:sqlite` の `Database` コンストラクタの引数形式が若干異なる
  - PRAGMA の設定方法が同じ（`.exec()` or `.run()` で実行）
  - `prepare().run()`, `.get()`, `.all()` は互換
- macOS バイナリは Gatekeeper の警告が出る場合がある → README にワークアラウンド記載
  - `xattr -d com.apple.quarantine ./leader-app-darwin-arm64`

## 受け入れ基準

| # | テスト | 期待結果 |
|---|--------|----------|
| 1 | `bun build --compile` でバイナリが生成される | エラーなく完了 |
| 2 | 生成されたバイナリを実行 | `http://localhost:3000` でアプリが起動 |
| 3 | バイナリから静的ファイル（HTML/CSS/JS）が配信される | ブラウザでUIが表示される |
| 4 | バイナリがSQLiteデータベースを作成・読み書きできる | メンバー追加・スケジュール生成が動作 |
| 5 | `v*` タグ push で GitHub Release が自動作成される | 3つのバイナリがアセットとして添付 |
| 6 | macOS ARM64 バイナリが Apple Silicon Mac で動作する | 正常起動 |
| 7 | Windows x64 バイナリが Windows で動作する | 正常起動 |
| 8 | Node.js 環境での開発・テストが引き続き動作する | `npm run dev`, `npm test` が通る |
| 9 | macOS x64 バイナリが Intel Mac で動作する | 正常起動 |
