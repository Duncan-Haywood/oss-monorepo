// The four Form 1040-ES due dates, moved past a weekend or a Washington, DC legal holiday (IRC 7503).
// Shared by estimated-tax.ts and penalty-2210.ts.

// Washington, DC legal holidays that can land on a due date: Martin Luther King Jr. Day (third Monday of
// January) and Emancipation Day (April 16, observed Friday or Monday when on a weekend).
function dcHoliday(dt: Date): boolean {
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  const dow = dt.getUTCDay();
  if (m === 1) return dow === 1 && d >= 15 && d <= 21;
  if (m === 4) {
    const ed = new Date(Date.UTC(y, 3, 16)).getUTCDay();
    return d === (ed === 6 ? 15 : ed === 0 ? 17 : 16);
  }
  return false;
}

/** The four 1040-ES due dates for a tax year (the last one in January of the next year). */
export function estimatedDueDates(year: number): string[] {
  return (
    [
      [year, 4, 15],
      [year, 6, 15],
      [year, 9, 15],
      [year + 1, 1, 15],
    ] as const
  ).map(([y, m, d]) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6 || dcHoliday(dt))
      dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  });
}
