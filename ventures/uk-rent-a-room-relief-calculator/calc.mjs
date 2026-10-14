// UK Rent a Room Relief calculator for 2025/26 and 2026/27.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: a homeowner or tenant letting furnished accommodation in their only or main home gets
// GBP 7,500 a year of receipts tax-free (GBP 3,750 if the income is shared with someone else, such as a partner or co-owner). If gross receipts are at or below the limit the relief
// is automatic. If they are above it you choose between (a) the relief: pay tax on receipts minus the limit, with NO expenses deducted, or (b) the normal rules: pay tax on receipts
// minus actual expenses. The tool prices both on top of your other taxable income using the England/Wales/Northern Ireland bands (20% on the first GBP 37,700 of taxable income,
// 40% to GBP 125,140, 45% above) and the personal allowance taper over GBP 100,000, and says which is cheaper.
// NOT modelled: Scottish bands, Class 2 or 4 National Insurance on profits, the GBP 1,000 property allowance as a third route, savings and dividend income, losses carried forward,
// the 'Rent a Room' receipts when the room is let for part of a year in more than one home, business-use premises, and rates announced for later years. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Rent a Room Scheme' (gov.uk/rent-a-room-scheme), HS223 'Rent a Room Scheme' helpsheet, and 'Income Tax rates and Personal Allowances'; Income Tax (Trading and Other Income) Act 2005 Part 7 Chapter 1";
export const LIMIT = 7500;
export const LIMIT_SHARED = 3750;
export const PA = 12570;
export const TAPER_START = 100000;
export const BASIC_BAND = 37700;
export const ADDITIONAL_AT = 125140;
export const YEARS = { 2025: { label: "2025/26" }, 2026: { label: "2026/27" } };

const money = (n) => (n < 0 ? "-" : "") + "GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;

