// Core arithmetic for the 2026 ACA premium tax credit (PTC) and its 400%-of-
// poverty cliff. No network calls: this applies published figures to numbers
// the user types. It is NOT tax advice.
//
// Figures, checked 2026-09-29 against IRS Rev. Proc. 2025-25 (2026 applicable
// percentage table) and the 2025 HHS poverty guidelines that govern 2026
// coverage:
//   - Enhanced (ARPA/IRA) credits expired after 2025, so the credit ends
//     entirely above 400% of the federal poverty line (FPL).
//   - Applicable percentage of MAGI the household is expected to pay toward
//     the benchmark (second-lowest-cost silver) plan, interpolated linearly
//     inside each band:
//        <133%      2.10%
//        133-150%   3.14% -> 4.19%
//        150-200%   4.19% -> 6.60%
//        200-250%   6.60% -> 8.44%
//        250-300%   8.44% -> 9.96%
//        300-400%   9.96%
//   - 2025 FPL, 48 states + DC: $15,650 + $5,500 per extra person.
//     Alaska $19,550 + $6,880. Hawaii $17,990 + $6,320.
//   - Repayment caps on excess advance credit no longer apply from tax year
//     2026: an advance credit larger than the final credit is repaid in full.
// Below 100% FPL most people get no credit (Medicaid or no eligibility); some
// lawfully present immigrants are an exception. The tool says so and does not
// model either case.

export const FPL_2025 = {
  contiguous: { base: 15_650, extra: 5_500, label: "48 states + DC" },
  alaska: { base: 19_550, extra: 6_880, label: "Alaska" },
  hawaii: { base: 17_990, extra: 6_320, label: "Hawaii" },
};

// [fplPercentUpperBound, startPct, endPct]
export const BANDS = [
  [133, 2.10, 2.10],
  [150, 3.14, 4.19],
  [200, 4.19, 6.60],
  [250, 6.60, 8.44],
  [300, 8.44, 9.96],
  [400, 9.96, 9.96],
];
const BAND_STARTS = [0, 133, 150, 200, 250, 300];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function money(n) {
  const v = Math.round(num(n));
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
}

export function fplAmount(householdSize, region = "contiguous") {
  const r = FPL_2025[region] || FPL_2025.contiguous;
  const size = Math.max(1, Math.floor(num(householdSize)) || 1);
  return r.base + r.extra * (size - 1);
}

// Applicable percentage (as a fraction) for an FPL percent, or null above the cliff.
export function applicablePercentage(fplPercent) {
  const p = num(fplPercent);
  if (p > 400) return null;
  for (let i = 0; i < BANDS.length; i++) {
    const [hi, a, b] = BANDS[i];
    if (p <= hi) {
      const lo = BAND_STARTS[i];
      if (a === b || hi === lo) return a / 100;
      const t = Math.max(0, (p - lo) / (hi - lo));
      return (a + (b - a) * t) / 100;
    }
  }
  return null;
}

// Annual credit for one income. benchmarkAnnual = annual premium of the
// benchmark plan for the whole household.
export function creditAt({ magi, householdSize, region, benchmarkAnnual }) {
  const fpl = fplAmount(householdSize, region);
  const income = Math.max(0, num(magi));
  const fplPercent = (income / fpl) * 100;
  const pct = applicablePercentage(fplPercent);
  const bench = Math.max(0, num(benchmarkAnnual));
  if (pct === null) return { fpl, fplPercent, pct: null, expected: null, credit: 0, aboveCliff: true };
  const expected = income * pct;
  return { fpl, fplPercent, pct, expected, credit: Math.max(0, bench - expected), aboveCliff: false };
}

