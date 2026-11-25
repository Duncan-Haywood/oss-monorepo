// Federal estimated-tax dates (IRC 7503 rollover past weekends and DC holidays),
// with no book engine behind them. taxforms.mjs re-exports both functions.

// The four federal estimated-payment dates for a tax year: Apr 15, Jun 15, Sep 15
// and Jan 15 of the next year. A date on a weekend or a legal holiday in
// Washington, DC moves to the next day that is neither (IRC 7503). The two
// holidays that can reach these dates are Emancipation Day (Apr 16, observed on
// the Friday or Monday when it falls on a weekend; it pushed the April 2022 and
// 2023 deadlines to the 18th) and Martin Luther King Jr. Day (third Monday of
// January; the January 2023 payment was due on the 17th).
function dcHoliday(dt) {
  const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate(), dow = dt.getUTCDay();
  if (m === 1) return dow === 1 && d >= 15 && d <= 21;
  if (m === 4) {
    const e = new Date(Date.UTC(y, 3, 16)), ed = e.getUTCDay();
    const obs = ed === 6 ? 15 : ed === 0 ? 17 : 16;
    return d === obs;
  }
  return false;
}
export function estimatedDueDates(year) {
  return [[year, 4, 15], [year, 6, 15], [year, 9, 15], [year + 1, 1, 15]].map(([y, m, d]) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6 || dcHoliday(dt)) dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  });
}

// The last day to file the year's return and pay in full so the January
// installment owes no penalty (IRC 6654(h); Form 2210 instructions, "Line 11":
// "by January 31"). It is a "last day prescribed ... for performing any act", so
// IRC 7503 moves it past a weekend or DC holiday like the dates above: for tax
// year 2025, January 31, 2026 is a Saturday and the day is Monday, February 2.
export function fileAndPayDeadline(year) {
  const dt = new Date(Date.UTC(year + 1, 0, 31));
  while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6 || dcHoliday(dt)) dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}
