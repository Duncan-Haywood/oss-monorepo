// UK dividend tax for 2025/26 and 2026/27 (England, Wales and Northern Ireland bands).
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: personal allowance GBP 12,570 (withdrawn GBP 1 per GBP 2 of income over
// GBP 100,000); basic-rate band GBP 37,700 of taxable income; higher-rate band up to GBP 125,140 of taxable income; dividend allowance GBP 500.
// Dividends are taxed last, on top of other income. 2025/26 dividend rates 8.75% / 33.75% / 39.35%; for 2026/27 the ordinary and upper rates were announced
// to rise to 10.75% and 35.75% (additional unchanged). Income tax on other income is 20% / 40% / 45%. The dividend allowance still uses up band space.
// Scottish income tax bands, Gift Aid / pension band extensions, savings income, the marriage allowance and the High Income Child Benefit Charge are NOT
// modelled. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Tax on dividends' and 'Income Tax rates and Personal Allowances'; Income Tax Act 2007 ss.13, 13A; Autumn Budget 2025 dividend rate announcement";
export const PA = 12570;
export const TAPER_FROM = 100000;
export const BASIC_BAND = 37700;
export const ADDITIONAL_FROM = 125140;
export const DIV_ALLOWANCE = 500;
export const YEARS = {
  2025: { label: "2025/26", div: [0.0875, 0.3375, 0.3935] },
  2026: { label: "2026/27", div: [0.1075, 0.3575, 0.3935] },
};
export const INCOME_RATES = [0.2, 0.4, 0.45];

const money = (n) => (n < 0 ? "-" : "") + "GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (key, label, optional) => {
    const v = i[key];
    if (v === undefined || v === null || v === "") { if (!optional) errors.push(`Enter ${label}.`); return 0; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) { errors.push(`Enter ${label} as zero or more.`); return 0; }
    return n;
  };
  const other = num("other", "your other taxable income for the year (salary, profits, pensions; zero if none)");
  const dividends = num("dividends", "your total dividends for the year");
  const year = Number(i.year);
  if (!YEARS[year]) errors.push("Pick the tax year.");
  return { errors, other, dividends, year };
}

