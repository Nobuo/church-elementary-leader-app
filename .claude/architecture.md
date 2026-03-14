# アーキテクチャ

## 設計方針
- DDD（ドメイン駆動設計）
- クリーンアーキテクチャ
- 依存性の方向は外側から内側へ（ドメイン層に依存が集中しない）

## レイヤー構成

```
src/
├── domain/          # ドメイン層: エンティティ、値オブジェクト、ドメインサービス
│   ├── entities/
│   ├── value-objects/
│   ├── services/
│   └── repositories/  # リポジトリインターフェース
│
├── application/     # アプリケーション層: ユースケース
│   ├── use-cases/
│   └── dto/
│
├── infrastructure/  # インフラ層: 永続化、外部サービス
│   ├── persistence/   # SQLite実装
│   └── config/
│
└── presentation/    # プレゼンテーション層: UI
    ├── views/
    └── controllers/
```

## 依存ルール
- `domain` → 他のどの層にも依存しない
- `application` → `domain` のみに依存
- `infrastructure` → `domain`, `application` に依存
- `presentation` → `application` に依存

## 永続層
- SQLiteを使用するが、リポジトリパターンで抽象化し、取り替え可能にする
- リポジトリインターフェースは `domain/repositories/` に定義
- SQLite実装は `infrastructure/persistence/` に配置
