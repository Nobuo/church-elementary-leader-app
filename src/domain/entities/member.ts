import { MemberId, createMemberId } from '@shared/types';
import { Result, ok, err } from '@shared/result';
import { Gender } from '@domain/value-objects/gender';
import { Language } from '@domain/value-objects/language';
import { GradeGroup } from '@domain/value-objects/grade-group';
import { MemberType } from '@domain/value-objects/member-type';

export interface MemberProps {
  readonly id: MemberId;
  readonly name: string;
  readonly gender: Gender;
  readonly language: Language;
  readonly gradeGroup: GradeGroup;
  readonly memberType: MemberType;
  readonly sameGenderOnly: boolean;
  readonly spouseId: MemberId | null;
  readonly availableDates: readonly string[] | null; // ISO date strings
  readonly isActive: boolean;
}

export type CreateMemberInput = Omit<MemberProps, 'id' | 'isActive'>;

export class Member {
  readonly id: MemberId;
  readonly name: string;
  readonly gender: Gender;
  readonly language: Language;
  readonly gradeGroup: GradeGroup;
  readonly memberType: MemberType;
  readonly sameGenderOnly: boolean;
  readonly spouseId: MemberId | null;
  readonly availableDates: readonly string[] | null;
  readonly isActive: boolean;

  private constructor(props: MemberProps) {
    this.id = props.id;
    this.name = props.name;
    this.gender = props.gender;
    this.language = props.language;
    this.gradeGroup = props.gradeGroup;
    this.memberType = props.memberType;
    this.sameGenderOnly = props.sameGenderOnly;
    this.spouseId = props.spouseId;
    this.availableDates = props.availableDates;
    this.isActive = props.isActive;
  }

  static create(input: CreateMemberInput): Result<Member> {
    if (!input.name.trim()) {
      return err('Name is required');
    }

    if (input.memberType !== MemberType.PARENT_COUPLE && input.spouseId) {
      return err('Only PARENT_COUPLE can have a spouseId');
    }

    return ok(
      new Member({
        ...input,
        id: createMemberId(),
        isActive: true,
      }),
    );
  }

  static reconstruct(props: MemberProps): Member {
    return new Member(props);
  }

  update(changes: Partial<Omit<MemberProps, 'id'>>): Result<Member> {
    const updated = { ...this.toProps(), ...changes };

    if (!updated.name.trim()) {
      return err('Name is required');
    }

    if (updated.memberType !== MemberType.PARENT_COUPLE && updated.spouseId) {
      return err('Only PARENT_COUPLE can have a spouseId');
    }

    return ok(new Member(updated));
  }

  deactivate(): Member {
    return new Member({ ...this.toProps(), isActive: false });
  }

  withSpouseId(spouseId: MemberId | null): Member {
    return new Member({ ...this.toProps(), spouseId });
  }

  isAvailableOn(dateStr: string): boolean {
    if (!this.availableDates) return true;
    return this.availableDates.includes(dateStr);
  }

  private toProps(): MemberProps {
    return {
      id: this.id,
      name: this.name,
      gender: this.gender,
      language: this.language,
      gradeGroup: this.gradeGroup,
      memberType: this.memberType,
      sameGenderOnly: this.sameGenderOnly,
      spouseId: this.spouseId,
      availableDates: this.availableDates,
      isActive: this.isActive,
    };
  }
}
