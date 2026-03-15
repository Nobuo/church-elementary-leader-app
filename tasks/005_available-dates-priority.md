# 005: 日付指定メンバーの優先割り当て

## ステータス: 完了

## タスク概要

`availableDates` が設定されているメンバーを、割り当てアルゴリズムのスコアリングで優先する。`scorePair()` にボーナス（-30）を追加する。

## 仕様書

`specs/available-dates-priority.md`

## 依存タスク

なし

## 対象ファイル

- `src/domain/services/assignment-generator.ts` — `scorePair()` にボーナス追加
- `tests/domain/assignment-generator.test.ts` — テスト追加

## 実装手順

### Step 1: テスト追加（テストファースト）

`tests/domain/assignment-generator.test.ts` に以下のテストケースを追加:

1. **日付指定メンバーが優先される**: 同条件の2人（日付指定あり vs なし）で、日付指定ありメンバーがスコアリングで有利になることを確認
2. **必須制約が覆らない**: 日付指定ボーナスがあっても、言語バランス違反（+100,000）で日付指定なしメンバーが選ばれることを確認
3. **日付指定なしのみの場合は結果不変**: 全員 `availableDates = null` の場合、既存テストの結果が変わらないことを確認（既存テストの通過で担保）

### Step 2: `scorePair()` にボーナス追加

`src/domain/services/assignment-generator.ts` の `scorePair()` 関数内、弱い制約のスコアリングセクション（月内重複の前あたり）に追加:

```typescript
// Available-dates priority: members with date restrictions get a bonus
for (const m of [member1, member2]) {
  if (m.availableDates !== null) {
    score -= 30;
  }
}
```

### Step 3: 既存テスト確認

`npm test` で全テストが通ることを確認。

## テスト方針

- **単体テスト**: `scorePair()` レベルで、日付指定あり/なしのスコア差を検証
- **結合テスト**: `generateAssignments()` レベルで、日付指定メンバーが優先的に割り当てられることを検証
- **回帰テスト**: 既存テスト164件 + セキュリティテスト27件が全て通ること

## 完了条件

- [ ] `scorePair()` に日付指定ボーナス（-30）が追加されている
- [ ] 日付指定メンバーが優先的に割り当てられるユニットテストがある
- [ ] 必須制約が覆らないことを確認するテストがある
- [ ] 既存テストが全て通る
- [ ] タスクファイルのステータスが「完了」に更新されている
