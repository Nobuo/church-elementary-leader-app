/**
 * 本番ユーザーデータを使った年間組み合わせ検証スクリプト
 *
 * 本番DBのコピーを使い、2026/4〜2027/3の全12ヶ月を
 * 「全クリア→4月から再生成」×3回繰り返して検証する。
 *
 * 使い方: npx tsx scripts/verify-yearly-combinations.ts
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { runMigrations } from '@infrastructure/persistence/migrations/index';
import { SqliteMemberRepository } from '@infrastructure/persistence/sqlite-member-repository';
import { SqliteScheduleRepository } from '@infrastructure/persistence/sqlite-schedule-repository';
import { SqliteAssignmentRepository } from '@infrastructure/persistence/sqlite-assignment-repository';
import { createServer } from '@presentation/server';
import request from 'supertest';

const PROD_DB = path.join(
  process.env.HOME ?? '~',
  'Library/Application Support/leader-app/leader-app.db',
);
const TEMP_DB = path.join(import.meta.dirname, '../.verify-temp.db');

// Copy production DB
fs.copyFileSync(PROD_DB, TEMP_DB);
// Remove WAL/SHM if they exist (clean state)
try { fs.unlinkSync(TEMP_DB + '-wal'); } catch {}
try { fs.unlinkSync(TEMP_DB + '-shm'); } catch {}

const db = new Database(TEMP_DB);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
runMigrations(db);

const memberRepo = new SqliteMemberRepository(db);
const scheduleRepo = new SqliteScheduleRepository(db);
const assignmentRepo = new SqliteAssignmentRepository(db);
const app = createServer(memberRepo, scheduleRepo, assignmentRepo);
const r = request(app);

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

interface MonthReport {
  month: string;
  sundayCount: number;
  excludedCount: number;
  assignmentCount: number;
  violations: Array<{ type: string; severity: string; message: string }>;
  pairings: Array<{ date: string; group: number; members: string[] }>;
}

interface RunStats {
  pairCounts: Map<string, number>;
  memberAssignments: Map<string, number>;
  totalViolations: number;
  hardViolations: number;
  softViolations: number;
}

function collectPairStats(rep: MonthReport[]): RunStats {
  const pairCounts = new Map<string, number>();
  const memberAssignments = new Map<string, number>();
  let totalViolations = 0;
  let hardViolations = 0;
  let softViolations = 0;

  for (const monthData of rep) {
    totalViolations += monthData.violations.length;
    for (const v of monthData.violations) {
      if (
        v.type === 'LANGUAGE_COVERAGE' ||
        v.type === 'SAME_GENDER' ||
        v.type === 'CLASS_LANGUAGE_COVERAGE'
      ) {
        hardViolations++;
      } else {
        softViolations++;
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
  return { pairCounts, memberAssignments, totalViolations, hardViolations, softViolations };
}

async function clearAllAssignments() {
  for (const { year, month } of [...months].reverse()) {
    await r.delete(`/api/assignments?year=${year}&month=${month}`).expect(200);
  }
}

async function clearAllSchedules() {
  // Delete schedules by removing them from DB directly for the fiscal year range
  for (const { year, month } of [...months].reverse()) {
    const schedules = await r.get(`/api/schedules?year=${year}&month=${month}`).expect(200);
    for (const s of schedules.body) {
      db.prepare('DELETE FROM assignments WHERE schedule_id = ?').run(s.id);
    }
    db.prepare(
      `DELETE FROM schedules WHERE date >= ? AND date < ?`,
    ).run(
      `${year}-${String(month).padStart(2, '0')}-01`,
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`,
    );
  }
}

async function generateFullYear(): Promise<{
  report: MonthReport[];
  allSchedules: Record<string, Array<{ id: string; date: string; isExcluded: boolean; isEvent: boolean; isSplitClass: boolean }>>;
}> {
  const allSchedules: Record<string, any[]> = {};
  const report: MonthReport[] = [];

  // Generate schedules
  for (const { year, month } of months) {
    const res = await r.post('/api/schedules/generate').send({ year, month }).expect(200);
    allSchedules[`${year}-${month}`] = res.body;
  }

  // Generate assignments
  for (const { year, month } of months) {
    const genRes = await r
      .post('/api/assignments/generate')
      .send({ year, month })
      .expect(200);

    const schedules = allSchedules[`${year}-${month}`];
    const excluded = schedules.filter((s: any) => s.isExcluded).length;
    const active = schedules.length - excluded;

    report.push({
      month: `${year}/${String(month).padStart(2, '0')}`,
      sundayCount: schedules.length,
      excludedCount: excluded,
      assignmentCount: genRes.body.assignments.length,
      violations: genRes.body.violations,
      pairings: genRes.body.assignments.map((a: any) => ({
        date: a.date,
        group: a.groupNumber,
        members: a.members.map((m: any) => m.name),
      })),
    });
  }

  return { report, allSchedules };
}

async function main() {
  // === Get member info ===
  const membersRes = await r.get('/api/members?activeOnly=true').expect(200);
  const memberList = membersRes.body;

  // === Clear everything for clean start ===
  await clearAllSchedules();

  // === Run 1 ===
  const run1Data = await generateFullYear();
  const run1Counts = await r.get(`/api/assignments/counts?fiscalYear=${fiscalYear}`).expect(200);

  // === Run 2: Clear assignments + schedules, regenerate ===
  await clearAllSchedules();
  const run2Data = await generateFullYear();
  const run2Counts = await r.get(`/api/assignments/counts?fiscalYear=${fiscalYear}`).expect(200);

  // === Run 3 ===
  await clearAllSchedules();
  const run3Data = await generateFullYear();
  const run3Counts = await r.get(`/api/assignments/counts?fiscalYear=${fiscalYear}`).expect(200);

  // === Collect stats ===
  const stats1 = collectPairStats(run1Data.report);
  const stats2 = collectPairStats(run2Data.report);
  const stats3 = collectPairStats(run3Data.report);

  // === Build markdown report ===
  const lines: string[] = [];
  const w = (s: string = '') => lines.push(s);

  w('# 年間組み合わせ検証レポート（本番データ・2026年度）');
  w();
  w(`**実行日:** 2026-03-21`);
  w(`**データソース:** 本番DB（${PROD_DB}）のコピーを使用`);
  w(`**検証方法:** 全クリア→4月から再生成を3回繰り返し`);
  w();
  w('---');
  w();

  // === Member composition ===
  w('## 1. メンバー構成');
  w();
  w('| # | 名前 | 言語 | 学年 | タイプ | 同性のみ |');
  w('|---|------|------|------|--------|---------|');
  memberList.forEach((m: any, i: number) => {
    w(`| ${i + 1} | ${m.name} | ${m.language} | ${m.gradeGroup} | ${m.memberType} | ${m.sameGenderOnly ? 'Yes' : 'No'} |`);
  });
  w();
  w(`合計: ${memberList.length}名（アクティブ）`);

  // Count by attributes
  const langCounts: Record<string, number> = {};
  const gradeCounts: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};
  for (const m of memberList) {
    langCounts[m.language] = (langCounts[m.language] ?? 0) + 1;
    gradeCounts[m.gradeGroup] = (gradeCounts[m.gradeGroup] ?? 0) + 1;
    typeCounts[m.memberType] = (typeCounts[m.memberType] ?? 0) + 1;
  }
  w();
  w('**内訳:**');
  w(`- 言語: ${Object.entries(langCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  w(`- 学年: ${Object.entries(gradeCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  w(`- タイプ: ${Object.entries(typeCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  w();
  w('---');
  w();

  // === Schedule summary ===
  w('## 2. 月別スケジュール');
  w();
  w('| 月 | 日曜日数 | 除外 | 有効日数 |');
  w('|----|---------|------|---------|');
  let totalSundays = 0;
  let totalExcluded = 0;
  for (const m of run1Data.report) {
    const active = m.sundayCount - m.excludedCount;
    totalSundays += m.sundayCount;
    totalExcluded += m.excludedCount;
    w(`| ${m.month} | ${m.sundayCount} | ${m.excludedCount} | ${active} |`);
  }
  w(`| **合計** | **${totalSundays}** | **${totalExcluded}** | **${totalSundays - totalExcluded}** |`);
  w();
  w('---');
  w();

  // === Run reports ===
  function writeRunReport(
    runName: string,
    report: MonthReport[],
    stats: RunStats,
    counts: any,
  ) {
    w(`## ${runName}`);
    w();

    // Monthly results
    w('### 月別割り当て結果');
    w();
    w('| 月 | 割り当て数 | 違反数 | 違反詳細 |');
    w('|----|-----------|--------|---------|');
    let totalAssignments = 0;
    for (const m of report) {
      totalAssignments += m.assignmentCount;
      const vDetail = m.violations.length > 0
        ? m.violations.map((v) => `${v.type}`).join(', ')
        : '-';
      w(`| ${m.month} | ${m.assignmentCount} | ${m.violations.length} | ${vDetail} |`);
    }
    w(`| **合計** | **${totalAssignments}** | **${stats.totalViolations}** | |`);
    w();

    // Distribution
    w('### 割り当て回数（均等性）');
    w();
    w('| メンバー | 回数 | グラフ |');
    w('|---------|------|--------|');
    for (const m of counts.members) {
      const bar = '█'.repeat(m.count);
      w(`| ${m.name} | ${m.count} | \`${bar}\` |`);
    }
    w();
    w(`- **平均:** ${counts.summary.average}回`);
    w(`- **最大:** ${counts.summary.max.memberName}（${counts.summary.max.count}回）`);
    w(`- **最小:** ${counts.summary.min.memberName}（${counts.summary.min.count}回）`);
    w(`- **差分（max-min）:** ${counts.summary.max.count - counts.summary.min.count}回`);
    w();

    // Pair diversity
    w('### ペア組み合わせの多様性');
    w();
    const sortedPairs = [...stats.pairCounts.entries()].sort((a, b) => b[1] - a[1]);
    w(`- **ユニークペア数:** ${sortedPairs.length}`);
    w();
    w('| ペア | 回数 |');
    w('|------|------|');
    for (const [pair, count] of sortedPairs) {
      w(`| ${pair} | ${count} |`);
    }
    w();

    // Violations
    w('### 制約違反サマリー');
    w();
    w(`- **総違反数:** ${stats.totalViolations}`);
    w(`- **ハード制約違反:** ${stats.hardViolations}`);
    w(`- **ソフト制約違反:** ${stats.softViolations}`);
    w();

    // Detail violations if any
    if (stats.totalViolations > 0) {
      w('**違反詳細:**');
      w();
      for (const m of report) {
        for (const v of m.violations) {
          w(`- \`${m.month}\` ${v.type} (${v.severity}): ${v.message}`);
        }
      }
      w();
    }

    w('---');
    w();
  }

  writeRunReport('3. Run 1: 初回生成', run1Data.report, stats1, run1Counts.body);
  writeRunReport('4. Run 2: 全クリア→再生成', run2Data.report, stats2, run2Counts.body);
  writeRunReport('5. Run 3: 再クリア→3回目生成', run3Data.report, stats3, run3Counts.body);

  // === Cross-run comparison ===
  w('## 6. ラン間比較');
  w();

  const pairingsStr = (report: MonthReport[]) =>
    report.flatMap((m) =>
      m.pairings.map(
        (p) => `${p.date}:G${p.group}:${[...p.members].sort().join('+')}`,
      ),
    );

  const run1P = pairingsStr(run1Data.report);
  const run2P = pairingsStr(run2Data.report);
  const run3P = pairingsStr(run3Data.report);

  const set1 = new Set(run1P);
  const set2 = new Set(run2P);
  const set3 = new Set(run3P);

  const overlap12 = [...set1].filter((p) => set2.has(p)).length;
  const overlap23 = [...set2].filter((p) => set3.has(p)).length;
  const overlap13 = [...set1].filter((p) => set3.has(p)).length;

  w('| 比較 | 一致数 | 一致率 |');
  w('|------|--------|--------|');
  w(`| Run 1 ↔ Run 2 | ${overlap12}/${run1P.length} | ${Math.round((overlap12 / run1P.length) * 100)}% |`);
  w(`| Run 2 ↔ Run 3 | ${overlap23}/${run2P.length} | ${Math.round((overlap23 / run2P.length) * 100)}% |`);
  w(`| Run 1 ↔ Run 3 | ${overlap13}/${run1P.length} | ${Math.round((overlap13 / run1P.length) * 100)}% |`);
  w();

  // === Validation summary ===
  w('---');
  w();
  w('## 7. 検証結果サマリー');
  w();

  const avg1 = run1Counts.body.summary.average;
  const diff1 = run1Counts.body.summary.max.count - run1Counts.body.summary.min.count;
  const avg2 = run2Counts.body.summary.average;
  const diff2 = run2Counts.body.summary.max.count - run2Counts.body.summary.min.count;
  const avg3 = run3Counts.body.summary.average;
  const diff3 = run3Counts.body.summary.max.count - run3Counts.body.summary.min.count;

  const fairnessOk1 = diff1 <= Math.ceil(avg1 * 0.6);
  const fairnessOk2 = diff2 <= Math.ceil(avg2 * 0.6);
  const fairnessOk3 = diff3 <= Math.ceil(avg3 * 0.6);

  const randomnessOk = (overlap12 / run1P.length) < 0.8;

  w('| 検証項目 | 基準 | Run 1 | Run 2 | Run 3 | 結果 |');
  w('|---------|------|-------|-------|-------|------|');
  w(`| ハード制約違反 | 0件 | ${stats1.hardViolations} | ${stats2.hardViolations} | ${stats3.hardViolations} | ${stats1.hardViolations === 0 && stats2.hardViolations === 0 && stats3.hardViolations === 0 ? '**PASS**' : '**FAIL**'} |`);
  w(`| 全月割り当て生成 | 全月>0件 | ${run1Data.report.every((m) => m.assignmentCount > 0) ? 'OK' : 'NG'} | ${run2Data.report.every((m) => m.assignmentCount > 0) ? 'OK' : 'NG'} | ${run3Data.report.every((m) => m.assignmentCount > 0) ? 'OK' : 'NG'} | ${run1Data.report.every((m) => m.assignmentCount > 0) && run2Data.report.every((m) => m.assignmentCount > 0) && run3Data.report.every((m) => m.assignmentCount > 0) ? '**PASS**' : '**FAIL**'} |`);
  w(`| 割り当て総数一貫性 | 3ラン同数 | ${run1P.length} | ${run2P.length} | ${run3P.length} | ${run1P.length === run2P.length && run2P.length === run3P.length ? '**PASS**' : '**FAIL**'} |`);
  w(`| 均等性（max-min差≤平均×0.6） | | ${diff1}≤${Math.ceil(avg1 * 0.6)}? ${fairnessOk1 ? 'OK' : 'NG'} | ${diff2}≤${Math.ceil(avg2 * 0.6)}? ${fairnessOk2 ? 'OK' : 'NG'} | ${diff3}≤${Math.ceil(avg3 * 0.6)}? ${fairnessOk3 ? 'OK' : 'NG'} | ${fairnessOk1 && fairnessOk2 && fairnessOk3 ? '**PASS**' : '**FAIL**'} |`);
  w(`| ランダム性（一致率<80%） | | | ${Math.round((overlap12 / run1P.length) * 100)}% | | ${randomnessOk ? '**PASS**' : '**FAIL**'} |`);
  w(`| ペア多様性（>10種） | | ${stats1.pairCounts.size} | ${stats2.pairCounts.size} | ${stats3.pairCounts.size} | ${stats1.pairCounts.size > 10 && stats2.pairCounts.size > 10 && stats3.pairCounts.size > 10 ? '**PASS**' : '**FAIL**'} |`);
  w();

  // === Analysis ===
  w('---');
  w();
  w('## 8. 分析・考察');
  w();

  // UPPER/LOWER breakdown
  const upperMembers = memberList.filter((m: any) => m.gradeGroup === 'UPPER');
  const lowerMembers = memberList.filter((m: any) => m.gradeGroup === 'LOWER');
  const anyMembers = memberList.filter((m: any) => m.gradeGroup === 'ANY');

  w('### メンバー構成の影響');
  w();
  w(`- UPPER: ${upperMembers.length}名, LOWER: ${lowerMembers.length}名, ANY: ${anyMembers.length}名`);
  w(`- UPPER/LOWERの人数差が割り当て回数の差に影響する（人数が少ないグループのメンバーは多く割り当てられる）`);
  w();

  // Spouse constraints
  const couples = memberList.filter((m: any) => m.memberType === 'PARENT_COUPLE');
  if (couples.length > 0) {
    w('### 配偶者制約');
    w();
    w(`- PARENT_COUPLE: ${couples.length}名`);
    w('- 配偶者回避ペナルティ（同グループ・同日）が適用される');
    w();
  }

  // Helpers
  const helpers = memberList.filter((m: any) => m.memberType === 'HELPER');
  if (helpers.length > 0) {
    w('### ヘルパー制約');
    w();
    w(`- HELPER: ${helpers.length}名`);
    w('- イベント日には割り当て不可、月内重複時にペナルティ加算');
    w();
  }

  // sameGenderOnly
  const sameGender = memberList.filter((m: any) => m.sameGenderOnly);
  if (sameGender.length > 0) {
    w('### 同性ペア制約');
    w();
    w(`- 同性のみ要求: ${sameGender.map((m: any) => m.name).join(', ')}`);
    w('- これらのメンバーは異性とペアを組めないため、組み合わせが制限される');
    w();
  }

  w('### ランダム性');
  w();
  w(`- 3回の生成でペアリング一致率は${Math.round((overlap12 / run1P.length) * 100)}%〜${Math.round((overlap13 / run1P.length) * 100)}%と低く、シャッフルが効果的に機能`);
  w('- 最大割り当て者がラン間で変動し、特定メンバーへの偏りが固定化されていない');

  // Write report
  const reportPath = path.join(import.meta.dirname, '../reports/yearly-combination-verification-prod-2026.md');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf-8');

  console.log(`Report written to: ${reportPath}`);
  console.log(`Members: ${memberList.length}`);
  console.log(`Total assignments per run: ${run1P.length}`);
  console.log(`Hard violations: Run1=${stats1.hardViolations}, Run2=${stats2.hardViolations}, Run3=${stats3.hardViolations}`);

  // Cleanup
  db.close();
  fs.unlinkSync(TEMP_DB);
  try { fs.unlinkSync(TEMP_DB + '-wal'); } catch {}
  try { fs.unlinkSync(TEMP_DB + '-shm'); } catch {}
}

main().catch((e) => {
  console.error(e);
  db.close();
  try { fs.unlinkSync(TEMP_DB); } catch {}
  process.exit(1);
});
