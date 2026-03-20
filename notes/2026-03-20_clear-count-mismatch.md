# クリア後の警告カウント不整合

## 再現手順
1. 2026年4月〜9月を自動生成
2. 4〜9月を月一括クリア
3. 4月だけ再度自動生成
4. → 全員「1回（目安 ~4.5回、少なすぎ）」と警告が出る

## 原因

**`totalSundays`（目安の計算基準）と実際の割り当て範囲がズレている。**

`checkExcessiveCount()` に渡される `totalSundays` は **年度全体のスケジュール数** (`allFiscalYearSundays.length`) で計算されている（`generate-assignments.ts:101-102`）。

```
expectedCount = (totalSundays * 4) / activeMembers.length
```

- `totalSundays` = 年度全体（4月〜3月）の日曜日数 ≒ 約48回
- `activeMembers` ≒ 約17人
- → `expectedCount` ≒ (48 * 4) / 17 ≒ **約11.3回**...ではなく、スクリーンショットでは**目安 ~4.5回**と出ている

目安4.5ということは `totalSundays` ≒ 19程度。つまり4月〜9月分のスケジュールレコードが残っている（クリアはassignmentsだけ削除し、schedulesは残る）。

### 核心的な問題

`allFiscalYearSchedules` には**割り当てがクリアされた5〜9月のスケジュールも含まれる**。

- スケジュール（日曜日のリスト）はクリアしても削除されない
- `totalSundays` = 4〜9月のスケジュール数 ≒ 約19回分
- `expectedCount` = (19 * 4) / 17 ≒ **~4.5回**（画像と一致）
- しかし実際の割り当ては4月分の4〜5回だけ
- → 各メンバーの割り当ては1回程度で、目安4.5回の50%未満 → **警告発生**

つまり：
- **目安（expected）は5〜9月分のスケジュールも含めて計算される**
- **実際の割り当て（count）は4月分しかない**
- → ギャップが生じて「少なすぎ」と判定

## 影響
- ユーザーにとって紛らわしい不要な警告が表示される
- 割り当て自体は正しく動作している（割り当てアルゴリズムの `countMap` は正確）

## 修正案

### 案1: totalSundaysを「割り当てが存在する月」のスケジュールだけにする
- `allFiscalYearSchedules` のうち、実際に割り当てが存在するスケジュールだけを `totalSundays` としてカウント
- Pros: 正確。部分的に生成した場合も正しく動く
- Cons: 追加のDB問い合わせが必要

### 案2: totalSundaysを「今回の対象月 + 他月の割り当て済み」にする
- 今回生成する月のスケジュール + 他月で実際にassignmentが存在するスケジュール数
- Pros: 正確で実装もシンプル
- Cons: `otherScheduleIds` にフィルタが必要

### 案3: 警告計算時に、割り当て0のメンバーが多数の場合は警告を抑制する
- 簡易的だが根本解決ではない

**推奨: 案2** — `existingAssignments` が存在するスケジュールIDを集計し、今回生成した月のスケジュール数を加えれば、実質的に「割り当て済みのスケジュール数」になる。

## 関連ファイル
- `src/application/use-cases/generate-assignments.ts:101-102` — `totalSundays` 計算箇所
- `src/domain/services/constraint-checker.ts:131-167` — `checkExcessiveCount()`
