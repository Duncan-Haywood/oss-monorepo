// Core arithmetic for the Section 1202 Qualified Small Business Stock (QSBS)
// gain exclusion, expanded by the One Big Beautiful Bill Act (OBBBA) for
// stock acquired after July 4, 2025. No network calls: this applies
// published federal figures to the numbers the user supplies. It is not a
// full tax return -- see README "What this does not cover".
//
// Verified 2026-09-25 via WebSearch against Kutak Rock's "Changes to IRC
// Section 1202 Under the One Big Beautiful Bill Act", Baker Tilly's
// "Evaluating section 1202 benefits after OBBBA" and "Changes to section
// 1202, Qualified Small Business Stock", The Tax Adviser's "QSBS gets a
// makeover" and "Revisiting Sec. 1202", K&L Gates' amendments summary,
// Grant Thornton's "Explaining enhanced Section 1202 benefits", and a
// cross-check search confirming the pre-OBBBA five-year cliff had no
// partial exclusion, cross-checked against each other:
//
//   - OLD RULE (stock acquired on or before July 4, 2025, i.e. before
//     OBBBA's enactment): an ALL-OR-NOTHING five-year cliff. Hold for MORE
//     than 5 years and exclude 100% of eligible gain; sell even a day
//     earlier and exclude 0% -- there was no partial exclusion for a
//     3-4 year hold under the old rule. Eligible gain is capped at the
//     GREATER of $10,000,000 or 10 times the taxpayer's aggregate adjusted
//     basis in the stock, per issuer.
//   - NEW RULE (stock acquired AFTER July 4, 2025 -- the enactment date,
//     not a tax year boundary, which is unusual among this portfolio's
//     other OBBBA calculators): a TIERED holding-period schedule -- 50%
//     exclusion at 3 years, 75% at 4 years, 100% at 5 years (still 0%
//     below 3 years). The eligible-gain cap is increased to the GREATER of
//     $15,000,000 or 10 times basis, per issuer. The company's aggregate
//     gross-assets threshold to qualify as a "qualified small business" in
//     the first place also rose, from $50,000,000 to $75,000,000 -- this
//     module does not verify company-level QSB eligibility, only the
//     shareholder-level exclusion math.
//   - Both the OLD and NEW rules apply the cap to ELIGIBLE gain first --
//     capping how much gain can even be considered -- and then apply the
//     holding-period percentage to that capped figure to determine how
//     much is actually excluded. The cap is a LIFETIME, PER-ISSUER figure
//     across every sale of that issuer's stock, not a per-sale allowance;
//     this module assumes a single sale is the taxpayer's only exclusion
//     claimed against this issuer and does not track cumulative prior use.
//   - This module does not verify whether the stock or the issuing
//     corporation actually qualifies as QSBS in the first place (original
//     issuance, C-corp status, active-business requirements, the
//     gross-assets threshold at issuance) -- the user supplies the
//     acquisition-date era, holding period, gain, and basis directly.
//
// This module does not verify a filer's holding period, gain, or basis --
// the user supplies each figure, and the page points at a qualified tax
// professional as the source to verify against before filing.

export const QSBS_RULES = {
  old: { cap: 10_000_000 },
  new: { cap: 15_000_000 },
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * The exclusion percentage for a given acquisition era and holding period,
 * in years. The old (pre-OBBBA) rule is all-or-nothing at 5 years; the new
 * rule (stock acquired after July 4, 2025) is tiered at 3/4/5 years.
 */
export function exclusionPercent(era, yearsHeld) {
  const years = Math.max(0, num(yearsHeld));
  if (era === "new") {
    if (years >= 5) return 1;
    if (years >= 4) return 0.75;
    if (years >= 3) return 0.5;
    return 0;
  }
  // old rule: all-or-nothing five-year cliff
  return years >= 5 ? 1 : 0;
}

/**
 * Computes the excluded and taxable gain for a QSBS sale under either the
 * pre-OBBBA (old) or post-OBBBA (new, stock acquired after July 4, 2025)
 * Section 1202 rules.
 */
export function qsbsExclusionOutcome({
  era = "new",
  yearsHeld = 0,
  gain = 0,
  basis = 0,
} = {}) {
  const rules = QSBS_RULES[era] || QSBS_RULES.new;
  const gainValue = Math.max(0, num(gain));
  const basisValue = Math.max(0, num(basis));

  const cap = Math.max(rules.cap, basisValue * 10);
  const eligibleGain = Math.min(gainValue, cap);
  const disallowedByCap = Math.max(0, gainValue - cap);

  const percent = exclusionPercent(era, yearsHeld);
  const excludedGain = eligibleGain * percent;
  const taxableGain = gainValue - excludedGain;

  const years = Math.max(0, num(yearsHeld));
  const nextTier = era === "new" && percent < 1
    ? (years < 3 ? { years: 3, percent: 0.5 } : years < 4 ? { years: 4, percent: 0.75 } : { years: 5, percent: 1 })
    : null;

  const findings = [];

  if (gainValue <= 0) {
    findings.push({
      severity: "info",
      title: "Enter your gain to see the exclusion",
      detail: "With no gain entered, there is nothing to exclude.",
    });
  }

  if (era === "old" && percent === 0 && years > 0) {
    findings.push({
      severity: "high",
      title: "No partial exclusion under the old rule below 5 years",
      detail: `Stock acquired on or before July 4, 2025 follows the pre-OBBBA all-or-nothing rule -- at ${years} year(s) held, none of your gain is excluded yet. There is no 3- or 4-year partial exclusion under this rule; the full 100% only becomes available once you pass 5 years.`,
    });
  }

  if (nextTier) {
    findings.push({
      severity: "medium",
      title: `Next tier: ${nextTier.percent * 100}% at ${nextTier.years} years`,
      detail: `Your exclusion increases at each holding-period milestone under the new tiered rule. Right now you are excluding ${money(excludedGain)} of ${money(eligibleGain)} eligible gain (${percent * 100}%).`,
    });
  }

  if (disallowedByCap > 0) {
    findings.push({
      severity: "medium",
      title: `${money(disallowedByCap)} of your gain exceeds the per-issuer cap`,
      detail: `Eligible gain is capped at the greater of ${money(rules.cap)} or 10 times your ${money(basisValue)} basis (${money(cap)} here) -- gain above that cap is fully taxable regardless of holding period. This cap is cumulative across every sale of this issuer's stock, not just this one.`,
    });
  }

  findings.push({
    severity: "info",
    title: "Company-level QSB eligibility not verified",
    detail: "This calculator does not check whether the issuing corporation actually qualifies as a \"qualified small business\" -- original issuance, C-corp status, active-business requirements, and the gross-assets threshold at issuance (a company-level test, not this shareholder-level exclusion math). It assumes the stock already qualifies as QSBS.",
  });

  return {
    era,
    yearsHeld: years,
    gain: gainValue,
    basis: basisValue,
    cap,
    eligibleGain,
    disallowedByCap,
    percent,
    excludedGain,
    taxableGain,
    nextTier,
    findings,
  };
}
