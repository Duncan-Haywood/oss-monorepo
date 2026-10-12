// Does a state pass-through entity tax (PTET) election save federal tax, and how much?
// Pure functions, no dependencies, nothing leaves the browser. Every default is a placeholder,
// not a rate card: replace each with your state's PTET rate, your return and your CPA's figures.
//
// Model: one flat federal marginal rate applied to the *change* in taxable income. The election
// moves a state tax from a personal itemized deduction (capped) to an entity-level deduction
// (uncapped), which also lowers AGI, which raises the cap, and shrinks the 20% pass-through
// deduction base. Those three effects plus the state credit are the whole difference.

export const DEFAULTS = {
  pteIncome: 400000,
  otherIncome: 100000,
  pteRatePct: 6,
  personalRatePct: 6,
  creditPct: 100,
  otherSalt: 12000,
  otherItemized: 25000,
  standardDeduction: 32200,
  fedRatePct: 35,
  qbiRatePct: 20,
  saltCap: 40400,
  phaseoutThreshold: 505000,
  phaseoutRatePct: 30,
  capFloor: 10000,
};

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}

const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);
const pc = (x) => nz(x) / 100;

export function money(x) {
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}

// Effective SALT cap at a given MAGI: base cap reduced by phaseoutRate x (MAGI - threshold),
// never below the floor (and never above the base cap if the floor is typed higher).
export function effectiveCap(o, magi) {
  const base = nz(o.saltCap);
  const floor = Math.min(nz(o.capFloor), base);
  return Math.max(floor, base - pc(o.phaseoutRatePct) * nz(magi - nz(o.phaseoutThreshold)));
}

// One year's federal-plus-state tax on the pass-through income, with or without the election.
// Only differences between the two scenarios mean anything; the level is relative.
export function scenario(o, elect) {
  const income = nz(o.pteIncome);
  const pteTax = elect ? income * pc(o.pteRatePct) : 0;
  const credit = pteTax * pc(Math.min(100, nz(o.creditPct)));
  const personalState = Math.max(0, income * pc(o.personalRatePct) - credit);
  const wastedCredit = Math.max(0, credit - income * pc(o.personalRatePct));
  const magi = nz(o.otherIncome) + income - pteTax;
  const cap = effectiveCap(o, magi);
  const salt = nz(o.otherSalt) + personalState;
  const saltDeducted = Math.min(salt, cap);
  const itemized = nz(o.otherItemized) + saltDeducted;
  const deduction = Math.max(nz(o.standardDeduction), itemized);
  const qbi = pc(o.qbiRatePct) * (income - pteTax);
  const taxable = Math.max(0, magi - deduction - qbi);
  const federal = pc(o.fedRatePct) * taxable;
  const state = pteTax + personalState;
  return { pteTax, credit, wastedCredit, personalState, magi, cap, salt, saltDeducted, saltStuck: Math.max(0, salt - cap), itemized, deduction, qbi, taxable, federal, state, total: federal + state };
}

// Election vs none, with the federal change split into the effects that cause it.
export function compare(o) {
  const no = scenario(o, false), yes = scenario(o, true);
  const m = pc(o.fedRatePct);
  const savings = no.total - yes.total;
  return {
    no, yes, savings,
    federalSavings: no.federal - yes.federal,
    stateChange: yes.state - no.state,
    // Federal tax effect of each moving part, at the flat rate (they sum to federalSavings
    // except where the standard deduction or the zero floor on taxable income bites).
    parts: {
      deductionChange: m * (yes.deduction - no.deduction),
      agiDrop: m * (no.magi - yes.magi),
      qbiLoss: -m * (no.qbi - yes.qbi),
    },
    helps: savings > 0.5,
  };
}

// Smallest pass-through income (searched on a grid) at which the election first pays,
// holding everything else fixed. Null if it never does up to the search ceiling.
export function firstPayingIncome(o, ceiling = 5000000, steps = 1000) {
  for (let i = 1; i <= steps; i++) {
    const income = (ceiling * i) / steps;
    if (compare({ ...o, pteIncome: income }).savings > 0.5) return income;
  }
  return null;
}

// Savings by pass-through income (rows) and federal marginal rate (columns).
export function sensitivity(o) {
  const mults = [0.25, 0.5, 1, 2, 4];
  const rates = [24, 32, 35, 37];
  return mults.map((k) => ({
    income: nz(o.pteIncome) * k,
    cells: rates.map((r) => ({ rate: r, savings: compare({ ...o, pteIncome: nz(o.pteIncome) * k, fedRatePct: r }).savings })),
  }));
}
