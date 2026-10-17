// Inherited-IRA 10-year withdrawal planner, tax year 2026 brackets held constant.
// Model: the balance grows at `growth` through each year and the withdrawal is taken at year end. Each plan is
// scored by after-tax wealth at the end of the window, assuming after-tax proceeds are invested at the same
// growth rate (no tax drag). Federal ordinary income tax only, standard deduction, other income entered per year.
// The "best" plan is found by dynamic programming over the balance; it is an estimate, not advice.

export const TAX_YEAR = 2026;
export const BRACKETS = {
  single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
  mfj: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
  hoh: [[17700, 0.10], [67450, 0.12], [105700, 0.22], [201775, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]],
};
export const STANDARD_DEDUCTION = { single: 16100, mfj: 32200, hoh: 24150 };

// Approximate IRS Single Life Expectancy factors (Pub. 590-B Table I), linearly interpolated between anchor ages.
// The page tells the user to replace this with the exact factor from the IRS table.
const ANCHORS = [[20, 66.0], [30, 55.3], [40, 46.0], [50, 36.2], [60, 27.1], [70, 18.8], [80, 11.2], [90, 5.7], [100, 2.9], [110, 2.1]];
export function approxLifeFactor(age) {
  const a = Math.min(110, Math.max(20, Number(age) || 0));
  for (let i = 1; i < ANCHORS.length; i++) {
    const [a1, f1] = ANCHORS[i];
    if (a <= a1) {
      const [a0, f0] = ANCHORS[i - 1];
      return Math.round((f0 + ((f1 - f0) * (a - a0)) / (a1 - a0)) * 10) / 10;
    }
  }
  return 2.1;
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const statusOf = (s) => (BRACKETS[s] ? s : "single");

export function money(n) {
  const v = Math.round(n);
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function incomeTax(taxable, status) {
  let tax = 0, lower = 0;
  for (const [upper, rate] of BRACKETS[statusOf(status)]) {
    if (taxable <= lower) break;
    tax += (Math.min(taxable, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
}

export function marginalRate(taxable, status) {
  for (const [upper, rate] of BRACKETS[statusOf(status)]) if (taxable < upper) return rate;
  return 0.37;
}

// Tax caused by withdrawing w on top of `other` income (AGI before the IRA) in one year.
export function taxOn(w, other, status, deductionOverride = 0) {
  const ded = deductionOverride > 0 ? deductionOverride : STANDARD_DEDUCTION[statusOf(status)];
  return incomeTax(Math.max(0, other + w - ded), status) - incomeTax(Math.max(0, other - ded), status);
}

// Simulate a plan: policy(t, balance, rmd, available) -> withdrawal for year t (1-based). Final year drains the account.
export function simulate(inp, policy) {
  const { balance, growth, years, factor, rmdRequired, otherIncome, status, deduction } = inp;
  const rows = [];
  let b = balance, wealth = 0, totalTax = 0, totalWithdrawn = 0, pvTax = 0;
  for (let t = 1; t <= years; t++) {
    const f = factor - (t - 1);
    const rmd = rmdRequired && f > 1 ? b / f : rmdRequired ? b : 0;
    const available = b * (1 + growth);
    let w = t === years ? available : Math.min(available, Math.max(rmd, policy(t, b, rmd, available)));
    if (w < 0) w = 0;
    const other = otherIncome[t - 1];
    const tax = taxOn(w, other, status, deduction);
    wealth += (w - tax) * Math.pow(1 + growth, years - t);
    totalTax += tax; totalWithdrawn += w; pvTax += tax / Math.pow(1 + growth, t);
    const taxable = Math.max(0, other + w - (deduction > 0 ? deduction : STANDARD_DEDUCTION[statusOf(status)]));
    rows.push({ year: t, startBalance: b, rmd: Math.min(rmd, available), withdrawal: w, tax, other, marginal: marginalRate(taxable, status), endBalance: available - w });
    b = available - w;
  }
  return { rows, wealth, totalTax, totalWithdrawn, pvTax };
}

// Because after-tax proceeds earn the same return as the account, the objective reduces to minimising the
// present-value-weighted tax subject to a fixed present value withdrawn. For a convex tax schedule that means
// equalising marginal rates across years: fill the lowest brackets in every year first ("water-filling"), then
// split the remainder inside the first bracket that cannot be filled in all years. Recomputed each year so that
// a required minimum that pushes a year above its share is absorbed by the years that remain.
function bestPolicy(inp) {
  const { growth, years, otherIncome, status, deduction } = inp;
  const ded = deduction > 0 ? deduction : STANDARD_DEDUCTION[statusOf(status)];
  const levels = [ded, ...BRACKETS[statusOf(status)].map(([u]) => (Number.isFinite(u) ? u + ded : 1e12))];
  return (t, b, rmd, available) => {
    if (t === years) return available;
    const d = (s) => Math.pow(1 + growth, -(s - t + 1));
    const cap = (s, j) => Math.max(0, levels[j] - otherIncome[s - 1]);
    const pv = (j) => { let x = 0; for (let s = t; s <= years; s++) x += d(s) * cap(s, j); return x; };
    let j = 0;
    while (j < levels.length - 1 && pv(j) < b) j++;
    const prev = j > 0 ? pv(j - 1) : 0;
    const roomPv = pv(j) - prev;
    const frac = roomPv > 0 ? Math.min(1, Math.max(0, (b - prev) / roomPv)) : 0;
    const lowCap = j > 0 ? cap(t, j - 1) : 0;
    return Math.min(available, lowCap + frac * (cap(t, j) - lowCap));
  };
}

export function normalize(raw) {
  const years = Math.min(10, Math.max(1, Math.round(num(raw.years) || 10)));
  const other = Array.isArray(raw.otherIncome) ? raw.otherIncome.map(num) : [];
  const flat = num(raw.otherIncomeFlat);
  const otherIncome = Array.from({ length: years }, (_, i) => (other[i] !== undefined ? other[i] : flat));
  const growth = Math.min(0.2, Math.max(-0.2, Number(raw.growth) || 0));
  return {
    balance: num(raw.balance), growth, years,
    rmdRequired: Boolean(raw.rmdRequired),
    factor: num(raw.factor) || approxLifeFactor(raw.beneficiaryAge),
    otherIncome, status: statusOf(raw.status), deduction: num(raw.deduction),
  };
}

export function plan(raw) {
  const inp = normalize(raw);
  if (!(inp.balance > 0)) return { invalid: true };
  const wait = simulate(inp, () => 0);
  const even = simulate(inp, (t, b, rmd, a) => a / (inp.years - t + 1));
  const dp = simulate(inp, bestPolicy(inp));
  const candidates = [["best", dp], ["even", even], ["wait", wait]];
  candidates.sort((x, y) => y[1].wealth - x[1].wealth);
  const best = candidates[0][1];
  const plans = { best: candidates[0][1], even, wait };
  const bestKey = candidates[0][0] === "best" ? "best" : candidates[0][0];
  const findings = [];
  const gainVsWait = best.wealth - wait.wealth;
  const worstMarginal = Math.max(...wait.rows.map((r) => r.marginal));
  if (inp.rmdRequired) findings.push({ severity: "high", title: "Annual withdrawals are required in years 1 to " + (inp.years - 1), detail: "Because the original owner had started required distributions, you must take a yearly minimum (balance divided by the life-expectancy factor, reduced by one each year) and empty the account by the end of year " + inp.years + ". Missing a minimum triggers a 25% excise tax on the shortfall (10% if corrected within two years). The \"wait\" column here is the minimum-only path." });
  else findings.push({ severity: "info", title: "No yearly minimum assumed", detail: "You said the original owner died before their required beginning date, so only the end-of-year-" + inp.years + " deadline applies. If that is wrong, switch the toggle: skipping a required minimum costs a 25% excise tax on the shortfall." });
  if (worstMarginal >= 0.32) findings.push({ severity: "high", title: "Waiting pushes the whole balance into the " + Math.round(worstMarginal * 100) + "% bracket", detail: "Taking everything in the last year puts the top dollars of the balance at " + Math.round(worstMarginal * 100) + "%. Spreading withdrawals lowers that; the best plan below shows by how much." });
  findings.push({ severity: "medium", title: "Not everyone is on the 10-year rule", detail: "A surviving spouse, a minor child of the owner, a disabled or chronically ill person, and someone not more than 10 years younger than the owner are eligible designated beneficiaries with different rules (including stretching over a lifetime). This planner assumes you are not one of them. Inherited Roth IRAs have no tax to plan, but the 10-year deadline still applies." });
  findings.push({ severity: "info", title: "What was not modelled", detail: "State tax, the 3.8% net investment income tax, Medicare IRMAA surcharges, Social Security taxation, credits, AMT and future bracket changes. Brackets are held at 2026 levels. The life-expectancy factor is approximated from your age unless you enter the exact one." });
  return { inp, plans, best, wait, even, gainVsWait, bestKey: candidates[0][0], findings };
}

// Per-year other income from "now" until `changeYear` (1-based first year of the later level), then `later`.
export function incomePath(now, changeYear, later, years) {
  const cy = Math.round(num(changeYear));
  return Array.from({ length: years }, (_, i) => (cy > 0 && i + 1 >= cy ? num(later) : num(now)));
}
