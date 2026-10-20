// Core arithmetic for the 2026 SEP-IRA contribution limit for a sole
// proprietor or single-member LLC filing Schedule C. No network calls: this
// applies published IRS figures to the numbers the user supplies. It is NOT
// tax advice -- see README "What this does not cover".
//
// Verified 2026-09-28 via WebSearch (Fidelity's "SEP IRA contribution limits
// for 2025 and 2026", ADP, Accuplan) against the same IRS-sourced figures the
// sibling solo-401k-contribution-calculator verified against IRS.gov and SSA:
//
//   - 2026 SEP-IRA employer contribution: the lesser of 25% of eligible
//     compensation or $72,000 (the Section 415(c) annual-additions limit).
//   - Section 401(a)(17) annual compensation limit for 2026: $360,000.
//   - 2026 Social Security taxable wage base: $184,500.
//
// A SEP-IRA has no employee deferral and no age-based catch-up: every dollar
// is an employer contribution, so the limit is one number rather than three.
//
// For a self-employed owner "25% of compensation" is an effective 20% of net
// earnings from self-employment (IRS Publication 560's rate table: a plan
// rate of 25% becomes 25% / 1.25 = 20%), because the contribution is itself
// deducted before the compensation it is a percentage of is measured. Net
// earnings are net profit minus half of self-employment tax, and are capped
// at the $360,000 compensation limit.
//
// Not modelled, and stated on the page: S-corp or partnership owners, owners
// with eligible employees (each must receive the same percentage), the
// additional 0.9% Medicare surtax, and any plan other than a SEP-IRA.

export const LIMITS_2026 = {
  annualAdditions: 72_000,
  compensationLimit: 360_000,
  // Solo 401(k) employee deferral, used only to show the comparison line.
  solo401kEmployeeDeferral: 24_500,
};

export const SOCIAL_SECURITY_WAGE_BASE_2026 = 184_500;

/** Self-employment tax is charged on 92.35% of net profit (1 - 0.153 / 2). */
export const SE_NET_EARNINGS_FACTOR = 0.9235;

/** The self-employed equivalent of the SEP-IRA's stated 25% rate. */
export const SEP_EFFECTIVE_RATE = 0.2;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) =>
    `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Self-employment tax on `netProfit` and the above-the-line-deductible half
 * of it. Floors at zero: a loss-making business owes none.
 */
export function selfEmploymentTaxOutcome(netProfit, { wageBase = SOCIAL_SECURITY_WAGE_BASE_2026 } = {}) {
  const profit = Math.max(0, num(netProfit));
  const cap = Math.max(0, num(wageBase));
  const taxableBase = profit * SE_NET_EARNINGS_FACTOR;
  const socialSecurity = Math.min(taxableBase, cap) * 0.124;
  const medicare = taxableBase * 0.029;
  const total = socialSecurity + medicare;
  return { profit, taxableBase, socialSecurity, medicare, total, deductibleHalf: total / 2 };
}

/** Net profit minus half of self-employment tax, capped at $360,000. */
export function netSelfEmploymentEarnings(netProfit, opts) {
  const se = selfEmploymentTaxOutcome(netProfit, opts);
  const earnings = Math.max(0, se.profit - se.deductibleHalf);
  return Math.min(earnings, LIMITS_2026.compensationLimit);
}

/**
 * What a Solo 401(k) would allow on the same earnings before any age
 * catch-up: an employee deferral (up to the statutory limit or the
 * earnings, whichever is smaller) plus the same 20% employer share, under
 * the same combined $72,000 limit.
 */
export function solo401kComparison(earnings) {
  const e = Math.max(0, num(earnings));
  const deferral = Math.min(LIMITS_2026.solo401kEmployeeDeferral, e);
  return Math.min(deferral + e * SEP_EFFECTIVE_RATE, LIMITS_2026.annualAdditions, e);
}

/**
 * Computes the 2026 SEP-IRA outcome: net self-employment earnings, the 20%
 * effective contribution, the $72,000 cap, and the resulting maximum. An
 * optional `plannedContribution` is trimmed to that maximum.
 */
export function sepIraContributionOutcome({ netProfit = 0, plannedContribution = null, wageBase } = {}) {
  const earnings = netSelfEmploymentEarnings(netProfit, { wageBase });
  const uncapped = earnings * SEP_EFFECTIVE_RATE;
  const maxContribution = Math.min(uncapped, LIMITS_2026.annualAdditions);
  const requested = plannedContribution == null ? maxContribution : Math.max(0, num(plannedContribution));
  const contribution = Math.min(requested, maxContribution);
  const solo401kMax = solo401kComparison(earnings);

  const findings = [];

  if (earnings <= 0) {
    findings.push({
      severity: "high",
      title: "No net self-employment earnings to contribute from",
      detail: "With zero or negative net profit after the self-employment tax deduction, there is no compensation a SEP-IRA contribution can be based on this year.",
    });
  }

  if (plannedContribution != null && requested > maxContribution) {
    findings.push({
      severity: "medium",
      title: "Planned contribution reduced to the limit",
      detail: `You entered ${money(requested)}, but the most a SEP-IRA allows on these earnings is ${money(maxContribution)}. Contributing more than the limit creates an excess contribution that is taxed until removed.`,
    });
  }

  if (uncapped > LIMITS_2026.annualAdditions) {
    findings.push({
      severity: "info",
      title: "The $72,000 overall limit applies",
      detail: `20% of net self-employment earnings would be ${money(uncapped)}, above the 2026 limit of ${money(LIMITS_2026.annualAdditions)}.`,
    });
  }

  if (earnings > 0 && solo401kMax > maxContribution + 0.005) {
    findings.push({
      severity: "info",
      title: "A Solo 401(k) would allow more on these earnings",
      detail: `On the same earnings a Solo 401(k) allows up to ${money(solo401kMax)} before any age catch-up, because it adds an employee deferral on top of the 20% employer share. It must be opened by December 31 to take a deferral for 2026; a SEP-IRA can be opened and funded up to the filing deadline. Trade-off, not advice: the Solo 401(k) is only open to an owner with no eligible employees.`,
    });
  }

  findings.push({
    severity: "info",
    title: "Sole proprietor / single-member LLC only, and employees change the math",
    detail: "This applies the net-self-employment-earnings formula for a Schedule C filer. An S-corp or partnership uses W-2 wages or a K-1 allocation instead. If you have eligible employees, a SEP-IRA must give each of them the same percentage of pay that you give yourself.",
  });

  return {
    netProfit: Math.max(0, num(netProfit)),
    earnings,
    uncapped,
    maxContribution,
    contribution,
    solo401kMax,
    findings,
  };
}
