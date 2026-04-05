# タスク 055: CSV/LINE フォーマッター — 空きスロット対応

## 概要
CSV エクスポートと LINE テキスト生成で、空きスロットを適切に表示する。

## 対象ファイル
- `src/domain/services/csv-formatter.ts`（変更）
- `src/domain/services/line-message-formatter.ts`（変更）
- `tests/domain/csv-formatter.test.ts`（テスト追加、存在すれば）
- `tests/domain/line-message-formatter.test.ts`（テスト追加、存在すれば）

## 実装手順

### 1. csv-formatter.ts

現状のメンバー表示ロジック（59-63行目）:
```typescript
for (let i = 0; i < 3; i++) {
  const m = i < assignment.memberIds.length ? members.get(assignment.memberIds[i]) : undefined;
  fields.push(escapeCsvField(m?.name ?? ''));
  fields.push(escapeCsvField(m?.language ?? ''));
}
```

変更なし。memberIds が1人の場合、2番目・3番目は空文字になるので既存の動作で問題ない。ただし、空スロットを明示したい場合は `m?.name ?? '(TBD)'` に変更。

→ 仕様に合わせて `'(TBD)'` / `'(未定)'` を使用。schedule 情報を追加で受け取り、maxMembers まで表示する。

### 2. line-message-formatter.ts

メンバー名を連結する箇所（101-103行、109-111行）:
```typescript
const names = assignment.memberIds
  .map((mid) => members.get(mid)?.name ?? '?')
  .join(sep);
```

空きスロット分を追加表示する:
- スケジュール情報から maxMembers を算出
- `memberIds.length < maxMembers` の場合、不足分だけ `'(未定)'` / `'(TBD)'` を追加

## 依存タスク
- タスク050（Assignment の memberIds が1人になる可能性）
- タスク054（i18n キー `vacantTbd`）

## テスト方針
- 既存のフォーマッターテストがあれば追加
- なければタスク057のインテグレーションテストで確認

## 完了条件
- [x] CSV で空きスロットが `(TBD)` / `(未定)` と表示される
- [x] LINE テキストで空きスロットが `(未定)` / `(TBD)` と表示される
