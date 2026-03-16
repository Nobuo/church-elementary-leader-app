# 仕様書: 未来の月の割り当て一括クリア機能

## 機能概要

割り当て結果画面に「月一括クリア」ボタンを追加し、選択中の月の割り当てをまとめてクリアできるようにする。過去の割り当てはクリア不可（現行動作を維持）。クリア時は確認ダイアログを表示する。

## 背景

現在は日単位のクリアボタンのみ存在し、未来日の割り当てを1日ずつクリアする必要がある。月単位で再生成したい場合や運用変更に対応する際、一括クリアがないと操作が煩雑になる。

### 既存の日単位クリア機能

| 項目 | 現状 |
|------|------|
| UI | 各日のヘッダーに「クリア」ボタン（未来日のみ表示） |
| フロントエンド | `clearDayAssignments()` → `DELETE /api/assignments/by-date?date=YYYY-MM-DD` |
| バックエンド | 過去日チェックあり、スケジュール検索 → `deleteByScheduleId()` |
| 確認 | `confirm()` ダイアログ表示 |

## ドメインモデル

### 変更対象

| 対象 | 変更内容 |
|------|---------|
| `assignment-controller.ts` | `DELETE /api/assignments` に未来月チェックを追加 |
| `public/js/assignments.js` | 月一括クリアボタンの追加、クリア処理の実装 |
| `public/js/i18n.js` | 翻訳キーの追加 |
| `src/presentation/i18n/ja.ts` | 翻訳キーの追加 |
| `src/presentation/i18n/en.ts` | 翻訳キーの追加 |

### 新規追加なし

エンティティ・値オブジェクト・リポジトリ・ユースケースの変更は不要。既存の `deleteAssignments(year, month)` ユースケースと `deleteByScheduleIds()` リポジトリメソッドをそのまま使用する。

## ビジネスルール

### 過去月・当月の判定

当月以前はすべてクリア不可とする。当月には実施済みの週が含まれており、クリアすると誰が担当したかの記録が失われるため。

```
判定ロジック:
- 現在: 2026年3月
- 2026年3月以前 → 過去・当月（クリア不可）
- 2026年4月以降 → 未来（クリア可能）
```

具体的には、選択中の年月を暦年ベースで比較する:

```typescript
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;
const isPastOrCurrentMonth = calendarYear < currentYear ||
  (calendarYear === currentYear && month <= currentMonth);
```

注意: フロントエンドの年度 (`fiscalYear`) と暦年 (`calendarYear`) は異なる。月の比較には暦年を使用する。

### クリア対象

月一括クリアは、選択中の月の**全日程**（除外日含む）の割り当てを削除する。既存の `DELETE /api/assignments?year=YYYY&month=MM` エンドポイントの動作と同じ。

### 確認ダイアログ

クリア前に確認ダイアログを表示する。日単位クリアとは異なるメッセージで、月全体がクリアされることを明示する。

## ユースケース

### UC-1: 正常系 — 未来月の割り当て一括クリア

**前提条件:**
- 2026年4月の割り当てが生成済み（4日程分）
- 現在は2026年3月

**操作:**
1. 割り当て画面で2026年4月を選択
2. ツールバーの「月一括クリア」ボタンが表示されている
3. ボタンをクリック
4. 確認ダイアログ「この月の割り当てを全てクリアしますか？」が表示される
5. 「OK」を選択

**結果:**
- 2026年4月の全割り当てが削除される
- 画面が更新され「割り当てがありません」が表示される
- 担当回数も更新される

### UC-2: 異常系 — 当月のクリア試行

**前提条件:**
- 2026年3月の割り当てが存在
- 現在は2026年3月

**操作:**
1. 割り当て画面で2026年3月を選択

**結果:**
- 「月一括クリア」ボタンが表示されない（当月は実施済みの週を含むためクリア不可）
- 日単位のクリアボタンは未来日のみ表示（既存動作）

### UC-3: 異常系 — 過去月のクリア試行

**前提条件:**
- 2026年2月の割り当てが存在
- 現在は2026年3月

**操作:**
1. 割り当て画面で2026年2月を選択

**結果:**
- 「月一括クリア」ボタンが表示されない（フロントエンドで非表示）
- 日単位のクリアボタンも表示されない（既存動作）

### UC-4: 正常系 — 確認ダイアログでキャンセル

**操作:**
1. 「月一括クリア」ボタンをクリック
2. 確認ダイアログで「キャンセル」を選択

