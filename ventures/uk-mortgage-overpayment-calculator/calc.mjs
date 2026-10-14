// UK mortgage overpayment: how much interest and time a monthly or one-off
// overpayment saves on a repayment mortgage, whether it beats saving the same
// money, whether it stays inside the usual 10% a year early repayment charge
// (ERC) free allowance, and what monthly overpayment hits a target payoff.
// Browser-only. Not financial advice.

export const SAMPLE = { balance: "200000", rate: "4.5", years: "25", monthly: "200", lump: "0", savingsRate: "3.5", ercPct: "10", targetYears: "" };

const FIELDS = ["balance", "rate", "years", "monthly", "lump", "savingsRate", "ercPct", "targetYears"];
const round2 = (n) => Math.round(n * 100) / 100;
const money0 = (n) => "£" + Math.round(n).toLocaleString("en-GB");
const money2 = (n) => "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function scheduledPayment(balance, annualRatePct, months) {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return balance / months;
  return (balance * r) / (1 - Math.pow(1 + r, -months));
}

// Simulate a repayment mortgage with a fixed regular payment plus extras.
// The lump sum is paid at the start. After payoff, freed cash goes to
// savings at `savingsRatePct` until the original end month, so that the
// overpay and keep-saving routes can be compared on the same date.
export function simulate({ balance, ratePct, months, monthly, lump, savingsRatePct, extraSaved = 0, lumpSaved = 0 }) {
  const r = ratePct / 100 / 12;
  const s = savingsRatePct / 100 / 12;
  const pay = scheduledPayment(balance, ratePct, months);
  let b = Math.max(0, balance - lump);
  let interest = 0, savings = lumpSaved, paidOffMonth = b === 0 ? 0 : null;
  for (let m = 1; m <= months; m++) {
    savings *= 1 + s;
    if (b > 0) {
      const i = b * r;
      interest += i;
      const due = b + i;
      const out = Math.min(pay + monthly, due);
      b = due - out;
      if (b < 0.005) { b = 0; paidOffMonth = m; savings += pay + monthly - out; }
      savings += extraSaved;
    } else {
      savings += pay + monthly + extraSaved;
    }
  }
  return { pay, interest, paidOffMonth: paidOffMonth ?? months, savings, endBalance: b };
}

// Smallest whole-pound monthly overpayment that clears the loan within `target` months.
export function extraForTarget(balance, ratePct, months, target) {
  if (target >= months) return 0;
  let lo = 0, hi = balance;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    const sim = simulate({ balance, ratePct, months, monthly: mid, lump: 0, savingsRatePct: 0 });
    if (sim.paidOffMonth <= target) hi = mid; else lo = mid;
  }
  return Math.ceil(hi);
}

const durText = (m) => { const y = Math.floor(m / 12), mm = m % 12; return [y ? `${y} year${y > 1 ? "s" : ""}` : "", mm ? `${mm} month${mm > 1 ? "s" : ""}` : ""].filter(Boolean).join(" ") || "0 months"; };

