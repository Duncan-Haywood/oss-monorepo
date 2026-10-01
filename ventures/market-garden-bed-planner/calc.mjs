// Market-garden bed planner: which crops should fill a limited number of beds?
//
// The decision is a linear program. A grower has a fixed number of bed-feet for
// a season, maybe a labor budget, and a market that will only take so much of
// each crop. Each crop earns a margin per bed-foot but holds the bed for a
// different number of days, so the right ranking is margin per bed-foot-DAY,
// and once labor or demand also bind no single ranking is right. This module
// solves it exactly (bounded simplex, Bland's rule) and reads the shadow prices
// off the final tableau: what one more bed-foot-day, one more labor hour or one
// more unit of demand is worth.
//
// The plan is a capacity plan, not a calendar: it does not know that spinach
// cannot be planted in July. Pure functions, no I/O, no network.

const EPS = 1e-9;

export const money = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const pct = (v, d = 0) => (v * 100).toFixed(d) + "%";
export const num = (v, d = 0) =>
  Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export const DEFAULTS = {
  totalBedFeet: 4000,
  seasonDays: 200,
  laborHours: null,
  yieldSd: 0.15,
  priceSd: 0.15,
  draws: 400,
  seed: 20261001,
};

export const MAX_CROPS = 80;

// ---------------------------------------------------------------- parsing

function toNumber(s) {
  const t = String(s ?? "").replace(/[$,\s]/g, "");
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
}

