// Core arithmetic for the retirement withdrawal sequencer, tax year 2026 rules
// held constant in real (today's) dollars. No network calls: this applies
// published IRS/SSA rules to the numbers the user supplies. It is NOT tax or
// investment advice -- see the page's "Not modelled" list.
//
// Constants:
//   - 2026 ordinary brackets, standard deduction and the extra 65+ amounts are
//     the ones `roth-conversion-bracket-fill-calculator` verified on 2026-09-29
//     against Rev. Proc. 2025-32 (as tabulated by the Tax Foundation).
//   - 2026 long-term capital gains 0%/15% thresholds ($49,450 / $545,500 single,
//     $98,900 / $613,700 joint) and the RMD Uniform Lifetime divisors are
//     typed from memory of the published tables and are UNVERIFIED against the
//     primary source in the session that wrote this file.
//   - Social Security taxation uses the statutory provisional-income formula
//     ($25,000/$34,000 single, $32,000/$44,000 joint, not indexed).
//
// Everything is in real dollars: the brackets are assumed to keep pace with
// inflation, benefits and spending are held constant, and `realReturn` is the
// return after inflation.

export const TAX_YEAR = 2026;
export const STATUSES = ["single", "mfj"];

export const BRACKETS = {
  single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
  mfj: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
};
export const STANDARD_DEDUCTION = { single: 16100, mfj: 32200 };
export const ADDITIONAL_65 = { single: 2050, mfj: 1650 };
export const PEOPLE = { single: 1, mfj: 2 };
export const LTCG_THRESHOLDS = { single: [49450, 545500], mfj: [98900, 613700] };
export const SS_THRESHOLDS = { single: [25000, 34000], mfj: [32000, 44000] };
export const RATES = [0.10, 0.12, 0.22, 0.24, 0.32, 0.35];

const DIVISORS = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7,
  84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9,
  96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4,
};

export const rmdDivisor = (age) => DIVISORS[Math.min(100, Math.max(72, Math.floor(age)))];

export const num = (v, d = 1) => {
  const n = Math.round(Number(v) * 10 ** d) / 10 ** d;
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });
};
export const money = (n) => {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
};
const pos = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const statusOf = (s) => (BRACKETS[s] ? s : "single");

