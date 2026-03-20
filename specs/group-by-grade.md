# 仕様書: グループを学年区分ごとにまとめる

## 機能概要

割り当てのグループ構成を「グループ1＝高学年2人、グループ2＝低学年2人」に変更する。現在は各グループに高学年1人＋低学年1人が混在しているが、実際の運用では高学年教室と低学年教室は分かれているため、グループ＝教室担当ペアとなるよう修正する。

### 背景

- 実際の運用: 高学年（4〜6年生）と低学年（1〜3年生）は別の教室で活動する
- 各グループの2人はその教室の担当ペアとなる
- 現状の「高＋低」ペアは、4人で1つのクラスをリードするモデルを想定していたが、実際は2教室制

### 変更のサマリ

| | 変更前 | 変更後 |
|---|---|---|
| グループ1 | 高学年1人 + 低学年1人 | **高学年2人** |
| グループ2 | 高学年1人 + 低学年1人 | **低学年2人** |
| `memberIds[0]` の意味 | UPPER枠（規約） | 同区分の1人目（位置に意味なし） |
| `memberIds[1]` の意味 | LOWER枠（規約） | 同区分の2人目（位置に意味なし） |
| `groupNumber` の意味 | 汎用番号 | **1=UPPER、2=LOWER** |

## ドメインモデル

### 新しい規約

- `Assignment.groupNumber === 1`: **UPPER（高学年）グループ**
- `Assignment.groupNumber === 2`: **LOWER（低学年）グループ**
- `Assignment.memberIds[0]`, `memberIds[1]`: 同じ学年区分の2人（位置による区分の区別はなくなる）

### Assignment エンティティ

変更なし（DB スキーマも変更なし）。`groupNumber`、`member_id_1`、`member_id_2` の意味（規約）が変わるだけ。

### AssignmentDto

```typescript
export interface AssignmentDto {
  id: string;
  scheduleId: string;
  date: string;
  groupNumber: number;        // 1=UPPER, 2=LOWER
  gradeGroup: string;          // 追加: グループの学年区分（'UPPER' | 'LOWER'）
  members: AssignmentMemberDto[];
}

export interface AssignmentMemberDto {
  id: string;
  name: string;
  gradeGroup: string;  // メンバーの登録上の区分（通常はグループの区分と一致、横断時のみ異なる）
}
```

変更点:
- `AssignmentDto` に `gradeGroup` フィールドを追加（`groupNumber` から導出: `groupNumber === 1 ? 'UPPER' : 'LOWER'`）
- `AssignmentMemberDto` から `role` フィールドを**削除**（グループ自体が区分を表すため不要）

## ビジネスルール

### R1: グループ構成（変更）

- グループ1 = 高学年（UPPER）メンバー2人
- グループ2 = 低学年（LOWER）メンバー2人
- 通常日: メンバーは自分の学年区分のグループにのみ割り当てられる

### R2: 分級日のバイリンガル区分横断（変更なし — 適用先が変わる）

- 分級日（`isSplitClass = true`）に限り、バイリンガル（`language = BOTH`）メンバーは別区分のグループに入れる
  - UPPER の BOTH メンバー → グループ2（LOWER）への割り当て可
  - LOWER の BOTH メンバー → グループ1（UPPER）への割り当て可
- 非バイリンガルは分級日でも自区分グループのみ

### R3: 区分横断の発動条件（変更なし）

区分横断は**バイリンガル要件を満たすためにのみ**発動する:

```
分級日のグループ構成:

【パターン A: 各区分に BOTH が十分 → 横断不要】
  グループ1: UPPER から 2人選出
  グループ2: LOWER から 2人選出

【パターン B: LOWER に BOTH が不足 → UPPER→LOWER グループの横断】
  グループ1: UPPER から 2人選出
  グループ2: LOWER全員 + UPPERのBOTHメンバー から 2人選出

【パターン C: UPPER に BOTH が不足 → LOWER→UPPER グループの横断】
  グループ1: UPPER全員 + LOWERのBOTHメンバー から 2人選出
  グループ2: LOWER から 2人選出
```

