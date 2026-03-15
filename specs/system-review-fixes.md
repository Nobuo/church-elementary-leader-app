# システムレビュー指摘修正

レビューで検出された仕様上の問題点をまとめて修正する。I4（availableDatesのDB格納形式）以外すべて対応する。

## 修正一覧

| ID | 重大度 | 概要 | 対象レイヤー |
|----|--------|------|-------------|
| C1 | Critical | 参加可能日をUIから設定できない | Presentation (HTML/JS) |
| C2 | Critical | メンバー再有効化できない | Domain / Presentation |
| W1 | Warning | 夫婦ペア回避が同日別グループにも適用される旨を仕様に明記 | Spec のみ |
| W2 | Warning | 除外日に分級/イベントフラグを設定できてしまう | Domain / Presentation |
| W3 | Warning | replaceMember で存在しない oldMemberId がエラーにならない | Domain |
| W4 | Warning | CSV出力でカンマ含む名前が壊れる | Domain (csv-formatter) |
| W5 | Warning | 分級日の Group 1 で BOTH メンバーへのボーナスなし | Domain (assignment-generator) |
| W6 | Warning | LINE メッセージにイベント/分級タグがない | Domain (line-message-formatter) |
| W7 | Warning | 年度→暦年変換ロジックがフロントに散在 | Presentation (JS) |
| I1 | Info | プロジェクト名を church-elementary-leader-app に変更 | package.json, README |
| I2 | Info | メンバー無効化時の確認ダイアログなし | Presentation (JS) |
| I3 | Info | 割り当て再生成時の確認ダイアログなし | Presentation (JS) |
| I5 | Info | メンバー一覧に参加可能日の列がない | Presentation (HTML/JS) |
| I6 | Info | 割り当てCSV出力にイベント/分級情報がない | Domain (csv-formatter) |

---

## C1: 参加可能日をUIから設定できるようにする

### 機能概要

メンバー登録・編集フォームに「参加可能日」入力欄を追加し、特定日のみ参加可能なメンバーを設定できるようにする。

### UI仕様

メンバーフォームの配偶者フィールドの下に追加:

```
参加可能日（空欄＝全日参加可能）
[2026-04-05] [×]
[2026-04-12] [×]
[+ 日付を追加]
```

- `<input type="date">` で日付を追加するUI
- 複数の日付をリスト表示し、各日付に削除ボタン
- 空の場合は「全日参加可能」として扱う（既存ロジックと一致）
- API送信時は `availableDates: string[] | null` として送信（空配列 → `null`）

### ドメインモデル

変更なし。`Member.availableDates` は既に実装済み。

### API

変更なし。`POST /api/members` と `PUT /api/members/:id` は既に `availableDates` を受け付けている。

### 影響範囲

| ファイル | 変更内容 |
|----------|----------|
| `public/index.html` | フォームに参加可能日フィールド追加 |
| `public/js/members.js` | 日付追加/削除UI、フォーム送信時のデータ収集 |
| `public/js/i18n.js` | `availableDates`, `allDatesAvailable`, `addDate` の翻訳追加 |

### 受け入れ基準

| # | テスト | 期待結果 |
|---|--------|----------|
| C1-1 | フォームに参加可能日フィールドが表示される | date入力と追加ボタンが表示 |
| C1-2 | 日付を追加すると一覧に表示される | 追加した日付がリスト表示 |
| C1-3 | 日付を削除できる | ×ボタンで削除 |
| C1-4 | 空のまま保存 → 全日参加可能 | `availableDates: null` で保存 |
| C1-5 | 日付指定して保存 → 編集時に復元される | 保存した日付が再表示される |
| C1-6 | 参加可能日以外の日には自動生成で割り当てられない | 既存ロジックで担保済み |

---

## C2: メンバー再有効化

### 機能概要

無効化されたメンバーを再び有効にできるようにする。

### ドメインモデル

`Member` エンティティに `reactivate()` メソッドを追加:

```typescript
reactivate(): Member {
  return new Member({ ...this.toProps(), isActive: true });
}
```

