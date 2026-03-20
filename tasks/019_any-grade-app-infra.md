# タスク 019: ANY学年区分 — アプリケーション層・インフラ層

## 概要

`adjustAssignment` のグレードチェック緩和、CSV インポートの ANY 対応、DB マイグレーションを実装する。

## 仕様書

`specs/any-grade-group.md`（R6, T5〜T7）

## 依存タスク

- タスク 018（ドメイン層・アルゴリズム）

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/application/use-cases/generate-assignments.ts` | `adjustAssignment` のグレードチェックで ANY を許可 |
| `src/application/use-cases/import-members-csv.ts` | CSV バリデーションに `ANY` を追加 |
| `src/infrastructure/persistence/migrations/` | 新マイグレーションで CHECK 制約に `ANY` を追加 |
| `tests/application/adjust-assignment.test.ts` | ANY メンバーの G1/G2 配置テスト |
| `tests/application/import-members-csv.test.ts` | ANY の CSV インポートテスト |
| `tests/infrastructure/sqlite-member-repository.test.ts` | ANY メンバーの CRUD テスト |

## 実装手順

### Step 1: adjustAssignment のグレードチェック更新

```typescript
// 変更前
if (member.gradeGroup !== expectedGrade) → warning

// 変更後
if (member.gradeGroup !== GradeGroup.ANY && member.gradeGroup !== expectedGrade) → warning
```

### Step 2: CSV インポートのバリデーション更新

```typescript
// 変更前
if (gradeGroup !== 'LOWER' && gradeGroup !== 'UPPER')

// 変更後
if (gradeGroup !== 'LOWER' && gradeGroup !== 'UPPER' && gradeGroup !== 'ANY')
```

### Step 3: DB マイグレーション追加

新ファイル `src/infrastructure/persistence/migrations/` に追加:

```sql
ALTER TABLE members DROP CONSTRAINT IF EXISTS ...;
-- SQLite: テーブル再作成 or CHECK制約の更新
```

※ SQLite は ALTER TABLE での CHECK 制約変更が制限されているため、実装時に対応方法を確認。

### Step 4: テスト追加・実行

| # | テスト | 期待結果 |
|---|--------|----------|
| T5 | adjustAssignment で ANY メンバーを G1 に配置 | 警告なし |
| T6 | adjustAssignment で ANY メンバーを G2 に配置 | 警告なし |
| T7 | CSV インポートで `gradeGroup=ANY` | バリデーション通過 |
| T8 | DB に `grade_group='ANY'` のメンバーを CRUD | 正常動作 |

### Step 5: 全テスト実行

```bash
npm test
npm run typecheck
npm run lint
```

## 完了条件

- [x] adjustAssignment で ANY メンバーが G1/G2 どちらにも配置可能
- [x] CSV インポートで ANY を受け付ける
- [x] DB マイグレーションが適用される
- [x] 既存テスト＋新規テストが全パスする
- [x] `npm run typecheck` / `npm run lint` が通る
