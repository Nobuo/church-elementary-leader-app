# 仕様書: 合同日のリーダー人数を3人に変更

## 機能概要

合同日（`isSplitClass = false`）のリーダー人数を4人（2グループ×2人）から**3人（1グループ×3人）**に変更する。分級日（`isSplitClass = true`）は従来通り4人（2グループ×2人）を維持する。

### 背景

- 合同日は高学年・低学年が一つのクラスとして活動するため、2グループに分ける必要がない
- 4人はリソースの過剰投入であり、3人で十分にクラスをリードできる
- リーダースロットの削減により、担当回数の均等化や BOTH メンバーの過剰消費問題の緩和が期待できる

## ユースケース

### UC-1: 合同日の自動割り当て生成（正常系）

**前提:** 合同日（`isSplitClass = false`）のスケジュールが存在する

**処理:**
1. UPPER・LOWER の区別なく、全有効メンバーから3人を選出する
2. 言語バランス・同性制約・夫婦回避・均等性などの制約を適用する
3. Assignment を1つ（groupNumber = 1、memberIds = 3人）生成する

**出力:** 1日あたり1つの Assignment（3人）

### UC-2: 合同日の自動割り当て生成（メンバー不足）

**前提:** 有効メンバーが3人未満

**処理:** ConstraintViolation（WARNING）を記録し、可能な範囲で割り当てを試行する

### UC-3: 分級日の自動割り当て生成（変更なし）

**前提:** 分級日（`isSplitClass = true`）のスケジュール

**処理:** 従来通り4人（2グループ×2人）。変更なし。

### UC-4: 合同日の手動調整

**前提:** 合同日の Assignment（3人）が存在する

**処理:**
1. 3人のうち1人を差し替える
2. 差し替え後の3人に対して制約チェックを行う
3. 違反があれば警告を表示（確定は可能）

### UC-5: 合同日の差し替え候補取得

**前提:** 合同日の Assignment（3人）から1人を差し替えたい

**処理:** 残る2人との組み合わせで制約違反がないメンバーを候補として返す

## 入出力の定義

### Assignment エンティティの変更

現在の `memberIds` は `readonly [MemberId, MemberId]`（2人固定タプル）だが、合同日は3人を格納する必要がある。

**変更案:**

```typescript
// 変更前
readonly memberIds: readonly [MemberId, MemberId];

// 変更後
readonly memberIds: readonly MemberId[];  // 2人 or 3人
```

- `memberIds.length` は 2（分級日）または 3（合同日）
- バリデーションで 2〜3 人の範囲を保証する

### groupNumber の変更

| 日タイプ | 変更前 | 変更後 |
|---------|--------|--------|
| 合同日 | Group 1（UPPER×2）+ Group 2（LOWER×2） | Group 1（混合×3）のみ |
| 分級日 | Group 1（UPPER×2）+ Group 2（LOWER×2） | 変更なし |

合同日は `groupNumber = 1` の Assignment が1つだけ生成される。

### スロット数の変化

| 日タイプ | 変更前スロット | 変更後スロット |
|---------|-------------|-------------|
| 合同日 | 4人/日 | 3人/日 |
| 分級日 | 4人/日 | 4人/日 |

**月間例（合同日2回 + 分級日2回）:**
- 変更前: 4×4 = 16スロット
- 変更後: 3×2 + 4×2 = 14スロット
- 23人での平均担当回数: 0.70回 → 0.61回（合同日削減分）

## ドメインモデル

### 変更対象

#### 1. Assignment エンティティ

```typescript
export class Assignment {
  readonly memberIds: readonly MemberId[];  // 2〜3人

  static create(
    scheduleId: ScheduleId,
    groupNumber: 1 | 2,
    memberIds: MemberId[],  // 可変長に変更
  ): Assignment;
}
```

#### 2. assignment-generator.ts — generateAssignments()

合同日の処理フローを変更:

```
変更前（合同日）:
  1. UPPER から2人選出 → Group 1
  2. LOWER から2人選出 → Group 2

変更後（合同日）:
  1. UPPER + LOWER の全メンバーから3人を選出 → Group 1（1つだけ）
```

**3人選出アルゴリズム:**
1. 全有効メンバーをプールする（UPPER/LOWER 区別なし）
2. 全3人組み合わせをスコアリングし、最低スコアの組み合わせを選出
3. スコアリングは既存の2人ペアスコアを拡張した3人版を使用

#### 3. assignment-generator.ts — scorePair() → scoreGroup()

2人ペアのスコアリングを3人グループにも対応:

```typescript
function scoreGroup(
  members: Member[],           // 2人 or 3人
  context: GenerationContext,
  monthAssignments: Assignment[],
  dayAssignments: Assignment[],
  pastPairCounts: Map<string, number>,
  classContext?: ClassContext,
  isSplitClassDay?: boolean,
  poolMinCount?: number,
): { score: number; violations: ConstraintViolation[] };
```

**3人グループのスコアリングルール:**

| 制約 | 2人ペア（分級日） | 3人グループ（合同日） |
|------|-----------------|-------------------|
| 言語バランス | EN≧1 & JP≧1 | EN≧1 & JP≧1 |
| 同性ペア制限 | 同性希望者は同性のみ | **適用しない**（Q2回答済み） |
| 夫婦回避 | 同グループ内に夫婦なし | 同グループ内に夫婦なし |
| BOTH温存 | +3/人 | +3/人（従来通り） |
| 均等性 | 担当回数差の最小化 | 担当回数差の最小化 |
| 月内重複 | +100 | +100 |
| 過去ペア多様性 | ペア重複回避 | 3人中の全2人組み合わせ（3ペア）で重複回避 |