### R4: 手動差し替え時の担当区分チェック（変更）

- 差し替え候補のフィルタリング基準が `role`（位置ベース）から `groupNumber`（グループベース）に変わる
- **通常日:** 同じ学年区分（グループと同じ gradeGroup）のメンバーのみ候補に表示
- **分級日:** 同区分 + 反対区分のBOTHメンバーも候補に含める
- 区分不一致の差し替え実行時: `GRADE_GROUP_MISMATCH` 警告を返す（差し替え自体は許可）
- 判定方法の変更: `roleIndex` ではなく `groupNumber` から期待される gradeGroup を導出
  ```
  expectedGrade = assignment.groupNumber === 1 ? UPPER : LOWER
  ```

### R5: 担当区分ラベル表示（変更）

各メンバー名の前にメンバーの**登録上の**担当区分ラベル `[高]`/`[低]` を表示する。

- ラベルはメンバーの `gradeGroup` をそのまま表示（横断時も矢印表記は不要）
- 横断が発生した場合: 低学年グループに `[高]` のメンバーがいることで横断が視覚的にわかる
- `crossoverNote`（`※本来は{grade}`）は不要になるため削除

```
4/5（日）
  グループ 1（高学年）: [高] メンバーA ・ [高] メンバーC
  グループ 2（低学年）: [低] メンバーB ・ [低] メンバーD

※ 分級日にバイリンガル区分横断が発生した場合:
  グループ 1（高学年）: [高] メンバーA ・ [高] メンバーC
  グループ 2（低学年）: [低] メンバーB ・ [高] メンバーE  ← 横断
```

## ユースケース

### UC1: 通常日の自動生成

**前提:**
- 通常日
- UPPER: A(JP), B(EN), C(BOTH) / LOWER: D(JP), E(EN), F(BOTH)

**処理:**
1. グループ1候補 = UPPER全員 [A, B, C]
2. グループ2候補 = LOWER全員 [D, E, F]
3. グループ1: `pickBestPair([A, B, C])` → A(JP) + B(EN)（言語バランス◎）
4. グループ2: `pickBestPair([D, E, F])` → D(JP) + E(EN)

**結果:**
```
  グループ 1: [高] A ・ [高] B
  グループ 2: [低] D ・ [低] E
```

### UC2: 分級日 — 横断なし（各区分に BOTH 十分）

**前提:**
- 分級日
- UPPER: A(BOTH), B(JP) / LOWER: D(BOTH), E(JP)

**処理:**
1. 各プールに BOTH ≥ 1 → 横断不要
2. グループ1: A(BOTH) + B(JP)
3. グループ2: D(BOTH) + E(JP)
4. 4人中 BOTH = 2名（A, D）✓

**結果:**
- 全員が自分の区分グループ。横断なし

### UC3: 分級日 — LOWER に BOTH 不足（横断あり）

**前提:**
- 分級日
- UPPER: A(BOTH), B(BOTH), C(JP) / LOWER: D(JP), E(EN)
- LOWER に BOTH が 0名

**処理:**
1. LOWER に BOTH < 1、UPPER に BOTH > 2 → LOWER プールに UPPER の BOTH を追加
2. グループ1候補: [A, B, C]（UPPER のみ）
3. グループ2候補: [D, E, A, B]（LOWER + UPPER の BOTH）
4. グループ1: C(JP) + A(BOTH)（A は UPPER なのでグループ1のまま、もしくは B）
5. グループ2: D(JP) + B(BOTH)★（B は UPPER だがグループ2に配置）
6. 4人中 BOTH = 2名（A, B）✓