// Income tax on `income` (all treated as non-savings, non-dividend income) with the 100k taper.
export function incomeTax(income) {
  const pa = Math.max(0, PA - Math.max(0, Math.floor((income - TAPER_START) / 2)));
  const t = Math.max(0, income - pa);
  const basic = Math.min(t, BASIC_BAND);
  const higher = Math.max(0, Math.min(t, ADDITIONAL_AT) - BASIC_BAND);
  const add = Math.max(0, t - ADDITIONAL_AT);
  return r2(basic * 0.2 + higher * 0.4 + add * 0.45);
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (key, label, required = true) => {
    const v = i[key];
    if (v === undefined || v === null || v === "") { if (required) errors.push(`Enter ${label}.`); return 0; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) { errors.push(`Enter ${label} as zero or more.`); return 0; }
    return n;
  };
  const receipts = num("receipts", "your total rent received from the lodger in the tax year");
  const expenses = num("expenses", "your allowable expenses for the room (zero if none)", false);
  const other = num("other", "your other taxable income for the year (zero if none)", false);
  const year = Number(i.year);
  if (!YEARS[year]) errors.push("Pick the tax year.");
  const shared = i.shared === "yes" ? true : i.shared === undefined || i.shared === "" || i.shared === "no" ? false : null;
  if (shared === null) errors.push("Say whether the income is shared with someone else.");
  return { errors, receipts, expenses, other, year, shared: !!shared };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { receipts, expenses, other, year, shared } = p;
  const y = YEARS[year];
  const limit = shared ? LIMIT_SHARED : LIMIT;
  const baseTax = incomeTax(other);

  const automatic = receipts <= limit;
  const taxableRelief = automatic ? 0 : r2(receipts - limit);
  const profit = r2(receipts - expenses);
  const taxableNormal = Math.max(0, profit);
  const taxRelief = r2(incomeTax(other + taxableRelief) - baseTax);
  const taxNormal = r2(incomeTax(other + taxableNormal) - baseTax);
  const taxNothing = r2(incomeTax(other + receipts) - baseTax);

  // Automatic: nothing to choose. Otherwise pick the cheaper route (ties go to the relief, which needs no expense records).
  const best = automatic ? "relief" : taxRelief <= taxNormal ? "relief" : "normal";
  const bestTax = automatic ? 0 : Math.min(taxRelief, taxNormal);
  const worstTax = automatic ? 0 : Math.max(taxRelief, taxNormal);
  const choiceSaving = r2(worstTax - bestTax);
  const taxSavedVsNoRelief = r2(taxNothing - bestTax);
  const breakEvenExpenses = limit;

  const findings = [];
  const obligations = [];
  if (automatic) {
    findings.push({ severity: "high", title: `Your rent of ${money(receipts)} is at or below the ${money(limit)} limit${shared ? " for shared income" : ""}, so Rent a Room Relief covers all of it: no tax on it in ${y.label}${taxNothing > 0 ? `, which is ${money(taxNothing)} of tax you avoid at your rate` : ""}.` });
    findings.push({ severity: "info", title: "You do not have to report it to HMRC if it is under the limit, unless you have other income to report or HMRC asks. You can still choose the normal rules if you have a loss to claim: see the steps below." });
  } else if (best === "relief") {
    findings.push({ severity: "high", title: `Above the limit, the relief route is cheaper in ${y.label}: tax on ${money(taxableRelief)} costs ${money(taxRelief)}, against ${money(taxNormal)} on a profit of ${money(taxableNormal)} under the normal rules.${choiceSaving > 0 ? ` Choosing it saves ${money(choiceSaving)}.` : ""}` });
    findings.push({ severity: "medium", title: `Under the relief route you cannot deduct expenses. Your ${money(expenses)} of expenses is below the ${money(breakEvenExpenses)} break-even, which is why relief wins.` });
  } else {
    findings.push({ severity: "high", title: `Above the limit, the normal rules are cheaper in ${y.label}: tax on a profit of ${money(taxableNormal)} costs ${money(taxNormal)}, against ${money(taxRelief)} on ${money(taxableRelief)} under the relief route. Choosing them saves ${money(choiceSaving)}.` });
    findings.push({ severity: "medium", title: `Your expenses of ${money(expenses)} are above the ${money(breakEvenExpenses)} break-even, so deducting them beats the flat relief. Keep the records that support each cost.` });
  }
  if (!automatic && profit < 0) findings.push({ severity: "medium", title: `Expenses exceed rent by ${money(-profit)}, a loss under the normal rules. This tool counts it as no tax, not as a loss you can carry forward or set against other income.` });
  if (other + receipts > TAPER_START && other <= TAPER_START) findings.push({ severity: "medium", title: `The rent takes total income above ${money(TAPER_START)}, where the personal allowance starts to taper. That is already in these figures, and it makes each extra pound taxed at an effective 60% in the taper zone.` });
  if (shared) findings.push({ severity: "info", title: `You said the income is shared, so the limit is ${money(LIMIT_SHARED)} each, not ${money(LIMIT)}. It applies to each person's share of the receipts; enter only your own share.` });
  findings.push({ severity: "info", title: "Not modelled: Scottish bands, National Insurance on profits, the GBP 1,000 property allowance, losses, savings and dividends, and anything that changed after this was written. Rent a Room applies to furnished accommodation in your only or main home." });

  if (!automatic) {
    obligations.push({ ref: "Report", title: "Put the income on a Self Assessment return", why: "Receipts above the limit must be reported. Register for Self Assessment if you do not already file one, by 5 October after the end of the tax year." });
    obligations.push({ ref: best === "relief" ? "Relief" : "Normal", title: best === "relief" ? "Claim the relief on the return" : "Elect out of the relief", why: best === "relief" ? "Enter the receipts and claim Rent a Room Relief where the return asks; it takes the limit off the receipts and no expenses are claimed." : "Use the normal rules by deducting your expenses on the return and not claiming the relief. Check the current HMRC guidance for how and when an election must be made." });
  } else {
    obligations.push({ ref: "Records", title: "Keep a record of what you received", why: "Keep dates and amounts of rent paid by the lodger for at least a year after the 31 January filing date, in case HMRC asks." });
  }
  obligations.push({ ref: "Check", title: "Confirm your mortgage, lease and insurance", why: "Letting a room can breach a mortgage condition, a tenancy or a home insurance policy. This is separate from tax and worth a call before you start." });
  return { errors: [], label: y.label, year, receipts, expenses, other, shared, limit, automatic, taxableRelief, taxableNormal, profit, baseTax, taxRelief, taxNormal, taxNothing, best, bestTax, choiceSaving, taxSavedVsNoRelief, breakEvenExpenses, findings, obligations };
}

export const SAMPLE = { year: 2025, receipts: 11000, expenses: 3200, other: 45000, shared: "no" };

export function summaryText(r) {
  const L = [`UK Rent a Room Relief, ${r.label}`, "", `Rent received: ${money(r.receipts)}`, `Expenses: ${money(r.expenses)}`, `Other taxable income: ${money(r.other)}`, `Limit: ${money(r.limit)}${r.shared ? " (shared)" : ""}`, ""];
  if (r.automatic) L.push("Under the limit: the relief is automatic and the rent is tax-free.", `Tax avoided: ${money(r.taxNothing)}`);
  else L.push(`Relief route: taxable ${money(r.taxableRelief)}, extra tax ${money(r.taxRelief)}`, `Normal route: taxable ${money(r.taxableNormal)}, extra tax ${money(r.taxNormal)}`, `Cheaper route: ${r.best === "relief" ? "relief" : "normal rules"}, saving ${money(r.choiceSaving)}`);
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
