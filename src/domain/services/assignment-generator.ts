import { MemberId, ScheduleId } from '@shared/types';
import { Member } from '@domain/entities/member';
import { Schedule } from '@domain/entities/schedule';
import { Assignment } from '@domain/entities/assignment';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';
import { Language, coversJapanese, coversEnglish } from '@domain/value-objects/language';
import {
  ConstraintViolation,
  ViolationType,
  Severity,
} from '@domain/value-objects/constraint-violation';
import { checkSameGenderGroup } from '@domain/services/constraint-checker';

interface GenerationContext {
  schedules: Schedule[];
  members: Member[];
  existingAssignments: Assignment[];
  assignmentCounts: Map<MemberId, number>;
  scheduleIdToDate: Map<ScheduleId, string>;
}

interface GenerationResult {
  assignments: Assignment[];
  violations: ConstraintViolation[];
}

function pairKey(a: MemberId, b: MemberId): string {
  return [a, b].sort().join('-');
}

/** グループ内の2人組すべてについて pastPairCounts を更新する */
function updatePairCounts(memberIds: MemberId[], pastPairCounts: Map<string, number>): void {
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const pk = pairKey(memberIds[i], memberIds[j]);
      pastPairCounts.set(pk, (pastPairCounts.get(pk) ?? 0) + 1);
    }
  }
}

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

interface ClassContext {
  group1Members: [Member, Member];
}

/**
 * グループ割り当ての候補ペアを採点する（分級日: 1グループ2名）。
 * スコアが低いほどよい候補。
 */
function scorePair(
  member1: Member,
  member2: Member,
  context: GenerationContext,
  monthAssignments: Assignment[],
  dayAssignments: Assignment[],
  pastPairCounts: Map<string, number>,
  classContext?: ClassContext,
  isSplitClassDay?: boolean,
  poolMinCount?: number,
): { score: number; violations: ConstraintViolation[] } {
  let score = 0;
  const violations: ConstraintViolation[] = [];

  // ハード制約: 言語バランス。各グループは日本語と英語の両方をカバーする必要がある
  const hasJapanese = coversJapanese(member1.language) || coversJapanese(member2.language);
  const hasEnglish = coversEnglish(member1.language) || coversEnglish(member2.language);
  if (!hasJapanese || !hasEnglish) {
    score += 100000; // 実質的に不可能
  }

  // ハード制約: クラス別言語カバー（分級日のみ）
  if (classContext) {
    const allFour = [...classContext.group1Members, member1, member2];
    const bothCount = allFour.filter((m) => m.language === Language.BOTH).length;
    if (bothCount < 2) {
      score += 100000;
      violations.push({
        type: ViolationType.CLASS_LANGUAGE_COVERAGE,
        severity: Severity.WARNING,
        memberIds: allFour.map((m) => m.id),
        message: `Not enough bilingual leaders for split-class day (required: 2, actual: ${bothCount})`,
        messageKey: 'violations.classLanguageCoverage',
        messageParams: { count: String(bothCount) },
      });
    }
  }

  // BOTH温存 / 分級日の最適化
  if (!isSplitClassDay) {
    // 合同日: BOTH温存（非BOTHを優先）
    for (const m of [member1, member2]) {
      if (m.language === Language.BOTH) {
        score += 3;
      }
    }
  } else if (!classContext) {
    // 分級日グループ1: ちょうど1名のBOTHを狙う
    const bothInPair = [member1, member2].filter((m) => m.language === Language.BOTH).length;
    if (bothInPair === 0) score += 5; // G1はBOTHを1人出すべき
    if (bothInPair === 2) score += 3; // BOTH+BOTHは過剰消費
  }
  // 分級日グループ2: BOTH優遇なし（ハード制約のみ）

  // ハード制約: 同性制約（多数派ルール）
  const genderViolation = checkSameGenderGroup([member1, member2]);
  if (genderViolation) {
    score += 100000;
    violations.push(genderViolation);
  }

  // 参加可能日優先: 日付制約があるメンバーにボーナスを与える
  for (const m of [member1, member2]) {
    if (m.availableDates && m.availableDates.length > 0) {
      score -= 30;
    }
  }

  // ソフト制約: 月内重複（当月すでに割り当て済みのメンバー1人につきペナルティ100）
  for (const m of [member1, member2]) {
    const alreadyAssigned = monthAssignments.some((a) => a.containsMember(m.id));
    if (alreadyAssigned) {
      score += 100;
    }
  }

  // 均等分布（プール内の最小割り当て回数との差1回につき50）
  const counts = context.assignmentCounts;
  const minCount = poolMinCount ?? Math.min(...context.members.filter((m) => m.isActive).map((m) => counts.get(m.id) ?? 0));
  for (const m of [member1, member2]) {
    const memberCount = counts.get(m.id) ?? 0;
    score += (memberCount - minCount) * 50;
  }

  // ソフト制約: 配偶者回避（ペナルティ30）。PARENT_COUPLE のみ対象
  if (
    member1.memberType === MemberType.PARENT_COUPLE &&
    member2.memberType === MemberType.PARENT_COUPLE &&
    member1.spouseId === member2.id
  ) {
    score += 30;
  }

  // 同じ日の別グループに配偶者がいる場合（ペナルティ30）。PARENT_COUPLE のみ対象
  for (const dayAssignment of dayAssignments) {
    for (const m of [member1, member2]) {
      if (m.memberType !== MemberType.PARENT_COUPLE) continue;
      if (m.spouseId && dayAssignment.containsMember(m.spouseId)) {
        score += 30;
      }
    }
  }

  // ソフト制約: HELPER 後回し。スコアが近い場合は PARENT メンバーを優先する
  // 当月すでに割り当て済みの場合だけ適用する（HELPER を完全には除外しない）
  for (const m of [member1, member2]) {
    if (m.memberType === MemberType.HELPER) {
      const alreadyAssigned = monthAssignments.some((a) => a.containsMember(m.id));
      if (alreadyAssigned) {
        score += 5;
      }
    }
  }

  // ペアの多様性（過去の同ペア1回につきペナルティ10）
  const pk = pairKey(member1.id, member2.id);
  const pairCount = pastPairCounts.get(pk) ?? 0;
  score += pairCount * 10;

  return { score, violations };
}

