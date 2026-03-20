# 仕様書: バイリンガル(BOTH)メンバー温存

## 機能概要

割り当て自動生成アルゴリズムにおいて、バイリンガル（`language = BOTH`）メンバーの配置を最適化する。

1. **合同日**: BOTHメンバーの不必要な消費を抑え、非BOTHで言語バランスが取れるならそちらを優先する
2. **分級日**: CLASS_LANGUAGE_COVERAGE（4人中BOTH≧2）をGroup 1（UPPER）側で完結させ、Group 2（LOWER）のBOTHメンバーを解放する

### 背景

- UPPER: BOTH 5人、EN 0人、JP 8人（BOTHがEN唯一のカバー手段）
- LOWER: BOTH 2人、EN 4人、JP 4人（BOTHは希少）
- 分級日が月2回ある場合、G2にBOTH優遇があるとLOWER BOTHの2人が分級日に固定され、合同日に参加できない
- CLASS_LANGUAGE_COVERAGEの2人は全体で満たせばよく、LOWERから出す必要はない
- UPPERはBOTH 5人と余裕があるため、分級日にBOTH 2人を出しても吸収しやすい

### 変更のサマリ

| | 変更前 | 変更後 |
|---|---|---|
| 合同日 | BOTH優遇なし | **BOTH温存 `+3`/人**（非BOTHを優先） |
| 分級日 G1 | BOTH優遇 `-5`/人 | **1 BOTH狙い**（0人: `+5`, 2人: `+3`, 1人: `0`） |
| 分級日 G2 | BOTH優遇 `-5`/人 | **優遇なし**（ハード制約のみで必要時に強制） |

## ビジネスルール

### R1: BOTH温存（合同日）

合同日（非分級日）では、ペア内のBOTHメンバー1人につき `+3` のスコアペナルティを加える。

- **適用範囲**: 合同日の全グループ
- **目的**: BOTHでなくても言語バランスを満たせる場合に、非BOTHメンバーを優先させる
- **効果**: BOTH+JPペア（+3）がBOTH+BOTHペア（+6）より低スコアとなり、BOTHの無駄遣いを防ぐ

BOTHメンバーが言語バランスのために**必須**な場合（EN専門がいない区分など）、言語バランス違反（`+100000`）に比べて `+3` は無視できるほど小さいため、BOTHは問題なく選出される。

### R2: 1 BOTH狙い（分級日 Group 1）

分級日のGroup 1（classContextなし）では、ちょうど1人のBOTHをペアに含めることを狙う。

- **0人ペナルティ**: ペア内にBOTHが0人の場合 `+5`（G1がBOTHを出さないとG2に負担が集中）
- **2人ペナルティ**: ペア内にBOTHが2人の場合 `+3`（BOTHの過剰消費を防ぐ）
- **1人ボーナス**: ペア内にBOTHがちょうど1人の場合 `0`（最適）
- **目的**: UPPER BOTHメンバーの月内重複を防ぎつつ、CLASS_LANGUAGE_COVERAGEに必要な最低限のBOTHをG1から提供する
- **結果**: 各日1 BOTH × 4日 = 4スロット → UPPER BOTH 5人で重複なし

### R3: 分級日 Group 2 — BOTH優遇なし

分級日のGroup 2（classContextあり）では、BOTHに対するソフトな優遇ボーナスを**適用しない**。

- CLASS_LANGUAGE_COVERAGEのハード制約（`+100000`）が必要時に自動でBOTHを強制する
  - G1がBOTH 1人 → G2でBOTH 1人が必要 → ハード制約が強制
  - G1がBOTH 0人 → G2でBOTH 2人が必要 → ハード制約が強制
- ソフト優遇がないため、G2はBOTHメンバーを不必要に消費しない

### スコア合成の確認

| シナリオ | BOTH+BOTH | BOTH+JP | JP+EN |
|----------|-----------|---------|-------|
| 合同日 | +6 | +3 | 0 |
| 分級日 Group 1 | **+3** | **0** | +5 |
| 分級日 Group 2 | 0 | 0 | 0 |

