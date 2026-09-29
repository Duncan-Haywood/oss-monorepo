// SaaS annual-prepay discount calculator: what discount is worth offering.
//
// Model (stated on the page and in the README; every line is an assumption
// the user can disagree with, so none is hidden):
//
//  * Time is in months. `costOfCapital` is an annual rate k; cash at month t
//    is discounted by (1 + k)^(t / 12).
//  * Monthly plan: the customer pays `price` at the start of each month.
//    Churn is geometric: the customer is still there for month t with
//    probability (1 - c)^t, so month 0 is always paid.
//  * Annual plan: the customer pays 12 * price * (1 - discount) up front and
//    can only leave at renewal. They renew into year y with probability
//    renewalRate^y. No mid-year refunds, no mid-year churn.
//  * Cost to serve is `price * (1 - grossMargin)` per month for every month
//    the customer is active, on either plan, paid as it is incurred. So the
//    annual plan takes the cash early but does not get the cost early.
//  * Optional per-payment fee (percent of each charge). Off by default.
//  * No expansion revenue, no taxes, no failed-payment recovery.
//  * Everything is per signed-up customer, over `horizonMonths` (12/24/36).
//    Cash after the horizon is ignored, for both plans.
//
// The break-even discount is the largest discount at which the annual plan's
// present value still equals the monthly plan's. It is found by bisection.
// Because the annual PV is linear in the discount, a closed form exists and
// the tests assert the bisection agrees with it.

export const HORIZONS = [12, 24, 36];
export const SENSITIVITY_DISCOUNTS = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30];
export const SENSITIVITY_CHURN_MULTIPLIERS = [0.5, 1, 1.5, 2];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

