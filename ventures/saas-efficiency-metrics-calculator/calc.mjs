// SaaS efficiency metrics: burn multiple, magic number, Rule of 40, runway.
// Pure functions, no DOM, no I/O. Quarterly inputs, in dollars.
//
//   Net new ARR     = (quarter revenue - prior quarter revenue) x 4, unless the
//                     user supplies it (use net new ARR from your billing data
//                     when you have it; it is better than a revenue proxy).
//   Burn multiple   = net burn / net new ARR            (lower is better)
//   Magic number    = (quarter revenue - prior quarter revenue) x 4
//                     / prior-quarter sales and marketing spend
//   Rule of 40      = YoY revenue growth + profit margin, in percent points,
//                     where margin = free cash flow / revenue = -net burn / revenue
//   Runway          = cash / (net burn / 3)             months
//
// The band labels are widely quoted rules of thumb, not standards.

export const BURN_BANDS = [
  { max: 1, label: "amazing" },
  { max: 1.5, label: "great" },
  { max: 2, label: "good" },
  { max: 3, label: "suspect" },
  { max: Infinity, label: "bad" },
];

export function money(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);
const blank = (v) => v === undefined || v === null || v === "";

export function validate(raw = {}) {
  const i = {
    revenue: num(raw.revenue),
    priorRevenue: num(raw.priorRevenue),
    yearAgoRevenue: blank(raw.yearAgoRevenue) ? null : num(raw.yearAgoRevenue),
    netNewArr: blank(raw.netNewArr) ? null : num(raw.netNewArr),
    priorSalesMarketing: blank(raw.priorSalesMarketing) ? null : num(raw.priorSalesMarketing),
    netBurn: num(raw.netBurn),
    cash: blank(raw.cash) ? null : num(raw.cash),
  };
  if (!(i.revenue > 0)) return { invalid: "Enter this quarter's recognised revenue, greater than zero." };
  if (!(i.priorRevenue > 0)) return { invalid: "Enter last quarter's recognised revenue, greater than zero." };
  if (Number.isNaN(i.netBurn)) return { invalid: "Enter net burn for the quarter (cash out minus cash in). Use a negative number if you generated cash." };
  if (i.yearAgoRevenue !== null && !(i.yearAgoRevenue > 0)) return { invalid: "Revenue for the same quarter a year ago must be greater than zero, or left blank." };
  if (i.netNewArr !== null && Number.isNaN(i.netNewArr)) return { invalid: "Net new ARR must be a number, or left blank to estimate it from revenue." };
  if (i.priorSalesMarketing !== null && !(i.priorSalesMarketing > 0)) return { invalid: "Prior-quarter sales and marketing spend must be greater than zero, or left blank." };
  if (i.cash !== null && !(i.cash >= 0)) return { invalid: "Cash on hand cannot be negative, or leave it blank." };
  return { input: i };
}

export function burnBand(multiple) {
  return BURN_BANDS.find((b) => multiple < b.max || b.max === Infinity).label;
}

export function efficiencyOutcome(raw = {}) {
  const v = validate(raw);
  if (v.invalid) return { invalid: v.invalid };
  const i = v.input;
  const revenueDelta = i.revenue - i.priorRevenue;
  const arrFromRevenue = revenueDelta * 4;
  const netNewArr = i.netNewArr ?? arrFromRevenue;
  const arrSource = i.netNewArr === null ? "estimated from quarter-over-quarter revenue" : "entered";

  let burnMultiple = null;
  let burnNote = null;
  if (i.netBurn <= 0) burnNote = "You generated cash this quarter, so burn multiple does not apply.";
  else if (!(netNewArr > 0)) burnNote = "Net new ARR is zero or negative, so you are burning cash without adding recurring revenue: burn multiple is unbounded.";
  else burnMultiple = i.netBurn / netNewArr;

  const magicNumber = i.priorSalesMarketing !== null ? arrFromRevenue / i.priorSalesMarketing : null;
  const growth = i.yearAgoRevenue !== null ? i.revenue / i.yearAgoRevenue - 1 : null;
  const margin = -i.netBurn / i.revenue;
  const ruleOf40 = growth !== null ? (growth + margin) * 100 : null;
  const monthlyBurn = i.netBurn / 3;
  const runwayMonths = i.cash !== null && monthlyBurn > 0 ? i.cash / monthlyBurn : null;

  // What would have to change to land at a 1.5 burn multiple ("great").
  let target = null;
  if (burnMultiple !== null && burnMultiple > 1.5) {
    target = { burnAtSameArr: 1.5 * netNewArr, arrAtSameBurn: i.netBurn / 1.5 };
  }

  const findings = [];
  if (burnMultiple !== null) {
    const band = burnBand(burnMultiple);
    findings.push({
      severity: burnMultiple > 2 ? "high" : burnMultiple > 1.5 ? "medium" : "info",
      title: `Burn multiple ${burnMultiple.toFixed(2)}: ${band}`,
      detail: `You spent ${burnMultiple.toFixed(2)} dollars of net burn for each dollar of net new ARR (${arrSource}). Commonly quoted bands: under 1 amazing, 1 to 1.5 great, 1.5 to 2 good, 2 to 3 suspect, over 3 bad. Stage and market matter: compare with companies like yours.`,
    });
  } else if (burnNote) {
    findings.push({ severity: i.netBurn <= 0 ? "info" : "high", title: "Burn multiple", detail: burnNote });
  }
  if (magicNumber !== null) {
    findings.push({
      severity: magicNumber < 0.5 ? "high" : magicNumber < 0.75 ? "medium" : "info",
      title: `Magic number ${magicNumber.toFixed(2)}`,
      detail: "Annualised quarter-over-quarter revenue growth divided by the previous quarter's sales and marketing spend. A rule of thumb: below about 0.5 suggests go-to-market spend is not converting efficiently, above about 0.75 suggests room to invest more. It assumes S&M spend drives the whole revenue change, which is rarely exactly true.",
    });
  }
  if (ruleOf40 !== null) {
    findings.push({
      severity: ruleOf40 < 20 ? "high" : ruleOf40 < 40 ? "medium" : "info",
      title: `Rule of 40 score ${ruleOf40.toFixed(1)}`,
      detail: `Year-over-year growth (${(growth * 100).toFixed(1)}%) plus free-cash-flow margin (${(margin * 100).toFixed(1)}%, from your net burn). 40 or more is the usual bar for a healthy SaaS business; the rule is mostly applied to companies past roughly $50M in revenue.`,
    });
  }
  if (runwayMonths !== null) {
    findings.push({
      severity: runwayMonths < 9 ? "high" : runwayMonths < 18 ? "medium" : "info",
      title: `Runway ${runwayMonths.toFixed(1)} months`,
      detail: "Cash divided by this quarter's average monthly net burn. Fundraising typically takes several months, so many founders start well before runway falls under 9 to 12 months.",
    });
  }

  return {
    input: i, revenueDelta, netNewArr, arrSource, burnMultiple, burnNote, magicNumber,
    growth, margin, ruleOf40, monthlyBurn, runwayMonths, target, findings,
  };
}
