# タスク 054: i18n キー追加

## 概要
メンバー解除・空きスロット割り当て機能に必要な翻訳キーを追加する。

## 対象ファイル
- `src/presentation/i18n/ja.ts`（変更）
- `src/presentation/i18n/en.ts`（変更）
- `public/js/i18n.js`（変更）

## 実装手順

### 1. サーバーサイド i18n（ja.ts / en.ts）

`assignments` セクションに追加:

| キー | 日本語 | English |
|------|--------|---------|
| `unassign` | `外す` | `Remove` |
| `assign` | `割り当て` | `Assign` |
| `unassignConfirm` | `このメンバーを外しますか？` | `Remove this member?` |
| `vacant` | `---` | `---` |
| `vacantTbd` | `(未定)` | `(TBD)` |

### 2. フロントエンド i18n（i18n.js）

同じキーをフロントエンド用に追加。

## 依存タスク
なし（他タスクと並行可能）

## テスト方針
- タスク056のUI実装時にブラウザで目視確認

## 完了条件
- [x] 日本語・英語の翻訳キーが追加されている
- [x] サーバーサイド・フロントエンド両方に追加されている
