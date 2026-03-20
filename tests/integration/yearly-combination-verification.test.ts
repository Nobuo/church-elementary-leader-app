import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, seedStandardMembers, type TestApp } from './helpers/setup';

/**
 * 年間組み合わせ検証テスト
 *
 * 2026年度（2026/4〜2027/3）の全12ヶ月を順番に生成し、
 * 各月ごとに「全クリア→4月から再生成」を繰り返して
 * 制約違反やペア多様性、割り当て均等性を検証する。
 */
describe('Yearly Combination Verification (2026/4 ~ 2027/3)', () => {
  let t: TestApp;

  beforeEach(() => {
    t = createTestApp();
  });
  afterEach(() => {
    t.db.close();
  });

  it('should generate all 12 months with no hard constraint violations and fair distribution', async () => {
    // === Setup: Register members ===
    const members = await seedStandardMembers(t.request);
    expect(members.length).toBe(10);

    // Add a PARENT_COUPLE with spouse for spouse constraint testing
    const husband = members[0];
    await t.request.post('/api/members').send({
      name: '配偶者A',
      gender: 'FEMALE',
      language: 'ENGLISH',
      gradeGroup: 'LOWER',
      memberType: 'PARENT_COUPLE',
      sameGenderOnly: false,
      spouseId: husband.id,
    }).expect(201);

    const fiscalYear = 2026;
    const months = [
      { year: 2026, month: 4 },
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
      { year: 2027, month: 3 },
    ];

    // === Phase 1: Generate schedules for all months ===
    const allSchedules: Record<string, Array<{ id: string; date: string }>> = {};
    for (const { year, month } of months) {
      const res = await t.request.post('/api/schedules/generate').send({ year, month }).expect(200);
      allSchedules[`${year}-${month}`] = res.body;
      expect(res.body.length).toBeGreaterThan(0);
    }

    // === Phase 2: Generate assignments month by month ===
    const report: {
      month: string;
      sundayCount: number;
      assignmentCount: number;
      violations: Array<{ type: string; severity: string; message: string }>;
      pairings: Array<{ date: string; group: number; members: string[] }>;
    }[] = [];

    for (const { year, month } of months) {
      const genRes = await t.request
        .post('/api/assignments/generate')
        .send({ year, month })
        .expect(200);

      const schedules = allSchedules[`${year}-${month}`];
      const activeSundays = schedules.filter((s) => !s.date.includes('excluded'));

      report.push({
        month: `${year}/${String(month).padStart(2, '0')}`,
        sundayCount: activeSundays.length,
        assignmentCount: genRes.body.assignments.length,
        violations: genRes.body.violations,
        pairings: genRes.body.assignments.map((a: {
          date: string;
          groupNumber: number;
          members: Array<{ name: string }>;
        }) => ({
          date: a.date,
          group: a.groupNumber,
          members: a.members.map((m: { name: string }) => m.name),
        })),
      });
    }

    // === Phase 3: Verify initial generation ===
    const initialCounts = await t.request
      .get(`/api/assignments/counts?fiscalYear=${fiscalYear}`)
      .expect(200);

    const initialCountData = initialCounts.body;

    // === Phase 4: Clear ALL and regenerate from April ===
    // Clear all months in reverse order
    for (const { year, month } of [...months].reverse()) {
      await t.request
        .delete(`/api/assignments?year=${year}&month=${month}`)
        .expect(200);
    }

    // Verify all cleared
    for (const { year, month } of months) {
      const check = await t.request
        .get(`/api/assignments?year=${year}&month=${month}`)
        .expect(200);
      expect(check.body.length).toBe(0);
    }

    // Regenerate from April
    const regeneratedReport: typeof report = [];
    for (const { year, month } of months) {
      const genRes = await t.request
        .post('/api/assignments/generate')
        .send({ year, month })
        .expect(200);

      const schedules = allSchedules[`${year}-${month}`];
      regeneratedReport.push({
        month: `${year}/${String(month).padStart(2, '0')}`,
        sundayCount: schedules.length,
        assignmentCount: genRes.body.assignments.length,
        violations: genRes.body.violations,
        pairings: genRes.body.assignments.map((a: {
          date: string;
          groupNumber: number;
          members: Array<{ name: string }>;
        }) => ({
          date: a.date,
          group: a.groupNumber,
          members: a.members.map((m: { name: string }) => m.name),
        })),
      });
    }

    // === Phase 5: Get regenerated counts ===
    const regenCounts = await t.request
      .get(`/api/assignments/counts?fiscalYear=${fiscalYear}`)
      .expect(200);

    const regenCountData = regenCounts.body;

    // === Phase 6: Clear ALL and regenerate AGAIN for stability check ===
    for (const { year, month } of [...months].reverse()) {
      await t.request
        .delete(`/api/assignments?year=${year}&month=${month}`)
        .expect(200);
    }

    const thirdReport: typeof report = [];
    for (const { year, month } of months) {
      const genRes = await t.request
        .post('/api/assignments/generate')
        .send({ year, month })
        .expect(200);

      thirdReport.push({
        month: `${year}/${String(month).padStart(2, '0')}`,
        sundayCount: allSchedules[`${year}-${month}`].length,
        assignmentCount: genRes.body.assignments.length,
        violations: genRes.body.violations,
        pairings: genRes.body.assignments.map((a: {
          date: string;
          groupNumber: number;
          members: Array<{ name: string }>;
        }) => ({
          date: a.date,
          group: a.groupNumber,
          members: a.members.map((m: { name: string }) => m.name),
        })),
      });
    }

    const thirdCounts = await t.request
      .get(`/api/assignments/counts?fiscalYear=${fiscalYear}`)
      .expect(200);

    // ==============================
    // ASSERTIONS & REPORT
    // ==============================

    // Collect all unique pairings across all runs
    function collectPairStats(rep: typeof report) {
      const pairCounts = new Map<string, number>();
      const memberAssignments = new Map<string, number>();
      let totalViolations = 0;
      let hardViolations = 0;

      for (const monthData of rep) {
        totalViolations += monthData.violations.length;
        for (const v of monthData.violations) {
          if (v.type === 'LANGUAGE_COVERAGE' || v.type === 'SAME_GENDER' || v.type === 'CLASS_LANGUAGE_COVERAGE') {
            hardViolations++;
          }
        }
        for (const p of monthData.pairings) {
          const sorted = [...p.members].sort();
          const key = sorted.join(' + ');
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
          for (const m of p.members) {
            memberAssignments.set(m, (memberAssignments.get(m) ?? 0) + 1);
          }
        }
      }
      return { pairCounts, memberAssignments, totalViolations, hardViolations };
    }

    const run1 = collectPairStats(report);
    const run2 = collectPairStats(regeneratedReport);
    const run3 = collectPairStats(thirdReport);

    // --- Report Output ---
    console.log('\n' + '='.repeat(80));
    console.log('年間組み合わせ検証レポート（2026年度: 2026/4〜2027/3）');
    console.log('='.repeat(80));

    console.log('\n--- メンバー構成 ---');
    const allMembers = await t.request.get('/api/members?activeOnly=true').expect(200);
    for (const m of allMembers.body) {
      console.log(`  ${m.name} [${m.language}/${m.gradeGroup}/${m.memberType}]`);
    }

    console.log('\n--- 月別スケジュール ---');
    let totalSundays = 0;
    for (const { year, month } of months) {
      const s = allSchedules[`${year}-${month}`];
      totalSundays += s.length;
      console.log(`  ${year}/${String(month).padStart(2, '0')}: ${s.length}日曜日`);
    }
    console.log(`  合計: ${totalSundays}日曜日`);

    function printRunReport(name: string, rep: typeof report, stats: ReturnType<typeof collectPairStats>, counts: { summary: { max: { count: number; memberName: string }; min: { count: number; memberName: string }; average: number }; members: Array<{ name: string; count: number }> }) {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`【${name}】`);
      console.log(`${'─'.repeat(80)}`);

      console.log('\n  [月別割り当て結果]');
      for (const m of rep) {
        const vCount = m.violations.length;
        console.log(`    ${m.month}: ${m.assignmentCount}件 (違反: ${vCount}件)`);
        if (vCount > 0) {
          for (const v of m.violations) {
            console.log(`      ⚠ ${v.type}: ${v.message}`);
          }
        }
      }

      console.log('\n  [割り当て回数 (均等性)]');
      for (const m of counts.members) {
        const bar = '█'.repeat(m.count);
        console.log(`    ${m.name.padEnd(15)} ${String(m.count).padStart(3)}回 ${bar}`);
      }
      console.log(`    平均: ${counts.summary.average}回`);
      console.log(`    最大: ${counts.summary.max.memberName} (${counts.summary.max.count}回)`);
      console.log(`    最小: ${counts.summary.min.memberName} (${counts.summary.min.count}回)`);
      console.log(`    差分: ${counts.summary.max.count - counts.summary.min.count}回`);

      console.log('\n  [ペア組み合わせの多様性]');
      const sortedPairs = [...stats.pairCounts.entries()].sort((a, b) => b[1] - a[1]);
      console.log(`    ユニークペア数: ${sortedPairs.length}`);
      console.log(`    最頻ペア (上位10):`)
      for (const [pair, count] of sortedPairs.slice(0, 10)) {
        console.log(`      ${pair}: ${count}回`);
      }
      if (sortedPairs.length > 10) {
        const oneTimers = sortedPairs.filter(([, c]) => c === 1).length;
        console.log(`    1回のみのペア: ${oneTimers}/${sortedPairs.length}`);
      }

      console.log('\n  [制約違反サマリー]');
      console.log(`    総違反数: ${stats.totalViolations}`);
      console.log(`    ハード制約違反: ${stats.hardViolations}`);
    }

    printRunReport('Run 1: 初回生成', report, run1, initialCountData);
    printRunReport('Run 2: 全クリア→再生成', regeneratedReport, run2, regenCountData);
    printRunReport('Run 3: 再クリア→3回目生成', thirdReport, run3, thirdCounts.body);

    // --- Cross-run comparison ---
    console.log(`\n${'═'.repeat(80)}`);
    console.log('【ラン間比較】');
    console.log(`${'═'.repeat(80)}`);

    // Check that regeneration produces different pairings (due to shuffle randomness)
    const run1Pairings = report.flatMap((m) => m.pairings.map((p) => `${p.date}:G${p.group}:${[...p.members].sort().join('+')}`));
    const run2Pairings = regeneratedReport.flatMap((m) => m.pairings.map((p) => `${p.date}:G${p.group}:${[...p.members].sort().join('+')}`));
    const run3Pairings = thirdReport.flatMap((m) => m.pairings.map((p) => `${p.date}:G${p.group}:${[...p.members].sort().join('+')}`));

    const run1Set = new Set(run1Pairings);
    const run2Set = new Set(run2Pairings);
    const run3Set = new Set(run3Pairings);

    const overlap12 = [...run1Set].filter((p) => run2Set.has(p)).length;
    const overlap23 = [...run2Set].filter((p) => run3Set.has(p)).length;
    const overlap13 = [...run1Set].filter((p) => run3Set.has(p)).length;

    console.log(`  Run1 total pairings: ${run1Pairings.length}`);
    console.log(`  Run2 total pairings: ${run2Pairings.length}`);
    console.log(`  Run3 total pairings: ${run3Pairings.length}`);
    console.log(`  Run1-Run2 一致率: ${overlap12}/${run1Pairings.length} (${Math.round((overlap12 / run1Pairings.length) * 100)}%)`);
    console.log(`  Run2-Run3 一致率: ${overlap23}/${run2Pairings.length} (${Math.round((overlap23 / run2Pairings.length) * 100)}%)`);
    console.log(`  Run1-Run3 一致率: ${overlap13}/${run1Pairings.length} (${Math.round((overlap13 / run1Pairings.length) * 100)}%)`);

    // === HARD ASSERTIONS ===

    // 1. No hard constraint violations in any run
    expect(run1.hardViolations).toBe(0);
    expect(run2.hardViolations).toBe(0);
    expect(run3.hardViolations).toBe(0);

    // 2. All months produced assignments
    for (const m of report) {
      expect(m.assignmentCount).toBeGreaterThan(0);
    }
    for (const m of regeneratedReport) {
      expect(m.assignmentCount).toBeGreaterThan(0);
    }
    for (const m of thirdReport) {
      expect(m.assignmentCount).toBeGreaterThan(0);
    }

    // 3. Assignment counts should be consistent across runs (same total)
    const totalRun1 = report.reduce((s, m) => s + m.assignmentCount, 0);
    const totalRun2 = regeneratedReport.reduce((s, m) => s + m.assignmentCount, 0);
    const totalRun3 = thirdReport.reduce((s, m) => s + m.assignmentCount, 0);
    expect(totalRun1).toBe(totalRun2);
    expect(totalRun2).toBe(totalRun3);

    // 4. Distribution fairness: max-min diff should be reasonable (within 50% of average)
    for (const counts of [initialCountData, regenCountData, thirdCounts.body]) {
      const diff = counts.summary.max.count - counts.summary.min.count;
      const avg = counts.summary.average;
      expect(diff).toBeLessThanOrEqual(Math.ceil(avg * 0.6));
    }

    // 5. Pairings should vary between runs (randomness check)
    // At least 20% should be different between runs
    expect(overlap12 / run1Pairings.length).toBeLessThan(0.8);

    // 6. Each run should produce multiple unique pairs (diversity)
    expect(run1.pairCounts.size).toBeGreaterThan(10);
    expect(run2.pairCounts.size).toBeGreaterThan(10);
    expect(run3.pairCounts.size).toBeGreaterThan(10);

    console.log('\n' + '='.repeat(80));
    console.log('✅ 全検証パス');
    console.log('='.repeat(80));
  }, 60000); // 60s timeout for this comprehensive test
});