- 合同日: JP+EN（0）が最優先。BOTHは必要な場合のみ使用（温存）
- 分級日 G1: BOTH+JP（0）が最優先。1 BOTHで消費を最小化しつつカバレッジに貢献
- 分級日 G2: 全ペア同スコア。ハード制約が必要時のみBOTHを強制。均等配分で自然に分散

### トレードオフ

G1が各日1 BOTHに抑えることで、UPPER BOTH 5人で4スロット → 重複なし。一方、G2はハード制約により分級日にLOWER BOTH 1人が必須となるため、LOWER BOTHは分級日に割り当てられる。ただし旧方式（G2にBOTH優遇 `-5`）では両LOWER BOTHが分級日に集中していたのに対し、各分級日1人ずつの分散が可能。

## ドメインモデル

### 変更対象

`scorePair()` 内のスコアリングロジックのみ。インターフェース・シグネチャの変更なし。

### 変更なし

- `GenerationContext`, `PairResult`, `ClassContext` — 変更不要
- `pickBestPairSameGrade()` — 変更不要
- `generateAssignments()` — 変更不要

## アルゴリズム変更の詳細

### scorePair() の変更

```typescript
// ===== 変更前（初期実装） =====

// Split-class day: prefer BOTH members to ensure bilingual coverage
if (isSplitClassDay) {
  for (const m of [member1, member2]) {
    if (m.language === Language.BOTH) {
      score -= 5;
    }
  }
}

// ===== 変更後 =====

// BOTH conservation / split-day optimization
if (!isSplitClassDay) {
  // 合同日: BOTH温存（非BOTHを優先）
  for (const m of [member1, member2]) {
    if (m.language === Language.BOTH) {
      score += 3;
    }
  }
} else if (!classContext) {
  // 分級日 Group 1: ちょうど1 BOTHを狙う
  const bothInPair = [member1, member2].filter((m) => m.language === Language.BOTH).length;
  if (bothInPair === 0) score += 5; // G1はBOTHを1人出すべき
  if (bothInPair === 2) score += 3; // BOTH+BOTHは過剰消費
}
// 分級日 Group 2: BOTH優遇なし（ハード制約のみ）
```

### 設計判断

#### G1で「ちょうど1 BOTH」を狙う理由

1. **UPPER BOTH消費の最小化**: G1がBOTH+BOTHを取ると1日で2スロット消費し、月4日で最大8スロット。5人では重複が不可避。1 BOTHなら4スロットで重複なし
2. **0人回避**: G1がBOTH 0人だとG2に2 BOTHが必要になり、LOWERの負担が倍増する。+5ペナルティで回避

#### G2のBOTH優遇を完全に削除する理由

1. **ハード制約で十分**: CLASS_LANGUAGE_COVERAGEのハード制約（`+100000`）が、G1のBOTH数に応じてG2に必要なBOTH数を自動で強制する。ソフト優遇は不要
2. **LOWER BOTHの過剰消費防止**: 優遇がなければ、LOWER BOTHは不必要に分級日に集中しない
3. **フォールバック安全性**: G1がBOTHを提供できない場合（出席制限等）、ハード制約がG2にBOTHを強制するため、カバレッジは常に担保される

## ユースケース

### UC1: 合同日 — EN専門がいない区分

**前提:**
- UPPER: メンバーA(BOTH), メンバーB(JP), メンバーC(JP)
- EN専門なし

**処理:**
- A+B: 言語OK, score = +3（A=BOTH温存）
- A+C: 言語OK, score = +3（A=BOTH温存）
- B+C: 言語NG（EN不足）, score = +100000

**結果:** A(BOTH)+B(JP) が選出。BOTHは最低限の1人のみ使用。

### UC2: 分級日 — G1がBOTH+JPでBOTH消費を最小化

**前提:**
- UPPER: メンバーA(BOTH), メンバーB(BOTH), メンバーC(JP), メンバーD(JP)
- LOWER: メンバーE(BOTH), メンバーF(JP), メンバーG(EN)

**処理（Group 1, classContextなし）:**
- A+B: 言語OK, score = +3（BOTH 2人ペナルティ）
- A+C: 言語OK, score = 0（BOTH 1人、最適）← 最優先
- C+D: 言語NG, score = +100000

