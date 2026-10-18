// UK (England, Wales, Northern Ireland) self-employed tax set-aside: income
// tax with personal allowance taper, Class 4 National Insurance, student loan
// plan repayments, trading allowance, and the payments-on-account cash call.
// Figures are written from the published HMRC rates for 2025/26 and 2026/27
// without a live lookup; HMRC decides. Scottish income tax bands differ and
// are not modelled. Pure functions.

const SL = {
  none: { label: "No student loan", threshold: Infinity, rate: 0 },
  plan1: { label: "Plan 1", threshold: 0, rate: 0.09 },
  plan2: { label: "Plan 2", threshold: 0, rate: 0.09 },
  plan4: { label: "Plan 4 (Scotland)", threshold: 0, rate: 0.09 },
  plan5: { label: "Plan 5", threshold: 25000, rate: 0.09 },
  pg: { label: "Postgraduate loan", threshold: 21000, rate: 0.06 },
};

export const YEARS = {
  "2026-27": {
    label: "2026/27",
    personalAllowance: 12570,
    taperFrom: 100000,
    basicBand: 37700,
    additionalFrom: 125140,
    rates: [0.2, 0.4, 0.45],
    class4: { lower: 12570, upper: 50270, main: 0.06, upperRate: 0.02 },
    tradingAllowance: 1000,
    vatThreshold: 90000,
    studentLoan: { plan1: 26900, plan2: 29385, plan4: 33795, plan5: 25000, pg: 21000 },
  },
  "2025-26": {
    label: "2025/26",
    personalAllowance: 12570,
    taperFrom: 100000,
    basicBand: 37700,
    additionalFrom: 125140,
    rates: [0.2, 0.4, 0.45],
    class4: { lower: 12570, upper: 50270, main: 0.06, upperRate: 0.02 },
    tradingAllowance: 1000,
    vatThreshold: 90000,
    studentLoan: { plan1: 26065, plan2: 28470, plan4: 32745, plan5: 25000, pg: 21000 },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SL).map(([k, v]) => [k, v.label]));
export const SAMPLE = { year: "2026-27", revenue: "60000", expenses: "12000", plan: "none" };

