# タスク 053: API エンドポイント — unassign / assign

## 概要
assignment-controller に `PUT /:id/unassign` と `PUT /:id/assign` エンドポイントを追加する。

## 対象ファイル
- `src/presentation/controllers/assignment-controller.ts`（変更）
- `tests/integration/assignment-api.test.ts`（テスト追加）

## 実装手順

### 1. PUT /:id/unassign エンドポイント追加

```typescript
router.put('/:id/unassign', (req, res) => {
  const { memberId } = req.body;
  if (!memberId) return res.status(400).json({ error: 'memberId is required' });
  const result = unassignMember(req.params.id, memberId, assignmentRepo, memberRepo, scheduleRepo);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result.value);
});
```

### 2. PUT /:id/assign エンドポイント追加

```typescript
router.put('/:id/assign', (req, res) => {
  const { memberId } = req.body;
  if (!memberId) return res.status(400).json({ error: 'memberId is required' });
  const result = assignToVacantSlot(req.params.id, memberId, assignmentRepo, memberRepo, scheduleRepo);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result.value);
});
```

### 3. import 追加

`unassignMember`, `assignToVacantSlot` を `generate-assignments.ts` から import。

## 依存タスク
- タスク052（ユースケース）

## テスト方針
- インテグレーションテスト（`tests/integration/assignment-api.test.ts`）:
  - `PUT /api/assignments/:id/unassign` — 正常系（メンバー解除）
  - `PUT /api/assignments/:id/unassign` — 全員解除で deleted: true
  - `PUT /api/assignments/:id/unassign` — 存在しないメンバーで 400
  - `PUT /api/assignments/:id/assign` — 正常系（空きスロットに割り当て）
  - `PUT /api/assignments/:id/assign` — 満員で 400
  - 解除後の担当回数が正しいことを `/api/assignments/counts` で確認

## 完了条件
- [x] `PUT /:id/unassign` が正しく動作する
- [x] `PUT /:id/assign` が正しく動作する
- [x] エラーケースが適切に処理される
- [x] インテグレーションテストが全てパスする
