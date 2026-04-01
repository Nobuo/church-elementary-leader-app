# タスク039: EBT - 自動割り当てアルゴリズム

## タスク概要
`assignment-generator.ts` にEBT日の英語のみメンバー除外ロジックを追加する。

## 対象ファイル
- `src/domain/services/assignment-generator.ts`
- `src/__tests__/domain/services/assignment-generator.test.ts`

## 実装手順

### 1. メンバーフィルタリング追加
`generateAssignments()` 内の `available` フィルタリング（既存のイベント日フィルタの直後）に EBT 条件を追加:

```typescript
const available = activeMembers
  .filter((m) => m.isAvailableOn(dateStr))
  .filter((m) => !schedule.isEvent || m.memberType !== MemberType.HELPER)
  .filter((m) => {
    if (!schedule.isEbt) return true;
    if (m.language !== Language.ENGLISH) return true;
    // 例外: EBT以外に参加可能な非除外日がない場合は残す
    if (m.availableDates && m.availableDates.length > 0) {
      const hasNonEbtDate = activeDates.some(
        (s) => s.date !== dateStr && !s.isEbt && m.isAvailableOn(s.date),
      );
      if (!hasNonEbtDate) return true;
    }
    return false;
  });
```

### 例外条件の詳細
- `language !== 'ENGLISH'` → 対象外（JAPANESE, BOTHは常に残す）
- `language === 'ENGLISH'` かつ `availableDates` が設定されている → EBT以外に参加可能な日があるか確認
  - ある → 除外（EBT以外の日に割り当て可能）
  - ない → 例外として残す（この人はEBT日にしか来られない）
- `language === 'ENGLISH'` かつ `availableDates` が `null`（全日参加可能） → 除外（他の日に回せる）

## 依存タスク
- 037（ドメイン層 - `Schedule.isEbt` が必要）

## テスト方針
- EBT日に `ENGLISH` メンバーが割り当てられないこと
- EBT日に `JAPANESE` メンバーが通常通り割り当てられること
- EBT日に `BOTH` メンバーが通常通り割り当てられること
- EBT日しか参加できない `ENGLISH` メンバーが例外として割り当てられること
- EBT以外にも参加可能な日がある `ENGLISH` メンバーは除外されること
- EBT + イベント日の場合、ENGLISHとHELPERの両方が除外されること
- 非EBT日では全メンバーが通常通り対象になること

## 完了条件
- EBTフィルタリングが `assignment-generator.ts` に実装されている
- 例外条件が正しく動作する
- ユニットテストが全てパスする