/**
 * 合同日の割り当て候補3人組を採点する（3名、1グループ）。
 * スコアが低いほどよい候補。
 */
function scoreTrio(
  members: [Member, Member, Member],
  context: GenerationContext,
  monthAssignments: Assignment[],
  pastPairCounts: Map<string, number>,
  poolMinCount: number,
): { score: number; violations: ConstraintViolation[] } {
  let score = 0;
  const violations: ConstraintViolation[] = [];

  // ハード制約: 言語バランス。JP と EN の両方をカバーする必要がある
  const hasJapanese = members.some((m) => coversJapanese(m.language));
  const hasEnglish = members.some((m) => coversEnglish(m.language));
  if (!hasJapanese || !hasEnglish) {
    score += 100000;
  }

  // ハード制約: 同性制約（多数派ルール）
  const genderViolation = checkSameGenderGroup(members);
  if (genderViolation) {
    score += 100000;
    violations.push(genderViolation);
  }

  // BOTH温存: BOTH メンバー1名につき +3（合同日のペアロジックと同じ）
  for (const m of members) {
    if (m.language === Language.BOTH) {
      score += 3;
    }
  }

  // 参加可能日優先
  for (const m of members) {
    if (m.availableDates && m.availableDates.length > 0) {
      score -= 30;
    }
  }

  // ソフト制約: 月内重複
  for (const m of members) {
    const alreadyAssigned = monthAssignments.some((a) => a.containsMember(m.id));
    if (alreadyAssigned) {
      score += 100;
    }
  }

  // 均等分布
  const counts = context.assignmentCounts;
  for (const m of members) {
    const memberCount = counts.get(m.id) ?? 0;
    score += (memberCount - poolMinCount) * 50;
  }

  // ソフト制約: 配偶者回避。3人組内の全ペアを確認する
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const mi = members[i];
      const mj = members[j];
      if (
        mi.memberType === MemberType.PARENT_COUPLE &&
        mj.memberType === MemberType.PARENT_COUPLE &&
        mi.spouseId === mj.id
      ) {
        score += 30;
      }
    }
  }

  // ソフト制約: HELPER 後回し
  for (const m of members) {
    if (m.memberType === MemberType.HELPER) {
      const alreadyAssigned = monthAssignments.some((a) => a.containsMember(m.id));
      if (alreadyAssigned) {
        score += 5;
      }
    }
  }

  // ペアの多様性。3人組内の3ペアすべてを確認する
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const pk = pairKey(members[i].id, members[j].id);
      const pairCount = pastPairCounts.get(pk) ?? 0;
      score += pairCount * 10;
    }
  }

  return { score, violations };
}

