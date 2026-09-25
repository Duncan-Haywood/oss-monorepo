// Core arithmetic for the SALT (state and local tax) itemized deduction cap
// under the One Big Beautiful Bill Act (OBBBA, signed July 4, 2025). No
// network calls: this applies published federal figures to the numbers the
// user supplies. It is not a full tax return -- see README "What this does
// not cover".
//
// Verified 2026-09-25 via WebSearch against The Tax Adviser's "Cap raised,
// strings attached: The 2025 SALT shake-up", TaxAct's "SALT Tax Deduction
// 2025: What the New $40K Cap Means for You", Fidelity's "How the new SALT
// deduction cap could affect your taxes", KahnLitwin's "SALT Deduction
// Raised to $40,000 -- But a Hidden Phaseout Could Cost You", Anchin's "SALT
// Deduction Cap Under OBBBA", KMK Ventures' "SALT Tax Deduction 2025-2026",
// TaxSharkInc's "How Does the SALT Cap Phase Out Above $500,000?", and
// Ourtaxpartner's "New SALT Deduction Caps", cross-checked against each
// other:
//
//   - OBBBA raised the SALT itemized-deduction cap (IRC Section 164) from
//     $10,000 ($5,000 married filing separately) to $40,000 ($20,000 MFS)
//     for 2025, TEMPORARILY -- for tax years 2025 through 2029 only. The
//     cap is the SAME $40,000 figure for single, head-of-household, and
//     married-filing-jointly filers (it is not doubled for a joint return);
//     only married filing separately gets a different, halved figure.
//   - For 2026-2029 the cap increases 1% per year over the prior year's
//     figure: $40,400 for 2026 (both this and 2025 are published, fixed
//     dollar figures -- 2027-2029 would compound from 2026's but are out of
//     scope for a 2025/2026 filing-season tool).
//   - The increased cap is phased DOWN -- never below a floor -- for
//     taxpayers with modified adjusted gross income (MAGI) above a
//     threshold: $500,000 for single/HOH/MFJ ($250,000 MFS) in 2025,
//     $505,000 ($252,500 MFS) in 2026. The reduction is 30 CENTS per dollar
//     of MAGI above the threshold -- NOT a cliff and not proportional to
//     the cap itself.
//   - The cap cannot be reduced below its permanent-law floor: $10,000
//     ($5,000 MFS), reached once the 30%-of-excess reduction alone would
//     exceed (increased cap - floor). Every taxpayer keeps at least the
//     floor amount regardless of income -- this is not a full phase-out to
//     zero, unlike some other OBBBA income-based limits in this portfolio
//     (e.g. the senior deduction, which the sibling
//     senior-deduction-calculator models, phases fully to zero).
//   - In 2030 the cap is scheduled to revert to $10,000 ($5,000 MFS)
//     permanently unless Congress acts again -- out of scope for this
//     2025/2026 tool.
//   - "MAGI" for this purpose is close to AGI for most filers (a small
//     number of foreign-income and territory exclusions are added back);
//     this module does not compute MAGI from other figures -- the user
//     supplies it directly.
//   - Several states offer a pass-through entity tax (PTET) election that
//     lets an owner of a partnership or S corporation have the ENTITY pay
//     state tax and deduct it above the SALT cap entirely, bypassing this
//     cap for that portion of tax. This module does not model PTET -- it
//     estimates the cap on state and local tax paid directly by an
//     individual filer, which is what the user supplies.
//
// This module does not verify a filer's MAGI, state and local taxes paid,
// or filing status -- the user supplies each figure, and the page points at
// a qualified tax professional as the source to verify against before
// filing.

export const SALT_CAP_RULES = {
  2025: { cap: 40_000, capMfs: 20_000, threshold: 500_000, thresholdMfs: 250_000 },
  2026: { cap: 40_400, capMfs: 20_200, threshold: 505_000, thresholdMfs: 252_500 },
};

export const SALT_FLOOR = 10_000;
export const SALT_FLOOR_MFS = 5_000;

export const PHASEOUT_RATE = 0.30;

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
 * The MAGI at which the phase-out alone would push the cap down to the
 * floor -- above this figure, the cap is flat at the floor no matter how
 * much higher MAGI goes.
 */
