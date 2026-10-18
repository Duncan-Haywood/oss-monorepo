// Commercial property valuation by the income approach. Pure functions, no I/O. Bad input is rejected with a
// message, never clamped. Every figure is typed by the reader; the page ships example numbers only.

export const VERIFY = "Your lender's underwriting guidelines (minimum DSCR and the expense and vacancy floors they apply), a local broker opinion of value or an MAI appraisal, and the property's actual trailing-12 operating statement";

export const LENDER_DSCR = 1.25; // a common commercial minimum; lenders differ, the page says so

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (k, label, { min = 0, max = Infinity } = {}) => {
    const raw = Number(i[k]);
    if (i[k] === undefined || i[k] === "" || i[k] === null || !Number.isFinite(raw) || raw < min || raw > max) {
      errors.push(`Enter ${label}${Number.isFinite(max) ? ` (${min} to ${max})` : ` of ${min} or more`}.`);
      return 0;
    }
    return raw;
  };
  const gpr = num("gpr", "the gross potential rent per year in dollars (all units rented at market, before vacancy)", { min: 1, max: 1e9 });
  const otherIncome = num("otherIncome", "other income per year in dollars (parking, laundry, fees; 0 if none)", { max: 1e9 });
  const vacancy = num("vacancy", "the vacancy and credit loss in percent", { max: 100 });
  const tax = num("tax", "property tax per year in dollars", { max: 1e9 });
  const insurance = num("insurance", "insurance per year in dollars", { max: 1e9 });
  const utilities = num("utilities", "owner-paid utilities per year in dollars", { max: 1e9 });
  const maintenance = num("maintenance", "repairs and maintenance per year in dollars", { max: 1e9 });
  const mgmt = num("mgmt", "the management fee in percent of collected income", { max: 100 });
  const reserves = num("reserves", "replacement reserves per year in dollars", { max: 1e9 });
  const otherOpex = num("otherOpex", "other operating expenses per year in dollars", { max: 1e9 });
  const capRate = num("capRate", "the market cap rate in percent", { min: 0.5, max: 30 });
  const price = num("price", "the asking or purchase price in dollars (0 to skip the financing section)", { max: 1e10 });
  const ltv = num("ltv", "the loan-to-value in percent", { max: 95 });
  const rate = num("rate", "the loan interest rate in percent", { max: 30 });
  const years = num("years", "the amortization in years", { min: 1, max: 40 });
  return { errors, gpr, otherIncome, vacancy, tax, insurance, utilities, maintenance, mgmt, reserves, otherOpex, capRate, price, ltv, rate, years };
}

const r1 = (v) => Math.round(v * 10) / 10;
export const money = (v) => (v < 0 ? "-$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-US");
export const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";

// Level monthly payment on a loan, annualised.
export function annualDebtService(loan, ratePct, years) {
  if (loan <= 0) return 0;
  const n = years * 12;
  const r = ratePct / 100 / 12;
  const pmt = r === 0 ? loan / n : (loan * r) / (1 - Math.pow(1 + r, -n));
  return pmt * 12;
}

// The largest loan whose annual payment is `ds`.
export function loanForDebtService(ds, ratePct, years) {
  const n = years * 12;
  const r = ratePct / 100 / 12;
  const pmt = ds / 12;
  return r === 0 ? pmt * n : (pmt * (1 - Math.pow(1 + r, -n))) / r;
}

