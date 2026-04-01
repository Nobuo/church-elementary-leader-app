# タスク037: EBT - ドメイン層 & マイグレーション

## タスク概要
Schedule エンティティに `isEbt` プロパティを追加し、DBマイグレーションを作成する。

## 対象ファイル
- `src/domain/entities/schedule.ts`
- `src/infrastructure/persistence/migrations/009-schedule-ebt.ts`
- `src/infrastructure/persistence/migrations/index.ts`（マイグレーション登録）
- `src/infrastructure/persistence/sqlite-schedule-repository.ts`
- `src/__tests__/domain/entities/schedule.test.ts`

## 実装手順

### 1. Schedule エンティティ拡張
`src/domain/entities/schedule.ts`:

1. `ScheduleProps` に `readonly isEbt: boolean` を追加
2. `Schedule` クラスに `readonly isEbt: boolean` を追加
3. コンストラクタで `this.isEbt = props.isEbt` を設定
4. `create()` で `isEbt: false` をデフォルト値に追加
5. `toggleEbt()` メソッドを追加（`toggleEvent()` と同パターン）:
   ```typescript
   toggleEbt(): Schedule {
     return new Schedule({ ...this, isEbt: !this.isEbt });
   }
   ```

### 2. マイグレーション作成
`src/infrastructure/persistence/migrations/009-schedule-ebt.ts`:

```typescript
export const migration009: Migration = {
  version: 9,
  description: 'Add is_ebt column to schedules',
  up(db) {
    db.exec('ALTER TABLE schedules ADD COLUMN is_ebt INTEGER NOT NULL DEFAULT 0');
  },
  down(db) {
    // backup-and-restore パターン（SQLiteはALTER TABLE DROP COLUMNをサポートしない）
  },
};
```

マイグレーションインデックスに登録。

### 3. リポジトリ更新
`src/infrastructure/persistence/sqlite-schedule-repository.ts`:

1. `ScheduleRow` に `is_ebt: number` を追加
2. `rowToSchedule()` で `isEbt: row.is_ebt === 1` をマッピング
3. `save()` のINSERT文に `is_ebt` カラムを追加

## 依存タスク
- なし（最初に実施するタスク）

## テスト方針
- `Schedule.create()` で `isEbt` がデフォルト `false` であること
- `toggleEbt()` で `isEbt` が反転すること
- `toggleEbt()` が新しいインスタンスを返すこと（イミュータブル）
- `reconstruct()` で `isEbt` を正しく復元できること

## 完了条件
- Schedule エンティティに `isEbt` が追加されている
- マイグレーション009が作成・登録されている
- リポジトリで `isEbt` の読み書きが動作する
- ユニットテストが全てパスする
