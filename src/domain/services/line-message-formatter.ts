import { Member } from '@domain/entities/member';
import { Assignment } from '@domain/entities/assignment';
import { Schedule } from '@domain/entities/schedule';
import { MemberId, ScheduleId } from '@shared/types';

type Lang = 'ja' | 'en';

const dayNames: Record<Lang, string[]> = {
  ja: ['日', '月', '火', '水', '木', '金', '土'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

const groupLabel: Record<Lang, string> = {
  ja: 'グループ',
  en: 'Group',
};

export function formatLineMessage(
  assignments: Assignment[],
  schedules: Schedule[],
  members: Map<MemberId, Member>,
  year: number,
  month: number,
  lang: Lang = 'ja',
): string {
  const scheduleMap = new Map<ScheduleId, Schedule>();
  for (const s of schedules) {
    scheduleMap.set(s.id, s);
  }

  // Group assignments by schedule
  const bySchedule = new Map<ScheduleId, Assignment[]>();
  for (const a of assignments) {
    const existing = bySchedule.get(a.scheduleId) ?? [];
    existing.push(a);
    bySchedule.set(a.scheduleId, existing);
  }

  // Sort schedules by date
  const sortedSchedules = schedules
    .filter((s) => !s.isExcluded && bySchedule.has(s.id))
    .sort((a, b) => a.date.localeCompare(b.date));

  const title =
    lang === 'ja'
      ? `📅 ${year}年${month}月 リーダー担当表`
      : `📅 ${year}/${month} Leader Schedule`;

  const lines: string[] = [title, ''];

  for (const schedule of sortedSchedules) {
    const d = new Date(schedule.date);
    const dayOfMonth = d.getDate();
    const dayName = dayNames[lang][d.getDay()];

    const tags: string[] = [];
    if (schedule.isEvent) tags.push(lang === 'ja' ? '🎉 イベント日' : '🎉 Event Day');
    if (schedule.isSplitClass) tags.push(lang === 'ja' ? '📚 分級あり' : '📚 Split Class');
    const tagStr = tags.length > 0 ? ` ${tags.join(' ')}` : '';

    const dateLabel =
      lang === 'ja'
        ? `${month}/${dayOfMonth}（${dayName}）${tagStr}`
        : `${month}/${dayOfMonth} (${dayName})${tagStr}`;

    lines.push(dateLabel);

    const dayAssignments = (bySchedule.get(schedule.id) ?? []).sort(
      (a, b) => a.groupNumber - b.groupNumber,
    );

    for (const assignment of dayAssignments) {
      const m1 = members.get(assignment.memberIds[0]);
      const m2 = members.get(assignment.memberIds[1]);
      const sep = lang === 'ja' ? '・' : ' & ';
      lines.push(
        `  ${groupLabel[lang]} ${assignment.groupNumber}: ${m1?.name ?? '?'}${sep}${m2?.name ?? '?'}`,
      );
    }

    lines.push('');
  }

  return lines.join('\n').trim();
}
