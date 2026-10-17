// Core arithmetic for the Roth conversion "bracket fill", tax year 2026.
// No network calls: this applies published IRS/SSA rules to the numbers the
// user supplies. It is NOT tax advice -- see README "What this does not cover".
//
// Verified 2026-09-29 against Rev. Proc. 2025-32 (2026 inflation adjustments,
// as tabulated by the Tax Foundation) and 2026 Medicare IRMAA tiers:
//
//   - 2026 ordinary brackets 10/12/22/24/32/35/37% (tables below).
//   - Standard deduction $16,100 single, $32,200 joint, $24,150 head of
//     household; additional $2,050 (single/HoH) or $1,650 per spouse (joint)
//     at 65 or older.
//   - The 2025-2028 "senior deduction" of $6,000 per person 65 or older, which
//     phases out at 6% of modified AGI over $75,000 single / $150,000 joint.
//     A Roth conversion raises MAGI, so inside the phase-out every conversion
//     dollar also gives back 6 cents of deduction: the real marginal rate is
//     the bracket rate x 1.06. Most conversion calculators miss this.
//   - First IRMAA tier for 2026 premiums: MAGI over $109,000 single /
//     $218,000 joint. Premiums two years after the conversion year look at
//     this year's return.

export const TAX_YEAR = 2026;

// [upper bound of bracket, rate]; last bound is Infinity.
export const BRACKETS = {
  single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
  mfj: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
  hoh: [[17700, 0.10], [67450, 0.12], [105700, 0.22], [201775, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]],
};
export const STANDARD_DEDUCTION = { single: 16100, mfj: 32200, hoh: 24150 };
export const ADDITIONAL_65 = { single: 2050, mfj: 1650, hoh: 2050 };
export const SENIOR_DEDUCTION = 6000;
export const SENIOR_PHASEOUT_RATE = 0.06;
export const SENIOR_PHASEOUT_START = { single: 75000, mfj: 150000, hoh: 75000 };
export const IRMAA_FIRST_TIER = { single: 109000, mfj: 218000, hoh: 109000 };
export const RATES = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const round2 = (n) => Math.round(n * 100) / 100;