**結果:**
- 割り当ては削除されない
- 画面の状態は変わらない

### UC-5: 異常系 — 割り当てが存在しない月

**前提条件:**
- 2026年5月の割り当てが未生成

**操作:**
1. 割り当て画面で2026年5月を選択

**結果:**
- 「割り当てがありません」と表示
- 「月一括クリア」ボタンは表示しない（クリア対象がないため）、または表示してもクリア実行時に何も起こらない（どちらでも可）

## 入出力

### API

既存の `DELETE /api/assignments?year=YYYY&month=MM` を使用する。

#### バックエンド変更: 過去月チェックの追加

現在のエンドポイントには過去月チェックがない。安全のため、バックエンド側にも過去月の防御を追加する。

**リクエスト:** `DELETE /api/assignments?year=2026&month=4`

**レスポンス（成功）:** `{ "success": true }`

**レスポンス（当月・過去月）:** `{ "error": "Cannot clear current or past month assignments" }` (HTTP 400)

### フロントエンド

#### ボタン配置

ツールバー（自動生成ボタンの隣）に「月一括クリア」ボタンを配置する。

```html
<button id="btn-clear-month" class="btn-danger">月一括クリア</button>
```

#### 表示条件

- 選択中の月が未来月であること（当月・過去月でないこと）
- 割り当てが1件以上存在すること（任意: UX向上のため）

## 翻訳キー

### 追加する翻訳キー

| キー | 日本語 | 英語 |
|------|--------|------|
| `clearMonth` | `月一括クリア` | `Clear All` |
| `clearMonthConfirm` | `この月の割り当てを全てクリアしますか？` | `Clear all assignments for this month?` |
| `cannotClearPastMonth` | `当月以前の割り当ては一括クリアできません` | `Cannot clear current or past month assignments` |

## 実装箇所

| ファイル | 変更内容 |
|---------|---------|
| `src/presentation/controllers/assignment-controller.ts` | `DELETE /` に過去月バリデーション追加（3行程度） |
| `public/js/assignments.js` | 月一括クリアボタンの表示制御・クリック処理追加 |
| `public/js/i18n.js` | 翻訳キー3件追加 |
| `src/presentation/i18n/ja.ts` | 翻訳キー3件追加 |
| `src/presentation/i18n/en.ts` | 翻訳キー3件追加 |
| `public/index.html` | ツールバーにボタン要素追加 |

### コード変更イメージ

#### バックエンド: 過去月チェック

```typescript
// assignment-controller.ts — DELETE / 内
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;
if (year < currentYear || (year === currentYear && month <= currentMonth)) {
  res.status(400).json({ error: 'Cannot clear current or past month assignments' });
  return;
}
```

#### フロントエンド: ボタン表示制御

```javascript
// assignments.js — loadAssignments() 内
function updateClearMonthButton(assignments) {
  const btn = document.getElementById('btn-clear-month');
  if (!btn) return;

  const now = new Date();
  const calYear = getCalendarYear();
  const month = getSelectedMonth();
  const isPastOrCurrent = calYear < now.getFullYear() ||
    (calYear === now.getFullYear() && month <= now.getMonth() + 1);

  btn.style.display = (isPastOrCurrent || assignments.length === 0) ? 'none' : '';
}
```

#### フロントエンド: クリア処理

```javascript
async function clearMonthAssignments() {
  if (!confirm(t('clearMonthConfirm'))) return;
  const month = getSelectedMonth();
  const calYear = getCalendarYear();
  try {
    await API.del(`/api/assignments?year=${calYear}&month=${month}`);
    loadAssignments();
  } catch (e) {
    alert(e.message);
  }
}
```

## 受け入れ基準

- [ ] 未来月を選択時、ツールバーに「月一括クリア」ボタンが表示される
- [ ] 当月を選択時、「月一括クリア」ボタンが非表示になる
- [ ] 過去月を選択時、「月一括クリア」ボタンが非表示になる
- [ ] ボタンクリック時に確認ダイアログが表示される
- [ ] 確認ダイアログでキャンセルすると割り当てが残る
- [ ] 確認ダイアログでOKすると月の全割り当てが削除される
- [ ] バックエンドで当月・過去月のDELETEリクエストが拒否される（HTTP 400）
- [ ] 日単位のクリアボタンは既存動作のまま（影響なし）
- [ ] 既存テストが全て通る
- [ ] 月一括クリアのテストが追加されている