const num = (v) => {
  const s = String(v ?? "").trim().replace(/[£,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round(n * 100) / 100;

export function personalAllowance(profit, y) {
  const Y = YEARS[y];
  return Math.max(0, Y.personalAllowance - Math.max(0, (profit - Y.taperFrom) / 2));
}

export function incomeTax(profit, y) {
  const Y = YEARS[y];
  const pa = personalAllowance(profit, y);
  const taxable = Math.max(0, profit - pa);
  const basic = Math.min(taxable, Y.basicBand);
  const higher = Math.max(0, Math.min(taxable, Y.additionalFrom) - Y.basicBand);
  const additional = Math.max(0, taxable - Y.additionalFrom);
  const tax = basic * Y.rates[0] + higher * Y.rates[1] + additional * Y.rates[2];
  return { personalAllowance: r2(pa), taxable: r2(taxable), tax: r2(tax) };
}

export function class4(profit, y) {
  const c = YEARS[y].class4;
  const main = Math.max(0, Math.min(profit, c.upper) - c.lower) * c.main;
  const upper = Math.max(0, profit - c.upper) * c.upperRate;
  return r2(main + upper);
}

export function studentLoan(profit, plan, y) {
  if (!SL[plan] || plan === "none") return 0;
  const threshold = YEARS[y].studentLoan[plan];
  return r2(Math.max(0, profit - threshold) * SL[plan].rate);
}

export function compute(input) {
  const errors = [];
  const year = Object.hasOwn(YEARS, input.year) ? String(input.year) : "2026-27";
  const plan = Object.hasOwn(SL, input.plan) ? input.plan : "none";
  const Y = YEARS[year];
  const revenue = num(input.revenue);
  const expenses = num(input.expenses) ?? 0;
  if (revenue === null || Number.isNaN(revenue) || revenue < 0) errors.push("Enter your self-employed income for the year (0 or more).");
  if (Number.isNaN(expenses) || expenses < 0) errors.push("Expenses must be 0 or more.");
  if (errors.length) return { errors };

  // Trading allowance: HMRC lets you deduct a flat 1,000 instead of actual costs, whichever is better.
  const allowanceUsed = revenue > 0 && Y.tradingAllowance > expenses;
  const deduction = allowanceUsed ? Math.min(Y.tradingAllowance, revenue) : expenses;
  const profit = r2(Math.max(0, revenue - deduction));
  const it = incomeTax(profit, year);
  const nic = class4(profit, year);
  const sl = studentLoan(profit, plan, year);
  const total = r2(it.tax + nic + sl);
  const setAsidePct = revenue > 0 ? r2((total / revenue) * 100) : 0;
  const setAsideOfProfit = profit > 0 ? r2((total / profit) * 100) : 0;
  const poaEach = r2((it.tax + nic) / 2);
  const out = {
    errors: [], year, yearLabel: Y.label, plan, revenue, expenses, deduction, allowanceUsed, profit,
    personalAllowance: it.personalAllowance, tax: it.tax, class4: nic, studentLoan: sl, total, setAsidePct,
    setAsideOfProfit, afterTax: r2(profit - total), monthly: r2(total / 12),
    perThousand: r2((total / Math.max(revenue, 1)) * 1000), poaEach, findings: [],
  };
  const f = out.findings;
  const gbp = (n) => "£" + n.toFixed(2);
  f.push({ severity: "high", title: `Set aside about ${gbp(total)} (${setAsidePct}% of income, ${setAsideOfProfit}% of profit): ${gbp(it.tax)} income tax, ${gbp(nic)} Class 4 NIC${sl ? ` and ${gbp(sl)} student loan` : ""}. That is roughly £${out.perThousand.toFixed(0)} from every £1,000 you invoice.` });
  if (it.tax + nic >= 1000) {
    f.push({ severity: "high", title: `Payments on account: your first bill is not just the tax for the year. On 31 January after the tax year you pay the balance plus a first payment on account of about ${gbp(poaEach)} towards next year, and the same again on 31 July. Your January cash call is therefore about ${gbp(total + poaEach)}, so keep reserving through the year.` });
  } else {
    f.push({ severity: "info", title: "Your income tax and Class 4 bill is under £1,000, so you generally pay it all on 31 January with no payments on account." });
  }
  if (allowanceUsed) f.push({ severity: "info", title: `The £${Y.tradingAllowance.toLocaleString("en-GB")} trading allowance gives a bigger deduction than your actual expenses, so it is used instead. You cannot claim both.` });
  if (profit > Y.taperFrom) f.push({ severity: "medium", title: `Profit above £${Y.taperFrom.toLocaleString("en-GB")} reduces your personal allowance by £1 for every £2 (to £${out.personalAllowance.toFixed(0)} here), an effective 60% rate on that slice. Pension contributions can pull profit back under the line.` });
  if (revenue > Y.vatThreshold) f.push({ severity: "medium", title: `Turnover above £${Y.vatThreshold.toLocaleString("en-GB")} in 12 months means you must register for VAT. VAT you charge belongs to HMRC and is not in the figure above.` });
  else if (revenue > Y.vatThreshold * 0.85) f.push({ severity: "info", title: `Turnover is within 15% of the £${Y.vatThreshold.toLocaleString("en-GB")} VAT registration threshold, measured over any rolling 12 months.` });
  f.push({ severity: "info", title: "Class 2 National Insurance is no longer a charge for self-employed people above the small profits limit; it is treated as paid. Class 4 is shown at 6% between £12,570 and £50,270 and 2% above." });
  f.push({ severity: "info", title: "Scottish income tax bands, other income, pension contributions, Gift Aid, capital allowances, losses, the High Income Child Benefit charge and the Marriage Allowance are not modelled. Personal allowance is assumed for a single person with no other income." });
  return out;
}

export function summaryText(r) {
  const L = [];
  L.push(`UK self-employed tax set-aside, ${r.yearLabel} tax year (England, Wales, Northern Ireland)`);
  L.push(`Income £${r.revenue.toFixed(2)}, deduction £${r.deduction.toFixed(2)}${r.allowanceUsed ? " (trading allowance)" : ""}, profit £${r.profit.toFixed(2)}`);
  L.push(`Income tax: £${r.tax.toFixed(2)}`);
  L.push(`Class 4 NIC: £${r.class4.toFixed(2)}`);
  if (r.studentLoan) L.push(`Student loan: £${r.studentLoan.toFixed(2)}`);
  L.push(`Set aside: £${r.total.toFixed(2)} (${r.setAsidePct}% of income, £${r.monthly.toFixed(2)} a month)`);
  L.push(`Payment on account each of 31 Jan and 31 Jul after: about £${r.poaEach.toFixed(2)}`);
  L.push("Verify figures on gov.uk. Not tax advice.");
  return L.join("\n");
}