### API

```
POST /api/members/:id/reactivate
```

レスポンス: 更新後の MemberDto

### UI仕様

メンバー一覧で無効メンバーを表示時（「無効メンバーも表示」チェック時）:
- 無効メンバーの操作列に「有効化」ボタンを表示（`btn-small` スタイル）
- クリックで即座に有効化される

### 影響範囲

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/entities/member.ts` | `reactivate()` メソッド追加 |
| `src/application/use-cases/deactivate-member.ts` | `reactivateMember()` ユースケース追加（既存ファイルに追加） |
| `src/presentation/controllers/member-controller.ts` | `POST /:id/reactivate` エンドポイント追加 |
| `public/js/members.js` | 有効化ボタンと `reactivateMemberAction()` 追加 |

### 受け入れ基準

| # | テスト | 期待結果 |
|---|--------|----------|
| C2-1 | 無効メンバーに「有効化」ボタンが表示される | ボタンあり |
| C2-2 | ボタンクリックでメンバーが有効化される | `isActive: true` |
| C2-3 | 有効メンバーには「有効化」ボタンが表示されない | 表示なし |
| C2-4 | 有効化後、割り当て候補に含まれる | 自動生成で選択対象 |

---

## W1: 夫婦ペア回避の仕様明記

### 変更内容

`specs/assignment-algorithm.md` の制約条件 6「夫婦回避」に以下を追記:

> 夫婦回避は同グループだけでなく、**同じ日の別グループに配置された場合にも** 同等のペナルティ（30点）を加算する。理由: 夫婦のどちらかが休む場合、子どもの送迎が不可能になるため。

### 影響範囲

仕様書のみ。実装変更なし。

---

## W2: 除外日に分級/イベントフラグを設定不可にする

### 機能概要

除外日（`isExcluded = true`）のスケジュールカードでは、イベント・分級ボタンを非活性にする。除外解除時に自動リセットはしない（既に設定済みの値は保持し、除外解除時に復元される）。

### UI仕様

```
┌──────────────────────────────┐
│ 4/13 (日)   除外日            │
│ [含める] [イベント] [分級]     │ ← イベント・分級ボタンを disabled
└──────────────────────────────┘
```

### 影響範囲

| ファイル | 変更内容 |
|----------|----------|
| `public/js/schedules.js` | 除外日のイベント・分級ボタンに `disabled` 属性追加 |

### 受け入れ基準

| # | テスト | 期待結果 |
|---|--------|----------|
| W2-1 | 除外日でイベントボタンが押せない | `disabled` 状態 |
| W2-2 | 除外日で分級ボタンが押せない | `disabled` 状態 |
| W2-3 | 除外解除後にイベント・分級ボタンが押せる | `disabled` 解除 |

---

## W3: replaceMember で存在しない oldMemberId をエラーにする

### 機能概要

`Assignment.replaceMember()` で `oldMemberId` がアサインメントに含まれない場合、例外を発生させる。

### ドメインモデル

```typescript
replaceMember(oldMemberId: MemberId, newMemberId: MemberId): Assignment {
  if (!this.memberIds.includes(oldMemberId)) {
    throw new Error(`Member ${oldMemberId} is not in this assignment`);
  }
  // ... 既存ロジック
}
```

### 影響範囲

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/entities/assignment.ts` | `replaceMember()` にガード追加 |

### 受け入れ基準

| # | テスト | 期待結果 |
|---|--------|----------|
| W3-1 | 存在しない oldMemberId で replaceMember() を呼ぶ | Error がスローされる |
| W3-2 | 正しい oldMemberId で replaceMember() を呼ぶ | 正常に差し替えられる |

---

## W4: CSV出力のカンマ・引用符エスケープ

### 機能概要

`csv-formatter.ts`（割り当てCSV）のフィールド出力を RFC 4180 準拠のエスケープ処理に修正する。`member-csv-formatter.ts` は既に `escapeCsvField()` を使用しており対応済み。

