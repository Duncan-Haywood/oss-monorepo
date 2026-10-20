// India freelancer / professional tax set-aside: income tax under the new tax
// regime (the default since FY 2023-24) for FY 2025-26 (assessment year
// 2026-27), the section 87A rebate with marginal relief, 4% health and
// education cess, and the section 44ADA presumptive scheme (50% of receipts
// deemed profit). Figures are written from the Union Budget 2025 slabs without
// a live lookup; the Income Tax Department decides. Pure functions.

export const YEARS = {
  "2025-26": {
    // [upper bound, marginal rate, tax at the bottom of the band]
    bands: [
      [400000, 0, 0],
      [800000, 0.05, 0],
      [1200000, 0.1, 20000],
      [1600000, 0.15, 60000],
      [2000000, 0.2, 120000],
      [2400000, 0.25, 200000],
      [Infinity, 0.3, 300000],
    ],
    rebateLimit: 1200000,
    rebateMax: 60000,
    cess: 0.04,
    presumptiveRate: 0.5,
    presumptiveLimit: 5000000,
    presumptiveLimitLowCash: 7500000,
    gstServices: 2000000,
  },
};

export const SAMPLE = { year: "2025-26", revenue: "2400000", expenses: "400000", scheme: "actual", cash: "no" };

const num = (v) => {
  const s = String(v ?? "").trim().replace(/[₹,\s]|rs\.?/gi, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round(n * 100) / 100;

export function slabTax(taxable, y) {
  const Y = YEARS[y];
  if (taxable <= 0) return 0;
  let lo = 0;
  for (const [hi, rate, base] of Y.bands) {
    if (taxable <= hi) return r2(base + (taxable - lo) * rate);
    lo = hi;
  }
  return 0;
}

// Tax before cess after the section 87A rebate and its marginal relief.
export function taxAfterRebate(taxable, y) {
  const Y = YEARS[y];
  const gross = slabTax(taxable, y);
  if (taxable <= Y.rebateLimit) return Math.max(0, r2(gross - Math.min(gross, Y.rebateMax)));
  return r2(Math.min(gross, taxable - Y.rebateLimit));
}

export function incomeTax(taxable, y) {
  const before = taxAfterRebate(taxable, y);
  const cess = r2(before * YEARS[y].cess);
  return { gross: slabTax(taxable, y), beforeCess: before, cess, total: r2(before + cess) };
}

export function compute(input) {
  const errors = [];
  const year = Object.hasOwn(YEARS, input.year) ? String(input.year) : "2025-26";
  const scheme = input.scheme === "44ADA" ? "44ADA" : "actual";
  const lowCash = input.cash === "yes";
  const revenue = num(input.revenue);
  const expenses = num(input.expenses) ?? 0;
  if (revenue === null || Number.isNaN(revenue) || revenue < 0) errors.push("Enter your professional receipts for the year, excluding GST (0 or more).");
  if (Number.isNaN(expenses) || expenses < 0) errors.push("Expenses must be 0 or more.");
  if (errors.length) return { errors };

  const Y = YEARS[year];
  const limit = lowCash ? Y.presumptiveLimitLowCash : Y.presumptiveLimit;
  const eligible = revenue <= limit;
  const actualProfit = r2(Math.max(0, revenue - expenses));
  const presumptiveProfit = r2(revenue * Y.presumptiveRate);
  const usePresumptive = scheme === "44ADA" && eligible;
  const profit = usePresumptive ? presumptiveProfit : actualProfit;
  const t = incomeTax(profit, year);
  const alt = incomeTax(usePresumptive ? actualProfit : presumptiveProfit, year);
  const total = t.total;
  const setAsidePct = revenue > 0 ? r2((total / revenue) * 100) : 0;
  const setAsideOfProfit = profit > 0 ? r2((total / profit) * 100) : 0;
  const findings = [];
  const out = {
    errors: [], year, scheme: usePresumptive ? "44ADA" : "actual", revenue, expenses, profit, taxable: profit,
    grossTax: t.gross, taxBeforeCess: t.beforeCess, cess: t.cess, tax: total, total, setAsidePct, setAsideOfProfit,
    afterTax: r2(profit - total), monthly: r2(total / 12), perThousand: r2((total / Math.max(revenue, 1)) * 1000),
    advanceTax: [
      { due: "15 June", cumulative: 0.15, amount: r2(total * 0.15) },
      { due: "15 September", cumulative: 0.45, amount: r2(total * 0.45) },
      { due: "15 December", cumulative: 0.75, amount: r2(total * 0.75) },
      { due: "15 March", cumulative: 1, amount: total },
    ],
    otherSchemeTax: alt.total, findings,
  };
  const fmt = (n) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  findings.push({ severity: "high", title: `Set aside about ₹${fmt(total)} (${setAsidePct}% of receipts, ${setAsideOfProfit}% of profit) for income tax. That is roughly ₹${fmt(out.perThousand)} from every ₹1,000 you invoice.` });
  if (total > 10000) {
    if (usePresumptive) findings.push({ severity: "medium", title: "Under section 44ADA you can pay all of the advance tax in one instalment on or before 15 March, instead of the four quarterly instalments. Interest under sections 234B and 234C applies if you miss it." });
    else findings.push({ severity: "medium", title: `Advance tax is due when your tax for the year is ₹10,000 or more, in four instalments: ${out.advanceTax.map((a) => `${Math.round(a.cumulative * 100)}% by ${a.due}`).join(", ")}. Interest under sections 234B and 234C applies to shortfalls.` });
  } else findings.push({ severity: "info", title: "Tax under ₹10,000 for the year means no advance tax is due; pay the balance as self-assessment tax when you file your return." });
  if (scheme === "44ADA" && !eligible) findings.push({ severity: "high", title: `Receipts of ₹${fmt(revenue)} are above the section 44ADA limit of ₹${fmt(limit)}${lowCash ? "" : " (₹75 lakh if at least 95% of receipts are received digitally)"}, so the figures above use your actual expenses. You would also need audited books.` });
  else if (eligible && revenue > 0 && actualProfit !== presumptiveProfit) {
    const better = alt.total < t.total;
    findings.push({ severity: "info", title: usePresumptive
      ? `Declaring actual expenses (₹${fmt(expenses)}) instead of the 50% presumptive profit would give profit of ₹${fmt(actualProfit)} and tax of ₹${fmt(alt.total)}, ${better ? "less" : "more"} than the ₹${fmt(total)} here. Opting out of 44ADA can require maintaining books and an audit for five years if your profit is below 50%, so ask a chartered accountant first.`
      : `Section 44ADA would treat 50% of receipts as profit (₹${fmt(presumptiveProfit)}) with no expense records, giving tax of ₹${fmt(alt.total)} against ₹${fmt(total)} here${alt.total < t.total ? ". If your real expenses are under half of your receipts, the presumptive scheme costs less tax" : ""}. It applies only to specified professions such as consultants, engineers, architects, doctors, lawyers, accountants and interior designers.` });
  }
  if (profit > 5000000) findings.push({ severity: "medium", title: "Income above ₹50 lakh attracts a surcharge on top of the figure above (10% above ₹50 lakh, 15% above ₹1 crore, 25% above ₹2 crore, with marginal relief). It is not modelled here." });
  if (revenue > Y.gstServices) findings.push({ severity: "medium", title: `Aggregate turnover above ₹${fmt(Y.gstServices)} for services (₹10 lakh in most special category states) means you must register for GST, and the GST you charge belongs to the government. Exporters of services should check the zero-rated export rules.` });
  if (profit > 0 && profit <= Y.rebateLimit) findings.push({ severity: "info", title: `Taxable income up to ₹${fmt(Y.rebateLimit)} gets the section 87A rebate of up to ₹${fmt(Y.rebateMax)}, so under the new regime no income tax is due even though you may still need to file a return.` });
  findings.push({ severity: "info", title: "This uses the new tax regime, which is the default. The old regime, with deductions such as section 80C and 80D, is not modelled, and neither are TDS already deducted by clients (Form 26AS), capital gains, interest, dividends, rental income or the surcharge. Credit TDS against your total before paying advance tax." });
  findings.push({ severity: "info", title: "The tables are the FY 2025-26 (assessment year 2026-27) slabs from the Union Budget 2025, written without a live lookup. Check incometax.gov.in or ask a chartered accountant for the real figure." });
  return out;
}

export function summaryText(r) {
  const f = (n) => "₹" + (Math.round(n * 100) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const L = [];
  L.push(`India freelancer tax set-aside, FY ${r.year} (new tax regime)`);
  L.push(`Receipts ${f(r.revenue)}, ${r.scheme === "44ADA" ? "presumptive profit under section 44ADA (50%)" : "expenses " + f(r.expenses)}, taxable profit ${f(r.profit)}`);
  L.push(`Tax on the slabs after rebate: ${f(r.taxBeforeCess)}, plus 4% cess ${f(r.cess)}`);
  L.push(`Income tax: ${f(r.tax)}`);
  L.push(`Set aside: ${f(r.total)} (${r.setAsidePct}% of receipts, ${f(r.monthly)} a month)`);
  L.push("Advance tax: " + r.advanceTax.map((a) => `${f(a.amount)} cumulative by ${a.due}`).join("; "));
  L.push("Verify figures on incometax.gov.in. Not tax advice.");
  return L.join("\n");
}
