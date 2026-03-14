/**
 * Fiscal year starts in April and ends in March of the following year.
 * e.g., fiscal year 2026 = April 2026 ~ March 2027
 */
export function getFiscalYear(date: Date): number {
  const month = date.getMonth(); // 0-indexed
  const year = date.getFullYear();
  return month < 3 ? year - 1 : year; // Jan-Mar belongs to previous fiscal year
}

export function getFiscalYearRange(fiscalYear: number): { start: Date; end: Date } {
  return {
    start: new Date(fiscalYear, 3, 1), // April 1
    end: new Date(fiscalYear + 1, 2, 31), // March 31
  };
}
