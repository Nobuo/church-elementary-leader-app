import { MemberRepository } from '@domain/repositories/member-repository';
import { Member } from '@domain/entities/member';
import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';

export interface ImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
}

interface ParsedRow {
  name: string;
  gender: string;
  language: string;
  gradeGroup: string;
  memberType: string;
  sameGenderOnly: boolean;
  spouseName: string;
  availableDates: string[] | null;
  isActive: boolean;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function parseRow(fields: string[], rowNum: number): ParsedRow | { error: string } {
  if (fields.length < 9) {
    return { error: `Row ${rowNum}: Expected 9 columns, got ${fields.length}` };
  }

  const name = fields[0].trim();
  if (!name) return { error: `Row ${rowNum}: Name is required` };

  const gender = fields[1].trim().toUpperCase();
  if (gender !== 'MALE' && gender !== 'FEMALE') {
    return { error: `Row ${rowNum}: Invalid gender "${fields[1]}"` };
  }

  const language = fields[2].trim().toUpperCase();
  if (language !== 'JAPANESE' && language !== 'ENGLISH' && language !== 'BOTH') {
    return { error: `Row ${rowNum}: Invalid language "${fields[2]}"` };
  }

  const gradeGroup = fields[3].trim().toUpperCase();
  if (gradeGroup !== 'LOWER' && gradeGroup !== 'UPPER') {
    return { error: `Row ${rowNum}: Invalid grade group "${fields[3]}"` };
  }

  const memberType = fields[4].trim().toUpperCase();
  if (memberType !== 'PARENT_COUPLE' && memberType !== 'PARENT_SINGLE' && memberType !== 'HELPER') {
    return { error: `Row ${rowNum}: Invalid member type "${fields[4]}"` };
  }

  const sameGenderOnly = fields[5].trim().toUpperCase() === 'TRUE';
  const spouseName = fields[6].trim();
  const datesStr = fields[7].trim();
  let availableDates: string[] | null = null;
  if (datesStr) {
    const dates = datesStr.split(';').map((d) => d.trim()).filter(Boolean);
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    for (const d of dates) {
      if (!datePattern.test(d) || isNaN(new Date(d).getTime())) {
        return { error: `Row ${rowNum}: Invalid date format "${d}"` };
      }
    }
    availableDates = dates.length > 0 ? dates : null;
  }
  const isActive = fields[8].trim().toUpperCase() !== 'FALSE';

  return { name, gender, language, gradeGroup, memberType, sameGenderOnly, spouseName, availableDates, isActive };
}

export function importMembersCsv(
  csvContent: string,
  memberRepo: MemberRepository,
): ImportResult {
  // Remove BOM if present
  const content = csvContent.replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length < 2) {
    return { created: 0, updated: 0, errors: [{ row: 0, message: 'CSV is empty or has no data rows' }] };
  }

  // Skip header row
  const dataLines = lines.slice(1);
  const result: ImportResult = { created: 0, updated: 0, errors: [] };

  // Track processed names to detect duplicates within the CSV
  const processedNames = new Set<string>();
  const spouseLinks: { name: string; spouseName: string; memberType: string }[] = [];

  // Load all members once and maintain a lookup map
  const allMembers = memberRepo.findAll(false);
  const memberByName = new Map<string, Member>(allMembers.map((m) => [m.name, m]));

  for (let i = 0; i < dataLines.length; i++) {
    const rowNum = i + 2; // 1-indexed, skip header
    const fields = parseCsvLine(dataLines[i]);
    const parsed = parseRow(fields, rowNum);

    if ('error' in parsed) {
      result.errors.push({ row: rowNum, message: parsed.error });
      continue;
    }

    if (processedNames.has(parsed.name)) {
      result.errors.push({ row: rowNum, message: `Duplicate name "${parsed.name}" in CSV` });
      continue;
    }
    processedNames.add(parsed.name);

    const existing = memberByName.get(parsed.name);

    if (existing) {
      // Update existing
      const updateResult = existing.update({
        gender: parsed.gender as Gender,
        language: parsed.language as Language,
        gradeGroup: parsed.gradeGroup as GradeGroup,
        memberType: parsed.memberType as MemberType,
        sameGenderOnly: parsed.sameGenderOnly,
        availableDates: parsed.availableDates,
        isActive: parsed.isActive,
      });

      if (!updateResult.ok) {
        result.errors.push({ row: rowNum, message: updateResult.error });
        continue;
      }

      memberRepo.save(updateResult.value);
      memberByName.set(updateResult.value.name, updateResult.value);
      result.updated++;
    } else {
      // Create new
      const createResult = Member.create({
        name: parsed.name,
        gender: parsed.gender as Gender,
        language: parsed.language as Language,
        gradeGroup: parsed.gradeGroup as GradeGroup,
        memberType: parsed.memberType as MemberType,
        sameGenderOnly: parsed.sameGenderOnly,
        spouseId: null,
        availableDates: parsed.availableDates,
      });

      if (!createResult.ok) {
        result.errors.push({ row: rowNum, message: createResult.error });
        continue;
      }

      let member = createResult.value;
      if (!parsed.isActive) {
        member = member.deactivate();
      }

      memberRepo.save(member);
      memberByName.set(member.name, member);
      result.created++;
    }

    if (parsed.spouseName) {
      spouseLinks.push({ name: parsed.name, spouseName: parsed.spouseName, memberType: parsed.memberType });
    }
  }

  // Phase 2: Link spouses (re-query to get latest saved state)
  const finalMembers = memberRepo.findAll(false);
  const finalByName = new Map<string, Member>(finalMembers.map((m) => [m.name, m]));

  for (const link of spouseLinks) {
    if (link.memberType !== MemberType.PARENT_COUPLE) continue;

    const member = finalByName.get(link.name);
    const spouse = finalByName.get(link.spouseName);

    if (!member || !spouse) {
      result.errors.push({
        row: 0,
        message: `Spouse "${link.spouseName}" not found for "${link.name}" (skipped linkage)`,
      });
      continue;
    }

    // Link both directions
    const updatedMember = member.withSpouseId(spouse.id);
    memberRepo.save(updatedMember);

    if (spouse.memberType === MemberType.PARENT_COUPLE && !spouse.spouseId) {
      const updatedSpouse = spouse.withSpouseId(updatedMember.id);
      memberRepo.save(updatedSpouse);
    }
  }

  return result;
}
