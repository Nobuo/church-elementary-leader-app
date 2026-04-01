# EBT（English Bible Talk）スケジュールタイプの追加

## 概要
スケジュールに「EBT（English Bible Talk）」フラグを追加し、EBT日には英語のみのメンバーを自動割り当てから除外する。

## 背景
- EBTは英語しか話せない方のための特別な礼拝
- EBT日には、英語のみ（`language: 'ENGLISH'`）のメンバーはEBT礼拝に参加するため、子どもクラスのリーダーとして担当できない
- ただし、**その日しか参加できないメンバー**（`availableDates` にその日しか含まれない）は例外として割り当て対象に残す

## 期待される効果
- EBT日に英語のみメンバーが誤って割り当てられることを防止
- 英語のみメンバーがEBT礼拝に安心して参加できる
- 特定日限定メンバーの参加機会は維持される

## 設計メモ

### スケジュールエンティティの変更
- `Schedule` に `isEbt: boolean` プロパティを追加（既存の `isEvent`, `isSplitClass` と同様のパターン）
- `toggleEbt()` メソッドを追加
- DBスキーマに `is_ebt INTEGER NOT NULL DEFAULT 0` カラムを追加（マイグレーション）

### 自動割り当てアルゴリズムの変更
- `assignment-generator.ts` のメンバーフィルタリングに EBT 条件を追加
- EBT日の場合:
  - `language === 'ENGLISH'` のメンバーを除外
  - **例外**: `availableDates` がその日のみのメンバーは除外しない
- 既存の Event 日フィルタ（HELPER除外）と同様のパターン

```typescript
// イメージ（assignment-generator.ts内）
.filter((m) => {
  if (!schedule.isEbt) return true;
  if (m.language !== Language.ENGLISH) return true;
  // その日しか参加できない人は例外
  if (m.availableDates && m.availableDates.length === 1 && m.availableDates[0] === dateStr) return true;
  return false;
})
```

### UI変更
- スケジュール画面にEBTトグルボタンを追加
- EBT日を視覚的に区別（アイコンやラベル表示）

### 言語バランスへの影響
- EBT日は英語のみメンバーが減るため、言語バランス制約（各グループに英語・日本語カバー必須）への影響を考慮
- `BOTH`（両方）メンバーが英語カバーを担う形になる
- BOTH メンバーが不足する場合は割り当て不可となる可能性あり → 警告表示が望ましい

## 関連要件
- requirements.md: 3.2（言語対応）, 4（自動組み合わせ生成アルゴリズム）
- notes/2026-03-14_language-balancing.md（言語バランス調整）
- notes/2026-03-14_schedule-management.md（スケジュール管理）

## 影響範囲
- `src/domain/entities/schedule.ts` - Scheduleエンティティ
- `src/domain/services/assignment-generator.ts` - 自動割り当てアルゴリズム
- `src/infrastructure/persistence/migrations/` - 新規マイグレーション
- `src/infrastructure/persistence/sqlite-schedule-repository.ts` - リポジトリ
- UI: スケジュール画面のEBTトグル追加
