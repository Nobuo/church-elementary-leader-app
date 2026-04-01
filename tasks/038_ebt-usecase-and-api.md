# タスク038: EBT - ユースケース & APIエンドポイント

## タスク概要
`toggleEbt` ユースケースと `POST /api/schedules/:id/toggle-ebt` エンドポイントを追加する。

## 対象ファイル
- `src/application/use-cases/generate-monthly-schedule.ts`
- `src/presentation/controllers/schedule-controller.ts`

## 実装手順

### 1. DTO更新
`src/application/use-cases/generate-monthly-schedule.ts`:

1. `ScheduleDto` に `isEbt: boolean` を追加
2. `toScheduleDto()` で `isEbt: s.isEbt` をマッピング

### 2. ユースケース追加
同ファイルに `toggleEbt` 関数を追加（`toggleEvent` と同パターン）:

```typescript
export function toggleEbt(
  scheduleId: string,
  scheduleRepo: ScheduleRepository,
): Result<ScheduleDto> {
  const schedule = scheduleRepo.findById(asScheduleId(scheduleId));
  if (!schedule) return { ok: false, error: 'Schedule not found' };
  const toggled = schedule.toggleEbt();
  scheduleRepo.save(toggled);
  return ok(toScheduleDto(toggled));
}
```

### 3. APIエンドポイント追加
`src/presentation/controllers/schedule-controller.ts`:

```typescript
router.post('/:id/toggle-ebt', (req: Request, res: Response) => {
  const result = toggleEbt(String(req.params.id), scheduleRepo);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result.value);
});
```

`toggleEbt` を import に追加。

## 依存タスク
- 037（ドメイン層 & マイグレーション）

## テスト方針
- `toggleEbt` ユースケースが正しくトグルすること
- 存在しないIDに対してエラーを返すこと
- APIエンドポイントが200レスポンスを返すこと

## 完了条件
- `ScheduleDto` に `isEbt` が含まれている
- `toggleEbt` ユースケースが動作する
- `POST /api/schedules/:id/toggle-ebt` が動作する