export function analyze({ magi, householdSize = 1, region = "contiguous", benchmarkMonthly, planMonthly = null, deductionsAvailable = 0 }) {
  const benchmarkAnnual = Math.max(0, num(benchmarkMonthly)) * 12;
  const here = creditAt({ magi, householdSize, region, benchmarkAnnual });
  const cliff = here.fpl * 4;
  const atCliff = creditAt({ magi: cliff, householdSize, region, benchmarkAnnual }).credit;
  const overBy = Math.max(0, num(magi) - cliff);
  const findings = [];

  if (here.fplPercent < 100) {
    findings.push({ severity: "medium", title: "Below 100% of the poverty line", detail: "Most people below 100% of FPL do not qualify for the premium tax credit (some lawfully present immigrants do) and, in many states, qualify for Medicaid instead. This tool does not model either case; the credit shown may not apply." });
  } else if (here.fplPercent < 138) {
    findings.push({ severity: "info", title: "You may qualify for Medicaid", detail: "In states that expanded Medicaid, adults under 138% of FPL are generally eligible for Medicaid, which usually beats a marketplace plan. Check your state's rules." });
  }

  if (here.aboveCliff) {
    findings.push({ severity: "high", title: `You are ${money(overBy)} over the 400% cliff`, detail: `At ${money(cliff)} of MAGI you would still receive about ${money(atCliff)} a year in credit; one dollar more removes all of it. If this income is a forecast, lowering MAGI by ${money(overBy)} restores that credit.` });
    const usable = Math.min(overBy, Math.max(0, num(deductionsAvailable)));
    if (num(deductionsAvailable) > 0) {
      findings.push(usable >= overBy
        ? { severity: "info", title: "Your available deductions are enough to get under", detail: `You listed ${money(deductionsAvailable)} of deductions you could still make (for example HSA, solo 401(k) or SEP contributions). Using ${money(overBy)} of it puts MAGI at the cliff.` }
        : { severity: "medium", title: "Your listed deductions fall short of the cliff", detail: `You listed ${money(deductionsAvailable)}, which leaves you ${money(overBy - usable)} over.` });
    }
  } else {
    const room = cliff - num(magi);
    findings.push({ severity: room < cliff * 0.1 ? "medium" : "info", title: `${money(room)} of room before the cliff`, detail: `The credit disappears completely if MAGI passes ${money(cliff)}. Income at or under it keeps the credit; one dollar over loses about ${money(atCliff)} a year.` });
    if (room < cliff * 0.1) {
      findings.push({ severity: "medium", title: "Close to the cliff", detail: "Small surprises near the line (a year-end payment, a capital gain, a smaller deduction than planned) can cost the whole credit. Consider updating your marketplace income estimate and planning deductions before year end." });
    }
  }

  const plan = planMonthly === null || planMonthly === "" ? null : Math.max(0, num(planMonthly)) * 12;
  const advanceMonthly = here.credit / 12;
  if (plan !== null) {
    const afterCredit = Math.max(0, plan - here.credit);
    findings.push({ severity: "info", title: "Your plan after the credit", detail: `A plan costing ${money(plan / 12)} a month would cost about ${money(afterCredit / 12)} a month after a ${money(advanceMonthly)} monthly credit.` });
  }

  findings.push({ severity: "high", title: "Advance credits are repaid in full if income comes in high", detail: "Starting with tax year 2026 there is no cap on repaying excess advance credit. If you take the credit monthly based on an income estimate and your final MAGI ends above 400% of FPL, the whole amount received is owed at tax time. Underestimating income is the expensive mistake." });

  return { ...here, benchmarkAnnual, cliff, atCliff, overBy, advanceMonthly, findings };
}

// A grid of incomes around the cliff for the "what if" table.
export function scenarioTable({ magi, householdSize = 1, region = "contiguous", benchmarkMonthly }) {
  const fpl = fplAmount(householdSize, region);
  const cliff = fpl * 4;
  const bench = Math.max(0, num(benchmarkMonthly)) * 12;
  const points = new Set([
    Math.round(fpl * 2), Math.round(fpl * 3), Math.round(cliff - 5000), Math.round(cliff), Math.round(cliff + 1), Math.round(cliff + 5000),
  ]);
  if (num(magi) > 0) points.add(Math.round(num(magi)));
  return [...points].sort((a, b) => a - b).map((income) => {
    const r = creditAt({ magi: income, householdSize, region, benchmarkAnnual: bench });
    return { income, fplPercent: r.fplPercent, credit: r.credit, aboveCliff: r.aboveCliff };
  });
}