export function money(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function pct(n, digits = 1) {
  return `${(n * 100).toFixed(digits)}%`;
}

const monthlyRate = (k) => Math.pow(1 + k, 1 / 12) - 1;

function validate(input) {
  const i = {
    price: num(input.price),
    grossMargin: num(input.grossMargin),
    monthlyChurn: num(input.monthlyChurn),
    renewalRate: num(input.renewalRate),
    discount: num(input.discount),
    switchShare: input.switchShare === undefined || input.switchShare === null || input.switchShare === "" ? null : num(input.switchShare),
    costOfCapital: num(input.costOfCapital),
    horizonMonths: num(input.horizonMonths) || 12,
    paymentFee: num(input.paymentFee),
  };
  if (!(i.price > 0)) return { invalid: "Enter a monthly price above zero." };
  if (i.grossMargin < 0 || i.grossMargin > 1) return { invalid: "Gross margin must be between 0% and 100%." };
  if (i.monthlyChurn < 0 || i.monthlyChurn >= 1) return { invalid: "Monthly churn must be at least 0% and below 100%." };
  if (i.renewalRate < 0 || i.renewalRate > 1) return { invalid: "Annual renewal rate must be between 0% and 100%." };
  if (i.discount < 0 || i.discount > 1) return { invalid: "Discount must be between 0% and 100%." };
  if (i.switchShare !== null && (i.switchShare < 0 || i.switchShare > 1)) return { invalid: "Share who switch must be between 0% and 100%." };
  if (i.costOfCapital < 0 || i.costOfCapital > 5) return { invalid: "Cost of capital must be between 0% and 500%." };
  if (!HORIZONS.includes(i.horizonMonths)) return { invalid: "Horizon must be 12, 24 or 36 months." };
  if (i.paymentFee < 0 || i.paymentFee >= 1) return { invalid: "Payment fee must be at least 0% and below 100%." };
  return { input: i };
}

// PV of gross profit for one customer on the monthly plan.
export function monthlyPlanPV(i) {
  const r = monthlyRate(i.costOfCapital);
  const cost = i.price * (1 - i.grossMargin);
  const net = i.price * (1 - i.paymentFee) - cost;
  let pv = 0;
  for (let t = 0; t < i.horizonMonths; t += 1) {
    pv += (net * Math.pow(1 - i.monthlyChurn, t)) / Math.pow(1 + r, t);
  }
  return pv;
}

// PV of gross profit for one customer on the annual plan at `discount`.
export function annualPlanPV(i, discount = i.discount) {
  const r = monthlyRate(i.costOfCapital);
  const cost = i.price * (1 - i.grossMargin);
  const years = i.horizonMonths / 12;
  let pv = 0;
  for (let y = 0; y < years; y += 1) {
    const alive = Math.pow(i.renewalRate, y);
    const charge = 12 * i.price * (1 - discount) * (1 - i.paymentFee);
    pv += (alive * charge) / Math.pow(1 + r, 12 * y);
    for (let j = 0; j < 12; j += 1) {
      pv -= (alive * cost) / Math.pow(1 + r, 12 * y + j);
    }
  }
  return pv;
}

// Largest discount in [0, 1] with annualPlanPV(d) >= monthlyPlanPV, by
// bisection. Returns 0 when even a full-price annual plan is worth less
// (`reason: "never"`), and 1 when even a free year is not worth less
// (`reason: "always"`; only reachable with a huge renewal advantage).
export function breakEvenDiscount(i) {
  const target = monthlyPlanPV(i);
  const gap = (d) => annualPlanPV(i, d) - target;
  if (gap(0) < 0) return { discount: 0, reason: "never" };
  if (gap(1) >= 0) return { discount: 1, reason: "always" };
  let lo = 0;
  let hi = 1;
  for (let n = 0; n < 80; n += 1) {
    const mid = (lo + hi) / 2;
    if (gap(mid) >= 0) lo = mid;
    else hi = mid;
  }
  return { discount: lo, reason: "found" };
}

// Closed form for the same number, used by the tests as a cross-check.
export function breakEvenDiscountClosedForm(i) {
  const target = monthlyPlanPV(i);
  const full = annualPlanPV(i, 0);
  const atOne = annualPlanPV(i, 1);
  const slope = full - atOne; // PV lost per 100% of discount
  if (!(slope > 0)) return 0;
  return clamp((full - target) / slope, 0, 1);
}

export function sensitivityTable(i) {
  const churns = i.monthlyChurn > 0
    ? SENSITIVITY_CHURN_MULTIPLIERS.map((m) => Math.min(i.monthlyChurn * m, 0.99))
    : [0.01, 0.02, 0.03, 0.05];
  const rows = SENSITIVITY_DISCOUNTS.map((d) => ({
    discount: d,
    cells: churns.map((c) => {
      const at = { ...i, monthlyChurn: c };
      return round2(annualPlanPV(at, d) - monthlyPlanPV(at));
    }),
  }));
  return { churns, rows };
}

export function annualDiscountOutcome(raw = {}) {
  const v = validate(raw);
  if (v.invalid) return { invalid: v.invalid };
  const i = v.input;

  const monthlyPV = monthlyPlanPV(i);
  const annualPV = annualPlanPV(i);
  const advantage = annualPV - monthlyPV;
  const be = breakEvenDiscount(i);
  const annualUpfront = 12 * i.price * (1 - i.discount);
  const monthsFree = 12 * i.discount;
  const survive12Monthly = Math.pow(1 - i.monthlyChurn, 12);
  const expectedMonthlyCash12 = (() => {
    let s = 0;
    for (let t = 0; t < 12; t += 1) s += i.price * Math.pow(1 - i.monthlyChurn, t);
    return s;
  })();

  const blended = i.switchShare === null ? null : {
    share: i.switchShare,
    pvPerCustomer: round2((1 - i.switchShare) * monthlyPV + i.switchShare * annualPV),
    pvChangePerCustomer: round2(i.switchShare * advantage),
    upfrontCashPerCustomer: round2(i.switchShare * annualUpfront + (1 - i.switchShare) * i.price),
  };

  const findings = [];
  if (be.reason === "never") {
    findings.push({
      severity: "high",
      title: "Annual plan is worth less even at full price",
      detail: "On these inputs a customer on the annual plan at no discount is worth less than one on the monthly plan, because the annual renewal rate is below what monthly retention would deliver. Any discount widens the gap. Revisit the renewal-rate assumption before offering one.",
    });
  } else if (i.discount > be.discount + 1e-9) {
    findings.push({
      severity: "high",
      title: "Discount is above the break-even",
      detail: `A ${pct(i.discount)} discount is worth ${money(Math.abs(advantage))} less per customer (present value) than staying on the monthly plan. The NPV-neutral maximum on these inputs is ${pct(be.discount)}.`,
    });
  } else {
    findings.push({
      severity: "info",
      title: "Discount is within the break-even",
      detail: `A ${pct(i.discount)} discount is worth ${money(advantage)} more per customer (present value) than the monthly plan. The NPV-neutral maximum is ${pct(be.discount)}.`,
    });
  }
  if (i.renewalRate < survive12Monthly) {
    findings.push({
      severity: "medium",
      title: "Assumed renewal is below monthly 12-month retention",
      detail: `A monthly customer is still paying in month 13 with probability ${pct(survive12Monthly)}; you assumed ${pct(i.renewalRate)} of annual customers renew. If that gap is real, the annual plan loses customers at the renewal point faster than monthly billing would. Check it against your own cohorts.`,
    });
  }
  findings.push({
    severity: "info",
    title: "Selection effect is not modelled",
    detail: "Customers who choose the annual plan are often the ones already least likely to churn. If so, part of the annual plan's gain is not caused by the discount, and the true value of the discount is lower than shown for those customers. The tool applies your churn and renewal figures as given.",
  });

  return {
    input: i,
    monthlyPV: round2(monthlyPV),
    annualPV: round2(annualPV),
    advantage: round2(advantage),
    better: advantage >= 0 ? "annual" : "monthly",
    breakEven: { discount: be.discount, reason: be.reason },
    annualUpfront: round2(annualUpfront),
    monthlyUpfront: round2(i.price),
    expectedMonthlyCashFirst12: round2(expectedMonthlyCash12),
    monthsFree: round2(monthsFree),
    breakEvenMonthsFree: round2(12 * be.discount),
    survive12Monthly,
    blended,
    sensitivity: sensitivityTable(i),
    findings,
  };
}
