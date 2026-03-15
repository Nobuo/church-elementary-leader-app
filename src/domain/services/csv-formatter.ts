import { Member } from '@domain/entities/member';
import { Assignment } from '@domain/entities/assignment';
import { Schedule } from '@domain/entities/schedule';
import { MemberId, ScheduleId } from '@shared/types';

type Lang = 'ja' | 'en';

const headers: Record<Lang, string[]> = {
  ja: ['日付', 'イベント日', '分級', 'グループ番号', 'メンバー1', 'メンバー1言語', 'メンバー2', 'メンバー2言語'],
  en: ['Date', 'Event Day', 'Split Class', 'Group', 'Member 1', 'Member 1 Language', 'Member 2', 'Member 2 Language'],
};

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function formatCsv(
  assignments: Assignment[],
  schedules: Schedule[],
  members: Map<MemberId, Member>,
  lang: Lang = 'ja',
): string {
  const BOM = '\uFEFF';
  const scheduleMap = new Map<ScheduleId, Schedule>();
  for (const s of schedules) {
    scheduleMap.set(s.id, s);
  }

  const sorted = [...assignments].sort((a, b) => {
    const dateA = scheduleMap.get(a.scheduleId)?.date ?? '';
    const dateB = scheduleMap.get(b.scheduleId)?.date ?? '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return a.groupNumber - b.groupNumber;
  });

  const lines: string[] = [headers[lang].join(',')];

  for (const assignment of sorted) {
    const schedule = scheduleMap.get(assignment.scheduleId);
    const date = schedule?.date ?? '';
    const m1 = members.get(assignment.memberIds[0]);
    const m2 = members.get(assignment.memberIds[1]);

    lines.push(
      [
        escapeCsvField(date),
        schedule?.isEvent ? 'TRUE' : 'FALSE',
        schedule?.isSplitClass ? 'TRUE' : 'FALSE',
        String(assignment.groupNumber),
        escapeCsvField(m1?.name ?? ''),
        escapeCsvField(m1?.language ?? ''),
        escapeCsvField(m2?.name ?? ''),
        escapeCsvField(m2?.language ?? ''),
      ].join(','),
    );
  }

  return BOM + lines.join('\n');
}
