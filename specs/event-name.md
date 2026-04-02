# イベント名の入力・表示機能

## 機能概要
スケジュール設定でイベント日にイベント名（日本語・英語、各任意）を入力・保存できるようにする。LINE用テキスト出力時に `lang` パラメータに応じた言語のイベント名を日付横に表示する。

## ビジネスルール
- イベント名は日本語（`eventNameJa`）と英語（`eventNameEn`）の2フィールド
- **両方とも任意**（片方だけの入力もOK、両方空でもOK）
- イベント名は `isEvent=true` のスケジュールにのみ意味を持つ
- `isEvent` を `false` にトグルした場合でもイベント名は保持する（再トグル時に復元）
- イベント名の最大長: 各100文字

## ドメインモデル

### Schedule エンティティ
```typescript
// 追加プロパティ
readonly eventNameJa: string | null;
readonly eventNameEn: string | null;

// 追加メソッド
setEventName(nameJa: string | null, nameEn: string | null): Schedule
```

- `Schedule.create()` では `eventNameJa: null, eventNameEn: null` で初期化
- `setEventName()` は新しい Schedule インスタンスを返す（不変性維持）
- `toggleEvent()` はイベント名を変更しない（保持）

### ScheduleDto
```typescript
// 追加フィールド
eventNameJa: string | null;
eventNameEn: string | null;
```

## データベース

### マイグレーション（010）
```sql
ALTER TABLE schedules ADD COLUMN event_name_ja TEXT DEFAULT NULL;
ALTER TABLE schedules ADD COLUMN event_name_en TEXT DEFAULT NULL;
```
- ロールバック: backup-and-restore パターン（既存の009と同様）

### リポジトリ
- `ScheduleRow` に `event_name_ja: string | null`, `event_name_en: string | null` 追加
- `rowToSchedule` でマッピング
- `save()` の INSERT 文に2カラム追加

## API

### PUT /api/schedules/:id/event-name
イベント名を設定・更新する。

**リクエスト:**
```json
{ "eventNameJa": "クリスマス会", "eventNameEn": "Christmas Party" }
```
- 各フィールドが空文字列または未指定の場合は `null` として保存
- 片方だけの指定もOK（もう片方は `null`）

**レスポンス:** `ScheduleDto`（更新後のスケジュール）

**エラー:**
- `400` — スケジュールが存在しない
- `400` — いずれかのイベント名が100文字超

### 既存 API への影響
- `GET /api/schedules` — レスポンスに `eventNameJa`, `eventNameEn` フィールドが追加される
- `POST /api/schedules/generate` — レスポンスに `eventNameJa: null, eventNameEn: null` が含まれる
- `POST /:id/toggle-event` — レスポンスにイベント名が含まれる（値は変更しない）

## LINE用テキスト出力

### 表示ルール（lang=ja の場合）
| isEvent | eventNameJa | 表示 |
|---------|-------------|------|
| false | — | 通常表示（変更なし） |
| true | null / "" | `🎉 イベント日` |
| true | "クリスマス会" | `🎉 クリスマス会` |

### 表示ルール（lang=en の場合）
| isEvent | eventNameEn | 表示 |
|---------|-------------|------|
| false | — | 通常表示（変更なし） |
| true | null / "" | `🎉 Event Day` |
| true | "Christmas Party" | `🎉 Christmas Party` |

### フォールバック
対応言語の名前が `null` で、もう片方の言語に名前がある場合は、もう片方を使用する。
- 例: `lang=en`, `eventNameEn=null`, `eventNameJa="クリスマス会"` → `🎉 クリスマス会`
- 両方 `null` → デフォルト表示（`🎉 イベント日` / `🎉 Event Day`）

### 実装箇所
`line-message-formatter.ts` の日付ラベル生成部分にイベントタグを追加:
```
4/6（日）🎉 クリスマス会 📚 1~3年と4~6年に分けてクラス
```

## CSV出力

### 変更
- 「イベント日」列の値をイベント名付きに変更:
  - `isEvent=false` → 空文字
  - `isEvent=true`, 名前なし → `TRUE`
  - `isEvent=true`, 名前あり → 該当言語のイベント名（フォールバックあり）