### 影響範囲

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/services/csv-formatter.ts` | 各フィールドに `escapeCsvField()` を適用 |

### ロジック

```typescript
function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
```

### 受け入れ基準

| # | テスト | 期待結果 |
|---|--------|----------|
| W4-1 | カンマを含むメンバー名でCSV出力 | ダブルクォートで囲まれる |
| W4-2 | ダブルクォートを含むメンバー名でCSV出力 | `""` にエスケープされる |

---

## W5: 分級日の Group 1 で BOTH メンバーにボーナス

### 機能概要

分級日の Group 1 スコアリングで、BOTH メンバーに小さなボーナス（-5）を与え、Group 1 で BOTH が選ばれやすくする。これにより Group 2 で全体 BOTH 数 2 を達成しやすくなる。

### アルゴリズム変更

`scorePair()` に `isSplitClassDay: boolean` パラメータを追加（既存の `classContext` とは独立）:

```
if isSplitClassDay:
  for each member in [member1, member2]:
    if member.language === BOTH:
      score -= 5   // BOTH メンバーを少し優遇
```

Group 1 にも Group 2 にも適用する。Group 2 では `classContext` による 100,000 ペナルティが主要な制約だが、-5 ボーナスは同スコアの候補間で BOTH を優先する効果がある。

### 影響範囲

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/services/assignment-generator.ts` | `scorePair()` に `isSplitClassDay` パラメータ追加、BOTH ボーナスロジック追加 |

### 受け入れ基準

| # | テスト | 期待結果 |
|---|--------|----------|
| W5-1 | 分級日で BOTH と 非BOTH が同等スコアの場合 | BOTH が選ばれる |
| W5-2 | 分級なしの日 | ボーナスなし（既存動作と同一） |

---

## W6: LINE メッセージにイベント/分級タグを追加

### 機能概要

LINE メッセージ出力で、イベント日には「🎉 イベント日」、分級日には「📚 分級あり」のタグを日付行に表示する。

### 出力例

```
📅 2027年4月 リーダー担当表

4/5（日）
  グループ 1: 田中さん・鈴木さん
  グループ 2: 佐藤さん・山田さん

4/12（日）🎉 イベント日
  グループ 1: 高橋さん・伊藤さん
  グループ 2: 渡辺さん・中村さん

4/19（日）📚 分級あり
  グループ 1: 小林さん・加藤さん
  グループ 2: 吉田さん・山口さん
```

英語版:
```
4/12 (Sun) 🎉 Event Day
4/19 (Sun) 📚 Split Class
```

