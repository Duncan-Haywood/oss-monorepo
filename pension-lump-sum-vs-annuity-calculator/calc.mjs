// Pension lump sum vs monthly pension evaluator. Pure functions, no dependencies, nothing leaves the
// browser. Everything is arithmetic on figures the user types from their own pension election form.
//
// Model, monthly steps from today to age 110:
//   pension_m  = monthly pension x (1 + cola)^(whole years since the pension started)   once age >= start age
//   survival   = Gompertz: S(t) = exp(-c (e^(t/b) - 1)), t in years from today, b = 9.5 years, and c
//                set so the chance of reaching the typed "50/50 age" is exactly one half.
//   expected_m = pension_m x ( S_you(t) + survivor% x S_spouse(t) x (1 - S_you(t)) )
// Present value discounts at the return the user thinks the lump sum could earn. The implied return is
// the rate at which the expected pension is worth exactly the lump sum (after the typed tax on it).

export const DEFAULTS = {
  age: 62,
  lifeAge: 85,
  startAge: 65,
  monthlyPension: 2200,
  cola: 0,
  lumpSum: 330000,
  lumpTaxPct: 0,
  discountRate: 5,
  spouseAge: 0,
  spouseLifeAge: 88,
  survivorPct: 50,
  planAge: 95,
};

const B = 9.5; // Gompertz dispersion in years: a stylised adult-mortality shape, not a life table.
const MAX_AGE = 110;

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}
const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);

export function money(x) {
  if (!Number.isFinite(x)) return "n/a";
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}
export function pct(x, d = 1) {
  return Number.isFinite(x) ? (x * 100).toFixed(d) + "%" : "n/a";
}

// Chance of being alive t years from now, given alive at `age` and a 50% chance of reaching `lifeAge`.
export function survival(t, age, lifeAge) {
  const toMedian = Math.max(lifeAge - age, 0.5);
  const c = Math.LN2 / (Math.exp(toMedian / B) - 1);
  return Math.exp(-c * (Math.exp(Math.max(t, 0) / B) - 1));
}

// Age at which the chance of still being alive falls to `p`.
export function ageAtSurvival(p, age, lifeAge) {
  const toMedian = Math.max(lifeAge - age, 0.5);
  const c = Math.LN2 / (Math.exp(toMedian / B) - 1);
  return age + B * Math.log(1 - Math.log(p) / c);
}

// One row per month: when it is paid and what it is worth in expectation, before discounting.
export function monthlyRows(raw) {
  const o = { ...DEFAULTS, ...raw };
  const age = nz(o.age), start = Math.max(nz(o.startAge), age);
  const cola = nz(o.cola) / 100;
  const spouse = nz(o.spouseAge) > 0;
  const surv = Math.min(nz(o.survivorPct), 100) / 100;
  const rows = [];
  for (let m = 1; m <= Math.max(Math.round((MAX_AGE - age) * 12), 0); m++) {
    const t = m / 12, a = age + t;
    if (a < start) continue;
    const pension = nz(o.monthlyPension) * Math.pow(1 + cola, Math.floor(a - start));
    const me = survival(t, age, nz(o.lifeAge));
    const sp = spouse ? survival(t, nz(o.spouseAge), nz(o.spouseLifeAge)) : 0;
    const expected = pension * (me + surv * sp * (1 - me));
    rows.push({ t, age: a, pension, me, sp, expected });
  }
  return rows;
}

export function presentValue(rows, ratePct, key = "expected") {
  const r = ratePct / 100;
  return rows.reduce((s, x) => s + x[key] / Math.pow(1 + r, x.t), 0);
}

// Rate at which the stream is worth `price`; bisection, NaN when no rate in range does it.
export function impliedReturn(price, rows, key = "expected") {
  if (!(price > 0) || !rows.length) return NaN;
  const lo0 = -5, hi0 = 40;
  const f = (r) => presentValue(rows, r, key) - price;
  if (f(lo0) < 0 || f(hi0) > 0) return NaN;
  let lo = lo0, hi = hi0;
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 200;
}

// First-year monthly amount (growing with the COLA) a lump sum can pay from the pension start age to planAge.
export function sustainableMonthly(lump, o, ratePct) {
  const age = nz(o.age), start = Math.max(nz(o.startAge), age), cola = nz(o.cola) / 100;
  const r = ratePct / 100;
  let unit = 0;
  for (let m = 1; m <= Math.round((Math.min(nz(o.planAge), MAX_AGE) - age) * 12); m++) {
    const t = m / 12, a = age + t;
    if (a < start) continue;
    unit += Math.pow(1 + cola, Math.floor(a - start)) / Math.pow(1 + r, t);
  }
  return unit ? lump / unit : NaN;
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const warnings = [];
  if (!nz(o.age)) warnings.push("Enter your age today.");
  if (!nz(o.monthlyPension)) warnings.push("Enter the monthly pension offered.");
  if (!nz(o.lumpSum)) warnings.push("Enter the lump sum offered.");
  if (nz(o.lifeAge) <= nz(o.age)) warnings.push("The 50/50 age should be above your age today.");
  const rows = monthlyRows(o);
  const rate = nz(o.discountRate);
  const lump = nz(o.lumpSum);
  const lumpNet = lump * (1 - Math.min(nz(o.lumpTaxPct), 100) / 100);
  const pvPension = presentValue(rows, rate);
  const irr = impliedReturn(lumpNet, rows);
  const certain = rows.map((x) => ({ ...x, certain: x.pension }));
  const pvCertain = presentValue(certain, rate, "certain");
  const irrCertain = impliedReturn(lumpNet, certain, "certain");

  // The age at which the pension has paid back the lump sum, ignoring and then counting the time value.
  let run = 0, runPv = 0, breakEvenAge = null, breakEvenPvAge = null;
  for (const x of certain) {
    run += x.pension; runPv += x.pension / Math.pow(1 + rate / 100, x.t);
    if (breakEvenAge === null && run >= lumpNet) breakEvenAge = x.age;
    if (breakEvenPvAge === null && runPv >= lumpNet) breakEvenPvAge = x.age;
  }
  const age = nz(o.age), life = nz(o.lifeAge);
  const reach = (a) => (a ? survival(a - age, age, life) : NaN);
  const sustain = sustainableMonthly(lumpNet, o, rate);
  const ages = [0.75, 0.5, 0.25, 0.1].map((p) => ({ p, age: ageAtSurvival(p, age, life) }));
  const lifeAges = [78, 82, 85, 88, 92].filter((l) => l > age);
  const rates = [rate - 2, rate - 1, rate, rate + 1, rate + 2].filter((r) => r > 0);
  const grid = rates.map((r) => ({ rate: r, values: lifeAges.map((l) => presentValue(monthlyRows({ ...o, lifeAge: l }), r)) }));
  return {
    rows, lump, lumpNet, rate, pvPension, pvCertain, gap: lumpNet - pvPension, ratio: pvPension ? lumpNet / pvPension : NaN,
    irr, irrCertain, breakEvenAge, breakEvenPvAge,
    reachBreakEven: reach(breakEvenAge), reachBreakEvenPv: reach(breakEvenPvAge),
    sustain, sustainVsPension: nz(o.monthlyPension) ? sustain / nz(o.monthlyPension) : NaN,
    ages, lifeAges, grid, annualPension: nz(o.monthlyPension) * 12, warnings,
  };
}
