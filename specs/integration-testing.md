# 結合テスト（インテグレーションテスト）+ E2Eテスト（Playwright）

## 機能概要

2層構成のテストを実装する:

1. **APIレベル結合テスト（supertest）**: ExpressサーバーとインメモリSQLiteで全APIエンドポイントを検証
2. **UIレベルE2Eテスト（Playwright）**: 実際のブラウザでユーザー操作フローを検証

共通方針:
- 本番DBを壊さないようインメモリDB（`:memory:`）またはテスト専用一時ファイルDBを使用
- APIテストはCIで毎回実行（軽量）
- E2EテストはCIではオプショナル（重い）、ローカルで `npm run test:e2e` で実行

---

## テスト基盤

### データベース分離

```
テスト: better-sqlite3 の `:memory:` モード（各テストスイートごとに独立）
本番:   mach-leader.db（テスト時は一切触れない）
```

- 各テストファイル（またはdescribeブロック）の`beforeEach`でインメモリDBを作成し、マイグレーションを実行
- テスト間で状態が共有されないことを保証
- `afterEach` でDBをクローズ

### テスト用サーバー構成

```typescript
import Database from 'better-sqlite3';
import { runMigrations } from '@infrastructure/persistence/migrations/index';
import { SqliteMemberRepository } from '@infrastructure/persistence/sqlite-member-repository';
import { SqliteScheduleRepository } from '@infrastructure/persistence/sqlite-schedule-repository';
import { SqliteAssignmentRepository } from '@infrastructure/persistence/sqlite-assignment-repository';
import { createServer } from '@presentation/server';

function createTestApp() {
  const db = new Database(':memory:');
  runMigrations(db);
  const memberRepo = new SqliteMemberRepository(db);
  const scheduleRepo = new SqliteScheduleRepository(db);
  const assignmentRepo = new SqliteAssignmentRepository(db);
  const app = createServer(memberRepo, scheduleRepo, assignmentRepo);
  return { app, db, memberRepo, scheduleRepo, assignmentRepo };
}
```

### HTTPリクエスト方法

Vitestからsupertest等の外部ライブラリは追加せず、Expressの`app`オブジェクトに対して`inject`相当の方法でテストする。

方針: **supertest** を devDependency に追加して使用する。軽量で広く使われており、Expressテストのデファクト。

```bash
npm install -D supertest @types/supertest
```

### CI対応

- `npm run test` で全テスト（既存ユニットテスト + 新規結合テスト）が実行される
- インメモリDBのためファイルシステムへの依存なし
- better-sqlite3 のネイティブモジュールのビルドが必要（CIの`npm ci`で自動ビルド）
- タイムアウトの考慮: 結合テストは個別テストで5秒以内を目安

### package.json スクリプト追加

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run --exclude='tests/integration/**'",
    "test:integration": "vitest run tests/integration/",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

---

## テストファイル構成

```
tests/integration/
├── helpers/
│   └── setup.ts            # createTestApp, テストデータファクトリ
├── member-api.test.ts       # メンバー管理API
├── schedule-api.test.ts     # スケジュール管理API
├── assignment-api.test.ts   # 割り当て生成・調整API
├── export-api.test.ts       # CSV/LINEエクスポートAPI
└── full-workflow.test.ts    # 全体ワークフロー（E2E的シナリオ）
```

---

## テストヘルパー: `tests/integration/helpers/setup.ts`

### createTestApp()

上述のインメモリDB + Express appのセットアップを提供。

### テストデータファクトリ

APIを通じてテストデータを投入するヘルパー関数群:

```typescript
// 標準的な10人のメンバーセットを登録（5 UPPER + 5 LOWER、日英バランス考慮）
async function seedStandardMembers(request: SuperTest): Promise<MemberDto[]>

// 夫婦ペア付きメンバーセットを登録
async function seedMembersWithCouple(request: SuperTest): Promise<MemberDto[]>

// 指定月のスケジュールを生成
async function seedSchedule(request: SuperTest, year: number, month: number): Promise<ScheduleDto[]>

// スケジュール + 割り当てを一括生成
async function seedAssignments(request: SuperTest, year: number, month: number): Promise<void>
```

