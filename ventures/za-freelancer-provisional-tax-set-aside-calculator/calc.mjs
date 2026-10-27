// South Africa freelancer / sole proprietor tax set-aside: personal income tax
// on the 2025/26 SARS sliding scale, age rebates, medical scheme fees tax
// credits and a retirement annuity deduction. Self-employed people pay no UIF
// or SDL on their own income. Figures are written from the published SARS
// tables for the 2025/26 year of assessment (1 March 2025 - 28 February 2026),
// the latest set confirmed here, without a live lookup; 2026/27 tables may
// differ slightly and SARS decides. Pure functions.

export const YEARS = {
  "2025/26": {
    // [upper bound, marginal rate, tax at the bottom of the band]
    bands: [
      [237100, 0.18, 0],
      [370500, 0.26, 42678],
      [512800, 0.31, 77362],
      [673000, 0.36, 121475],
      [857900, 0.39, 179147],
      [1817000, 0.41, 251258],
      [Infinity, 0.45, 644489],
    ],
    rebates: { primary: 17235, secondary: 9444, tertiary: 3145 },
    medicalMonthly: { first: 364, additional: 246 },
    raRate: 0.275,
    raCap: 350000,
    vatCompulsory: 1000000,
    vatVoluntary: 50000,
  },
};

export const AGES = { under65: "Under 65", "65-74": "65 to 74", "75+": "75 or older" };

export const SAMPLE = { year: "2025/26", revenue: "600000", expenses: "120000", age: "under65", medical: "1", ra: "0" };

