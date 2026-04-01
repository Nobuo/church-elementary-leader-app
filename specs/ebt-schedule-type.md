# EBT（English Bible Talk）スケジュールタイプ

## 機能概要

スケジュールに「EBT（English Bible Talk）」フラグを追加する。EBT日には英語しか話せないメンバー（`language: 'ENGLISH'`）は特別礼拝に参加するため、リーダー割り当ての対象から除外する。ただし、その日しか参加できないメンバーは例外として割り当て対象に残す。

## ユースケース

### 正常系

1. **EBT日の設定**: スケジュール画面で特定の日曜日を「EBT」に設定できる
2. **EBT日の解除**: 設定済みのEBT日を通常日に戻せる
3. **EBT日の自動割り当て生成**: EBT日に自動生成を行うと、`language: 'ENGLISH'` のメンバーが候補から除外される
4. **EBT日 + 特定日限定メンバーの例外**: `availableDates` にEBT日しか含まれない英語のみメンバーは、例外として割り当て候補に残る
5. **EBT日の手動調整**: EBT日の差し替え候補にも英語のみメンバーが表示されない（例外条件を満たす場合を除く）
6. **EBT日 + イベント日の併用**: EBTとイベントは独立したフラグとして両方設定可能。両方設定された場合、HELPER除外とENGLISH除外の両方が適用される

### 異常系

1. **除外日かつEBT日**: 除外日（`isExcluded`）はそもそも割り当て対象外のため、EBTフラグは無関係（両方設定可能だが、除外日が優先）
2. **EBT日にBOTHメンバー不足**: 英語のみメンバー除外後、英語カバー可能なメンバー（`BOTH`）が不足する場合、言語バランス制約違反として警告を表示

## 入出力の定義

### API

#### EBT日の切り替え

```
POST /api/schedules/:id/toggle-ebt
Response: { id, date, isExcluded, isEvent, isEbt, isSplitClass, splitType, year }
```

- トグル動作: 現在の `isEbt` を反転させる
- レスポンスは更新後のスケジュール情報

### データベース

#### マイグレーション（009-schedule-ebt）

```sql
ALTER TABLE schedules ADD COLUMN is_ebt INTEGER NOT NULL DEFAULT 0;
```

## ドメインモデル（DDD観点）

### Schedule エンティティの拡張

`src/domain/entities/schedule.ts`

- `ScheduleProps` に `isEbt: boolean` を追加
- `Schedule` クラスに `isEbt` プロパティを追加
- `toggleEbt(): Schedule` メソッドを追加（イミュータブルパターン、`toggleEvent()` と同様）
- `create()` で `isEbt: false` をデフォルト値に設定
- `reconstruct()` で `isEbt` を受け取る

```typescript
// SchedulePropsに追加
readonly isEbt: boolean;

// メソッド追加
toggleEbt(): Schedule {
  return new Schedule({
    ...this,
    isEbt: !this.isEbt,
  });
}
```

### assignment-generator の変更

`src/domain/services/assignment-generator.ts`

メンバーフィルタリングにEBT条件を追加（既存のイベント日フィルタの直後）:

```typescript
const available = activeMembers
  .filter((m) => m.isAvailableOn(dateStr))
  .filter((m) => !schedule.isEvent || m.memberType !== MemberType.HELPER)
  .filter((m) => {
    if (!schedule.isEbt) return true;
    if (m.language !== Language.ENGLISH) return true;
    // 例外: その日しか参加できないメンバー
    if (m.availableDates && m.availableDates.length > 0) {
      const availableActiveDates = activeDates
        .filter((s) => m.isAvailableOn(s.date))
        .filter((s) => !s.isEbt || m.language !== Language.ENGLISH);
      if (availableActiveDates.length === 0) return true;
    }
    return false;
  });
```

**例外条件の詳細**: 単に `availableDates.length === 1` ではなく、「EBT以外の参加可能な日が存在しない」かどうかで判定する。これにより、複数の参加可能日があっても全てEBT日であるメンバーも正しく例外扱いされる。

### constraint-checker の変更

- 変更なし（EBTは制約違反ではなく、候補フィルタリングで対応）

## 制約・ビジネスルール

| # | ルール | 種別 |
|---|--------|------|
| 1 | EBT日では `language: 'ENGLISH'` のメンバーを自動割り当て候補から除外する | ハード |
| 2 | 例外: EBT以外に参加可能な日がないメンバーは除外しない | ハード |
| 3 | `language: 'JAPANESE'` および `language: 'BOTH'` のメンバーはEBT日でも通常通り | - |
| 4 | EBTとイベントは独立フラグ。両方ONの場合、HELPER除外とENGLISH除外を両方適用 | - |
| 5 | EBTと除外日が両方ONの場合、除外日が優先（割り当て自体なし） | - |
| 6 | 手動調整（差し替え候補）でもEBT日のENGLISHメンバー除外を適用する | ハード |

## プレゼンテーション層

### スケジュールコントローラ

`src/presentation/controllers/schedule-controller.ts`

- `POST /:id/toggle-ebt` エンドポイントを追加（`toggle-event` と同パターン）

