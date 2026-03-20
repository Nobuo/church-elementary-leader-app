# 仕様書: 同スコア時のランダム化（タイブレーク揺らぎ）

## 機能概要

割り当て自動生成の `pickBestPairSameGrade()` において、同スコアのペア候補が複数ある場合に、特定のメンバーが常に有利にならないようランダム化を導入する。

### 背景

現在の実装では候補ペアを配列順（i < j）で走査し、`score < bestScore` で更新する。同スコアのペアは最初に見つかったものが常に選ばれるため、配列の先頭にいるメンバーがタイブレークで有利になる。メンバー配列の順序はDB取得順に固定されており、6ヶ月間の累積で割り当て回数に偏りが生じる。

### 問題の具体例

6ヶ月間（26日間）の生成結果:
- 配列先頭付近のメンバー: 6回
- 配列末尾付近のメンバー: 3回
- 構造的要因（グループ人数差・言語制約）を除いても、同グループ内で1〜2回の差が発生

## ビジネスルール

### R1: 候補配列のシャッフル

`pickBestPairSameGrade()` に渡す候補配列を、呼び出しごとにシャッフルする。

- **対象**: `generateAssignments()` 内の `pickBestPairSameGrade()` 呼び出し2箇所（G1・G2）
- **方法**: Fisher-Yates シャッフル
- **タイミング**: 各日・各グループの選出前に毎回シャッフル
- **元配列**: 変更しない（シャッフルはコピーに対して行う）

### R2: 同スコア時のランダム選択

`pickBestPairSameGrade()` 内のスコア比較で、同スコアの場合に一定確率で入れ替える。

```
変更前: if (score < bestScore)
変更後: if (score < bestScore || (score === bestScore && random() < 0.5))
```

### R1 + R2 の併用

R1（シャッフル）とR2（同スコアランダム）を併用する。

- R1 は候補ペアの走査順を毎回変える → 同スコアペアの「最初に見つかる」ペアが変わる
- R2 は走査中の同スコア更新を確率的にする → シャッフル後でも残る順序バイアスを解消

どちらか単独でも効果はあるが、併用がより均一な分布を実現する。

## ドメインモデル

### 変更対象

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/services/assignment-generator.ts` | `pickBestPairSameGrade()` 内のスコア比較にランダム化を追加、呼び出し前にシャッフル |

### 変更なし

- `scorePair()` — スコア計算ロジックは変更しない
- `GenerationContext`, `PairResult`, `ClassContext` — インターフェース変更なし
- `generateAssignments()` のシグネチャ — 変更なし

## アルゴリズム変更の詳細

### Fisher-Yates シャッフル

```typescript
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
```

### pickBestPairSameGrade() の変更

```typescript
// 変更前
for (let i = 0; i < candidates.length; i++) {
  for (let j = i + 1; j < candidates.length; j++) {
    const { score, violations } = scorePair(...);
    if (score < bestScore) {
      bestScore = score;
      bestPair = { member1: candidates[i], member2: candidates[j], violations };
    }
  }
}

// 変更後
const shuffled = shuffle(candidates);
for (let i = 0; i < shuffled.length; i++) {
  for (let j = i + 1; j < shuffled.length; j++) {
    const { score, violations } = scorePair(...);
    if (score < bestScore || (score === bestScore && Math.random() < 0.5)) {
      bestScore = score;
      bestPair = { member1: shuffled[i], member2: shuffled[j], violations };
    }
  }
}
```

## ユースケース

### UC1: 同スコアペアが複数存在する場合

**前提:**
- LOWER: メンバーA(JP), メンバーB(EN), メンバーC(JP), メンバーD(EN)
- 全員 count=0, 月内未割り当て

**処理（変更前）:**
- A+B: score=0, A+C: score=+100000(JP+JP), A+D: score=0, B+C: score=0, B+D: score=+100000(EN+EN), C+D: score=0
- 有効ペア: A+B, A+D, B+C, C+D — 全てscore=0
- **常にA+Bが選出**（配列先頭）→ AとBの回数が累積的に増加

**処理（変更後）:**
- シャッフルにより走査順が毎回変わる
- 同スコアランダムにより更新も確率的
- **A+B, A+D, B+C, C+D が均等に選出**される

### UC2: スコア差がある場合（影響なし）

**前提:**
- メンバーA(count=0), メンバーB(count=2), minCount=0
- A+X: score=0, B+X: score=+100

**結果:** スコア差が明確なため、ランダム化に関係なくA+Xが選出される。ハード制約やソフト制約に基づく選出は変わらない。

### UC3: ハード制約ペアが1つのみの場合（影響なし）

**前提:**
- 言語バランスを満たすペアが1組しかない

**結果:** 他のペアはscore=+100000のため、有効なペアが常に選出される。

## テスト方針

### 決定性テストへの影響

既存テストは特定のペアが選出されることを前提にしているものがある。対応方法:

1. **ハード制約テスト**: 影響なし（スコア差が大きいため結果は変わらない）
2. **ソフト制約テスト**: 影響なし（スコア差が明確）
3. **同スコアテスト**: 結果が変わる可能性あり → テストの期待値を「いずれかの有効ペア」に緩和

### 新規テスト

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | 同スコアペアが複数ある場合、複数回実行で異なるペアが選出されることがある | 10回実行で2種類以上のペアが出現 |
| T2 | ハード制約（言語バランス）は常に遵守される | 100回実行で違反なし |
| T3 | 均等配分は維持される（count差が大きいメンバーは選ばれにくい） | count=0のメンバーがcount=2のメンバーより優先される |

### 既存テストの修正方針

同スコア時の結果に依存する既存テストがある場合:
- テストの意図を確認し、ハード制約の検証であれば変更不要
- 特定ペアの選出を前提としている場合、「いずれかの有効ペア」に緩和

## 受け入れ基準

| # | 基準 |
|---|------|
| AC1 | `pickBestPairSameGrade()` で同スコアペアが均等に選出される |
| AC2 | ハード制約（言語バランス、CLASS_LANGUAGE_COVERAGE、同性制約）が常に遵守される |
| AC3 | 均等配分（count差によるペナルティ）が正しく機能する |
| AC4 | 既存テスト（ハード制約・明確なスコア差があるもの）が通る |
| AC5 | `npm run typecheck` / `npm run lint` が通る |

## 影響範囲

| レイヤー | ファイル | 変更内容 |
|----------|----------|----------|
| Domain | `src/domain/services/assignment-generator.ts` | `shuffle()` 追加、`pickBestPairSameGrade()` 内のシャッフル + 同スコアランダム |

他レイヤー（Application, Infrastructure, Presentation）への変更なし。
