/**
 * 年度は4月に始まり、翌年3月に終わる。
 * 例: 2026年度 = 2026年4月〜2027年3月
 */
export function getFiscalYear(date: Date): number {
  const month = date.getMonth(); // 0始まり
  const year = date.getFullYear();
  return month < 3 ? year - 1 : year; // 1〜3月は前年度に属する
}

export function getFiscalYearRange(fiscalYear: number): { start: Date; end: Date } {
  return {
    start: new Date(fiscalYear, 3, 1), // 4月1日
    end: new Date(fiscalYear + 1, 2, 31), // 3月31日
  };
}
