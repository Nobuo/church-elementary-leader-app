# タスク 029: constraint-checker の3人対応

## 概要
手動調整時の制約チェック関数を3人グループに対応させる。合同日の差し替え時に正しく制約チェックが行われるようにする。

## 依存タスク
- 027（Assignment エンティティの可変長対応）

## 対象ファイル
- `src/domain/services/constraint-checker.ts`

## 実装手順

### Step 1: checkLanguageBalance を可変長対応

```typescript
// 変更前
export function checkLanguageBalance(member1: Member, member2: Member): ConstraintViolation | null;

// 変更後（オーバーロードまたは配列引数）
export function checkLanguageBalanceGroup(members: Member[]): ConstraintViolation | null;
```

- members 配列内で EN≧1 & JP≧1 を確認
- 既存の2引数版は後方互換のため維持し、内部で新関数を呼ぶ

### Step 2: checkSpouseSameGroup を可変長対応

```typescript
export function checkSpouseSameGroupMulti(members: Member[]): ConstraintViolation | null;
```

- members 配列内の全2人組み合わせで夫婦チェック
- 既存の2引数版は後方互換のため維持

### Step 3: checkSameGender は合同日では呼ばない

- 関数自体の変更は不要
- 呼び出し側（generate-assignments.ts の adjustAssignment）で合同日の場合はスキップ

### Step 4: checkExcessiveCount のスロット数計算

```typescript
// 変更前: 固定で4スロット/日
const expectedCount = (totalSundays * 4) / activeMembers.length;

// 変更後: スケジュール情報からスロット数を計算
// 合同日: 3スロット、分級日: 4スロット
```

- `checkExcessiveCount` の引数に `totalSlots: number` を追加（または schedules を渡して計算）

## テスト方針

- checkLanguageBalanceGroup: 3人中に EN & JP がいれば OK
- checkLanguageBalanceGroup: 3人中に JP のみだと violation
- checkSpouseSameGroupMulti: 3人中に夫婦がいたら violation
- checkSpouseSameGroupMulti: 3人中に夫婦がいなければ OK
- checkExcessiveCount: 合同日3スロット + 分級日4スロットで正しく期待値が計算されること
- 既存の2引数版が引き続き動作すること

## 完了条件
- [ ] 言語バランスチェックが3人対応している
- [ ] 夫婦チェックが3人対応している
- [ ] 過剰カウント計算がスロット数の変化を反映している
- [ ] 既存の2引数版が引き続き動作する（後方互換）
- [ ] ユニットテストが通る
