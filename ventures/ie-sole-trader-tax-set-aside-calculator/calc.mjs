// Ireland self-employed tax set-aside: income tax (20%/40%) less the personal
// and earned income credits, USC with the self-employed surcharge, PRSI
// Class S, optional pension relief, and the VAT and preliminary tax flags.
// Figures are written from the published Revenue tables for calendar year
// 2025; Revenue decides. Pure functions.

export const YEARS = {
  "2025": {
    cutoff: 44000,
    rates: [0.2, 0.4],
    credits: 4000, // personal 2,000 + earned income 2,000
    uscExempt: 13000,
    uscBands: [[12012, 0.005], [27382, 0.02], [70044, 0.03], [Infinity, 0.08]],
    uscSurchargeFrom: 100000,
    uscSurcharge: 0.03,
    prsiRate: 0.04125, // 4.1% to 30 Sep blended with 4.2% from 1 Oct
    prsiMin: 500,
    prsiFrom: 5000,
  },
};
export const VAT_SERVICES = 42500;
export const PENSION_CAP_PCT = 0.15;

export const SAMPLE = { year: "2025", revenue: "90000", expenses: "20000", pension: "" };

const num = (v) => {
  const s = String(v ?? "").trim().replace(/[€,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round(n * 100) / 100;

export function incomeTax(taxable, y) {
  const Y = YEARS[y];
  const gross = Math.min(taxable, Y.cutoff) * Y.rates[0] + Math.max(0, taxable - Y.cutoff) * Y.rates[1];
  return r2(Math.max(0, gross - Y.credits));
}

export function usc(income, y) {
  const Y = YEARS[y];
  if (income <= Y.uscExempt) return 0;
  let tax = 0, lo = 0;
  for (const [hi, rate] of Y.uscBands) {
    if (income > lo) tax += (Math.min(income, hi) - lo) * rate;
    lo = hi;
  }
  tax += Math.max(0, income - Y.uscSurchargeFrom) * Y.uscSurcharge;
  return r2(tax);
}

export function prsi(income, y) {
  const Y = YEARS[y];
  if (income < Y.prsiFrom) return 0;
  return r2(Math.max(Y.prsiMin, income * Y.prsiRate));
}

export function compute(input) {
  const errors = [];
  const year = YEARS[input.year] ? String(input.year) : "2025";
  const revenue = num(input.revenue);
  const expenses = num(input.expenses) ?? 0;
  const pensionIn = num(input.pension) ?? 0;
  if (revenue === null || Number.isNaN(revenue) || revenue < 0) errors.push("Enter your business income for the year, excluding VAT (0 or more).");
  if (Number.isNaN(expenses) || expenses < 0) errors.push("Expenses must be 0 or more.");
  if (Number.isNaN(pensionIn) || pensionIn < 0) errors.push("Pension contributions must be 0 or more.");
  if (errors.length) return { errors };

  const net = r2(Math.max(0, revenue - expenses));
  const pension = r2(Math.min(pensionIn, net * PENSION_CAP_PCT));
  const tax = incomeTax(net - pension, year);
  const uscAmt = usc(net, year);
  const prsiAmt = prsi(net, year);
  const total = r2(tax + uscAmt + prsiAmt);
  const setAsidePct = revenue > 0 ? r2((total / revenue) * 100) : 0;
  const setAsideOfNet = net > 0 ? r2((total / net) * 100) : 0;
  const findings = [];
  const out = { errors: [], year, revenue, expenses, net, pension, tax, usc: uscAmt, prsi: prsiAmt, total, setAsidePct, setAsideOfNet, afterTax: r2(net - total), monthly: r2(total / 12), perThousand: r2((total / Math.max(revenue, 1)) * 1000), findings };

  findings.push({ severity: "high", title: `Set aside about €${total.toFixed(2)} (${setAsidePct}% of income, ${setAsideOfNet}% of profit): €${tax.toFixed(2)} income tax, €${uscAmt.toFixed(2)} USC and €${prsiAmt.toFixed(2)} PRSI. That is roughly €${out.perThousand.toFixed(0)} from every €1,000 you invoice.` });
  if (revenue > VAT_SERVICES) findings.push({ severity: "medium", title: "Income is above the €42,500 VAT registration threshold for services (€85,000 for goods). If you are over it you must register and charge VAT. That VAT belongs to Revenue and is not in the figure above." });
  if (pensionIn > pension) findings.push({ severity: "info", title: `Only €${pension.toFixed(2)} of your pension contribution is relieved here: this tool caps relief at 15% of profit, the lowest age band. Your own limit may be higher.` });
  if (net > 0) findings.push({ severity: "medium", title: "Preliminary tax for the year is due by 31 October (the ROS pay-and-file date is usually extended in mid-November). To avoid interest you generally pay 100% of this year's tax, 90% of it, or 105% of last year's final liability." });
  findings.push({ severity: "info", title: "Other income, PAYE employment, tax credits beyond the personal and earned income credits, capital allowances, losses and the 3% USC surcharge rules for non-PAYE income are only partly modelled. Class S PRSI is shown at a blended 2025 rate." });
  return out;
}

export function summaryText(r) {
  const L = [];
  L.push(`Ireland self-employed tax set-aside, ${r.year}`);
  L.push(`Income €${r.revenue.toFixed(2)}, expenses €${r.expenses.toFixed(2)}, net €${r.net.toFixed(2)}`);
  if (r.pension) L.push(`Pension relief: €${r.pension.toFixed(2)}`);
  L.push(`Income tax: €${r.tax.toFixed(2)}`);
  L.push(`USC: €${r.usc.toFixed(2)}`);
  L.push(`PRSI (Class S): €${r.prsi.toFixed(2)}`);
  L.push(`Set aside: €${r.total.toFixed(2)} (${r.setAsidePct}% of income, €${r.monthly.toFixed(2)} a month)`);
  L.push("Verify figures on revenue.ie. Not tax advice.");
  return L.join("\n");
}