### 標準メンバーセット

| # | name | gender | language | gradeGroup | memberType | sameGenderOnly |
|---|------|--------|----------|------------|------------|----------------|
| 1 | 田中太郎 | MALE | JAPANESE | UPPER | PARENT_SINGLE | false |
| 2 | John Smith | MALE | ENGLISH | UPPER | PARENT_SINGLE | false |
| 3 | 佐藤花子 | FEMALE | BOTH | UPPER | PARENT_SINGLE | false |
| 4 | Jane Doe | FEMALE | ENGLISH | UPPER | PARENT_SINGLE | false |
| 5 | 山田一郎 | MALE | JAPANESE | UPPER | PARENT_SINGLE | false |
| 6 | 鈴木二郎 | MALE | JAPANESE | LOWER | PARENT_SINGLE | false |
| 7 | Emily Brown | FEMALE | ENGLISH | LOWER | PARENT_SINGLE | false |
| 8 | 高橋三郎 | MALE | BOTH | LOWER | PARENT_SINGLE | false |
| 9 | Bob Wilson | MALE | ENGLISH | LOWER | PARENT_SINGLE | false |
| 10 | 伊藤美咲 | FEMALE | JAPANESE | LOWER | PARENT_SINGLE | false |

---

## テストケース一覧

### 1. メンバー管理API (`member-api.test.ts`)

#### POST /api/members — メンバー登録

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 1.1 | 正常なメンバー登録 | 201, id/name/gender等が含まれるレスポンス |
| 1.2 | 名前なしで登録 | 400, エラーメッセージ |
| 1.3 | 不正なgender値 | 400, エラーメッセージ |
| 1.4 | 不正なlanguage値 | 400, エラーメッセージ |
| 1.5 | PARENT_COUPLEでspouseId指定 | 201, 双方向リンク確認 |
| 1.6 | 存在しないspouseIdを指定 | 400, エラーメッセージ |

#### GET /api/members — メンバー一覧

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 1.7 | 全メンバー取得（activeOnly=true） | 有効メンバーのみ返却 |
| 1.8 | 無効メンバーも含めて取得（activeOnly=false） | 全メンバー返却 |

#### PUT /api/members/:id — メンバー更新

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 1.9 | 名前の更新 | 200, 更新後の名前 |
| 1.10 | 存在しないIDで更新 | 400, エラーメッセージ |

#### POST /api/members/:id/deactivate — メンバー無効化

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 1.11 | メンバー無効化 | 200, isActive=false |
| 1.12 | 無効化後にactiveOnly=trueで一覧取得 | 無効化したメンバーが含まれない |

#### GET /api/members/export/csv — CSV出力

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 1.13 | 日本語CSVエクスポート | Content-Type: text/csv, BOM付き, 日本語ヘッダー |
| 1.14 | 英語CSVエクスポート | 英語ヘッダー |

#### POST /api/members/import/csv — CSVインポート

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 1.15 | 正常なCSVインポート（新規作成） | created > 0 |
| 1.16 | 既存メンバーの更新（名前で照合） | updated > 0 |
| 1.17 | 空CSV | 400, エラーメッセージ |

---

### 2. スケジュール管理API (`schedule-api.test.ts`)

#### POST /api/schedules/generate — スケジュール生成

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 2.1 | 2026年4月のスケジュール生成 | 200, 日曜日4〜5件分のスケジュール |
| 2.2 | 同じ月を再生成（冪等性） | 200, 同じ件数（既存を上書き） |
| 2.3 | year/month欠落 | 400 |

#### GET /api/schedules — スケジュール一覧

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 2.4 | 生成後に一覧取得 | 全日曜日が含まれる |
| 2.5 | 未生成月の一覧 | 空配列 |

#### POST /api/schedules/:id/toggle-exclusion — 除外切替

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 2.6 | 除外に切替 | isExcluded=true |
| 2.7 | 再度切替で復帰 | isExcluded=false |
| 2.8 | 存在しないIDで切替 | 400 |

