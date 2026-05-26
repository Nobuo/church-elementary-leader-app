# Manual Nonrecommended Candidates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 差し替え・空き枠割り当ての候補選択で、入力サポート解除時だけ非推奨候補も表示して選択可能にする。

**Architecture:** 候補 API に `includeNonRecommended=true` を追加し、既存の通常候補レスポンスを保ったまま非推奨候補を警告付きで返せるようにする。フロントエンドは差し替え/割り当て欄ごとのチェックボックスで再取得し、`<optgroup>` で通常候補と非推奨候補を分ける。

**Tech Stack:** TypeScript, Express, Vitest, plain browser JavaScript, CSS.

---

### Task 1: Candidate API

**Files:**
- Modify: `src/presentation/controllers/assignment-controller.ts`
- Test: `tests/integration/assignment-api.test.ts`

- [ ] **Step 1: Write the failing test**

Add integration cases under `describe('GET /api/assignments/candidates', ...)`:

```ts
it('returns nonrecommended unavailable-date candidates only when requested', async () => {
  const { members, schedules } = await seedStandardMembers(t);
  const unavailable = members.find((m) => m.name === 'Upper2')!;
  await t.request.put(`/api/members/${unavailable.id}`).send({
    name: 'Upper2',
    gender: 'MALE',
    language: 'JAPANESE',
    gradeGroup: 'UPPER',
    memberType: 'PARENT_SINGLE',
    sameGenderOnly: false,
    spouseId: null,
    availableDates: ['2099-01-01'],
  }).expect(200);

  const normal = await t.request
    .get(`/api/assignments/candidates?date=${schedules[0].date}&excludeIds=&role=UPPER`)
    .expect(200);
  expect(normal.body.some((c: { id: string }) => c.id === unavailable.id)).toBe(false);

  const expanded = await t.request
    .get(`/api/assignments/candidates?date=${schedules[0].date}&excludeIds=&role=UPPER&includeNonRecommended=true`)
    .expect(200);
  const candidate = expanded.body.find((c: { id: string }) => c.id === unavailable.id);
  expect(candidate).toBeDefined();
  expect(candidate.recommended).toBe(false);
  expect(candidate.warnings).toContain('unavailableDate');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/assignment-api.test.ts`

Expected: FAIL because `includeNonRecommended=true` does not yet include members filtered out by date availability.

- [ ] **Step 3: Implement minimal API support**

In `assignment-controller.ts`, parse:

```ts
const includeNonRecommended = req.query.includeNonRecommended === 'true';
```

Build candidates from active non-excluded members, compute exclusion warnings before filtering, and keep existing behavior when `includeNonRecommended` is false:

```ts
const candidates = activeMembers
  .filter((m) => !excludeIds.includes(m.id))
  .map((m) => {
    const exclusionWarnings: string[] = [];
    if (!m.isAvailableOn(date)) exclusionWarnings.push('unavailableDate');
    if (isEventDay && m.memberType === MemberType.HELPER) exclusionWarnings.push('helperOnEventDay');
    // existing EBT and role checks add ebtEnglish / gradeGroupMismatch
    return { member: m, exclusionWarnings };
  })
  .filter((entry) => includeNonRecommended || entry.exclusionWarnings.length === 0)
  .map((entry) => {
    const m = entry.member;
    const warnings = [...entry.exclusionWarnings];
    // append existing soft warnings
    return { id: m.id, name: m.name, notes: m.notes, count, warnings, recommended: warnings.length === 0, gradeGroup: m.gradeGroup, isCrossover };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/assignment-api.test.ts`

Expected: PASS.

### Task 2: Candidate Select UI

**Files:**
- Modify: `public/js/assignments.js`
- Modify: `public/js/i18n.js`
- Modify: `public/css/style.css`
- Test: `tests/presentation/assignment-candidate-select.test.ts`

- [ ] **Step 1: Write the failing DOM test**

Create `tests/presentation/assignment-candidate-select.test.ts` with a DOM-oriented test for the candidate select rendering helper.

```ts
import { describe, expect, it } from 'vitest';

describe('assignment candidate select rendering', () => {
  it('groups recommended and nonrecommended candidates separately', () => {
    const recommended = [{ id: 'm1', name: 'A', count: 1, recommended: true, warnings: [] }];
    const nonrecommended = [{ id: 'm2', name: 'B', count: 2, recommended: false, warnings: ['unavailableDate'] }];
    const html = renderCandidateOptionsForTest([...recommended, ...nonrecommended], '回', {
      recommended: '候補',
      nonRecommended: '非推奨',
    });

    expect(html).toContain('<optgroup label="候補">');
    expect(html).toContain('★ A (1回)');
    expect(html).toContain('<optgroup label="非推奨">');
    expect(html).toContain('⚠ B (2回)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/presentation/assignment-candidate-select.test.ts`

Expected: FAIL because the helper does not exist yet.

- [ ] **Step 3: Implement UI helper and controls**

In `assignments.js`, extract shared candidate picker setup for `startReplace` and `startAssign`. Add a checkbox that calls the candidates endpoint with `includeNonRecommended=true` when checked. Render options into two optgroups.

```js
function renderCandidateOptions(candidates, timesLabel) {
  const groups = [
    { label: t('candidateRecommended'), items: candidates.filter((c) => c.recommended) },
    { label: t('candidateNonRecommended'), items: candidates.filter((c) => !c.recommended) },
  ];
  return groups
    .filter((group) => group.items.length > 0)
    .map((group) => {
      const options = group.items.map((m) => {
        const prefix = m.recommended ? '★ ' : '⚠ ';
        const countLabel = m.count != null ? ` (${m.count}${timesLabel})` : '';
        return `<option value="${escapeHtml(m.id)}">${escapeHtml(`${prefix}${m.name}${countLabel}`)}</option>`;
      }).join('');
      return `<optgroup label="${escapeHtml(group.label)}">${options}</optgroup>`;
    }).join('');
}
```

Add i18n keys:

```js
candidateRecommended: '候補',
candidateNonRecommended: '非推奨',
disableInputAssist: '入力サポート解除',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/presentation/assignment-candidate-select.test.ts`

Expected: PASS.

### Task 3: Verification

**Files:**
- Existing app and tests only.

- [ ] **Step 1: Run targeted tests**

Run: `npm test -- tests/integration/assignment-api.test.ts tests/presentation/assignment-candidate-select.test.ts`

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run: `npm test`

Expected: PASS.