## フロントエンドUI

### スケジュール設定画面
- イベントボタンが `active` の場合、スケジュールカード内に2つのテキスト入力欄を表示:
  ```html
  <input type="text" placeholder="イベント名(日)" value="...">
  <input type="text" placeholder="Event Name(EN)" value="...">
  ```
- 入力欄からフォーカスが外れた時（blur）またはEnterキーで `PUT /api/schedules/:id/event-name` を呼ぶ（両フィールドをまとめて送信）
- イベントボタンが `active` でない場合、入力欄は非表示

### 割り当て結果画面
- イベントタグの表示をイベント名付きに変更:
  - 現在の言語に応じたイベント名がある場合: `<span class="event-tag">{eventName}</span>`
  - ない場合: `<span class="event-tag">イベント日</span>` / `<span class="event-tag">Event Day</span>`（従来通り）

### i18n 追加キー
```javascript
// ja
eventNameJa: 'イベント名(日)',
eventNameEn: 'Event Name(EN)',
eventNamePlaceholderJa: 'イベント名(日)',
eventNamePlaceholderEn: 'Event Name(EN)',

// en
eventNameJa: 'Event Name (JA)',
eventNameEn: 'Event Name (EN)',
eventNamePlaceholderJa: 'Event Name (JA)',
eventNamePlaceholderEn: 'Event Name (EN)',
```

## ユースケース

### 正常系
1. イベント日に日本語のイベント名のみ入力 → 保存される
2. 英語のイベント名のみ入力 → 保存される
3. 両方入力 → 両方保存される
4. イベント名を空にする → null として保存される
5. LINE出力（日本語）で日本語イベント名が表示される
6. LINE出力（英語）で英語イベント名が表示される
7. LINE出力で対応言語がなく他言語がある場合、他言語にフォールバック
8. CSV出力でイベント名が表示される
9. イベントをOFF→ON→再設定 → 以前のイベント名が保持されている

### 異常系
1. 存在しないスケジュールIDでイベント名設定 → 400エラー
2. 100文字超のイベント名 → 400エラー

## 受け入れ基準（テスト観点）

### ドメインテスト
1. `Schedule.create()` で `eventNameJa`, `eventNameEn` が `null` に初期化される
2. `setEventName("名前", "Name")` で新しいインスタンスが返り、両方設定される
3. `setEventName("名前", null)` で日本語のみ設定される
4. `setEventName(null, null)` で両方 `null` になる
5. `toggleEvent()` でイベント名が変更されない
6. `Schedule.reconstruct()` でイベント名が復元される

### フォーマッターテスト
7. LINE(ja): `eventNameJa="クリスマス会"` → `🎉 クリスマス会`
8. LINE(en): `eventNameEn="Christmas"` → `🎉 Christmas`
9. LINE(ja): `eventNameJa=null, eventNameEn="Christmas"` → `🎉 Christmas`（フォールバック）
10. LINE(en): `eventNameEn=null, eventNameJa="クリスマス会"` → `🎉 クリスマス会`（フォールバック）
11. LINE(ja): 両方null → `🎉 イベント日`
12. LINE(en): 両方null → `🎉 Event Day`
13. LINE: `isEvent=false` → イベントタグなし
14. CSV(ja): `eventNameJa="クリスマス会"` → CSV列に `クリスマス会`
15. CSV(en): `eventNameEn="Christmas"` → CSV列に `Christmas`
16. CSV: `isEvent=true`, 名前なし → `TRUE`
17. CSV: `isEvent=false` → 空文字

### インテグレーションテスト
18. `PUT /api/schedules/:id/event-name` で両方のイベント名が保存される
19. `PUT /api/schedules/:id/event-name` で片方だけ指定 → もう片方は null
20. `PUT /api/schedules/:id/event-name` で空文字列 → null として保存
21. `GET /api/schedules` のレスポンスに `eventNameJa`, `eventNameEn` が含まれる
22. 存在しないIDで `PUT` → 400
23. 100文字超で `PUT` → 400
24. マイグレーション010のup/downラウンドトリップ
