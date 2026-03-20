# タスク020: 割り当て偏り警告の計算基準修正

## 概要

`checkExcessiveCount` に渡す `totalSundays` を「年度全スケジュール数」から「割り当て済みスケジュール数」に修正し、クリア済み月を含まないようにする。

## 仕様書
- `specs/fix-excessive-count-warning.md`

## 依存タスク
- なし（独立した修正）

## 対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/application/use-cases/generate-assignments.ts` | `totalSundays` 計算ロジック修正 |
| `tests/application/generate-assignments.test.ts` | 新規: ユニットテスト追加 |

## 実装手順

### Step 1: `generate-assignments.ts` の修正

`generate-assignments.ts:94-102` を修正する。

**修正前:**
```typescript
const allFiscalYearSundays = allFiscalYearSchedules.filter((s) => !s.isExcluded);
const excessiveViolations = checkExcessiveCount(members, updatedCountMap, allFiscalYearSundays.length);
```

**修正後:**
```typescript
// totalSundays: 割り当てが存在するスケジュールのみをカウント
const otherScheduleIdsWithAssignments = new Set(
  existingAssignments.map((a) => a.scheduleId),
);
const assignedSundays = allFiscalYearSchedules.filter(
  (s) =>
    !s.isExcluded &&
    (scheduleIds.includes(s.id) || otherScheduleIdsWithAssignments.has(s.id)),
);
const excessiveViolations = checkExcessiveCount(members, updatedCountMap, assignedSundays.length);
```

ポイント:
- `existingAssignments` = 他月の割り当て済みデータ（既存変数を再利用）
- `scheduleIds` = 今回生成対象月のスケジュールID（既存変数を再利用）
- 追加のDBクエリ不要

### Step 2: ユニットテスト作成

`tests/application/generate-assignments.test.ts` を新規作成。

テストケース:
1. **クリア済み月があっても正しい `totalSundays` で警告が計算される**
   - 年度内に2ヶ月分のスケジュールがあり、1ヶ月分だけ割り当て生成
   - 未生成月のスケジュールが `totalSundays` に含まれないことを検証
   - 警告の `expected` 値が当月分のみで計算されていること

2. **全月生成済みの場合は従来通り動作する**
   - 年度内の全スケジュールに割り当てがある状態で生成
   - `totalSundays` が全スケジュール数になることを検証

3. **除外日は `totalSundays` に含まれない**
   - `isExcluded = true` のスケジュールがフィルタされることを検証

テスト方針:
- リポジトリはインメモリ実装またはモックを使用
- `generateMonthlyAssignments` を呼び出し、戻り値の `violations` を検証
- 既存の `tests/domain/constraint-checker.test.ts` はそのままパスすること

### Step 3: 既存テスト実行・確認

```bash
npm test
```

全テストがパスすることを確認。

## 完了条件

- [x] `generate-assignments.ts` の `totalSundays` 計算が割り当て済みスケジュールのみを対象にしている
- [x] クリア済み月のスケジュールが `totalSundays` に含まれない
- [x] 年度全月生成済みの場合、従来と同一の結果になる
- [x] ユニットテストが追加されている
- [x] 既存テストが全てパスする

## ステータス: 完了
