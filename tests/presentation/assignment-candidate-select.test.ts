import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function loadAssignmentsScript() {
  const code = fs.readFileSync(path.resolve('public/js/assignments.js'), 'utf8');
  const noopElement = {
    addEventListener: () => {},
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    classList: { remove: () => {} },
    style: {},
  };
  const context = {
    document: {
      addEventListener: () => {},
      getElementById: () => noopElement,
      querySelectorAll: () => [],
    },
    navigator: { clipboard: { writeText: () => {} } },
    setTimeout: () => {},
    currentLang: 'ja',
    t: (key: string) => ({
      candidateRecommended: '候補',
      candidateNonRecommended: '非推奨',
    })[key] ?? key,
    escapeHtml: (value: unknown) => String(value),
    API: {},
  };
  vm.runInNewContext(code, context);
  return context as typeof context & {
    renderCandidateOptions: (
      candidates: Array<{ id: string; name: string; count: number; recommended: boolean; hiddenByDefault?: boolean; warnings: string[] }>,
      timesLabel: string,
    ) => string;
  };
}

describe('assignment candidate select rendering', () => {
  it('groups recommended and nonrecommended candidates separately', () => {
    const context = loadAssignmentsScript();
    const html = context.renderCandidateOptions([
      { id: 'm1', name: 'A', count: 1, recommended: true, warnings: [] },
      { id: 'm2', name: 'B', count: 2, recommended: false, hiddenByDefault: true, warnings: ['unavailableDate'] },
    ], '回');

    expect(html).toContain('<optgroup label="候補">');
    expect(html).toContain('★ A (1回)');
    expect(html).toContain('<optgroup label="非推奨">');
    expect(html).toContain('⚠ B (2回)');
  });
});