function noiFor(p, vacancy) {
  const egi = p.gpr * (1 - vacancy / 100) + p.otherIncome;
  const mgmtCost = egi * (p.mgmt / 100);
  const opex = p.tax + p.insurance + p.utilities + p.maintenance + p.reserves + p.otherOpex + mgmtCost;
  return { egi, mgmtCost, opex, noi: egi - opex };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { egi, mgmtCost, opex, noi } = noiFor(p, p.vacancy);
  const value = noi > 0 ? noi / (p.capRate / 100) : 0;
  const fixedOpex = opex - mgmtCost;
  const findings = [];
  const rows = [
    ["Gross potential rent", p.gpr],
    [`Less vacancy and credit loss (${p.vacancy}%)`, -(p.gpr * p.vacancy / 100)],
    ["Plus other income", p.otherIncome],
    ["Effective gross income", egi],
    ["Property tax", -p.tax],
    ["Insurance", -p.insurance],
    ["Utilities", -p.utilities],
    ["Repairs and maintenance", -p.maintenance],
    [`Management (${p.mgmt}%)`, -mgmtCost],
    ["Replacement reserves", -p.reserves],
    ["Other operating expenses", -p.otherOpex],
    ["Net operating income (NOI)", noi],
  ];
  const out = { errors: [], input: p, egi, mgmtCost, opex, noi, expenseRatio: opex / egi, value, rows, findings };

  if (noi <= 0) {
    findings.push({ severity: "high", title: `NOI is ${money(noi)}: expenses of ${money(opex)} are not covered by ${money(egi)} of income, so the income approach gives no value. Check the expense lines for one-time items and the vacancy for a lease-up that is already done.` });
  } else {
    findings.push({ severity: "high", title: `NOI is ${money(noi)} a year. At a ${p.capRate}% cap rate the income approach values the property at about ${money(value)}.` });
  }
  if (egi > 0 && out.expenseRatio < 0.3) findings.push({ severity: "medium", title: `Operating expenses are only ${pct(out.expenseRatio)} of income. Multi-tenant property usually runs 35-50% and a lender will often re-underwrite upward. Check that tax is reassessed at the sale price, and that reserves and management are included.` });
  if (p.vacancy < 5) findings.push({ severity: "medium", title: `A ${p.vacancy}% vacancy is optimistic. Lenders typically underwrite at least 5% even on a fully leased building.` });
  if (p.reserves === 0) findings.push({ severity: "info", title: "No replacement reserves were entered. Lenders and appraisers deduct them, so leaving them out overstates NOI and value." });

  // Sensitivity: value across cap rates and vacancy.
  const caps = [-1, -0.5, 0, 0.5, 1].map((d) => r1(p.capRate + d)).filter((c) => c >= 0.5);
  const vacs = [...new Set([p.vacancy, Math.min(100, p.vacancy + 5), Math.min(100, p.vacancy + 10)])];
  out.sensitivity = { caps, rows: vacs.map((v) => ({ vacancy: v, values: caps.map((c) => { const n = noiFor(p, v).noi; return n > 0 ? n / (c / 100) : 0; }) })) };
  if (noi > 0) findings.push({ severity: "info", title: `Each 0.5 point on the cap rate moves value by roughly ${money(Math.abs(value - noi / ((p.capRate + 0.5) / 100)))}. The cap rate is the one number a buyer and seller argue about, so look at the grid, not one value.` });

  if (p.price > 0) {
    const loan = p.price * (p.ltv / 100);
    const ds = annualDebtService(loan, p.rate, p.years);
    const equity = p.price - loan;
    const cashFlow = noi - ds;
    out.financing = {
      loan, equity, ds, cashFlow,
      impliedCap: noi / p.price,
      dscr: ds > 0 ? noi / ds : null,
      cashOnCash: equity > 0 ? cashFlow / equity : null,
      priceVsValue: p.price - value,
      maxLoan: noi > 0 ? Math.min(loanForDebtService(noi / LENDER_DSCR, p.rate, p.years), p.price * 0.95) : 0,
      breakevenOcc: Math.max(0, ((fixedOpex + ds) / (1 - p.mgmt / 100) - p.otherIncome) / p.gpr),
    };
    const f = out.financing;
    findings.push({ severity: "high", title: `At ${money(p.price)} the going-in cap rate is ${pct(f.impliedCap, 2)} against your ${p.capRate}% market assumption, ${f.priceVsValue > 0 ? `${money(f.priceVsValue)} above` : `${money(-f.priceVsValue)} below`} the income-approach value.` });
    if (f.dscr !== null) {
      findings.push({ severity: f.dscr < LENDER_DSCR ? "high" : "info", title: `Debt service is ${money(ds)} a year on a ${money(loan)} loan, so the debt service coverage ratio is ${f.dscr.toFixed(2)}x${f.dscr < LENDER_DSCR ? `, under the ${LENDER_DSCR}x many lenders require. At that coverage the loan would be closer to ${money(f.maxLoan)}, so plan on ${money(p.price - f.maxLoan)} of equity` : ""}.` });
      findings.push({ severity: "medium", title: `Cash flow after debt service is ${money(cashFlow)} a year${f.cashOnCash === null ? "" : `, a ${pct(f.cashOnCash)} cash-on-cash return on ${money(equity)} of equity`}. The property needs about ${pct(Math.min(f.breakevenOcc, 9.99), 0)} occupancy to cover its costs and debt.` });
    } else {
      findings.push({ severity: "info", title: `All-cash: ${money(cashFlow)} a year on ${money(equity)}, a ${pct(cashFlow / equity)} yield.` });
    }
  }
  findings.push({ severity: "info", title: "Not modelled: taxes and depreciation, capital expenditures beyond reserves, lease rollover and tenant improvement costs, vacancy by tenant, rent growth, loan fees, prepayment penalties, and the sale. Cap rate is a snapshot of year one, not a return forecast." });
  return out;
}

export const SAMPLE = { gpr: 240000, otherIncome: 6000, vacancy: 7, tax: 28000, insurance: 9000, utilities: 12000, maintenance: 14000, mgmt: 5, reserves: 6000, otherOpex: 3000, capRate: 7, price: 2000000, ltv: 70, rate: 6.75, years: 25 };

export function summaryText(r) {
  const p = r.input;
  const lines = [
    "Commercial property valuation by the income approach (estimate, not an appraisal)",
    ...r.findings.map((f) => `- ${f.title}`),
    "",
    ...r.rows.map(([k, v]) => `${k}: ${money(v)}`),
    `Expense ratio: ${pct(r.expenseRatio)}. Value at ${p.capRate}% cap rate: ${money(r.value)}.`,
    "",
    "Value by cap rate (rows are vacancy):",
    "vacancy | " + r.sensitivity.caps.map((c) => c + "%").join(" | "),
    ...r.sensitivity.rows.map((row) => `${row.vacancy}% | ` + row.values.map(money).join(" | ")),
    "",
    `Verify against: ${VERIFY}`,
    "Confirm with a lender, broker or appraiser before bidding.",
  ];
  return lines.join("\n");
}
