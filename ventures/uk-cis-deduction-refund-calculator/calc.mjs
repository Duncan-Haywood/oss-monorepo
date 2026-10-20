// UK Construction Industry Scheme (CIS) check for subcontractors: how much did contractors hold back, what is your
// real Self Assessment bill, and is a refund due? Pure functions, no I/O. Bad input is rejected, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: sole trader, England/Wales/Northern
// Ireland income tax bands (Scotland differs and is not modelled), 2025/26 and 2026/27 thresholds (frozen), Class 4 NI.
// CIS deduction is taken from the labour part of an invoice only: 20% registered, 30% unregistered, 0% gross payment status.

export const VERIFY = "HMRC 'What you must do as a CIS subcontractor', 'Construction Industry Scheme: deductions' (CIS340) and 'Rates and thresholds for employers' / Income Tax rates; Finance Act 2004 Part 3 Chapter 3";
export const RATES = { registered: 0.2, unregistered: 0.3, gross: 0 };
export const PERSONAL_ALLOWANCE = 12_570;
export const TAPER_START = 100_000;
export const BASIC_BAND = 37_700;
export const ADDITIONAL_THRESHOLD = 125_140;
export const CLASS4_LOWER = 12_570;
export const CLASS4_UPPER = 50_270;
export const GROSS_TURNOVER_TEST = 30_000;

