# 割り当てUX改善

## 機能概要

割り当て画面の操作性と視認性を改善する6つの要件をまとめた仕様。

1. 差し替え候補におすすめマーク表示
2. 警告メッセージの多言語対応（英語→日英切替）
3. 差し替え後の警告の自動クリア
4. 警告対象メンバーの文字色変更
5. 未来日の割り当てクリア機能（過去日はクリア不可）
6. 過去日のメンバー差し替え時に警告表示

---

## 1. 差し替え候補のおすすめ表示

### 機能概要

差し替え候補ドロップダウンで、全ての制約（言語バランス、同性制約、夫婦制約、月内重複、最小間隔、担当回数）を総合的に評価し、制約違反がなく最適なメンバーを「おすすめ」として視覚的に区別する。

### ユースケース

- **正常系**: 差し替えボタンを押すと候補一覧が表示され、おすすめメンバーには星マーク（★）が付く
- **正常系**: 制約違反があるメンバーも候補に含まれるが、違反内容がアイコンで表示される
- **異常系**: おすすめ候補がいない場合（全員が何らかの制約に抵触）でも候補は表示される（マークなし）

### 入出力

#### API変更: `GET /api/assignments/candidates`

追加パラメータ:
```
GET /api/assignments/candidates?date=YYYY-MM-DD&excludeIds=id1,id2&assignmentId=xxx&partnerId=yyy
```

- `assignmentId`: 差し替え対象の割り当てID（制約チェック用）
- `partnerId`: ペア相手のメンバーID（言語・同性・夫婦制約チェック用）

現在の応答:
```json
[{ "id": "...", "name": "..." }]
```

変更後:
```json
[{ "id": "...", "name": "...", "recommended": true, "count": 3, "warnings": [] }]
```

- `recommended`: 以下の制約を**全て**クリアした場合に `true`
  - **言語バランス**: ペア相手と組んだ際に日本語・英語の両方をカバーできる
  - **同性制約**: ペア相手または自身に同性ペア制限がある場合、同性であること
  - **夫婦制約**: ペア相手と配偶者関係でないこと
  - **月内重複**: 当月に未割り当て
  - **最小間隔**: 2週間以内に割り当てなし
  - **担当回数**: 年度内の担当回数が平均以下
  - **イベント日HELPER除外**: イベント日の場合、HELPERメンバーでないこと
- `count`: 年度内の担当回数（表示用）
- `warnings`: 制約違反がある場合、その種別のリスト（例: `["language", "monthlyDuplicate"]`）

#### 制約チェックの詳細

| 制約 | チェック内容 | warnings値 |
|------|-------------|-----------|
| 言語バランス | 候補者とpartnerで日英両方をカバーできるか | `language` |
| 同性制約 | sameGenderOnly の相手と異性ではないか | `sameGender` |
| 夫婦制約 | partner と配偶者関係でないか | `spouse` |
| 月内重複 | 当月の他の割り当てに既に含まれていないか | `monthlyDuplicate` |
| 最小間隔 | 2週間以内に他の割り当てがないか | `minInterval` |
| 担当回数 | 年度内担当回数が平均を超えていないか | `excessiveCount` |
| イベント日HELPER除外 | イベント日にHELPERでないか | `helperOnEvent` |

※ `helperOnEvent` は現在の candidates API で既にフィルタリング済みだが、おすすめ表示では警告として可視化する。ただし実際にはイベント日のHELPERは候補リストに含まれないため、この警告が表示されることはない（将来の仕様変更への備え）。

### ドメインモデル

- ドメイン層の変更なし
- 既存の constraint-checker の各チェック関数を候補API内で再利用する
- 判定ロジックはコントローラーで実施（constraint-checker を呼び出す）

### UI

- ドロップダウン内で `recommended` なメンバーにはプレフィックスに `★` を表示
- `count` を `(N回)` / `(N times)` として名前の後に表示
- `warnings` があるメンバーには `⚠` を表示
- おすすめメンバーを一覧の上部にソート、次に警告なしの回数順、最後に警告ありの回数順

---

## 2. 警告メッセージの多言語対応

### 機能概要

現在英語のみの制約違反メッセージ（constraint-checker, assignment-generator 内の `message` フィールド）を、APIレスポンスに `messageKey` と `params` を含めてフロントエンドで翻訳表示できるようにする。

### ユースケース

- **正常系**: 日本語モード時に警告が日本語で表示される。英語モード時は英語で表示される。
- **異常系**: 翻訳キーが見つからない場合は `message`（英語）がフォールバックとして表示される

