// UK landlord Section 24 calculator for 2025/26 and 2026/27 (England, Wales and Northern Ireland bands).
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: an individual landlord's residential rental profit with mortgage interest and
// other finance costs NOT deducted from rent; instead a basic-rate (20%) tax credit on the lowest of finance costs, property profits and adjusted total income above the
// personal allowance (ITTOIA 2005 s.272A, ITA 2007 s.399A). Personal allowance GBP 12,570, withdrawn GBP 1 per GBP 2 of income over GBP 100,000; 20% on the first
// GBP 37,700 of taxable income, 40% to GBP 125,140, 45% above. Compared with the pre-2017 rules where finance costs were a full deduction. Other income is treated as
// non-savings, non-dividend income. NOT modelled: Scottish bands, furnished holiday lets, companies (which deduct interest in full), carried-forward finance
// costs, savings and dividend income, the property income allowance, capital allowances, replacement-of-domestic-items relief and rates announced for later years.
// Every result names its source to verify.

export const VERIFY = "GOV.UK 'Restricting finance cost relief for residential landlords' and 'Income Tax rates and Personal Allowances'; Income Tax (Trading and Other Income) Act 2005 s.272A; Income Tax Act 2007 s.399A";
export const PA = 12570;
export const TAPER_FROM = 100000;
export const BASIC_BAND = 37700;
export const ADDITIONAL_FROM = 125140;
export const YEARS = { 2025: { label: "2025/26" }, 2026: { label: "2026/27" } };
const RATES = [0.2, 0.4, 0.45];

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
  const other = num("other", "your other taxable income (salary, pensions; zero if none)");
  const rent = num("rent", "your yearly rent received");
  const expenses = num("expenses", "your allowable running costs (agent fees, repairs, insurance; not mortgage interest)", true);
  const finance = num("finance", "your yearly mortgage interest and finance costs", true);
  const year = Number(i.year);
  if (!YEARS[year]) errors.push("Pick the tax year.");
  return { errors, other, rent, expenses, finance, year };
}

export const allowanceFor = (ani) => (ani <= TAPER_FROM ? PA : Math.max(0, PA - Math.floor((ani - TAPER_FROM) / 2)));

