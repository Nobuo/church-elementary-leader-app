# 仕様書: 担当区分の表示とバイリンガル区分横断

## 機能概要

割り当て結果画面に高学年/低学年のラベルを表示し、分級日にはバイリンガルメンバーの担当区分横断を許可する。また、手動差し替え時に担当区分の整合性チェックを追加する。

### 背景

- 割り当て結果画面では各グループのメンバーが「名前1 ・ 名前2」と表示されるのみで、どちらが高学年担当でどちらが低学年担当か判別できない
- 現在のアルゴリズムは UPPER/LOWER を厳密に分離しており、`member_id_1` = UPPER枠、`member_id_2` = LOWER枠の規約で格納している
- 分級日には4枠中2名以上のバイリンガル（`language = BOTH`）が必要だが、LOWERのバイリンガルが少ない場合（現状2名）、UPPERのバイリンガルをLOWER枠に回す必要がある

### 3つの変更点

1. **割り当て結果UIに担当区分ラベルを表示する**
2. **分級日に限り、バイリンガルメンバーの担当区分横断を許可する**
3. **手動差し替え時に担当区分の整合性チェックを追加する**

## ドメインモデル

### 既存の規約

- `Assignment.memberIds[0]`（= DB `member_id_1`）: **UPPER（高学年）枠**
- `Assignment.memberIds[1]`（= DB `member_id_2`）: **LOWER（低学年）枠**

この規約は変更しない。バイリンガルが区分横断した場合も、割り当てられた**枠**に基づいてUIラベルを表示する。

### 変更対象

#### AssignmentDto（DTO）

メンバー情報に `gradeGroup` を追加:

```typescript
export interface AssignmentDto {
  id: string;
  scheduleId: string;
  date: string;
  groupNumber: number;
  members: {
    id: string;
    name: string;
    gradeGroup: string;  // 追加: メンバーの登録上の担当区分（'UPPER' | 'LOWER'）
    role: string;        // 追加: 割り当て枠（'UPPER' | 'LOWER'）— memberIds[0]ならUPPER、[1]ならLOWER
  }[];
}
```

`gradeGroup`（登録上の区分）と `role`（割り当て枠）が異なるケースは、バイリンガルが区分横断した場合のみ発生する。

#### AssignmentGenerator（ドメインサービス）

分級日にバイリンガルがLOWER候補プールに不足している場合、UPPERのバイリンガルをLOWER候補に追加する（逆も同様）。

## ビジネスルール

### R1: 担当区分の基本ルール

- 通常日: メンバーは自分の担当区分の枠にのみ割り当てられる
  - UPPER メンバー → UPPER 枠のみ
  - LOWER メンバー → LOWER 枠のみ
- **例外なし**（バイリンガルであっても通常日は区分厳守）

### R2: 分級日のバイリンガル区分横断

- 分級日（`isSplitClass = true`）に限り、バイリンガル（`language = BOTH`）メンバーは担当区分を越えて割り当てできる
  - UPPER の BOTH メンバー → LOWER 枠への割り当て可
  - LOWER の BOTH メンバー → UPPER 枠への割り当て可
- 非バイリンガル（`language = JAPANESE` or `ENGLISH`）メンバーは分級日でも区分厳守

### R3: 区分横断の発動条件

区分横断は**バイリンガル要件を満たすためにのみ**発動する:

1. 通常のUPPER/LOWERプールからペア候補を探す
2. バイリンガル2名要件を満たせない場合に限り、反対区分のバイリンガルを候補プールに追加する
3. 両プールにバイリンガルが十分いる場合は横断しない

具体的な発動パターン:

```
分級日の候補プール構成:

【パターン A: LOWER に BOTH が十分 → 横断不要】
  UPPER候補: UPPER全員
  LOWER候補: LOWER全員
  → 通常通り選出。4名中2名以上がBOTHになれば成功

【パターン B: LOWER に BOTH が不足 → UPPER→LOWERの横断】
  UPPER候補: UPPER全員
  LOWER候補: LOWER全員 + UPPERのBOTHメンバー
  → UPPERのBOTHがLOWER枠に入る可能性あり

【パターン C: UPPER に BOTH が不足 → LOWER→UPPERの横断】
  UPPER候補: UPPER全員 + LOWERのBOTHメンバー
  LOWER候補: LOWER全員
  → LOWERのBOTHがUPPER枠に入る可能性あり
```

### R4: 手動差し替え時の担当区分チェック

差し替え候補の表示とチェック:

- **通常日:**
  - 候補は同じ担当区分のメンバーのみ表示
  - 異なる区分のメンバーは候補に含めない
