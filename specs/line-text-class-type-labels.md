# 仕様書: LINE用テキスト — クラスタイプ別表示

## 機能概要

LINE共有用テキスト（`line-message-formatter.ts`）の出力フォーマットを変更する。

1. **イベント日タグの廃止**: 「🎉 イベント日」の表示を削除
2. **グループラベルの廃止**: 合同日の「グループ 1:」を削除し、メンバー名のみ表示
3. **分級日の学年ラベル表示**: 分級タイプに応じた日付タグと学年ベースのグループラベルを表示
4. **分級タイプの導入**: Schedule エンティティに `splitType` を追加し、2種類の分級を区別
5. **フッター追加**: 注意書きテキストを末尾に追加

## 背景

1ヶ月のクラスは以下のパターンで回る：

| 週 | クラスタイプ | 備考 |
|----|-------------|------|
| 第1週 | 全体クラス（合同） | 3人、ラベル不要 |
| 第2週 | 分級: 1~3年 / 4~6年 | 標準分級 |
| 第3週 | 全体クラス（合同） | 3人、ラベル不要 |
| 第4週 | 分級: 1~4年 / 5~6年 | 5~6年は心の話・ディスカッション |
| 第5週 | 全体クラス（合同） | 5週目がある月のみ |

現状のフォーマッターは `isEvent` / `isSplitClass` のブール値のみで、分級の種類を区別できない。

---

## ユースケース

### UC-1: 合同日のLINEテキスト出力（正常系）

- **入力**: `isSplitClass=false` のスケジュール（`isEvent` の値は無関係）
- **出力**:
```
4/5（日）
  メンバーA・メンバーB・メンバーC
```
- **ルール**:
  - 日付タグなし（イベントかどうかに関わらず）
  - グループラベルなし（「グループ 1:」を表示しない）
  - メンバー名のみインデント付きで表示

### UC-2: 標準分級日（1~3年 / 4~6年）のLINEテキスト出力（正常系）

- **入力**: `isSplitClass=true`, `splitType='standard'` のスケジュール
- **出力**:
```
4/12（日） 📚 1~3年と4~6年に分けてクラス
  1~3年: メンバーD・メンバーE
  4~6年: メンバーF・メンバーG
```
- **ルール**:
  - 日付タグに 📚 と分級タイプの説明文を表示
  - グループラベルは学年ベース（「1~3年:」「4~6年:」）
  - `groupNumber=2`（LOWER） → 「1~3年」、`groupNumber=1`（UPPER） → 「4~6年」

### UC-3: ディスカッション分級日（1~4年 / 5~6年）のLINEテキスト出力（正常系）

- **入力**: `isSplitClass=true`, `splitType='senior_discussion'` のスケジュール
- **出力**:
```
4/26（日） 📚 1~4年のクラスと、5~6年生が心の話を話すクラス
  1~4年: メンバーK・メンバーL
  5~6年生: メンバーM・メンバーN
```
- **ルール**:
  - 日付タグに 📚 と分級タイプの説明文を表示
  - グループラベル: `groupNumber=2`（LOWER） → 「1~4年」、`groupNumber=1`（UPPER） → 「5~6年生」

### UC-4: フッターの表示（正常系）

- **出力**: テキスト末尾に以下を追加
```

※ヘルパーの方で難しい日がありましたら教えてください。調整します。親の方はすみません、代わりの方をご自分で見つけていただき、変更したら教えてください。
```

### UC-5: 英語表示（正常系）

- **入力**: `lang='en'`
- **出力例**:
```
📅 2026/4 Leader Schedule

4/5 (Sun)
  Member A & Member B & Member C

4/12 (Sun) 📚 Split: Grades 1-3 & Grades 4-6
  Grades 1-3: Member D & Member E
  Grades 4-6: Member F & Member G
```
- フッターの英語版も用意する

### UC-6: 除外日・割り当てなしの日（異常系）

- `isExcluded=true` のスケジュール → 表示しない（現行通り）
- 割り当てが存在しないスケジュール → 表示しない（現行通り）

### UC-7: splitType 未設定の分級日（後方互換）

- **入力**: `isSplitClass=true`, `splitType=null`（マイグレーション直後の既存データ）
- **出力**: `splitType='standard'` と同じ表示にフォールバック

---

## ドメインモデル変更

### Schedule エンティティ

```typescript
// 分級タイプの値オブジェクト
type SplitType = 'standard' | 'senior_discussion';

interface ScheduleProps {
  // ... 既存フィールド
  readonly splitType: SplitType | null;  // 追加
}
```

