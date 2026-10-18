// Netherlands ZZP / eenmanszaak tax set-aside: Box 1 income tax (three
// brackets), zelfstandigenaftrek, startersaftrek, MKB-winstvrijstelling,
// algemene heffingskorting, arbeidskorting and the income-related Zvw
// contribution. Figures are the 2026 values published by accountants,
// KvK and the Belastingplan 2026 summaries, written without a live
// Belastingdienst lookup; the Belastingdienst decides. Pure functions.

export const YEARS = {
  "2026": {
    brackets: [[38883, 0.3575], [78426, 0.3756], [Infinity, 0.495]],
    deductionRateCap: 0.3756,
    zelfstandigenaftrek: 1200,
    startersaftrek: 2123,
    mkbExemption: 0.127,
    hoursTest: 1225,
    ahk: { max: 3115, from: 29736, rate: 0.06398 },
    arbeidskorting: [
      [0, 0, 0.08324],
      [11965, 996, 0.31009],
      [25845, 5300, 0.0195],
      [45592, 5685, -0.0651],
    ],
    zvwRate: 0.0485,
    zvwMax: 79412,
    kor: 20000,
  },
};

export const SAMPLE = { year: "2026", revenue: "85000", expenses: "15000", hours: "yes", starter: "no" };

const num = (v) => {
  const s = String(v ?? "").trim().replace(/[€,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round(n * 100) / 100;

export function bracketTax(income, y) {
  const Y = YEARS[y];
  let tax = 0, lo = 0;
  for (const [hi, rate] of Y.brackets) {
    if (income > lo) tax += (Math.min(income, hi) - lo) * rate;
    lo = hi;
  }
  return tax;
}

// General tax credit: phases out above `from` for a single person.
export function algemeneHeffingskorting(income, y) {
  const { max, from, rate } = YEARS[y].ahk;
  return r2(Math.max(0, max - Math.max(0, income - from) * rate));
}

// Labour credit on income from work (for an entrepreneur: profit after the
// entrepreneur deductions, before the MKB exemption). Rows are
// [lower bound, credit at the lower bound, rate above it].
export function arbeidskorting(work, y) {
  const rows = YEARS[y].arbeidskorting;
  if (work <= 0) return 0;
  const row = [...rows].reverse().find(([lower]) => work > lower) ?? rows[0];
  const [lower, base, rate] = row;
  return r2(Math.max(0, base + rate * (work - lower)));
}

export function zvw(taxableProfit, y) {
  const Y = YEARS[y];
  return r2(Math.min(Math.max(0, taxableProfit), Y.zvwMax) * Y.zvwRate);
}

export function compute(input) {
  const errors = [];
  const year = Object.hasOwn(YEARS, input.year) ? String(input.year) : "2026";
  const Y = YEARS[year];
  const revenue = num(input.revenue);
  const expenses = num(input.expenses) ?? 0;
  if (revenue === null || Number.isNaN(revenue) || revenue < 0) errors.push("Enter your business income for the year, excluding BTW (0 or more).");
  if (Number.isNaN(expenses) || expenses < 0) errors.push("Expenses must be 0 or more.");
  if (errors.length) return { errors };

  const hours = input.hours === "no" ? "no" : "yes";
  const starter = input.starter === "yes" ? "yes" : "no";
  const profit = r2(Math.max(0, revenue - expenses));
  const zelf = hours === "yes" ? Math.min(Y.zelfstandigenaftrek, profit) : 0;
  const start = hours === "yes" && starter === "yes" ? Math.min(Y.startersaftrek, profit - zelf) : 0;
  const afterEntrepreneur = r2(profit - zelf - start);
  const mkb = r2(afterEntrepreneur * Y.mkbExemption);
  const taxable = r2(afterEntrepreneur - mkb);

  // Deductions reduce tax at no more than the cap rate (37.56%).
  const deductions = zelf + start + mkb;
  const grossBefore = bracketTax(profit, year);
  const benefit = Math.min(grossBefore - bracketTax(profit - deductions, year), deductions * Y.deductionRateCap);
  const gross = r2(grossBefore - benefit);
  const ahk = algemeneHeffingskorting(taxable, year);
  const ak = arbeidskorting(afterEntrepreneur, year);
  const credits = Math.min(gross, ahk + ak);
  const incomeTaxAmt = r2(Math.max(0, gross - credits));
  const zvwAmt = zvw(taxable, year);
  const total = r2(incomeTaxAmt + zvwAmt);
  const setAsidePct = revenue > 0 ? r2((total / revenue) * 100) : 0;
  const setAsideOfProfit = profit > 0 ? r2((total / profit) * 100) : 0;
  const findings = [];
  const out = { errors: [], year, revenue, expenses, profit, zelfstandigenaftrek: zelf, startersaftrek: start, mkb, taxable, grossTax: gross, ahk, arbeidskorting: ak, tax: incomeTaxAmt, zvw: zvwAmt, total, setAsidePct, setAsideOfProfit, afterTax: r2(profit - total), monthly: r2(total / 12), perThousand: r2((total / Math.max(revenue, 1)) * 1000), findings };

  findings.push({ severity: "high", title: `Set aside about €${total.toFixed(2)} (${setAsidePct}% of turnover, ${setAsideOfProfit}% of profit): €${incomeTaxAmt.toFixed(2)} income tax and €${zvwAmt.toFixed(2)} Zvw contribution. That is roughly €${out.perThousand.toFixed(0)} from every €1,000 you invoice.` });
  if (hours === "no") findings.push({ severity: "medium", title: "Without the 1,225-hour test (urencriterium) you get no zelfstandigenaftrek or startersaftrek. The MKB-winstvrijstelling still applies." });
  if (revenue > Y.kor) findings.push({ severity: "medium", title: `Turnover above €${Y.kor.toLocaleString("en-US")} means you cannot use the small business scheme (KOR) and must charge and file BTW (usually 21%). BTW you collect belongs to the Belastingdienst and is not in the figure above.` });
  findings.push({ severity: "medium", title: "You file the annual income tax return (aangifte inkomstenbelasting) by 1 May of the following year, extendable on request. Ask for a voorlopige aanslag so you pay in monthly instalments instead of one large bill after assessment." });
  if (taxable > Y.brackets[1][0]) findings.push({ severity: "info", title: "Part of your income falls in the 49.5% bracket. The entrepreneur deductions and MKB exemption only reduce tax at up to 37.56%, which the figure above applies." });
  findings.push({ severity: "info", title: "Zvw is shown at 4.85% of taxable profit up to €79,412. The Belastingdienst sets this contribution in the assessment; check the current rate and ceiling on belastingdienst.nl." });
  findings.push({ severity: "info", title: "Not modelled: other income, a fiscal partner (transferable credits), the fiscale oudedagsreserve, pension contributions, mortgage interest, other deductions, AOW-age rates, or the box 3 wealth tax. The credits assume a single person below AOW age." });
  return out;
}

export function summaryText(r) {
  const L = [];
  L.push(`Netherlands ZZP tax set-aside, ${r.year} tax year`);
  L.push(`Turnover €${r.revenue.toFixed(2)}, expenses €${r.expenses.toFixed(2)}, profit €${r.profit.toFixed(2)}`);
  L.push(`Zelfstandigenaftrek €${r.zelfstandigenaftrek.toFixed(2)}, startersaftrek €${r.startersaftrek.toFixed(2)}, MKB-winstvrijstelling €${r.mkb.toFixed(2)}`);
  L.push(`Income tax after credits: €${r.tax.toFixed(2)}`);
  L.push(`Zvw contribution: €${r.zvw.toFixed(2)}`);
  L.push(`Set aside: €${r.total.toFixed(2)} (${r.setAsidePct}% of turnover, €${r.monthly.toFixed(2)} a month)`);
  L.push("Verify figures on belastingdienst.nl. Not tax advice.");
  return L.join("\n");
}