- **分級日:**
  - 同じ担当区分のメンバーを優先表示
  - バイリンガル（BOTH）メンバーは異なる区分でも候補に含める
  - 非バイリンガルの異なる区分メンバーは候補に含めない
- **区分不一致の差し替え実行時:**
  - 違反として `GRADE_GROUP_MISMATCH` 警告を返す（差し替え自体は許可）

### R5: 担当区分ラベル表示

割り当て結果画面で、各メンバー名の前に担当区分ラベルを表示:

```
4/19（日）分級あり
  グループ 1: [高] メンバーA ・ [低] メンバーB
  グループ 2: [高] メンバーC ・ [低] メンバーD

※ バイリンガル区分横断が発生した場合:
  グループ 1: [高] メンバーE ・ [低←高] メンバーF ★

  [低←高] = 本来は高学年だが低学年枠に割り当て
```

## ユースケース

### UC1: 割り当て結果の担当区分表示（正常系）

**前提:** 4月の割り当てが生成済み

**処理:**
1. 割り当て結果画面を表示
2. 各メンバー名の前に `[高]` / `[低]` ラベルが表示される
3. `members[0]` には `[高]`、`members[1]` には `[低]` が付く

**結果:**
- ユーザーが各メンバーの担当区分を一目で確認できる

### UC2: 分級日の自動生成 — LOWER に BOTH 十分（横断なし）

**前提:**
- 分級日
- UPPER: A(BOTH), B(JP) / LOWER: F(BOTH), G(JP)

**処理:**
1. UPPER候補 = [A, B]、LOWER候補 = [F, G]（通常のプール）
2. Group 1: A(BOTH) + F(BOTH) → BOTH = 2名 ✓
3. Group 2: B(JP) + G(JP) → BOTH追加不要

**結果:**
- 区分横断なし。全員が自分の担当区分枠で割り当てられる

### UC3: 分級日の自動生成 — LOWER に BOTH 不足（横断あり）

**前提:**
- 分級日
- UPPER: A(BOTH), B(BOTH), C(JP) / LOWER: F(JP), G(EN)
- LOWERにBOTHが0名

**処理:**
1. 通常プールでは LOWER に BOTH がいないため、バイリンガル2名要件を満たせない
2. LOWERの候補プールに UPPER の BOTH メンバー（A, B）を追加
3. Group 1: C(JP) + A(BOTH)★ → A は UPPER だが LOWER枠に配置
4. Group 2: B(BOTH) + F(JP) → B は UPPER 枠で通常配置
5. 全体 BOTH = 2名（A, B）✓

**結果:**
- A が区分横断（UPPER→LOWER枠）
- UIでは `[低←高] A` と表示

### UC4: 通常日の自動生成（横断なし）

**前提:**
- 通常日（分級なし）
- 上記と同じメンバー構成

**処理:**
1. UPPER候補 = [A, B, C]、LOWER候補 = [F, G]（横断なし）
2. 通常のスコアリングでペア選出

**結果:**
- 区分横断は発生しない（分級日でないため）

### UC5: 手動差し替え — 通常日（候補フィルタリング）

**前提:**
- 通常日
- Group 1: UPPER-A + LOWER-F
- UPPER-A を差し替えたい

**処理:**
1. 候補API呼び出し
2. UPPER メンバーのみが候補に表示される（LOWER メンバーは表示されない）
3. UPPER-B を選択して確定

**結果:**
- UPPER枠にUPPERメンバーが入る（区分一致）

### UC6: 手動差し替え — 分級日（バイリンガル候補表示）

**前提:**
- 分級日
- Group 1: UPPER-A(JP) + LOWER-F(BOTH)
- LOWER-F を差し替えたい

**処理:**
1. 候補API呼び出し
2. LOWER メンバーが優先表示される
3. **加えて、UPPERのBOTHメンバーも候補に含まれる**（区分横断可のため）
4. UPPERのBOTHメンバーには `gradeGroupMismatch` 警告を付与

**結果:**
- ユーザーはLOWERメンバーまたはバイリンガルのUPPERメンバーから選択できる

## アルゴリズム変更の詳細

### generateAssignments() の変更