interface TrioResult {
  members: [Member, Member, Member];
  violations: ConstraintViolation[];
}

function pickBestTrio(
  candidates: Member[],
  context: GenerationContext,
  monthAssignments: Assignment[],
  pastPairCounts: Map<string, number>,
): TrioResult | null {
  if (candidates.length < 3) return null;

  const counts = context.assignmentCounts;
  const poolMinCount = Math.min(...candidates.map((m) => counts.get(m.id) ?? 0));

  const shuffled = shuffle(candidates);
  let bestScore = Infinity;
  let bestTrio: TrioResult | null = null;

  for (let i = 0; i < shuffled.length; i++) {
    for (let j = i + 1; j < shuffled.length; j++) {
      for (let k = j + 1; k < shuffled.length; k++) {
        const trio: [Member, Member, Member] = [shuffled[i], shuffled[j], shuffled[k]];
        const { score, violations } = scoreTrio(
          trio,
          context,
          monthAssignments,
          pastPairCounts,
          poolMinCount,
        );

        if (score < bestScore || (score === bestScore && Math.random() < 0.5)) {
          bestScore = score;
          bestTrio = { members: trio, violations };
        }
      }
    }
  }

  return bestTrio;
}

export function generateAssignments(
  schedules: Schedule[],
  allMembers: Member[],
  existingAssignmentsAll: Assignment[],
  assignmentCounts: Map<MemberId, number>,
): GenerationResult {
  const activeMembers = allMembers.filter((m) => m.isActive);
  const allAssignments: Assignment[] = [];
  const allViolations: ConstraintViolation[] = [];

  // スケジュールIDから日付へのマップを作る
  const scheduleIdToDate = new Map<ScheduleId, string>();
  for (const s of schedules) {
    scheduleIdToDate.set(s.id, s.date);
  }
  // 既存の割り当てから過去ペア回数を作る（2人または3人に対応）
  const pastPairCounts = new Map<string, number>();
  for (const a of existingAssignmentsAll) {
    updatePairCounts([...a.memberIds], pastPairCounts);
  }

  // 生成中に更新できるよう回数をコピーする
  const counts = new Map(assignmentCounts);
  for (const m of activeMembers) {
    if (!counts.has(m.id)) counts.set(m.id, 0);
  }

  const activeDates = shuffle(schedules.filter((s) => !s.isExcluded));

  const monthAssignments: Assignment[] = [];

  const context: GenerationContext = {
    schedules,
    members: activeMembers,
    existingAssignments: existingAssignmentsAll,
    assignmentCounts: counts,
    scheduleIdToDate,
  };

  for (const schedule of activeDates) {
    const dateStr = schedule.date;
    const dayAssignments: Assignment[] = [];

    // この日付に参加可能なメンバーを取得する
    // イベント日では HELPER メンバーを除外する
    // EBT日では英語のみメンバーを除外する（EBT日にしか参加できない場合を除く）
    const available = activeMembers
      .filter((m) => m.isAvailableOn(dateStr))
      .filter((m) => !schedule.isEvent || m.memberType !== MemberType.HELPER)
      .filter((m) => {
        if (!schedule.isEbt) return true;
        if (m.language !== Language.ENGLISH) return true;
        // 例外: EBT以外の有効日がない場合は候補に残す
        if (m.availableDates && m.availableDates.length > 0) {
          const hasNonEbtDate = activeDates.some(
            (s) => s.date !== dateStr && !s.isEbt && m.isAvailableOn(s.date),
          );
          if (!hasNonEbtDate) return true;
        }
        return false;
      });

    if (!schedule.isSplitClass) {
      // === 合同日: 3人×1グループ ===
      // 全メンバーを1つのプールに入れる（UPPER/LOWER の区別なし）
      if (available.length < 3) {
        allViolations.push({
          type: ViolationType.UNEQUAL_COUNT,
          severity: Severity.WARNING,
          memberIds: [],
          message: `Not enough members for combined day ${dateStr}: ${available.length} available`,
          messageKey: 'violations.notEnoughMembersCombined',
          messageParams: { date: dateStr, count: String(available.length) },
        });
        continue;
      }

      const trioResult = pickBestTrio(
        available,
        context,
        monthAssignments,
        pastPairCounts,
      );

      if (trioResult) {
        const assignment = Assignment.create(schedule.id, 1, [
          trioResult.members[0].id,
          trioResult.members[1].id,
          trioResult.members[2].id,
        ]);
        dayAssignments.push(assignment);
        monthAssignments.push(assignment);
        allAssignments.push(assignment);
        allViolations.push(...trioResult.violations);

        for (const m of trioResult.members) {
          counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
        }
        updatePairCounts(trioResult.members.map((m) => m.id), pastPairCounts);
      } else {
        allViolations.push({
          type: ViolationType.UNEQUAL_COUNT,
          severity: Severity.WARNING,
          memberIds: [],
          message: `Could not form group for combined day ${dateStr}`,
          messageKey: 'violations.cannotFormGroup',
          messageParams: { group: '1', date: dateStr },
        });
      }
    } else {
      // === 分級日: 2人×2グループ（既存ロジック）===
      const upperBase = available.filter((m) => m.gradeGroup === GradeGroup.UPPER || m.gradeGroup === GradeGroup.ANY);
      const lowerBase = available.filter((m) => m.gradeGroup === GradeGroup.LOWER || m.gradeGroup === GradeGroup.ANY);

      // 分級日では、バイリンガル（BOTH）メンバーが学年境界をまたげるようにする
      let upperMembers = upperBase;
      let lowerMembers = lowerBase;
      const upperBothCount = upperBase.filter((m) => m.language === Language.BOTH).length;
      const lowerBothCount = lowerBase.filter((m) => m.language === Language.BOTH).length;
      if (lowerBothCount < 1 && upperBothCount > 2) {
        lowerMembers = [
          ...lowerBase,
          ...upperBase.filter((m) => m.language === Language.BOTH),
        ];
      }
      if (upperBothCount < 1 && lowerBothCount > 2) {
        upperMembers = [
          ...upperBase,
          ...lowerBase.filter((m) => m.language === Language.BOTH),
        ];
      }

      if (upperMembers.length < 2 || lowerMembers.length < 2) {
        allViolations.push({
          type: ViolationType.UNEQUAL_COUNT,
          severity: Severity.WARNING,
          memberIds: [],
          message: `Not enough members for ${dateStr}: ${upperMembers.length} upper, ${lowerMembers.length} lower`,
          messageKey: 'violations.notEnoughMembers',
          messageParams: { date: dateStr, upper: String(upperMembers.length), lower: String(lowerMembers.length) },
        });
        if (upperMembers.length < 1 || lowerMembers.length < 1) continue;
      }

      // グループ1（UPPER）: upperPool から2名選ぶ
      const group1Result = pickBestPairSameGrade(
        upperMembers,
        context,
        monthAssignments,
        dayAssignments,
        pastPairCounts,
        undefined,
        schedule.isSplitClass,
      );

      if (group1Result) {
        const assignment1 = Assignment.create(schedule.id, 1, [
          group1Result.member1.id,
          group1Result.member2.id,
        ]);
        dayAssignments.push(assignment1);
        monthAssignments.push(assignment1);
        allAssignments.push(assignment1);
        allViolations.push(...group1Result.violations);

        counts.set(group1Result.member1.id, (counts.get(group1Result.member1.id) ?? 0) + 1);
        counts.set(group1Result.member2.id, (counts.get(group1Result.member2.id) ?? 0) + 1);

        const pk = pairKey(group1Result.member1.id, group1Result.member2.id);
        pastPairCounts.set(pk, (pastPairCounts.get(pk) ?? 0) + 1);

        // グループ2（LOWER）: グループ1で使ったメンバーを除き、lowerPool から2名選ぶ
        const usedIds = new Set([group1Result.member1.id, group1Result.member2.id]);
        const remainingLower = lowerMembers.filter((m) => !usedIds.has(m.id));

        const group2ClassContext: ClassContext = {
          group1Members: [group1Result.member1, group1Result.member2] as [Member, Member],
        };

        const group2Result = pickBestPairSameGrade(
          remainingLower,
          context,
          monthAssignments,
          dayAssignments,
          pastPairCounts,
          group2ClassContext,
          schedule.isSplitClass,
        );

        if (group2Result) {
          const assignment2 = Assignment.create(schedule.id, 2, [
            group2Result.member1.id,
            group2Result.member2.id,
          ]);
          dayAssignments.push(assignment2);
          monthAssignments.push(assignment2);
          allAssignments.push(assignment2);
          allViolations.push(...group2Result.violations);

          counts.set(group2Result.member1.id, (counts.get(group2Result.member1.id) ?? 0) + 1);
          counts.set(group2Result.member2.id, (counts.get(group2Result.member2.id) ?? 0) + 1);

          const pk2 = pairKey(group2Result.member1.id, group2Result.member2.id);
          pastPairCounts.set(pk2, (pastPairCounts.get(pk2) ?? 0) + 1);
        } else {
          allViolations.push({
            type: ViolationType.UNEQUAL_COUNT,
            severity: Severity.WARNING,
            memberIds: [],
            message: `Could not form group 2 for ${dateStr}`,
            messageKey: 'violations.cannotFormGroup',
            messageParams: { group: '2', date: dateStr },
          });
        }
      } else {
        allViolations.push({
          type: ViolationType.UNEQUAL_COUNT,
          severity: Severity.WARNING,
          memberIds: [],
          message: `Could not form group 1 for ${dateStr}`,
          messageKey: 'violations.cannotFormGroup',
          messageParams: { group: '1', date: dateStr },
        });
      }
    }
  }

  return { assignments: allAssignments, violations: allViolations };
}

