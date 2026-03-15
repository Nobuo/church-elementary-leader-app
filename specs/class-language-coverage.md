# クラス単位の言語カバレッジ制約

## 機能概要

日曜日のクラスでは、全体で活動する日と、途中で高学年クラス・低学年クラスに分かれてディスカッションなどを行う日がある。分級する日には、割り当て済みの4名の中にバイリンガル（`language = BOTH`）の担当者が少なくとも2名いること。

### 背景

教会の小学校クラスでは日本語話者と英語話者の子どもが混在する。クラスによっては途中で高学年・低学年に分かれてディスカッションを行うことがあり、その場合は各教室にバイリンガルの担当者が必要となる。しかし、高学年・低学年それぞれに BOTH メンバーが十分にいるとは限らないため、**クラス単位ではなく全体で2名以上の BOTH** を求める。分級の有無は日ごとに異なるため、スケジュール設定時に指定する。

### 2つの変更点

1. **Schedule に「分級あり」フラグを追加** — 日ごとに分級の有無を設定できるようにする（実装済み）
2. **クラス言語カバレッジ制約を変更** — 分級ありの日のみ、**4名中2名以上が BOTH** であることをチェックする（現行は各クラスに1名ずつBOTH）

### 現行の制約との違い

| 観点 | 現行（グループ言語バランス） | 本仕様（クラス言語カバレッジ） |
|------|----------------------------|-------------------------------|
| チェック単位 | グループ（UPPER 1名 + LOWER 1名） | **当日の全割り当て（4名全体）** |
| チェック内容 | 2名で日本語と英語を両方カバー | **4名のうち少なくとも2名が `BOTH`** |
| 適用タイミング | 全日 | **分級ありの日のみ** |
| 例 | JP + EN → ✓ | 4名中 BOTH 1名のみ → ✗ |

```
ある日曜日（分級あり）の割り当て:

  グループ1: UPPER-A(BOTH) + LOWER-A(JP)
  グループ2: UPPER-B(EN) + LOWER-B(BOTH)

  ┌ 現行チェック（グループ単位・全日適用）───────────────┐
  │ グループ1: BOTH + JP → JP✓ EN✓ → OK               │
  │ グループ2: EN + BOTH → JP✓ EN✓ → OK               │
  └────────────────────────────────────────────────────┘

  ┌ 本仕様チェック（全体単位・分級ありの日のみ適用）──────┐
  │ 4名中 BOTH = 2名（A, B）→ ≥ 2 → OK                │
  └────────────────────────────────────────────────────┘

  NG の例:
  グループ1: UPPER-A(JP) + LOWER-A(BOTH)
  グループ2: UPPER-B(EN) + LOWER-B(JP)
  → 4名中 BOTH = 1名（A のみ）→ < 2 → NG

※ 分級なしの日であれば、本仕様のチェックはスキップされる
```

両方の制約を併用する。現行のグループ言語バランスは引き続き全日で有効。

### なぜ「各クラス1名ずつ」ではなく「全体で2名」か

高学年・低学年それぞれに BOTH メンバーが十分にいるとは限らない。各クラスに1名ずつを厳密に要求すると、メンバー構成上満たせないケースが頻発する。全体で2名を要求すれば、分級時にどちらのクラスにも1名ずつ配置できる可能性が確保される。実際の配置は運用で調整する。

## ドメインモデル

### 変更対象

#### Schedule（エンティティ）— 実装済み

`isSplitClass` フラグ、`toggleSplitClass()` は既に実装済み。変更なし。

#### ViolationType（値オブジェクト）— 実装済み

`CLASS_LANGUAGE_COVERAGE` は既に追加済み。変更なし。

#### ConstraintChecker（ドメインサービス）

チェック関数のシグネチャと判定ロジックを変更:

```typescript
// 変更前: 各クラスに1名ずつ BOTH を要求
function checkClassLanguageCoverage(
  upperMembers: [Member, Member],
  lowerMembers: [Member, Member],
): ConstraintViolation[]

// 変更後: 4名全体で2名以上の BOTH を要求
function checkClassLanguageCoverage(
  allMembers: Member[],  // 当日の割り当て4名全員
): ConstraintViolation[]
```

#### AssignmentGenerator（ドメインサービス）