### 差し替え候補API

`src/presentation/controllers/assignment-controller.ts`

- `GET /candidates` のフィルタリングにEBT条件を追加:

```typescript
.filter((m) => !isEbtDay || m.language !== Language.ENGLISH || isOnlyAvailableOnEbtDays(m))
```

### アプリケーション層

`src/application/use-cases/generate-monthly-schedule.ts`

- `toggleEbt` ユースケースを追加（`toggleEvent` と同パターン）

### UI

`public/js/schedules.js`

- 各日曜日カードに「EBT」トグルボタンを追加（イベントボタンの隣）
- EBT日はカードに視覚的な区別を付ける（`btn-ebt` CSSクラス）
- 除外中はボタンを `disabled` にする

```javascript
<button class="btn-small btn-ebt ${s.isEbt ? 'active' : ''}"
  data-action="toggle-ebt" data-id="${escapeHtml(s.id)}"
  ${s.isExcluded ? 'disabled' : ''}>
  EBT
</button>
```

### i18n

| キー | 英語 | 日本語 |
|------|------|--------|
| `ebt` | `EBT` | `EBT` |
| `ebtDay` | `EBT Day` | `EBT日` |
| `violations.ebtEnglishOnly` | `English-only member excluded on EBT day` | `EBT日のため英語のみメンバーを除外` |

### CSS

`public/css/styles.css`

- `.btn-ebt` スタイルを追加（既存の `.btn-event` を参考に、異なる色で区別）

## 受け入れ基準（テスト観点）

### ドメイン層

- [ ] `Schedule.create()` で `isEbt` がデフォルト `false` であること
- [ ] `Schedule.toggleEbt()` で `isEbt` が反転すること
- [ ] `toggleEbt()` が新しい Schedule インスタンスを返すこと（イミュータブル）
- [ ] `Schedule.reconstruct()` で `isEbt` を正しく復元できること

### ドメインサービス層（assignment-generator）

- [ ] EBT日に `language: 'ENGLISH'` のメンバーが割り当てられないこと
- [ ] EBT日に `language: 'JAPANESE'` のメンバーが通常通り割り当てられること
- [ ] EBT日に `language: 'BOTH'` のメンバーが通常通り割り当てられること
- [ ] EBT日 + 特定日限定メンバー（EBT以外に参加可能な日がない）が例外として割り当てられること
- [ ] EBT日 + 特定日限定メンバー（EBT以外にも参加可能な日がある）は除外されること
- [ ] EBT + イベントの両方がONの場合、ENGLISHとHELPERの両方が除外されること
- [ ] 非EBT日ではENGLISHメンバーが通常通り割り当て対象になること

### アプリケーション層

- [ ] `toggleEbt` ユースケースが正しく動作すること
- [ ] 差し替え候補APIがEBT日の場合にENGLISHメンバーを除外すること
- [ ] 差し替え候補APIがEBT日でも例外メンバーを含めること

### インフラ層

- [ ] マイグレーション009で `is_ebt` カラムが追加されること
- [ ] 既存データの `is_ebt` がデフォルト `0` であること
- [ ] `SqliteScheduleRepository` で `isEbt` の読み書きが正しく動作すること

### プレゼンテーション層

- [ ] `POST /api/schedules/:id/toggle-ebt` でEBTフラグがトグルされること
- [ ] スケジュール画面にEBTトグルボタンが表示されること
- [ ] EBTボタンが除外日のとき `disabled` であること

### i18n

- [ ] `ebt` / `ebtDay` キーが日英両方に追加されていること

## 影響ファイル一覧

| レイヤー | ファイル | 変更内容 |
|----------|---------|---------|
| Domain | `src/domain/entities/schedule.ts` | `isEbt` プロパティ、`toggleEbt()` メソッド追加 |
| Domain | `src/domain/services/assignment-generator.ts` | EBTフィルタリング追加 |
| Application | `src/application/use-cases/generate-monthly-schedule.ts` | `toggleEbt` ユースケース追加 |
| Infrastructure | `src/infrastructure/persistence/migrations/009-schedule-ebt.ts` | `is_ebt` カラム追加 |
| Infrastructure | `src/infrastructure/persistence/sqlite-schedule-repository.ts` | `isEbt` 読み書き対応 |
| Presentation | `src/presentation/controllers/schedule-controller.ts` | `toggle-ebt` エンドポイント追加 |
| Presentation | `src/presentation/controllers/assignment-controller.ts` | 差し替え候補のEBTフィルタ追加 |
| Presentation | `src/presentation/i18n/en.ts` | EBT関連キー追加 |
| Presentation | `src/presentation/i18n/ja.ts` | EBT関連キー追加 |
| UI | `public/js/schedules.js` | EBTトグルボタン追加 |
| UI | `public/css/styles.css` | `.btn-ebt` スタイル追加 |
| Test | `src/__tests__/domain/entities/schedule.test.ts` | EBT関連テスト追加 |
| Test | `src/__tests__/domain/services/assignment-generator.test.ts` | EBTフィルタリングテスト追加 |
