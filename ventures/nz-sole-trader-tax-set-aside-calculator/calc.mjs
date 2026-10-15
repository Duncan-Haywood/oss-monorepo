// New Zealand self-employed tax set-aside: resident income tax brackets, ACC
// earners' levy, optional student loan repayment, the GST registration line
// and the provisional tax flag. Figures are written from the published IRD and
// ACC tables for the 2025-26 tax year (1 April 2025 to 31 March 2026); IRD
// decides. Pure functions.

export const YEARS = {
  "2025-26": {
    brackets: [[15600, 0.105], [53500, 0.175], [78100, 0.3], [180000, 0.33], [Infinity, 0.39]],
    accRate: 0.0167,
    accMax: 152790,
    loanThreshold: 24128,
  },
};
export const LOAN_RATE = 0.12;
export const GST_THRESHOLD = 60000;
export const PROVISIONAL_THRESHOLD = 5000;

export const SAMPLE = { year: "2025-26", revenue: "110000", expenses: "24000", studentLoan: "" };

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

export function accLevy(net, y) {
  const Y = YEARS[y];
  return r2(Math.min(net, Y.accMax) * Y.accRate);
}

export function studentLoan(net, y) {
  return r2(Math.max(0, net - YEARS[y].loanThreshold) * LOAN_RATE);
}

export function compute(input) {
  const errors = [];
  const year = Object.hasOwn(YEARS, input.year) ? String(input.year) : "2025-26";
  const revenue = num(input.revenue);
  const expenses = num(input.expenses) ?? 0;
  const hasLoan = String(input.studentLoan || "").toLowerCase() === "yes";
  if (revenue === null || Number.isNaN(revenue) || revenue < 0) errors.push("Enter your business income for the year, excluding GST (0 or more).");
  if (Number.isNaN(expenses) || expenses < 0) errors.push("Expenses must be 0 or more.");
  if (errors.length) return { errors };

  const net = r2(Math.max(0, revenue - expenses));
  const tax = incomeTax(net, year);
  const acc = accLevy(net, year);
  const loan = hasLoan ? studentLoan(net, year) : 0;
  const total = r2(tax + acc + loan);
  const setAsidePct = revenue > 0 ? r2((total / revenue) * 100) : 0;
  const setAsideOfNet = net > 0 ? r2((total / net) * 100) : 0;
  const findings = [];
  const out = { errors: [], year, revenue, expenses, net, tax, acc, loan, total, setAsidePct, setAsideOfNet, afterTax: r2(net - total), monthly: r2(total / 12), perThousand: r2((total / Math.max(revenue, 1)) * 1000), findings };

  findings.push({ severity: "high", title: `Set aside about $${total.toFixed(2)} (${setAsidePct}% of income, ${setAsideOfNet}% of profit): $${tax.toFixed(2)} income tax, $${acc.toFixed(2)} ACC earners' levy${loan ? ` and $${loan.toFixed(2)} student loan` : ""}. That is roughly $${out.perThousand.toFixed(0)} from every $1,000 you invoice.` });
  if (revenue > GST_THRESHOLD) findings.push({ severity: "medium", title: "Income is above the $60,000 GST registration turnover. Once your turnover in the last 12 months exceeds it, or is expected to in the next 12, you must register and charge GST. That GST belongs to IRD and is not in the figure above." });
  if (tax > PROVISIONAL_THRESHOLD) findings.push({ severity: "medium", title: "Residual income tax above $5,000 means you are likely a provisional taxpayer: you pay in instalments during the year instead of one bill after filing. For a 31 March balance date the standard-option dates are 28 August, 15 January and 7 May." });
  findings.push({ severity: "info", title: "ACC CoverPlus work levies for your industry, which are billed separately and vary by business, are not included." });
  findings.push({ severity: "info", title: "Student loan repayments, if you select them, are 12% of income above the repayment threshold. Other income, tax credits, losses carried forward and deductions such as home-office and vehicle claims are not modelled." });
  return out;
}

export function summaryText(r) {
  const L = [];
  L.push(`New Zealand self-employed tax set-aside, ${r.year} tax year`);
  L.push(`Income $${r.revenue.toFixed(2)}, expenses $${r.expenses.toFixed(2)}, net $${r.net.toFixed(2)}`);
  L.push(`Income tax: $${r.tax.toFixed(2)}`);
  L.push(`ACC earners' levy: $${r.acc.toFixed(2)}`);
  if (r.loan) L.push(`Student loan repayment: $${r.loan.toFixed(2)}`);
  L.push(`Set aside: $${r.total.toFixed(2)} (${r.setAsidePct}% of income, $${r.monthly.toFixed(2)} a month)`);
  L.push("Verify figures on ird.govt.nz and acc.co.nz. Not tax advice.");
  return L.join("\n");
}
