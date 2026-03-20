# 仕様書: 学年区分「どちらでも可」（ANY）

## 機能概要

メンバーの学年区分（`GradeGroup`）に第3の選択肢 `ANY`（どちらでも可）を追加する。`ANY` のメンバーは UPPER プール・LOWER プール**両方**の候補に入り、人数が不足しているグループを自動的に補完する。

### 背景

- ヘルパー（HELPER）の中に、高学年でも低学年でもどちらでも対応可能な方がいる
- 現在は固定の UPPER / LOWER にしか設定できず、実態を正確に表現できない
- UPPER 13人 vs LOWER 10人の人数不均衡があり、`ANY` メンバーが少ない側を補完できれば均等性が向上する

## ビジネスルール

### R1: GradeGroup に ANY を追加

```
GradeGroup = UPPER | LOWER | ANY
```

- `ANY` は全てのメンバータイプ（PARENT_COUPLE, PARENT_SINGLE, HELPER）で設定可能
- UI上の表記: 「どちらでも可」（ja）/ 「Either」（en）

### R2: 割り当て生成時のプール振り分け

`ANY` メンバーは UPPER プールと LOWER プールの**両方**に追加される。

```
変更前:
  upperBase = available.filter(m => m.gradeGroup === UPPER)
  lowerBase = available.filter(m => m.gradeGroup === LOWER)

変更後:
  upperBase = available.filter(m => m.gradeGroup === UPPER || m.gradeGroup === ANY)
  lowerBase = available.filter(m => m.gradeGroup === LOWER || m.gradeGroup === ANY)
```

### R3: 同日の G1/G2 重複防止

`ANY` メンバーは両プールに含まれるため、G1 で選出された場合に G2 の候補から除外する必要がある。
現在の実装では G1 選出後に `usedIds` で除外しており、**既存ロジックで対応済み**。

```typescript
const usedIds = new Set([group1Result.member1.id, group1Result.member2.id]);
const remainingLower = lowerMembers.filter((m) => !usedIds.has(m.id));
```

### R4: 分級日のクロスオーバーとの関係

既存のクロスオーバー機構（分級日にBOTH言語メンバーがグループを跨ぐ）とは**独立**。

- `ANY` はグレード区分の話（候補プールへの追加）
- クロスオーバーは言語制約の話（BOTH言語の不足を補う）
- 両方が適用される場合: `ANY` + `BOTH` のメンバーは特別扱い不要（両プールに入り、かつクロスオーバー対象にもなるが、重複追加はフィルタリングで自然に排除）

### R5: フロントエンド表示

割り当て表示で `ANY` メンバーのグレードバッジ:
- G1（UPPER）に配置された場合 → `高` と表示
- G2（LOWER）に配置された場合 → `低` と表示
- クロスオーバー表示（`★`）: `ANY` メンバーは実質どちらでも可なので、配置先グループと異なるグレードの場合でもクロスオーバーとしない

```
変更前: isCrossover = m.gradeGroup !== g.gradeGroup
変更後: isCrossover = m.gradeGroup !== 'ANY' && m.gradeGroup !== g.gradeGroup
```

### R6: 手動割り当て調整

`adjustAssignment()` で `ANY` メンバーは G1・G2 どちらにも配置可能。既存のグレード一致チェックを更新:

```
変更前: if (member.gradeGroup !== expectedGrade) → warning
変更後: if (member.gradeGroup !== 'ANY' && member.gradeGroup !== expectedGrade) → warning
```

## ドメインモデル

