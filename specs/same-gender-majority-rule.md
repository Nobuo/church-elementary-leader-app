# 同性制限: 過半数ルール

## 機能概要
`sameGenderOnly` の判定ロジックを、2人ペア前提の「同性チェック」から、N人グループ対応の「過半数ルール」に変更する。

`sameGenderOnly=true` のメンバーは、**グループ内で自分の性別が過半数（strictly majority）でなければ違反**とする。

## ビジネスルール

### 過半数ルールの定義
`sameGenderOnly=true` のメンバーについて:
- グループ内の自分と同じ性別の人数が、**グループ人数の過半数を超えていればOK**
- 同数（例: 2人グループで1:1、4人グループで2:2）は **NG**
- つまり `sameGenderCount > groupSize / 2` が条件

### ケース一覧

#### 2人グループ（分級日）
| 構成 | sameGenderOnly の性別 | 同性数/総数 | 判定 | 理由 |
|---|---|---|---|---|
| 男1 + 女1 | 女 | 1/2 | NG | 過半数でない（1 > 1 は偽） |
| 男1 + 女1 | 男 | 1/2 | NG | 過半数でない |
| 男2 | 男 | 2/2 | OK | 過半数（2 > 1） |
| 女2 | 女 | 2/2 | OK | 過半数（2 > 1） |

→ 従来の2人ペアの同性チェックと**同じ結果**になる。

#### 3人グループ（合同日）
| 構成 | sameGenderOnly の性別 | 同性数/総数 | 判定 | 理由 |
|---|---|---|---|---|
| 男2 + 女1 | 女 | 1/3 | NG | 過半数でない（1 > 1.5 は偽） |
| 男1 + 女2 | 女 | 2/3 | OK | 過半数（2 > 1.5） |
| 男2 + 女2 + 本人(女) | — | — | — | （4人グループ参照） |
| 男1 + 女3 | 女 | 3/4 | OK | 過半数（3 > 2） |
| 女3 | 女 | 3/3 | OK | 全員同性 |

#### 4人グループ（将来の拡張を考慮）
| 構成 | sameGenderOnly の性別 | 同性数/総数 | 判定 | 理由 |
|---|---|---|---|---|
| 男2 + 女2 | 女 | 2/4 | NG | 過半数でない（2 > 2 は偽） |
| 男1 + 女3 | 女 | 3/4 | OK | 過半数（3 > 2） |

### 複数人が sameGenderOnly の場合
グループ内に `sameGenderOnly=true` のメンバーが複数いる場合、**それぞれ個別に**過半数チェックを行う。
- 同性同士であればいずれもOK（同性が増えるため）
- 異性同士でいずれも `sameGenderOnly=true` の場合、どちらかが必ず過半数を取れないためNG

## ドメインモデル

### 変更対象

#### `constraint-checker.ts`
- `checkSameGender(member1, member2)` → **`checkSameGenderGroup(members: Member[])`** に変更
  - 入力: グループの全メンバー配列
  - ロジック: `sameGenderOnly=true` のメンバーそれぞれについて過半数チェック
  - 出力: 違反がある場合は `ConstraintViolation`（最初の違反者の情報）
- 既存の `checkSameGender(member1, member2)` は後方互換のため `checkSameGenderGroup([member1, member2])` にラップして残す

#### `assignment-generator.ts` — `scorePair()`
- 現在の2人前提チェック（line 112-126）を `checkSameGenderGroup` に置き換え
- ロジック自体は同じ結果になるが、統一されたAPIを使用

#### `assignment-generator.ts` — `scoreTrio()`
- 現在「同性制限は適用しない」（line 210）となっているコメントを削除
- `checkSameGenderGroup(members)` による過半数チェックを追加
- 違反時は `score += 100000`（ハード制約、`scorePair` と同様）

#### `assignment-controller.ts` — candidates API
- 現在 `checkSameGender(m, partner)` で2人チェック
- candidates APIでは差し替え候補の判定なので、既存グループメンバー＋候補者の配列で `checkSameGenderGroup` を呼ぶ

## 入出力の定義

### `checkSameGenderGroup(members: Member[]): ConstraintViolation | null`
- **入力**: グループの全メンバー配列（2人または3人）
- **出力**:
  - 違反なし: `null`
  - 違反あり: `ConstraintViolation` オブジェクト
    - `type`: `ViolationType.SAME_GENDER`
    - `severity`: `Severity.WARNING`
    - `memberIds`: 違反対象メンバーのID配列
    - `messageKey`: `'violations.sameGender'`
    - `messageParams`: `{ name: <違反メンバー名> }`

### 判定ロジック（擬似コード）
```typescript
function checkSameGenderGroup(members: Member[]): ConstraintViolation | null {
  for (const m of members) {
    if (!m.sameGenderOnly) continue;
    const sameGenderCount = members.filter(other => other.gender === m.gender).length;
    if (sameGenderCount <= members.length / 2) {
      return violation(m); // 過半数でない → NG
    }
  }
  return null;
}
```

## ユースケース

### 正常系
1. 分級日（2人グループ）: 同性ペアで `sameGenderOnly` メンバーが割り当てられる → 違反なし
2. 合同日（3人グループ）: 女2+男1 で `sameGenderOnly` の女性メンバーが割り当てられる → 違反なし
3. 合同日（3人グループ）: 全員同性 → 違反なし

### 異常系（違反検出）
1. 分級日: 異性ペアで `sameGenderOnly` メンバーが割り当てられる → 違反
2. 合同日: 男2+女1 で `sameGenderOnly` の女性メンバー → 違反
3. candidates API: 差し替え候補が過半数ルール違反になる場合 → warnings に `sameGender` を追加

## 受け入れ基準（テスト観点）

### ドメインテスト (`tests/domain/constraint-checker.test.ts` — 新規または追加)
1. `checkSameGenderGroup([female_sgo, male])` → 違反あり（2人、異性）
2. `checkSameGenderGroup([female_sgo, female])` → 違反なし（2人、同性）
3. `checkSameGenderGroup([female_sgo, female, male])` → 違反なし（3人、過半数）
4. `checkSameGenderGroup([female_sgo, male, male])` → 違反あり（3人、少数派）
5. `checkSameGenderGroup([male_sgo, female, female])` → 違反あり（3人、少数派）
6. `checkSameGenderGroup([male_sgo, male, female])` → 違反なし（3人、過半数）
7. `checkSameGenderGroup([female_sgo, female, female])` → 違反なし（3人、全員同性）
8. `checkSameGenderGroup([female_sgo, female, male, male])` → 違反あり（4人、同数=過半数でない）
9. `checkSameGenderGroup([female_sgo, female, female, male])` → 違反なし（4人、過半数）
10. `sameGenderOnly=false` のメンバーのみ → 常に違反なし
11. 複数の `sameGenderOnly=true` メンバー（同性）→ 違反なし
12. 複数の `sameGenderOnly=true` メンバー（異性、3人グループ）→ 少なくとも1人が違反

### ジェネレーターテスト (`tests/domain/assignment-generator.test.ts` — 追加)
13. 合同日: `sameGenderOnly` の女性が女性多数派グループに配置される
14. 合同日: `sameGenderOnly` の女性が男性多数派グループに配置されない（スコアペナルティ）
15. 分級日: 従来通り異性ペアにならない

### インテグレーションテスト
16. candidates API: 3人グループの差し替え候補で過半数ルール違反が `warnings` に含まれる
