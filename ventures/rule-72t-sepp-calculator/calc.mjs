// Rule 72(t) SEPP (substantially equal periodic payments) arithmetic.
// Pure functions, no I/O. Not tax advice; see the disclaimer on the page.

// IRS Single Life Table (Treas. Reg. 1.401(a)(9)-9, Table I, effective 2022),
// life expectancy factor by age. Verify against the regulation before relying.
export const SINGLE_LIFE = {
  40: 45.7, 41: 44.8, 42: 43.8, 43: 42.9, 44: 41.9, 45: 41.0, 46: 40.0, 47: 39.0,
  48: 38.1, 49: 37.1, 50: 36.2, 51: 35.3, 52: 34.3, 53: 33.4, 54: 32.5, 55: 31.6,
  56: 30.6, 57: 29.8, 58: 28.9, 59: 28.0, 60: 27.1, 61: 26.2, 62: 25.4, 63: 24.5,
  64: 23.7, 65: 22.9,
};
export const MIN_AGE = 40;
export const MAX_AGE = 59;
export const PENALTY_RATE = 0.10;

export function num(v) {
  const s = String(v ?? "").replace(/[$,%\s,]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export const money = (v) => (v < 0 ? "-" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US");
export const pct = (v, d = 1) => (v * 100).toFixed(d).replace(/\.0+$/, "") + "%";

// Years the payments must continue: the later of 5 years and reaching 59 1/2.
export function lockYears(startAge) {
  return Math.max(5, Math.ceil(59.5 - startAge));
}

// Level annual payment that amortizes `balance` over `n` years at rate `i`.
export function amortizationPayment(balance, i, n) {
  if (i === 0) return balance / n;
  return (balance * i) / (1 - Math.pow(1 + i, -n));
}

export function analyze(input) {
  const age = num(input.age);
  const balance = num(input.balance);
  const rate = num(input.rate) / 100;
  const growth = num(input.growth) / 100;
  const target = input.target === "" || input.target == null ? 0 : num(input.target);
  if (!Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) return { error: `Enter your age at the first payment as a whole number from ${MIN_AGE} to ${MAX_AGE}.` };
  if (!(balance > 0)) return { error: "Enter the IRA balance you would use, greater than zero." };
  if (!(rate >= 0 && rate <= 0.15)) return { error: "Enter the SEPP interest rate as a percentage from 0 to 15." };
  if (!(growth >= -0.5 && growth <= 0.3)) return { error: "Enter an assumed annual return from -50 to 30 percent." };
  if (!(target >= 0)) return { error: "Enter the income you need per year, or leave it blank." };

  const n = lockYears(age);
  const le0 = SINGLE_LIFE[age];
  const amort = amortizationPayment(balance, rate, le0);

  const rows = [];
  let rb = balance, ab = balance;
  let rmdTotal = 0, amortTotal = 0;
  for (let t = 0; t < n; t++) {
    const a = age + t;
    const le = SINGLE_LIFE[a];
    const rmdPay = Math.min(rb, rb / le);
    const amPay = Math.min(ab, amort);
    rows.push({ year: t + 1, age: a, rmd: rmdPay, amort: amPay, rmdBalance: rb, amortBalance: ab });
    rmdTotal += rmdPay; amortTotal += amPay;
    rb = (rb - rmdPay) * (1 + growth);
    ab = (ab - amPay) * (1 + growth);
  }
  const first = rows[0].rmd;
  // Balance needed so each method's first-year payment reaches the target.
  const needAmort = target > 0 ? (target * balance) / amort : 0;
  const needRmd = target > 0 ? target * le0 : 0;
  // The fixed-amortization payment as a share of the balance.
  const amortRate = amort / balance;
  return {
    age, balance, rate, growth, target, years: n, endAge: age + n, lifeExpectancy: le0,
    rmd: first, amort, amortRate, rows,
    endBalance: { rmd: rb, amort: ab },
    totals: { rmd: rmdTotal, amort: amortTotal },
    penaltyAvoided: { rmd: rmdTotal * PENALTY_RATE, amort: amortTotal * PENALTY_RATE },
    need: { rmd: needRmd, amort: needAmort },
    higher: amort >= first ? "amort" : "rmd",
    rateWarning: rate > 0.05,
  };
}

// What breaking the schedule after `year` payments would cost federally:
// the 10% additional tax on every distribution taken so far (plus interest,
// which is not modelled).
export function modificationExposure(result, year) {
  const k = Math.max(0, Math.min(year, result.rows.length));
  const sum = (key) => result.rows.slice(0, k).reduce((s, r) => s + r[key], 0);
  return { rmd: sum("rmd") * PENALTY_RATE, amort: sum("amort") * PENALTY_RATE };
}

export function samplePlan() {
  return { age: "50", balance: "800000", rate: "5", growth: "5", target: "40000" };
}

export function reportCsv(r) {
  const lines = ["year,age,rmd_method_payment,amortization_payment,rmd_method_start_balance,amortization_start_balance"];
  for (const x of r.rows) lines.push([x.year, x.age, x.rmd.toFixed(2), x.amort.toFixed(2), x.rmdBalance.toFixed(2), x.amortBalance.toFixed(2)].join(","));
  return lines.join("\n") + "\n";
}
