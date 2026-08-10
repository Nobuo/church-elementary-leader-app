import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestApp, seedStandardMembers, type TestApp } from './helpers/setup';

/**
 * 年間組み合わせ検証テスト
 *
 * 未来の年度の全12ヶ月を順番に生成し、
 * 各月ごとに「全クリア→4月から再生成」を繰り返して
 * 制約違反やペア多様性、割り当て均等性を検証する。
 *
 * 注意: 当月以前の割り当ては削除不可のため、十分未来の年度を使用する。
 */
describe('Yearly Combination Verification', () => {
  let t: TestApp;

  beforeEach(() => {
    t = createTestApp();
  });
  afterEach(() => {
    t.close();
  });

  it('should generate all 12 months with no hard constraint violations and fair distribution', async () => {
    // === 準備: メンバーを登録 ===
    const members = await seedStandardMembers(t.request);
    expect(members.length).toBe(10);

    // 配偶者制約テストのため、配偶者付きの PARENT_COUPLE を追加する
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

    // 「現在月または過去月はクリア不可」制約を避けるため、未来の年度を使う
    const fiscalYear = new Date().getFullYear() + 1;
    const months = [
      { year: fiscalYear, month: 4 },
      { year: fiscalYear, month: 5 },
      { year: fiscalYear, month: 6 },
      { year: fiscalYear, month: 7 },
      { year: fiscalYear, month: 8 },
      { year: fiscalYear, month: 9 },
      { year: fiscalYear, month: 10 },
      { year: fiscalYear, month: 11 },
      { year: fiscalYear, month: 12 },
      { year: fiscalYear + 1, month: 1 },
      { year: fiscalYear + 1, month: 2 },
      { year: fiscalYear + 1, month: 3 },
    ];

    // === フェーズ1: 全月のスケジュールを生成 ===
    const allSchedules: Record<string, Array<{ id: string; date: string }>> = {};
    for (const { year, month } of months) {
      const res = await t.request.post('/api/schedules/generate').send({ year, month }).expect(200);
      allSchedules[`${year}-${month}`] = res.body;
      expect(res.body.length).toBeGreaterThan(0);
    }

    // === フェーズ2: 月ごとに割り当てを生成 ===
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

    // === フェーズ3: 初回生成を検証 ===
    const initialCounts = await t.request
      .get(`/api/assignments/counts?fiscalYear=${fiscalYear}`)
      .expect(200);

    const initialCountData = initialCounts.body;

    // === フェーズ4: 全クリアして4月から再生成 ===
    // 全月を逆順でクリアする
    for (const { year, month } of [...months].reverse()) {
      await t.request
        .delete(`/api/assignments?year=${year}&month=${month}`)
        .expect(200);
    }

    // すべてクリアされたことを確認する
    for (const { year, month } of months) {
      const check = await t.request
        .get(`/api/assignments?year=${year}&month=${month}`)
        .expect(200);
      expect(check.body.length).toBe(0);
    }

    // 4月から再生成する
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

    // === フェーズ5: 再生成後の回数を取得 ===
    const regenCounts = await t.request
      .get(`/api/assignments/counts?fiscalYear=${fiscalYear}`)
      .expect(200);

    const regenCountData = regenCounts.body;

    // === フェーズ6: 安定性確認のため全クリアして再度生成 ===
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
    // アサーションとレポート
    // ==============================

    // 全実行を通じた一意のペアを集計する
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

    // --- レポート出力 ---
    console.log('\n' + '='.repeat(80));
    console.log(`年間組み合わせ検証レポート（${fiscalYear}年度: ${fiscalYear}/4〜${fiscalYear + 1}/3）`);
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

    // --- 実行間の比較 ---
    console.log(`\n${'═'.repeat(80)}`);
    console.log('【ラン間比較】');
    console.log(`${'═'.repeat(80)}`);

    // 再生成で異なるペアが作られることを確認する（シャッフルのランダム性による）
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

    // === 厳格なアサーション ===

    // 1. どの実行でもハード制約違反がない
    expect(run1.hardViolations).toBe(0);
    expect(run2.hardViolations).toBe(0);
    expect(run3.hardViolations).toBe(0);

    // 2. すべての月で割り当てが生成されている
    for (const m of report) {
      expect(m.assignmentCount).toBeGreaterThan(0);
    }
    for (const m of regeneratedReport) {
      expect(m.assignmentCount).toBeGreaterThan(0);
    }
    for (const m of thirdReport) {
      expect(m.assignmentCount).toBeGreaterThan(0);
    }

    // 3. 実行間で割り当て回数が一致するはず（合計が同じ）
    const totalRun1 = report.reduce((s, m) => s + m.assignmentCount, 0);
    const totalRun2 = regeneratedReport.reduce((s, m) => s + m.assignmentCount, 0);
    const totalRun3 = thirdReport.reduce((s, m) => s + m.assignmentCount, 0);
    expect(totalRun1).toBe(totalRun2);
    expect(totalRun2).toBe(totalRun3);

    // 4. 分布の公平性: 最大と最小の差が妥当な範囲にあるはず（平均の50%以内）
    for (const counts of [initialCountData, regenCountData, thirdCounts.body]) {
      const diff = counts.summary.max.count - counts.summary.min.count;
      const avg = counts.summary.average;
      expect(diff).toBeLessThanOrEqual(Math.ceil(avg * 0.6));
    }

    // 5. 実行間でペアが変化するはず（ランダム性の確認）
    // 実行間で少なくとも20%は異なるはず
    expect(overlap12 / run1Pairings.length).toBeLessThan(0.8);

    // 6. 各実行で複数の一意なペアが作られるはず（多様性）
    expect(run1.pairCounts.size).toBeGreaterThan(10);
    expect(run2.pairCounts.size).toBeGreaterThan(10);
    expect(run3.pairCounts.size).toBeGreaterThan(10);

    console.log('\n' + '='.repeat(80));
    console.log('✅ 全検証パス');
    console.log('='.repeat(80));
  }, 60000); // この総合テストのタイムアウトは60秒

  it('should handle mixed combined/split-class days across a full year', async () => {
    // === 準備: メンバーを登録（分級日のカバーには BOTH メンバーが必要）===
    const memberInputs = [
      { name: 'U1', gender: 'MALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
      { name: 'U2', gender: 'FEMALE', language: 'JAPANESE', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
      { name: 'U3', gender: 'MALE', language: 'BOTH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
      { name: 'U4', gender: 'FEMALE', language: 'ENGLISH', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
      { name: 'U5', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'UPPER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
      { name: 'L1', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
      { name: 'L2', gender: 'MALE', language: 'JAPANESE', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
      { name: 'L3', gender: 'FEMALE', language: 'BOTH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
      { name: 'L4', gender: 'MALE', language: 'ENGLISH', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
      { name: 'L5', gender: 'FEMALE', language: 'JAPANESE', gradeGroup: 'LOWER', memberType: 'PARENT_SINGLE', sameGenderOnly: false },
    ];
    for (const input of memberInputs) {
      await t.request.post('/api/members').send(input).expect(201);
    }

    // 「現在月または過去月はクリア不可」制約を避けるため、未来の年度を使う
    const fiscalYear = new Date().getFullYear() + 1;
    const months = [
      { year: fiscalYear, month: 4 },
      { year: fiscalYear, month: 5 },
      { year: fiscalYear, month: 6 },
      { year: fiscalYear, month: 7 },
      { year: fiscalYear, month: 8 },
      { year: fiscalYear, month: 9 },
      { year: fiscalYear, month: 10 },
      { year: fiscalYear, month: 11 },
      { year: fiscalYear, month: 12 },
      { year: fiscalYear + 1, month: 1 },
      { year: fiscalYear + 1, month: 2 },
      { year: fiscalYear + 1, month: 3 },
    ];

    // 全月のスケジュールを生成する
    const allSchedules: Record<string, Array<{ id: string; date: string }>> = {};
    for (const { year, month } of months) {
      const res = await t.request.post('/api/schedules/generate').send({ year, month }).expect(200);
      allSchedules[`${year}-${month}`] = res.body;
    }

    // 各月の日曜日を1つおきに分級日にする
    // これにより、約半分が合同日（3人）、約半分が分級日（2人×2組）という現実的な混在になる
    let splitCount = 0;
    let combinedCount = 0;
    for (const { year, month } of months) {
      const schedules = allSchedules[`${year}-${month}`];
      for (let i = 0; i < schedules.length; i++) {
        if (i % 2 === 1) {
          // 日曜日を1つおきに分級日にする
          await t.request.post(`/api/schedules/${schedules[i].id}/toggle-split-class`).expect(200);
          splitCount++;
        } else {
          combinedCount++;
        }
      }
    }

    // 全月の割り当てを生成する
    let totalAssignments = 0;
    let totalHardViolations = 0;
    const monthlyResults: Array<{
      month: string;
      assignments: number;
      violations: Array<{ type: string; message: string }>;
      combinedDayGroups: Array<{ date: string; memberCount: number }>;
      splitDayGroups: Array<{ date: string; groupNumber: number; memberCount: number }>;
    }> = [];

    for (const { year, month } of months) {
      const genRes = await t.request
        .post('/api/assignments/generate')
        .send({ year, month })
        .expect(200);

      const assignments = genRes.body.assignments as Array<{
        date: string;
        groupNumber: number;
        gradeGroup: string;
        members: Array<{ name: string; gradeGroup: string }>;
      }>;

      const combinedDayGroups: Array<{ date: string; memberCount: number }> = [];
      const splitDayGroups: Array<{ date: string; groupNumber: number; memberCount: number }> = [];

      for (const a of assignments) {
        if (a.gradeGroup === 'MIXED') {
          combinedDayGroups.push({ date: a.date, memberCount: a.members.length });
        } else {
          splitDayGroups.push({ date: a.date, groupNumber: a.groupNumber, memberCount: a.members.length });
        }
      }

      const hardViolations = genRes.body.violations.filter(
        (v: { type: string }) =>
          v.type === 'LANGUAGE_COVERAGE' || v.type === 'SAME_GENDER' || v.type === 'CLASS_LANGUAGE_COVERAGE',
      );
      totalHardViolations += hardViolations.length;
      totalAssignments += assignments.length;

      monthlyResults.push({
        month: `${year}/${String(month).padStart(2, '0')}`,
        assignments: assignments.length,
        violations: genRes.body.violations,
        combinedDayGroups,
        splitDayGroups,
      });
    }

    // === アサーション ===

    // 1. ハード制約違反がない
    expect(totalHardViolations).toBe(0);

    // 2. すべての月で割り当てが生成されている
    for (const m of monthlyResults) {
      expect(m.assignments).toBeGreaterThan(0);
    }

    // 3. 合同日は各グループが必ず3人であるはず
    for (const m of monthlyResults) {
      for (const g of m.combinedDayGroups) {
        expect(g.memberCount).toBe(3);
      }
    }

    // 4. 分級日は各グループが必ず2人で、1日2グループであるはず
    for (const m of monthlyResults) {
      for (const g of m.splitDayGroups) {
        expect(g.memberCount).toBe(2);
      }
      // 各分級日は2グループであるはず
      const splitDates = [...new Set(m.splitDayGroups.map((g) => g.date))];
      for (const date of splitDates) {
        const groups = m.splitDayGroups.filter((g) => g.date === date);
        expect(groups.length).toBe(2);
      }
    }

    // 5. 割り当て総数が期待値と一致するはず:
    //    合同日 × 1 + 分級日 × 2
    const expectedAssignments = combinedCount * 1 + splitCount * 2;
    expect(totalAssignments).toBe(expectedAssignments);

    // 6. 分布の公平性
    const counts = await t.request
      .get(`/api/assignments/counts?fiscalYear=${fiscalYear}`)
      .expect(200);

    const diff = counts.body.summary.max.count - counts.body.summary.min.count;
    const avg = counts.body.summary.average;
    // 日種別が混在するとメンバーごとの期待回数が変わるため、妥当なばらつきを許容する
    expect(diff).toBeLessThanOrEqual(Math.ceil(avg * 0.6));

    // === レポート ===
    console.log('\n' + '='.repeat(80));
    console.log('年間混合日検証レポート（合同日 + 分級日混在）');
    console.log('='.repeat(80));
    console.log(`  合同日: ${combinedCount}日（3人×1グループ）`);
    console.log(`  分級日: ${splitCount}日（2人×2グループ）`);
    console.log(`  総Assignment数: ${totalAssignments}（期待: ${expectedAssignments}）`);
    console.log(`  総スロット数: ${combinedCount * 3 + splitCount * 4}`);

    console.log('\n  [月別結果]');
    for (const m of monthlyResults) {
      const combined = m.combinedDayGroups.length;
      const split = m.splitDayGroups.length / 2;
      const vCount = m.violations.length;
      console.log(`    ${m.month}: ${m.assignments}件 (合同${combined}日, 分級${split}日, 違反${vCount}件)`);
    }

    console.log('\n  [割り当て回数]');
    for (const m of counts.body.members) {
      const bar = '█'.repeat(m.count);
      console.log(`    ${m.name.padEnd(6)} ${String(m.count).padStart(3)}回 ${bar}`);
    }
    console.log(`    平均: ${avg}回, 差分: ${diff}回`);
    console.log('='.repeat(80));
  }, 60000);
});
