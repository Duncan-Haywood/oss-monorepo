// Manufactured-home community (mobile home park) valuation and lot-rent increase planner. Pure
// functions, no dependencies, nothing leaves the browser. Everything is arithmetic on figures the
// user types from a seller's T-12 / rent roll or their own park.
//
// Model, all annual:
//   rent income   = occupied lots x lot rent x 12
//   other income  = typed monthly total x 12 (utility reimbursement, late fees, park-owned home rent...)
//   EGI           = rent income + other income
//   expenses      = typed fixed lines + management % of EGI + reserves per lot x total lots
//   NOI           = EGI - expenses
//   value         = NOI / cap rate;   implied cap = NOI / asking price
// Rent increase: new rent = rent + increase, occupied lots fall by the move-outs the user expects.
// Break-even move-outs = the most lots that can leave before NOI falls below today's NOI.

export const DEFAULTS = {
  lots: 60,
  occupied: 51,
  lotRent: 450,
  otherIncome: 1800,
  expenses: "Property tax, 22000\nInsurance, 9000\nWater and sewer, 38000\nTrash, 6500\nRepairs and maintenance, 14000\nPayroll and contract labor, 12000",
  mgmtPct: 8,
  reservePerLot: 150,
  capRate: 8.5,
  askingPrice: 1400000,
  rentIncrease: 40,
  moveOuts: 2,
  ltv: 70,
  rate: 7,
  amortYears: 25,
};

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}
const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);

export function money(x) {
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}
export function pct(x, d = 1) {
  return Number.isFinite(x) ? (x * 100).toFixed(d) + "%" : "n/a";
}

// "label, annual dollars" per line; the last comma separates the amount so labels may contain commas.
export function parseExpenses(text) {
  const items = [];
  const skipped = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.lastIndexOf(",");
    const label = i > 0 ? line.slice(0, i).trim() : "";
    const amount = i > 0 ? num(line.slice(i + 1)) : NaN;
    if (!label || !Number.isFinite(amount) || amount < 0) skipped.push(line);
    else items.push({ label, amount });
  }
  return { items, skipped };
}

// Net operating income for a given occupancy and rent. Management scales with EGI; the fixed lines
// and reserves do not move with occupancy (a conservative simplification the page states).
export function noiFor(o, occupied, lotRent, fixedExpenses) {
  const rentIncome = occupied * lotRent * 12;
  const egi = rentIncome + nz(o.otherIncome) * 12;
  const mgmt = egi * (nz(o.mgmtPct) / 100);
  const reserves = nz(o.reservePerLot) * nz(o.lots);
  const expenses = fixedExpenses + mgmt + reserves;
  return { rentIncome, egi, mgmt, reserves, expenses, noi: egi - expenses };
}

export function monthlyPayment(principal, annualRatePct, years) {
  const n = Math.round(nz(years) * 12);
  if (!(principal > 0) || n <= 0) return 0;
  const r = nz(annualRatePct) / 100 / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const lots = Math.floor(nz(o.lots));
  const occupied = Math.min(Math.floor(nz(o.occupied)), lots);
  const { items, skipped } = parseExpenses(o.expenses);
  const fixed = items.reduce((s, e) => s + e.amount, 0);
  const cap = nz(o.capRate) / 100;
  const warnings = [];
  if (!lots) warnings.push("Enter the total number of lots.");
  if (num(o.occupied) > lots && lots) warnings.push("Occupied lots exceed total lots; capped at total lots.");
  if (!cap) warnings.push("Enter a cap rate above 0 to value the park.");

  const base = noiFor(o, occupied, nz(o.lotRent), fixed);
  const value = cap ? base.noi / cap : NaN;
  const asking = nz(o.askingPrice);
  const impliedCap = asking ? base.noi / asking : NaN;

  const loan = asking * (nz(o.ltv) / 100);
  const debtService = monthlyPayment(loan, o.rate, o.amortYears) * 12;
  const dscr = debtService ? base.noi / debtService : NaN;
  const equity = asking - loan;
  const cashOnCash = equity ? (base.noi - debtService) / equity : NaN;

  // Rent increase scenario.
  const inc = nz(o.rentIncrease);
  const out = Math.min(Math.floor(nz(o.moveOuts)), occupied);
  const after = noiFor(o, occupied - out, nz(o.lotRent) + inc, fixed);
  const valueAfter = cap ? after.noi / cap : NaN;
  let breakEvenMoveOuts = 0;
  for (let k = 1; k <= occupied; k++) {
    if (noiFor(o, occupied - k, nz(o.lotRent) + inc, fixed).noi >= base.noi) breakEvenMoveOuts = k;
    else break;
  }

  // Value grid: rent increase across, cap rate down. Move-outs held at the typed number.
  const increases = [0, 25, 50, 75, 100];
  const caps = [-1, -0.5, 0, 0.5, 1].map((d) => (nz(o.capRate) + d) / 100).filter((c) => c > 0);
  const grid = caps.map((c) => ({
    cap: c,
    values: increases.map((i) => noiFor(o, occupied - (i ? out : 0), nz(o.lotRent) + i, fixed).noi / c),
  }));

  // Upside if every vacant lot were filled at today's rent.
  const full = noiFor(o, lots, nz(o.lotRent), fixed);

  return {
    lots, occupied, occupancy: lots ? occupied / lots : NaN, items, skipped, fixed, base, value, asking, impliedCap,
    pricePerLot: lots && asking ? asking / lots : NaN, valuePerLot: lots && cap ? value / lots : NaN,
    expenseRatio: base.egi ? base.expenses / base.egi : NaN,
    loan, debtService, dscr, equity, cashOnCash,
    increase: { inc, moveOuts: out, after, valueAfter, valueCreated: valueAfter - value, breakEvenMoveOuts,
      noiChange: after.noi - base.noi },
    increases, grid, full: { noi: full.noi, value: cap ? full.noi / cap : NaN }, warnings,
  };
}
