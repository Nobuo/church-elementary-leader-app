# 仕様書: バイリンガル(BOTH)メンバー温存

## 機能概要

割り当て自動生成アルゴリズムにおいて、バイリンガル（`language = BOTH`）メンバーを不必要に消費しないようスコアリングを改善する。現状は分級日のBOTH優遇ボーナスにより、BOTH+BOTHペアがBOTH+JPペアより常に優先され、月内で重複割り当てが発生する。

### 背景

- ある区分にEN専門メンバーがいない場合、言語バランスのために毎回最低1人のBOTHが必要
- 分級日のBOTH優遇（`-5`/人）がBOTH+BOTHペアを誘発し、BOTHメンバーを浪費する
- 月4日 × 最低1人BOTH = 4人必要に対し、BOTHが5人しかいない区分では余裕が1人分しかない
- 分級日にBOTH 2人をGroup 1で消費すると、別の日でBOTHメンバーが不足し月内重複が発生

### 変更のサマリ

| | 変更前 | 変更後 |
|---|---|---|
| 分級日BOTH優遇 | 全グループに `-5`/BOTH人 | **Group 2（classContextあり）のみ**に `-5`/BOTH人 |
| BOTH温存 | なし | **`+3`/BOTH人** の温存ペナルティを全日・全グループに追加 |

## ビジネスルール

### R1: BOTH温存（通常日）

通常日（非分級日）では、ペア内のBOTHメンバー1人につき `+3` のスコアペナルティを加える。

- **適用範囲**: 通常日の全グループ
- **目的**: BOTHでなくても言語バランスを満たせる場合に、非BOTHメンバーを優先させる
- **効果**: BOTH+JPペア（+3）がBOTH+BOTHペア（+6）より低スコアとなり、BOTHの無駄遣いを防ぐ

BOTHメンバーが言語バランスのために**必須**な場合（EN専門がいない区分など）、言語バランス違反（`+100000`）に比べて `+3` は無視できるほど小さいため、BOTHは問題なく選出される。

### R2: BOTH温存（分級日 Group 1）

分級日のGroup 1（classContextなし）では、単独BOTH（1人）と二重BOTH（2人）で異なるスコアリングを適用する。

- **BOTH 1人**: `-1`（軽い優遇）— CLASS_LANGUAGE_COVERAGE のために最低1人のBOTHをGroup 1に確保
- **BOTH 2人**: `+5`（ペナルティ）— 不必要なBOTH消費を抑制

### R3: 分級日BOTH優遇（Group 2）

現在の `isSplitClassDay` による全グループへのBOTH優遇を、`classContext`（= Group 2選出時）のみに限定する。

- **Group 2 選出時**: BOTH優遇 `-5`/人（温存ペナルティは適用しない）

### スコア合成の確認

| シナリオ | BOTH+BOTH | BOTH+JP | JP+EN |
|----------|-----------|---------|-------|
| 通常日 | +6 | +3 | 0 |
| 分級日 Group 1 | +5 | **-1** | 0 |
| 分級日 Group 2 | **-10** | **-5** | 0 |

- 通常日: BOTH+JP（+3）が BOTH+BOTH（+6）より優先される（温存）
- 分級日 Group 1: BOTH+JP（-1）が最優先。BOTH 1人は確保しつつ、2人使いを抑制（+5）
- 分級日 Group 2: BOTH+BOTH（-10）が最も低スコアとなり、バイリンガルカバレッジ確保に貢献

## ドメインモデル

### 変更対象

`scorePair()` 内のスコアリングロジックのみ。インターフェース・シグネチャの変更なし。

### 変更なし

- `GenerationContext`, `PairResult`, `ClassContext` — 変更不要
- `pickBestPairSameGrade()` — 変更不要
- `generateAssignments()` — 変更不要（`isSplitClassDay` パラメータは引き続き渡すが、`scorePair` 内での使い方が変わる）

## アルゴリズム変更の詳細

### scorePair() の変更

```typescript
// ===== 変更前 =====

// Split-class day: prefer BOTH members to ensure bilingual coverage
if (isSplitClassDay) {
  for (const m of [member1, member2]) {
    if (m.language === Language.BOTH) {
      score -= 5;
    }
  }
}

// ===== 変更後 =====

// BOTH conservation: prevent unnecessary consumption of bilingual members
if (!isSplitClassDay) {
  // Non-split-class: general BOTH conservation
  for (const m of [member1, member2]) {
    if (m.language === Language.BOTH) {
      score += 3;
    }
  }
} else if (!classContext) {
  // Split-class Group 1: mild single-BOTH preference, penalize double-BOTH
  const bothInPair = [member1, member2].filter((m) => m.language === Language.BOTH).length;
  if (bothInPair === 1) score -= 1;
  if (bothInPair === 2) score += 5;
}

// Split-class day Group 2: prefer BOTH for bilingual coverage
if (classContext) {
  for (const m of [member1, member2]) {
    if (m.language === Language.BOTH) {
      score -= 5;
    }
  }
}
```