export function money(n) {
  const v = Math.round(n * 100) / 100;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const statusOf = (s) => (BRACKETS[s] ? s : "single");

export function incomeTax(taxable, status) {
  let tax = 0, lower = 0;
  for (const [upper, rate] of BRACKETS[statusOf(status)]) {
    if (taxable <= lower) break;
    tax += (Math.min(taxable, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
}

// Deductions at a given AGI, including the senior-deduction phase-out.
export function deductionsAt(agi, { status, seniors, deductionOverride }) {
  const st = statusOf(status);
  const base = deductionOverride > 0 ? deductionOverride : STANDARD_DEDUCTION[st] + ADDITIONAL_65[st] * seniors;
  const senior = Math.max(0, SENIOR_DEDUCTION * seniors - SENIOR_PHASEOUT_RATE * Math.max(0, agi - SENIOR_PHASEOUT_START[st]));
  return { base, senior, total: base + senior };
}

export function taxableAt(agi, opts) {
  return Math.max(0, agi - deductionsAt(agi, opts).total);
}

// Largest conversion C >= 0 with taxableAt(agi + C) <= bracketTop.
// taxableAt is non-decreasing in agi, so bisection is exact to the cent.
export function fillTo(agi, bracketTop, opts) {
  if (taxableAt(agi, opts) > bracketTop) return 0;
  let lo = 0, hi = bracketTop + 1e6;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (taxableAt(agi + mid, opts) <= bracketTop) lo = mid; else hi = mid;
  }
  return Math.floor(lo * 100) / 100;
}

export function rothConversion(input = {}) {
  const status = statusOf(input.filingStatus);
  const agi = num(input.agi);
  const seniors = Math.min(status === "mfj" ? 2 : 1, Math.max(0, Math.floor(num(input.seniors))));
  const deductionOverride = num(input.deductionOverride);
  const targetRate = RATES.includes(Number(input.targetRate)) ? Number(input.targetRate) : 0.24;
  const balance = num(input.balance);
  const opts = { status, seniors, deductionOverride };

  const table = BRACKETS[status];
  const top = table.find(([, r]) => r === targetRate)[0];
  if (!Number.isFinite(top)) return { invalid: true };

  const taxableBefore = taxableAt(agi, opts);
  const ded = deductionsAt(agi, opts);
  const conversion = fillTo(agi, top, opts);
  const taxableAfter = taxableAt(agi + conversion, opts);
  const taxBefore = incomeTax(taxableBefore, status);
  const conversionTax = round2(incomeTax(taxableAfter, status) - taxBefore);
  const effectiveRate = conversion > 0 ? conversionTax / conversion : 0;

  // Marginal cost of the next $1,000 converted at this point.
  const probe = conversion || 0;
  const nextTax = incomeTax(taxableAt(agi + probe + 1000, opts), status) - incomeTax(taxableAt(agi + probe, opts), status);
  const marginalRate = nextTax / 1000;

  // Room in every bracket, for the comparison table.
  const rows = table.filter(([u]) => Number.isFinite(u)).map(([upper, rate]) => {
    const c = fillTo(agi, upper, opts);
    const t = round2(incomeTax(taxableAt(agi + c, opts), status) - taxBefore);
    return { rate, bracketTop: upper, conversion: c, tax: t, effectiveRate: c > 0 ? t / c : 0 };
  });

  const ladderYears = conversion > 0 && balance > 0 ? Math.ceil(balance / conversion) : 0;
  const findings = [];

  const phaseInside = seniors > 0 && agi + conversion > SENIOR_PHASEOUT_START[status] && deductionsAt(agi + conversion, opts).senior > 0;
  if (phaseInside) {
    findings.push({
      severity: "high",
      title: "Senior deduction phase-out raises your real rate",
      detail: `At 65 or older, the $6,000 senior deduction shrinks by 6 cents for every dollar of income above ${money(SENIOR_PHASEOUT_START[status])}. Converted dollars in that range cost the bracket rate times 1.06, and this calculator already accounts for it: filling the ${Math.round(targetRate * 100)}% bracket costs ${(effectiveRate * 100).toFixed(1)}% on average, not ${Math.round(targetRate * 100)}%. The senior deduction is scheduled for tax years 2025-2028.`,
    });
  }

  const magiAfter = agi + conversion;
  const irmaa = IRMAA_FIRST_TIER[status];
  if (agi > irmaa) {
    findings.push({
      severity: "info",
      title: "You are already above the first IRMAA tier",
      detail: `Your income before converting (${money(agi)}) is above ${money(irmaa)}. If you are on Medicare two years from now, this year's return sets that year's Part B and D premiums, and each higher tier is a cliff. Check the tier table before converting more.`,
    });
  } else if (magiAfter > irmaa) {
    findings.push({
      severity: "high",
      title: "This conversion crosses the first IRMAA tier",
      detail: `Income after converting is about ${money(magiAfter)}, over the ${money(irmaa)} first Medicare surcharge tier for 2026. IRMAA is a cliff, not a slope: one dollar over adds a premium surcharge for the whole year, two years later. It only matters if you will be on Medicare then (or turn 65 within two years). To stay under, convert at most ${money(Math.max(0, fillTo(agi, Math.max(0, irmaa - deductionsAt(irmaa, opts).total), opts)))} (an approximation that treats MAGI as AGI plus the conversion).`,
    });
  }

  if (conversion === 0) {
    findings.push({
      severity: "info",
      title: "No room left in this bracket",
      detail: `Your taxable income before converting (${money(taxableBefore)}) is already above the top of the ${Math.round(targetRate * 100)}% bracket (${money(top)}). Pick a higher bracket or convert in a lower-income year.`,
    });
  }

  if (ladderYears > 1) {
    findings.push({
      severity: "info",
      title: `About ${ladderYears} years to convert ${money(balance)} at this pace`,
      detail: `At ${money(conversion)} a year (ignoring growth, inflation-indexed brackets and future income changes), the balance takes roughly ${ladderYears} years. Each conversion has its own five-year clock before converted principal can leave a Roth IRA penalty-free if you are under 59½.`,
    });
  } else if (ladderYears === 1) {
    findings.push({ severity: "info", title: "Your balance fits in one year", detail: `The whole ${money(balance)} fits under the top of this bracket.` });
  }

  findings.push({
    severity: "info",
    title: "Pay the tax from outside the IRA",
    detail: `Withholding the tax from the conversion itself shrinks what reaches the Roth and, if you are under 59½, the withheld amount is an early distribution. The tax on this conversion is ${money(conversionTax)}.`,
  });

  return {
    invalid: false,
    status, seniors, targetRate, bracketTop: top,
    agi, deductions: round2(ded.total), taxableBefore: round2(taxableBefore),
    conversion, conversionTax, effectiveRate, marginalRate,
    taxableAfter: round2(taxableAfter), rows, ladderYears,
    totalLadderTax: ladderYears > 0 ? round2(Math.min(balance, conversion * ladderYears) * effectiveRate) : 0,
    findings,
  };
}