#### POST /api/schedules/:id/toggle-event — イベント切替

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 2.9 | イベント日に設定 | isEvent=true |
| 2.10 | 再度切替で解除 | isEvent=false |
| 2.11 | 存在しないIDで切替 | 400 |

---

### 3. 割り当てAPI (`assignment-api.test.ts`)

#### POST /api/assignments/generate — 自動生成

前提: 標準メンバー10名 + 4月スケジュール生成済み

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 3.1 | 正常な割り当て生成 | 200, assignments配列（日曜数×2グループ）, violations配列 |
| 3.2 | スケジュール未生成月で割り当て | 400, エラーメッセージ |
| 3.3 | メンバー不足（4人未満）で割り当て | 400, エラーメッセージ |
| 3.4 | 除外日がある場合 | 除外日の割り当てがないこと |
| 3.5 | 再生成で既存割り当てが置換される | 件数が変わらない（増えない） |

#### GET /api/assignments — 割り当て取得

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 3.6 | 生成後に取得 | 全割り当てにdate, groupNumber, membersが含まれる |
| 3.7 | 各割り当てのmembersが2名 | members.length === 2 |

#### PUT /api/assignments/:id/adjust — メンバー差し替え

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 3.8 | 正常な差し替え | 200, assignment内のメンバーが変更されている |
| 3.9 | 言語バランス違反となる差し替え | 200, violations配列に言語制約違反が含まれる |
| 3.10 | 夫婦ペアとなる差し替え | 200, violations配列に配偶者制約違反が含まれる |
| 3.11 | 存在しない割り当てIDで差し替え | 400 |
| 3.12 | 存在しないメンバーIDで差し替え | 400 |

#### DELETE /api/assignments — 月ごと削除

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 3.13 | 月の割り当て全削除 | 200, 取得すると空 |

#### DELETE /api/assignments/by-date — 日ごと削除

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 3.14 | 未来日の割り当てクリア | 200, その日の割り当てのみ削除 |
| 3.15 | 過去日の割り当てクリア試行 | 400, エラーメッセージ |

#### GET /api/assignments/candidates — 差し替え候補

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 3.16 | 候補一覧取得 | id, name, count, warnings, recommended フィールドを持つ |
| 3.17 | excludeIds で除外されたメンバーが含まれない | 指定IDが結果に含まれない |
| 3.18 | partnerId 指定で制約チェックが行われる | warnings 配列に制約違反が含まれる |
| 3.19 | 全制約クリアのメンバーが recommended=true | recommended フラグが正しい |
| 3.20 | おすすめ順にソートされている | recommended=true が先頭 |

#### GET /api/assignments/counts — 担当回数

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 3.21 | 割り当て生成後の回数取得 | members配列にcount, summary (max/min/average) |
| 3.22 | 全メンバーのcount合計 = 割り当て数 × 2 | 整合性チェック |

---

### 4. エクスポートAPI (`export-api.test.ts`)

#### GET /api/assignments/export/csv — CSV出力

前提: メンバー・スケジュール・割り当て生成済み

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 4.1 | 日本語CSVエクスポート | Content-Type: text/csv, BOM付き, 日本語ヘッダー（日付,グループ等） |
| 4.2 | 英語CSVエクスポート | 英語ヘッダー（Date, Group等） |
| 4.3 | Content-Disposition ヘッダーにファイル名 | schedule-YYYY-M.csv |

#### GET /api/assignments/export/line — LINEテキスト出力

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 4.4 | 日本語LINE出力 | text フィールドに年月・グループ番号が含まれる |
| 4.5 | 英語LINE出力 | text フィールドに Group 1, Group 2 が含まれる |

---

### 5. イベント管理シナリオ (`assignment-api.test.ts` 内)

| # | テスト内容 | 期待結果 |
|---|-----------|---------|
| 5.1 | イベント日設定後に割り当て生成 → HELPERが除外 | HELPERメンバーがイベント日の割り当てに含まれない |
| 5.2 | イベント日にHELPERを差し替えで入れようとする | 400, エラーメッセージにHELPER含む |
| 5.3 | 非イベント日にはHELPERが割り当て可能 | HELPERメンバーが割り当てに含まれる |

