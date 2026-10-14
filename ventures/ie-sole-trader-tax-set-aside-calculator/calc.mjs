// Ireland self-employed tax set-aside: income tax (20%/40%), personal and
// earned income credits, USC (with the 3% self-employed surcharge above
// 100,000) and Class S PRSI. Figures are the published Revenue / Budget 2026
// rates for the 2026 tax year; Revenue decides. Pure functions.

export const YEARS = {
  "2026": {
    standardBand: 44000,
    rates: [0.2, 0.4],
    credits: 4000, // personal 2,000 + earned income credit 2,000
    usc: [[12012, 0.005], [28700, 0.02], [70044, 0.03], [Infinity, 0.08]],
    uscExempt: 13000,
    uscSurchargeFrom: 100000,
    uscSurcharge: 0.03,
    // Class S PRSI is 4.2% to 30 Sept 2026 and 4.35% from 1 Oct 2026: blended.
    prsiRate: 0.75 * 0.042 + 0.25 * 0.0435,
    prsiMin: 500,
    prsiFloor: 5000,
  },
};
export const PRELIM_NOTE_THRESHOLD = 500;

export const SAMPLE = { year: "2026", revenue: "90000", expenses: "20000", pension: "" };

const num = (v) => {
  const s = String(v ?? "").trim().replace(/[€,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round(n * 100) / 100;

export function incomeTaxGross(taxable, y) {
  const Y = YEARS[y];
  const low = Math.min(taxable, Y.standardBand);
  const high = Math.max(0, taxable - Y.standardBand);
  return r2(low * Y.rates[0] + high * Y.rates[1]);
}

export function usc(income, y) {
  const Y = YEARS[y];
  if (income <= Y.uscExempt) return 0;
  let total = 0, lo = 0;
  for (const [hi, rate] of Y.usc) {
    if (income > lo) total += (Math.min(income, hi) - lo) * rate;
    lo = hi;
  }
  if (income > Y.uscSurchargeFrom) total += (income - Y.uscSurchargeFrom) * Y.uscSurcharge;
  return r2(total);
}

export function prsi(income, y) {
  const Y = YEARS[y];
  if (income < Y.prsiFloor) return 0;
  return r2(Math.max(Y.prsiMin, income * Y.prsiRate));
}

export function compute(input) {
  const errors = [];
  const year = YEARS[input.year] ? String(input.year) : "2026";
  const revenue = num(input.revenue);
  const expenses = num(input.expenses) ?? 0;
  const pension = num(input.pension) ?? 0;
  if (revenue === null || Number.isNaN(revenue) || revenue < 0) errors.push("Enter your business income for the year (0 or more).");
  if (Number.isNaN(expenses) || expenses < 0) errors.push("Expenses must be 0 or more.");
  if (Number.isNaN(pension) || pension < 0) errors.push("Pension contributions must be 0 or more.");
  if (errors.length) return { errors };

  const net = r2(Math.max(0, revenue - expenses));
  const taxable = r2(Math.max(0, net - pension));
  const gross = incomeTaxGross(taxable, year);
  const credits = r2(Math.min(gross, YEARS[year].credits));
  const tax = r2(gross - credits);
  const uscAmt = usc(net, year);
  const prsiAmt = prsi(net, year);
  const total = r2(tax + uscAmt + prsiAmt);
  const setAsidePct = revenue > 0 ? r2((total / revenue) * 100) : 0;
  const setAsideOfNet = net > 0 ? r2((total / net) * 100) : 0;
  const findings = [];
  const out = { errors: [], year, revenue, expenses, pension, net, taxable, grossTax: gross, credits, tax, usc: uscAmt, prsi: prsiAmt, total, setAsidePct, setAsideOfNet, afterTax: r2(net - total), monthly: r2(total / 12), perThousand: r2((total / Math.max(revenue, 1)) * 1000), findings };

  findings.push({ severity: "high", title: `Set aside about €${total.toFixed(2)} (${setAsidePct}% of income, ${setAsideOfNet}% of profit): €${tax.toFixed(2)} income tax, €${uscAmt.toFixed(2)} USC and €${prsiAmt.toFixed(2)} PRSI. That is roughly €${out.perThousand.toFixed(0)} from every €1,000 you invoice.` });
  if (total > PRELIM_NOTE_THRESHOLD) findings.push({ severity: "medium", title: "Self-employed people pay preliminary tax for the year by 31 October (or mid-November if you file and pay through ROS) and file the Form 11 by the same date the following year. Preliminary tax must usually be at least 90% of this year's liability, or 100% of last year's, or 105% of the pre-previous year's if you pay by direct debit." });
  if (net > 100000) findings.push({ severity: "medium", title: "Profit above €100,000 attracts an extra 3% USC surcharge for the self-employed, included above." });
  findings.push({ severity: "info", title: "Remember VAT: if you are registered, the VAT you charge belongs to Revenue and is not in the figure above. The registration thresholds are €100,000 for services and €140,000 for goods." });
  findings.push({ severity: "info", title: "Personal pension contributions are deducted for income tax only (not USC or PRSI) and the age-based percentage limits are not checked. Capital allowances, losses, other income, spouse or civil partner credits, home-office relief and the minimum Class S PRSI rules (a minimum contribution applies) are only approximated or not modelled." });
  return out;
}

export function summaryText(r) {
  const L = [];
  L.push(`Ireland self-employed tax set-aside, ${r.year} tax year`);
  L.push(`Income €${r.revenue.toFixed(2)}, expenses €${r.expenses.toFixed(2)}, net €${r.net.toFixed(2)}`);
  L.push(`Income tax (after credits): €${r.tax.toFixed(2)}`);
  L.push(`USC: €${r.usc.toFixed(2)}`);
  L.push(`PRSI (Class S): €${r.prsi.toFixed(2)}`);
  L.push(`Set aside: €${r.total.toFixed(2)} (${r.setAsidePct}% of income, €${r.monthly.toFixed(2)} a month)`);
  L.push("Verify figures on revenue.ie. Not tax advice.");
  return L.join("\n");
}