interface PairResult {
  member1: Member;
  member2: Member;
  violations: ConstraintViolation[];
}

function pickBestPairSameGrade(
  candidates: Member[],
  context: GenerationContext,
  monthAssignments: Assignment[],
  dayAssignments: Assignment[],
  pastPairCounts: Map<string, number>,
  classContext?: ClassContext,
  isSplitClassDay?: boolean,
): PairResult | null {
  if (candidates.length < 2) return null;

  const counts = context.assignmentCounts;
  const poolMinCount = Math.min(...candidates.map((m) => counts.get(m.id) ?? 0));

  const shuffled = shuffle(candidates);
  let bestScore = Infinity;
  let bestPair: PairResult | null = null;

  for (let i = 0; i < shuffled.length; i++) {
    for (let j = i + 1; j < shuffled.length; j++) {
      const { score, violations } = scorePair(
        shuffled[i],
        shuffled[j],
        context,
        monthAssignments,
        dayAssignments,
        pastPairCounts,
        classContext,
        isSplitClassDay,
        poolMinCount,
      );

      if (score < bestScore || (score === bestScore && Math.random() < 0.5)) {
        bestScore = score;
        bestPair = { member1: shuffled[i], member2: shuffled[j], violations };
      }
    }
  }

  return bestPair;
}