// Tax on a slice of taxable income [from, to) at the three band rates.
function slice(from, to, rates) {
  const edges = [0, BASIC_BAND, ADDITIONAL_FROM, Infinity];
  const parts = [0, 0, 0];
  for (let b = 0; b < 3; b++) {
    const lo = Math.max(from, edges[b]), hi = Math.min(to, edges[b + 1]);
    if (hi > lo) parts[b] = r2(hi - lo);
  }
  return { parts, tax: r2(parts.reduce((s, v, b) => s + v * rates[b], 0)) };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { other, dividends, year } = p;
  const y = YEARS[year];
  const total = r2(other + dividends);
  const allowance = total <= TAPER_FROM ? PA : Math.max(0, PA - Math.floor((total - TAPER_FROM) / 2));
  const otherTaxable = r2(Math.max(0, other - allowance));
  const allowanceLeft = Math.max(0, allowance - other);
  const divTaxable = r2(Math.max(0, dividends - allowanceLeft));
  const inAllowance = r2(Math.min(DIV_ALLOWANCE, divTaxable));
  const divCharged = r2(divTaxable - inAllowance);

  const incomeSlice = slice(0, otherTaxable, INCOME_RATES);
  // The 500 allowance sits first in the dividend slice: taxed at 0% but it still fills band space.
  const chargedSlice = slice(otherTaxable + inAllowance, otherTaxable + divTaxable, y.div);
  const divTax = chargedSlice.tax;
  const incomeTax = incomeSlice.tax;
  const totalTax = r2(divTax + incomeTax);
  const effectiveDiv = dividends > 0 ? r2((divTax / dividends) * 100) : 0;
  const takeHome = r2(dividends - divTax);
  const topRate = chargedSlice.parts[2] > 0 ? y.div[2] : chargedSlice.parts[1] > 0 ? y.div[1] : y.div[0];

  // Marginal cost of the next GBP 1,000 of dividends.
  const next = (() => {
    const t = r2(total + 1000);
    const al = t <= TAPER_FROM ? PA : Math.max(0, PA - Math.floor((t - TAPER_FROM) / 2));
    const ot = r2(Math.max(0, other - al));
    const dt = r2(Math.max(0, dividends + 1000 - Math.max(0, al - other)));
    const ia = r2(Math.min(DIV_ALLOWANCE, dt));
    const s = slice(ot + ia, ot + dt, y.div);
    const base = slice(otherTaxable + inAllowance, otherTaxable + divTaxable, y.div).tax;
    const inc = slice(0, ot, INCOME_RATES).tax - incomeTax;
    return r2(s.tax - base + inc);
  })();

  const findings = [];
  const obligations = [];
  if (dividends === 0) {
    findings.push({ severity: "info", title: "No dividends entered, so no dividend tax. Income tax on your other income is shown below." });
  } else if (divTax === 0) {
    findings.push({ severity: "info", title: `No dividend tax for ${y.label}: your ${money(dividends)} of dividends fall within the personal allowance and the ${money(DIV_ALLOWANCE)} dividend allowance.` });
  } else {
    findings.push({ severity: "high", title: `Dividend tax for ${y.label}: ${money(divTax)} on ${money(divCharged)} of taxable dividends, an effective ${effectiveDiv}% of your dividends. You keep ${money(takeHome)} of ${money(dividends)}.` });
    const bits = [];
    chargedSlice.parts.forEach((amt, b) => { if (amt > 0) bits.push(`${money(amt)} at ${r2(y.div[b] * 100)}% (${money(r2(amt * y.div[b]))})`); });
    findings.push({ severity: "medium", title: `Split by band: ${bits.join(", ")}. The first ${money(inAllowance)} of dividends is covered by the dividend allowance but still uses up band space.` });
  }
  if (dividends > 0) findings.push({ severity: "info", title: `The next ${money(1000)} of dividends would add about ${money(next)} of tax (${r2(next / 10)}%), including any extra income tax from losing the personal allowance.` });
  if (total > TAPER_FROM && total < ADDITIONAL_FROM) findings.push({ severity: "medium", title: `Your total income of ${money(total)} is in the band where the personal allowance is withdrawn (an effective rate of 60% on extra salary, and a high rate on extra dividends). Pension contributions or timing dividends into another tax year can help.` });
  if (year === 2026) findings.push({ severity: "info", title: "2026/27 uses the dividend ordinary and upper rates announced for April 2026 (10.75% and 35.75%). Confirm they were enacted as announced." });
  findings.push({ severity: "info", title: "Not modelled: Scottish income tax bands, Gift Aid or pension contributions extending the basic-rate band, savings interest, the marriage allowance, the High Income Child Benefit Charge, dividends held in ISAs (these are tax-free and should not be entered) and dividends from non-UK companies." });

  if (divTax > 0 || divCharged > 0) {
    obligations.push({ ref: "SA", title: "Report on a Self Assessment return", why: `Dividends over the ${money(DIV_ALLOWANCE)} allowance must normally be reported on the return due 31 January after the tax year. Tax up to GBP 10,000 of dividend income can sometimes be collected through your PAYE code instead; check with HMRC.` });
    obligations.push({ ref: "PoA", title: "Check payments on account", why: "If your Self Assessment bill is over GBP 1,000 you will usually also owe payments on account for the next year, due 31 January and 31 July." });
  }
  obligations.push({ ref: "Records", title: "Keep dividend vouchers and board minutes", why: "If you take dividends from your own company, keep a dividend voucher and minutes for each payment. Dividends can only be paid from profits after corporation tax." });
  return { errors: [], label: y.label, year, other, dividends, total, allowance, otherTaxable, divTaxable, inAllowance, divCharged, incomeParts: incomeSlice.parts, incomeTax, divParts: chargedSlice.parts, divTax, totalTax, effectiveDiv, takeHome, topRate, next, rates: y.div, findings, obligations };
}

export const SAMPLE = { year: 2025, other: 12570, dividends: 40000 };

export function summaryText(r) {
  const L = [`UK dividend tax, ${r.label}`, "", `Other income: ${money(r.other)}`, `Dividends: ${money(r.dividends)}`, `Personal allowance available: ${money(r.allowance)}`, `Dividend allowance used: ${money(r.inAllowance)}`, `Taxable dividends charged: ${money(r.divCharged)}`, ""];
  r.divParts.forEach((amt, b) => { if (amt > 0) L.push(`At ${r2(r.rates[b] * 100)}%: ${money(amt)} = ${money(r2(amt * r.rates[b]))}`); });
  L.push(`Dividend tax: ${money(r.divTax)}`, `Income tax on other income: ${money(r.incomeTax)}`, `Total tax: ${money(r.totalTax)}`);
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
