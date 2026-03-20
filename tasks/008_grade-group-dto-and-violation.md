# タスク 008: AssignmentDto拡張とViolationType追加 ✅ 完了

## 概要

AssignmentDtoに`gradeGroup`/`role`フィールドを追加し、`GRADE_GROUP_MISMATCH` ViolationTypeを定義する。後続タスク（009〜011）の基盤となる変更。

## 仕様書

`specs/grade-group-display-and-crossover.md`

## 依存タスク

なし（本機能の最初のタスク）

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/domain/services/assignment-generator.ts` | `ViolationType`に`GRADE_GROUP_MISMATCH`追加 |
| `src/application/use-cases/generate-assignments.ts` | AssignmentDtoの`members`に`gradeGroup`/`role`追加 |
| `src/presentation/i18n/ja.ts` | `upperShort`/`lowerShort`/`crossoverNote`/`violations.gradeGroupMismatch`追加 |
| `src/presentation/i18n/en.ts` | 同上（英語） |
| `public/js/i18n.js` | フロントエンド用翻訳キー追加 |

## 実装手順

### Step 1: ViolationType に GRADE_GROUP_MISMATCH を追加

`src/domain/services/assignment-generator.ts` の `ViolationType` 定数に追加:

```typescript
GRADE_GROUP_MISMATCH: 'GRADE_GROUP_MISMATCH',
```

### Step 2: AssignmentDto の members を拡張

`src/application/use-cases/generate-assignments.ts` の `AssignmentDto` インターフェースを変更:

```typescript
members: {
  id: string;
  name: string;
  gradeGroup: string;  // 追加
  role: string;        // 追加
}[];
```

DTO生成箇所（`generateMonthlyAssignments`、`adjustAssignment`、`getAssignmentsForMonth` の3箇所）を更新:

```typescript
members: a.memberIds.map((mid, idx) => ({
  id: mid,
  name: memberMap.get(mid)?.name ?? 'Unknown',
  gradeGroup: memberMap.get(mid)?.gradeGroup ?? 'UNKNOWN',
  role: idx === 0 ? 'UPPER' : 'LOWER',
})),
```

### Step 3: i18n にキーを追加

**ja.ts:**
```typescript
upperShort: '高',
lowerShort: '低',
crossoverNote: '※本来は{grade}',
'violations.gradeGroupMismatch': '{name}さんは{registered}ですが{assigned}枠に割り当てられています',
```

**en.ts:**
```typescript
upperShort: 'U',
lowerShort: 'L',
crossoverNote: '*registered as {grade}',
'violations.gradeGroupMismatch': '{name} is registered as {registered} but assigned to {assigned} slot',
```

**public/js/i18n.js:** 同じキーをフロントエンド用にも追加。

### Step 4: 型チェック

```bash
npm run typecheck
```

## テスト方針

- 既存テストが通ることを確認（DTOフィールド追加は後方互換）
- AssignmentDtoに`gradeGroup`/`role`が含まれることは結合テスト（タスク011）で検証

## 完了条件

- [ ] `ViolationType.GRADE_GROUP_MISMATCH` が定義されている
- [ ] AssignmentDtoの各メンバーに `gradeGroup` と `role` が含まれる
- [ ] DTO生成の3箇所すべてが更新されている
- [ ] i18n（ja/en/frontend）にすべてのキーが追加されている
- [ ] `npm run typecheck` が通る
- [ ] 既存テストが全パスする