分級ありの日のみ、`scorePair()` に「同日に既に割り当てられたメンバー」のコンテキストを渡し、全体で BOTH が2名以上になるようスコアリングに反映する。

```typescript
// 変更前
interface ClassContext {
  upperAlreadyAssigned: Member;
  lowerAlreadyAssigned: Member;
}

// 変更後
interface ClassContext {
  group1Members: [Member, Member];  // Group 1 で選ばれた2名
}
```

### 影響範囲（変更が必要なファイル）

| レイヤー | ファイル | 変更内容 |
|----------|----------|----------|
| Domain | `constraint-checker.ts` | `checkClassLanguageCoverage()` のロジック変更 |
| Domain | `assignment-generator.ts` | `ClassContext` と `scorePair()` のクラス言語チェック変更 |
| Application | `generate-assignments.ts` | `adjustAssignment()` 内のクラス言語チェック変更 |
| Presentation | `controllers/assignment-controller.ts` | candidates API の警告ロジック変更 |
| Presentation | `i18n/ja.ts`, `i18n/en.ts` | 違反メッセージの文言変更 |
| Presentation | `public/js/i18n.js` | フロントエンド用翻訳文言変更 |

※ Schedule エンティティ、DB マイグレーション、UI（分級トグル・タグ表示）は変更不要。

## ビジネスルール

### R1: 分級フラグ（変更なし）

- Schedule エンティティに `isSplitClass: boolean`（デフォルト: `false`）
- スケジュール設定画面でトグル可能
- 除外日（`isExcluded = true`）との併用は不可

### R2: クラス言語カバレッジ制約（変更あり）

**分級あり（`isSplitClass = true`）の日の割り当てにおいて:**

- 当日の割り当て4名（Group 1 の2名 + Group 2 の2名）の中に、`language = BOTH` のメンバーが**少なくとも2名**いること

**分級なし（`isSplitClass = false`）の日:**

- 本制約はチェックしない

**理由:**

- 分級時に各教室にバイリンガル1名ずつ配置したいが、高学年・低学年それぞれに BOTH メンバーが十分にいるとは限らない
- 全体で2名いれば、運用で各教室に1名ずつ配置できる

### R3: 制約の優先度

| 優先度 | 制約 | ペナルティスコア | 適用条件 |
|--------|------|-----------------|----------|
| 必須 | 参加可能日 | 選択候補から除外 | 全日 |
| 必須 | グループ言語バランス（既存） | 100,000 | 全日 |
| **必須** | **クラス言語カバレッジ（本仕様）** | **100,000** | **分級日のみ** |
| 強 | 同性ペア制限 | 100,000 | 全日 |
| 弱 | 月内重複回避 | 100 | 全日 |
| 弱 | 均等な担当回数 | 50 × 差分 | 全日 |
| 弱 | 夫婦回避 | 30 | 全日 |
| 弱 | ペア多様性 | 10 × 過去回数 | 全日 |

### R4: 緩和不可

メンバー構成上どうしても満たせない場合（BOTH が1名以下しか参加可能でない日）は、違反を警告として表示したうえで割り当てを生成する。

## ユースケース

### UC1: スケジュールに分級フラグを設定する（変更なし）

**前提:** 4月のスケジュールが生成済み（4/6, 4/13, 4/20, 4/27）

**操作:**
1. スケジュール設定画面で 4/13 のカードにある「分級」ボタンをクリック
2. 4/13 が分級ありに設定される（カードにラベル表示）
3. もう一度クリックすると分級なしに戻る

**結果:**
- 4/13 の `isSplitClass` が `true` になる
- 割り当て生成時、4/13 のみクラス言語カバレッジ制約が適用される

### UC2: 分級日の自動生成（正常系 — BOTH が2名以上）

**前提:**
- 4/13 が分級あり、他の日は分級なし
- UPPER: A(BOTH), B(JP), C(EN)
- LOWER: F(BOTH), G(JP), H(EN)

**処理（4/13 分級日）:**
1. Group 1 のペアを選択: UPPER-A(BOTH) + LOWER-G(JP)
2. Group 2 のスコアリング時:
   - 分級日なので classContext が有効
   - Group 1 で BOTH = 1名 → あと1名必要
   - UPPER-B(JP) + LOWER-F(BOTH) → 全体 BOTH = 2名 → ペナルティなし
   - UPPER-C(EN) + LOWER-H(EN) → 全体 BOTH = 1名 → +100,000
