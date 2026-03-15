# セキュリティ強化

脆弱性診断で検出された全指摘事項を対応する。

## 修正一覧

| ID | 重大度 | 概要 | 対象レイヤー |
|----|--------|------|-------------|
| H1 | High | セキュリティヘッダー（helmet）の追加 | Presentation (server) |
| H2 | High | CORS設定の明示化 | Presentation (server) |
| M1 | Medium | 入力バリデーション — enum値のランタイム検証 | Application (use-cases) |
| M2 | Medium | 入力バリデーション — year/month/date の範囲・形式チェック | Presentation (controllers) |
| M3 | Medium | 入力バリデーション — name最大長 | Domain (member entity) |
| M4 | Medium | XSS対策 — innerHTML内のインラインonclick廃止 | Presentation (frontend JS) |
| M5 | Medium | レート制限の追加 | Presentation (server) |
| M6 | Medium | テストリセットエンドポイントの安全化 | Presentation (server) |
| M7 | Medium | CSVインポートのパフォーマンス改善（DoS対策） | Application (import-members-csv) |
| L1 | Low | グローバルエラーハンドラーの追加 | Presentation (server) |
| L2 | Low | JSON.parseのtry/catch | Infrastructure (repository) |
| L3 | Low | querySelector内のCSS.escape | Presentation (frontend JS) |

---

## H1: セキュリティヘッダー（helmet）の追加

### 機能概要

`helmet` ミドルウェアを導入し、X-Content-Type-Options、X-Frame-Options、Strict-Transport-Security等のセキュリティヘッダーを自動設定する。

### 実装方針

- `npm install helmet` で依存追加
- `server.ts` で `app.use(helmet())` を `express.json()` の直後に追加
- CSPは現時点では `helmet.contentSecurityPolicy` を無効化する（M4でインラインonclickを廃止した後に有効化を検討）

### 入出力

- 入力: なし
- 出力: 全レスポンスにセキュリティヘッダーが付与される

### 受け入れ基準

- [ ] レスポンスヘッダーに `X-Content-Type-Options: nosniff` が含まれる
- [ ] レスポンスヘッダーに `X-Frame-Options` が含まれる
- [ ] 既存の全テスト（単体・結合・E2E）が通る

---

## H2: CORS設定の明示化

### 機能概要

明示的なCORS設定を追加し、同一オリジンからのリクエストのみ許可する。

### 実装方針

- `cors` パッケージは使わず、helmet のデフォルトで十分（Cross-Origin関連ヘッダーが設定される）
- このアプリは同一オリジン（静的ファイルとAPIが同じサーバー）で動作するため、CORS許可ヘッダーは不要
- helmet のデフォルト設定でCross-Origin-Opener-Policy等が適用される

### 受け入れ基準

- [ ] H1のhelmet導入で対応完了
- [ ] 異なるオリジンからのAPIリクエストがブラウザによってブロックされる（デフォルト動作）

---

## M1: 入力バリデーション — enum値のランタイム検証

### 機能概要

メンバー登録・更新時にリクエストボディの `gender`, `language`, `gradeGroup`, `memberType` がドメインの許容値であることをランタイムで検証する。

### 現状の問題

TypeScript の `as` キャストはコンパイル時のみ有効。ランタイムでは任意の文字列が通過し、不正なデータがDBに保存される。

### 実装方針

- `src/shared/validators.ts` にバリデーション関数を新規作成
- 各enumの許容値セットを定義し、値の所属を検証
- `register-member.ts` と `update-member.ts` でバリデーション呼び出し
- 不正な値は `Result.err` で400エラーを返す

### バリデーション関数

```typescript
// src/shared/validators.ts
import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';

export function isValidGender(v: string): v is Gender {
  return Object.values(Gender).includes(v as Gender);
}
export function isValidLanguage(v: string): v is Language {
  return Object.values(Language).includes(v as Language);
}
export function isValidGradeGroup(v: string): v is GradeGroup {
  return Object.values(GradeGroup).includes(v as GradeGroup);
}
export function isValidMemberType(v: string): v is MemberType {
  return Object.values(MemberType).includes(v as MemberType);
}
```

