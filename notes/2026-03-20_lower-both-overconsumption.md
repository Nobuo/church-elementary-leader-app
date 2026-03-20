# 分級日のバイリンガルカバレッジをUPPER側で完結させる

## 日付: 2026-03-20

## 問題の概要

分級日のCLASS_LANGUAGE_COVERAGE（4人中BOTH≧2）を満たすために、現在はG2（LOWER）にもBOTHメンバーを入れようとしている。しかしLOWERにはBOTHが2人しかいないため、分級日が月2回あると2人とも分級日に固定され、合同日に参加できなくなる。

### 発生した状況（2026年4月）

```
4/5  (合同) G2: JP + EN (LOWER)    ← LOWER BOTHは不参加
4/12 (分級) G2: BOTH + BOTH (LOWER) ← 2人とも分級日に固定 ★
4/19 (分級) G2: BOTH + EN (LOWER)   ← BOTHメンバー重複 ★
4/26 (合同) G2: EN + JP (LOWER)    ← LOWER BOTHは不参加
```

LOWER BOTHの2人は分級日にしか担当できず、合同日に参加する機会がない。

### メンバー構成

| 区分 | BOTH | EN | JP |
|------|------|----|----|
| UPPER | 5 | 0 | 8 |
| LOWER | 2 | 4 | 4 |

## ユーザーの要望

- CLASS_LANGUAGE_COVERAGEの2人は**全体で2人いればよい**
- LOWERから必ずBOTHを1人出す必要はない — UPPERで2人まかなえる
- LOWER BOTHメンバーも合同日に参加できるようにしたい

## 改善案: G1（UPPER）でバイリンガルカバレッジを完結させる

### 方針転換

| | 現在 | 変更後 |
|---|---|---|
| 分級日G1 | BOTH+JP推奨（温存） | **1 BOTH狙い**（0人: +5, 2人: +3, 1人: 0） |
| 分級日G2 | BOTH優遇（-5/人） | **BOTH優遇なし**（ハード制約のみ） |
| 合同日 | BOTH温存（+3/人） | 変更なし |

### スコアリング変更

```
分級日G1（classContextなし）:
  変更前: 単独BOTH -1、二重BOTH +5
  変更後: 0人 +5、1人 0、2人 +3（ちょうど1 BOTHを狙う）

分級日G2（classContextあり）:
  変更前: BOTH -5/人（一律優遇）
  変更後: BOTH優遇なし（CLASS_LANGUAGE_COVERAGEのハード制約が必要時に強制）

合同日:
  変更なし: BOTH +3/人（温存）
```

### スコア表

| シナリオ | BOTH+BOTH | BOTH+JP | JP+EN |
|----------|-----------|---------|-------|
| 合同日 | +6 | +3 | 0 |
| 分級日 G1 | **+3** | **0** | +5 |
| 分級日 G2 | 0 | 0 | 0 |

### CLASS_LANGUAGE_COVERAGEの担保

- G1がBOTH 1人（通常） → G2でBOTH 1人が必要 → ハード制約（+100000）が自動で強制
- G1がBOTH 0人（0人ペナルティで回避するが、全員JP等の例外） → G2でBOTH 2人が必要 → ハード制約が強制

### トレードオフ

G1が各日1 BOTHに抑えることで、UPPER BOTH 5人で4スロット → 重複なし。G2はハード制約により分級日にLOWER BOTH 1人が必須。旧方式では両LOWER BOTHが分級日に集中していたが、各分級日1人ずつに分散。

## 期待される効果

```
変更後:
4/5  (合同) G1: BOTH + JP (UPPER)   ← BOTH温存（EN不在のため1 BOTH必須）
             G2: JP + EN (LOWER)
4/12 (分級) G1: BOTH + JP (UPPER)   ← 1 BOTHで消費最小化
             G2: BOTH + EN (LOWER)  ← ハード制約で1 BOTH強制
4/19 (分級) G1: BOTH + JP (UPPER)
             G2: BOTH + JP (LOWER)  ← ハード制約で1 BOTH強制
4/26 (合同) G1: BOTH + JP (UPPER)
             G2: JP + EN (LOWER)
```

UPPER BOTH: 4スロット/5人 → 重複なし ✓
LOWER BOTH: 2スロット/2人 → 各分級日1人ずつ

## 関連

- `specs/bilingual-conservation.md`: R2（分級日G1）とR3（分級日G2）を更新
- `src/domain/services/assignment-generator.ts`: `scorePair()` のBOTH温存ロジック
- `notes/2026-03-20_bilingual-conservation.md`: BOTH温存の背景
