// UK trading allowance: should a side-hustler claim the GBP 1,000 allowance or deduct actual expenses, and what do income tax and Class 4 NIC come to?
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: England, Wales and Northern Ireland rates
// (Scottish income tax bands differ and are NOT modelled); personal allowance GBP 12,570 tapered by GBP 1 per GBP 2 over GBP 100,000;
// 20% to taxable GBP 37,700, 40% to taxable GBP 125,140, 45% above; Class 4 NIC 6% on profits GBP 12,570 to 50,270 and 2% above.
// Both tax years offered are assumed to use the same frozen thresholds. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Tax-free allowances on property and trading income', 'Income Tax rates and Personal Allowances' and 'Self-employed National Insurance rates'; Income Tax (Trading and Other Income) Act 2005 Part 6 Ch 3";
export const ALLOWANCE = 1000;
export const PERSONAL_ALLOWANCE = 12570;
export const BASIC_BAND = 37700;
export const HIGHER_LIMIT = 125140;
export const TAPER_START = 100000;
export const NIC_LOWER = 12570;
export const NIC_UPPER = 50270;
export const YEARS = { 2025: "2025/26", 2026: "2026/27" };

const money = (n) => "GBP " + Number(Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const yn = (v) => v === true || v === "yes";
const r2 = (n) => Math.round(n * 100) / 100;

export function incomeTax(income) {
  const pa = income <= TAPER_START ? PERSONAL_ALLOWANCE : Math.max(0, PERSONAL_ALLOWANCE - (income - TAPER_START) / 2);
  const taxable = Math.max(0, income - pa);
  const basic = Math.min(taxable, BASIC_BAND);
  const higher = Math.max(0, Math.min(taxable, HIGHER_LIMIT) - BASIC_BAND);
  const additional = Math.max(0, taxable - HIGHER_LIMIT);
  return r2(basic * 0.2 + higher * 0.4 + additional * 0.45);
}

export function class4(profit) {
  const mid = Math.max(0, Math.min(profit, NIC_UPPER) - NIC_LOWER);
  const top = Math.max(0, profit - NIC_UPPER);
  return r2(mid * 0.06 + top * 0.02);
}

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
  const gross = num("gross", "your gross trading income for the tax year");
  const expenses = num("expenses", "your allowable expenses (zero if none)", true);
  const other = num("other", "your other taxable income (zero if none)", true);
  const year = Number(i.year);
  if (!YEARS[year]) errors.push("Pick the tax year.");
  return { errors, gross, expenses, other, year, restricted: yn(i.restricted) };
}

