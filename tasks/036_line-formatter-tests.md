# タスク 036: LINE フォーマッターテスト更新 ✅ 完了

## タスク概要
`line-message-formatter.test.ts` の既存テストを新仕様に合わせて更新し、新規テストケースを追加する。

## 依存タスク
- 033（splitType ドメイン）
- 035（フォーマッター書き換え）

## 対象ファイル
- `tests/domain/line-message-formatter.test.ts`

## 実装手順

### 1. 既存テストの更新

| 既存テスト | 変更内容 |
|-----------|---------|
| `includes event tag on event days (ja)` | 削除またはイベントタグが**表示されない**ことのテストに変更 |
| `includes split-class tag on split-class days (ja)` | `📚 1~3年と4~6年に分けてクラス` を含むことに変更 |
| `includes English tags when lang=en` | イベントタグ部分を削除、分級タグを新仕様に変更 |
| `does not include tags on normal days` | そのまま（合同日タグなし確認） |
| `displays 3 members for combined day` | `グループ 1:` が含まれ**ない**ことの確認を追加 |

### 2. `makeSchedule` ヘルパーの更新
- `splitType` パラメータを追加:
  ```typescript
  function makeSchedule(date, opts: { isEvent?, isSplitClass?, splitType? })
  ```

### 3. 新規テストケース追加
- 合同日: ラベルなしでメンバー名のみ（ja/en）
- 合同日: イベント日でもタグなし（ja/en）
- 標準分級日: 日付タグに説明文（ja/en）
- 標準分級日: 学年ラベル `1~3年:` / `4~6年:`（ja/en）
- ディスカッション分級日: 日付タグに説明文（ja/en）
- ディスカッション分級日: 学年ラベル `1~4年:` / `5~6年生:`（ja/en）
- フッター注意書きが含まれる（ja/en）
- `splitType=null` の分級日は standard として表示

## テスト方針
- Arrange-Act-Assert パターン
- 各パターンの出力テキストを `toContain` / `not.toContain` で検証

## 完了条件
- [ ] 全テストケースが実装されている
- [ ] `npm test` で全テストパス
- [ ] 既存テストの意図が新仕様に沿って更新されている