function splitLine(line, delim) {
  if (delim === "\t") return line.split("\t").map((s) => s.trim());
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// Columns: crop, yield per bed-foot (units), price per unit, days in bed,
// cost per bed-foot, labor hours per 100 bed-feet, max units you can sell this
// season (blank = no cap), minimum bed-feet you are committed to (blank = 0).
export function parseCrops(text) {
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste one row per crop first." };
  const delim = lines.some((l) => l.includes("\t")) ? "\t" : ",";
  const crops = [];
  const warnings = [];
  const seen = new Set();
  let first = true;
  for (const [idx, line] of lines.entries()) {
    const f = splitLine(line, delim);
    if (first) {
      first = false;
      const probe = toNumber(f[1]);
      if (f[1] !== undefined && f[1] !== "" && Number.isNaN(probe)) continue; // header row
    }
    const at = `Row ${idx + 1}`;
    const name = f[0];
    if (!name) return { error: `${at}: the crop name is empty.` };
    if (f.length < 4) return { error: `${at} (${name}): needs at least crop, yield per bed-foot, price per unit and days in bed.` };
    if (seen.has(name.toLowerCase())) return { error: `${at}: "${name}" appears twice. Merge the rows or rename one.` };
    seen.add(name.toLowerCase());
    const yieldPerBf = toNumber(f[1]);
    const price = toNumber(f[2]);
    const days = toNumber(f[3]);
    const cost = f[4] === undefined ? 0 : toNumber(f[4]);
    const labor100 = f[5] === undefined ? 0 : toNumber(f[5]);
    const maxUnits = f[6] === undefined ? null : toNumber(f[6]);
    const minBf = f[7] === undefined ? 0 : toNumber(f[7]);
    const bad = (label, v) => `${at} (${name}): ${label} "${v}" is not a number.`;
    if (!(yieldPerBf > 0)) return { error: yieldPerBf === null || Number.isNaN(yieldPerBf) ? bad("yield", f[1]) : `${at} (${name}): yield per bed-foot must be above zero.` };
    if (price === null || Number.isNaN(price) || price < 0) return { error: `${at} (${name}): price per unit must be zero or more.` };
    if (days === null || Number.isNaN(days) || days < 1) return { error: `${at} (${name}): days in bed must be at least 1.` };
    if (cost === null ? false : Number.isNaN(cost) || cost < 0) return { error: `${at} (${name}): cost per bed-foot must be zero or more.` };
    if (labor100 === null ? false : Number.isNaN(labor100) || labor100 < 0) return { error: `${at} (${name}): labor hours must be zero or more.` };
    if (maxUnits !== null && (Number.isNaN(maxUnits) || maxUnits < 0)) return { error: `${at} (${name}): the sales cap must be blank or zero or more.` };
    if (minBf !== null && (Number.isNaN(minBf) || minBf < 0)) return { error: `${at} (${name}): minimum bed-feet must be blank or zero or more.` };
    crops.push({
      name,
      yieldPerBf,
      price,
      days,
      cost: cost ?? 0,
      laborPerBf: (labor100 ?? 0) / 100,
      maxUnits,
      minBf: minBf ?? 0,
    });
  }
  if (crops.length < 2) return { error: "Add at least two crops; with one there is nothing to choose between." };
  if (crops.length > MAX_CROPS) return { error: `That is ${crops.length} crops; the limit is ${MAX_CROPS}.` };
  if (crops.every((c) => c.cost === 0)) warnings.push("No costs were entered, so profit equals revenue. Seed, transplants, packaging and fees change the ranking; add them if you can.");
  if (crops.every((c) => c.laborPerBf === 0)) warnings.push("No labor hours were entered, so labor cannot limit the plan.");
  return { crops, warnings };
}

// ---------------------------------------------------------------- the LP

// maximise c.x subject to A x <= b, x >= 0, with b >= 0.
// Tableau simplex with Bland's rule (no cycling). Returns the primal solution,
// the objective, the dual price of every row and the reduced cost of every
// column, all read off the final objective row.
export function simplex(c, A, b) {
  const m = A.length;
  const n = c.length;
  const W = n + m + 1;
  const T = A.map((row, i) => {
    const r = new Array(W).fill(0);
    row.forEach((v, j) => { r[j] = v; });
    r[n + i] = 1;
    r[W - 1] = b[i];
    return r;
  });
  const z = new Array(W).fill(0);
  c.forEach((v, j) => { z[j] = -v; });
  const basis = Array.from({ length: m }, (_, i) => n + i);
  for (let iter = 0; iter < 20000; iter++) {
    let e = -1;
    for (let j = 0; j < n + m; j++) if (z[j] < -EPS) { e = j; break; }
    if (e < 0) break;
    let r = -1;
    let best = Infinity;
    for (let i = 0; i < m; i++) {
      if (T[i][e] > EPS) {
        const ratio = T[i][W - 1] / T[i][e];
        if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[i] < basis[r])) { best = ratio; r = i; }
      }
    }
    if (r < 0) return { unbounded: true };
    const p = T[r][e];
    for (let j = 0; j < W; j++) T[r][j] /= p;
    for (let i = 0; i < m; i++) {
      if (i === r) continue;
      const f = T[i][e];
      if (Math.abs(f) > 0) for (let j = 0; j < W; j++) T[i][j] -= f * T[r][j];
    }
    const fz = z[e];
    for (let j = 0; j < W; j++) z[j] -= fz * T[r][j];
    basis[r] = e;
  }
  const x = new Array(n + m).fill(0);
  basis.forEach((bj, i) => { x[bj] = Math.max(0, T[i][W - 1]); });
  return {
    x: x.slice(0, n),
    objective: z[W - 1],
    duals: z.slice(n, n + m).map((v) => Math.max(0, v)),
    reduced: z.slice(0, n).map((v) => Math.max(0, v)),
  };
}

const marginPerBf = (c) => c.yieldPerBf * c.price - c.cost;
const capBfOf = (c) => (c.maxUnits === null ? Infinity : c.maxUnits / c.yieldPerBf);

function laborUsed(laborHrs, crops) {
  return laborHrs !== null && laborHrs !== undefined && crops.some((c) => c.laborPerBf > 0);
}

