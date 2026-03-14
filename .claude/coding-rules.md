# コーディング規約

## 言語
- TypeScript (strict mode)

## 命名規則
- ファイル名: kebab-case (`leader-assignment.ts`)
- クラス名: PascalCase (`LeaderAssignment`)
- 変数・関数名: camelCase (`assignLeader`)
- 定数: UPPER_SNAKE_CASE (`MAX_LEADERS_PER_GROUP`)
- インターフェース: PascalCase、`I` プレフィックス不要 (`LeaderRepository`)
- 型: PascalCase (`LeaderPair`)

## コードスタイル
- エクスポートは named export を優先
- 不変性を優先（`const`, `readonly`）
- `any` の使用禁止、必要な場合は `unknown` を使用
- エラーハンドリングは Result パターンまたは明示的な例外を使用

## テスト
- テストファイルは `tests/` 配下にソースと同じディレクトリ構造で配置
- テストファイル名: `<source-name>.test.ts`
- Arrange-Act-Assert パターンで記述

## ドメイン層ルール
- エンティティはIDで識別
- 値オブジェクトは不変
- ドメインロジックはドメイン層に集約
- インフラ層の関心事をドメイン層に持ち込まない