```
for each activeDate:
  schedule = findScheduleByDate(date)

  if schedule.isSplitClass:
    // 分級日: BOTHメンバーの区分横断を検討
    upperPool = upperMembers
    lowerPool = lowerMembers

    // LOWERのBOTH数をチェック
    lowerBothCount = lowerPool.filter(m => m.language === BOTH).length
    upperBothCount = upperPool.filter(m => m.language === BOTH).length

    // BOTHが各プールに少ない場合、反対プールのBOTHを追加
    if lowerBothCount < 1 && upperBothCount > 2:
      lowerPool = [...lowerMembers, ...upperMembers.filter(m => m.language === BOTH)]
    if upperBothCount < 1 && lowerBothCount > 2:
      upperPool = [...upperMembers, ...lowerMembers.filter(m => m.language === BOTH)]
  else:
    // 通常日: 区分厳守
    upperPool = upperMembers
    lowerPool = lowerMembers

  // Group 1, Group 2 の選出は従来通り pickBestPair を使用
```

### pickBestPair() への影響

変更なし。候補プールが拡張されるだけで、ペア選出ロジック自体は変わらない。`scorePair()` の既存の分級日チェック（4名中BOTH 2名以上）がそのまま機能する。

### candidates API の変更

```
GET /api/assignments/candidates

追加パラメータ: role（差し替え対象の枠: 'UPPER' | 'LOWER'）

フィルタリング:
  if 通常日:
    候補 = role と同じ gradeGroup のメンバーのみ
  if 分級日:
    候補 = role と同じ gradeGroup のメンバー
          + 反対 gradeGroup の BOTH メンバー（gradeGroupMismatch 警告付き）
```

### adjustAssignment() の変更

差し替え後の制約チェックに `GRADE_GROUP_MISMATCH` を追加:

```typescript
// 新メンバーの gradeGroup と割り当て枠の一致チェック
const roleIndex = updated.memberIds.indexOf(newMemberId);
const expectedGrade = roleIndex === 0 ? GradeGroup.UPPER : GradeGroup.LOWER;
const newMember = memberRepo.findById(newMemberId);

if (newMember.gradeGroup !== expectedGrade) {
  violations.push({
    type: ViolationType.GRADE_GROUP_MISMATCH,
    severity: Severity.WARNING,
    memberIds: [newMemberId],
    message: `${newMember.name} is ${newMember.gradeGroup} but assigned to ${expectedGrade} slot`,
    messageKey: 'violations.gradeGroupMismatch',
    messageParams: { name: newMember.name, registered: newMember.gradeGroup, assigned: expectedGrade },
  });
}
```

## 入出力の定義

### AssignmentDto（変更後）

```json
{
  "id": "...",
  "scheduleId": "...",
  "date": "2026-04-19",
  "groupNumber": 1,
  "members": [
    {
      "id": "...",
      "name": "メンバーA",
      "gradeGroup": "UPPER",
      "role": "UPPER"
    },
    {
      "id": "...",
      "name": "メンバーB",
      "gradeGroup": "LOWER",
      "role": "LOWER"
    }
  ]
}
```

区分横断の場合:
```json
{
  "members": [
    {
      "id": "...",
      "name": "メンバーE",
      "gradeGroup": "UPPER",
      "role": "UPPER"
    },
    {
      "id": "...",
      "name": "メンバーF",
      "gradeGroup": "UPPER",
      "role": "LOWER"
    }
  ]
}
```

### candidates API（変更後）

```
GET /api/assignments/candidates?date=2026-04-19&excludeIds=...&partnerId=...&role=UPPER
```

追加パラメータ:
- `role`: 差し替え対象の枠（`UPPER` | `LOWER`）

レスポンスの各候補に追加フィールド:
```json
{
  "id": "...",
  "name": "...",
  "count": 2,
  "isRecommended": true,
  "warnings": [...],
  "gradeGroup": "UPPER",
  "isCrossover": false
}
```

- `gradeGroup`: メンバーの登録上の担当区分
- `isCrossover`: true の場合、区分横断候補

### ViolationType の追加

```typescript
export const ViolationType = {
  // ... 既存 ...
  GRADE_GROUP_MISMATCH: 'GRADE_GROUP_MISMATCH',  // 追加
} as const;
```

## 違反メッセージ

### 日本語

```
violations.gradeGroupMismatch: '{name}さんは{registered}ですが{assigned}枠に割り当てられています'
```

パラメータ:
- `name`: メンバー名
- `registered`: 登録上の担当区分（「高学年」/「低学年」）
- `assigned`: 割り当て枠（「高学年」/「低学年」）

### 英語

```
violations.gradeGroupMismatch: '{name} is registered as {registered} but assigned to {assigned} slot'
```

## UI変更

### 割り当て結果の表示変更