---

### 6. 全体ワークフロー (`full-workflow.test.ts`)

既存の `tests/integration/full-workflow.test.ts` を拡張し、以下の一連のフローをテスト:

| # | ステップ | 検証内容 |
|---|---------|---------|
| 6.1 | メンバー10名登録 | 全員登録成功、一覧で10名 |
| 6.2 | 夫婦リンク登録 | 双方向リンク確認 |
| 6.3 | 4月スケジュール生成 | 日曜日4件 |
| 6.4 | 1日を除外、1日をイベント設定 | 各フラグが反映 |
| 6.5 | 割り当て生成 | 除外日以外の日曜 × 2グループ分 |
| 6.6 | イベント日にHELPER不在の確認 | HELPERがイベント日に含まれない |
| 6.7 | 割り当て結果にviolationsのmessageKey確認 | messageKey, messageParams が存在 |
| 6.8 | メンバー差し替え | 差し替え後のメンバー確認 |
| 6.9 | 差し替え後のviolations確認（i18n対応） | messageKey が設定されている |
| 6.10 | 担当回数取得 | max, min, average, members が正しい |
| 6.11 | 未来日の割り当てクリア | 該当日のみ削除、他は残る |
| 6.12 | CSV出力（日本語） | BOM + 日本語ヘッダー + メンバー名含む |
| 6.13 | LINE出力（英語） | Group 1, Group 2 含む |
| 6.14 | メンバーCSVエクスポート→インポート（往復） | エクスポートした内容でインポートして差分なし |

---

---

# Part 2: E2Eテスト（Playwright）

## 概要

Playwrightを使い、実際のブラウザ上でユーザー操作をシミュレートするE2Eテスト。
メンバー登録→スケジュール生成→割り当て生成→差し替え→エクスポートの一連のフローを、UIを通して検証する。

## テスト基盤

### Playwright セットアップ

```bash
npm install -D @playwright/test
npx playwright install chromium  # chromiumだけで十分（軽量化）
```

### テスト用サーバー起動

Playwrightの `webServer` 設定でテスト用サーバーを自動起動する。
本番DBを壊さないよう、環境変数 `DB_PATH` で一時ファイルDBを指定する。

#### `src/infrastructure/persistence/database.ts` の変更

```typescript
export function createDatabase(path?: string): Database.Database {
  const dbPath = path ?? process.env.DB_PATH ?? 'mach-leader.db';
  const db = new Database(dbPath);
  // ...
}
```

#### `playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'DB_PATH=:memory: npx tsx src/main.ts',
    port: 3001,
    env: {
      PORT: '3001',
      DB_PATH: ':memory:',
    },
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
```

**ポイント**:
- ポートを `3001` にして本番サーバー（3000）と衝突しない
- `DB_PATH=:memory:` でインメモリDB → 本番DBに一切触れない
- 各テストファイルの `beforeEach` でAPIを直接叩いてDBをリセット（全テーブルDELETE）
- Chromiumのみで実行（マルチブラウザは不要、軽量化）

### DBリセット用エンドポイント（テスト専用）

テスト用に `DELETE /api/test/reset` を追加。`NODE_ENV=test` の場合のみ有効。

```typescript
// server.ts に追加
if (process.env.NODE_ENV === 'test') {
  app.delete('/api/test/reset', (req, res) => {
    db.exec('DELETE FROM assignments; DELETE FROM schedules; DELETE FROM members;');
    res.json({ success: true });
  });
}
```

代替案: テスト専用エンドポイントを作らず、各E2Eテスト前にサーバーを再起動する方法もあるが、起動時間のオーバーヘッドが大きいため、リセットAPIの方が効率的。

---

## テストファイル構成

```
e2e/
├── helpers/
│   └── test-data.ts          # API経由でテストデータ投入するヘルパー
├── member-management.spec.ts  # メンバー管理の画面操作
├── schedule-management.spec.ts # スケジュール管理の画面操作
├── assignment-workflow.spec.ts # 割り当て生成・差し替えの画面操作
└── full-scenario.spec.ts      # 全体を通したシナリオ
```

---

## テストヘルパー: `e2e/helpers/test-data.ts`

```typescript
import { type Page, type APIRequestContext } from '@playwright/test';