// Optimal bed-feet per crop under the land (bed-foot-days), labor and demand
// limits, with every crop's committed minimum honoured first.
export function solvePlan(crops, landBfd, laborHrs = null) {
  const n = crops.length;
  const useLabor = laborUsed(laborHrs, crops);
  const caps = crops.map(capBfOf);
  for (let i = 0; i < n; i++) {
    if (crops[i].minBf > caps[i] + 1e-9) {
      return { error: `${crops[i].name}: the minimum of ${num(crops[i].minBf)} bed-feet needs more than the ${num(crops[i].maxUnits)} units you said you can sell.` };
    }
  }
  const landMin = crops.reduce((s, c) => s + c.minBf * c.days, 0);
  const laborMin = crops.reduce((s, c) => s + c.minBf * c.laborPerBf, 0);
  if (landMin > landBfd + EPS) return { error: `The minimum bed-feet you committed to already need ${num(landMin)} bed-foot-days; you have ${num(landBfd)}.` };
  if (useLabor && laborMin > laborHrs + EPS) return { error: `The minimum bed-feet you committed to already need ${num(laborMin, 0)} labor hours; you have ${num(laborHrs)}.` };

  const A = [];
  const b = [];
  const tags = [];
  A.push(crops.map((c) => c.days)); b.push(landBfd - landMin); tags.push({ type: "land" });
  if (useLabor) { A.push(crops.map((c) => c.laborPerBf)); b.push(laborHrs - laborMin); tags.push({ type: "labor" }); }
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(caps[i])) {
      A.push(crops.map((_, j) => (j === i ? 1 : 0)));
      b.push(Math.max(0, caps[i] - crops[i].minBf));
      tags.push({ type: "cap", crop: i });
    }
  }
  const res = simplex(crops.map(marginPerBf), A, b);
  if (res.unbounded) return { error: "The plan is unbounded; check that every crop has days in bed above zero." };

  const bf = res.x.map((v, i) => crops[i].minBf + v);
  const duals = { land: 0, labor: 0, cap: new Array(n).fill(0) };
  tags.forEach((t, i) => {
    if (t.type === "land") duals.land = res.duals[i];
    else if (t.type === "labor") duals.labor = res.duals[i];
    else duals.cap[t.crop] = res.duals[i];
  });
  return { bf, duals, reduced: res.reduced, useLabor, caps };
}

// What a spreadsheet sorted by profit per bed-foot would plant under the same
// limits: fill in that order until land, labor or a demand cap stops it.
export function greedyPlan(crops, landBfd, laborHrs = null) {
  const useLabor = laborUsed(laborHrs, crops);
  const caps = crops.map(capBfOf);
  const bf = crops.map((c) => c.minBf);
  let land = landBfd - crops.reduce((s, c) => s + c.minBf * c.days, 0);
  let labor = useLabor ? laborHrs - crops.reduce((s, c) => s + c.minBf * c.laborPerBf, 0) : Infinity;
  const order = crops.map((_, i) => i).sort((a, b) => marginPerBf(crops[b]) - marginPerBf(crops[a]) || crops[a].name.localeCompare(crops[b].name));
  for (const i of order) {
    const c = crops[i];
    if (marginPerBf(c) <= 0) continue;
    const room = caps[i] - bf[i];
    if (room <= 0) continue;
    const x = Math.min(room, land / c.days, c.laborPerBf > 0 ? labor / c.laborPerBf : Infinity);
    if (x <= 0) continue;
    bf[i] += x;
    land -= x * c.days;
    if (useLabor) labor -= x * c.laborPerBf;
  }
  return bf;
}

// Profit of a fixed plan, optionally under different yields and prices. Sales
// stop at the demand cap, so a bumper crop beyond it is not sold.
export function planProfit(crops, bf, yieldScale = null, priceScale = null) {
  let total = 0;
  crops.forEach((c, i) => {
    const units = bf[i] * c.yieldPerBf * (yieldScale ? yieldScale[i] : 1);
    const sold = c.maxUnits === null ? units : Math.min(units, c.maxUnits);
    total += sold * c.price * (priceScale ? priceScale[i] : 1) - bf[i] * c.cost;
  });
  return total;
}

