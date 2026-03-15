import { MemberId } from '@shared/types';

export const ViolationType = {
  LANGUAGE_COVERAGE: 'LANGUAGE_COVERAGE',
  CLASS_LANGUAGE_COVERAGE: 'CLASS_LANGUAGE_COVERAGE',
  SAME_GENDER: 'SAME_GENDER',
  MONTHLY_DUPLICATE: 'MONTHLY_DUPLICATE',
  UNEQUAL_COUNT: 'UNEQUAL_COUNT',
  SPOUSE_SAME_GROUP: 'SPOUSE_SAME_GROUP',
  REPEAT_PAIR: 'REPEAT_PAIR',
  MIN_INTERVAL: 'MIN_INTERVAL',
  EXCESSIVE_COUNT: 'EXCESSIVE_COUNT',
} as const;

export type ViolationType = (typeof ViolationType)[keyof typeof ViolationType];

export const Severity = {
  WARNING: 'WARNING',
  INFO: 'INFO',
} as const;

export type Severity = (typeof Severity)[keyof typeof Severity];

export interface ConstraintViolation {
  readonly type: ViolationType;
  readonly severity: Severity;
  readonly memberIds: readonly MemberId[];
  readonly message: string;
  readonly messageKey: string;
  readonly messageParams: Record<string, string>;
}
