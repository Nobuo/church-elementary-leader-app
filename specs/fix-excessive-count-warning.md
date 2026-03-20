# 仕様書: 割り当て偏り警告の計算基準修正

## 機能概要

自動生成時の「割り当て回数の偏り」警告（`checkExcessiveCount`）が、**割り当てが存在するスケジュールのみ** を基準に目安を計算するよう修正する。

現状は年度内の全スケジュール数（クリア済み月のスケジュール含む）を基準にしているため、部分的にしか生成していない場合に不正確な警告が表示される。

## 背景・問題

### 再現手順
1. 2026年4〜9月を自動生成
2. 4〜9月を月一括クリア
3. 4月だけ再度自動生成
4. 全員「1回（目安 ~4.5回、少なすぎ）」と警告される

### 原因
- `totalSundays` = `allFiscalYearSchedules.filter(s => !s.isExcluded).length`
- クリアは `assignments` のみ削除し、`schedules` は残る
- → 5〜9月のスケジュール（割り当てなし）も `totalSundays` に含まれる
- → 目安が実態より大きくなり、4月だけの割り当てでは「少なすぎ」と判定

## ユースケース

### 正常系

| # | シナリオ | 期待される動作 |
|---|---------|--------------|
| 1 | 4月のみ生成 | `totalSundays` = 4月の日曜数のみ。目安は4月分で計算 |
| 2 | 4〜6月を生成 | `totalSundays` = 4〜6月の日曜数合計。目安は3ヶ月分で計算 |
| 3 | 4〜9月を生成→5〜9月クリア→4月再生成 | `totalSundays` = 4月の日曜数のみ。クリア済み月は含まない |
| 4 | 4〜9月を生成→6月クリア→4月再生成 | `totalSundays` = 4月 + 5月 + 7〜9月の日曜数。6月は含まない |
| 5 | 年度全月（4〜3月）生成済み | `totalSundays` = 年度全体の日曜数。従来と同じ動作 |

### 異常系

| # | シナリオ | 期待される動作 |
|---|---------|--------------|
| 1 | 全月クリア済み→1月だけ生成 | `totalSundays` = 当月分のみ。警告は当月基準で正しく出る |
| 2 | スケジュールが除外日（isExcluded）のみ | `totalSundays` = 0 → 警告なし（既存の `totalSundays === 0` ガード） |

## 入出力の定義

### 変更対象: `generateMonthlyAssignments()`

**入力**: 変更なし

**内部ロジック変更**:

```
// 現在（修正前）
const allFiscalYearSundays = allFiscalYearSchedules.filter(s => !s.isExcluded);
const excessiveViolations = checkExcessiveCount(members, updatedCountMap, allFiscalYearSundays.length);

// 修正後
// 「割り当てが存在するスケジュール」のみをカウント
//   = 今回生成対象月のスケジュール + 他月で割り当てが存在するスケジュール
```

**出力**: 変更なし（`GenerateAssignmentsResult` の型は同じ）

### 変更対象: `checkExcessiveCount()`

変更なし。`totalSundays` の意味が「年度全スケジュール数」から「割り当て済みスケジュール数」に変わるが、関数自体の修正は不要。

## ドメインモデル（DDD観点）

### 関連する集約・エンティティ
- `Schedule`: 日曜日のスケジュール。`isExcluded` フラグを持つ
- `Assignment`: スケジュールに対する割り当て。`scheduleId` で紐付く

### ドメインルール
- **偏り判定の基準**: 割り当てが実際に存在する（または今回生成する）スケジュールの日曜数を基準とする
- 除外日（`isExcluded`）は従来通り `totalSundays` から除外する

## 制約・ビジネスルール

1. `totalSundays` は「割り当てが存在する非除外スケジュール数 + 今回生成対象の非除外スケジュール数」とする
2. `checkExcessiveCount` のインターフェース（引数・戻り値）は変更しない
3. 割り当てアルゴリズム（`generateAlgorithm`）の `countMap` 計算には影響を与えない（こちらは既に正確）
4. 年度全月が生成済みの場合、従来と同一の結果になること

## 実装方針

`generate-assignments.ts:94-102` を以下のように修正:

```typescript
// 割り当てが存在する他月のスケジュールIDを特定
const otherScheduleIdsWithAssignments = new Set(
  existingAssignments.map((a) => a.scheduleId),
);

// totalSundays = 今回生成対象の非除外スケジュール + 他月で割り当てが存在する非除外スケジュール
const assignedSundays = allFiscalYearSchedules.filter(
  (s) =>
    !s.isExcluded &&
    (scheduleIds.includes(s.id) || otherScheduleIdsWithAssignments.has(s.id)),
);
const excessiveViolations = checkExcessiveCount(
  members,
  updatedCountMap,
  assignedSundays.length,
);
```

既存の変数（`existingAssignments`, `scheduleIds`, `allFiscalYearSchedules`）をそのまま活用するため、追加のDBクエリは不要。

## 受け入れ基準（テスト観点）

### ユニットテスト

1. **`generate-assignments` テスト追加**
   - 年度内に割り当て未生成の月がある場合、`totalSundays` に未生成月が含まれないこと
   - 年度全月が生成済みの場合、従来と同一の `totalSundays` になること

2. **`checkExcessiveCount` テスト**: 既存テストが引き続きパスすること（関数自体は変更なし）

### 手動テスト

1. 4〜9月を自動生成 → 4〜9月をクリア → 4月を再生成 → 不正確な偏り警告が出ないこと
2. 4〜9月を自動生成 → 偏り警告が正常に動作すること（リグレッションなし）
3. 4月のみ生成 → 目安が4月分の日曜数で計算されていること