// ------------------------------------------------------------- simulation

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand) {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

export function percentile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Half of each crop's swing is shared by every crop (a wet year hurts all of
// them), half is its own. Independent shocks alone would make the plan look
// safer than it is.
function simulate(crops, plans, farm) {
  const rand = rng(farm.seed);
  const n = crops.length;
  const share = Math.SQRT1_2;
  const out = plans.map(() => []);
  for (let d = 0; d < farm.draws; d++) {
    const cy = normal(rand);
    const cp = normal(rand);
    const ys = [];
    const ps = [];
    for (let i = 0; i < n; i++) {
      ys.push(Math.max(0.2, 1 + farm.yieldSd * (share * cy + share * normal(rand))));
      ps.push(Math.max(0.2, 1 + farm.priceSd * (share * cp + share * normal(rand))));
    }
    plans.forEach((bf, k) => out[k].push(planProfit(crops, bf, ys, ps)));
  }
  return out;
}

// --------------------------------------------------------------- analysis

export function analyze(crops, options = {}) {
  const farm = { ...DEFAULTS, ...options };
  if (!(farm.totalBedFeet > 0)) return { error: "Total bed-feet must be above zero." };
  if (!(farm.seasonDays >= 1 && farm.seasonDays <= 366)) return { error: "Season length must be between 1 and 366 days." };
  if (farm.laborHours !== null && !(farm.laborHours >= 0)) return { error: "Labor hours must be blank or zero or more." };
  const landBfd = farm.totalBedFeet * farm.seasonDays;
  const laborHrs = farm.laborHours;
  const warnings = [];

  const solved = solvePlan(crops, landBfd, laborHrs);
  if (solved.error) return { error: solved.error };
  const { bf, duals, reduced, useLabor, caps } = solved;
  const naiveBf = greedyPlan(crops, landBfd, laborHrs);

  const rows = crops.map((c, i) => {
    const units = bf[i] * c.yieldPerBf;
    const revenue = units * c.price;
    const cost = bf[i] * c.cost;
    const planted = bf[i] > 1e-6;
    const atCap = Number.isFinite(caps[i]) && bf[i] >= caps[i] - 1e-6;
    return {
      crop: c.name,
      bedFeet: planted ? bf[i] : 0,
      units: planted ? units : 0,
      revenue: planted ? revenue : 0,
      cost: planted ? cost : 0,
      profit: planted ? revenue - cost : 0,
      bedFootDays: planted ? bf[i] * c.days : 0,
      laborHours: planted ? bf[i] * c.laborPerBf : 0,
      marginPerBf: marginPerBf(c),
      marginPerBfDay: marginPerBf(c) / c.days,
      atCap,
      naiveBedFeet: naiveBf[i],
      // Price rise per unit that would bring a crop left out into the plan.
      entryPriceRise: planted ? null : reduced[i] / c.yieldPerBf,
      capValuePer100Units: atCap ? (duals.cap[i] / c.yieldPerBf) * 100 : null,
      capped: Number.isFinite(caps[i]),
    };
  });

  const profit = rows.reduce((s, r) => s + r.profit, 0);
  const naiveProfit = planProfit(crops, naiveBf);
  const landUsed = rows.reduce((s, r) => s + r.bedFootDays, 0);
  const laborUsedHrs = rows.reduce((s, r) => s + r.laborHours, 0);
  const planted = rows.filter((r) => r.bedFeet > 0).length;

  const landBinds = duals.land > 1e-9;
  const laborBinds = useLabor && duals.labor > 1e-9;
  const positive = crops.filter((c) => marginPerBf(c) > 0);
  const demandBinds = !landBinds && !laborBinds && positive.length > 0 && positive.every((c) => Number.isFinite(capBfOf(c)));
  let binding;
  let insight;
  if (landBinds && laborBinds) {
    binding = "land and labor";
    insight = `Both bed space and labor limit the plan. One more bed-foot over the season is worth about ${money(duals.land * farm.seasonDays)} and one more labor hour about ${money(duals.labor)}.`;
  } else if (landBinds) {
    binding = "land";
    insight = `Bed space is the limit. One more bed-foot over the season is worth about ${money(duals.land * farm.seasonDays)}.`;
  } else if (laborBinds) {
    binding = "labor";
    insight = `Labor is the limit, not beds. One more labor hour is worth about ${money(duals.labor)}, so pay for help up to that rate before you add beds.`;
  } else if (demandBinds) {
    binding = "demand";
    insight = "Demand is the limit: every worthwhile crop is already at the amount you said you can sell. More beds or labor add nothing until you find more buyers.";
  } else {
    binding = "none";
    insight = "Nothing is fully used up. Check that your caps and totals are what you meant.";
  }

  // What more land or labor would add, by re-solving rather than extrapolating.
  const more = { land10: null, labor10: null };
  const withLand = solvePlan(crops, landBfd * 1.1, laborHrs);
  if (!withLand.error) more.land10 = planProfit(crops, withLand.bf) - profit;
  if (useLabor) {
    const withLabor = solvePlan(crops, landBfd, laborHrs * 1.1);
    if (!withLabor.error) more.labor10 = planProfit(crops, withLabor.bf) - profit;
  }

  const [lpSim, naiveSim] = simulate(crops, [bf, naiveBf], farm);
  const sortedLp = [...lpSim].sort((a, b) => a - b);
  const range = { p10: percentile(sortedLp, 0.1), p50: percentile(sortedLp, 0.5), p90: percentile(sortedLp, 0.9) };
  const beats = lpSim.reduce((s, v, i) => s + (v >= naiveSim[i] - 1e-9 ? 1 : 0), 0) / lpSim.length;
  const lossRisk = lpSim.filter((v) => v < 0).length / lpSim.length;

  if (crops.some((c) => c.days > farm.seasonDays)) warnings.push("At least one crop stays in the bed longer than your season. It is still counted at its full length.");
  if (planted <= 2) warnings.push("The plan puts nearly everything into one or two crops. That is the arithmetic of your inputs; check whether you would actually sell that much, and whether the caps reflect your real buyers.");
  if (profit - naiveProfit < 1e-6 && crops.length > 2) warnings.push("Sorting by profit per bed-foot gives the same plan as the optimizer here, because the limit that binds does not change the order. The optimizer earns its place when bed time, labor or demand differ a lot between crops.");

  return {
    farm,
    rows,
    profit,
    naiveProfit,
    gain: profit - naiveProfit,
    landBfd,
    landUsed,
    laborHrs,
    laborUsedHrs: useLabor ? laborUsedHrs : null,
    bedFeetUsed: rows.reduce((s, r) => s + r.bedFeet, 0),
    planted,
    duals: { landPerBedFoot: duals.land * farm.seasonDays, landPerBfd: duals.land, laborPerHour: duals.labor },
    binding,
    insight,
    more,
    range,
    beatsNaive: beats,
    lossRisk,
    warnings,
  };
}

export function reportCsv(result) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const head = ["crop", "bed_feet", "units", "revenue", "cost", "profit", "labor_hours", "bed_foot_days", "profit_per_bed_foot_day", "at_sales_cap", "bed_feet_if_sorted_by_profit_per_bed_foot"];
  const lines = [head.join(",")];
  for (const r of result.rows) {
    lines.push([r.crop, r.bedFeet.toFixed(1), r.units.toFixed(1), r.revenue.toFixed(2), r.cost.toFixed(2), r.profit.toFixed(2), r.laborHours.toFixed(1), r.bedFootDays.toFixed(0), r.marginPerBfDay.toFixed(3), r.atCap ? "yes" : "no", r.naiveBedFeet.toFixed(1)].map(esc).join(","));
  }
  return lines.join("\n") + "\n";
}