### 入出力

#### ConstraintViolation の拡張

```typescript
export interface ConstraintViolation {
  readonly type: ViolationType;
  readonly severity: Severity;
  readonly memberIds: readonly MemberId[];
  readonly message: string;        // 英語（既存・フォールバック）
  readonly messageKey: string;     // i18nキー
  readonly messageParams: Record<string, string>; // 補間パラメータ
}
```

#### 対象メッセージ一覧

| 現在のメッセージ | messageKey | params |
|---|---|---|
| `Group lacks Japanese/English language coverage` | `violations.languageCoverage` | `{ missing: "Japanese"/"English" }` |
| `{name} requires same-gender pairing` | `violations.sameGender` | `{ name }` |
| `Member is already assigned this month` | `violations.monthlyDuplicate` | `{}` |
| `Spouses {name1} and {name2} are in the same group` | `violations.spouseSameGroup` | `{ name1, name2 }` |
| `Member was assigned within the last 2 weeks` | `violations.minInterval` | `{}` |
| `{name}: {count} assignments (expected ~{expected}, too many/few)` | `violations.excessiveCount` | `{ name, count, expected, direction }` |
| `Not enough members for {date}` | `violations.notEnoughMembers` | `{ date, upper, lower }` |
| `Could not form group {n} for {date}` | `violations.cannotFormGroup` | `{ group, date }` |
| `{name} is already assigned this month` | `violations.monthlyDuplicateNamed` | `{ name }` |
| `Spouses {name1} and {name2} paired together` | `violations.spousesPaired` | `{ name1, name2 }` |
| `Same-gender constraint violated for {name1} or {name2}` | `violations.sameGenderViolated` | `{ name1, name2 }` |
| `HELPER members cannot be assigned on event days` | `violations.helperOnEventDay` | `{}` |

### ドメインモデル

- `ConstraintViolation` に `messageKey` と `messageParams` を追加
- constraint-checker と assignment-generator の全メッセージ生成箇所を更新

### i18n

- サーバーサイド `ja.ts` / `en.ts` に `violations` セクション追加
- クライアントサイド `i18n.js` にも同様のキーを追加
- フロントエンドの `showViolations` で `messageKey` + `messageParams` から翻訳文を組み立て、なければ `message` にフォールバック

---

## 3. 差し替え後の警告自動クリア

### 機能概要

差し替え操作後に警告が表示しっぱなしになる問題を修正。差し替え結果に警告がなければ警告エリアを非表示にする。

### ユースケース

- **正常系**: 差し替え後に制約違反がなければ警告エリアが消える
- **正常系**: 差し替え後に制約違反があれば、その違反のみ表示される（前回の違反は消える）

### UI変更

`doReplace` 関数で、violations が空の場合に `showViolations([])` を呼び出して警告エリアを非表示にする。

```javascript
// 現在の実装
if (result.violations && result.violations.length > 0) {
  showViolations(result.violations);
}

// 修正後
showViolations(result.violations || []);
```

---

## 4. 警告対象メンバーの文字色変更

### 機能概要

警告が発生しているメンバーの名前を、割り当て表示上で赤色にする。制約違反が解消されたら元の色に戻す。

### ユースケース

- **正常系**: 差し替え後に警告が出たメンバーの名前が赤くなる
- **正常系**: 再度差し替えして警告が解消されたら通常色に戻る
- **正常系**: 自動生成時の警告でも対象メンバーをハイライト

### 入出力

#### AssignmentDto の拡張は不要

`AdjustAssignmentResult.violations` の `memberIds` に対象メンバーIDが含まれているため、フロントエンドで対応可能。

#### GenerateAssignmentsResult

同様に `violations[].memberIds` で対象メンバーを特定可能。

### UI変更

- 現在の割り当てメンバー名の各 `<span>` に `data-member-id` 属性を付与
- 警告表示時に `violations[].memberIds` に該当するメンバー名に `warning-member` CSSクラスを付与
- 警告クリア時に全メンバーから `warning-member` を除去

### CSS

```css
.warning-member { color: #dc2626; font-weight: 600; }
```

---

## 5. 未来日の割り当てクリア機能

### 機能概要

割り当て画面に日ごとの「クリア」ボタンを追加し、現在日付より後の割り当てのみクリア（削除）できるようにする。過去日のクリアは不可。

### ユースケース

- **正常系**: 未来日の割り当てに「クリア」ボタンが表示され、押すとその日の割り当てが削除される
- **異常系**: 過去日にはクリアボタンが表示されない
- **境界**: 当日は「今日」として扱い、クリア可能とする