### ユースケース

**正常系:**
- `{ "gender": "MALE" }` → 検証通過

**異常系:**
- `{ "gender": "ATTACK" }` → 400 `Invalid gender: ATTACK`
- `{ "language": "" }` → 400 `Invalid language`
- フィールド未指定 → 400 エラー

### 受け入れ基準

- [ ] 不正なenum値でPOST/PUTすると400が返る
- [ ] 正当な値では従来通り動作する
- [ ] バリデーションのユニットテストがある

---

## M2: 入力バリデーション — year/month/date の範囲・形式チェック

### 機能概要

APIパラメータの `year`, `month`, `date` に範囲・形式検証を追加する。

### 実装方針

- `src/shared/validators.ts` にヘルパー関数を追加
- 各コントローラーの該当箇所で使用

### バリデーションルール

| パラメータ | ルール |
|-----------|--------|
| `year` | 2000 ≤ year ≤ 2100（整数） |
| `month` | 1 ≤ month ≤ 12（整数） |
| `date` | `/^\d{4}-\d{2}-\d{2}$/` かつ `new Date(date)` が有効 |

### 対象箇所

- `schedule-controller.ts` — POST `/generate` (year, month)
- `assignment-controller.ts` — GET `/` (year, month)
- `assignment-controller.ts` — POST `/generate` (year, month from body)
- `assignment-controller.ts` — DELETE `/` (year, month)
- `assignment-controller.ts` — DELETE `/by-date` (date)
- `assignment-controller.ts` — GET `/candidates` (date)
- `assignment-controller.ts` — GET `/export/csv` (year, month)
- `assignment-controller.ts` — GET `/export/line` (year, month)
- `assignment-controller.ts` — GET `/counts` (fiscalYear)

### ユースケース

**異常系:**
- `?month=13` → 400 `month must be between 1 and 12`
- `?year=-1` → 400 `year must be between 2000 and 2100`
- `?date=not-a-date` → 400 `Invalid date format`

### 受け入れ基準

- [ ] 範囲外のyear/monthで400が返る
- [ ] 不正なdate形式で400が返る
- [ ] 正常なパラメータでは従来通り動作する

---

## M3: 入力バリデーション — name最大長

### 機能概要

メンバー名に最大長制限（200文字）を追加する。

### 実装方針

- `Member.create()` と `Member.update()` に `name.length > 200` チェックを追加
- エラー: `Name must be 200 characters or less`

### 受け入れ基準

- [ ] 201文字以上の名前で登録しようとすると400が返る
- [ ] 200文字以下は従来通り登録できる

---

## M4: XSS対策 — innerHTML内のインラインonclick廃止

### 機能概要

フロントエンドJSで `innerHTML` に埋め込んでいるインライン `onclick` ハンドラーをイベントデリゲーション方式に置き換え、サーバーから取得したIDがJavaScript実行コンテキストに直接入らないようにする。

### 現状の問題

```javascript
// 現在の実装（危険）
`<button onclick="editMember('${m.id}')">編集</button>`
```

`m.id` はUUID形式（安全）だが、パターンとして脆弱。IDが制御されると任意コード実行可能。

### 実装方針

1. `data-*` 属性にIDを設定し、`escapeHtml()` でエスケープ
2. コンテナ要素にイベントデリゲーション（`addEventListener('click', ...)`）を設定
3. `event.target.closest('[data-action]')` でアクション種別を判定

### 対象ファイル・関数

| ファイル | 関数 | 変更内容 |
|---------|------|---------|
| `members.js` | `renderMembers()` | `onclick="editMember('${m.id}')"` → `data-action="edit" data-id="${escapeHtml(m.id)}"` |
| `members.js` | `renderMembers()` | `onclick="deactivateMember('${m.id}', '${...}')"` → `data-action="deactivate" data-id data-name` |
| `members.js` | `renderMembers()` | `onclick="reactivateMember('${m.id}')"` → `data-action="reactivate" data-id` |
| `members.js` | `openMemberForm()` | 日付リストの削除ボタン onclick → data-action |
| `schedules.js` | `renderSchedules()` | `onclick="toggleScheduleExclusion('${s.id}')"` 等 → data-action + data-id |
| `assignments.js` | `renderAssignments()` | `onclick="showReplace(...)"` 等 → data-action + data属性 |

