# 仕様書: 自動生成の増分モード & 部分クリア時のバリデーション改善

## 機能概要

自動生成ボタンの動作を「全削除→全再生成」から「未割り当て週のみ生成（確定済み週は保持）」に変更する。
また、一部の週がクリアされた状態での担当回数グラフの判定ロジックを修正し、不正確な警告を解消する。

## 背景

現状の問題:

1. **自動生成が全破壊的**: `generateMonthlyAssignments()` は最初に `assignmentRepo.deleteByScheduleIds(scheduleIds)` で月内全割り当てを削除してから再生成する（`generate-assignments.ts:67`）。1週だけクリアして再生成したくても、手動調整済みの他の週がすべて失われる。
2. **グラフの誤警告**: 担当回数グラフ（`assignments.js:219`）は `avg * 1.5` を閾値にして「多すぎ」判定している。1週だけクリアすると、クリアされた週の4スロットが消えるが、他の週はそのままなので、平均が下がり残りのメンバーが相対的に「多すぎ」と誤判定される。

## ドメインモデルへの影響

### 変更対象

| 対象 | 変更内容 |
|------|---------|
| `generate-assignments.ts` | 確定済みスケジュールをスキップし、空きスケジュールのみ生成 |
| `assignment-generator.ts` | 確定済み割り当てを月内既存カウントに含める |
| `constraint-checker.ts` | `checkExcessiveCount` に「未割り当て週数」を考慮させる（変更なしでも可、後述） |
| `assignments.js` | グラフの「多すぎ/少なすぎ」判定を未割り当て週を考慮して修正 |

### 新規追加なし

エンティティ・値オブジェクト・リポジトリの変更は不要。

## ユースケース

### UC-1: 正常系 — 全週が空の状態で自動生成（従来動作と同等）

**前提条件:**
- 2026年4月のスケジュールが4週分存在（除外日なし）
- 全週の割り当てが空

**操作:**
1. 自動生成ボタンをクリック

**結果:**
- 4週すべてに割り当てが生成される（従来と同じ動作）
- 担当回数グラフに過剰警告なし

### UC-2: 正常系 — 1週クリア後に自動生成（増分生成）

**前提条件:**
- 2026年4月の4週すべてに割り当て済み
- 第2週（4/12）の割り当てをクリア（日単位クリア）

**操作:**
1. 自動生成ボタンをクリック

**結果:**
- 第1週（4/5）、第3週（4/19）、第4週（4/26）の割り当ては**そのまま保持**
- 第2週（4/12）のみ新たに生成される
- 確定済み3週の担当回数を考慮した上で、第2週の割り当てが公平に決まる
- 制約違反は全4週分をチェックして返す

### UC-3: 正常系 — 複数週クリア後に自動生成

**前提条件:**
- 2026年4月の4週すべてに割り当て済み
- 第1週と第3週をクリア

**操作:**
1. 自動生成ボタンをクリック

**結果:**
- 第2週と第4週は保持
- 第1週と第3週が新たに生成される
- 保持された週のメンバーの担当回数を考慮して生成

### UC-4: 正常系 — 1週クリア時のグラフ表示

**前提条件:**
- 2026年4月の4週すべてに割り当て済み（メンバーA: 1回、メンバーB: 1回、…）
- 第2週の割り当てをクリア

**結果:**
- グラフは実際の割り当て回数を正しく表示（クリアされた週の分は減算済み）
- 未割り当て週がある状態では「多すぎ」警告を出さない
- 代わりに「未割り当ての週があります」のような情報メッセージを表示（任意）

### UC-5: 正常系 — 全週クリア後に自動生成

**前提条件:**
- 月一括クリアで全週が空

**操作:**
1. 自動生成ボタンをクリック

**結果:**
- UC-1と同じ動作（全週に割り当て生成）

### UC-6: 異常系 — 全週に割り当て済みの状態で自動生成

**前提条件:**
- 2026年4月の4週すべてに割り当て済み（空き週なし）

