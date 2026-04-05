# タスク 049: DBマイグレーション — member_id_1/member_id_2 の NULL 許容化

## 概要
assignments テーブルの `member_id_1`, `member_id_2` カラムを NOT NULL から NULL 許容に変更するマイグレーションを作成する。

## 対象ファイル
- `src/infrastructure/persistence/migrations/011-nullable-member-slots.ts`（新規）
- `src/infrastructure/persistence/migrations/index.ts`（登録追加）

## 実装手順

1. `011-nullable-member-slots.ts` を作成
   - `up`: テーブル再作成（SQLiteは ALTER TABLE で NOT NULL → NULL への変更不可のため）
     - `assignments_old` にリネーム
     - 新テーブル作成（`member_id_1 TEXT`, `member_id_2 TEXT` — NOT NULL なし）
     - データ移行
     - 旧テーブル削除
     - インデックス再作成
   - `down`: 逆の操作（NULL 行があれば削除してから NOT NULL テーブルへ移行）

2. `migrations/index.ts` に `migration011` を追加

## 依存タスク
なし（最初に実施する）

## テスト方針
- マイグレーションのup/downが正常に動作すること
- 既存データが保持されること
- タスク053のインテグレーションテストで結合確認

## 完了条件
- [x] マイグレーション011が作成されている
- [x] `index.ts` に登録されている
- [x] 既存データの保持が保証されている