**結果:**
```
  グループ 1（高学年）: [高] C ・ [高] A
  グループ 2（低学年）: [低] D ・ [高] B  ← B は高学年だが低学年グループに横断
```

### UC4: 手動差し替え — 通常日

**前提:**
- 通常日
- グループ1（高学年）: A + B
- A を差し替えたい

**処理:**
1. `groupNumber=1` → `expectedGrade=UPPER`
2. 候補API: UPPER メンバーのみ表示
3. UPPER-C を選択して確定

**結果:**
- 同区分メンバーに差し替え。違反なし

### UC5: 手動差し替え — 分級日

**前提:**
- 分級日
- グループ2（低学年）: D(JP) + E(BOTH)
- D を差し替えたい

**処理:**
1. `groupNumber=2` → `expectedGrade=LOWER`
2. 候補API: LOWER メンバー（優先）+ UPPER の BOTH メンバー（横断候補）
3. UPPER-A(BOTH) を選択 → `GRADE_GROUP_MISMATCH` 警告

**結果:**
- 差し替え成功（警告付き）
- グループ2: A(BOTH)[高] + E(BOTH)[低] ← A は横断

## アルゴリズム変更の詳細

### generateAssignments() の変更

```
for each activeDate:
  schedule = findScheduleByDate(date)

  upperPool = upperMembers
  lowerPool = lowerMembers

  if schedule.isSplitClass:
    // 分級日: BOTHメンバーの区分横断を検討（変更なし）
    if lowerBothCount < 1 && upperBothCount > 2:
      lowerPool = [...lowerMembers, ...upperMembers.filter(m => m.language === BOTH)]
    if upperBothCount < 1 && lowerBothCount > 2:
      upperPool = [...upperMembers, ...lowerMembers.filter(m => m.language === BOTH)]

  // ★ 変更点: 同区分からペアを選出
  // グループ1（UPPER）: upperPool から 2人選出
  group1Result = pickBestPairSameGrade(upperPool, ...)
  assignment1 = Assignment.create(schedule.id, 1, [group1Result.member1.id, group1Result.member2.id])

  // グループ2（LOWER）: lowerPool から 2人選出
  group2Result = pickBestPairSameGrade(lowerPool, ...)
  assignment2 = Assignment.create(schedule.id, 2, [group2Result.member1.id, group2Result.member2.id])
```

### pickBestPair() → pickBestPairSameGrade() へのリファクタ

現在の `pickBestPair(upperCandidates, lowerCandidates)` は2つの異なるプールから1人ずつ選出する。
変更後は1つのプールから2人を選出する `pickBestPairSameGrade(candidates)` に変更。

```typescript
interface PairResult {
  member1: Member;
  member2: Member;
  violations: ConstraintViolation[];
}

function pickBestPairSameGrade(
  candidates: Member[],
  context: GenerationContext,
  monthAssignments: Assignment[],
  dayAssignments: Assignment[],
  pastPairCounts: Map<string, number>,
  classContext?: ClassContext,
  isSplitClassDay?: boolean,
): PairResult | null {
  if (candidates.length < 2) return null;

  let bestScore = Infinity;
  let bestPair: PairResult | null = null;

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const { score, violations } = scorePair(
        candidates[i], candidates[j], ...
      );
      if (score < bestScore) {
        bestScore = score;
        bestPair = { member1: candidates[i], member2: candidates[j], violations: ... };
      }
    }
  }
  return bestPair;
}
```

### scorePair() への影響

`scorePair()` 自体のスコアリングロジックは**変更なし**。以下の既存チェックはすべてそのまま機能する:
- 言語バランス（JP + EN のカバレッジ）
- 同性制約
- 月重複チェック
- 均等配分
- 配偶者回避
- ペア多様性

### ClassContext（分級日のバイリンガル4人チェック）の変更

現在: Group 2 選出時に Group 1 の [upper, lower] を参照して4人中 BOTH ≥ 2 をチェック。