// Invented numbers for a one-acre-ish diversified market garden. Not real data.
export function sampleText() {
  return [
    "crop,yield per bed-foot,price per unit,days in bed,cost per bed-foot,labor hours per 100 bed-feet,max units to sell,minimum bed-feet",
    "Salad mix (lb),0.9,10,40,0.35,7,1200,",
    "Radish (bunch),1.2,2.5,30,0.15,5,1500,",
    "Spinach (lb),0.6,7,55,0.2,6,900,",
    "Kale (bunch),1.3,3,70,0.2,5,2000,",
    "Carrots (bunch),1.5,3,80,0.2,4,2500,",
    "Beets (bunch),1.3,3.5,75,0.2,4,1500,",
    "Zucchini (lb),3,2.2,75,0.15,8,3000,",
    "Cucumber (lb),2.2,2.8,70,0.25,9,2500,",
    "Slicing tomato (lb),3.5,3.5,120,0.9,9,6000,",
    "Pepper (lb),1.8,4,110,0.5,8,2500,",
    "Winter squash (lb),2,1.8,110,0.2,2,4000,",
    "Cut flowers (stem),20,0.75,90,0.6,14,12000,150",
    "Sweet corn (ear),0.7,0.6,85,0.1,3,3000,",
    "Garlic (lb),0.8,12,240,0.9,3,600,",
  ].join("\n");
}
