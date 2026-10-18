// Singapore freelancer / sole proprietor tax set-aside: resident individual
// income tax on net trade income, earned income relief, other reliefs and the
// MediSave contribution flag. Figures are the IRAS resident rates in force
// since YA 2024, applied to income earned in 2026 (Year of Assessment 2027),
// written from published tables without a live lookup; IRAS decides.
// Pure functions.

export const YEARS = {
  "2027": {
    // [upper bound of band, marginal rate], on chargeable income
    bands: [[20000, 0], [30000, 0.02], [40000, 0.035], [80000, 0.07], [120000, 0.115], [160000, 0.15], [200000, 0.18], [240000, 0.19], [280000, 0.195], [320000, 0.2], [500000, 0.22], [1000000, 0.23], [Infinity, 0.24]],
    earnedIncomeRelief: { under55: 1000, "55to59": 6000, "60plus": 8000 },
    reliefCap: 80000,
    gstThreshold: 1000000,
    medisaveFrom: 6000,
    filingFrom: 6000,
  },
};

export const AGES = { under55: "Under 55", "55to59": "55 to 59", "60plus": "60 or over" };
export const SAMPLE = { year: "2027", revenue: "120000", expenses: "30000", age: "under55", relief: "0" };

const num = (v) => {
  const s = String(v ?? "").trim().replace(/[S$,\s]/gi, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round(n * 100) / 100;

export function incomeTax(chargeable, y) {
  const Y = YEARS[y];
  let tax = 0, lo = 0;
  for (const [hi, rate] of Y.bands) {
    if (chargeable > lo) tax += (Math.min(chargeable, hi) - lo) * rate;
    lo = hi;
  }
  return r2(tax);
}

export function marginalRate(chargeable, y) {
  const Y = YEARS[y];
  let lo = 0;
  for (const [hi, rate] of Y.bands) {
    if (chargeable <= hi) return rate;
    lo = hi;
  }
  return Y.bands[Y.bands.length - 1][1];
}

export function compute(input) {
  const errors = [];
  const year = Object.hasOwn(YEARS, input.year) ? String(input.year) : "2027";
  const Y = YEARS[year];
  const age = Y.earnedIncomeRelief[input.age] !== undefined ? input.age : "under55";
  const revenue = num(input.revenue);
  const expenses = num(input.expenses) ?? 0;
  const otherRelief = num(input.relief) ?? 0;
  if (revenue === null || Number.isNaN(revenue) || revenue < 0) errors.push("Enter your business income for the year, excluding GST (0 or more).");
  if (Number.isNaN(expenses) || expenses < 0) errors.push("Expenses must be 0 or more.");
  if (Number.isNaN(otherRelief) || otherRelief < 0) errors.push("Other reliefs must be 0 or more.");
  if (errors.length) return { errors };

  const profit = r2(Math.max(0, revenue - expenses));
  const eir = profit > 0 ? Math.min(Y.earnedIncomeRelief[age], profit) : 0;
  const reliefs = r2(Math.min(Y.reliefCap, eir + otherRelief));
  const chargeable = r2(Math.max(0, profit - reliefs));
  const tax = incomeTax(chargeable, year);
  const total = tax;
  const setAsidePct = revenue > 0 ? r2((total / revenue) * 100) : 0;
  const setAsideOfProfit = profit > 0 ? r2((total / profit) * 100) : 0;
  const mr = marginalRate(chargeable, year);
  const findings = [];
  const out = { errors: [], year, age, revenue, expenses, profit, eir, otherRelief, reliefs, chargeable, tax, total, setAsidePct, setAsideOfProfit, marginal: mr, afterTax: r2(profit - total), monthly: r2(total / 12), perThousand: r2((total / Math.max(revenue, 1)) * 1000), findings };

  findings.push({ severity: "high", title: `Set aside about S$${total.toFixed(2)} (${setAsidePct}% of income, ${setAsideOfProfit}% of profit) for income tax. That is roughly S$${out.perThousand.toFixed(0)} from every S$1,000 you invoice. Your next dollar of profit is taxed at ${(mr * 100).toFixed(1).replace(/\.0$/, "")}%.` });
  if (profit > Y.medisaveFrom) findings.push({ severity: "medium", title: "Self-employed people with net trade income above S$6,000 must also contribute to MediSave, paid with the tax bill. The amount depends on age and income, is not modelled here, and is on top of the figure above. Check the CPF Board's contribution table." });
  findings.push({ severity: "medium", title: "There is no provisional tax. File Form B (e-File on myTax Portal) by 18 April for income earned in the previous calendar year; IRAS then issues a Notice of Assessment and you can usually pay by GIRO instalments over up to 12 months with no interest. Keep the money aside until then." });
  if (revenue > Y.gstThreshold * 0.8) findings.push({ severity: "medium", title: "GST registration is compulsory when taxable turnover exceeds S$1 million (or is expected to). Your income is close to or above that. GST you charge belongs to IRAS and is not in the figure above." });
  if (otherRelief > 0 && eir + otherRelief > Y.reliefCap) findings.push({ severity: "info", title: "Total personal reliefs are capped at S$80,000 a year; the figure above applies the cap." });
  findings.push({ severity: "info", title: "Income earned in 2026 is assessed in Year of Assessment 2027. Resident rates are shown. Non-residents are taxed differently and are not modelled. No personal income tax rebate is applied." });
  findings.push({ severity: "info", title: "Spouse, child, parent and course-fee reliefs, CPF and SRS top-ups beyond what you enter, rental and other income, partnership share, and trade losses are not modelled. Enter total extra reliefs in the Other reliefs box." });
  return out;
}

export function summaryText(r) {
  const L = [];
  L.push(`Singapore freelancer tax set-aside, Year of Assessment ${r.year} (income earned in ${Number(r.year) - 1})`);
  L.push(`Income S$${r.revenue.toFixed(2)}, expenses S$${r.expenses.toFixed(2)}, net trade income S$${r.profit.toFixed(2)}`);
  L.push(`Earned income relief: S$${r.eir.toFixed(2)}; other reliefs: S$${r.otherRelief.toFixed(2)}`);
  L.push(`Chargeable income: S$${r.chargeable.toFixed(2)}`);
  L.push(`Income tax: S$${r.tax.toFixed(2)}`);
  L.push(`Set aside: S$${r.total.toFixed(2)} (${r.setAsidePct}% of income, S$${r.monthly.toFixed(2)} a month). MediSave not included.`);
  L.push("Verify figures on iras.gov.sg. Not tax advice.");
  return L.join("\n");
}
