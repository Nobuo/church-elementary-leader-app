import { Member } from '@domain/entities/member';
import { MemberId } from '@shared/types';

type Lang = 'ja' | 'en';

const headers: Record<Lang, string[]> = {
  ja: ['氏名', '性別', '言語', '担当区分', 'メンバー種別', '同性ペア制限', '配偶者', '参加可能日', '有効'],
  en: ['Name', 'Gender', 'Language', 'Grade Group', 'Member Type', 'Same-gender Only', 'Spouse', 'Available Dates', 'Active'],
};

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function formatMemberCsv(
  members: Member[],
  memberMap: Map<MemberId, Member>,
  lang: Lang = 'ja',
): string {
  const BOM = '\uFEFF';
  const lines: string[] = [headers[lang].join(',')];

  for (const member of members) {
    const spouse = member.spouseId ? memberMap.get(member.spouseId) : null;
    const availableDates = member.availableDates ? member.availableDates.join(';') : '';

    lines.push(
      [
        escapeCsvField(member.name),
        member.gender,
        member.language,
        member.gradeGroup,
        member.memberType,
        member.sameGenderOnly ? 'TRUE' : 'FALSE',
        spouse ? escapeCsvField(spouse.name) : '',
        availableDates,
        member.isActive ? 'TRUE' : 'FALSE',
      ].join(','),
    );
  }

  return BOM + lines.join('\n');
}
