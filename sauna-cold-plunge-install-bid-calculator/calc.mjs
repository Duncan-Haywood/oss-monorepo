// Sauna and cold-plunge install bid pricing. Pure functions, no dependencies, nothing leaves the browser.
// Every default is a placeholder, not a market rate: check each against your own books.

export const DEFAULTS = {
  buildHours: 14,
  prepHours: 4,
  milesOneWay: 25,
  mph: 40,
  costPerMile: 0.9,
  laborRate: 48,
  helperHours: 14,
  helperRate: 28,
  toolsPerHour: 8,
  consumablesPerBuildHour: 5,
  materials: 4200,
  subcontract: 900,
  materialsMarkupPct: 25,
  fixedMonthly: 3500,
  billableHoursPerMonth: 120,
  targetMarginPct: 20,
  cardFeePct: 3,
  minCallout: 1500,
  overrunPct: 20,
  jobsPerMonth: 3,
  quotedPrice: 0,
};

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}

const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);
const r2 = (x) => Math.round(x * 100) / 100;

export function money(x) {
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}
export function money2(x) {
  const n = Math.round(x * 100) / 100;
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Cost of one job at its own hours. `overrun` stretches the hours spent on site only
// (build, prep and helper time); the drive does not get longer.
export function jobCost(o, overrun = 0) {
  const stretch = 1 + nz(overrun) / 100;
  const build = nz(o.buildHours) * stretch;
  const setup = nz(o.prepHours) * stretch;
  const onSite = build + setup;
  const travelHours = nz(o.mph) > 0 ? (2 * nz(o.milesOneWay)) / nz(o.mph) : 0;
  const totalHours = onSite + travelHours;
  const labor = totalHours * nz(o.laborRate);
  const helper = nz(o.helperHours) * stretch * nz(o.helperRate);
  const rig = onSite * nz(o.toolsPerHour);
  const consumables = build * nz(o.consumablesPerBuildHour);
  const travel = 2 * nz(o.milesOneWay) * nz(o.costPerMile);
  const materials = nz(o.materials) + nz(o.subcontract);
  const overheadPerHour = nz(o.billableHoursPerMonth) > 0 ? nz(o.fixedMonthly) / nz(o.billableHoursPerMonth) : 0;
  const overhead = totalHours * overheadPerHour;
  const variable = labor + helper + rig + consumables + travel + materials;
  return {
    onSite, travelHours, totalHours, labor, helper, rig, consumables, travel, materials,
    overheadPerHour, overhead, variable, total: variable + overhead,
  };
}

// Price that earns the target margin after card fees. Materials are charged at cost plus
// the markup; everything else must carry the margin. The reported margin is recomputed
// from the final price, so a minimum call-out that binds shows its real margin.
export function price(o, overrun = 0) {
  const c = jobCost(o, overrun);
  const fee = nz(o.cardFeePct) / 100;
  const margin = nz(o.targetMarginPct) / 100;
  const room = 1 - fee - margin;
  if (room <= 0.01) return { ...c, price: NaN, valid: false, minBinds: false, profit: NaN, margin: NaN, perHour: NaN, travelShare: NaN };
  const exMaterials = c.total - c.materials;
  const calc = exMaterials / room + (c.materials * (1 + nz(o.materialsMarkupPct) / 100)) / (1 - fee);
  const minBinds = nz(o.minCallout) > calc;
  const p = Math.max(calc, nz(o.minCallout));
  return { ...c, ...outcome(o, c, p), price: p, calc, valid: true, minBinds };
}

// What a given price leaves you: profit after fees and all costs, margin, and money per hour.
export function outcome(o, c, p) {
  const fees = p * (nz(o.cardFeePct) / 100);
  const profit = p - fees - c.total;
  const travelCost = c.travel + c.travelHours * (nz(o.laborRate) + c.overheadPerHour);
  return {
    fees, profit, margin: p > 0 ? profit / p : NaN,
    perHour: c.totalHours > 0 ? (p - fees - c.variable + c.labor) / c.totalHours : NaN,
    travelShare: p > 0 ? travelCost / p : NaN,
  };
}

// A price someone offered you (or you were about to quote) judged against this job's costs.
export function checkPrice(o, offered, overrun = 0) {
  const c = jobCost(o, overrun);
  const p = nz(offered);
  if (!(p > 0)) return null;
  const out = outcome(o, c, p);
  const wanted = price(o, overrun);
  return { ...out, price: p, gapToTarget: wanted.valid ? p - wanted.price : NaN };
}

// Price held fixed while the job runs long: what happens to profit and margin.
export function overrunImpact(o, overrunPct) {
  const quoted = price(o, 0);
  if (!quoted.valid) return null;
  const c = jobCost(o, overrunPct);
  const out = outcome(o, c, quoted.price);
  return { overrunPct: nz(overrunPct), price: quoted.price, ...out, extraCost: c.total - quoted.total, lostProfit: quoted.profit - out.profit };
}

// Price as the job moves further from the shop.
export function distanceLadder(o, miles = [0, 10, 20, 40, 60, 80]) {
  return miles.map((m) => {
    const q = price({ ...o, milesOneWay: m }, 0);
    return { miles: m, price: q.price, travelShare: q.travelShare, travelHours: q.travelHours };
  });
}

// Monthly view: jobs at this price against fixed costs, and the jobs needed to break even.
export function monthly(o, overrun = 0) {
  const q = price(o, overrun);
  if (!q.valid) return null;
  const jobs = nz(o.jobsPerMonth);
  const contribution = q.price - q.fees - q.variable;
  const fixed = nz(o.fixedMonthly);
  const hours = jobs * q.totalHours;
  return {
    jobs, contribution, fixed,
    breakEvenJobs: contribution > 0 ? fixed / contribution : null,
    profit: jobs * contribution - fixed,
    revenue: jobs * q.price,
    hours,
    overCapacity: nz(o.billableHoursPerMonth) > 0 && hours > nz(o.billableHoursPerMonth),
  };
}

// The no-profit floor: covers every cost and the card fee, including overhead, and earns nothing.
export function lowestSafePrice(o) {
  const q = price({ ...o, targetMarginPct: 0 }, 0);
  return q.valid ? Math.max(q.calc, 0) : NaN;
}

export const round2 = r2;