```javascript
// 変更前
g.members.map((m, idx) => {
  return `<span class="member-name">${m.name}</span>`;
})

// 変更後
g.members.map((m, idx) => {
  const roleLabel = idx === 0 ? t('upper') : t('lower');
  const shortLabel = idx === 0 ? t('upperShort') : t('lowerShort');
  const isCrossover = m.gradeGroup !== m.role;
  const crossoverClass = isCrossover ? ' crossover' : '';
  const crossoverNote = isCrossover
    ? ` <span class="crossover-note">${t('crossoverNote')}</span>`
    : '';
  return `<span class="grade-label${crossoverClass}">[${shortLabel}]</span>` +
    `<span class="member-name">${m.name}</span>${crossoverNote}`;
})
```

### i18n 追加キー

| キー | 日本語 | 英語 |
|------|--------|------|
| upperShort | 高 | U |
| lowerShort | 低 | L |
| crossoverNote | ※本来は{grade} | *registered as {grade} |
| violations.gradeGroupMismatch | {name}さんは{registered}ですが{assigned}枠に割り当てられています | {name} is registered as {registered} but assigned to {assigned} slot |

### CSS追加

```css
.grade-label {
  font-size: 0.8em;
  font-weight: bold;
  margin-right: 2px;
  color: #666;
}
.grade-label.crossover {
  color: #e67e22;
}
.crossover-note {
  font-size: 0.75em;
  color: #e67e22;
}
```

## 影響範囲

| レイヤー | ファイル | 変更内容 |
|----------|----------|----------|
| Domain | `assignment-generator.ts` | 分級日の候補プール拡張（BOTHメンバーの区分横断） |
| Domain | `constraint-checker.ts` | `GRADE_GROUP_MISMATCH` チェック追加 |
| Application | `generate-assignments.ts` | AssignmentDto に `gradeGroup`/`role` 追加、adjustAssignment に区分チェック追加 |
| Presentation | `assignment-controller.ts` | candidates API に `role` パラメータ追加、候補フィルタリング変更 |
| Presentation | `i18n/ja.ts`, `i18n/en.ts` | ラベル・メッセージ追加 |
| Frontend | `public/js/assignments.js` | 担当区分ラベル表示、差し替え時に role 送信 |
| Frontend | `public/js/i18n.js` | 翻訳キー追加 |
| Frontend | `public/css/style.css` | `.grade-label`, `.crossover` スタイル追加 |

## 受け入れ基準

### 単体テスト（assignment-generator）

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | 通常日: UPPER メンバーは UPPER 枠のみに割り当て | UPPER メンバーが LOWER 枠に入らない |
| T2 | 通常日: LOWER メンバーは LOWER 枠のみに割り当て | LOWER メンバーが UPPER 枠に入らない |
| T3 | 分級日 + LOWER に BOTH 十分: 横断なし | 全員が自分の区分枠で割り当てられる |
| T4 | 分級日 + LOWER に BOTH 0名: UPPER の BOTH が LOWER 枠へ | BOTH 2名要件を満たす割り当てが生成される |
| T5 | 分級日 + 非 BOTH メンバーは横断しない | language=JP/EN のメンバーは自分の区分のみ |
| T6 | 分級日 + UPPER に BOTH 不足: LOWER の BOTH が UPPER 枠へ | BOTH 2名要件を満たす |

### 単体テスト（adjustAssignment）

| # | テスト | 期待結果 |
|---|--------|----------|
| T7 | 同区分のメンバーに差し替え | 違反なし |
| T8 | 異区分のメンバーに差し替え | `GRADE_GROUP_MISMATCH` 警告 |
| T9 | 分級日 + BOTH メンバーで区分横断差し替え | `GRADE_GROUP_MISMATCH` 警告（差し替え自体は成功） |

### 結合テスト（API）

| # | テスト | 期待結果 |
|---|--------|----------|
| T10 | GET /assignments のレスポンスに `gradeGroup`/`role` 含む | フィールドが存在する |
| T11 | 通常日: candidates API に role=UPPER → UPPER メンバーのみ返る | LOWER メンバーが含まれない |
| T12 | 分級日: candidates API に role=LOWER → LOWER + UPPER の BOTH が返る | UPPER の BOTH に `isCrossover=true` |
| T13 | 通常日: candidates API に role=LOWER → LOWER メンバーのみ返る | UPPER の BOTH も含まれない |

### E2E テスト

| # | テスト | 期待結果 |
|---|--------|----------|
| T14 | 割り当て結果画面に [高]/[低] ラベルが表示される | 各メンバー名の前にラベルあり |
| T15 | 区分横断が発生した場合、横断メンバーに注釈が表示される | `[低←高]` 等の表示 |
| T16 | 通常日の差し替えで同区分のメンバーのみ候補に出る | 異区分メンバーが表示されない |