const num = (v) => {
  const s = String(v ?? "").trim().replace(/[R,\s]/gi, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round(n * 100) / 100;

export function grossTax(taxable, y) {
  const Y = YEARS[y];
  if (taxable <= 0) return 0;
  let lo = 0;
  for (const [hi, rate, base] of Y.bands) {
    if (taxable <= hi) return r2(base + (taxable - lo) * rate);
    lo = hi;
  }
  return 0;
}

export function rebateFor(age, y) {
  const { primary, secondary, tertiary } = YEARS[y].rebates;
  return primary + (age === "65-74" || age === "75+" ? secondary : 0) + (age === "75+" ? tertiary : 0);
}

export function medicalCredit(members, y) {
  const m = Math.max(0, Math.floor(members));
  const { first, additional } = YEARS[y].medicalMonthly;
  return (Math.min(m, 2) * first + Math.max(0, m - 2) * additional) * 12;
}

export function raDeduction(ra, profit, y) {
  const Y = YEARS[y];
  return r2(Math.max(0, Math.min(ra, profit * Y.raRate, Y.raCap)));
}

export function compute(input) {
  const errors = [];
  const year = Object.hasOwn(YEARS, input.year) ? String(input.year) : "2025/26";
  const age = Object.hasOwn(AGES, input.age) ? input.age : "under65";
  const revenue = num(input.revenue);
  const expenses = num(input.expenses) ?? 0;
  const medical = num(input.medical) ?? 0;
  const ra = num(input.ra) ?? 0;
  if (revenue === null || Number.isNaN(revenue) || revenue < 0) errors.push("Enter your business income for the year, excluding VAT (0 or more).");
  if (Number.isNaN(expenses) || expenses < 0) errors.push("Expenses must be 0 or more.");
  if (Number.isNaN(medical) || !Number.isInteger(medical) || medical < 0 || medical > 30) errors.push("Medical scheme members must be a whole number from 0 to 30.");
  if (Number.isNaN(ra) || ra < 0) errors.push("Retirement annuity contributions must be 0 or more.");
  if (errors.length) return { errors };

  const profit = r2(Math.max(0, revenue - expenses));
  const raDed = raDeduction(ra, profit, year);
  const taxable = r2(profit - raDed);
  const gross = grossTax(taxable, year);
  const rebate = rebateFor(age, year);
  const afterRebate = r2(Math.max(0, gross - rebate));
  const medCredit = medicalCredit(medical, year);
  const tax = r2(Math.max(0, afterRebate - medCredit));
  const total = tax;
  const setAsidePct = revenue > 0 ? r2((total / revenue) * 100) : 0;
  const setAsideOfProfit = profit > 0 ? r2((total / profit) * 100) : 0;
  const findings = [];
  const Y = YEARS[year];
  const out = {
    errors: [], year, age, revenue, expenses, profit, raDeduction: raDed, taxable, grossTax: gross, rebate,
    medicalCredit: medCredit, tax, total, setAsidePct, setAsideOfProfit,
    afterTax: r2(profit - total), monthly: r2(total / 12), perThousand: r2((total / Math.max(revenue, 1)) * 1000),
    firstPayment: r2(total / 2), findings,
  };

  findings.push({ severity: "high", title: `Set aside about R${total.toFixed(2)} (${setAsidePct}% of income, ${setAsideOfProfit}% of profit) for income tax. That is roughly R${out.perThousand.toFixed(0)} from every R1,000 you invoice.` });
  findings.push({ severity: "medium", title: `Freelancers and sole proprietors are normally provisional taxpayers: pay about half of the year's estimated tax by the end of August (first period) and the rest by the last day of February (second period), with an optional top-up after year end. As a rough guide the first payment here is R${out.firstPayment.toFixed(2)}. An estimate that is too low can attract an underestimation penalty, so check SARS's rules.` });
  if (revenue > Y.vatCompulsory) findings.push({ severity: "medium", title: `Turnover above R${Y.vatCompulsory.toLocaleString("en-ZA")} in any 12 months means you must register for VAT. VAT you charge belongs to SARS and is not in the figure above.` });
  else if (revenue > Y.vatVoluntary) findings.push({ severity: "info", title: `Turnover above R${Y.vatVoluntary.toLocaleString("en-ZA")} lets you register for VAT voluntarily; registration is compulsory above R${Y.vatCompulsory.toLocaleString("en-ZA")}. VAT you charge belongs to SARS.` });
  if (profit > 0 && profit <= Y.rebates.primary / 0.18 && age === "under65") findings.push({ severity: "info", title: `Taxable income below about R${Math.round(Y.rebates.primary / 0.18).toLocaleString("en-ZA")} is covered by the primary rebate, so there is no income tax to set aside, although you may still need to register and file.` });
  if (ra > raDed) findings.push({ severity: "info", title: `Only R${raDed.toFixed(2)} of your R${ra.toFixed(2)} retirement annuity contributions is deductible this year: the limit is 27.5% of profit, capped at R${Y.raCap.toLocaleString("en-ZA")}. The excess can usually be carried forward.` });
  findings.push({ severity: "info", title: "The tables used are SARS's 2025/26 year of assessment. The 2026/27 thresholds may differ slightly because brackets are usually adjusted each Budget. Check sars.gov.za and use the SARS eFiling provisional tax estimate for the real figure." });
  findings.push({ severity: "info", title: "Interest, dividends, capital gains, rental income, other employment income, home office, travel and other deductions and the additional medical expenses credit are not modelled. Self-employed people do not pay UIF or SDL on their own income." });
  return out;
}

export function summaryText(r) {
  const L = [];
  L.push(`South Africa freelancer tax set-aside, ${r.year} tax tables`);
  L.push(`Income R${r.revenue.toFixed(2)}, expenses R${r.expenses.toFixed(2)}, profit R${r.profit.toFixed(2)}`);
  L.push(`Retirement annuity deduction: R${r.raDeduction.toFixed(2)}; taxable income R${r.taxable.toFixed(2)}`);
  L.push(`Tax on the sliding scale: R${r.grossTax.toFixed(2)}, less rebate R${r.rebate.toFixed(2)} and medical credits R${r.medicalCredit.toFixed(2)}`);
  L.push(`Income tax: R${r.tax.toFixed(2)}`);
  L.push(`Set aside: R${r.total.toFixed(2)} (${r.setAsidePct}% of income, R${r.monthly.toFixed(2)} a month)`);
  L.push("Verify figures on sars.gov.za. Not tax advice.");
  return L.join("\n");
}
