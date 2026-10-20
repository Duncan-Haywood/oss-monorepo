// UK student loan repayment projection: what comes out of pay, when the loan clears or is written off, and whether overpaying is worth it.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Rules modelled: a plan loan is repaid at 9% of earnings over the plan
// threshold (Plan 1, 2, 4, 5); a Postgraduate Loan at 6% over its own threshold, on top of any plan loan. Thresholds and the interest rate are
// inputs prefilled with 2025/26 figures because they are re-set each year: check GOV.UK. Write-off terms: Plan 1 25 years, Plan 2 30, Plan 4 30,
// Plan 5 40, Postgraduate 30, counted from the April after the course. Interest is one editable annual rate applied to the opening balance; the real
// Plan 2 rate varies with income and RPI. Pay growth and threshold growth are the user's assumptions, not forecasts. Scottish Plan 4 detail,
// voluntary repayment mechanics, and the Plan 1 pre-2006 age-65 rule are NOT modelled. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Repaying your student loan' (plan thresholds, rates and write-off dates); Student Loans (Repayment) Regulations 2009";
export const PLANS = {
  1: { label: "Plan 1", threshold: 26065, rate: 0.09, term: 25 },
  2: { label: "Plan 2", threshold: 28470, rate: 0.09, term: 30 },
  4: { label: "Plan 4 (Scotland)", threshold: 32745, rate: 0.09, term: 30 },
  5: { label: "Plan 5", threshold: 25000, rate: 0.09, term: 40 },
};
export const PG = { threshold: 21000, rate: 0.06, term: 30 };
export const YEARS = { 2025: "2025/26", 2026: "2026/27" };
export const MAX_YEARS = 45;

const money = (n) => "GBP " + Number(Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;

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
  const plan = Number(i.plan);
  if (!PLANS[plan]) errors.push("Pick your plan type.");
  const year = Number(i.year);
  if (!YEARS[year]) errors.push("Pick the tax year.");
  const salary = num("salary", "your gross annual pay");
  const balance = num("balance", "your plan loan balance (zero if none)");
  const interest = num("interest", "the annual interest rate in percent", true) ?? 6;
  const growth = num("growth", "yearly pay growth in percent (zero for flat pay)", true) ?? 0;
  const thresholdGrowth = num("thresholdGrowth", "yearly threshold growth in percent (zero for frozen)", true) ?? 0;
  const firstDue = num("firstDue", "the year your repayments first fell due");
  const threshold = num("threshold", "your plan's repayment threshold", true) ?? (PLANS[plan] ? PLANS[plan].threshold : 0);
  const pgBalance = num("pgBalance", "your Postgraduate Loan balance (zero if none)", true) ?? 0;
  const pgFirstDue = num("pgFirstDue", "the year postgraduate repayments first fell due", true) ?? firstDue ?? 0;
  const pgThreshold = num("pgThreshold", "the Postgraduate threshold", true) ?? PG.threshold;
  const overpay = num("overpay", "your extra yearly payment (zero if none)", true) ?? 0;
  if (interest > 20) errors.push("Interest rate above 20% looks like a typo.");
  if (growth > 30 || thresholdGrowth > 30) errors.push("Growth above 30% a year looks like a typo.");
  if (firstDue !== null && (!Number.isInteger(firstDue) || firstDue < 1990 || firstDue > 2040)) errors.push("Enter a four-digit year for first repayment, 1990 to 2040.");
  if (pgBalance > 0 && (!Number.isInteger(pgFirstDue) || pgFirstDue < 2016 || pgFirstDue > 2040)) errors.push("Postgraduate repayments began from 2016: enter a year from 2016.");
  return { errors, plan, year, salary: salary ?? 0, balance: balance ?? 0, interest, growth, thresholdGrowth, firstDue: firstDue ?? 0, threshold, pgBalance, pgFirstDue, pgThreshold, overpay };
}