### 設計判断: 分級日Group 1の単独BOTH優遇（-1）

分級日のCLASS_LANGUAGE_COVERAGE は4人中BOTH≧2を要求する。Group 1は先に選出されるため、この制約を直接参照できない（classContextなし）。単独BOTHに軽い優遇（-1）を与えることで、Group 1に最低1人のBOTHが含まれやすくし、Group 2がBOTH 1人で合計2人を達成できるようにする。

## ユースケース

### UC1: 通常日 — EN専門がいない区分

**前提:**
- UPPER: メンバーA(BOTH), メンバーB(JP), メンバーC(JP)
- EN専門なし

**処理:**
- A+B: 言語OK, score = +3（A=BOTH）
- A+C: 言語OK, score = +3（A=BOTH）
- B+C: 言語NG（EN不足）, score = +100000

**結果:** A(BOTH)+B(JP) or A(BOTH)+C(JP) が選出。BOTHは最低限の1人のみ使用。

### UC2: 分級日 — Group 1（UPPER）

**前提:**
- UPPER: メンバーA(BOTH), メンバーB(BOTH), メンバーC(JP), メンバーD(JP)

**処理（Group 1, classContextなし）:**
- A+B: 言語OK, score = +6（BOTH×2の温存ペナルティ）
- A+C: 言語OK, score = +3（BOTH×1）
- A+D: 言語OK, score = +3（BOTH×1）
- C+D: 言語NG, score = +100000

**結果:** A(BOTH)+C(JP) or A(BOTH)+D(JP) が選出。BOTH 1人が温存される。

### UC3: 分級日 — Group 2（LOWER）

**前提:**
- LOWER: メンバーE(BOTH), メンバーF(BOTH), メンバーG(JP), メンバーH(EN)
- classContext あり（Group 1のメンバー参照）

**処理（Group 2, classContextあり）:**
- E+F: 言語OK, score = +6-10 = -4（温存+3×2, BOTH優遇-5×2）
- E+G: 言語OK, score = +3-5 = -2（温存+3, BOTH優遇-5）
- E+H: 言語OK, score = +3-5 = -2
- G+H: 言語OK, score = 0

**結果:** E(BOTH)+F(BOTH) が選出（スコア最低）。バイリンガルカバレッジ確保。

### UC4: 月間を通した効果

**前提（4日間のUPPER, BOTH 5人・JP 8人）:**

| 日付 | 変更前 | 変更後 |
|------|--------|--------|
| 4/5 (通常) | JP+BOTH（1人） | JP+BOTH（1人） |
| 4/12 (分級) G1 | BOTH+BOTH（2人）★ | BOTH+JP（1人） |
| 4/19 (分級) G1 | BOTH+BOTH（2人） | BOTH+JP（1人） |
| 4/26 (通常) | BOTH+JP（**重複発生**） | BOTH+JP（1人、重複なし） |
| BOTH消費計 | 6回（5人中1人が2回） | 4回（全員1回ずつ） |

## 影響範囲

| レイヤー | ファイル | 変更内容 |
|----------|----------|----------|
| Domain | `src/domain/services/assignment-generator.ts` | `scorePair()` 内のBOTH関連スコアリング2箇所を変更 |

他レイヤー（Application, Infrastructure, Presentation）への変更なし。

## 受け入れ基準

### 単体テスト（assignment-generator）

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | 通常日: BOTH+JP と BOTH+BOTH の両方が言語バランスを満たす場合、BOTH+JP が優先される | BOTH+JP ペアが選出される |
| T2 | 通常日: BOTHが言語バランスに必須の場合（EN専門がいない区分）、BOTHは正しく選出される | BOTH+JP ペアが選出される（温存ペナルティがあっても言語違反よりはるかに低い） |
| T3 | 分級日 Group 1: BOTH+BOTH より BOTH+JP が優先される | Group 1 にBOTHが1人のみ |
| T4 | 分級日 Group 2: BOTH+BOTH が優先される（バイリンガルカバレッジ） | Group 2 にBOTHが2人 |
| T5 | 月4日間で UPPER BOTH 5人が重複なく割り当てられる | 月内重複なし |

### 既存テストへの影響

- 既存テストでBOTHメンバーの選出順に依存しているものは、温存ペナルティにより結果が変わる可能性がある
- 言語バランス・CLASS_LANGUAGE_COVERAGE の検証テストは影響なし（ハード制約は変わらない）