**操作:**
1. 自動生成ボタンをクリック

**結果:**
- 空き週がないため生成対象がない
- 「すべての週にすでに割り当てがあります。クリアしてから再生成してください。」というメッセージを表示
- 既存の割り当てには一切変更を加えない

## 入出力

### API変更

既存の `POST /api/assignments/generate` を変更する。リクエスト・レスポンスの型は変更なし。

**リクエスト:** `{ year: number, month: number }`

**動作変更:**
- 従来: 月内の全割り当てを削除 → 全週を再生成
- 変更後: 割り当てが空の週のみ特定 → その週だけ生成（確定済み週は保持）

**レスポンス:** `{ assignments: AssignmentDto[], violations: ConstraintViolation[] }`
- `assignments` には**新規生成分のみ**を返す（フロントエンドでの表示更新のため、全週分のリロードはフロントエンド側で行う）
- `violations` には全週分のチェック結果を含む

**新レスポンス（空き週がない場合）:**
- HTTP 200で `{ assignments: [], violations: [], message: "allWeeksAssigned" }` を返す

### フロントエンド変更

自動生成のコールバックで、成功後に `loadAssignments()` を呼んで全データをリロードする（現行と同じ）。

## 制約・ビジネスルール

### 増分生成時の制約適用

1. **確定済み週のメンバーを月内重複カウントに含める**: 確定済み週に割り当てられたメンバーは、空き週の生成時に「月内で既に1回担当済み」としてカウントされる（重複ペナルティ100点が適用される）。
2. **確定済み週の担当回数を年間カウントに含める**: 年度内の累計カウントに確定済み週の分も含めた上で、均等性スコアを計算する。
3. **確定済み週のペア情報も考慮**: 過去ペアカウントに確定済み週を含める（ペア多様性を維持）。
4. **制約チェックは全週対象**: 生成後のバリデーション（excessiveCount等）は、確定済み週＋新規生成週の全体に対して行う。

### グラフ判定の修正ルール

担当回数グラフ（フロントエンド `renderAssignmentCounts`）の「多すぎ/少なすぎ」判定:

**現状の判定:**
```javascript
// 平均の1.5倍超で「多すぎ」、0.5倍未満で「少なすぎ」
if (avg > 0 && m.count > avg * 1.5) → too-many
if (avg > 0 && m.count < avg * 0.5 && m.count > 0) → too-few
```

**問題:** この判定は年度全体の平均に対する相対比較のため、未割り当て週の有無に関係なく数値自体は正しい。ただし、未割り当て週が存在する場合は「まだ確定していない回が残っている」ので、現時点の偏りは最終的に解消される可能性がある。

**修正方針:**
フロントエンドのグラフ判定を変更するのではなく、**APIレスポンスに「未割り当て週数」を追加**し、フロントエンドが未割り当て週があるかどうかを知れるようにする。

**具体的な変更:**

1. `GET /api/assignments/counts` のレスポンスに `unassignedWeeks` フィールドを追加:
```json
{
  "fiscalYear": 2026,
  "summary": { ... },
  "members": [ ... ],
  "unassignedWeeks": 1
}
```

2. フロントエンドの判定を修正:
```javascript
// 未割り当て週がある場合は「多すぎ/少なすぎ」ラベルを表示しない
if (data.unassignedWeeks > 0) {
  // ラベルなし（まだ最終結果ではないため判定不可）
} else {
  // 従来通りの判定
  if (avg > 0 && m.count > avg * 1.5) → too-many
  if (avg > 0 && m.count < avg * 0.5 && m.count > 0) → too-few
}
```

3. 未割り当て週がある場合、グラフセクションに情報メッセージを表示:
```
「未割り当ての週が1件あります」
```

## 実装箇所

### バックエンド