### 入出力

#### API: `DELETE /api/assignments/by-date`

```
DELETE /api/assignments/by-date?date=YYYY-MM-DD
Response: { success: true }
```

- サーバーサイドで日付チェック: `date < today` の場合は `400 { error: "Cannot clear past assignments" }`

### ドメインモデル

- 変更なし（既存の `assignmentRepo.deleteByScheduleId` を使用）

### UI

- 各日付ヘッダーの右側に「クリア」ボタンを表示（未来日・当日のみ）
- 過去日にはボタンなし
- クリア実行前に確認ダイアログを表示

### i18n

- `clear`: 'クリア' / 'Clear'
- `clearConfirm`: 'この日の割り当てをクリアしますか？' / 'Clear assignments for this date?'
- `cannotClearPast`: '過去の割り当てはクリアできません' / 'Cannot clear past assignments'

---

## 6. 過去日の差し替え時警告

### 機能概要

現在日付より過去の割り当てのメンバーを差し替えようとした際に、確認警告を表示する。

### ユースケース

- **正常系**: 過去日のメンバー差し替えボタンを押すと「過去の割り当てを変更しようとしています。続けますか？」と確認ダイアログが表示される
- **正常系**: 確認後に通常通り差し替え候補が表示される
- **正常系**: キャンセルすると差し替え操作が中止される
- **正常系**: 未来日・当日では確認なしで候補が表示される

### UI変更

`startReplace` 関数内で日付チェックを追加:

```javascript
const today = new Date().toISOString().slice(0, 10);
if (date < today) {
  if (!confirm(t('pastAssignmentWarning'))) return;
}
```

### i18n

- `pastAssignmentWarning`: '過去の割り当てを変更しようとしています。続けますか？' / 'You are about to modify a past assignment. Continue?'

---

## 制約・ビジネスルール

1. おすすめ判定は候補API内で完結し、ドメイン層には影響しない
2. 多言語対応は `messageKey` + `messageParams` パターンで、既存の `message` との後方互換性を維持する
3. 過去日の判定は UTC ではなくサーバーのローカル日付（JST想定）で行う
4. クリア機能は日単位で動作し、月単位の既存 DELETE API とは別エンドポイントとする

---

## 受け入れ基準（テスト観点）

### 1. おすすめ表示

- [ ] candidates API が `recommended`、`count`、`warnings` を返すこと
- [ ] `assignmentId` と `partnerId` パラメータで制約チェックが正しく行われること
- [ ] 言語バランスを満たさないペアに `language` 警告が付くこと
- [ ] 同性制約に違反するペアに `sameGender` 警告が付くこと
- [ ] 配偶者とのペアに `spouse` 警告が付くこと
- [ ] 当月割り当て済みメンバーに `monthlyDuplicate` 警告が付くこと
- [ ] 2週間以内に割り当てがあるメンバーに `minInterval` 警告が付くこと
- [ ] 担当回数が平均超のメンバーに `excessiveCount` 警告が付くこと
- [ ] イベント日にHELPERが候補から除外されていること（既存動作の維持）
- [ ] 全制約をクリアしたメンバーのみ `recommended: true` になること
- [ ] ドロップダウンで ★ おすすめ → 警告なし → ⚠ 警告あり の順にソートされること

### 2. 多言語対応

- [ ] 全ての ConstraintViolation に `messageKey` と `messageParams` が設定されていること
- [ ] フロントエンドで日本語モード時に日本語メッセージが表示されること
- [ ] 翻訳キーがない場合に英語 `message` がフォールバックされること

### 3. 警告自動クリア

- [ ] 差し替え後に violations が空なら警告エリアが非表示になること
- [ ] 差し替え後に violations があれば最新の警告のみ表示されること

### 4. メンバー文字色

- [ ] 警告対象メンバーの名前が赤色で表示されること
- [ ] 警告が解消されたら通常色に戻ること

### 5. クリア機能

- [ ] 未来日・当日の割り当てにクリアボタンが表示されること
- [ ] 過去日にはクリアボタンが表示されないこと
- [ ] クリア実行で該当日の割り当てが削除されること
- [ ] 過去日を指定した DELETE API が 400 エラーを返すこと

### 6. 過去日差し替え警告

- [ ] 過去日の差し替えボタンを押すと確認ダイアログが表示されること
- [ ] 確認後に通常通り差し替え処理が進むこと
- [ ] キャンセルすると差し替えが中止されること
- [ ] 未来日・当日では確認なしで候補が表示されること