### イベントデリゲーション例

```javascript
// members.js の初期化時
document.getElementById('members-body').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (action === 'edit') editMember(id);
  if (action === 'deactivate') deactivateMember(id, btn.dataset.name);
  if (action === 'reactivate') reactivateMember(id);
});
```

### 受け入れ基準

- [ ] `onclick` 属性がフロントエンドJSの `innerHTML` 内に存在しない
- [ ] 全操作（編集・無効化・再有効化・スケジュール操作・差し替え等）が従来通り動作する
- [ ] E2Eテストが全て通る
- [ ] `escapeHtml()` がdata属性値に適用されている

---

## M5: レート制限の追加

### 機能概要

APIエンドポイントにレート制限を追加し、DoS攻撃を緩和する。

### 実装方針

- `express-rate-limit` パッケージを導入
- 全APIルートに適用（`/api/` プレフィックス）
- 静的ファイル配信にはレート制限をかけない

### 設定値

| 項目 | 値 |
|------|-----|
| windowMs | 1分 (60,000ms) |
| max | 100リクエスト/分 |
| standardHeaders | true（RateLimit-* ヘッダー付与） |
| legacyHeaders | false |

### 実装箇所

```typescript
// server.ts
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);
```

### ユースケース

**正常系:**
- 通常操作（数リクエスト/分）→ 制限にかからない

**異常系:**
- 1分間に100リクエスト超過 → 429 Too Many Requests

### 受け入れ基準

- [ ] レスポンスに `RateLimit-*` ヘッダーが含まれる
- [ ] 制限超過時に429が返る
- [ ] テスト環境では制限が緩和または無効化されている（結合テストが通る）

---

## M6: テストリセットエンドポイントの安全化

### 機能概要

`DELETE /api/test/reset` エンドポイントの保護を強化する。

### 現状の問題

`process.env.NODE_ENV === 'test'` のみで保護。誤設定で本番データが削除されるリスク。

### 実装方針

- `NODE_ENV === 'test'` に加えて、`options.db` が渡されている場合のみ登録（現状もそうなっている）
- 追加の安全策として、`X-Test-Reset-Token` ヘッダーの検証を追加
- トークンは `process.env.TEST_RESET_TOKEN` で設定（テスト時のみ）

### 受け入れ基準

- [ ] `NODE_ENV=test` かつトークンが一致する場合のみリセットが実行される
- [ ] トークンなし or 不一致で403が返る
- [ ] 結合テストが引き続き通る

---

## M7: CSVインポートのパフォーマンス改善（DoS対策）

### 機能概要

CSVインポート時の `memberRepo.findAll(false)` をループ外に移動し、O(n*m) → O(n+m) に改善する。

### 現状の問題

```typescript
// 各行でfindAll()を呼び出し → O(n*m)
for (let i = 0; i < dataLines.length; i++) {
  const allCurrent = memberRepo.findAll(false);  // 毎回全件取得
  const existing = allCurrent.find(m => m.name === parsed.name);
  ...
}
```

### 実装方針

1. ループ前に1回だけ `memberRepo.findAll(false)` を実行
2. `Map<string, Member>` （name→Member）のルックアップマップを構築
3. ループ内で作成・更新したメンバーをマップに反映
4. Phase 2（配偶者リンク）も同様にマップを使用

```typescript
const allMembers = memberRepo.findAll(false);
const memberByName = new Map(allMembers.map(m => [m.name, m]));

for (const line of dataLines) {
  const existing = memberByName.get(parsed.name);
  // ... 処理 ...
  // 保存後にマップを更新
  memberByName.set(member.name, member);
}
```