変更後: Group 2（LOWER）選出時に Group 1（UPPER）の [member1, member2] を参照して同様にチェック。ロジック自体は同じだが、参照するメンバーの構成が変わる。

### adjustAssignment() の変更

`GRADE_GROUP_MISMATCH` チェックの基準を位置ベースから `groupNumber` ベースに変更:

```typescript
// 変更前
const roleIndex = updated.memberIds.indexOf(asMemberId(newMemberId));
const expectedGrade = roleIndex === 0 ? GradeGroup.UPPER : GradeGroup.LOWER;

// 変更後
const expectedGrade = updated.groupNumber === 1 ? GradeGroup.UPPER : GradeGroup.LOWER;
```

### candidates API の変更

`role` パラメータの判定基準を変更:

- 変更前: フロントエンドがメンバーの位置（`idx`）から `role` を決定
- 変更後: フロントエンドがグループの `groupNumber` から `role` を決定
  ```javascript
  // 変更前
  const role = idx === 0 ? 'UPPER' : 'LOWER';
  // 変更後
  const role = g.gradeGroup; // グループのgradeGroupをそのまま使用（グループ内の全メンバー共通）
  ```

API 側のフィルタリングロジックは変更なし。

## 入出力の定義

### AssignmentDto（変更後）

通常日:
```json
[
  {
    "id": "...",
    "date": "2026-04-05",
    "groupNumber": 1,
    "gradeGroup": "UPPER",
    "members": [
      { "id": "...", "name": "メンバーA", "gradeGroup": "UPPER" },
      { "id": "...", "name": "メンバーB", "gradeGroup": "UPPER" }
    ]
  },
  {
    "id": "...",
    "date": "2026-04-05",
    "groupNumber": 2,
    "gradeGroup": "LOWER",
    "members": [
      { "id": "...", "name": "メンバーC", "gradeGroup": "LOWER" },
      { "id": "...", "name": "メンバーD", "gradeGroup": "LOWER" }
    ]
  }
]
```

分級日（横断あり）:
```json
[
  {
    "groupNumber": 1,
    "gradeGroup": "UPPER",
    "members": [
      { "id": "...", "name": "メンバーA", "gradeGroup": "UPPER" },
      { "id": "...", "name": "メンバーB", "gradeGroup": "UPPER" }
    ]
  },
  {
    "groupNumber": 2,
    "gradeGroup": "LOWER",
    "members": [
      { "id": "...", "name": "メンバーC", "gradeGroup": "LOWER" },
      { "id": "...", "name": "メンバーD", "gradeGroup": "UPPER" }
    ]
  }
]
```

メンバーD は UPPER だが LOWER グループ（グループ2）に横断。ラベルは `[高]` のまま。

### candidates API（変更なし）

```
GET /api/assignments/candidates?date=...&excludeIds=...&partnerId=...&role=UPPER
```

`role` パラメータの決定方法がフロントエンド側で変わるだけ（位置ベース → グループベース）。

## UI 変更

### 割り当て結果の表示

```javascript
// メンバーラベル: メンバーの gradeGroup をそのまま表示
const shortLabel = m.gradeGroup === 'UPPER' ? t('upperShort') : t('lowerShort');
const isCrossover = m.gradeGroup !== g.gradeGroup;  // メンバーの区分 ≠ グループの区分
const crossoverClass = isCrossover ? ' crossover' : '';

return `<span class="grade-label${crossoverClass}">[${shortLabel}]</span>` +
  `<span class="member-name">${escapeHtml(m.name)}</span>`;
```

変更点:
- ラベルの決定: `idx` ベース → `m.gradeGroup` ベース
- 横断判定: `m.gradeGroup !== m.role` → `m.gradeGroup !== g.gradeGroup`
- `crossoverNote`（`※本来は{grade}`）は削除

### 差し替えボタンの role