function tax(income) {
  const allowance = allowanceFor(income);
  const taxable = Math.max(0, income - allowance);
  const edges = [0, BASIC_BAND, ADDITIONAL_FROM, Infinity];
  let t = 0;
  for (let b = 0; b < 3; b++) { const lo = edges[b], hi = Math.min(taxable, edges[b + 1]); if (hi > lo) t += (hi - lo) * RATES[b]; }
  return { tax: r2(t), allowance, taxable: r2(taxable) };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { other, rent, expenses, finance, year } = p;
  const y = YEARS[year];
  const profitBefore = r2(Math.max(0, rent - expenses));
  const loss = rent < expenses;
  const trueProfit = r2(rent - expenses - finance);

  const income = r2(other + profitBefore);
  const t = tax(income);
  const ati = r2(Math.max(0, income - t.allowance));
  const creditBase = r2(Math.min(finance, profitBefore, ati));
  const credit = r2(creditBase * 0.2);
  const newTax = r2(Math.max(0, t.tax - credit));

  // Old rules: finance costs deducted in full.
  const oldIncome = r2(other + Math.max(0, rent - expenses - finance));
  const oldTax = tax(oldIncome).tax;
  const extra = r2(newTax - oldTax);

  const salaryTax = tax(other).tax;
  const taxOnProperty = r2(newTax - salaryTax);
  const afterTax = r2(trueProfit - taxOnProperty);
  const effective = trueProfit > 0 ? r2((taxOnProperty / trueProfit) * 100) : null;
  const unrelieved = r2(Math.max(0, finance - creditBase));

  const findings = [];
  const obligations = [];
  if (loss) findings.push({ severity: "info", title: "Your running costs are more than your rent, so there is a property loss. This tool does not carry losses forward; treat the figures as indicative." });
  if (finance === 0) {
    findings.push({ severity: "info", title: "With no mortgage interest or finance costs, Section 24 changes nothing for you. The tax shown is ordinary income tax on your property profit." });
  } else if (extra <= 0) {
    findings.push({ severity: "info", title: `Section 24 costs you nothing extra this year (${money(extra)} versus the old rules): your finance costs are fully relieved at 20% because you are a basic-rate taxpayer. Watch for it starting to bite if rent or other income rises.` });
  } else {
    findings.push({ severity: "high", title: `Section 24 adds ${money(extra)} to your ${y.label} tax bill compared with deducting your ${money(finance)} of finance costs in full. You are taxed on ${money(profitBefore)} of rent profit, then given a 20% credit worth ${money(credit)}.` });
  }
  if (finance > 0 && trueProfit > 0 && taxOnProperty > trueProfit) findings.push({ severity: "high", title: `Tax of ${money(taxOnProperty)} on property income is more than your real profit of ${money(trueProfit)} after finance costs (${effective}%). You would pay out more in tax than the portfolio earns before tax.` });
  if (finance > 0 && trueProfit <= 0 && profitBefore > 0) findings.push({ severity: "high", title: `Your finance costs wipe out the profit (real profit ${money(trueProfit)}) but you are still taxed on ${money(profitBefore)} of rent profit, with tax of ${money(taxOnProperty)} on the property income.` });
  if (unrelieved > 0) findings.push({ severity: "medium", title: `${money(unrelieved)} of finance costs did not get the 20% credit this year because they exceed your property profit or income above the allowance. Unused finance costs can usually be carried forward; this tool does not model that.` });
  if (income > TAPER_FROM && income < ADDITIONAL_FROM) findings.push({ severity: "medium", title: `Because finance costs are not deducted, rent profit counts towards the ${money(TAPER_FROM)} personal allowance taper. Your total of ${money(income)} costs ${money(PA - t.allowance)} of allowance, which can lift the effective rate on property profit to 60%.` });
  if (other + profitBefore > 50270 && other <= 50270) findings.push({ severity: "medium", title: `Counting rent profit before finance costs pushes you over the higher-rate threshold (${money(50270)} of income) even though your real profit is lower. Some of your rent is taxed at 40% that would not be under the old rules.` });
  findings.push({ severity: "info", title: "Not modelled: Scottish bands, furnished holiday lets, holding the property in a company (which deducts interest in full), carried-forward finance costs and losses, savings and dividend income, the property income allowance, capital allowances and anything that changed after this was written." });

  obligations.push({ ref: "SA", title: "Report on Self Assessment", why: "Rental profits over GBP 1,000 gross must be reported on a Self Assessment return (land and property pages) due 31 January after the tax year. Enter finance costs in the finance costs box, not as an expense, so the credit is given." });
  obligations.push({ ref: "Records", title: "Keep mortgage statements", why: "Keep annual interest certificates and fee statements to evidence your finance costs and the credit." });
  if (extra > 0) obligations.push({ ref: "Options", title: "Compare options with an adviser", why: "Overpaying the mortgage, changing who owns the property, or moving to a company carry tax and legal costs (stamp duty, capital gains tax). Get advice before acting." });
  return { errors: [], label: y.label, year, other, rent, expenses, finance, profitBefore, trueProfit, income, allowance: t.allowance, taxBefore: t.tax, credit, creditBase, newTax, oldTax, extra, salaryTax, taxOnProperty, afterTax, effective, unrelieved, findings, obligations };
}

export const SAMPLE = { year: 2025, other: 60000, rent: 20000, expenses: 2000, finance: 15000 };

export function summaryText(r) {
  const L = [`UK landlord Section 24, ${r.label}`, "", `Other income: ${money(r.other)}`, `Rent: ${money(r.rent)}`, `Running costs: ${money(r.expenses)}`, `Mortgage interest and finance costs: ${money(r.finance)}`, "", `Rent profit taxed (finance costs not deducted): ${money(r.profitBefore)}`, `Real profit after finance costs: ${money(r.trueProfit)}`, `Income tax before credit: ${money(r.taxBefore)}`, `20% finance cost credit: ${money(r.credit)}`, `Income tax bill: ${money(r.newTax)}`, `Bill under the old full-deduction rules: ${money(r.oldTax)}`, `Extra tax from Section 24: ${money(r.extra)}`, `Tax attributable to the property: ${money(r.taxOnProperty)}`, `Real profit after tax: ${money(r.afterTax)}`];
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
