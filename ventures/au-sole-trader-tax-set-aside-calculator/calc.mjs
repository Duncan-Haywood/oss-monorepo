// Australia sole-trader tax set-aside: resident income tax, the 2% Medicare
// levy, the small business income tax offset, an optional personal super
// deduction, and the GST / PAYG-instalment flags. Figures are written from
// the published ATO tables (2025-26 and 2026-27); the ATO decides.
// Pure functions, no I/O.

export const YEARS = {
  2026: { // 2025-26 income year (1 Jul 2025 - 30 Jun 2026)
    label: "2025-26",
    brackets: [[18200, 0], [45000, 0.16], [135000, 0.30], [190000, 0.37], [Infinity, 0.45]],
  },
  2027: { // 2026-27 income year: the 16% rate drops to 15%
    label: "2026-27",
    brackets: [[18200, 0], [45000, 0.15], [135000, 0.30], [190000, 0.37], [Infinity, 0.45]],
  },
};
export const MEDICARE = 0.02;
export const SBITO_RATE = 0.16;
export const SBITO_CAP = 1000;
export const GST_THRESHOLD = 75000;
export const CONCESSIONAL_CAP = 30000;

export const SAMPLE = { year: "2026", revenue: "110000", expenses: "24000", superDeduction: "", otherDeductions: "" };

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

export function compute(input) {
  const errors = [];
  const year = YEARS[input.year] ? String(input.year) : "2026";
  const revenue = num(input.revenue);
  const expenses = num(input.expenses) ?? 0;
  const sup = num(input.superDeduction) ?? 0;
  const other = num(input.otherDeductions) ?? 0;
  if (revenue === null || Number.isNaN(revenue) || revenue < 0) errors.push("Enter your business income for the year (0 or more).");
  if (Number.isNaN(expenses) || expenses < 0) errors.push("Expenses must be 0 or more.");
  if (Number.isNaN(sup) || sup < 0) errors.push("Super deduction must be 0 or more.");
  if (Number.isNaN(other) || other < 0) errors.push("Other deductions must be 0 or more.");
  if (errors.length) return { errors };

  const net = r2(Math.max(0, revenue - expenses));
  const superUsed = Math.min(sup, net);
  const taxable = r2(Math.max(0, net - superUsed - other));
  const gross = incomeTax(taxable, year);
  const offset = r2(Math.min(SBITO_CAP, gross * SBITO_RATE));
  const incomeTaxDue = r2(gross - offset);
  const medicare = r2(taxable * MEDICARE);
  const total = r2(incomeTaxDue + medicare);
  const setAsidePct = revenue > 0 ? r2((total / revenue) * 100) : 0;
  const setAsideOfNet = net > 0 ? r2((total / net) * 100) : 0;
  const findings = [];
  const out = { errors: [], year, label: YEARS[year].label, revenue, expenses, net, superDeduction: superUsed, taxable, gross, offset, incomeTax: incomeTaxDue, medicare, total, setAsidePct, setAsideOfNet, afterTax: r2(net - total), monthly: r2(total / 12), perThousand: r2((total / Math.max(revenue, 1)) * 1000), findings };

  findings.push({ severity: "high", title: `Set aside about $${total.toFixed(2)} (${setAsidePct}% of income, ${setAsideOfNet}% of profit): $${incomeTaxDue.toFixed(2)} income tax and $${medicare.toFixed(2)} Medicare levy. That is roughly $${out.perThousand.toFixed(0)} from every $1,000 you invoice.` });
  findings.push({ severity: "info", title: "As a sole trader there is no compulsory super. Nothing here is set aside for retirement unless you enter a personal super deduction." });
  if (revenue > GST_THRESHOLD) findings.push({ severity: "medium", title: `Income is above the $75,000 GST turnover threshold. Once your GST turnover reaches it you must register within 21 days, charge GST and remit it. GST you collect is not your money and is not in the figure above.` });
  if (sup > CONCESSIONAL_CAP) findings.push({ severity: "medium", title: `A super deduction above the $${CONCESSIONAL_CAP.toLocaleString("en-AU")} concessional cap can trigger extra tax. Unused cap from earlier years may carry forward; check with the ATO.` });
  if (sup > net && sup > 0) findings.push({ severity: "info", title: "The super deduction was limited to your profit, because a personal contribution deduction cannot create a loss." });
  if (total > 4000) findings.push({ severity: "info", title: "After your first return the ATO may put you on PAYG instalments, which prepay this tax in quarterly amounts (28 Oct, 28 Feb, 28 Apr, 28 Jul). The ATO notifies you; this tool cannot tell if it applies to you." });
  if (taxable > 0 && taxable < 40000) findings.push({ severity: "info", title: "Low incomes can get a reduced or nil Medicare levy. This tool applies the flat 2% and does not model that, so your real bill may be lower." });
  findings.push({ severity: "info", title: "Resident rates are assumed. HELP/HECS repayments, the Medicare levy surcharge, other income and other offsets are not included." });
  return out;
}

export function summaryText(r) {
  const L = [];
  L.push(`Australia sole-trader tax set-aside, ${r.label} income year`);
  L.push(`Income $${r.revenue.toFixed(2)}, expenses $${r.expenses.toFixed(2)}, profit $${r.net.toFixed(2)}`);
  L.push(`Income tax after small business offset: $${r.incomeTax.toFixed(2)}`);
  L.push(`Medicare levy: $${r.medicare.toFixed(2)}`);
  L.push(`Set aside: $${r.total.toFixed(2)} (${r.setAsidePct}% of income, $${r.monthly.toFixed(2)} a month)`);
  L.push("Verify figures on ato.gov.au. Not tax advice.");
  return L.join("\n");
}
