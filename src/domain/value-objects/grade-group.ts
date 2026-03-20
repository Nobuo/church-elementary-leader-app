export const GradeGroup = {
  LOWER: 'LOWER',
  UPPER: 'UPPER',
  ANY: 'ANY',
} as const;

export type GradeGroup = (typeof GradeGroup)[keyof typeof GradeGroup];