### 変更対象

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/value-objects/grade-group.ts` | `ANY: 'ANY'` を追加 |
| `src/domain/services/assignment-generator.ts` | プール振り分けで `ANY` を両方に含める |
| `src/application/use-cases/generate-assignments.ts` | `adjustAssignment` のグレードチェック緩和 |
| `src/application/use-cases/import-members-csv.ts` | CSV インポートの validation に `ANY` を追加 |

### インフラ層

| ファイル | 変更内容 |
|----------|----------|
| `src/infrastructure/persistence/migrations/` | 新マイグレーションで CHECK 制約に `ANY` を追加 |

### プレゼンテーション層

| ファイル | 変更内容 |
|----------|----------|
| `public/index.html` | `<select>` に `<option value="ANY">` を追加 |
| `public/js/members.js` | `gradeMap` に `ANY` エントリを追加 |
| `public/js/assignments.js` | クロスオーバー判定を更新 |
| `public/js/i18n.js` | `any: 'どちらでも可'` / `any: 'Either'` を追加 |
| `src/presentation/i18n/ja.ts` | `any: 'どちらでも可'` を追加 |
| `src/presentation/i18n/en.ts` | `any: 'Either'` を追加 |

### 変更不要

- `src/domain/entities/member.ts` — 型が自動的に追随
- `src/shared/validators.ts` — `isValidGradeGroup()` は GradeGroup 定義を参照しており自動適応
- `src/infrastructure/persistence/sqlite-member-repository.ts` — 型キャストで自動適応
- `src/application/dto/member-dto.ts` — `string` 型で自動適応

## ユースケース

### UC1: ANY メンバーの登録

**前提:** ヘルパーが「どちらでも可」で登録される

**処理:**
1. UI で「どちらでも可」を選択
2. API に `gradeGroup: 'ANY'` が送信される
3. バリデーション通過、DB に保存

### UC2: 割り当て生成 — ANY メンバーが LOWER を補完

**前提:**
- UPPER: 4人（BOTH×2, JP×2）
- LOWER: 2人（JP×1, EN×1）
- ANY: 1人（EN）

**処理:**
- upperBase: UPPER 4人 + ANY 1人 = 5人
- lowerBase: LOWER 2人 + ANY 1人 = 3人
- G1 (UPPER): BOTH+JP が選出（5人から）— ANY メンバーが選ばれない場合
- G2 (LOWER): JP+EN (ANY) が選出 — ANY メンバーが LOWER を補完

**結果:** LOWER の人数不足を ANY メンバーが補完。

### UC3: 割り当て生成 — ANY メンバーが G1 で使用された場合

**前提:** 上記と同じ

**処理:**
- G1: ANY(EN) + BOTH が選出される場合
- G2: `usedIds` により ANY メンバーが除外される → LOWER 2人から選出

**結果:** 重複なし。既存の `usedIds` 機構で安全。

### UC4: CSV インポート

**入力:** `name,language,gradeGroup,...` で `gradeGroup=ANY`

**処理:** バリデーション通過、正常にインポート

### UC5: 手動割り当て調整

**前提:** ANY メンバーを G1（UPPER枠）に手動配置

**処理:** `gradeGroup === 'ANY'` なのでグレード不一致警告は出ない

## 受け入れ基準

### ドメイン層

| # | テスト | 期待結果 |
|---|--------|----------|
| T1 | `GradeGroup.ANY` が定義されている | 型チェック通過 |
| T2 | ANY メンバーが UPPER/LOWER 両プールに含まれる | G1・G2 両方の候補になる |
| T3 | ANY メンバーが G1 で選出された場合、G2 候補から除外される | 重複なし |
| T4 | 分級日で ANY メンバーが正しく扱われる | CLASS_LANGUAGE_COVERAGE を考慮 |

### アプリケーション層

| # | テスト | 期待結果 |
|---|--------|----------|
| T5 | adjustAssignment で ANY メンバーを G1/G2 どちらにも配置可能 | グレード不一致警告なし |
| T6 | CSV インポートで `gradeGroup=ANY` を受け付ける | バリデーション通過 |

### インフラ層

| # | テスト | 期待結果 |
|---|--------|----------|
| T7 | DB に `grade_group='ANY'` のメンバーを保存・読み出しできる | CRUD 正常 |

### プレゼンテーション層

| # | テスト | 期待結果 |
|---|--------|----------|
| T8 | メンバー登録フォームに「どちらでも可」オプションがある | UI 確認 |
| T9 | 割り当て表示で ANY メンバーにクロスオーバー表示が出ない | `★` なし |