### 受け入れ基準

- [ ] CSVインポートの動作が従来と同じ（既存テスト通過）
- [ ] `findAll` がインポート処理全体で最大2回（メイン処理 + 配偶者リンク）になっている

---

## L1: グローバルエラーハンドラーの追加

### 機能概要

Expressのエラーハンドリングミドルウェアを追加し、未処理例外でスタックトレースがクライアントに漏洩しないようにする。

### 実装方針

- `server.ts` のルーティング定義の最後にエラーハンドラーを追加
- 本番: `{ error: 'Internal server error' }` のみ返す
- 開発/テスト: エラーメッセージも含める（デバッグ用）

```typescript
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;
  res.status(500).json({ error: message });
});
```

### 受け入れ基準

- [ ] 未処理例外発生時に500 + 汎用メッセージが返る
- [ ] スタックトレースがレスポンスに含まれない（NODE_ENV=production時）

---

## L2: JSON.parseのtry/catch

### 機能概要

リポジトリ内の `JSON.parse(row.available_dates)` にtry/catchを追加し、不正なJSONでプロセスがクラッシュしないようにする。

### 実装方針

- `sqlite-member-repository.ts` の `toMember()` 関数で `JSON.parse` をtry/catchで囲む
- パースエラー時は `null`（制限なし）として扱い、`console.warn` でログ出力

### 対象箇所

```typescript
// sqlite-member-repository.ts toMember() 内
let availableDates: string[] | null = null;
if (row.available_dates) {
  try {
    availableDates = JSON.parse(row.available_dates);
  } catch {
    console.warn(`Invalid JSON in available_dates for member ${row.id}`);
  }
}
```

### 受け入れ基準

- [ ] 不正なJSONがDB内にあってもエラーにならずnullとして扱われる
- [ ] 正常なJSONは従来通りパースされる

---

## L3: querySelector内のCSS.escape

### 機能概要

`querySelector` に動的値を渡す箇所で `CSS.escape()` を使い、セレクタインジェクションを防止する。

### 対象箇所

| ファイル | 行 | 現在のコード |
|---------|-----|-------------|
| `members.js` | 77 | `option[value="${currentSpouse.id}"]` |
| `members.js` | 130 | `[data-date="${date}"]` |

### 修正例

```javascript
// Before
el.querySelector(`option[value="${currentSpouse.id}"]`)
// After
el.querySelector(`option[value="${CSS.escape(currentSpouse.id)}"]`)
```

### 受け入れ基準

- [ ] `querySelector` で動的値を使う全箇所で `CSS.escape()` が適用されている
- [ ] 既存の動作に影響がない

---

## 実装順序

依存関係を考慮した推奨順序:

1. **H1** (helmet) — 他に依存なし、1行で追加
2. **M5** (rate limit) — パッケージ追加のみ
3. **L1** (エラーハンドラー) — server.ts の変更を集約
4. **M6** (テストリセット安全化) — server.ts の変更を集約
5. **M1** (enum バリデーション) — validators.ts 新規作成
6. **M2** (year/month/date バリデーション) — validators.ts に追加
7. **M3** (name最大長) — Member エンティティ変更
8. **M7** (CSVインポート改善) — use-case変更
9. **L2** (JSON.parse try/catch) — リポジトリ変更
10. **M4** (XSS — onclick廃止) — フロントエンド大幅変更
11. **L3** (CSS.escape) — M4と合わせて対応

## 非対応事項（意図的に除外）

| 項目 | 理由 |
|------|------|
| 認証・認可 (H1診断) | 教会内部ローカル利用のアプリであり、現時点では認証不要。将来的にインターネット公開する場合に再検討 |
| CSRF対策 (H2診断) | 認証がないため、CSRFの実害は限定的。認証追加時に合わせて対応 |
| HTTPS強制 | デプロイ時にリバースプロキシ（nginx等）で対応する想定 |
| CSP有効化 | M4（onclick廃止）完了後に `helmet` のCSP設定を有効化する（別タスクとして管理） |
