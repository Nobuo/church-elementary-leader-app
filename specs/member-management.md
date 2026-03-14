# 仕様書: メンバー管理機能

## 機能概要
リーダー候補となる親を登録・編集・削除する機能。

## ドメインモデル

### エンティティ: Member
| 属性 | 型 | 説明 |
|------|-----|------|
| id | MemberId (UUID) | 一意識別子 |
| name | string | 氏名 |
| gender | Gender (MALE / FEMALE) | 性別 |
| language | Language (JAPANESE / ENGLISH / BOTH) | 対応言語 |
| gradeGroup | GradeGroup (LOWER / UPPER) | 担当区分（低学年/高学年） |
| memberType | MemberType (PARENT_COUPLE / PARENT_SINGLE / HELPER) | メンバー種別 |
| sameGenderOnly | boolean | 同性ペア制限（trueの場合、同性としか組まない） |
| spouseId | MemberId | null | 配偶者のメンバーID（PARENT_COUPLEの場合のみ） |
| availableDates | Date[] | null | 参加可能日（nullの場合は全日参加可能） |
| isActive | boolean | 有効/無効（離脱時にfalseにする） |

### 値オブジェクト
- **Gender**: MALE, FEMALE
- **Language**: JAPANESE, ENGLISH, BOTH
- **GradeGroup**: LOWER（1〜3年生担当）, UPPER（4〜6年生担当）
- **MemberType**:
  - PARENT_COUPLE: 夫婦で参加している親（配偶者の登録が必要）
  - PARENT_SINGLE: 片方の親のみ参加（配偶者の登録なし）
  - HELPER: ヘルパー（親ではないが協力してくれる方、夫婦制約なし）

## ユースケース

### UC-1: メンバー登録
- **入力**: 氏名、性別、言語、担当区分、メンバー種別、同性ペア制限、配偶者（PARENT_COUPLEの場合のみ）、参加可能日（任意）
- **正常系**: メンバーが登録される
- **異常系**:
  - 氏名が空 → エラー
  - PARENT_COUPLEなのに配偶者が未指定 → エラー
  - PARENT_SINGLE / HELPERなのに配偶者を指定 → エラー
  - 配偶者IDが存在しないメンバー → エラー
  - 配偶者が既に別の配偶者と紐付いている → エラー
- **副作用**: 配偶者を指定した場合、相手側のspouseIdも更新する

### UC-2: メンバー編集
- **入力**: メンバーID、更新する属性
- **正常系**: メンバー情報が更新される
- **注意**: 担当区分の変更は年度切り替え時に手動で行う

### UC-3: メンバー無効化（離脱）
- **入力**: メンバーID
- **正常系**: isActiveがfalseになる。メンバーは削除せず履歴を保持する
- **注意**: 生成済みスケジュールに含まれている場合は手動で調整が必要

### UC-4: メンバー一覧取得
- **出力**: メンバー一覧（有効メンバーのみ / 全メンバーのフィルタ可能）

## ビジネスルール
- 担当区分（gradeGroup）は子供の学年で決まる
- 両方の学年にまたがる親はどちらか一方を選んで登録する
- 配偶者関係は双方向（片方を設定すると相手も自動設定）、PARENT_COUPLEのみ
- PARENT_SINGLEとHELPERには夫婦回避制約は適用されない
- ヘルパーも親と同じく言語・性別・参加可能日の制約対象になる
- メンバーの削除は行わず、無効化（isActive = false）で対応する

## 受け入れ基準
- [ ] メンバーを全属性付きで登録できる
- [ ] 配偶者を相互に紐付けできる
- [ ] 配偶者の片方を設定すると相手側も自動で設定される
- [ ] メンバーを無効化できる
- [ ] 無効化されたメンバーは一覧のフィルタで除外できる
- [ ] 必須項目が未入力の場合エラーになる