| ファイル | 変更内容 |
|---------|---------|
| `src/application/use-cases/generate-assignments.ts` | `generateMonthlyAssignments` を増分モードに変更（下記詳細） |
| `src/application/use-cases/get-assignment-counts.ts` | レスポンスに `unassignedWeeks` を追加 |
| `src/presentation/controllers/assignment-controller.ts` | counts APIの `unassignedWeeks` をレスポンスに含める |

### フロントエンド

| ファイル | 変更内容 |
|---------|---------|
| `public/js/assignments.js` | `renderAssignmentCounts` の判定修正、未割り当て週メッセージ表示、全週割り当て済み時のメッセージ |
| `public/js/i18n.js` | 翻訳キー追加 |
| `src/presentation/i18n/ja.ts` | 翻訳キー追加 |
| `src/presentation/i18n/en.ts` | 翻訳キー追加 |

### コード変更イメージ

#### `generateMonthlyAssignments` の増分化

```typescript
// generate-assignments.ts

export function generateMonthlyAssignments(
  year: number,
  month: number,
  memberRepo: MemberRepository,
  scheduleRepo: ScheduleRepository,
  assignmentRepo: AssignmentRepository,
): Result<GenerateAssignmentsResult> {
  const schedules = scheduleRepo.findByMonth(year, month);
  if (schedules.length === 0) {
    return err('No schedules found for this month. Generate schedules first.');
  }

  const members = memberRepo.findAll(true);
  if (members.length < 4) {
    return err('Not enough active members (need at least 4)');
  }

  const allScheduleIds = schedules.map((s) => s.id);

  // --- 増分モード: 空きスケジュールのみ特定 ---
  const existingMonthAssignments = assignmentRepo.findByScheduleIds(allScheduleIds);
  const assignedScheduleIds = new Set(existingMonthAssignments.map((a) => a.scheduleId));
  const unassignedSchedules = schedules.filter(
    (s) => !s.isExcluded && !assignedScheduleIds.has(s.id)
  );

  // 空きスケジュールがない場合は何もしない
  if (unassignedSchedules.length === 0) {
    return ok({ assignments: [], violations: [], message: 'allWeeksAssigned' });
  }

  // --- 既存の削除処理を除去 ---
  // （従来の assignmentRepo.deleteByScheduleIds(scheduleIds) を削除）

  const fiscalYear = getFiscalYear(new Date(year, month - 1, 1));

  // 年度内の他月の割り当て + 当月の確定済み割り当てからカウントを構築
  const allFiscalYearSchedules = scheduleRepo.findByFiscalYear(fiscalYear);
  const otherScheduleIds = allFiscalYearSchedules
    .filter((s) => !allScheduleIds.includes(s.id))
    .map((s) => s.id);
  const otherMonthAssignments = assignmentRepo.findByScheduleIds(otherScheduleIds);

  // 確定済み当月割り当て + 他月割り当て = existingAssignmentsAll
  const existingAssignmentsAll = [...otherMonthAssignments, ...existingMonthAssignments];

  const countMap = new Map<MemberId, number>();
  for (const m of members) countMap.set(m.id, 0);
  for (const a of existingAssignmentsAll) {
    for (const mid of a.memberIds) {
      countMap.set(mid, (countMap.get(mid) ?? 0) + 1);
    }
  }

  // 空きスケジュールのみを対象に生成
  const { assignments, violations } = generateAlgorithm(
    unassignedSchedules,  // ← 全スケジュールではなく空きのみ
    members,
    existingAssignmentsAll,  // ← 確定済み含む全既存割り当て
    countMap,
  );

  // 以降のバリデーション・保存は従来通り
  // ...
}
```

#### `get-assignment-counts.ts` への未割り当て週数追加

