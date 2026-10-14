// New Zealand self-employed tax set-aside: resident income tax brackets, ACC
// earners' levy, optional student loan repayment, and the GST registration and
// provisional tax flags. Figures are written from Inland Revenue's published
// tables for the 2025-26 tax year (1 April 2025 to 31 March 2026); IRD decides.
// Pure functions.

export const BRACKETS = [[15600, 0.105], [53500, 0.175], [78100, 0.3], [180000, 0.33], [Infinity, 0.39]];
// ACC earners' levy for self-employed people, per $100 of liable income (GST inclusive), up to a maximum.
export const ACC_RATE = 0.0167;
export const ACC_MAX_EARNINGS = 152790;
export const STUDENT_LOAN_RATE = 0.12;
export const STUDENT_LOAN_THRESHOLD = 24128;
export const GST_THRESHOLD = 60000;
export const PROVISIONAL_TAX_LINE = 5000;

export const SAMPLE = { revenue: "95000", expenses: "20000", studentLoan: "no" };

const num = (v) => {
  const s = String(v ?? "").trim().replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round(n * 100) / 100;

export function incomeTax(taxable) {
  let tax = 0, lo = 0;
  for (const [hi, rate] of BRACKETS) {
    if (taxable > lo) tax += (Math.min(taxable, hi) - lo) * rate;
    lo = hi;
  }
  return r2(tax);
}

export function compute(input) {
  const errors = [];
  const revenue = num(input.revenue);
  const expenses = num(input.expenses) ?? 0;
  const loan = String(input.studentLoan || "no") === "yes";
  if (revenue === null || Number.isNaN(revenue) || revenue < 0) errors.push("Enter your business income for the year, excluding GST (0 or more).");
  if (Number.isNaN(expenses) || expenses < 0) errors.push("Expenses must be 0 or more.");
  if (errors.length) return { errors };

  const net = r2(Math.max(0, revenue - expenses));
  const tax = incomeTax(net);
  const acc = r2(Math.min(net, ACC_MAX_EARNINGS) * ACC_RATE);
  const studentLoan = loan ? r2(Math.max(0, net - STUDENT_LOAN_THRESHOLD) * STUDENT_LOAN_RATE) : 0;
  const total = r2(tax + acc + studentLoan);
  const setAsidePct = revenue > 0 ? r2((total / revenue) * 100) : 0;
  const setAsideOfNet = net > 0 ? r2((total / net) * 100) : 0;
  const findings = [];
  const out = { errors: [], revenue, expenses, net, tax, acc, studentLoan, total, setAsidePct, setAsideOfNet, afterTax: r2(net - total), monthly: r2(total / 12), perThousand: r2((total / Math.max(revenue, 1)) * 1000), findings };

  findings.push({ severity: "high", title: `Set aside about $${total.toFixed(2)} (${setAsidePct}% of income, ${setAsideOfNet}% of profit): $${tax.toFixed(2)} income tax, $${acc.toFixed(2)} ACC earners' levy${studentLoan ? ` and $${studentLoan.toFixed(2)} student loan` : ""}. That is roughly $${out.perThousand.toFixed(0)} from every $1,000 you invoice.` });
  if (revenue > GST_THRESHOLD) findings.push({ severity: "medium", title: "Income is above the $60,000 GST registration threshold. Once your turnover in any 12 months reaches it you must register and add GST to sales. That GST belongs to IRD and is not in the figure above." });
  if (tax > PROVISIONAL_TAX_LINE) findings.push({ severity: "medium", title: "Residual income tax above $5,000 means you are a provisional taxpayer: IRD expects tax during the year in instalments rather than as one bill after the return. Ask IRD or your accountant which method fits you." });
  findings.push({ severity: "info", title: "ACC earners' levy is shown at the 2025-26 rate of $1.67 per $100 of liable income. Your separate ACC work (business) levy depends on your industry classification and is not included." });
  findings.push({ severity: "info", title: "Student loan repayments are 12% of income over $24,128 and are only included when you tick yes. Other income, tax credits, losses carried forward and deductions such as home office are not modelled." });
  return out;
}

export function summaryText(r) {
  const L = [];
  L.push("New Zealand self-employed tax set-aside, 2025-26 tax year");
  L.push(`Income $${r.revenue.toFixed(2)}, expenses $${r.expenses.toFixed(2)}, net $${r.net.toFixed(2)}`);
  L.push(`Income tax: $${r.tax.toFixed(2)}`);
  L.push(`ACC earners' levy: $${r.acc.toFixed(2)}`);
  if (r.studentLoan) L.push(`Student loan repayment: $${r.studentLoan.toFixed(2)}`);
  L.push(`Set aside: $${r.total.toFixed(2)} (${r.setAsidePct}% of income, $${r.monthly.toFixed(2)} a month)`);
  L.push("Verify figures on ird.govt.nz. Not tax advice.");
  return L.join("\n");
}
