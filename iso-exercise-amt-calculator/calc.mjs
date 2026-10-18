// ISO exercise and the alternative minimum tax: how many incentive stock
// options can be exercised this year before the spread starts costing AMT.
// Deterministic and local. Tax year 2026 parameters (Rev. Proc. 2025-32 and the
// 2025 reconciliation act's AMT phase-out reset); the page says to check them.

export const TAX_YEAR = 2026;
export const STATUSES = { single: "Single", mfj: "Married filing jointly", hoh: "Head of household" };
export const STANDARD_DEDUCTION = { single: 16100, mfj: 32200, hoh: 24150 };
const BRACKETS = {
  single: [[12400, 0.1], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
  mfj: [[24800, 0.1], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
  hoh: [[17700, 0.1], [67450, 0.12], [105700, 0.22], [201750, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]],
};
// AMT: head of household uses the single amounts.
export const AMT_EXEMPTION = { single: 90100, mfj: 140200, hoh: 90100 };
export const AMT_PHASEOUT_START = { single: 500000, mfj: 1000000, hoh: 500000 };
export const AMT_PHASEOUT_RATE = 0.5;
export const AMT_28_THRESHOLD = 244500;

export const round2 = (n) => Math.round(n * 100) / 100;
export const money = (n) => Math.round(n).toLocaleString("en-US");
export function parseNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return NaN;
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}

export function regularTax(taxable, status) {
  let tax = 0, lower = 0;
  for (const [upper, rate] of BRACKETS[status]) {
    if (taxable > lower) tax += (Math.min(taxable, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
}

export function amtExemption(amti, status) {
  return Math.max(0, AMT_EXEMPTION[status] - AMT_PHASEOUT_RATE * Math.max(0, amti - AMT_PHASEOUT_START[status]));
}
export function tentativeMinimumTax(amti, status) {
  const base = Math.max(0, amti - amtExemption(amti, status));
  return 0.26 * Math.min(base, AMT_28_THRESHOLD) + 0.28 * Math.max(0, base - AMT_28_THRESHOLD);
}

// AMT for a given ISO spread. `year` carries the fixed parts of the return.
export function amtFor(year, spread) {
  const { status, wages, pretax, itemized, salt } = year;
  const ded = itemized > STANDARD_DEDUCTION[status] ? itemized : STANDARD_DEDUCTION[status];
  const regularTaxable = Math.max(0, wages - pretax - ded);
  const reg = regularTax(regularTaxable, status);
  // The standard deduction is not allowed for AMT; itemized deductions are, minus state and local taxes.
  const amtDed = itemized > STANDARD_DEDUCTION[status] ? Math.max(0, itemized - salt) : 0;
  const amti = Math.max(0, wages - pretax - amtDed + spread);
  const tmt = tentativeMinimumTax(amti, status);
  return { regularTaxable, regular: reg, amti, exemption: amtExemption(amti, status), tmt, amt: Math.max(0, tmt - reg) };
}

// Largest spread that still costs no AMT (bisection: AMT is nondecreasing in spread).
export function crossoverSpread(year, cap = 20_000_000) {
  if (amtFor(year, 0).amt > 0.005) return 0;
  if (amtFor(year, cap).amt <= 0.005) return cap;
  let lo = 0, hi = cap;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (amtFor(year, mid).amt <= 0.005) lo = mid; else hi = mid;
  }
  return lo;
}

function pct(v, dflt, name, max) {
  if (String(v ?? "").trim() === "") return { v: dflt };
  const n = parseNum(v);
  if (!(n >= 0 && n <= max)) return { error: `${name} must be between 0 and ${max}.` };
  return { v: n };
}

export function analyze(input) {
  const status = input.status;
  if (!STANDARD_DEDUCTION[status]) return { error: "Choose a filing status." };
  const wages = parseNum(input.wages);
  if (!(wages >= 0)) return { error: "Enter your expected 2026 wages and other ordinary income as a number (0 is allowed)." };
  const pretax = String(input.pretax ?? "").trim() === "" ? 0 : parseNum(input.pretax);
  if (!(pretax >= 0)) return { error: "Pre-tax deductions must be a number, or blank." };
  const itemized = String(input.itemized ?? "").trim() === "" ? 0 : parseNum(input.itemized);
  if (!(itemized >= 0)) return { error: "Itemized deductions must be a number, or blank." };
  const salt = String(input.salt ?? "").trim() === "" ? 0 : parseNum(input.salt);
  if (!(salt >= 0 && salt <= itemized)) return { error: "State and local taxes in your itemized deductions cannot exceed the itemized total." };
  const strike = parseNum(input.strike), fmv = parseNum(input.fmv), granted = parseNum(input.options);
  if (!(strike >= 0)) return { error: "Enter the option strike price (0 or more)." };
  if (!(fmv > 0)) return { error: "Enter the current 409A fair market value per share, above zero." };
  if (!(granted > 0 && Number.isInteger(granted))) return { error: "Enter a whole number of vested options you could exercise." };
  if (fmv <= strike) return { error: "The fair market value must be above the strike price; otherwise there is no spread and no AMT to plan for." };
  const priorCredit = String(input.amtCredit ?? "").trim() === "" ? 0 : parseNum(input.amtCredit);
  if (!(priorCredit >= 0)) return { error: "Prior-year AMT credit must be a number, or blank." };
  const salePrice = String(input.salePrice ?? "").trim() === "" ? null : parseNum(input.salePrice);
  if (salePrice !== null && !(salePrice >= 0)) return { error: "Expected future sale price must be a number, or blank." };

  const year = { status, wages, pretax, itemized, salt };
  const per = fmv - strike;
  const base = amtFor(year, 0);
  const crossSpread = crossoverSpread(year);
  const crossOptions = Math.min(granted, Math.floor(crossSpread / per));

  const shares = [...new Set([0, Math.round(granted * 0.25), Math.round(granted * 0.5), Math.round(granted * 0.75), granted, crossOptions])].filter((n) => n >= 0 && n <= granted).sort((a, b) => a - b);
  const rows = shares.map((n) => {
    const spread = n * per, r = amtFor(year, spread);
    return { options: n, cost: n * strike, spread, amti: r.amti, amt: r.amt, cash: n * strike + r.amt, marginal: null, isCrossover: n === crossOptions, isAll: n === granted };
  });
  for (let i = 1; i < rows.length; i++) {
    const ds = rows[i].spread - rows[i - 1].spread;
    rows[i].marginal = ds > 0 ? (rows[i].amt - rows[i - 1].amt) / ds : null;
  }
  const all = rows.find((r) => r.isAll);
  const cross = rows.find((r) => r.isCrossover);

  // Future value of the credit: AMT paid on ISO spread comes back as a credit against
  // regular tax in later years; the amount below is the maximum, not a forecast.
  const creditGenerated = all.amt;
  const saleGain = salePrice !== null ? granted * (salePrice - fmv) : null;

  const findings = [];
  if (base.amt > 0.5) findings.push({ severity: "medium", title: `You already owe AMT of $${money(base.amt)} before any exercise`, detail: "Your other income and deductions put you over the AMT line on their own, so every ISO dollar of spread is taxed at the AMT rate." });
  if (crossOptions >= granted && base.amt <= 0.5 && all.amt <= 0.5) findings.push({ severity: "info", title: "You can exercise all of them this year without AMT", detail: `The spread on all ${money(granted)} options is $${money(all.spread)}, which fits under your AMT crossover of about $${money(Math.min(crossSpread, 1e9))}.` });
  else if (crossOptions > 0) findings.push({ severity: "info", title: `Exercise up to ${money(crossOptions)} options and pay no AMT`, detail: `That is a spread of about $${money(crossOptions * per)} and costs $${money(crossOptions * strike)} to exercise. Past that point each extra dollar of spread is taxed at the AMT rate.` });
  else if (base.amt <= 0.5) findings.push({ severity: "medium", title: "Even one option triggers AMT", detail: "Your income leaves no room under the AMT line this year. Exercising anyway is a bet on the stock, paid for in tax now." });
  if (all.amt > 0.5) findings.push({ severity: "medium", title: `Exercising all ${money(granted)} would cost $${money(all.amt)} of AMT plus $${money(all.cost)} to exercise`, detail: `That is $${money(all.cash)} of cash for shares you may not be able to sell. ISO exercise has no withholding, so it is due through estimated payments, the fourth-quarter one is due January 15.` });
  if (creditGenerated > 0.5) findings.push({ severity: "info", title: `About $${money(creditGenerated)} of AMT could come back as a credit`, detail: "AMT paid on ISO spread is a timing difference. It carries forward as a credit against regular tax in later years, but only when your regular tax exceeds your AMT, which can take years, and it is not refunded if the stock falls." });
  if (per > 0) findings.push({ severity: "info", title: "Selling in the same year is not AMT", detail: "If you exercise and sell in the same calendar year the sale is a disqualifying disposition: the spread becomes ordinary wages instead of an AMT adjustment. Holding for the ISO benefit means one year after exercise and two after grant." });
  if (saleGain !== null) findings.push({ severity: "info", title: `At a $${money(salePrice)} future price the total gain on ${money(granted)} shares is $${money(granted * (salePrice - strike))}`, detail: `Of that, $${money(all.spread)} is spread at exercise and $${money(saleGain)} is later gain (negative means the stock is below today's value).` });

  return { year: TAX_YEAR, status, wages, pretax, strike, fmv, granted, perOption: per, base, crossoverSpread: crossSpread, crossoverOptions: crossOptions, rows, findings, creditGenerated, saleGain, amtDueDate: `${TAX_YEAR + 1}-01-15` };
}

export function sampleInput() {
  return { status: "single", wages: "210000", pretax: "23500", itemized: "", salt: "", strike: "2.50", fmv: "14.00", options: "20000", amtCredit: "", salePrice: "30" };
}

const csvCell = (v) => { let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function reportCsv(a) {
  const rows = [["Options exercised", "Exercise cost", "Spread", "AMT income", "AMT owed", "Cash needed", "Marginal AMT rate on added spread"]];
  for (const r of a.rows) rows.push([r.options, round2(r.cost), round2(r.spread), round2(r.amti), round2(r.amt), round2(r.cash), r.marginal === null ? "" : (r.marginal * 100).toFixed(1) + "%"]);
  rows.push([], ["Options you can exercise with no AMT", a.crossoverOptions], ["AMT due through estimated payments by", a.amtDueDate]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
