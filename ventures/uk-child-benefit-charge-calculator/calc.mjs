// UK High Income Child Benefit Charge (HICBC): how much of your Child Benefit is clawed back, and what pension or Gift Aid would save.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: charge applies to the higher-income partner when
// adjusted net income (ANI) exceeds GBP 60,000 (rule from 6 April 2024); 1% of the Child Benefit received per full GBP 200 over 60,000, so 100% at 80,000;
// ANI = taxable income less gross personal pension contributions and gross Gift Aid donations. Weekly rates 2024/25 and 2025/26 as published;
// 2026/27 rates are NOT known to this tool: it reuses 2025/26 and tells the reader to type the GOV.UK rates. Every result names its source to verify.

export const VERIFY = "GOV.UK 'High Income Child Benefit Charge', 'Child Benefit rates and eligibility' and 'Adjusted net income' (HMRC); Income Tax (Earnings and Pensions) Act 2003 Part 10 Ch 8";
export const THRESHOLD = 60000;
export const FULL_AT = 80000;
export const STEP = 200;
export const YEARS = {
  2024: { label: "2024/25", eldest: 25.6, other: 16.95, assumed: false },
  2025: { label: "2025/26", eldest: 26.05, other: 17.25, assumed: false },
  2026: { label: "2026/27", eldest: 26.05, other: 17.25, assumed: true },
};