#### 4. constraint-checker.ts

手動調整時の制約チェックを3人対応:

- `checkLanguageBalance`: 3人中に EN≧1 & JP≧1
- `checkSameGender`: 3人の場合は適用しない
- `checkSpouseSameGroup`: 3人中に夫婦がいないか

#### 5. generate-assignments.ts（アプリケーション層）

- `generateMonthlyAssignments`: 合同日の Assignment が1つ（3人）であることに対応
- `adjustAssignment`: 3人 Assignment の差し替えに対応
- `AssignmentDto.members`: 2〜3人の可変長
- 合同日は `groupNumber = 1` のみ。`gradeGroup` は `MIXED` または省略

### 変更なし

- Schedule エンティティ（`isSplitClass` フラグで合同日/分級日を区別 — 既存のまま）
- Member エンティティ
- ScheduleRepository / MemberRepository

## 制約・ビジネスルール

### R1: 合同日のグループ数とリーダー人数

- 合同日は1グループ・3人
- 分級日は2グループ・各2人（計4人）

### R2: 合同日のメンバー選出プール

- 合同日は UPPER/LOWER の区別なく全有効メンバーから選出する
- GradeGroup.ANY のメンバーも同一プールに含まれる

### R3: 合同日の言語バランス

- 3人中に英語対応者（EN or BOTH）≧1人 AND 日本語対応者（JP or BOTH）≧1人
- `notes/2026-03-14_open-questions.md` Q2 回答: 最低1人いれば良い

### R4: 合同日の同性ペア制限

- **適用しない**
- `notes/2026-03-14_open-questions.md` Q2 回答: 2人の時だけ

### R5: 合同日の夫婦回避

- 3人グループ内に夫婦がいなければ OK
- `notes/2026-03-14_open-questions.md` Q2 回答: はい

### R6: BOTH温存（合同日）

- 既存ルール（BOTH 1人につき +3）を3人グループにも適用
- 非 BOTH で言語バランスを満たせるなら BOTH を温存する

### R7: 均等性への影響

- 合同日のスロット減（4→3）により、1人あたりの平均担当回数が下がる
- 均等性計算は変更なし（スロット数の変化が自然に反映される）

### R8: 公平性に関する追加考慮

- 合同日は UPPER/LOWER 混合で選出するため、片方のグループに偏らないようスコアリングで配慮
- 担当回数の少ないメンバーを優先する既存ロジックで自然に分散される

## 影響範囲

| レイヤー | ファイル | 変更内容 |
|----------|----------|----------|
| Domain | `entities/assignment.ts` | `memberIds` を可変長配列に変更 |
| Domain | `services/assignment-generator.ts` | 合同日: 全プールから3人選出、`scoreGroup()` 追加 |
| Domain | `services/constraint-checker.ts` | 3人グループ対応（言語バランス・夫婦回避） |
| Domain | `services/csv-formatter.ts` | 3人出力対応 |
| Domain | `services/line-message-formatter.ts` | 3人表示対応 |
| Application | `use-cases/generate-assignments.ts` | 合同日の Assignment 生成・DTO 変換 |
| Infrastructure | `persistence/sqlite-assignment-repository.ts` | `memberIds` の可変長保存/復元 |
| Presentation | ビュー・コントローラ | 3人表示・差し替えUI対応 |

### DB マイグレーション

現在の `assignments` テーブルの `member_ids` カラムの保存形式を確認し、3人対応が必要か判断する。

## 受け入れ基準（テスト観点）

### ドメイン層

- [ ] 合同日に Assignment が1つ（groupNumber=1）、3人で生成されること
- [ ] 分級日に Assignment が2つ（groupNumber=1,2）、各2人で生成されること（既存動作の維持）
- [ ] 合同日の3人に EN≧1 & JP≧1 が含まれること
- [ ] 合同日で同性ペア制限が適用されないこと
- [ ] 合同日の3人グループ内に夫婦が含まれないこと
- [ ] 合同日で BOTH 温存（+3/人）が適用されること
- [ ] 合同日で UPPER/LOWER 混合のメンバーが選出されること
- [ ] 月間で担当回数が均等に分散されること（合同日3スロット + 分級日4スロット）
- [ ] 3人中の全2人組み合わせ（3ペア分）がペア重複カウントに反映されること

### アプリケーション層

- [ ] `generateMonthlyAssignments` が合同日に3人の AssignmentDto を返すこと
- [ ] `adjustAssignment` で合同日の3人 Assignment の差し替えが正しく動作すること
- [ ] 差し替え候補が合同日の残り2人との制約を考慮して返されること

### インフラ層

- [ ] 3人の `memberIds` が正しく保存・復元されること

### プレゼンテーション層

- [ ] 合同日の割り当て表示が3人×1グループで表示されること
- [ ] CSV エクスポートで3人の割り当てが正しく出力されること
- [ ] LINE メッセージフォーマットで3人の割り当てが正しく表示されること

### 既存テストへの影響

- [ ] Assignment エンティティの `memberIds` 型変更に伴い、既存テストのタプル型アサーションを修正
- [ ] 合同日のスコアリングテスト（BOTH温存等）を3人版に更新
- [ ] 分級日の既存テストが全て通ること（リグレッションなし）
