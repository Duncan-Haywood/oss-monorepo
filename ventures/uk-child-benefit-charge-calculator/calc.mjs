// UK High Income Child Benefit Charge (HICBC): how much of Child Benefit is clawed back, and what to do about it.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Rules modelled: the charge applies when the higher earner's adjusted net
// income (ANI) exceeds GBP 60,000; it is 1% of the Child Benefit received for every GBP 200 of ANI over GBP 60,000 (whole percentages only),
// reaching 100% at GBP 80,000. Pension contributions (relief at source, grossed up) and Gift Aid donations (grossed up) reduce ANI.
// The weekly Child Benefit rates are inputs prefilled with the 2025/26 rates because they are re-set each April: check GOV.UK for your year.
// Scottish rates, the 'higher earner' partner test, and backdated claims are NOT modelled. Every result names its source to verify.

export const VERIFY = "GOV.UK 'High Income Child Benefit Charge' and 'Child Benefit rates and eligibility'; Income Tax (Earnings and Pensions) Act 2003 Part 10 Ch 8";
export const START = 60000;
export const END = 80000;
export const STEP = 200;
export const RATE_FIRST = 26.05;
export const RATE_OTHER = 17.25;
export const YEARS = { 2025: "2025/26", 2026: "2026/27" };

const money = (n) => "GBP " + Number(Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;

export function chargePercent(ani) {
  if (ani <= START) return 0;
  return Math.min(100, Math.floor((ani - START) / STEP));
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (key, label, optional) => {
    const v = i[key];
    if (v === undefined || v === null || v === "") { if (!optional) errors.push(`Enter ${label}.`); return null; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) { errors.push(`Enter ${label} as zero or more.`); return null; }
    return n;
  };
  const income = num("income", "the higher earner's income before pension and Gift Aid reductions") ?? 0;
  const pension = num("pension", "pension contributions (zero if none)", true) ?? 0;
  const giftAid = num("giftAid", "Gift Aid donations (zero if none)", true) ?? 0;
  const children = num("children", "the number of children you claim for");
  const weeks = num("weeks", "the weeks of Child Benefit in the year (52 for a full year)", true) ?? 52;
  const rateFirst = num("rateFirst", "the weekly rate for the eldest child", true) ?? RATE_FIRST;
  const rateOther = num("rateOther", "the weekly rate for each other child", true) ?? RATE_OTHER;
  const year = Number(i.year);
  if (!YEARS[year]) errors.push("Pick the tax year.");
  if (children !== null && (!Number.isInteger(children) || children < 1 || children > 20)) errors.push("Enter a whole number of children, 1 to 20.");
  if (weeks > 53) errors.push("Weeks cannot exceed 53.");
  return { errors, income, pension, giftAid, children: children ?? 0, weeks, rateFirst, rateOther, year };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { income, pension, giftAid, children, weeks, rateFirst, rateOther, year } = p;
  const label = YEARS[year];
  const endYear = year + 1;
  const deadlines = { register: `${endYear}-10-05`, returnAndPay: `${endYear + 1}-01-31` };
  const grossPension = r2(pension * 1.25);
  const grossGift = r2(giftAid * 1.25);
  const ani = r2(Math.max(0, income - grossPension - grossGift));
  const weekly = r2(rateFirst + rateOther * (children - 1));
  const benefit = r2(weekly * weeks);
  const pct = chargePercent(ani);
  const charge = r2(benefit * pct / 100);
  const net = r2(benefit - charge);
  const findings = [];
  const obligations = [];
  let outcome;

  if (pct === 0) {
    outcome = "none";
    findings.push({ severity: "info", title: `Adjusted net income of ${money(ani)} is at or under ${money(START)}: no charge. You keep all ${money(benefit)} of Child Benefit for ${label}.` });
    if (income > START) findings.push({ severity: "info", title: `Your pension and Gift Aid reductions (${money(grossPension + grossGift)} grossed up) are what bring you under the line: keep the records for your return.` });
    if (income > START - 2000 && income <= START) findings.push({ severity: "medium", title: `You are within ${money(START - income)} of the ${money(START)} line. A small pay rise or bonus starts the charge, so check again.` });
  } else {
    outcome = pct >= 100 ? "full" : "partial";
    findings.push({ severity: "high", title: `Adjusted net income of ${money(ani)} means a ${pct}% charge: ${money(charge)} on ${money(benefit)} of Child Benefit for ${label}. You keep ${money(net)} net.` });
    if (pct >= 100) findings.push({ severity: "medium", title: `The charge cancels all the benefit. You can stop the payments and still claim, to protect National Insurance credits and the child's NI number, by opting out of payment rather than not claiming.` });
    else findings.push({ severity: "info", title: `Each extra ${money(STEP)} of income costs another 1% of the benefit, ${money(r2(benefit / 100))}, on top of ordinary tax.` });
    // pension contribution needed to reach START
    const target = r2(ani - START);
    findings.push({ severity: "medium", title: `To avoid the charge you would need to cut adjusted net income by ${money(target)}. A personal pension contribution (paid net, relief at source) of ${money(r2(target / 1.25))} gets you there and moves the money into your pension, or ${money(r2(target / 1.25))} of Gift Aid donations does the same.` });
    if (outcome === "partial") {
      const per = r2(benefit / 100);
      findings.push({ severity: "info", title: `Each ${money(STEP)} you cut from adjusted net income is worth ${money(per)} back in Child Benefit, before any tax relief on the contribution itself.` });
    }
    findings.push({ severity: "info", title: `Choice: keep receiving payments and pay the charge through Self Assessment by ${deadlines.returnAndPay}, or opt out of payments (you keep the claim) so there is no bill. Opting out gives up ${money(benefit)} a year in cash; the charge only takes ${money(charge)} of it, so unless the charge is 100% keeping payments leaves you ${money(net)} better off.` });
    obligations.push(
      { ref: "Register", title: "Register for Self Assessment", why: `If you are not already in it, register by ${deadlines.register} after the tax year ends so the charge can be assessed.` },
      { ref: "Pay", title: "Report and pay the charge", why: `Declare the Child Benefit received on your return and pay the charge by ${deadlines.returnAndPay}, or opt out of payments in your Child Benefit account.` },
    );
  }
  obligations.push({ ref: "Claim", title: "Keep claiming even if the charge is 100%", why: "A claim gives a National Insurance credit to the claimant (the lower earner, if they stay at home) toward their state pension." });
  return { errors: [], label, income, grossPension, grossGift, ani, children, weeks, weekly, benefit, pct, charge, net, outcome, deadlines, findings, obligations };
}

export const SAMPLE = { year: 2025, income: 68000, pension: 0, giftAid: 0, children: 2, weeks: 52, rateFirst: 26.05, rateOther: 17.25 };

export function summaryText(r) {
  const L = [`UK High Income Child Benefit Charge, tax year ${r.label}`, "", `Income before reductions: ${money(r.income)}`, `Adjusted net income: ${money(r.ani)}`, `Children claimed for: ${r.children}`, `Child Benefit for the year: ${money(r.benefit)}`, `Charge: ${r.pct}% = ${money(r.charge)}`, `Kept after the charge: ${money(r.net)}`, "", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty."];
  return L.join("\n");
}