export function bracketTax(taxable, status) {
  let tax = 0, lower = 0;
  for (const [upper, rate] of BRACKETS[statusOf(status)]) {
    if (taxable <= lower) break;
    tax += (Math.min(taxable, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
}

export function topRate(taxable, status) {
  for (const [upper, rate] of BRACKETS[statusOf(status)]) if (taxable <= upper) return rate;
  return 0.37;
}

// Taxable part of Social Security from the provisional-income formula.
// `otherIncome` is everything in AGI except Social Security.
export function ssTaxable(ss, otherIncome, status) {
  if (ss <= 0) return 0;
  const [b1, b2] = SS_THRESHOLDS[statusOf(status)];
  const pi = otherIncome + ss / 2;
  if (pi <= b1) return 0;
  if (pi <= b2) return Math.min(0.5 * (pi - b1), 0.5 * ss);
  return Math.min(0.85 * (pi - b2) + Math.min(0.5 * (b2 - b1), 0.5 * ss), 0.85 * ss);
}

// One year's tax. `ordinary` = pension + traditional withdrawals + conversions;
// `ltcg` = realised gains from the taxable account.
export function yearTax({ status, age, ordinary, ltcg = 0, ss = 0, stateRate = 0 }) {
  const st = statusOf(status);
  const ded = STANDARD_DEDUCTION[st] + (age >= 65 ? ADDITIONAL_65[st] * PEOPLE[st] : 0);
  const taxableSS = ssTaxable(ss, ordinary + ltcg, st);
  const income = ordinary + taxableSS + ltcg;
  const taxableIncome = Math.max(0, income - ded);
  const ltcgTaxable = Math.min(ltcg, taxableIncome);
  const ordTaxable = taxableIncome - ltcgTaxable;
  const ordTax = bracketTax(ordTaxable, st);
  const [z, f] = LTCG_THRESHOLDS[st];
  const at0 = Math.max(0, Math.min(ltcgTaxable, z - ordTaxable));
  const at15 = Math.max(0, Math.min(ltcgTaxable - at0, f - Math.max(ordTaxable, z)));
  const at20 = Math.max(0, ltcgTaxable - at0 - at15);
  const gainTax = at15 * 0.15 + at20 * 0.20;
  const stateTax = Math.max(0, ordinary + ltcg - ded) * pos(stateRate);
  return { tax: ordTax + gainTax + stateTax, fedTax: ordTax + gainTax, stateTax, taxableSS, taxableIncome, ordTaxable, rate: topRate(ordTaxable, st), deduction: ded };
}

export function normalise(raw = {}) {
  const status = statusOf(raw.status);
  const startAge = Math.min(100, Math.max(40, Math.round(pos(raw.startAge) || 62)));
  const endAge = Math.min(105, Math.max(startAge + 1, Math.round(pos(raw.endAge) || 95)));
  const taxable = pos(raw.taxable);
  return {
    status, startAge, endAge,
    taxable,
    basis: Math.min(taxable, raw.basis === "" || raw.basis == null ? taxable : pos(raw.basis)),
    trad: pos(raw.trad), roth: pos(raw.roth),
    spending: pos(raw.spending),
    ssAnnual: pos(raw.ssAnnual), ssAge: Math.round(pos(raw.ssAge) || 67),
    pension: pos(raw.pension), pensionAge: Math.round(pos(raw.pensionAge) || startAge),
    realReturn: Number.isFinite(Number(raw.realReturn)) && raw.realReturn !== "" ? Number(raw.realReturn) / 100 : 0.04,
    stateRate: pos(raw.stateRate) / 100,
    yieldRate: (raw.yieldPct === "" || raw.yieldPct == null ? 1.5 : pos(raw.yieldPct)) / 100,
    heirRate: Math.min(0.5, pos(raw.heirRate === "" || raw.heirRate == null ? 24 : raw.heirRate) / 100),
    rmdAge: Math.round(pos(raw.rmdAge) || 75),
  };
}

export function validate(inp) {
  const errors = [];
  if (inp.taxable + inp.trad + inp.roth <= 0) errors.push("Enter at least one account balance.");
  if (inp.spending <= 0) errors.push("Enter the yearly spending you want after tax.");
  if (inp.realReturn < -0.2 || inp.realReturn > 0.2) errors.push("Real return should be between -20% and 20%.");
  return errors;
}

// ---- one year, one policy ------------------------------------------------

const clone = (s) => ({ taxable: s.taxable, basis: s.basis, trad: s.trad, roth: s.roth });

// Draw `amount` dollars from `src` in the order given; returns what each
// account gave. The taxable account also reports realised gains.
function allocate(amount, order, s) {
  const out = { taxable: 0, trad: 0, roth: 0 };
  let left = amount;
  const room = { taxable: s.taxable, trad: s.trad, roth: s.roth };
  for (const k of order) {
    const take = Math.min(left, room[k]);
    out[k] = take;
    left -= take;
  }
  out.unmet = left;
  return out;
}

function proRata(amount, s) {
  const total = s.taxable + s.trad + s.roth;
  if (total <= 0) return { taxable: 0, trad: 0, roth: 0, unmet: amount };
  const take = Math.min(amount, total);
  return { taxable: take * s.taxable / total, trad: take * s.trad / total, roth: take * s.roth / total, unmet: amount - take };
}

function bisect(f, lo, hi) {
  // smallest x in [lo, hi] with f(x) >= 0, f nondecreasing; hi if none
  if (f(lo) >= 0) return lo;
  if (f(hi) < 0) return hi;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= 0) hi = mid; else lo = mid;
  }
  return hi;
}

function gainsOf(draw, s) {
  if (draw <= 0 || s.taxable <= 0) return { gain: 0, basisUsed: 0 };
  const frac = Math.min(1, draw / s.taxable);
  const basisUsed = s.basis * frac;
  return { gain: Math.max(0, draw - basisUsed), basisUsed };
}

// Run one year for a policy. Mutates and returns the state, plus a row.
function stepYear(inp, s, age, policy) {
  const ss = age >= inp.ssAge ? inp.ssAnnual : 0;
  const pen = age >= inp.pensionAge ? inp.pension : 0;
  const rmd = age >= inp.rmdAge ? Math.min(s.trad, s.trad / rmdDivisor(age)) : 0;
  const S = inp.spending;
  // dividends and interest the taxable account throws off are taxed every year
  const div = s.taxable * inp.yieldRate;
  const taxFor = (tradOut, convert, taxableDraw) => {
    const g = gainsOf(taxableDraw, s);
    return { ...yearTax({ status: inp.status, age, ordinary: pen + tradOut + convert, ltcg: g.gain + div, ss, stateRate: inp.stateRate }), ...g };
  };

  let draws, convert = 0, t;
  if (policy.kind === "fill") {
    const topOfBracket = BRACKETS[inp.status][RATES.indexOf(policy.ceiling)][0];
    const pastCeiling = (x) => yearTax({ status: inp.status, age, ordinary: pen + x, ss, stateRate: 0 }).taxableIncome - topOfBracket;
    const x = Math.min(s.trad, Math.max(rmd, bisect(pastCeiling, 0, s.trad)));
    const base = taxFor(x, 0, 0);
    const cashFromFixed = ss + pen + div + x - base.tax;
    if (cashFromFixed >= S) {
      convert = policy.convert ? Math.min(x, cashFromFixed - S) : 0;
      draws = { taxable: 0, trad: x - convert, roth: 0, unmet: 0 };
      draws.tradTotal = x;
    } else {
      const net = (extra) => {
        const a = allocate(extra, ["taxable", "roth", "trad"], { ...s, trad: s.trad - x });
        const tt = taxFor(x + a.trad, 0, a.taxable);
        return ss + pen + div + x + a.taxable + a.roth + a.trad - tt.tax - S;
      };
      const extra = bisect(net, 0, s.taxable + s.roth + s.trad - x);
      const a = allocate(extra, ["taxable", "roth", "trad"], { ...s, trad: s.trad - x });
      draws = { taxable: a.taxable, trad: x + a.trad, roth: a.roth, unmet: 0, tradTotal: x + a.trad };
    }
  } else {
    const alloc = (G) => {
      const rest = Math.max(0, G - rmd);
      const sAfter = { ...s, trad: s.trad - rmd };
      const a = policy.kind === "pro" ? proRata(rest, sAfter) : allocate(rest, policy.order, sAfter);
      return { taxable: a.taxable, trad: rmd + a.trad, roth: a.roth, unmet: a.unmet };
    };
    const net = (G) => {
      const a = alloc(G);
      const tt = taxFor(a.trad, 0, a.taxable);
      return ss + pen + div + a.taxable + a.trad + a.roth - tt.tax - S;
    };
    const G = bisect(net, rmd, s.taxable + s.trad + s.roth);
    draws = alloc(G);
    draws.tradTotal = draws.trad;
  }

  const tradOut = draws.tradTotal ?? draws.trad;
  t = taxFor(tradOut - convert, convert, draws.taxable);
  // In the fill policy `tradOut` already includes the converted part.
  const tradWithdrawn = policy.kind === "fill" ? tradOut - convert : tradOut;
  const cash = ss + pen + div + tradWithdrawn + draws.taxable + draws.roth - t.tax;
  let shortfall = Math.max(0, S - cash);
  const surplus = Math.max(0, cash - S);

  s.taxable -= draws.taxable;
  s.basis -= t.basisUsed;
  s.trad -= tradOut;
  s.roth -= draws.roth;
  s.roth += convert;
  if (surplus > 0.005) { s.taxable += surplus; s.basis += surplus; }
  if (s.taxable < 1e-6) { s.taxable = 0; s.basis = 0; }
  s.basis = Math.min(s.basis, s.taxable);

  const row = {
    age, ss, pension: pen, rmd, tradWithdrawn, convert, taxableDraw: draws.taxable, rothDraw: draws.roth,
    gains: t.gain + div, tax: t.tax, rate: t.rate, taxableSS: t.taxableSS, spent: Math.min(S, cash), shortfall,
    reinvested: surplus,
  };
  const g = 1 + inp.realReturn;
  // the yield was paid out above, so the account itself grows by the rest
  s.taxable *= g - inp.yieldRate; s.basis = Math.min(s.basis, s.taxable); s.trad *= g; s.roth *= g;
  row.taxableEnd = s.taxable; row.tradEnd = s.trad; row.rothEnd = s.roth;
  row.afterTaxEnd = afterTax(s, inp.heirRate);
  return row;
}

const afterTax = (s, heirRate) => s.taxable + s.roth + s.trad * (1 - heirRate);

export function simulate(raw, policy) {
  const inp = raw.status && raw.startAge && raw.heirRate !== undefined && raw.rmdAge ? raw : normalise(raw);
  const s = { taxable: inp.taxable, basis: inp.basis, trad: inp.trad, roth: inp.roth };
  const rows = [];
  for (let age = inp.startAge; age <= inp.endAge; age++) rows.push(stepYear(inp, s, age, policy));
  const tax = rows.reduce((a, r) => a + r.tax, 0);
  const shortfall = rows.reduce((a, r) => a + r.shortfall, 0);
  const firstShort = rows.find((r) => r.shortfall > 1);
  return {
    policy, rows, lifetimeTax: tax, shortfall, runsOutAge: firstShort ? firstShort.age : null,
    endAfterTax: afterTax(s, inp.heirRate), end: { ...s },
    converted: rows.reduce((a, r) => a + r.convert, 0),
  };
}

export const POLICIES = [
  { id: "taxable-first", label: "Taxable first, then traditional, then Roth", kind: "order", order: ["taxable", "trad", "roth"] },
  { id: "trad-first", label: "Traditional first, then taxable, then Roth", kind: "order", order: ["trad", "taxable", "roth"] },
  { id: "pro-rata", label: "Pro-rata from every account", kind: "pro" },
  ...RATES.flatMap((c) => [
    { id: `fill-${Math.round(c * 100)}`, label: `Fill the ${Math.round(c * 100)}% bracket from traditional, spend the rest`, kind: "fill", ceiling: c, convert: false },
    { id: `fill-${Math.round(c * 100)}-convert`, label: `Fill the ${Math.round(c * 100)}% bracket, convert the surplus to Roth`, kind: "fill", ceiling: c, convert: true },
  ]),
];

const better = (a, b) => (Math.abs(a.shortfall - b.shortfall) > 1 ? a.shortfall < b.shortfall : a.endAfterTax > b.endAfterTax);

export function compare(raw) {
  const inp = normalise(raw);
  const errors = validate(inp);
  if (errors.length) return { error: errors[0], errors };
  const results = POLICIES.map((p) => simulate(inp, p)).sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  const conventional = results.find((r) => r.policy.id === "taxable-first");
  const best = results[0];
  // stress: same plan, returns two points worse
  const low = normalise({ ...raw, realReturn: inp.realReturn * 100 - 2 });
  const stressBest = simulate(low, best.policy), stressConv = simulate(low, conventional.policy);
  const lowAll = POLICIES.map((p) => simulate(low, p)).sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  const notes = [];
  if (best.policy.id === "taxable-first") notes.push("The conventional order was already the best of the strategies tried for these inputs.");
  if (conventional.runsOutAge) notes.push(`Spending the conventional way, the money runs short at age ${conventional.runsOutAge}.`);
  if (best.runsOutAge) notes.push(`Even the best strategy runs short at age ${best.runsOutAge}: the spending target is more than these balances can carry to age ${inp.endAge}.`);
  if (inp.trad > 0 && inp.startAge < inp.rmdAge && inp.ssAge > inp.startAge) notes.push("There are low-income years before required distributions and Social Security start; that window is where bracket-filling does its work.");
  return {
    inputs: inp, results, best, conventional,
    gain: best.endAfterTax - conventional.endAfterTax,
    taxSaved: conventional.lifetimeTax - best.lifetimeTax,
    stress: { best: stressBest, conventional: stressConv, winner: lowAll[0], returnPct: low.realReturn * 100 },
    notes,
  };
}

export function scheduleCsv(sim) {
  const head = ["age", "social_security", "pension", "required_distribution", "traditional_withdrawn", "converted_to_roth", "taxable_drawn", "roth_drawn", "realised_gains", "tax", "top_bracket", "unfunded_spending", "taxable_end", "traditional_end", "roth_end"];
  const lines = sim.rows.map((r) => [r.age, r.ss, r.pension, r.rmd, r.tradWithdrawn, r.convert, r.taxableDraw, r.rothDraw, r.gains, r.tax, r.rate, r.shortfall, r.taxableEnd, r.tradEnd, r.rothEnd].map((v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)).join(","));
  return [head.join(","), ...lines].join("\n") + "\n";
}

export function sampleInputs() {
  return {
    status: "mfj", startAge: 62, endAge: 95, taxable: 250000, basis: 170000, trad: 1400000, roth: 90000,
    spending: 90000, ssAnnual: 52000, ssAge: 70, pension: 0, pensionAge: 62, realReturn: 4, yieldPct: 1.5, stateRate: 0, heirRate: 24, rmdAge: 75,
  };
}
