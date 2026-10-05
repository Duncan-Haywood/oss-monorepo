// SEP-IRA vs Solo 401(k) for a sole proprietor or single-member LLC, 2026.
// No network calls: this applies published IRS figures to the numbers the
// user supplies. It is NOT tax advice. The 2026 figures are the same ones
// solo-401k-contribution-calculator documents (IRS.gov retirement-topics
// contribution-limits page, SSA 2026 wage base): elective deferral $24,500,
// catch-up $8,000 (50+) or $11,250 (60-63), Section 415(c) overall limit
// $72,000, compensation limit $360,000, Social Security wage base $184,500.
//
// The two plans differ in one way that matters to a small earner:
//   - SEP-IRA: employer contribution only, 20% of net self-employment
//     earnings (the sole-proprietor equivalent of "25% of pay"), up to
//     $72,000. No employee deferral and NO catch-up contribution.
//   - Solo 401(k): the same 20% employer share PLUS an employee elective
//     deferral (with catch-up). At low profit the deferral is most of the
//     contribution; at high profit both plans hit the same $72,000 ceiling
//     (the Solo 401(k) keeps its catch-up on top).
// So the Solo 401(k) is never lower, and the question is how much higher,
// what that is worth in tax, and whether it is worth the extra paperwork.

export const LIMITS_2026 = {
  employeeDeferral: 24_500,
  catchUp50: 8_000,
  catchUp60to63: 11_250,
  annualAdditions: 72_000,
  compensationLimit: 360_000,
};
export const SOCIAL_SECURITY_WAGE_BASE_2026 = 184_500;
export const SE_NET_EARNINGS_FACTOR = 0.9235;
export const EMPLOYER_CONTRIBUTION_RATE = 0.2;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function money(n) {
  const value = Number(n) || 0;
  const text = `$${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

export function catchUpFor(age) {
  const a = Math.floor(num(age));
  if (a >= 60 && a <= 63) return LIMITS_2026.catchUp60to63;
  if (a >= 50) return LIMITS_2026.catchUp50;
  return 0;
}

/** Net earnings from self-employment: profit minus half of SE tax, capped at the compensation limit. */
export function netSelfEmploymentEarnings(netProfit) {
  const profit = Math.max(0, num(netProfit));
  const base = profit * SE_NET_EARNINGS_FACTOR;
  const se = Math.min(base, SOCIAL_SECURITY_WAGE_BASE_2026) * 0.124 + base * 0.029;
  return Math.min(Math.max(0, profit - se / 2), LIMITS_2026.compensationLimit);
}

/** SEP-IRA: employer contribution only, 20% of net earnings, up to the overall limit. No catch-up. */
export function sepIraContribution(netProfit) {
  const earnings = netSelfEmploymentEarnings(netProfit);
  return Math.min(earnings * EMPLOYER_CONTRIBUTION_RATE, LIMITS_2026.annualAdditions, earnings);
}

/**
 * Solo 401(k): elective deferral (statutory limit incl. catch-up, less what
 * was deferred elsewhere, capped at earnings) plus a 20% employer share,
 * together capped by the overall limit (which rises with the catch-up) and
 * by earnings.
 */
export function solo401kContribution(netProfit, { age = 0, deferralUsedElsewhere = 0 } = {}) {
  const earnings = netSelfEmploymentEarnings(netProfit);
  const catchUp = catchUpFor(age);
  const room = Math.max(0, LIMITS_2026.employeeDeferral + catchUp - Math.max(0, num(deferralUsedElsewhere)));
  const deferral = Math.min(room, earnings);
  const employerRaw = earnings * EMPLOYER_CONTRIBUTION_RATE;
  const cap = Math.min(LIMITS_2026.annualAdditions + catchUp, earnings);
  const total = Math.min(deferral + employerRaw, cap);
  return { earnings, deferral, employer: Math.max(0, total - deferral), total };
}

/**
 * The smallest net profit (to the dollar) at which `fn(profit)` reaches
 * `target`, found by bisection; null if it never does below $2,000,000.
 * Both contribution functions are non-decreasing in profit.
 */
export function profitNeededFor(fn, target) {
  if (!(target > 0)) return null;
  let lo = 0;
  let hi = 2_000_000;
  if (fn(hi) < target - 0.005) return null;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    if (fn(mid) >= target - 0.005) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi);
}

/**
 * Compare the two plans for one person. `marginalRate` is the combined
 * federal (plus state, if you like) rate on the last dollar of income, as a
 * fraction; it turns the contribution gap into an estimated tax saving.
 */
export function comparePlans({ netProfit = 0, age = 0, deferralUsedElsewhere = 0, marginalRate = 0 } = {}) {
  const sep = sepIraContribution(netProfit);
  const solo = solo401kContribution(netProfit, { age, deferralUsedElsewhere });
  const rate = Math.min(Math.max(num(marginalRate), 0), 0.6);
  const gap = solo.total - sep;
  const findings = [];

  if (solo.earnings <= 0) {
    findings.push({ severity: "high", title: "No net self-employment earnings", detail: "With zero or negative net profit after the self-employment tax deduction, neither plan has compensation to contribute from this year." });
  } else if (gap < 1) {
    findings.push({ severity: "info", title: "At your profit the two plans allow the same amount", detail: "Both plans are at the same ceiling (or earnings are the limit), so the choice comes down to fees, Roth options and paperwork rather than contribution room." });
  } else {
    findings.push({ severity: "info", title: `The Solo 401(k) lets you put in ${money(gap)} more`, detail: `Solo 401(k): ${money(solo.total)} (${money(solo.deferral)} employee deferral + ${money(solo.employer)} employer). SEP-IRA: ${money(sep)} (employer 20% only).${rate > 0 ? ` At a ${(rate * 100).toFixed(0)}% marginal rate that extra deduction is worth about ${money(gap * rate)} in tax this year.` : ""}` });
  }
  if (catchUpFor(age) > 0) {
    findings.push({ severity: "info", title: "A SEP-IRA gets no catch-up contribution", detail: `Age-based catch-up (${money(catchUpFor(age))} for you) applies to a 401(k) elective deferral. A SEP-IRA has no employee deferral, so it cannot use it.` });
  }
  if (num(deferralUsedElsewhere) > 0) {
    findings.push({ severity: "medium", title: "A W-2 401(k) deferral shrinks only the Solo 401(k) side", detail: "The elective-deferral limit is shared across every 401(k) you contribute to, so deferrals at a day job reduce your Solo 401(k) room. They do not affect a SEP-IRA, which is employer money." });
  }
  findings.push({ severity: "info", title: "Sole proprietor / single-member LLC with no employees only", detail: "Both plans have different rules once you have employees: a SEP-IRA must cover eligible employees at the same percentage, and a Solo 401(k) is only 'solo' while you have none. Plan rules, Roth options, loans and deadlines to open the plan are not modelled here." });

  return {
    earnings: solo.earnings,
    sep,
    solo,
    gap,
    rate,
    taxSavedSep: sep * rate,
    taxSavedSolo: solo.total * rate,
    taxSavedExtra: gap * rate,
    profitToMaxSep: profitNeededFor((p) => sepIraContribution(p), LIMITS_2026.annualAdditions),
    profitToMaxSolo: profitNeededFor((p) => solo401kContribution(p, { age, deferralUsedElsewhere }).total, LIMITS_2026.annualAdditions + catchUpFor(age)),
    findings,
  };
}

/** A profit sweep for the table: both plans and the gap at a series of profit levels. */
export function profitSweep({ age = 0, deferralUsedElsewhere = 0, steps = [20_000, 40_000, 60_000, 80_000, 100_000, 150_000, 200_000, 300_000, 400_000] } = {}) {
  return steps.map((profit) => {
    const sep = sepIraContribution(profit);
    const solo = solo401kContribution(profit, { age, deferralUsedElsewhere }).total;
    return { profit, sep, solo, gap: solo - sep };
  });
}