// Run the year-by-year projection. Returns totals and the year-one deduction.
export function simulate(p, extra = 0) {
  const planDef = PLANS[p.plan];
  const writeOff = p.firstDue + planDef.term;       // April of this calendar year the plan loan is cancelled
  const pgWriteOff = p.pgFirstDue + PG.term;
  let bal = p.balance, pg = p.pgBalance;
  let salary = p.salary, thr = p.threshold, pgThr = p.pgThreshold;
  let repaid = 0, pgRepaid = 0, extraPaid = 0, interestPaid = 0, clearYear = null, pgClearYear = null;
  let first = null;
  let years = 0, planWrittenOff = 0, pgWrittenOff = 0;
  for (let t = 0; t < MAX_YEARS; t++) {
    const startYear = p.year + t;                     // tax year begins April of this year
    if (bal <= 0 && pg <= 0) break;
    years = t + 1;
    let planPay = 0, pgPay = 0;
    if (bal > 0) {
      const interestAmt = bal * p.interest / 100;
      interestPaid += interestAmt;
      const owed = bal + interestAmt;
      planPay = Math.min(owed, Math.max(0, salary - thr) * planDef.rate);
      let x = 0;
      if (extra > 0) x = Math.min(owed - planPay, extra);
      bal = owed - planPay - x;
      repaid += planPay; extraPaid += x;
      if (bal <= 0.005) { bal = 0; clearYear = startYear + 1; }
    }
    if (pg > 0) {
      const interestAmt = pg * p.interest / 100;
      interestPaid += interestAmt;
      const owed = pg + interestAmt;
      pgPay = Math.min(owed, Math.max(0, salary - pgThr) * PG.rate);
      pg = owed - pgPay;
      pgRepaid += pgPay;
      if (pg <= 0.005) { pg = 0; pgClearYear = startYear + 1; }
    }
    if (first === null) first = { planPay, pgPay };
    // write-offs happen on the anniversary: cancel remaining at the start of the write-off year
    const next = startYear + 1;
    if (bal > 0 && next >= writeOff) { planWrittenOff = bal; bal = 0; }
    if (pg > 0 && next >= pgWriteOff) { pgWrittenOff = pg; pg = 0; }
    salary *= 1 + p.growth / 100;
    thr *= 1 + p.thresholdGrowth / 100;
    pgThr *= 1 + p.thresholdGrowth / 100;
  }
  return {
    years, first: first || { planPay: 0, pgPay: 0 }, repaid: r2(repaid), pgRepaid: r2(pgRepaid), extraPaid: r2(extraPaid),
    totalPaid: r2(repaid + pgRepaid + extraPaid), interestPaid: r2(interestPaid),
    writtenOff: r2(planWrittenOff + pgWrittenOff), planWrittenOff: r2(planWrittenOff), pgWrittenOff: r2(pgWrittenOff),
    clearYear, pgClearYear, writeOff, pgWriteOff,
  };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const label = YEARS[p.year];
  const planDef = PLANS[p.plan];
  const base = simulate(p, 0);
  const planYear = r2(base.first.planPay), pgYear = r2(base.first.pgPay);
  const yearly = r2(planYear + pgYear);
  const monthly = r2(yearly / 12);
  const findings = [];
  const obligations = [];
  const total0 = p.balance + p.pgBalance;
  let outcome;

  if (total0 === 0) {
    outcome = "none";
    findings.push({ severity: "info", title: "No balance entered, so nothing is projected." });
  } else if (yearly === 0) {
    outcome = "below";
    findings.push({ severity: "info", title: `Pay of ${money(p.salary)} is under the ${money(p.threshold)} threshold${p.pgBalance ? " (and the postgraduate one)" : ""}: nothing is deducted in ${label}. Interest still builds on the balance.` });
  } else {
    findings.push({ severity: "info", title: `In ${label} about ${money(yearly)} is deducted, ${money(monthly)} a month${p.pgBalance ? ` (${money(planYear)} plan loan, ${money(pgYear)} postgraduate)` : ""}. It is a percentage of pay over the threshold, so it is not a debt payment you can skip.` });
  }
  if (total0 > 0) {
    if (base.writtenOff > 0) {
      outcome = "written-off";
      findings.push({ severity: "high", title: `On these assumptions the loan is not cleared before write-off: you repay ${money(base.repaid + base.pgRepaid)} and ${money(base.writtenOff)} is cancelled (plan loan ends ${base.writeOff}).` });
    } else if (base.clearYear || base.pgClearYear) {
      outcome = "cleared";
      const done = Math.max(base.clearYear || 0, base.pgClearYear || 0);
      findings.push({ severity: "medium", title: `On these assumptions the loan clears around ${done} after about ${base.years} years, with ${money(base.repaid + base.pgRepaid)} repaid in total, of which ${money(base.interestPaid)} is interest.` });
    } else {
      outcome = outcome || "open";
      findings.push({ severity: "info", title: `Still outstanding after ${base.years} modelled years.` });
    }
  }
  let overpayResult = null;
  if (p.overpay > 0 && total0 > 0) {
    const alt = simulate(p, p.overpay);
    const saved = r2(base.totalPaid - alt.totalPaid);
    overpayResult = { ...alt, saved };
    if (saved > 0) findings.push({ severity: "medium", title: `Overpaying ${money(p.overpay)} a year cuts your total cost by about ${money(saved)} (${money(alt.totalPaid)} against ${money(base.totalPaid)}). Overpayments also do not reduce the monthly deduction, only the end date.` });
    else findings.push({ severity: "high", title: `Overpaying ${money(p.overpay)} a year would cost you ${money(-saved)} more overall, because the loan is mostly or wholly cancelled at write-off before you would have repaid it. Overpaying only helps if you would otherwise clear the loan.` });
  } else if (outcome === "written-off") {
    findings.push({ severity: "info", title: "Because part of the balance is written off, extra payments are likely a poor use of cash. Enter a yearly extra amount to test it." });
  }
  obligations.push(
    { ref: "Verify", title: "Check thresholds and rate", why: `Thresholds, the interest rate and write-off dates are re-set by government: confirm the current figures at ${VERIFY.split(";")[0]}.` },
    { ref: "Balance", title: "Use your real balance", why: "Take the balance and plan type from your Student Loans Company online account; this tool cannot see it." },
    { ref: "Overpay", title: "Overpay only on purpose", why: "Voluntary payments are not refundable once made. If you are self employed, repayments are collected through Self Assessment, not payroll." },
  );
  return { errors: [], label, plan: planDef.label, p, base, yearly, monthly, planYear, pgYear, outcome, overpay: overpayResult, findings, obligations };
}

export const SAMPLE = { year: 2025, plan: 2, salary: 38000, balance: 45000, interest: 6, growth: 3, thresholdGrowth: 3, firstDue: 2019, threshold: 28470, pgBalance: 0, pgFirstDue: 2019, pgThreshold: 21000, overpay: 1000 };

export function summaryText(r) {
  const b = r.base;
  const L = [`UK student loan repayment projection, tax year ${r.label}`, "", `Plan: ${r.plan}`, `Pay: ${money(r.p.salary)}`, `Balance: ${money(r.p.balance + r.p.pgBalance)}`, `Deducted this year: ${money(r.yearly)} (${money(r.monthly)} a month)`, `Total repaid on these assumptions: ${money(b.repaid + b.pgRepaid)}`, `Written off: ${money(b.writtenOff)}`, "", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty."];
  return L.join("\n");
}