const gbp = (n) => (n < 0 ? "-" : "") + "£" + Math.abs(Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (v === undefined || v === null || v === "" ? 0 : Number(v));

export function allowanceFor(income) {
  if (income <= TAPER_START) return PERSONAL_ALLOWANCE;
  return Math.max(0, PERSONAL_ALLOWANCE - (income - TAPER_START) / 2);
}

export function incomeTax(profit) {
  const pa = allowanceFor(profit);
  const taxable = Math.max(0, profit - pa);
  const basic = Math.min(taxable, BASIC_BAND);
  const higherCap = ADDITIONAL_THRESHOLD - pa - BASIC_BAND;
  const higher = Math.min(Math.max(0, taxable - BASIC_BAND), Math.max(0, higherCap));
  const additional = Math.max(0, taxable - BASIC_BAND - Math.max(0, higherCap));
  return r2(basic * 0.2 + higher * 0.4 + additional * 0.45);
}

export function class4(profit) {
  const mid = Math.max(0, Math.min(profit, CLASS4_UPPER) - CLASS4_LOWER);
  const top = Math.max(0, profit - CLASS4_UPPER);
  return r2(mid * 0.06 + top * 0.02);
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const status = i.status in RATES ? i.status : null;
  if (!status) errors.push("Pick your CIS status: registered (20%), unregistered (30%) or gross payment (0%).");
  const f = {};
  for (const [k, label] of [["labour", "labour invoiced in the year"], ["materials", "materials charged to contractors"], ["costs", "allowable business costs"], ["deducted", "CIS deducted on your statements"], ["invLabour", "the invoice labour"], ["invMaterials", "the invoice materials"], ["invVat", "the invoice VAT"]]) {
    const v = num(i[k]);
    if (!Number.isFinite(v) || v < 0) { errors.push(`Enter an amount of zero or more for ${label}, or leave it blank.`); f[k] = 0; } else f[k] = v;
  }
  if (!errors.length && f.labour <= 0 && f.invLabour <= 0) errors.push("Enter your labour invoiced for the year, or the labour on a single invoice.");
  const hasDeducted = i.deducted !== undefined && i.deducted !== "" && i.deducted !== null;
  return { errors, status, ...f, hasDeducted };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const rate = RATES[p.status];
  const findings = [];
  const out = { errors: [], rate, status: p.status, findings };

  const invoice = p.invLabour > 0
    ? { labour: p.invLabour, deduction: r2(p.invLabour * rate), paid: r2(p.invLabour + p.invMaterials + p.invVat - p.invLabour * rate) }
    : null;
  out.invoice = invoice;

  if (p.labour > 0) {
    const turnover = p.labour + p.materials;
    const profit = Math.max(0, turnover - p.costs);
    const deducted = r2(p.labour * rate);
    const tax = incomeTax(profit), ni = class4(profit);
    const bill = r2(tax + ni);
    const net = r2(bill - deducted);
    const refund = net < 0 ? -net : 0;
    Object.assign(out, { turnover, profit, deducted, tax, ni, bill, net, refund, due: net > 0 ? net : 0, effective: profit > 0 ? bill / profit : 0 });
    out.heldBack30 = p.status === "unregistered" ? r2(p.labour * 0.1) : 0;
    out.statementGap = p.hasDeducted ? r2(p.deducted - deducted) : null;

    if (refund > 0) findings.push({ severity: "info", title: `CIS held back ${gbp(deducted)} but your estimated tax and Class 4 NI come to ${gbp(bill)}, so about ${gbp(refund)} is yours back. You claim it after the tax year ends, through your Self Assessment return.` });
    else if (net > 0) findings.push({ severity: "medium", title: `CIS held back ${gbp(deducted)} but your estimated bill is ${gbp(bill)}, so about ${gbp(net)} is still to pay. Set it aside: CIS is a payment on account, not the final tax.` });
    else findings.push({ severity: "info", title: "CIS deductions cover your estimated bill almost exactly." });
    if (p.status === "unregistered") findings.push({ severity: "high", title: `Unregistered subcontractors have 30% held back. Registering with HMRC as a CIS subcontractor drops it to 20%, which on ${gbp(p.labour)} of labour is ${gbp(out.heldBack30)} more in your pocket through the year.` });
    if (p.status === "registered" && p.labour >= GROSS_TURNOVER_TEST) findings.push({ severity: "info", title: `Gross payment status means contractors pay you in full and you settle tax yourself. Your labour is above the ${gbp(GROSS_TURNOVER_TEST)} turnover test for a sole trader (before materials and VAT); HMRC also applies a business test and a compliance test, which this tool cannot judge.` });
    if (p.status === "registered" && p.labour < GROSS_TURNOVER_TEST) findings.push({ severity: "info", title: `Gross payment status needs construction turnover of at least ${gbp(GROSS_TURNOVER_TEST)} a year for a sole trader (before materials and VAT). Your labour is ${gbp(p.labour)}.` });
    if (out.statementGap !== null && Math.abs(out.statementGap) >= 1) findings.push({ severity: "medium", title: `Your statements show ${gbp(p.deducted)} deducted, ${gbp(Math.abs(out.statementGap))} ${out.statementGap > 0 ? "more" : "less"} than ${(rate * 100).toFixed(0)}% of the labour you entered. Check for materials wrongly included in the deduction, a contractor that used the wrong rate, or missing statements; claim on what the statements show.` });
    if (net >= 1000) findings.push({ severity: "medium", title: "A balance of £1,000 or more normally brings payments on account for the next year. Check the rules." });
    if (profit <= PERSONAL_ALLOWANCE && p.status !== "gross") findings.push({ severity: "info", title: "Profit is within your personal allowance, so none of the CIS held back was needed as tax. File a return to reclaim it." });
  }
  findings.push({ severity: "info", title: "The deduction is taken from labour only, not VAT or materials you bought and charged on. Contractors must give you a monthly statement and you should keep every one." });
  findings.push({ severity: "info", title: "This models a sole trader in England, Wales or Northern Ireland with no other income. Scottish rates, other income, student loans, pensions, trading allowance, capital allowances and partnerships are not modelled." });
  return out;
}

export const SAMPLE = { status: "registered", labour: 42000, materials: 6000, costs: 11000, deducted: 8400, invLabour: 1500, invMaterials: 400, invVat: 0 };

export function summaryText(r) {
  const L = ["UK CIS deduction and refund check", "", `Status: ${r.status} (${Math.round(r.rate * 100)}% deduction on labour)`];
  if (r.invoice) L.push("", `Single invoice: labour ${gbp(r.invoice.labour)}, deduction ${gbp(r.invoice.deduction)}, you receive ${gbp(r.invoice.paid)}`);
  if (r.bill !== undefined) {
    L.push("", `Turnover ${gbp(r.turnover)}, estimated profit ${gbp(r.profit)}`, `CIS held back: ${gbp(r.deducted)}`, `Income tax ${gbp(r.tax)} + Class 4 NI ${gbp(r.ni)} = ${gbp(r.bill)}`, r.refund > 0 ? `Estimated refund: ${gbp(r.refund)}` : `Estimated still to pay: ${gbp(r.due)}`);
  }
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}

export { gbp };
