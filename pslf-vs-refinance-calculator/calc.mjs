// PSLF versus refinancing: two ways to pay off the same federal student loan.
// Path 1 stays federal, pays an income-driven payment and has the balance
// forgiven after the remaining qualifying payments (Public Service Loan
// Forgiveness). Path 2 refinances into a private fixed-rate loan. Pure
// arithmetic on numbers the visitor types; no network, and no plan rules are
// looked up: the plan percentage, the protected-income multiple and the
// poverty guideline are all editable inputs with stated defaults.

export const GUIDELINE_GROWTH = 0.025; // yearly growth assumed for the poverty guideline
export const PSLF_PAYMENTS = 120;

export function parseNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[$,\s]/g, "").replace(/%$/, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function money(n) {
  return Math.round(n).toLocaleString("en-US");
}

// Level monthly payment that pays `bal` off in `months` at `annualRate`.
export function amortPayment(bal, annualRate, months) {
  if (bal <= 0 || months <= 0) return 0;
  const r = annualRate / 12;
  return r === 0 ? bal / months : (bal * r) / (1 - Math.pow(1 + r, -months));
}

// Monthly payments for a fully amortizing loan.
export function amortFlows(bal, annualRate, months) {
  const pay = amortPayment(bal, annualRate, months);
  return Array.from({ length: months }, () => pay);
}

export function totalOf(flows) {
  return flows.reduce((s, x) => s + x, 0);
}

// Present value of monthly payments at a yearly discount rate (first payment
// one month out).
export function pvOf(flows, discountRate) {
  const m = discountRate / 12;
  return flows.reduce((s, x, i) => s + x / Math.pow(1 + m, i + 1), 0);
}

// Income-driven plan: pay `pct` of the income above `mult` times the poverty
// guideline, recomputed each year, never more than the balance plus interest,
// optionally capped at the 10-year standard payment. Interest that the payment
// does not cover is added to the balance (a simple, conservative treatment).
export function idrSimulate(p, months) {
  const cap = p.capStandard ? amortPayment(p.balance, p.fedRate, 120) : Infinity;
  const flows = [];
  const balances = [];
  let bal = p.balance;
  let annual = 0;
  for (let m = 0; m < months; m++) {
    if (m % 12 === 0) {
      const y = m / 12;
      const income = p.income * Math.pow(1 + p.growth, y);
      const protectedAmt = p.mult * p.poverty * Math.pow(1 + GUIDELINE_GROWTH, y);
      annual = (p.pct * Math.max(0, income - protectedAmt)) / 12;
    }
    const interest = (bal * p.fedRate) / 12;
    let pay = Math.min(annual, cap, bal + interest);
    if (bal <= 0) pay = 0;
    bal = bal + interest - pay;
    if (bal < 0.005) bal = 0;
    flows.push(pay);
    balances.push(bal);
  }
  return { flows, balances, forgiven: bal };
}

// Pay the income-driven amount for `stayMonths`, then leave qualifying
// employment and repay what is left on a standard 10-year schedule.
export function leaveAfter(p, sim, stayMonths) {
  const k = Math.min(stayMonths, sim.flows.length);
  const bal = k === 0 ? p.balance : sim.balances[k - 1];
  return sim.flows.slice(0, k).concat(amortFlows(bal, p.fedRate, 120));
}

export function refiFlows(p) {
  return amortFlows(p.balance, p.refiRate, Math.round(p.refiYears * 12));
}

const RAW = ["balance", "fedRate", "income", "growth", "household", "pct", "mult", "poverty", "paymentsMade", "refiRate", "refiYears", "discount"];

export function parseInput(raw) {
  const v = {};
  for (const k of RAW) v[k] = parseNum(raw[k]);
  const errors = [];
  const need = (k, label) => { if (!(v[k] > 0)) errors.push(`${label} must be a number above zero.`); };
  need("balance", "Loan balance");
  need("income", "Yearly income (AGI)");
  need("refiYears", "Refinance term in years");
  if (v.fedRate === null || Number.isNaN(v.fedRate) || v.fedRate < 0 || v.fedRate > 25) errors.push("Federal loan rate must be between 0 and 25 percent.");
  if (v.refiRate === null || Number.isNaN(v.refiRate) || v.refiRate < 0 || v.refiRate > 25) errors.push("Refinance rate must be between 0 and 25 percent.");
  if (v.refiYears > 40) errors.push("Refinance term must be 40 years or less.");
  if (v.growth === null) v.growth = 0;
  if (Number.isNaN(v.growth) || v.growth < -20 || v.growth > 30) errors.push("Yearly income growth must be between -20 and 30 percent.");
  if (v.household === null) v.household = 1;
  if (!(v.household >= 1 && v.household <= 12)) errors.push("Household size must be between 1 and 12.");
  if (v.pct === null) v.pct = 10;
  if (!(v.pct > 0 && v.pct <= 25)) errors.push("Plan percentage must be above 0 and at most 25.");
  if (v.mult === null) v.mult = 150;
  if (!(v.mult >= 0 && v.mult <= 400)) errors.push("Protected income must be between 0 and 400 percent of the poverty guideline.");
  if (v.paymentsMade === null) v.paymentsMade = 0;
  if (!(v.paymentsMade >= 0 && v.paymentsMade <= 119)) errors.push("Qualifying payments made must be between 0 and 119.");
  if (v.discount === null) v.discount = 0;
  if (!(v.discount >= 0 && v.discount <= 25)) errors.push("Discount rate must be between 0 and 25 percent.");
  if (v.poverty === null) v.poverty = 15650 + 5500 * ((v.household || 1) - 1);
  else if (!(v.poverty > 0)) errors.push("Poverty guideline must be above zero.");
  const cap = String(raw.capStandard ?? "yes").toLowerCase() !== "no";
  const p = {
    balance: v.balance, fedRate: v.fedRate / 100, income: v.income, growth: v.growth / 100,
    household: v.household, pct: v.pct / 100, mult: v.mult / 100, poverty: v.poverty,
    paymentsMade: Math.round(v.paymentsMade), refiRate: v.refiRate / 100, refiYears: v.refiYears,
    discount: v.discount / 100, capStandard: cap,
  };
  return { p, errors };
}

function compare(p, idrSim, months) {
  const pslf = idrSim.flows.slice(0, months);
  const refi = refiFlows(p);
  return {
    pslfTotal: totalOf(pslf), refiTotal: totalOf(refi),
    pslfPv: pvOf(pslf, p.discount), refiPv: pvOf(refi, p.discount),
  };
}

export function analyze(raw) {
  const { p, errors } = parseInput(raw);
  if (errors.length) return { error: errors[0], errors };
  const months = Math.max(0, PSLF_PAYMENTS - p.paymentsMade);
  const sim = idrSimulate(p, Math.max(months, 1));
  const forgivenAt = months === 0 ? p.balance : sim.forgiven;
  const pslfFlows = months === 0 ? [] : sim.flows.slice(0, months);
  const refi = refiFlows(p);
  const pslfTotal = totalOf(pslfFlows), refiTotal = totalOf(refi);
  const pslfPv = pvOf(pslfFlows, p.discount), refiPv = pvOf(refi, p.discount);
  const firstIdr = sim.flows[0] || 0;
  const std10 = amortPayment(p.balance, p.fedRate, 120);
  const refiMonthly = refi[0] || 0;
  const paidOffEarly = months > 0 && sim.forgiven === 0;

  // Leaving qualifying work early: income-driven payments, then a standard 10-year schedule.
  const leaveYears = [1, 2, 3, 5, 7, 9].filter((y) => y * 12 < months);
  const leave = leaveYears.map((y) => {
    const f = leaveAfter(p, sim, y * 12);
    return { years: y, total: totalOf(f), pv: pvOf(f, p.discount), vsRefi: totalOf(f) - refiTotal };
  });

  // Same loan, different income.
  const incomeScenarios = [0.5, 0.75, 1, 1.5, 2].map((m) => {
    const q = { ...p, income: p.income * m };
    const s = idrSimulate(q, Math.max(months, 1));
    const f = months === 0 ? [] : s.flows.slice(0, months);
    return { label: m === 1 ? "Your income" : `${Math.round(m * 100)}% of your income`, income: q.income, pslf: totalOf(f), refi: refiTotal, diff: refiTotal - totalOf(f) };
  });
  // Income multiple at which the two paths cost the same (bisection on total paid).
  let breakIncome = null;
  if (months > 0) {
    const cost = (m) => totalOf(idrSimulate({ ...p, income: p.income * m }, months).flows.slice(0, months));
    const lo = 0.05, hi = 20;
    if (cost(lo) < refiTotal && cost(hi) > refiTotal) {
      let a = lo, b = hi;
      for (let i = 0; i < 60; i++) { const mid = (a + b) / 2; if (cost(mid) < refiTotal) a = mid; else b = mid; }
      breakIncome = p.income * ((a + b) / 2);
    }
  }

  const saving = refiTotal - pslfTotal;
  const savingPv = refiPv - pslfPv;
  const winner = Math.abs(savingPv) < 1 ? "tie" : savingPv > 0 ? "pslf" : "refi";
  const findings = [];
  if (months === 0) {
    findings.push({ severity: "info", title: "You have already made all 120 qualifying payments", detail: "If your employment and payment history are certified, the remaining balance is eligible to be forgiven now. Refinancing would forfeit that. Confirm the count on your servicer's or studentaid.gov's record before doing anything." });
  } else if (paidOffEarly) {
    findings.push({ severity: "medium", title: "Your income-driven payments pay the loan off before forgiveness", detail: `At these inputs the balance reaches zero inside ${months} payments, so there is nothing left to forgive and PSLF saves you nothing over any plan that pays it off. Compare on the numbers below: PSLF path $${money(pslfTotal)} against refinancing $${money(refiTotal)}.` });
  } else {
    findings.push({ severity: winner === "refi" ? "medium" : "info", title: winner === "tie" ? "The two paths cost about the same" : winner === "pslf" ? `Staying federal for PSLF costs about $${money(Math.abs(saving))} less in total` : `Refinancing costs about $${money(Math.abs(saving))} less in total`, detail: `PSLF path: $${money(pslfTotal)} paid over ${months} monthly payments, then $${money(forgivenAt)} forgiven. Refinance: $${money(refiTotal)} paid over ${Math.round(p.refiYears * 12)} monthly payments${p.discount > 0 ? `. In present-value terms at a ${(p.discount * 100).toFixed(1)}% discount rate the gap is $${money(Math.abs(savingPv))} in favor of ${savingPv > 0 ? "PSLF" : "refinancing"}` : ""}.` });
  }
  if (!paidOffEarly && months > 0 && firstIdr < (p.balance * p.fedRate) / 12) {
    findings.push({ severity: "medium", title: "Your first-year payment is below the monthly interest", detail: `The payment is $${money(firstIdr)} a month and interest is about $${money((p.balance * p.fedRate) / 12)}, so the balance grows until income rises. That is fine under PSLF because the balance is forgiven, and it is exactly what makes a low income-driven payment worth more than it looks.` });
  }
  findings.push({ severity: "medium", title: "Refinancing federal loans into a private loan cannot be undone", detail: "A private lender does not offer income-driven plans, PSLF, or the federal deferment and forbearance options, and you cannot move the loan back to the federal program. Only refinance if the numbers above beat staying federal even after you allow for losing that protection." });
  findings.push({ severity: "info", title: "PSLF only counts qualifying work and payments", detail: "Forgiveness requires 120 qualifying monthly payments while working full-time for a qualifying employer, on eligible federal loans and an eligible repayment plan. This tool assumes every payment qualifies. Check the employer and the payment count with your servicer and studentaid.gov." });
  if (breakIncome !== null && !paidOffEarly) {
    findings.push({ severity: "info", title: `PSLF stops beating the refinance above about $${money(breakIncome)} income`, detail: `Holding everything else fixed and scaling your income, the total paid under PSLF equals the refinance total at roughly $${money(breakIncome)} a year. Below that income PSLF costs less; above it the refinance does.` });
  }
  if (leave.length) {
    const worse = leave.filter((l) => l.vsRefi > 0);
    if (worse.length) findings.push({ severity: "medium", title: `If you leave qualifying work before year ${Math.max(...worse.map((l) => l.years)) + 1}, PSLF costs more than refinancing`, detail: "The table shows the total paid if you pay the income-driven amount for that many years and then repay what is left over 10 years at your federal rate. Job security matters more than the headline saving." });
  }

  return {
    p, months, forgiven: forgivenAt, paidOffEarly, winner,
    pslfTotal, refiTotal, pslfPv, refiPv, saving, savingPv,
    firstIdr, std10, refiMonthly, breakIncome, leave, incomeScenarios, findings, error: null,
  };
}

export function sampleInput() {
  return { balance: "250000", fedRate: "6.5", income: "95000", growth: "3", household: "1", pct: "10", mult: "150", poverty: "", paymentsMade: "0", refiRate: "4.5", refiYears: "10", discount: "0", capStandard: "yes" };
}

export function reportCsv(a) {
  const rows = [["scenario", "pslf_total_paid", "refinance_total_paid", "refinance_minus_pslf"]];
  for (const s of a.incomeScenarios) rows.push([`${s.label} ($${Math.round(s.income)})`, Math.round(s.pslf), Math.round(s.refi), Math.round(s.diff)]);
  for (const l of a.leave) rows.push([`leave PSLF work after ${l.years} years`, Math.round(l.total), Math.round(a.refiTotal), Math.round(a.refiTotal - l.total)]);
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";
}
