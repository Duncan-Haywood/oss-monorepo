// UK Self Assessment payments on account: what is due on 31 January and 31 July, the first-year double hit, and whether to claim a reduction.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Rules modelled: payments on account (POA) are required when the
// previous year's Self Assessment bill (income tax and Class 4 NIC, less tax collected at source) exceeds GBP 1,000 AND less than 80% of
// the previous year's total liability was collected at source; each POA is 50% of that bill, due 31 January in the tax year and 31 July after;
// any balancing payment is due 31 January after the year ends. A reduction can be claimed (form SA303 or online) if you expect a lower bill.
// Student loan, Class 2, capital gains and High Income Child Benefit Charge are NOT modelled. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Understand how your Self Assessment tax bill is worked out' and 'Pay your Self Assessment tax bill: payments on account'; Taxes Management Act 1970 s59A and s59B";
export const THRESHOLD = 1000;
export const SOURCE_SHARE = 0.8;
export const YEARS = { 2025: "2025/26", 2026: "2026/27" };

const money = (n) => "GBP " + Number(Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (key, label, optional, allowNegative) => {
    const v = i[key];
    if (v === undefined || v === null || v === "") { if (!optional) errors.push(`Enter ${label}.`); return 0; }
    const n = Number(v);
    if (!Number.isFinite(n) || (!allowNegative && n < 0)) { errors.push(`Enter ${label} as zero or more.`); return 0; }
    return n;
  };
  const liability = num("liability", "your total income tax and Class 4 NIC for the year");
  const atSource = num("atSource", "the tax already collected at source, such as PAYE (zero if none)", true);
  const paidOnAccount = num("paidOnAccount", "the payments on account you already made for this year (zero if none)", true);
  const growth = num("growth", "the expected change in next year's bill as a percentage (0 if unchanged)", true, true);
  const year = Number(i.year);
  if (!YEARS[year]) errors.push("Pick the tax year.");
  if (atSource > liability) errors.push("Tax collected at source cannot exceed the total bill; if PAYE exceeded it you may be due a refund instead.");
  if (growth < -100) errors.push("Expected change cannot be below -100%.");
  return { errors, liability, atSource, paidOnAccount, growth, year };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { liability, atSource, paidOnAccount, growth, year } = p;
  const label = YEARS[year];
  const endYear = year + 1;
  const jan = `${endYear + 1}-01-31`;
  const jul = `${endYear + 1}-07-31`;
  const relevant = r2(liability - atSource); // the Self Assessment bill that POAs are based on
  const sourceShare = liability > 0 ? atSource / liability : 1;
  const required = relevant > THRESHOLD && sourceShare < SOURCE_SHARE;
  const balancing = r2(relevant - paidOnAccount);
  const poa = required ? r2(relevant / 2) : 0;
  const nextBill = r2(relevant * (1 + growth / 100));
  const findings = [];
  const obligations = [];

  const janTotal = r2(Math.max(0, balancing) + poa);
  findings.push({ severity: "high", title: `Due ${jan} for ${label}: ${money(Math.max(0, balancing))} balancing payment${required ? ` plus ${money(poa)} first payment on account for the next year, ${money(janTotal)} in all` : ""}.` });
  if (balancing < 0) findings.push({ severity: "info", title: `You paid ${money(-balancing)} more on account than this year's bill: HMRC credits it against the next payment or refunds it on request.` });
  if (required) {
    findings.push({ severity: "high", title: `Second payment on account of ${money(poa)} is due ${jul}. Over the two dates you pay ${money(janTotal + poa)} before the next balancing payment.` });
    if (paidOnAccount === 0 && balancing > 0) findings.push({ severity: "medium", title: `This looks like your first year with a bill: you pay the whole ${money(balancing)} plus an advance ${money(poa)} in January, then ${money(poa)} again in July. Plan for about ${money(r2(balancing + poa * 2))} over seven months, not ${money(balancing)}.` });
    const nextBalancing = r2(nextBill - poa * 2);
    findings.push({ severity: "info", title: nextBalancing > 0 ? `If next year's bill comes to ${money(nextBill)}, the following January balancing payment is ${money(nextBalancing)}.` : nextBalancing < 0 ? `If next year's bill comes to ${money(nextBill)}, you will have overpaid by ${money(-nextBalancing)} and can claim it back.` : `If next year's bill comes to ${money(nextBill)}, your payments on account cover it exactly.` });
    if (nextBill < relevant) {
      const reduced = r2(nextBill / 2);
      const saving = r2((poa - reduced) * 2);
      findings.push({ severity: "medium", title: `You expect a lower bill, so you can claim to reduce each payment on account to about ${money(reduced)}, keeping ${money(saving)} in your pocket across the two dates. Claim online or with form SA303. HMRC charges interest if you reduce by too much, and a penalty if the claim is careless or false.` });
    }
    obligations.push(
      { ref: "Jan", title: `Pay by ${jan}`, why: `Balancing payment for ${label} plus the first payment on account.` },
      { ref: "Jul", title: `Pay by ${jul}`, why: "Second payment on account. HMRC does not always send a reminder, so diarise it." },
      { ref: "Reduce", title: "Claim a reduction if profits fall", why: "Do it as soon as you expect a lower bill; you can adjust until you file." },
    );
  } else {
    const why = relevant <= THRESHOLD ? `Your bill after tax collected at source is ${money(relevant)}, which is not over the ${money(THRESHOLD)} threshold.` : `At least 80% of your liability (${Math.round(sourceShare * 100)}%) was collected at source.`;
    findings.push({ severity: "info", title: `No payments on account are required for next year. ${why} You pay only the balancing payment by ${jan}.` });
    obligations.push({ ref: "Jan", title: `Pay by ${jan}`, why: `Balancing payment for ${label}.` });
  }
  obligations.push({ ref: "Late", title: "Pay on time", why: "Interest runs from each due date on anything unpaid, and late-payment penalties follow after 30 days. Check current rates on GOV.UK." });
  return { errors: [], label, liability, atSource, paidOnAccount, growth, relevant, required, balancing, poa, janTotal, julTotal: poa, nextBill, deadlines: { jan, jul }, findings, obligations };
}

export const SAMPLE = { year: 2025, liability: 6200, atSource: 1200, paidOnAccount: 0, growth: 0 };

export function summaryText(r) {
  const L = [`UK payments on account, tax year ${r.label}`, "", `Total income tax and Class 4 NIC: ${money(r.liability)}`, `Collected at source: ${money(r.atSource)}`, `Self Assessment bill: ${money(r.relevant)}`, `Payments on account already made: ${money(r.paidOnAccount)}`, "", `Due ${r.deadlines.jan}: ${money(r.janTotal)}`, `Due ${r.deadlines.jul}: ${money(r.julTotal)}`, "", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty."];
  return L.join("\n");
}