```typescript
export interface AssignmentCountsResult {
  fiscalYear: number;
  summary: AssignmentCountSummary;
  members: AssignmentCountDto[];
  unassignedWeeks: number;  // 追加
}

export function getAssignmentCounts(
  fiscalYear: number,
  memberRepo: MemberRepository,
  assignmentRepo: AssignmentRepository,
  scheduleRepo: ScheduleRepository,  // 追加
): AssignmentCountsResult {
  // ... 既存のカウントロジック ...

  // 未割り当て週数を計算
  const allSchedules = scheduleRepo.findByFiscalYear(fiscalYear);
  const activeSchedules = allSchedules.filter((s) => !s.isExcluded);
  const activeScheduleIds = activeSchedules.map((s) => s.id);
  const allAssignments = assignmentRepo.findByScheduleIds(activeScheduleIds);
  const assignedScheduleIds = new Set(allAssignments.map((a) => a.scheduleId));
  const unassignedWeeks = activeSchedules.filter(
    (s) => !assignedScheduleIds.has(s.id)
  ).length;

  return {
    fiscalYear,
    summary: { ... },
    members: memberCounts,
    unassignedWeeks,
  };
}
```

#### フロントエンド: グラフ判定修正

```javascript
function renderAssignmentCounts(data) {
  // ... 既存コード ...

  // 未割り当て週がある場合の情報表示
  const infoEl = document.getElementById('counts-info');
  if (data.unassignedWeeks > 0) {
    infoEl.textContent = t('unassignedWeeksInfo', { count: data.unassignedWeeks });
    infoEl.style.display = 'block';
  } else {
    infoEl.style.display = 'none';
  }

  document.getElementById('counts-list').innerHTML = data.members.map(m => {
    const pct = (m.count / maxCount * 100).toFixed(0);
    let barClass = 'count-bar';
    let labelHtml = '';
    // 未割り当て週がない場合のみ偏り判定を行う
    if (data.unassignedWeeks === 0) {
      if (avg > 0 && m.count > avg * 1.5) {
        barClass += ' too-many';
        labelHtml = `<span class="count-label">${t('tooMany')}</span>`;
      } else if (avg > 0 && m.count < avg * 0.5 && m.count > 0) {
        barClass += ' too-few';
        labelHtml = `<span class="count-label too-few">${t('tooFew')}</span>`;
      }
    }
    // ...
  }).join('');
}
```

## 翻訳キー

| キー | 日本語 | 英語 |
|------|--------|------|
| `allWeeksAssigned` | `すべての週にすでに割り当てがあります。クリアしてから再生成してください。` | `All weeks already have assignments. Clear some first to regenerate.` |
| `unassignedWeeksInfo` | `未割り当ての週が{count}件あります` | `{count} week(s) have no assignments yet` |

## 受け入れ基準

### 増分生成

- [ ] 全週が空の状態で自動生成 → 全週に割り当てが生成される（従来と同等の動作）
- [ ] 1週クリア後に自動生成 → クリアした週のみに割り当てが生成され、他の週は変更なし
- [ ] 複数週クリア後に自動生成 → クリアした週のみに割り当てが生成される
- [ ] 全週に割り当て済みの状態で自動生成 → 何も変更されず、メッセージが表示される
- [ ] 確定済み週のメンバーの担当回数が、空き週の生成時に考慮される
- [ ] 確定済み週のペア情報が、空き週の生成時に考慮される
- [ ] 月内重複チェックが確定済み週のメンバーを含めて正しく動作する
- [ ] 制約違反チェックが全週（確定済み＋新規生成）に対して行われる

### グラフ判定修正

- [ ] 全週に割り当て済みの場合、従来通り「多すぎ/少なすぎ」が表示される
- [ ] 未割り当て週がある場合、「多すぎ/少なすぎ」ラベルが表示されない
- [ ] 未割り当て週がある場合、「未割り当ての週がN件あります」メッセージが表示される
- [ ] 1週クリアしただけで他のメンバーが赤く表示されない

### 既存機能への影響なし

- [ ] 月一括クリア後の全再生成が正しく動作する
- [ ] 手動調整（メンバー差し替え）が従来通り動作する
- [ ] 日単位クリアが従来通り動作する
- [ ] 既存テストが全て通る
- [ ] 増分生成のユニットテストが追加されている