const scenario = (label, profit, other) => {
  const tax = r2(incomeTax(other + profit) - incomeTax(other));
  const nic = class4(profit);
  return { label, profit, tax, nic, total: r2(tax + nic) };
};

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { gross, expenses, other, year, restricted } = p;
  const label = YEARS[year];
  const endYear = year + 1;
  const findings = [];
  const obligations = [];
  const deadlines = { register: `${endYear}-10-05`, returnAndPay: `${endYear + 1}-01-31` };
  let outcome, chosen = null, alt = null;

  if (restricted) {
    outcome = "restricted";
    findings.push({ severity: "high", title: "The trading allowance is not available on income from your employer (or a company you or your partner control) or from a partnership you are in. On those, deduct actual expenses instead." });
  }
  if (!restricted && gross <= ALLOWANCE) {
    outcome = "exempt";
    findings.push({ severity: "info", title: `Gross trading income of ${money(gross)} is within the ${money(ALLOWANCE)} allowance: no tax or Class 4 NIC on it, and you need not register for Self Assessment or declare it (unless you want to elect out of the allowance to claim a loss).` });
    if (expenses > gross) findings.push({ severity: "medium", title: `Your expenses (${money(expenses)}) exceed your income. Only by electing out of the allowance can you set that ${money(expenses - gross)} loss against other income or carry it forward. That means registering and reporting.` });
    obligations.push({ ref: "Keep", title: "Keep records anyway", why: "The allowance is tested on gross income across all your trading and miscellaneous income, not each activity. Keep a simple record so you can show the total stayed within it." });
  } else {
    if (!restricted) {
      const useAllowance = scenario("Claim the GBP 1,000 allowance", Math.max(0, gross - ALLOWANCE), other);
      const useExpenses = scenario("Deduct actual expenses", Math.max(0, gross - expenses), other);
      chosen = useAllowance.total <= useExpenses.total ? useAllowance : useExpenses;
      alt = chosen === useAllowance ? useExpenses : useAllowance;
      outcome = chosen === useAllowance ? "allowance" : "expenses";
      findings.push({ severity: "high", title: `Gross trading income of ${money(gross)} is over ${money(ALLOWANCE)}: you must register for Self Assessment and report it. Register by ${deadlines.register} after the tax year ends; file and pay by ${deadlines.returnAndPay}.` });
      findings.push({ severity: "info", title: `${chosen.label} for ${label}: taxable profit ${money(chosen.profit)}, income tax ${money(chosen.tax)} and Class 4 NIC ${money(chosen.nic)}, ${money(chosen.total)} in all. The other choice would cost ${money(alt.total)}, ${money(alt.total - chosen.total)} more. You cannot claim both.` });
      if (chosen.total > 1000) findings.push({ severity: "medium", title: "A bill over GBP 1,000 can bring payments on account for the next year. Set money aside." });
      if (expenses > gross) findings.push({ severity: "medium", title: `Expenses exceed income by ${money(expenses - gross)}. Taxable profit is nil, and the loss can be carried forward or set against other income.` });
      if (useExpenses.profit > useAllowance.profit) findings.push({ severity: "info", title: `Your expenses are under ${money(ALLOWANCE)}, so the flat allowance beats listing them and needs no receipts.` });
    } else {
      const s = scenario("Deduct actual expenses", Math.max(0, gross - expenses), other);
      chosen = s; alt = null;
      findings.push({ severity: "high", title: `Gross trading income of ${money(gross)} is over ${money(ALLOWANCE)} and must be reported. Register by ${deadlines.register}; file and pay by ${deadlines.returnAndPay}.` });
      findings.push({ severity: "info", title: `Deducting expenses for ${label}: taxable profit ${money(s.profit)}, income tax ${money(s.tax)}, Class 4 NIC ${money(s.nic)}, ${money(s.total)} in all.` });
    }
    obligations.push(
      { ref: "Register", title: "Register for Self Assessment", why: "Do it by 5 October after the end of the tax year in which you first went over GBP 1,000; HMRC then sends your Unique Taxpayer Reference." },
      { ref: "Report", title: "File the return and pay", why: "File online and pay any balance by 31 January after the tax year ends." },
      { ref: "Records", title: "Keep records for 5 years", why: "Income and, if you deduct expenses, receipts for each." },
    );
  }
  findings.push({ severity: "info", title: "Class 2 NIC is no longer compulsory for the self-employed; low earners may pay it voluntarily to protect state pension entitlement. Check your record on GOV.UK." });
  return { errors: [], label, gross, expenses, other, outcome, chosen, alt, deadlines, findings, obligations, allowance: ALLOWANCE };
}

export const SAMPLE = { year: 2025, gross: 4800, expenses: 600, other: 32000, restricted: "no" };

export function summaryText(r) {
  const L = [`UK trading allowance check, tax year ${r.label}`, "", `Gross trading income: ${money(r.gross)}`, `Allowable expenses: ${money(r.expenses)}`, `Other taxable income: ${money(r.other)}`, ""];
  if (r.chosen) {
    L.push(`Best route: ${r.chosen.label}`, `Taxable profit: ${money(r.chosen.profit)}`, `Income tax: ${money(r.chosen.tax)}`, `Class 4 NIC: ${money(r.chosen.nic)}`, `Total: ${money(r.chosen.total)}`);
    if (r.alt) L.push(`Alternative (${r.alt.label}): ${money(r.alt.total)}`);
  } else L.push("Within the allowance: nothing to pay or report on this income.");
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Rates for England, Wales and Northern Ireland; Scotland not modelled. Not tax advice. No warranty.");
  return L.join("\n");
}
