# タスク 035: LINE テキストフォーマッター書き換え ✅ 完了

## タスク概要
`line-message-formatter.ts` を仕様に合わせて書き換える。イベントタグ削除、グループラベル削除/学年ラベル化、フッター追加。

## 依存タスク
- 033（splitType ドメイン — `Schedule.splitType` を参照するため）

## 対象ファイル
- `src/domain/services/line-message-formatter.ts`
- `src/presentation/i18n/ja.ts`
- `src/presentation/i18n/en.ts`

## 実装手順

### 1. イベントタグの削除
- `isEvent` によるタグ表示ロジックを削除
- イベント日でもタグなしで日付のみ表示

### 2. 合同日の表示変更
- `isSplitClass=false` の場合:
  - 「グループ N:」ラベルを出力しない
  - メンバー名のみインデント付きで表示
  ```
  4/5（日）
    メンバーA・メンバーB・メンバーC
  ```

### 3. 分級日のタグ・学年ラベル表示
- `isSplitClass=true` の場合:
  - `splitType`（`effectiveSplitType`）に応じた日付タグ:
    - `standard`: `📚 1~3年と4~6年に分けてクラス`
    - `senior_discussion`: `📚 1~4年のクラスと、5~6年生が心の話を話すクラス`
  - グループラベルを学年ベースに:
    - `standard`: `groupNumber=2` → `1~3年:`、`groupNumber=1` → `4~6年:`
    - `senior_discussion`: `groupNumber=2` → `1~4年:`、`groupNumber=1` → `5~6年生:`
  - 表示順: LOWER（低学年側）を先に表示

### 4. フッター追加
- テキスト末尾に注意書きを追加:
  ```
  ※ヘルパーの方で難しい日がありましたら教えてください。調整します。親の方はすみません、代わりの方をご自分で見つけていただき、変更したら教えてください。
  ```
- 英語版:
  ```
  * If any helper has a scheduling conflict, please let us know and we will adjust. For parents, please find a replacement on your own and let us know of any changes.
  ```

### 5. 英語版の対応
- 英語の分級タグ:
  - `standard`: `📚 Split: Grades 1-3 & Grades 4-6`
  - `senior_discussion`: `📚 Split: Grades 1-4 & Grades 5-6 (discussion)`
- 英語の学年ラベル:
  - `standard`: `Grades 1-3:` / `Grades 4-6:`
  - `senior_discussion`: `Grades 1-4:` / `Grades 5-6:`

### 6. 不要コードの削除
- `groupLabel` 定数を削除（使わなくなるため）
- イベントタグ関連の分岐を削除

## テスト方針
- 既存テストの更新（イベントタグのテストは削除/変更、分級タグのテスト更新）
- 新規テスト追加:
  - 合同日: ラベルなしでメンバー名のみ
  - 標準分級日: 学年ラベル表示
  - ディスカッション分級日: 学年ラベル表示
  - フッター表示
  - `splitType=null` フォールバック
  - 英語版の各パターン

## 完了条件
- [ ] 合同日に「グループ 1:」が表示されない
- [ ] 合同日に「🎉 イベント日」が表示されない
- [ ] 標準分級日に「📚 1~3年と4~6年に分けてクラス」と学年ラベルが表示される
- [ ] ディスカッション分級日に「📚 1~4年のクラスと、5~6年生が心の話を話すクラス」と学年ラベルが表示される
- [ ] フッター注意書きが末尾に表示される
- [ ] 英語モードで適切に表示される
- [ ] 全テストがパスする
