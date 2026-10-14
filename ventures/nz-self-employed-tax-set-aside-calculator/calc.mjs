// New Zealand self-employed tax set-aside: income tax on net profit, ACC
// earners' levy, the user's ACC work levy rate, optional student loan
// repayments, and the GST / provisional tax thresholds. Figures are the
// published IRD / ACC settings for the 2025-26 tax year (1 April 2025 to
// 31 March 2026), written without a live lookup; IRD decides. Pure functions.

export const YEARS = {
  2025: {
    label: "2025-26",
    brackets: [[15600, 0.105], [53500, 0.175], [78100, 0.3], [180000, 0.33], [Infinity, 0.39]],
    earnersLevyRate: 0.0167, // per $1 of liable earnings, GST inclusive
    maxLiableEarnings: 152790,
    studentLoanThreshold: 24128,
    studentLoanRate: 0.12,
  },
};
export const GST_THRESHOLD = 60000;
export const PROVISIONAL_THRESHOLD = 5000;

export const SAMPLE = {
  year: "2025",
  revenue: "95000",
  expenses: "20000",
  workLevyRate: "0.70",
  studentLoan: "no",
};

const num = (v) => {
  const s = String(v ?? "").trim().replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round(n * 100) / 100;

export function incomeTax(taxable, y) {
  let tax = 0, lo = 0;
  for (const [hi, rate] of YEARS[y].brackets) {
    if (taxable > lo) tax += (Math.min(taxable, hi) - lo) * rate;
    lo = hi;
  }
  return r2(tax);
}

export function earnersLevy(net, y) {
  const t = YEARS[y];
  return r2(Math.min(net, t.maxLiableEarnings) * t.earnersLevyRate);
}

export function studentLoan(taxable, y) {
  const t = YEARS[y];
  return r2(Math.max(0, taxable - t.studentLoanThreshold) * t.studentLoanRate);
}

export function compute(input) {
  const errors = [];
  const year = YEARS[input.year] ? String(input.year) : "2025";
  const revenue = num(input.revenue);
  const expenses = num(input.expenses) ?? 0;
  const workRate = num(input.workLevyRate) ?? 0;
  const hasLoan = String(input.studentLoan) === "yes";
  if (revenue === null || Number.isNaN(revenue) || revenue < 0) errors.push("Enter your gross business revenue for the year (0 or more).");
  if (Number.isNaN(expenses) || expenses < 0) errors.push("Expenses must be 0 or more.");
  if (Number.isNaN(workRate) || workRate < 0 || workRate > 10) errors.push("ACC work levy rate must be between 0 and 10 dollars per $100 of earnings.");
  if (errors.length) return { errors };

  const t = YEARS[year];
  const net = r2(Math.max(0, revenue - expenses));
  const earners = earnersLevy(net, year);
  const work = r2(Math.min(net, t.maxLiableEarnings) * (workRate / 100));
  // The work levy is a business expense; the earners' levy is not deductible.
  const taxable = r2(Math.max(0, net - work));
  const tax = incomeTax(taxable, year);
  const loan = hasLoan ? studentLoan(taxable, year) : 0;
  const total = r2(tax + earners + work + loan);
  const setAsidePct = revenue > 0 ? r2((total / revenue) * 100) : 0;
  const setAsideOfNet = net > 0 ? r2((total / net) * 100) : 0;
  const findings = [];
  const out = { errors: [], year, label: t.label, revenue, expenses, net, earners, work, taxable, tax, loan, total, setAsidePct, setAsideOfNet, afterTax: r2(net - total), monthly: r2(total / 12), perThousand: r2((total / Math.max(revenue, 1)) * 1000), findings };

  findings.push({ severity: "high", title: `Set aside about $${total.toFixed(2)} (${setAsidePct}% of revenue, ${setAsideOfNet}% of profit): $${tax.toFixed(2)} income tax, $${(earners + work).toFixed(2)} ACC levies${hasLoan ? ` and $${loan.toFixed(2)} student loan` : ""}. That is roughly $${out.perThousand.toFixed(0)} from every $1,000 you invoice.` });
  if (tax + loan > PROVISIONAL_THRESHOLD) findings.push({ severity: "medium", title: `Residual income tax is likely above $${PROVISIONAL_THRESHOLD.toLocaleString("en-NZ")}, so you would normally pay provisional tax in instalments through the year instead of one bill after year end. Check your instalment dates and method with IRD.` });
  if (revenue > GST_THRESHOLD) findings.push({ severity: "medium", title: "Revenue is above the $60,000 GST registration threshold. If taxable supplies passed it over 12 months you must register, charge GST and file returns. GST you collect is not yours and is not in the figure above." });
  findings.push({ severity: "info", title: "NZ has no separate self-employed pension charge. Income tax and ACC levies are the main costs, plus student loan repayments if you have one. KiwiSaver contributions are optional and not included." });
  findings.push({ severity: "info", title: "The ACC work levy rate depends on your industry classification. Use the rate on your ACC invoice; the sample figure is only an illustration." });
  return out;
}

export function summaryText(r) {
  const L = [];
  L.push(`New Zealand self-employed tax set-aside, ${r.label} tax year`);
  L.push(`Revenue $${r.revenue.toFixed(2)}, expenses $${r.expenses.toFixed(2)}, net $${r.net.toFixed(2)}`);
  L.push(`Income tax: $${r.tax.toFixed(2)}`);
  L.push(`ACC earners' levy: $${r.earners.toFixed(2)}; work levy: $${r.work.toFixed(2)}`);
  if (r.loan) L.push(`Student loan repayment: $${r.loan.toFixed(2)}`);
  L.push(`Set aside: $${r.total.toFixed(2)} (${r.setAsidePct}% of revenue, $${r.monthly.toFixed(2)} a month)`);
  L.push("Verify figures on ird.govt.nz and acc.co.nz. Not tax advice.");
  return L.join("\n");
}
