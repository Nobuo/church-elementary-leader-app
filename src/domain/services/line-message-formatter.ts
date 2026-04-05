import { Member } from '@domain/entities/member';
import { Assignment } from '@domain/entities/assignment';
import { Schedule, SplitType } from '@domain/entities/schedule';
import { MemberId, ScheduleId } from '@shared/types';

type Lang = 'ja' | 'en';

const dayNames: Record<Lang, string[]> = {
  ja: ['日', '月', '火', '水', '木', '金', '土'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

const splitTagLabels: Record<Lang, Record<SplitType, string>> = {
  ja: {
    standard: '📚 1~3年と4~6年に分けてクラス',
    senior_discussion: '📚 1~4年のクラスと、5~6年生が心の話を話すクラス',
  },
  en: {
    standard: '📚 Split: Grades 1-3 & Grades 4-6',
    senior_discussion: '📚 Split: Grades 1-4 & Grades 5-6 (discussion)',
  },
};

const splitGroupLabels: Record<Lang, Record<SplitType, { upper: string; lower: string }>> = {
  ja: {
    standard: { upper: '4~6年', lower: '1~3年' },
    senior_discussion: { upper: '5~6年生', lower: '1~4年' },
  },
  en: {
    standard: { upper: 'Grades 4-6', lower: 'Grades 1-3' },
    senior_discussion: { upper: 'Grades 5-6', lower: 'Grades 1-4' },
  },
};

const footerText: Record<Lang, string> = {
  ja: '※ヘルパーの方で難しい日がありましたら教えてください。調整します。親の方はすみません、代わりの方をご自分で見つけていただき、変更したら教えてください。',
  en: '* If any helper has a scheduling conflict, please let us know and we will adjust. For parents, please find a replacement on your own and let us know of any changes.',
};

export function formatLineMessage(
  assignments: Assignment[],
  schedules: Schedule[],
  members: Map<MemberId, Member>,
  year: number,
  month: number,
  lang: Lang = 'ja',
): string {
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

    // Event tag
    let eventTag = '';
    if (schedule.isEvent) {
      const primaryName = lang === 'ja' ? schedule.eventNameJa : schedule.eventNameEn;
      const fallbackName = lang === 'ja' ? schedule.eventNameEn : schedule.eventNameJa;
      const defaultLabel = lang === 'ja' ? 'イベント日' : 'Event Day';
      eventTag = ` 🎉 ${primaryName ?? fallbackName ?? defaultLabel}`;
    }

    // Split class tag
    const splitType = schedule.effectiveSplitType;
    const splitTag = schedule.isSplitClass ? ` ${splitTagLabels[lang][splitType]}` : '';

    const dateLabel =
      lang === 'ja'
        ? `${month}/${dayOfMonth}（${dayName}）${eventTag}${splitTag}`
        : `${month}/${dayOfMonth} (${dayName})${eventTag}${splitTag}`;

    lines.push(dateLabel);

    const dayAssignments = bySchedule.get(schedule.id) ?? [];

    if (schedule.isSplitClass) {
      // Split class: show grade-based labels, lower (group 2) first
      const labels = splitGroupLabels[lang][splitType];
      const maxPerGroup = 2;
      const sorted = [...dayAssignments].sort((a, b) => b.groupNumber - a.groupNumber);
      for (const assignment of sorted) {
        const sep = lang === 'ja' ? '・' : ' & ';
        const nameList = assignment.memberIds.map((mid) => members.get(mid)?.name ?? '?');
        const vacant = maxPerGroup - assignment.memberIds.length;
        const tbdLabel = lang === 'ja' ? '(未定)' : '(TBD)';
        for (let i = 0; i < vacant; i++) nameList.push(tbdLabel);
        const label = assignment.groupNumber === 1 ? labels.upper : labels.lower;
        lines.push(`  ${label}: ${nameList.join(sep)}`);
      }
    } else {
      // Combined day: no group label, just member names
      const maxPerGroup = 3;
      for (const assignment of dayAssignments) {
        const sep = lang === 'ja' ? '・' : ' & ';
        const nameList = assignment.memberIds.map((mid) => members.get(mid)?.name ?? '?');
        const vacant = maxPerGroup - assignment.memberIds.length;
        const tbdLabel = lang === 'ja' ? '(未定)' : '(TBD)';
        for (let i = 0; i < vacant; i++) nameList.push(tbdLabel);
        lines.push(`  ${nameList.join(sep)}`);
      }
    }

    lines.push('');
  }

  lines.push(footerText[lang]);

  return lines.join('\n').trim();
}
