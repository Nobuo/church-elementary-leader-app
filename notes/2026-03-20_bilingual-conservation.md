# 分級日のバイリンガル(BOTH)メンバー使いすぎ問題

## 日付: 2026-03-20

## 問題の概要

割り当て自動生成で、分級日にBOTHメンバーを過剰に割り当ててしまい、他の日にBOTHメンバーが足りなくなり月内重複が発生する。

### 発生した状況（2026年4月）

```
4/5  (通常)  G1: メンバーA(JP) + メンバーB(BOTH)       ← BOTH 1人
4/12 (分級)  G1: メンバーC(BOTH) + メンバーD(BOTH)     ← BOTH 2人 ★過剰
             G2: メンバーE(BOTH) + メンバーF(BOTH)     ← BOTH 2人
4/19 (分級)  G1: メンバーG(BOTH) + メンバーH(BOTH)     ← BOTH 2人
             G2: メンバーI(JP) + メンバーJ(EN)
4/26 (通常)  G1: メンバーC(BOTH) + メンバーK(JP)       ← メンバーC 2回目!
             G2: メンバーL(EN) + メンバーM(JP)
```

メンバーCが4/12と4/26の2回割り当てられた。

### メンバー構成

| 区分 | BOTH | EN | JP | 計 |
|------|------|----|----|-----|
| UPPER | 5 | 0 | 8 | 13 |
| LOWER | 2 | 4 | 4 | 10 |

## 原因分析

### 1. UPPERにEN専門がいない

UPPER にはEN専門メンバーがいないため、**毎回最低1人のBOTH**が必要（言語バランスのため）。4日間で最低4人のBOTHが必要だが、UPPERのBOTHは5人しかいない。余裕は1人分。

### 2. 分級日のBOTH優遇ボーナスが過剰割り当てを誘発

`scorePair` の分級日BOTH優遇（`-5`/人）により、BOTH+BOTHペアが BOTH+JP ペアより常に低スコアになる。

```
BOTH+JP ペア:  score = base - 5          （BOTHの1人分）
BOTH+BOTHペア: score = base - 10         （2人分） ← こちらが選ばれる
```

**4/12のGroup 1（UPPER）では BOTH+JP で十分**なのに BOTH+BOTH を選出してしまう。

### 3. CLASS_LANGUAGE_COVERAGE（4人中BOTH≧2）はLOWER側で満たせていた

4/12: LOWER側で既に BOTH 2人。UPPER側は BOTH 0人でも CLASS_LANGUAGE_COVERAGE は満たせた。にもかかわらず BOTH+BOTH を選出した。

## 改善案

### A案: 分級日のBOTH優遇をGroup 2のみに適用

**最もシンプルな修正。** Group 1（先に選出される側）では BOTH 優遇ボーナスを適用しない。Group 2 の選出時のみ、バイリンガルカバレッジ確保のためにBOTH優遇を適用する。

```typescript
// 現在: isSplitClassDay なら常に -5
if (isSplitClassDay) {
  for (const m of [member1, member2]) {
    if (m.language === Language.BOTH) score -= 5;
  }
}

// 改善: classContext がある時（= Group 2選出時）のみ適用
if (classContext) {
  for (const m of [member1, member2]) {
    if (m.language === Language.BOTH) score -= 5;
  }
}
```

**メリット**: 変更が1行で済む、理にかなっている（Group 1はバイリンガルカバレッジを意識する必要がない）
**デメリット**: Group 1 に BOTH が1人も入らない可能性がある（言語バランスで最低1人は入るが）

### B案: BOTHメンバーの月内使用回数をより強くペナルティ

均等配分ペナルティ（`50 * diff`）が BOTH 優遇（`-5`）を上回れば自然と分散されるが、現状は月初の段階では全員 count=0 で差がつかない。BOTHメンバーの使用回数を別途追跡し、既にBOTHが割り当て済みの日があればペナルティを追加する。

**メリット**: より根本的な解決
**デメリット**: 実装が複雑、BOTHだけ特別扱いするのは設計上微妙

### C案: 分級日のGroup 1でBOTH+BOTHペアにペナルティ追加

Group 1（classContextなし）で2人ともBOTHの場合、`+15` のペナルティを追加（BOTH優遇の `-10` を相殺して少しマイナスに）。

```typescript
if (isSplitClassDay && !classContext) {
  const bothCount = [member1, member2].filter(m => m.language === Language.BOTH).length;
  if (bothCount === 2) score += 15; // 1人は許容、2人はペナルティ
}
```

**メリット**: BOTH 1人は残す
**デメリット**: マジックナンバーが増える

## 推奨

**A案**が最もシンプルで副作用が少ない。Group 1 は先に選出されるため、バイリンガルカバレッジの「帳尻合わせ」は Group 2 の責任。Group 1 に BOTH 優遇をかける理由がない。

## 期待される効果

分級日のGroup 1 の割り当てが以下のように変わる:
```
変更前: G1: BOTH + BOTH     ← BOTH 2人（過剰）
変更後: G1: BOTH + JP       ← BOTH 1人（適正）
```

BOTHメンバー1人分が温存され、別の日で重複なく割り当て可能。

## 関連

- `src/domain/services/assignment-generator.ts`: `scorePair` のBOTH優遇ロジック
- `specs/group-by-grade.md`: 分級日のバイリンガル区分横断仕様