3. Group 2: UPPER-B(JP) + LOWER-F(BOTH) が選ばれやすくなる

**結果:**
- 4/13: 全体で BOTH 2名（A, F） ✓

### UC3: BOTH メンバーが不足している分級日（異常系）

**前提:**
- 分級日あり
- UPPER: A(JP), B(EN)
- LOWER: F(BOTH), G(JP)
- 全体で BOTH = 1名のみ

**処理:**
1. 全体で BOTH が2名に満たないため、制約違反が不可避
2. 割り当ては生成するが、`CLASS_LANGUAGE_COVERAGE` 違反を警告として返す

**結果:**
- 割り当ては生成される
- 警告: 「分級日にバイリンガル担当者が不足しています（必要: 2名、実際: 1名）」

### UC4: 手動差し替え時の警告（分級日）

**前提:**
- 分級日の割り当て: A(BOTH), B(JP), F(BOTH), G(JP) → BOTH 2名
- ユーザーが A(BOTH) を C(EN) に差し替える

**処理:**
1. 差し替え後: C(EN), B(JP), F(BOTH), G(JP) → BOTH 1名 → < 2
2. `CLASS_LANGUAGE_COVERAGE` 違反を警告として返す

**結果:**
- 差し替えは実行される（手動操作は許可）
- 警告: 「分級日にバイリンガル担当者が不足しています（必要: 2名、実際: 1名）」

### UC5: 手動差し替え（分級なしの日）

**前提:**
- 分級なしの日
- ユーザーが BOTH を JP に差し替える

**結果:**
- 差し替えは実行される
- `CLASS_LANGUAGE_COVERAGE` 違反は**出ない**（分級なしの日なので）

### UC6: 差し替え候補の推薦への反映（分級日）

**前提:**
- 分級日、現在の BOTH 数 = 2名
- BOTH メンバーの1人を差し替えたい

**処理:**
1. 候補者リスト算出時、その日が分級日であることを考慮
2. `language = BOTH` の候補に ★（推薦）を付与しやすくする
3. `language ≠ BOTH` の候補には `CLASS_LANGUAGE_COVERAGE` の警告を付与（差し替え後に BOTH < 2 になるため）

## アルゴリズム変更の詳細

### Schedule の変更 — 変更なし

既に実装済み。

### scorePair() の変更

現在の `scorePair()` は Group 2 スコアリング時に `ClassContext` を受け取り、各クラスごとに BOTH を検査している。これを **全体での BOTH 数** による検査に変更する。

```
// 変更後の ClassContext
classContext = {
  group1Members: [Member, Member],   // Group 1 で選ばれた2名
}
```

**スコアリングロジック変更:**

```
if classContext あり（= 分級日の Group 2）:
  allFourMembers = [...classContext.group1Members, member1, member2]
  bothCount = allFourMembers.filter(m => m.language === BOTH).length

  if bothCount < 2:
    score += 100,000
    // 違反を追加
```

**分級なしの日:** classContext を渡さない → 既存動作と完全に同一。

### generateAssignments() の変更

```
for each activeDate:
  schedule = findScheduleByDate(date)

  // Group 1: 従来通り
  group1 = pickBestPair(upperMembers, lowerMembers, ..., classContext: null)

  // Group 2: 分級日のみ classContext を渡す
  classCtx = schedule.isSplitClass
    ? { group1Members: [group1.upper, group1.lower] }
    : null
  group2 = pickBestPair(remainingUpper, remainingLower, ..., classContext: classCtx)
```

### checkClassLanguageCoverage() の変更

```typescript
// 変更後
function checkClassLanguageCoverage(
  allMembers: Member[],  // 当日の割り当て全員（通常4名）
): ConstraintViolation[]

// ロジック:
const bothCount = allMembers.filter(m => m.language === Language.BOTH).length;
if (bothCount < 2) {
  return [{ type: CLASS_LANGUAGE_COVERAGE, ... }];
}
return [];
```

## DB マイグレーション — 変更なし

既に実装済み。

## API — 変更なし

エンドポイント構成は変更なし。違反メッセージの内容のみ変わる。

## UI — 変更なし

