# タスク041: EBT - UI & i18n

## タスク概要
スケジュール画面にEBTトグルボタンを追加し、i18nキーを追加する。

## 対象ファイル
- `public/js/schedules.js`
- `public/css/styles.css`
- `src/presentation/i18n/en.ts`
- `src/presentation/i18n/ja.ts`

## 実装手順

### 1. i18nキー追加
`en.ts`:
```typescript
ebt: 'EBT',
ebtDay: 'EBT Day',
```

`ja.ts`:
```typescript
ebt: 'EBT',
ebtDay: 'EBT日',
```

### 2. スケジュールUI
`public/js/schedules.js`:

1. スケジュールカードのボタン群にEBTトグルボタンを追加（イベントボタンの隣）:
   ```javascript
   <button class="btn-small btn-ebt ${s.isEbt ? 'active' : ''}"
     data-action="toggle-ebt" data-id="${escapeHtml(s.id)}"
     ${s.isExcluded ? 'disabled' : ''}>
     ${t('ebt')}
   </button>
   ```

2. イベントデリゲーションに `toggle-ebt` アクションを追加:
   ```javascript
   if (action === 'toggle-ebt') toggleScheduleEbt(id);
   ```

3. `toggleScheduleEbt` ハンドラ関数を追加（`toggleScheduleEvent` と同パターン）:
   ```javascript
   async function toggleScheduleEbt(id) {
     try {
       await API.post(`/api/schedules/${id}/toggle-ebt`);
       loadSchedules();
     } catch (e) {
       alert(e.message);
     }
   }
   ```

### 3. CSS
`public/css/styles.css`:

`.btn-ebt` スタイルを追加（`.btn-event` を参考に、異なる色で区別）:
```css
.btn-ebt.active {
  background-color: #8b5cf6; /* 紫系 */
  color: white;
}
```

## 依存タスク
- 038（APIエンドポイントが必要）

## テスト方針
- スケジュール画面にEBTボタンが表示されること
- EBTボタンクリックでトグルが動作すること
- 除外日ではEBTボタンが無効化されること
- i18nキーが日英両方に存在すること

## 完了条件
- スケジュール画面にEBTトグルボタンが表示される
- EBTのON/OFF切り替えが動作する
- 視覚的にEBT日を区別できる
- i18nキーが日英両方に追加されている
