# 割り当て回数の「階段状」分布

## 日付: 2026-03-20

## 問題の概要

31日間の割り当てで、回数順にソートすると上から下へ段々に減る「階段状」パターンが見える。ユーザーはもっとランダムな感じ（同じ回数帯が混ざっている状態）を期待している。ただし優先度の変更は不要。

### 現状の分布

| 回数 | 人数 | 構成 |
|------|------|------|
| 6回 | 6人 | LOWER全般 + LOWER BOTH(HELPER) |
| 5回 | 5人 | LOWER JP/BOTH + UPPER BOTH |
| 4回 | 10人 | UPPER JP/BOTH全般 |
| 3回 | 2人 | UPPER JP |
| 1回 | 1人 | LOWER EN（日付制限?） |

### グループ別平均

| グループ | 人数 | 平均回数 |
|----------|------|----------|
| LOWER | 10人 | 5.2回 |
| UPPER | 13人 | 4.0回 |

## 原因分析

### 「階段」の正体

階段パターンは**構造的に避けられない**要因から生まれている:

1. **グループ人数の不均衡**: LOWER 10人 vs UPPER 13人 → LOWERは1人あたり多く担当する
2. **言語制約**: UPPERにEN専門が0人 → BOTH必須 → UPPER BOTHが5回台、UPPER JPが3〜4回台
3. **上記の組み合わせ**: LOWER（多い）> UPPER BOTH（やや多い）> UPPER JP（少ない）という3段階ができる

これらは**正しい動作**であり、制約を守りながら均等配分した結果。

### シャッフルタイブレーク（タスク017）の効果

配列順バイアスは解消済み。同スコア候補間のランダム化は機能している。ただし、構造的な段差には影響しない。

## 改善案

### 均等配分ペナルティのグループ内正規化

現在の均等配分ペナルティは**全メンバーの最小count**を基準にしている:

```typescript
const minCount = Math.min(...context.members.filter(m => m.isActive).map(m => counts.get(m.id) ?? 0));
score += (memberCount - minCount) * 50;
```

これだと LOWER メンバー（count=5）は UPPER JP（count=3）との差分 `(5-3)*50 = +100` のペナルティを受けるが、LOWER 内では平均的な回数であっても全体minとの差でペナルティが蓄積する。

**改善案: 同一プール内のminCountを基準にする**

```typescript
// プール内の最小countを基準にする（グループ間の構造差を吸収）
const poolMinCount = Math.min(...poolMembers.map(m => counts.get(m.id) ?? 0));
score += (memberCount - poolMinCount) * 50;
```

- UPPER プール内で均等化 → UPPER BOTH と UPPER JP の差を縮小
- LOWER プール内で均等化 → LOWER 内の偏りを縮小
- グループ間の構造的な差（LOWER > UPPER）は残る（これは正しい）

### 効果の予測

| 改善前 | 改善後 |
|--------|--------|
| LOWER 5〜6回、UPPER 3〜5回 | LOWER 5〜6回、UPPER 3.5〜4.5回 |
| UPPER 内の BOTH/JP 差: 2回 | UPPER 内の BOTH/JP 差: 1回程度 |

グループ間の段差は構造的に残るが、**グループ内の均等性**が向上し、「階段」が少しなだらかになる。

### 注意点

- `scorePair()` に渡す minCount の算出方法を変えるだけなので、影響範囲は限定的
- プール情報を `scorePair()` に渡す必要があるため、引数の追加が必要
- 既存テストへの影響: 均等配分のスコアが変わるため、一部テストの期待値調整が必要な可能性

## 期待される効果

- UPPER BOTH と UPPER JP の回数差が縮小し、「階段」がなだらかになる
- グループ間差（LOWER > UPPER）は構造的に維持される（これは正しい）
- 優先度は変わらない（ハード制約、BOTH温存、ヘルパー後回しは全て維持）

## 関連

- `src/domain/services/assignment-generator.ts`: `scorePair()` の均等配分ペナルティ (line 132-138)
- `notes/2026-03-20_uneven-distribution.md`: 前回の偏り分析（シャッフルで対応済み）
- `specs/shuffle-tiebreak.md`: タイブレーク仕様
