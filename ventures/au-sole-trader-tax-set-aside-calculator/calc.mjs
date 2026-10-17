// Australia sole-trader tax set-aside: resident income tax brackets, Medicare
// levy, low income tax offset, an optional HELP repayment rate, the GST
// registration line and PAYG instalment flag. Figures are written from the
// published ATO tables (2025-26 and 2026-27); the ATO decides. Pure functions.

export const YEARS = {
  "2025-26": { brackets: [[18200, 0], [45000, 0.16], [135000, 0.3], [190000, 0.37], [Infinity, 0.45]] },
  "2026-27": { brackets: [[18200, 0], [45000, 0.15], [135000, 0.3], [190000, 0.37], [Infinity, 0.45]] },
};
export const MEDICARE = 0.02;
export const GST_THRESHOLD = 75000;
export const INSTALMENT_TAX = 1000;
// Small business income tax offset: 16% of tax on business income, capped at $1,000
// (sole traders with turnover under $5 million). Here all income is business income.
export const SBITO_RATE = 0.16;
export const SBITO_CAP = 1000;

export const SAMPLE = { year: "2025-26", revenue: "110000", expenses: "24000", helpRate: "" };

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

// Low income tax offset: $700 to $37,500, then 5c per dollar to $45,000,
// then 1.5c per dollar to $66,667.
export function lito(taxable) {
  if (taxable <= 37500) return 700;
  if (taxable <= 45000) return r2(700 - (taxable - 37500) * 0.05);
  if (taxable <= 66667) return r2(325 - (taxable - 45000) * 0.015);
  return 0;
}

export function compute(input) {
  const errors = [];
  const year = Object.hasOwn(YEARS, input.year) ? String(input.year) : "2025-26";
  const revenue = num(input.revenue);
  const expenses = num(input.expenses) ?? 0;
  const help = num(input.helpRate) ?? 0;
  if (revenue === null || Number.isNaN(revenue) || revenue < 0) errors.push("Enter your business income for the year, excluding GST (0 or more).");
  if (Number.isNaN(expenses) || expenses < 0) errors.push("Expenses must be 0 or more.");
  if (Number.isNaN(help) || help < 0 || help > 10) errors.push("HELP repayment rate must be between 0 and 10 percent.");
  if (errors.length) return { errors };

  const net = r2(Math.max(0, revenue - expenses));
  const gross = incomeTax(net, year);
  const offset = Math.min(gross, lito(net));
  const sbito = r2(Math.min(SBITO_CAP, SBITO_RATE * gross, Math.max(0, gross - offset)));
  const tax = r2(gross - offset - sbito);
  const medicare = r2(net * MEDICARE);
  const helpRepay = r2(net * (help / 100));
  const total = r2(tax + medicare + helpRepay);
  const setAsidePct = revenue > 0 ? r2((total / revenue) * 100) : 0;
  const setAsideOfNet = net > 0 ? r2((total / net) * 100) : 0;
  const findings = [];
  const out = { errors: [], year, revenue, expenses, net, grossTax: gross, offset, sbito, tax, medicare, helpRepay, total, setAsidePct, setAsideOfNet, afterTax: r2(net - total), monthly: r2(total / 12), perThousand: r2((total / Math.max(revenue, 1)) * 1000), findings };

  findings.push({ severity: "high", title: `Set aside about $${total.toFixed(2)} (${setAsidePct}% of income, ${setAsideOfNet}% of profit): $${tax.toFixed(2)} income tax, $${medicare.toFixed(2)} Medicare levy${helpRepay ? ` and $${helpRepay.toFixed(2)} HELP` : ""}. That is roughly $${out.perThousand.toFixed(0)} from every $1,000 you invoice.` });
  if (revenue > GST_THRESHOLD) findings.push({ severity: "medium", title: `Income is above the $75,000 GST registration turnover. Once your GST turnover reaches it you must register within 21 days and add GST to sales. That GST belongs to the ATO and is not in the figure above.` });
  if (tax + medicare > INSTALMENT_TAX) findings.push({ severity: "medium", title: `Tax plus Medicare is above $1,000, so after your first assessment the ATO may place you on PAYG instalments (quarterly: 28 October, 28 February, 28 May, 28 July). Instalments are credited against the year's tax.` });
  if (sbito > 0) findings.push({ severity: "info", title: `Includes a small business income tax offset of $${sbito.toFixed(2)} (16% of tax on business income, capped at $1,000, for turnover under $5 million).` });
  findings.push({ severity: "info", title: "Sole traders are not required to pay themselves superannuation. Anything you add voluntarily is not in this figure." });
  findings.push({ severity: "info", title: "The Medicare levy is a flat 2% here. Low-income reductions, the Medicare levy surcharge, other income and other offsets are not modelled." });
  if (year === "2026-27") findings.push({ severity: "info", title: "2026-27 uses the 15% rate on $18,201 to $45,000 that is legislated to start on 1 July 2026." });
  return out;
}

export function summaryText(r) {
  const L = [];
  L.push(`Australia sole-trader tax set-aside, ${r.year} income year`);
  L.push(`Income $${r.revenue.toFixed(2)}, expenses $${r.expenses.toFixed(2)}, net $${r.net.toFixed(2)}`);
  L.push(`Income tax after offset: $${r.tax.toFixed(2)}`);
  L.push(`Medicare levy: $${r.medicare.toFixed(2)}`);
  if (r.helpRepay) L.push(`HELP repayment: $${r.helpRepay.toFixed(2)}`);
  L.push(`Set aside: $${r.total.toFixed(2)} (${r.setAsidePct}% of income, $${r.monthly.toFixed(2)} a month)`);
  L.push("Verify figures on ato.gov.au. Not tax advice.");
  return L.join("\n");
}