分級トグル、分級タグ表示は変更なし。違反メッセージの文言のみ変わる。

## 違反メッセージ

### 日本語

```
violations.classLanguageCoverage: '分級日にバイリンガル担当者が不足しています（必要: 2名、実際: {count}名）'
```

パラメータ:
- `count`: 実際の BOTH メンバー数（0 or 1）

### 英語

```
violations.classLanguageCoverage: 'Not enough bilingual leaders for split-class day (required: 2, actual: {count})'
```

パラメータ:
- `count`: actual BOTH member count (0 or 1)

### UIラベル — 変更なし

| キー | 日本語 | 英語 |
|------|--------|------|
| splitClass | 分級 | Split Class |
| splitClassDay | 分級あり | Split Class |

## 入出力の定義

### Schedule JSON（APIレスポンス）— 変更なし

```json
{
  "id": "...",
  "date": "2026-04-13",
  "isExcluded": false,
  "isEvent": false,
  "isSplitClass": true,
  "year": 2025
}
```

### ConstraintViolation 出力（変更あり）

```json
{
  "type": "CLASS_LANGUAGE_COVERAGE",
  "severity": "WARNING",
  "message": "Not enough bilingual leaders for split-class day (required: 2, actual: 1)",
  "messageKey": "violations.classLanguageCoverage",
  "messageParams": { "count": "1" },
  "memberIds": ["id-1", "id-2", "id-3", "id-4"]
}
```

※ `memberIds` には当日の割り当て全員のIDを含める（どのメンバーが対象かを明示）。

### candidates API への影響

`GET /api/assignments/candidates` — 分級日の差し替え時、差し替え後に BOTH < 2 になる候補には `warnings` に `CLASS_LANGUAGE_COVERAGE` を付与。

## 受け入れ基準

### 単体テスト（Schedule エンティティ）— 変更なし

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | `create()` のデフォルト | `isSplitClass = false` |
| T2 | `toggleSplitClass()` | false → true → false |

### 単体テスト（constraint-checker）

| # | テスト | 期待結果 |
|---|--------|----------|
| T3 | 4名中 BOTH 2名 | 違反なし |
| T4 | 4名中 BOTH 1名 | 違反あり（count=1） |
| T5 | 4名中 BOTH 0名 | 違反あり（count=0） |
| T6 | 4名中 BOTH 3名以上 | 違反なし |
| T7 | 4名全員 BOTH | 違反なし |

### 単体テスト（assignment-generator）

| # | テスト | 期待結果 |
|---|--------|----------|
| T8 | 分級日 + BOTH 2名以上 | 違反なし |
| T9 | 分級日 + BOTH 1名のみ（全メンバーで） | 違反警告付きで生成 |
| T10 | 分級日 + BOTH 0名 | 違反警告付きで生成 |
| T11 | 分級なしの日 | クラス言語制約がスコアに影響しない |
| T12 | 分級日 + Group 1 で BOTH 0名 → Group 2 で BOTH 2名を選択 | 全体で2名確保 |

### 結合テスト（API）

| # | テスト | 期待結果 |
|---|--------|----------|
| T13 | `POST /toggle-split-class` | `isSplitClass` がトグルされる |
| T14 | `GET /schedules` に `isSplitClass` 含む | レスポンスにフィールドあり |
| T15 | 分級日で自動生成 → BOTH 2名以上 | violations に CLASS_LANGUAGE_COVERAGE なし |
| T16 | 分級日で自動生成 → BOTH 不足 | violations に CLASS_LANGUAGE_COVERAGE あり |
| T17 | 分級日で BOTH → JP に差し替え（BOTH < 2に） | violations に CLASS_LANGUAGE_COVERAGE あり |
| T18 | 分級なし日で BOTH → JP に差し替え | violations に CLASS_LANGUAGE_COVERAGE **なし** |

### E2E テスト — 変更なし

| # | テスト | 期待結果 |
|---|--------|----------|
| T19 | スケジュール画面で分級ボタンをトグル | カードに「分級あり」ラベルが表示/非表示 |
| T20 | 分級日 + BOTH 不足で自動生成 | 警告エリアにクラス言語カバレッジの警告表示 |
| T21 | 割り当て結果画面に分級タグ表示 | 分級日の日付ヘッダーに「分級」タグ |
