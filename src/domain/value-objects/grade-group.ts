export const GradeGroup = {
  LOWER: 'LOWER',
  UPPER: 'UPPER',
} as const;

export type GradeGroup = (typeof GradeGroup)[keyof typeof GradeGroup];
