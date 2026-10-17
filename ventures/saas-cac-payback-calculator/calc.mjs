// SaaS CAC payback and LTV:CAC arithmetic. Pure functions, no DOM, no I/O.
//
// Model (stated on the page so a founder can disagree with it):
//   * A signed-up customer contributes m = price x grossMargin per month,
//     collected at the start of each month, starting in month 0.
//   * Each month a customer survives with probability s = 1 - churn.
//   * Surviving customers' revenue grows by `expansion` per month, so the
//     expected contribution in month t is m * r^t with r = s * (1 + expansion).
//   * Cash is discounted at an annual cost of capital, compounded monthly:
//     d = (1 + k)^(-1/12). Discounting is applied to LTV only; payback is
//     the conventional undiscounted "months until cumulative gross profit
//     covers CAC".
// Closed form: cumulative expected gross profit over n months is
//   m * (1 - r^n) / (1 - r)   (n * m when r = 1).

export const PAYBACK_CAP_MONTHS = 120;
export const CAC_MULTIPLIERS = [0.5, 0.75, 1, 1.5, 2];
export const CHURN_MULTIPLIERS = [0.5, 1, 1.5, 2];

export function money(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
export function pct(n, digits = 1) {
  return `${(n * 100).toFixed(digits)}%`;
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);

export function validate(raw = {}) {
  const i = {
    cac: num(raw.cac), price: num(raw.price), grossMargin: num(raw.grossMargin),
    monthlyChurn: num(raw.monthlyChurn), expansion: num(raw.expansion ?? 0),
    costOfCapital: num(raw.costOfCapital ?? 0), targetPaybackMonths: num(raw.targetPaybackMonths ?? 12),
  };
  if (!(i.cac > 0)) return { invalid: "Enter the fully-loaded cost to acquire one customer (CAC), greater than zero." };
  if (!(i.price > 0)) return { invalid: "Enter the monthly revenue per customer, greater than zero." };
  if (!(i.grossMargin > 0 && i.grossMargin <= 1)) return { invalid: "Gross margin must be above 0% and at most 100%." };
  if (!(i.monthlyChurn >= 0 && i.monthlyChurn < 1)) return { invalid: "Monthly churn must be from 0% to under 100%." };
  if (!(i.expansion >= 0 && i.expansion < 1)) return { invalid: "Monthly expansion must be from 0% to under 100%." };
  if (!(i.costOfCapital >= 0 && i.costOfCapital < 10)) return { invalid: "Cost of capital must be a sensible annual rate (0% to under 1000%)." };
  if (!(i.targetPaybackMonths >= 1 && i.targetPaybackMonths <= PAYBACK_CAP_MONTHS)) return { invalid: `Target payback must be 1 to ${PAYBACK_CAP_MONTHS} months.` };
  return { input: i };
}

const ratio = (i) => (1 - i.monthlyChurn) * (1 + i.expansion);
const contribution = (i) => i.price * i.grossMargin;

// Expected cumulative gross profit per signed-up customer after n months.
export function cumulativeProfit(i, n) {
  const m = contribution(i), r = ratio(i);
  if (Math.abs(1 - r) < 1e-12) return m * n;
  return (m * (1 - Math.pow(r, n))) / (1 - r);
}

// Conventional payback: CAC over one month's gross profit, ignoring churn.
export function simplePaybackMonths(i) {
  return i.cac / contribution(i);
}

// Churn-adjusted payback: first whole month n at which expected cumulative
// gross profit covers CAC. Iterative on purpose so the tests can cross-check
// it against the closed form below.
export function churnAdjustedPayback(i) {
  let cum = 0, weight = 1;
  const m = contribution(i), r = ratio(i);
  for (let n = 1; n <= PAYBACK_CAP_MONTHS; n++) {
    cum += m * weight;
    weight *= r;
    if (cum >= i.cac - 1e-9) return { months: n };
  }
  return { months: null };
}

// Closed form for the same quantity (fractional months). Null if never.
export function churnAdjustedPaybackClosedForm(i) {
  const m = contribution(i), r = ratio(i);
  if (Math.abs(1 - r) < 1e-12) return i.cac / m;
  const x = 1 - (i.cac * (1 - r)) / m;
  if (r < 1) return x <= 0 ? null : Math.log(x) / Math.log(r);
  return x <= 0 ? null : Math.log(x) / Math.log(r);
}

// Lifetime value of expected gross profit. Undiscounted needs r < 1;
// with discounting the effective ratio is r * d.
export function lifetimeValue(i, { discounted = false } = {}) {
  const d = discounted ? Math.pow(1 + i.costOfCapital, -1 / 12) : 1;
  const q = ratio(i) * d;
  if (q >= 1) return Infinity;
  return contribution(i) / (1 - q);
}

export function maxCacForPayback(i, months = i.targetPaybackMonths) {
  return cumulativeProfit(i, months);
}

export function paybackSensitivity(i) {
  const churns = CHURN_MULTIPLIERS.map((k) => Math.min(i.monthlyChurn * k, 0.999));
  const rows = CAC_MULTIPLIERS.map((cm) => ({
    cac: i.cac * cm,
    cells: churns.map((c) => churnAdjustedPayback({ ...i, cac: i.cac * cm, monthlyChurn: c }).months),
  }));
  return { churns, rows };
}

export function cacPaybackOutcome(raw = {}) {
  const v = validate(raw);
  if (v.invalid) return { invalid: v.invalid };
  const i = v.input;
  const simple = simplePaybackMonths(i);
  const adjusted = churnAdjustedPayback(i).months;
  const ltv = lifetimeValue(i);
  const ltvDisc = lifetimeValue(i, { discounted: true });
  const ltvCac = Number.isFinite(ltv) ? ltv / i.cac : Infinity;
  const ltvCacDisc = Number.isFinite(ltvDisc) ? ltvDisc / i.cac : Infinity;
  const maxCac = maxCacForPayback(i);
  const lifetimeMonths = i.monthlyChurn > 0 ? 1 / i.monthlyChurn : Infinity;
  const findings = [];
  if (adjusted === null) {
    findings.push({ severity: "high", title: "This customer never pays back CAC", detail: `Expected gross profit does not cover ${money(i.cac)} within ${PAYBACK_CAP_MONTHS} months at this churn. Every customer acquired at this cost loses money on expectation.` });
  } else if (adjusted > i.targetPaybackMonths) {
    findings.push({ severity: "high", title: `Payback of ${adjusted} months is longer than your ${i.targetPaybackMonths}-month target`, detail: `To hit ${i.targetPaybackMonths} months at this margin and churn, CAC would need to be about ${money(maxCac)} or lower, or monthly revenue per customer higher.` });
  } else {
    findings.push({ severity: "info", title: `Payback in ${adjusted} months, inside your ${i.targetPaybackMonths}-month target`, detail: `CAC could rise to about ${money(maxCac)} before payback slips past ${i.targetPaybackMonths} months.` });
  }
  if (adjusted !== null && simple > 0 && adjusted - Math.ceil(simple) >= 2) {
    findings.push({ severity: "medium", title: "Churn adds months the simple formula hides", detail: `CAC / monthly gross profit says ${simple.toFixed(1)} months, but once expected churn is applied it takes ${adjusted}. Reporting the simple figure overstates how fast a cohort recovers its cost.` });
  }
  if (Number.isFinite(ltvCac) && ltvCac < 3) {
    findings.push({ severity: ltvCac < 1 ? "high" : "medium", title: `LTV:CAC of ${ltvCac.toFixed(1)}:1 is under the 3:1 rule of thumb`, detail: "3:1 is a widely quoted benchmark, not a law: it depends on growth stage, margin and how much cash you can tie up. Treat it as a prompt to check your own cohorts." });
  }
  if (i.expansion > 0 && Number.isFinite(ltv)) {
    findings.push({ severity: "info", title: "Expansion is doing part of the work", detail: `With ${pct(i.expansion)} monthly expansion assumed, LTV is ${money(ltv)}; without it LTV would be ${money(lifetimeValue({ ...i, expansion: 0 }))}. Expansion this steady is rare, so test the lower figure too.` });
  }
  return {
    input: i, simplePayback: simple, adjustedPayback: adjusted, ltv, ltvDiscounted: ltvDisc, ltvCac, ltvCacDiscounted: ltvCacDisc,
    maxCac, lifetimeMonths, monthlyContribution: contribution(i), findings, sensitivity: paybackSensitivity(i),
  };
}