```javascript
// 変更前: idx ベース
const role = idx === 0 ? 'UPPER' : 'LOWER';

// 変更後: グループの gradeGroup
const role = g.gradeGroup;
```

### i18n 変更

| キー | 変更 |
|------|------|
| `crossoverNote` | **削除** |
| `upperShort` / `lowerShort` | 変更なし |
| `violations.gradeGroupMismatch` | 変更なし |

### CSS 変更

- `.crossover-note` は**削除**
- `.grade-label`, `.grade-label.crossover` は変更なし

## 影響範囲

| レイヤー | ファイル | 変更内容 |
|----------|----------|----------|
| Domain | `assignment-generator.ts` | `pickBestPair` → `pickBestPairSameGrade` リファクタ、グループ1=UPPER/グループ2=LOWER の選出ロジック |
| Application | `generate-assignments.ts` | DTO の `role` 削除、`gradeGroup` 追加（グループレベル）、`adjustAssignment` の期待区分判定を `groupNumber` ベースに変更 |
| Presentation | `assignment-controller.ts` | candidates API の `role` 判定変更（フロントからのパラメータの意味は同じ） |
| Frontend | `public/js/assignments.js` | ラベル表示ロジック変更、差し替え `role` 決定方法変更、`crossoverNote` 削除 |
| Frontend | `public/js/i18n.js` | `crossoverNote` キー削除 |
| Frontend | `public/css/style.css` | `.crossover-note` 削除 |

## 既存データとの互換性

- DB スキーマ変更なし
- `groupNumber` と `member_id_1`/`member_id_2` の**意味**が変わるため、既存の割り当てデータは再生成が必要
- マイグレーションは不要だが、既存割り当てをクリアして再生成することを推奨

## 受け入れ基準

### 単体テスト（assignment-generator）

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | 通常日: グループ1の全メンバーが UPPER | `memberIds` の全員が `gradeGroup === UPPER` |
| T2 | 通常日: グループ2の全メンバーが LOWER | `memberIds` の全員が `gradeGroup === LOWER` |
| T3 | 各グループ内で言語バランスが取れている | JP + EN のカバレッジあり |
| T4 | 分級日 + LOWER に BOTH 十分: 横断なし | 全員が自分の区分グループ |
| T5 | 分級日 + LOWER に BOTH 不足: UPPER の BOTH がグループ2へ | グループ2 に UPPER メンバーが含まれる |
| T6 | 分級日 + UPPER に BOTH 不足: LOWER の BOTH がグループ1へ | グループ1 に LOWER メンバーが含まれる |
| T7 | 分級日 + 非 BOTH は横断しない | JP/EN メンバーは自区分グループのみ |

### 単体テスト（adjustAssignment）

| # | テスト | 期待結果 |
|---|--------|----------|
| T8 | 同区分メンバーに差し替え（groupNumber=1, UPPER メンバー）| 違反なし |
| T9 | 異区分メンバーに差し替え（groupNumber=2, UPPER メンバー）| `GRADE_GROUP_MISMATCH` 警告 |

### 結合テスト（API）

| # | テスト | 期待結果 |
|---|--------|----------|
| T10 | GET /assignments: グループ1の members が全員 UPPER | `gradeGroup` が一致 |
| T11 | GET /assignments: グループ2の members が全員 LOWER | `gradeGroup` が一致 |
| T12 | 通常日: candidates に role=UPPER → UPPER のみ | 変更なし |
| T13 | 分級日: candidates に role=LOWER → LOWER + UPPER の BOTH | 変更なし |

### UI テスト

| # | テスト | 期待結果 |
|---|--------|----------|
| T14 | グループ1の全メンバーに `[高]` ラベル | `.grade-label` のテキストが `[高]` |
| T15 | グループ2の全メンバーに `[低]` ラベル | `.grade-label` のテキストが `[低]` |
| T16 | 横断時: 低学年グループに `[高]` メンバー | `.grade-label.crossover` が存在 |
