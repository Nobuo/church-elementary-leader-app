# タスク 031: CSV / LINE フォーマッタの3人対応

## 概要
CSV エクスポートと LINE メッセージフォーマットを、合同日の3人グループに対応させる。

## 依存タスク
- 027（Assignment エンティティの可変長対応）

## 対象ファイル
- `src/domain/services/csv-formatter.ts`
- `src/domain/services/line-message-formatter.ts`

## 実装手順

### Step 1: csv-formatter.ts

1. ヘッダー行の変更: 固定2人カラムから可変長対応
2. 出力行: `memberIds` の長さに応じてカラム数を調整
3. 合同日は1行（3人）、分級日は2行（各2人）

### Step 2: line-message-formatter.ts

1. メンバー表示: `memberIds` の長さに応じて名前を列挙
2. グループラベル: 合同日は1グループのみ表示

## テスト方針

- CSV: 合同日3人の行が正しくフォーマットされること
- CSV: 分級日2人の行が既存通りであること
- LINE: 合同日3人の表示が正しいこと

## 完了条件
- [x] CSV エクスポートが3人に対応している
- [x] LINE メッセージが3人に対応している
- [x] 既存の2人ケースが引き続き正しく出力される

## ステータス: 完了