**結果:** A(BOTH)+C(JP) が選出。G1で1 BOTH（BOTHを温存）。

**処理（Group 2, classContextあり）:**
- G1が1 BOTH → CLASS_LANGUAGE_COVERAGE: allFourで2+ BOTH必要 → G2にBOTH 1人必要
- E+F: allFour = [A,C,E,F] → bothCount=2 ✓, score = 0
- E+G: allFour = [A,C,E,G] → bothCount=2 ✓, score = 0
- F+G: allFour = [A,C,F,G] → bothCount=1 ✗, score = +100000 ← ハード制約で排除

**結果:** G2にBOTH 1人がハード制約で強制。カバレッジ担保。

### UC3: 分級日 — UPPERにEN専門がいる場合

**前提:**
- UPPER: メンバーA(BOTH), メンバーB(JP), メンバーC(EN)
- LOWER: メンバーD(BOTH), メンバーE(JP), メンバーF(EN)

**処理（Group 1）:**
- A+B: score = 0（BOTH 1人、最適）
- A+C: score = 0（BOTH 1人、最適）
- B+C: score = +5（BOTH 0人ペナルティ）

**結果:** A+B or A+C が選出（BOTH 1人）。B+Cは0人ペナルティで回避。

**処理（Group 2, G1がBOTH 1人）:**
- classContext: group1Members = [A(BOTH), B(JP)]
- D+E: allFour = [A,B,D,E] → bothCount=2 ✓, score = 0
- D+F: allFour = [A,B,D,F] → bothCount=2 ✓, score = 0
- E+F: allFour = [A,B,E,F] → bothCount=1 ✗, score = +100000 ← ハード制約で排除

**結果:** ハード制約がG2にBOTH 1人を強制。ソフト優遇なしでも安全。

### UC4: 月間を通した効果

**前提（4日間、UPPER BOTH 5人・JP 8人、LOWER BOTH 2人・EN 4人・JP 4人）:**

| 日付 | G1 (UPPER) | G2 (LOWER) | 備考 |
|------|------------|------------|------|
| 4/5 (合同) | BOTH+JP | JP+EN | BOTH温存（UPPERはEN不在のため1 BOTH必須） |
| 4/12 (分級) | BOTH+JP | BOTH+EN | G1: 1 BOTH、G2: ハード制約で1 BOTH |
| 4/19 (分級) | BOTH+JP | BOTH+JP | G1: 1 BOTH、G2: ハード制約で1 BOTH |
| 4/26 (合同) | BOTH+JP | JP+EN | BOTH温存 |

- UPPER BOTH: 4スロット/5人 → 全員月1回以下、重複なし ✓
- LOWER BOTH: 2スロット/2人 → 各1回（分級日でハード制約により選出）

## 影響範囲

| レイヤー | ファイル | 変更内容 |
|----------|----------|----------|
| Domain | `src/domain/services/assignment-generator.ts` | `scorePair()` 内のBOTH関連スコアリングを変更 |

他レイヤー（Application, Infrastructure, Presentation）への変更なし。

## 受け入れ基準

### 単体テスト（assignment-generator）

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | 合同日: BOTH+JP と BOTH+BOTH の両方が言語バランスを満たす場合、BOTH+JP が優先される | BOTH+JP ペアが選出される |
| T2 | 合同日: BOTHが言語バランスに必須の場合、BOTHは正しく選出される | BOTH+JP ペアが選出される |
| T3 | 分級日 Group 1: BOTH+JP が BOTH+BOTH より優先される | Group 1 にBOTHが1人 |
| T4 | 分級日 Group 2: G1が1 BOTHの場合、CLASS_LANGUAGE_COVERAGE違反なし | ハード制約でG2にBOTH強制 |
| T5 | 分級日: UPPERにENがいる場合、G1がJP+ENを選ばない | G1にBOTH 1人が含まれる（0人ペナルティ回避） |
| T6 | 月4日間で UPPER BOTHメンバーが重複しない | 各UPPER BOTH月1回以下 |

### 既存テストへの影響

- 分級日のBOTH選出順に依存しているテストは結果が変わる可能性がある
- CLASS_LANGUAGE_COVERAGE のハード制約テストは影響なし
