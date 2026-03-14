export const MemberType = {
  PARENT_COUPLE: 'PARENT_COUPLE',
  PARENT_SINGLE: 'PARENT_SINGLE',
  HELPER: 'HELPER',
} as const;

export type MemberType = (typeof MemberType)[keyof typeof MemberType];