const money = (n) => "GBP " + Number(Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;

export function chargePercent(ani) {
  if (ani <= THRESHOLD) return 0;
  return Math.min(100, Math.floor((ani - THRESHOLD) / STEP));
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
  const income = num("income", "your total taxable income for the tax year");
  const pension = num("pension", "your gross pension contributions (zero if none)", true) ?? 0;
  const giftAid = num("giftAid", "your gross Gift Aid donations (zero if none)", true) ?? 0;
  const children = Number(i.children);
  if (!Number.isInteger(children) || children < 1 || children > 12) errors.push("Enter the number of children you receive Child Benefit for (1 to 12).");
  const weeks = i.weeks === undefined || i.weeks === null || i.weeks === "" ? 52 : Number(i.weeks);
  if (!Number.isFinite(weeks) || weeks < 1 || weeks > 53) errors.push("Enter the weeks of Child Benefit received in the tax year (1 to 53).");
  const year = Number(i.year);
  if (!YEARS[year]) errors.push("Pick the tax year.");
  const eldestOverride = num("eldestRate", "the weekly rate for the eldest child", true);
  const otherOverride = num("otherRate", "the weekly rate for each additional child", true);
  return { errors, income, pension, giftAid, children, weeks, year, eldestOverride, otherOverride };
}

export function benefit(children, weeks, eldest, other) {
  return r2((eldest + other * (children - 1)) * weeks);
}

// Gross contribution needed to bring ANI down to a target, capped at what would otherwise be zero.
const needed = (ani, target) => Math.max(0, r2(ani - target));

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const y = YEARS[p.year];
  const eldest = p.eldestOverride ?? y.eldest;
  const other = p.otherOverride ?? y.other;
  const received = benefit(p.children, p.weeks, eldest, other);
  const ani = Math.max(0, r2(p.income - p.pension - p.giftAid));
  const pct = chargePercent(ani);
  const charge = r2(received * pct / 100);
  const net = r2(received - charge);
  const findings = [];
  const obligations = [];
  const endYear = p.year + 1;
  const deadlines = { register: `${endYear}-10-05`, returnAndPay: `${endYear + 1}-01-31` };
  // Each extra GBP 1 of income inside the band costs benefit/20000 in charge; applies only while ANI is between 60,000 and 80,000.
  const marginalAddOn = ani >= THRESHOLD && ani < FULL_AT ? r2(received / (STEP * 100) * 100) : 0;
  const toThreshold = needed(ani, THRESHOLD);
  const toBelow = ani > THRESHOLD ? toThreshold : 0;

  if (y.assumed && p.eldestOverride === null && p.otherOverride === null) {
    findings.push({ severity: "high", title: "2026/27 weekly rates were not known when this was written: it used the 2025/26 rates. Type the current GOV.UK rates into the two rate boxes for an exact figure." });
  }
  if (pct === 0) {
    findings.push({ severity: "info", title: `Your adjusted net income of ${money(ani)} is at or under ${money(THRESHOLD)}: no High Income Child Benefit Charge. If you or your partner earn more than that, check which of you has the higher income, because the charge falls on the higher earner.` });
  } else if (pct >= 100) {
    findings.push({ severity: "high", title: `Adjusted net income of ${money(ani)} is at or over ${money(FULL_AT)}: the charge equals all of the Child Benefit received (${money(charge)}). Raising it further changes nothing; pension or Gift Aid of ${money(needed(ani, FULL_AT) + 0)} would start to reduce it.` });
  } else {
    findings.push({ severity: "high", title: `Charge of ${pct}% of ${money(received)} Child Benefit = ${money(charge)}. You keep ${money(net)} after the charge.` });
    findings.push({ severity: "medium", title: `Inside the ${money(THRESHOLD)}-${money(FULL_AT)} band each extra GBP 1 of income costs ${r2(marginalAddOn)}p more on top of your income tax rate, because it also removes Child Benefit.` });
  }
  if (pct > 0) {
    findings.push({ severity: "medium", title: `A further ${money(toBelow)} of gross pension contributions or Gift Aid donations would take adjusted net income to ${money(THRESHOLD)} and remove the charge entirely. Check what you can afford, and your annual allowance, before relying on this.` });
    findings.push({ severity: "info", title: "Alternative: stop the Child Benefit payments (not the claim). You pay no charge and the claim still protects National Insurance credits for a parent who is not working, but you give up the cash. You can restart later." });
    obligations.push({ ref: "Register", title: "Register for Self Assessment", why: `If you are not already in Self Assessment, register by 5 October ${endYear} for the ${y.label} tax year.` });
    obligations.push({ ref: "Pay", title: "Report and pay the charge", why: `Declare it on the ${y.label} return, filed and paid by 31 January ${endYear + 1}. It is paid through the return, or through a PAYE tax code adjustment if you are not in Self Assessment and ask HMRC.` });
    obligations.push({ ref: "Partner", title: "Agree who pays", why: "The charge is due from whichever of you has the higher adjusted net income, even if the other partner is the one who claims." });
  } else {
    obligations.push({ ref: "Watch", title: "Watch next year's income", why: "A pay rise, bonus or lump sum can push adjusted net income over the threshold in a later tax year." });
  }
  findings.push({ severity: "info", title: "Adjusted net income here is taxable income less gross pension contributions (relief-at-source payments grossed up by 100/80) and gross Gift Aid donations. Salary-sacrifice pension already reduces your taxable income, so do not deduct it again." });
  return { errors: [], label: y.label, assumedRates: y.assumed, eldest, other, children: p.children, weeks: p.weeks, income: p.income, pension: p.pension, giftAid: p.giftAid, ani, pct, received, charge, net, marginalAddOn, toBelow, deadlines, findings, obligations };
}

export const SAMPLE = { year: 2025, income: 68000, pension: 2000, giftAid: 0, children: 2, weeks: 52, eldestRate: "", otherRate: "" };

export function summaryText(r) {
  const L = [
    `UK High Income Child Benefit Charge check, tax year ${r.label}`, "",
    `Children: ${r.children}, weeks received: ${r.weeks}`,
    `Weekly rates used: ${money(r.eldest)} eldest, ${money(r.other)} each additional${r.assumedRates ? " (2025/26 reused, not confirmed)" : ""}`,
    `Taxable income: ${money(r.income)}`, `Gross pension contributions: ${money(r.pension)}`, `Gross Gift Aid: ${money(r.giftAid)}`,
    `Adjusted net income: ${money(r.ani)}`, "",
    `Child Benefit received: ${money(r.received)}`, `Charge: ${r.pct}% = ${money(r.charge)}`, `Kept after charge: ${money(r.net)}`, "",
    ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "",
    `Verify against: ${VERIFY}`, "Not tax advice. No warranty.",
  ];
  return L.join("\n");
}