### 影響範囲

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/services/line-message-formatter.ts` | 日付行にイベント/分級タグ追加 |

### 受け入れ基準

| # | テスト | 期待結果 |
|---|--------|----------|
| W6-1 | イベント日のLINE出力 | 日付行に `🎉 イベント日` が表示される |
| W6-2 | 分級日のLINE出力 | 日付行に `📚 分級あり` が表示される |
| W6-3 | 通常日のLINE出力 | タグなし |
| W6-4 | 英語でのLINE出力 | 英語タグ表示 |

---

## W7: 年度→暦年変換ロジックの共通化

### 機能概要

フロントエンドの `const calYear = month <= 3 ? year + 1 : year;` が3箇所（`assignments.js` の `loadAssignments`, `generateAssignmentsAction`, `exportCsv`/`exportLine`）に散在している。共通関数に統一する。

### 変更内容

`public/js/app.js` に共通関数を追加:

```javascript
function getCalendarYear(fiscalYear, month) {
  return month <= 3 ? fiscalYear + 1 : fiscalYear;
}
```

`assignments.js` の各関数で直接計算していた箇所をこの関数に置き換える。

### 影響範囲

| ファイル | 変更内容 |
|----------|----------|
| `public/js/app.js` | `getCalendarYear()` 関数追加 |
| `public/js/assignments.js` | 3箇所を `getCalendarYear()` 呼び出しに置換 |

### 受け入れ基準

| # | テスト | 期待結果 |
|---|--------|----------|
| W7-1 | 4月（month=4）、年度2027 → calYear=2027 | 正しく変換 |
| W7-2 | 1月（month=1）、年度2027 → calYear=2028 | 正しく変換 |

---

## I1: プロジェクト名変更

### 変更内容

`notes/2026-03-14_additional-things.md` の追加要件6に従い、`package.json` の `name` フィールドを変更する。

```json
"name": "church-elementary-leader-app"
```

### 影響範囲

| ファイル | 変更内容 |
|----------|----------|
| `package.json` | `name` を `church-elementary-leader-app` に変更 |

---

## I2: メンバー無効化の確認ダイアログ

### 機能概要

メンバー無効化ボタンをクリックした際に `confirm()` ダイアログを表示する。

### 影響範囲

| ファイル | 変更内容 |
|----------|----------|
| `public/js/members.js` | `deactivateMemberAction()` に `confirm()` 追加 |

### 確認メッセージ

- 日本語: `「{name}」を無効化しますか？`
- 英語: `Deactivate "{name}"?`

### i18n

| キー | 日本語 | 英語 |
|------|--------|------|
| deactivateConfirm | 「{name}」を無効化しますか？ | Deactivate "{name}"? |

---

## I3: 割り当て再生成の確認ダイアログ

### 機能概要

割り当て「自動生成」ボタンをクリックした際に、既存の割り当てがある場合は `confirm()` ダイアログを表示する。

### 影響範囲

| ファイル | 変更内容 |
|----------|----------|
| `public/js/assignments.js` | `generateAssignmentsAction()` に確認ロジック追加 |

### ロジック

```javascript
// 既存の割り当てがあるかチェック
const existing = document.getElementById('assignments-list').children.length;
if (existing > 0) {
  if (!confirm(t('regenerateConfirm'))) return;
}
```

### i18n

| キー | 日本語 | 英語 |
|------|--------|------|
| regenerateConfirm | 既存の割り当てを上書きします。続けますか？ | This will overwrite existing assignments. Continue? |

---

## I5: メンバー一覧に参加可能日の列を追加

### 機能概要

メンバー一覧テーブルに「参加可能日」列を追加し、日付制約があるメンバーを一目で識別できるようにする。

### UI仕様

| 表示パターン | 条件 |
|-------------|------|
| 全日 | `availableDates` が null（制約なし） |
| 3日 | `availableDates` が3件 |
| 制限あり(5) | `availableDates` が5件以上の場合は件数表示 |

テーブルヘッダーの「状態」列の前に配置。

### 影響範囲

| ファイル | 変更内容 |
|----------|----------|
| `public/index.html` | テーブルヘッダーに `th-available` 列追加 |
| `public/js/members.js` | 行に参加可能日の情報表示 |
| `public/js/i18n.js` | `allDays` 等の翻訳追加 |

### i18n

| キー | 日本語 | 英語 |
|------|--------|------|
| availableDates | 参加可能日 | Available |
| allDays | 全日 | All |

---

## I6: 割り当てCSV出力にイベント/分級列を追加

### 機能概要

割り当てCSVに「イベント日」「分級」列を追加し、日付の特殊属性をCSVからも確認できるようにする。

### CSV列の追加

| 日本語ヘッダー | 英語ヘッダー | 値 |
|---------------|-------------|-----|
| イベント日 | Event Day | TRUE / FALSE |
| 分級 | Split Class | TRUE / FALSE |

日付列の直後に挿入。

### 影響範囲

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/services/csv-formatter.ts` | ヘッダーとデータ行にイベント/分級列追加 |

### 受け入れ基準

| # | テスト | 期待結果 |
|---|--------|----------|
| I6-1 | イベント日のCSV出力 | `TRUE` が表示 |
| I6-2 | 分級日のCSV出力 | `TRUE` が表示 |
| I6-3 | 通常日のCSV出力 | `FALSE` が表示 |

---

## 全体の受け入れ基準

- 全 vitest テスト（既存 + 新規）が通る
- TypeScript typecheck が通る
- ESLint が通る
- 全 Playwright E2E テストが通る