const BASE = 'http://localhost:3001';

/** DBをリセット */
export async function resetDatabase(request: APIRequestContext) {
  await request.delete(`${BASE}/api/test/reset`);
}

/** 標準10名のメンバーをAPI経由で登録 */
export async function seedStandardMembers(request: APIRequestContext) {
  const members = [ /* 標準メンバーセットと同じ */ ];
  const created = [];
  for (const m of members) {
    const res = await request.post(`${BASE}/api/members`, { data: m });
    created.push(await res.json());
  }
  return created;
}

/** スケジュール生成 */
export async function seedSchedule(request: APIRequestContext, year: number, month: number) {
  await request.post(`${BASE}/api/schedules/generate`, { data: { year, month } });
}
```

---

## テストケース一覧

### E2E-1. メンバー管理 (`member-management.spec.ts`)

| # | テスト内容 | 操作 | 検証 |
|---|-----------|------|------|
| E1.1 | メンバー登録 | 「追加」ボタン→フォーム入力→「保存」 | テーブルに新メンバーが表示される |
| E1.2 | バリデーションエラー | 名前空欄で保存 | ブラウザのrequiredバリデーションでフォーム送信されない |
| E1.3 | メンバー編集 | 「編集」ボタン→名前変更→「保存」 | テーブルの名前が更新されている |
| E1.4 | メンバー無効化 | 「無効化」ボタンをクリック | メンバーがテーブルから消える |
| E1.5 | 無効メンバー表示 | 「無効メンバーも表示」チェック | 無効化したメンバーが「無効」状態で表示される |
| E1.6 | 夫婦登録フロー | PARENT_COUPLE選択→配偶者ドロップダウンから選択→保存 | 両方のメンバーに配偶者が表示される |
| E1.7 | 言語切替 | 言語セレクトを「English」に変更 | ヘッダー・テーブルヘッダーが英語に変わる |

### E2E-2. スケジュール管理 (`schedule-management.spec.ts`)

前提: API経由でメンバー10名を事前登録

| # | テスト内容 | 操作 | 検証 |
|---|-----------|------|------|
| E2.1 | スケジュール生成 | 「スケジュール設定」タブ→「スケジュール生成」ボタン | 日曜日カードが4〜5枚表示される |
| E2.2 | 日曜日除外 | カードの「除外する」ボタン | カードに「除外日」ラベル、背景色が変わる（`.excluded`クラス） |
| E2.3 | 除外の復帰 | 除外済みカードの「含める」ボタン | 「除外日」ラベルが消える |
| E2.4 | イベント日設定 | 「イベント」ボタンをクリック | ボタンがアクティブ状態（`.active`クラス）、カードに`.event-day`クラス |
| E2.5 | イベント日解除 | アクティブ状態のイベントボタンを再クリック | `.active`クラスが外れる |
| E2.6 | 年月切替 | 年度・月セレクトを変更 | スケジュールカードが切り替わる（未生成月は空） |

### E2E-3. 割り当てワークフロー (`assignment-workflow.spec.ts`)

前提: API経由でメンバー10名 + 4月スケジュール生成済み

| # | テスト内容 | 操作 | 検証 |
|---|-----------|------|------|
| E3.1 | 割り当て自動生成 | 「割り当て結果」タブ→「自動生成」ボタン | 日ごとにグループ1・グループ2が表示される |
| E3.2 | 各グループに2名表示 | — | 各グループに2名のメンバー名が表示されている |
| E3.3 | 担当回数表示 | — | 「担当回数」セクションに棒グラフとmax/min/avg/diff |
| E3.4 | イベント日タグ表示 | イベント日を設定してから生成 | イベント日に「イベント日」タグ（`.event-tag`）が表示 |
| E3.5 | メンバー差し替え | 「差し替え」ボタン→ドロップダウンからメンバー選択→「確定」 | メンバー名が変わる |
| E3.6 | おすすめ候補表示 | 「差し替え」ボタンをクリック | ドロップダウン内に ★ 付きメンバーがいる（制約クリア者） |
| E3.7 | 候補の回数表示 | 「差し替え」ボタンをクリック | ドロップダウンに `(N回)` / `(Nx)` が表示される |
| E3.8 | 差し替え後の警告表示 | 制約違反する差し替えを実行 | 警告エリア（`.warnings`）が表示される |
| E3.9 | 警告対象メンバーの赤色 | 制約違反する差し替え後 | 該当メンバー名が赤色（`.warning-member`クラス） |
| E3.10 | 警告の自動クリア | 制約違反後に正常な差し替えを実行 | 警告エリアが非表示になる、赤色が解除される |
| E3.11 | 未来日のクリアボタン | — | 未来日に「クリア」ボタンが表示される |
| E3.12 | クリア実行 | 「クリア」ボタン→確認ダイアログOK | その日の割り当てが消える |
| E3.13 | CSV出力 | 「CSV出力」ボタン | ダウンロードが開始される（レスポンスのContent-Typeがtext/csv） |
| E3.14 | LINEテキスト出力 | 「LINE用テキスト」ボタン | ダイアログが開き、テキストエリアに年月・グループ情報が表示される |
| E3.15 | LINEテキストコピー | ダイアログ内「コピー」ボタン | ボタンテキストが「コピーしました」に変わる |

### E2E-4. 全体シナリオ (`full-scenario.spec.ts`)

ユーザーが実際に行う一連の操作を1本のテストで通す:

| ステップ | 操作 | 検証 |
|---------|------|------|
| 1 | メンバー管理タブでメンバーを5名（UPPER 3 + LOWER 2）登録 | テーブルに5名表示 |
| 2 | さらに5名（UPPER 2 + LOWER 3）追加し、合計10名 | テーブルに10名表示 |
| 3 | うち2名を夫婦登録（1名をPARENT_COUPLE + 配偶者選択） | 配偶者列に名前が表示 |
| 4 | スケジュール設定タブに切替 | 「スケジュール設定」がアクティブ |
| 5 | 年度・月を選択してスケジュール生成 | 日曜カードが表示される |
| 6 | 1日を除外、別の1日をイベント設定 | 除外・イベントのラベルが表示 |
| 7 | 割り当て結果タブに切替 | 「割り当て結果」がアクティブ |
| 8 | 自動生成を実行 | グループが表示される（除外日は無し） |
| 9 | イベント日の割り当てにヘルパーがいないことを目視確認 | （ヘルパーがいない前提でメンバー構成を調整） |
| 10 | メンバー差し替えを実行 | メンバー名が変わる |
| 11 | 担当回数セクションが表示されている | max/min/avgが表示 |
| 12 | LINE用テキストを表示してコピー | ダイアログにテキスト表示 |
| 13 | 言語を英語に切替 | UI全体が英語に変わる |
| 14 | 割り当て結果が英語で表示されている | Group 1, Group 2 |

---

## 制約・ビジネスルール

1. **DB分離**: APIテストはインメモリDB（`:memory:`）、E2Eテストもインメモリまたは一時ファイルDB。本番DB `mach-leader.db` には一切アクセスしない
2. **テスト独立性**: 各テストケースは独立したDBインスタンスを使用し、順序依存しない（ワークフロー/シナリオテストを除く）
3. **CI安定性**: ネイティブモジュール（better-sqlite3）は `npm ci` で自動ビルド。APIテストは個別5秒以内
4. **日付依存**: 過去日チェックのテストでは十分先の未来日（2027年以降）を使用してテストの時間依存を回避
5. **冪等性**: スケジュール生成・割り当て生成は再実行しても結果が安定すること
6. **E2Eのconfirmダイアログ**: Playwrightの `page.on('dialog')` でconfirmを自動承認/拒否する

---

## CI構成

### `package.json` スクリプト

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run --exclude='tests/integration/**'",
    "test:integration": "vitest run tests/integration/",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

### `.github/workflows/ci.yml` — 変更

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * 1'

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

  e2e:
    runs-on: ubuntu-latest
    needs: build-and-test    # APIテストが通った後にのみ実行
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'  # mainへのpush時のみ
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 'lts/*'
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

**E2EのCI実行方針**:
- E2EはCIでは **mainへのpush時のみ** 実行（PRでは実行しない → 高速化）
- `needs: build-and-test` でAPIテストが通った後にのみ実行
- 失敗時はPlaywrightレポート + スクリーンショットをアーティファクトとしてアップロード
- PRでの開発中は `npm run test:e2e` をローカルで実行する運用

### devDependencies 追加

```json
{
  "devDependencies": {
    "supertest": "^7.1.0",
    "@types/supertest": "^6.0.2",
    "@playwright/test": "^1.52.0"
  }
}
```

---

## database.ts の変更

`createDatabase` が環境変数 `DB_PATH` を参照するように変更:

```typescript
export function createDatabase(path?: string): Database.Database {
  const dbPath = path ?? process.env.DB_PATH ?? 'mach-leader.db';
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}
```

これにより `DB_PATH=:memory:` でテスト用インメモリDBを使える。既存の呼び出し（`createDatabase()` 引数なし）は従来通り `mach-leader.db` を使用。

---

## 受け入れ基準

### テスト基盤（共通）
- [ ] テストが本番DBに影響しないこと
- [ ] 各テストが独立して実行可能なこと（ワークフロー/シナリオ系を除く）

### APIレベル結合テスト（supertest）
- [ ] `npm run test` で全テスト（ユニット + 結合）が実行されること
- [ ] `npm run test:integration` で結合テストのみ実行可能なこと
- [ ] CI（GitHub Actions）で毎回実行・通過すること

### APIテスト — メンバー
- [ ] 登録・取得・更新・無効化のCRUD操作が正常に動作すること
- [ ] バリデーションエラーが適切に返されること
- [ ] 夫婦リンクが双方向に設定されること
- [ ] CSVエクスポート・インポートが正常に動作すること

### APIテスト — スケジュール
- [ ] 月次スケジュール生成で正しい日曜日が生成されること
- [ ] 除外・イベント切替がトグル動作すること

### APIテスト — 割り当て
- [ ] 割り当て生成で日曜数×2グループ分の割り当てが作成されること
- [ ] 除外日は割り当てに含まれないこと
- [ ] イベント日にHELPERが割り当てられないこと
- [ ] メンバー差し替えで制約違反が検出されること
- [ ] 差し替え候補に recommended/warnings/count が含まれること
- [ ] 日ごとの割り当てクリアが未来日のみ動作すること
- [ ] 担当回数が正しく集計されること

### APIテスト — エクスポート
- [ ] CSVが日英両方で正しく出力されること
- [ ] LINEテキストが日英両方で正しく出力されること

### E2Eテスト（Playwright）
- [ ] `npm run test:e2e` でE2Eテストのみ実行可能なこと
- [ ] メンバー登録がUI上で完了し、テーブルに反映されること
- [ ] スケジュール生成がUI上で完了し、カードが表示されること
- [ ] 割り当て自動生成がUI上で完了し、グループが表示されること
- [ ] メンバー差し替えがUI上で完了し、名前が変わること
- [ ] おすすめ候補に★マークと回数が表示されること
- [ ] 警告表示・自動クリア・赤色ハイライトが正しく動作すること
- [ ] クリアボタンが未来日のみ表示され、クリアが動作すること
- [ ] 言語切替でUIが日英両方に切り替わること
- [ ] LINE用テキストダイアログが正しく開き、コピーが動作すること
- [ ] CIではmainへのpush時のみE2Eが実行されること
- [ ] E2E失敗時にスクリーンショット付きレポートがアーティファクトに保存されること