- `splitType` は `isSplitClass=true` の場合のみ意味を持つ
- `isSplitClass=false` の場合、`splitType` は `null`
- `splitType=null` かつ `isSplitClass=true` の場合は `'standard'` として扱う

### メソッド追加

```typescript
class Schedule {
  setSplitType(type: SplitType | null): Schedule;
}
```

---

## データベース変更

### マイグレーション

```sql
ALTER TABLE schedules ADD COLUMN split_type TEXT DEFAULT NULL;
```

- `split_type` カラム: `TEXT` 型、`NULL` 許容
- 値: `'standard'` | `'senior_discussion'` | `NULL`
- 既存データは `NULL`（フォールバックで `'standard'` 扱い）

---

## 入出力の定義

### line-message-formatter の入力（変更なし）

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| assignments | Assignment[] | 割り当てデータ |
| schedules | Schedule[] | スケジュールデータ（`splitType` 追加） |
| members | Map<MemberId, Member> | メンバーマスタ |
| year | number | 対象年 |
| month | number | 対象月 |
| lang | 'ja' \| 'en' | 出力言語 |

### line-message-formatter の出力

テキスト文字列。フォーマットは上記ユースケース参照。

---

## 制約・ビジネスルール

1. `isEvent` フラグはLINEテキストに影響しない（UIやアルゴリズムでは引き続き使用）
2. `splitType` は `isSplitClass=true` の場合のみ有効。`isSplitClass=false` なら無視
3. 分級日のグループ番号と学年ラベルの対応:
   - `groupNumber=1`（UPPER）→ 高学年側ラベル
   - `groupNumber=2`（LOWER）→ 低学年側ラベル
4. フッターテキストは常に表示
5. 合同日は割り当てが1グループ（3人）のみ前提

---

## UI変更（スケジュール設定画面）

- 分級チェック時に `splitType` を選択できるUIを追加（ドロップダウンまたはラジオボタン）
  - 「1~3年 / 4~6年」（standard）
  - 「1~4年 / 5~6年」（senior_discussion）
- 分級OFF時は `splitType` 選択を非表示にする

---

## API変更

### POST /schedules/:id/toggle-split-class

既存エンドポイント。変更なし（トグルのみ）。

### POST /schedules/:id/split-type（新規）

- **リクエスト**: `{ "splitType": "standard" | "senior_discussion" }`
- **レスポンス**: 更新後の Schedule
- **制約**: `isSplitClass=true` の場合のみ受け付ける

---

## 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `domain/entities/schedule.ts` | `splitType` プロパティ追加、`setSplitType()` メソッド追加 |
| `domain/services/line-message-formatter.ts` | フォーマット全面変更（主対象） |
| `infrastructure/persistence/sqlite-schedule-repository.ts` | `split_type` カラムの読み書き |
| `infrastructure/persistence/migrations/` | 新規マイグレーション追加 |
| `presentation/controllers/schedule-controller.ts` | split-type エンドポイント追加 |
| `presentation/i18n/ja.ts` / `en.ts` | 分級タイプラベル・フッターテキスト追加 |
| `public/js/schedules.js`（または該当UI） | 分級タイプ選択UIの追加 |
| `specs/export-and-sharing.md` | LINE用テキスト仕様の更新 |

---

## 受け入れ基準

### LINE テキスト出力

- [ ] 合同日: 「グループ 1:」ラベルなしでメンバー名のみ表示される
- [ ] 合同日: 「🎉 イベント日」のタグが表示されない
- [ ] 標準分級日: 「📚 1~3年と4~6年に分けてクラス」タグが表示される
- [ ] 標準分級日: 学年ラベル「1~3年:」「4~6年:」で表示される
- [ ] ディスカッション分級日: 「📚 1~4年のクラスと、5~6年生が心の話を話すクラス」タグが表示される
- [ ] ディスカッション分級日: 学年ラベル「1~4年:」「5~6年生:」で表示される
- [ ] フッター注意書きが末尾に表示される
- [ ] 英語モードで適切な英語ラベルが表示される
- [ ] `splitType=null` の分級日は `standard` としてフォールバック表示される

### データモデル・永続化

- [ ] `splitType` がDBに保存・復元される
- [ ] 既存データ（`split_type=NULL`）でエラーが発生しない

### UI（スケジュール設定）

- [ ] 分級ON時に分級タイプを選択できる
- [ ] 分級OFF時に分級タイプ選択が非表示になる

### 既存機能への影響なし

- [ ] `isEvent` フラグは割り当てアルゴリズム・UIでは引き続き動作する
- [ ] CSV エクスポートに影響がない（別途対応が必要なら別仕様）