export function magiAtFloor({ threshold, cap, floor }) {
  return threshold + (cap - floor) / PHASEOUT_RATE;
}

/**
 * Computes the effective SALT cap after OBBBA's MAGI-based phase-out, and
 * the resulting deductible amount for state and local taxes actually paid.
 */
export function saltCapOutcome({
  filingStatus = "single",
  magi = 0,
  stateLocalTaxesPaid = 0,
  taxYear = 2025,
} = {}) {
  const rules = SALT_CAP_RULES[taxYear] || SALT_CAP_RULES[2025];
  const isMfs = filingStatus === "mfs";
  const cap = isMfs ? rules.capMfs : rules.cap;
  const threshold = isMfs ? rules.thresholdMfs : rules.threshold;
  const floor = isMfs ? SALT_FLOOR_MFS : SALT_FLOOR;

  const magiValue = Math.max(0, num(magi));
  const excessMagi = Math.max(0, magiValue - threshold);
  const reduction = excessMagi * PHASEOUT_RATE;
  const effectiveCap = Math.max(floor, cap - reduction);
  const atFloor = effectiveCap <= floor && excessMagi > 0;

  const taxesPaid = Math.max(0, num(stateLocalTaxesPaid));
  const deduction = Math.min(taxesPaid, effectiveCap);
  const nonDeductible = Math.max(0, taxesPaid - deduction);

  const floorReachedAtMagi = magiAtFloor({ threshold, cap, floor });

  const findings = [];

  if (taxesPaid <= 0) {
    findings.push({
      severity: "info",
      title: "Enter your state and local taxes paid to see the deductible amount",
      detail: "With no state/local tax figure entered, there is nothing to cap.",
    });
  }

  if (excessMagi > 0 && !atFloor) {
    findings.push({
      severity: "medium",
      title: `Your MAGI is above the ${money(threshold)} phase-out threshold`,
      detail: `The ${money(cap)} cap is reduced by 30 cents per dollar of MAGI above ${money(threshold)} -- ${money(excessMagi)} of excess MAGI reduces the cap by ${money(reduction)}, to ${money(effectiveCap)}.`,
    });
  }

  if (atFloor) {
    findings.push({
      severity: "high",
      title: `The cap is fully phased down to the ${money(floor)} floor`,
      detail: `At ${money(magiValue)} MAGI, the phase-out alone exceeds the ${money(cap - floor)} gap between the increased cap and its floor -- this happens once MAGI passes ${money(floorReachedAtMagi)}. The cap cannot go below ${money(floor)} regardless of how much higher MAGI goes; this is the same permanent-law amount every filer had before OBBBA.`,
    });
  }

  if (nonDeductible > 0) {
    findings.push({
      severity: "high",
      title: "Some of your state and local tax paid is not deductible",
      detail: `${money(taxesPaid)} paid, but only ${money(deduction)} is deductible under the ${money(effectiveCap)} effective cap -- ${money(nonDeductible)} is simply lost, not carried forward or deductible elsewhere.`,
    });
  }

  if (isMfs) {
    findings.push({
      severity: "info",
      title: "Married filing separately gets a halved cap and threshold",
      detail: `MFS uses a ${money(cap)} cap phasing out above ${money(threshold)} MAGI -- exactly half the ${money(rules.cap)} cap and ${money(rules.threshold)} threshold a joint return gets, not a per-person share of the same figures.`,
    });
  }

  findings.push({
    severity: "info",
    title: "Pass-through entity tax (PTET) elections are not modeled",
    detail: "Several states let a partnership or S corporation elect to pay state tax at the entity level, deducting it above this cap entirely for the owner's share. This calculator estimates the cap on state and local tax paid directly by an individual filer -- it does not model a PTET election's effect.",
  });

  return {
    filingStatus,
    isMfs,
    taxYear,
    cap,
    threshold,
    floor,
    magi: magiValue,
    excessMagi,
    reduction,
    effectiveCap,
    atFloor,
    floorReachedAtMagi,
    taxesPaid,
    deduction,
    nonDeductible,
    findings,
  };
}