export function compute(raw) {
  const errors = [];
  const num = (k, label, { min = 0, max = Infinity } = {}) => {
    const s = String(raw[k] ?? "").trim();
    const n = s === "" ? 0 : Number(s);
    if (!Number.isFinite(n) || n < min || n > max) { errors.push(`${label} must be a number between ${min} and ${max}.`); return 0; }
    return n;
  };
  const v = {
    balance: num("balance", "Mortgage balance"),
    rate: num("rate", "Interest rate", { max: 25 }),
    years: num("years", "Remaining term (years)", { max: 40 }),
    monthly: num("monthly", "Monthly overpayment"),
    lump: num("lump", "One-off lump sum"),
    savingsRate: num("savingsRate", "Savings rate", { max: 25 }),
    ercPct: num("ercPct", "Free overpayment allowance (%)", { max: 100 }),
    targetYears: num("targetYears", "Target payoff (years)", { max: 40 }),
  };
  if (!errors.length && v.balance <= 0) errors.push("Enter your mortgage balance.");
  if (!errors.length && v.years <= 0) errors.push("Enter the remaining term in years.");
  if (!errors.length && v.monthly === 0 && v.lump === 0) errors.push("Enter a monthly overpayment or a one-off lump sum.");
  if (!errors.length && v.lump > v.balance) errors.push("The lump sum is larger than the balance.");
  if (errors.length) return { errors };

  const months = Math.round(v.years * 12);
  const base = simulate({ balance: v.balance, ratePct: v.rate, months, monthly: 0, lump: 0, savingsRatePct: v.savingsRate });
  const over = simulate({ balance: v.balance, ratePct: v.rate, months, monthly: v.monthly, lump: v.lump, savingsRatePct: v.savingsRate });
  const save = simulate({ balance: v.balance, ratePct: v.rate, months, monthly: 0, lump: 0, savingsRatePct: v.savingsRate, extraSaved: v.monthly, lumpSaved: v.lump });

  const interestSaved = base.interest - over.interest;
  const monthsSaved = months - over.paidOffMonth;
  const wealthOverpay = over.savings;
  const wealthSave = save.savings;
  const advantage = wealthOverpay - wealthSave;
  const overpaidTotal = v.monthly * Math.min(over.paidOffMonth, months) + v.lump;
  const firstYearOver = v.monthly * 12 + v.lump;
  const ercAllowance = v.balance * (v.ercPct / 100);
  const withinErc = firstYearOver <= ercAllowance + 0.005;

  const scenarios = [50, 100, 250, 500, 1000].map((m) => {
    const sim = simulate({ balance: v.balance, ratePct: v.rate, months, monthly: m, lump: v.lump, savingsRatePct: v.savingsRate });
    return { monthly: m, interestSaved: round2(base.interest - sim.interest), monthsSaved: months - sim.paidOffMonth, payoff: durText(sim.paidOffMonth) };
  });
  const targetMonths = v.targetYears > 0 ? Math.round(v.targetYears * 12) : 0;
  const targetExtra = targetMonths ? extraForTarget(v.balance, v.rate, months, targetMonths) : null;

  const findings = [];
  findings.push({ severity: "info", title: `Overpaying ${money0(v.monthly)} a month${v.lump ? ` plus ${money0(v.lump)} now` : ""} clears the mortgage in ${durText(over.paidOffMonth)} instead of ${durText(months)}, saving ${money0(interestSaved)} of interest.` });
  if (advantage > 0.5) findings.push({ severity: "info", title: `Overpaying beats saving the same money at ${v.savingsRate}%: you end ${money0(advantage)} better off at the original end date (before any tax on savings interest).` });
  else if (advantage < -0.5) findings.push({ severity: "high", title: `Saving the same money at ${v.savingsRate}% would leave you ${money0(-advantage)} better off than overpaying at ${v.rate}% (before tax on interest and ignoring that you could not get the savings back out of a mortgage). Check whether your savings rate is after tax.` });
  if (!withinErc) findings.push({ severity: "high", title: `Your first-year overpayments of ${money0(firstYearOver)} exceed ${v.ercPct}% of the balance (${money0(ercAllowance)}). If you are in a fixed or discounted deal, an early repayment charge may apply to the excess. Ask your lender before paying it.` });
  if (v.monthly > 0 && interestSaved > 0 && over.paidOffMonth < months) findings.push({ severity: "medium", title: `Ask your lender whether overpayments shorten the term or just lower the monthly bill. This calculation assumes the monthly payment stays the same and the term shortens.` });
  if (targetExtra !== null) findings.push({ severity: "medium", title: targetExtra === 0 ? "Your current term already finishes by your target." : `To clear the mortgage in ${durText(targetMonths)} you would need to overpay about ${money0(targetExtra)} a month.` });

  const obligations = [
    { title: "Check your early repayment charge", why: "Most fixed and discounted deals allow about 10% of the balance a year free. Overpaying past that can cost 1% to 5% of the excess." },
    { title: "Tell the lender how to treat it", why: "Ask that overpayments reduce the term or the balance rather than being held against future payments, and that interest is recalculated daily or monthly." },
    { title: "Keep an emergency fund first", why: "You cannot take overpayments back out of a standard mortgage. Keep cash for emergencies before paying down the loan." },
    { title: "Check the numbers", why: "This is an estimate for a repayment mortgage at a single rate. Variable rates, remortgages, fees and payment holidays will change it. Not financial advice." },
  ];

  return { errors: [], v, months, base, over, save, interestSaved, monthsSaved, advantage, wealthOverpay, wealthSave, overpaidTotal, firstYearOver, ercAllowance, withinErc, scenarios, targetExtra, targetMonths, findings, obligations, durText };
}

export function summaryText(r) {
  return [
    "UK mortgage overpayment",
    `Balance ${money0(r.v.balance)} at ${r.v.rate}% over ${durText(r.months)}. Normal payment ${money2(r.base.pay)} a month.`,
    `Overpaying ${money0(r.v.monthly)} a month${r.v.lump ? ` plus ${money0(r.v.lump)} now` : ""}: paid off in ${durText(r.over.paidOffMonth)} (${durText(r.monthsSaved)} sooner).`,
    `Interest: ${money0(r.base.interest)} -> ${money0(r.over.interest)}, saving ${money0(r.interestSaved)}.`,
    `Versus saving the same at ${r.v.savingsRate}%: overpaying is ${r.advantage >= 0 ? money0(r.advantage) + " ahead" : money0(-r.advantage) + " behind"} at the original end date.`,
    r.withinErc ? "First-year overpayments are within the free allowance." : "First-year overpayments exceed the free allowance: ask about early repayment charges.",
    "Not financial advice.",
  ].join("\n");
}
