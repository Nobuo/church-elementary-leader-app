# タスク040: EBT - 差し替え候補フィルタ

## タスク概要
手動調整時の差し替え候補APIにEBT日のENGLISHメンバー除外フィルタを追加する。

## 対象ファイル
- `src/presentation/controllers/assignment-controller.ts`

## 実装手順

### 1. EBTフラグ取得
既存の `isEventDay` 取得と同様に `isEbtDay` を取得:

```typescript
const isEbtDay = schedule?.isEbt ?? false;
```

### 2. フィルタリング追加
`candidates` のフィルタチェーンに追加（イベント日フィルタの直後）:

```typescript
.filter((m) => {
  if (!isEbtDay) return true;
  if (m.language !== Language.ENGLISH) return true;
  // 例外: EBT以外に参加可能な日がないメンバー
  if (m.availableDates && m.availableDates.length > 0) {
    const fiscalYearSchedules = scheduleRepo.findByFiscalYear(fiscalYear);
    const hasNonEbtDate = fiscalYearSchedules.some(
      (s) => s.date !== date && !s.isExcluded && !s.isEbt && m.isAvailableOn(s.date),
    );
    if (!hasNonEbtDate) return true;
  }
  return false;
})
```

## 依存タスク
- 037（ドメイン層）
- 038（ユースケース - DTO に `isEbt` が必要）

## テスト方針
- EBT日の差し替え候補に `ENGLISH` メンバーが含まれないこと
- EBT日の差し替え候補に `JAPANESE` / `BOTH` メンバーが含まれること
- 例外メンバーが候補に含まれること

## 完了条件
- 差し替え候補APIがEBT日でENGLISHメンバーを除外する
- 例外条件が正しく動作する
