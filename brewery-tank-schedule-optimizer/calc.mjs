// Brewery tank schedule optimizer. Pure functions, no DOM, no network.
// Given fermenters, bright tanks and a list of beers (batch size, fermenting days, conditioning days, margin per barrel),
// it plans which beer to brew on which brew day into which tanks over a horizon of weeks so that the most margin is
// finished by the end. A batch holds a fermenter for its fermenting days plus a cleaning turnaround, then (if it
// conditions) a bright tank for its conditioning days plus a turnaround. Search: a priority order of batches is decoded
// by "earliest feasible start, smallest tank that fits", and the order is improved by seeded local search. An upper
// bound from three relaxations (fermenter days, bright-tank days, brew slots) shows how far the plan can be from best.

export const MAX_BEERS = 8;
export const MAX_TANKS = 12;
export const SHARED_DEFAULTS = { fermenters: "", brites: "", weeks: 12, brewDaysPerWeek: 3, brewsPerBrewDay: 1, turnaroundDays: 1 };
export const BEER_DEFAULTS = { name: "", batchBbl: 0, fermentDays: 0, conditionDays: 0, marginPerBbl: 0, minBatches: 0, maxBatches: 0 };

// Placeholder example figures, not any brewery's recipes, tanks or margins.
export const EXAMPLE_SHARED = { fermenters: "30 30 15 15", brites: "30 15", weeks: 12, brewDaysPerWeek: 3, brewsPerBrewDay: 1, turnaroundDays: 1 };
export const EXAMPLE_BEERS = [
  { name: "Pale ale", batchBbl: 15, fermentDays: 12, conditionDays: 4, marginPerBbl: 165, minBatches: 4, maxBatches: 0 },
  { name: "IPA", batchBbl: 15, fermentDays: 14, conditionDays: 5, marginPerBbl: 215, minBatches: 0, maxBatches: 0 },
  { name: "Lager", batchBbl: 30, fermentDays: 21, conditionDays: 14, marginPerBbl: 120, minBatches: 2, maxBatches: 0 },
  { name: "Stout", batchBbl: 15, fermentDays: 14, conditionDays: 7, marginPerBbl: 190, minBatches: 1, maxBatches: 3 },
  { name: "Seasonal sour", batchBbl: 15, fermentDays: 28, conditionDays: 0, marginPerBbl: 260, minBatches: 0, maxBatches: 1 },
];

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const dayLabel = (d) => `Wk ${Math.floor(d / 7) + 1} ${DAY_NAMES[d % 7]}`;

export function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");

// "30 30, 15" -> [30, 30, 15]. Junk tokens and non-positive sizes are skipped.
export function parseTanks(text) {
  const out = [];
  String(text ?? "").split(/[\s,;]+/).forEach((tok) => {
    const n = Number.parseFloat(tok);
    if (Number.isFinite(n) && n > 0 && out.length < MAX_TANKS) out.push(n);
  });
  return out;
}

export function cleanShared(s = {}) {
  const d = SHARED_DEFAULTS;
  const int = (v, lo, hi, fb) => Math.min(hi, Math.max(lo, Math.round(num(v, fb))));
  return {
    fermenters: parseTanks(s.fermenters),
    brites: parseTanks(s.brites),
    weeks: int(s.weeks, 1, 26, d.weeks),
    brewDaysPerWeek: int(s.brewDaysPerWeek, 1, 7, d.brewDaysPerWeek),
    brewsPerBrewDay: int(s.brewsPerBrewDay, 1, 4, d.brewsPerBrewDay),
    turnaroundDays: int(s.turnaroundDays, 0, 7, d.turnaroundDays),
  };
}

// Keeps a beer that has a size, at least one fermenting day and a positive margin. Fractions of a day round up.
export function cleanBeers(list = []) {
  const out = [];
  list.slice(0, MAX_BEERS).forEach((b, i) => {
    const batchBbl = num(b.batchBbl), fermentDays = Math.ceil(num(b.fermentDays)), marginPerBbl = num(b.marginPerBbl);
    if (batchBbl <= 0 || fermentDays < 1 || marginPerBbl <= 0) return;
    out.push({
      idx: out.length,
      name: String(b.name ?? "").trim() || `Beer ${i + 1}`,
      batchBbl,
      fermentDays,
      conditionDays: Math.max(0, Math.ceil(num(b.conditionDays))),
      marginPerBbl,
      // A minimum above the maximum is read as "exactly the maximum".
      minBatches: Math.max(0, Math.min(Math.round(num(b.minBatches)), Math.round(num(b.maxBatches)) > 0 ? Math.round(num(b.maxBatches)) : Infinity)),
      maxBatches: Math.max(0, Math.round(num(b.maxBatches))),
      value: batchBbl * marginPerBbl,
    });
  });
  return out;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tanks are tracked as sorted lists of [from, to) busy intervals, day indexes, to exclusive.
const free = (ivs, a, b) => {
  for (const [x, y] of ivs) if (x < b && a < y) return false;
  return true;
};

function context(beers, shared) {
  const H = shared.weeks * 7;
  const T = shared.turnaroundDays;
  return { beers, shared, H, T };
}

// Place batches in the given priority order, each at its earliest feasible start in the smallest tank that fits.
// A batch that cannot be placed anywhere is dropped. Returns the list of placed batches.
export function decode(order, ctx, tanks = { fermenters: ctx.shared.fermenters, brites: ctx.shared.brites }) {
  const { beers, shared, H, T } = ctx;
  const fIv = tanks.fermenters.map(() => []);
  const bIv = tanks.brites.map(() => []);
  const fBySize = tanks.fermenters.map((c, i) => i).sort((a, b) => tanks.fermenters[a] - tanks.fermenters[b] || a - b);
  const bBySize = tanks.brites.map((c, i) => i).sort((a, b) => tanks.brites[a] - tanks.brites[b] || a - b);
  const slots = new Array(H).fill(0);
  const placed = [];
  const made = new Array(beers.length).fill(0);
  for (const bi of order) {
    const b = beers[bi];
    if (b.maxBatches > 0 && made[bi] >= b.maxBatches) continue;
    const span = b.fermentDays + b.conditionDays;
    for (let s = 0; s + span <= H; s++) {
      if (s % 7 >= shared.brewDaysPerWeek || slots[s] >= shared.brewsPerBrewDay) continue;
      const fEnd = Math.min(H, s + b.fermentDays + T);
      const f = fBySize.find((i) => tanks.fermenters[i] >= b.batchBbl && free(fIv[i], s, fEnd));
      if (f === undefined) continue;
      let g = -1;
      let gEnd = 0;
      if (b.conditionDays > 0) {
        gEnd = Math.min(H, s + span + T);
        g = bBySize.find((i) => tanks.brites[i] >= b.batchBbl && free(bIv[i], s + b.fermentDays, gEnd));
        if (g === undefined) continue;
      }
      fIv[f].push([s, fEnd]);
      if (g >= 0) bIv[g].push([s + b.fermentDays, gEnd]);
      slots[s]++;
      placed.push({ beer: bi, start: s, fermenter: f, brite: g, ready: s + span });
      made[bi]++;
      break;
    }
  }
  return placed;
}

export const valueOf = (placed, beers) => placed.reduce((t, p) => t + beers[p.beer].value, 0);

// How many batches short of the beers' minimums a plan is.
export function shortfall(placed, beers) {
  return beers.reduce((t, b) => t + Math.max(0, b.minBatches - placed.filter((p) => p.beer === b.idx).length), 0);
}
// What the search maximises: margin, with a missed minimum worth less than any real plan.
const MISS = 1e7;
const scoreOf = (placed, beers) => valueOf(placed, beers) - MISS * shortfall(placed, beers);

function requestCounts(ctx, tanks) {
  const { beers, H, T } = ctx;
  return beers.map((b) => {
    if (b.maxBatches > 0) return Math.max(b.maxBatches, b.minBatches);
    const fit = tanks.fermenters.filter((c) => c >= b.batchBbl).length;
    return Math.max(b.minBatches, Math.min(40, Math.floor(H / (b.fermentDays + T)) * Math.max(fit, 1) + 1));
  });
}

// Round-robin over the beers in the order given, one request at a time.
function rotation(beerOrder, counts) {
  const left = counts.slice();
  const out = [];
  let any = true;
  while (any) {
    any = false;
    for (const b of beerOrder) if (left[b] > 0) { out.push(b); left[b]--; any = true; }
  }
  return out;
}

// Fractional knapsack: best value from "count" batches of each beer when each uses weight[b] of a pooled capacity.
function fractional(beers, counts, weight, capacity) {
  const items = beers.map((b, i) => ({ v: b.value, w: weight(b), n: counts[i] })).sort((a, b) => b.v / b.w - a.v / a.w);
  let cap = capacity;
  let total = 0;
  for (const it of items) {
    const take = Math.min(it.n, cap / it.w);
    if (take <= 0) continue;
    total += take * it.v;
    cap -= take * it.w;
  }
  return total;
}

// Valid upper bound on the margin any schedule can finish: the least of three relaxations.
export function upperBound(ctx, tanks = { fermenters: ctx.shared.fermenters, brites: ctx.shared.brites }) {
  const { beers, shared, H } = ctx;
  const counts = beers.map((b) => (b.maxBatches > 0 ? b.maxBatches : Infinity));
  const bounds = [];
  bounds.push(fractional(beers, counts, (b) => b.fermentDays, tanks.fermenters.length * H));
  if (beers.every((b) => b.conditionDays > 0)) bounds.push(fractional(beers, counts, (b) => b.conditionDays, tanks.brites.length * H));
  let brewDays = 0;
  for (let d = 0; d < H; d++) if (d % 7 < shared.brewDaysPerWeek) brewDays++;
  bounds.push(fractional(beers, counts, () => 1, brewDays * shared.brewsPerBrewDay));
  return Math.min(...bounds.filter(Number.isFinite));
}

// Search over priority orders. `start` orders are tried first; the best is improved by swap and move steps.
export function optimize(ctx, { iterations = 600, seed = 1, tanks, startOrder = null } = {}) {
  const t = tanks || { fermenters: ctx.shared.fermenters, brites: ctx.shared.brites };
  const { beers } = ctx;
  const counts = requestCounts(ctx, t);
  const byDensity = beers.map((b) => b.idx).sort((a, b) => beers[b].value / (beers[b].fermentDays + ctx.T) - beers[a].value / (beers[a].fermentDays + ctx.T));
  const byValue = beers.map((b) => b.idx).sort((a, b) => beers[b].value - beers[a].value);
  const blocks = (ord) => ord.flatMap((b) => Array(counts[b]).fill(b));
  const starts = [rotation(beers.map((b) => b.idx), counts), rotation(byDensity, counts), blocks(byDensity), blocks(byValue)];
  const minimums = rotation(beers.map((b) => b.idx), beers.map((b) => b.minBatches));
  starts.push(minimums.concat(blocks(byDensity)), minimums.concat(rotation(byDensity, counts)));
  if (startOrder) starts.push(startOrder);
  let best = null;
  let bestVal = -Infinity;
  for (const o of starts) {
    const v = scoreOf(decode(o, ctx, t), beers);
    if (v > bestVal) { best = o.slice(); bestVal = v; }
  }
  const rand = rng(seed);
  let cur = best.slice();
  let curVal = bestVal;
  for (let it = 0; it < iterations && cur.length > 1; it++) {
    const cand = cur.slice();
    const i = Math.floor(rand() * cand.length);
    const j = Math.floor(rand() * cand.length);
    if (i === j || cand[i] === cand[j]) continue;
    if (rand() < 0.5) { [cand[i], cand[j]] = [cand[j], cand[i]]; }
    else { const [x] = cand.splice(i, 1); cand.splice(j, 0, x); }
    const v = scoreOf(decode(cand, ctx, t), beers);
    if (v >= curVal) {
      cur = cand;
      curVal = v;
      if (v > bestVal) { best = cand.slice(); bestVal = v; }
    }
  }
  const placed = decode(best, ctx, t);
  return { order: best, placed, value: valueOf(placed, beers), short: shortfall(placed, beers), score: bestVal };
}

// Independent feasibility check, used by the tests and shown as a guard in the page: returns a list of problems.
export function validate(placed, ctx, tanks = { fermenters: ctx.shared.fermenters, brites: ctx.shared.brites }) {
  const { beers, shared, H, T } = ctx;
  const problems = [];
  const busy = (kind) => new Map();
  const fb = busy(), bb = busy(), slots = new Map(), counts = new Map();
  for (const p of placed) {
    const b = beers[p.beer];
    const span = b.fermentDays + b.conditionDays;
    if (p.start < 0 || p.start + span > H) problems.push(`${b.name} does not finish inside the horizon`);
    if (p.start % 7 >= shared.brewDaysPerWeek) problems.push(`${b.name} brews on a non-brew day`);
    slots.set(p.start, (slots.get(p.start) || 0) + 1);
    counts.set(p.beer, (counts.get(p.beer) || 0) + 1);
    if (tanks.fermenters[p.fermenter] < b.batchBbl) problems.push(`${b.name} does not fit its fermenter`);
    for (let d = p.start; d < Math.min(H, p.start + b.fermentDays + T); d++) {
      const k = p.fermenter + ":" + d;
      if (fb.has(k)) problems.push(`fermenter ${p.fermenter} double-booked on day ${d}`);
      fb.set(k, 1);
    }
    if (b.conditionDays > 0) {
      if (p.brite < 0 || tanks.brites[p.brite] < b.batchBbl) problems.push(`${b.name} does not fit its bright tank`);
      for (let d = p.start + b.fermentDays; d < Math.min(H, p.start + span + T); d++) {
        const k = p.brite + ":" + d;
        if (bb.has(k)) problems.push(`bright tank ${p.brite} double-booked on day ${d}`);
        bb.set(k, 1);
      }
    }
  }
  for (const [d, n] of slots) if (n > shared.brewsPerBrewDay) problems.push(`day ${d} has ${n} brews`);
  for (const [bi, n] of counts) if (beers[bi].maxBatches > 0 && n > beers[bi].maxBatches) problems.push(`${beers[bi].name} exceeds its batch limit`);
  return problems;
}

// Day-by-day picture of one tank: a digit for the beer (1-8), "~" cleaning, "." idle.
function tankRow(placed, ctx, kind, index) {
  const { beers, H, T } = ctx;
  const row = new Array(H).fill(".");
  for (const p of placed) {
    const b = beers[p.beer];
    const mine = kind === "f" ? p.fermenter === index : p.brite === index && b.conditionDays > 0;
    if (!mine) continue;
    const from = kind === "f" ? p.start : p.start + b.fermentDays;
    const len = kind === "f" ? b.fermentDays : b.conditionDays;
    for (let d = from; d < Math.min(H, from + len + T); d++) row[d] = d < from + len ? String(p.beer + 1) : "~";
  }
  return row.join("");
}

const usedDays = (row) => [...row].filter((c) => c !== ".").length;

export function analyze(rawBeers, rawShared, opts = {}) {
  const warnings = [];
  const shared = cleanShared(rawShared);
  const beers = cleanBeers(rawBeers);
  if (!shared.fermenters.length) warnings.push("Enter the size in barrels of each fermenter, separated by spaces.");
  if (!beers.length) warnings.push("Enter at least one beer with a batch size, fermenting days and a margin per barrel.");
  if (warnings.length) return { ok: false, warnings };
  const ctx = context(beers, shared);
  const fits = (b) => shared.fermenters.some((c) => c >= b.batchBbl) && (b.conditionDays === 0 || shared.brites.some((c) => c >= b.batchBbl));
  beers.filter((b) => !fits(b)).forEach((b) => warnings.push(`${b.name} (${b.batchBbl} bbl) does not fit any ${shared.fermenters.some((c) => c >= b.batchBbl) ? "bright tank" : "fermenter"}, so it is left out.`));
  beers.filter((b) => b.conditionDays > 0 && !shared.brites.length).forEach((b) => { if (!warnings.some((w) => w.startsWith(b.name))) warnings.push(`${b.name} conditions, but no bright tank is listed, so it is left out.`); });
  const usable = beers.filter(fits).map((b, i) => ({ ...b, idx: i }));
  if (!usable.length) return { ok: false, warnings };
  const c2 = context(usable, shared);
  const iterations = opts.iterations ?? 600;
  const res = optimize(c2, { iterations });
  const placed = res.placed.slice().sort((a, b) => a.start - b.start || a.fermenter - b.fermenter);
  const problems = validate(placed, c2);
  const counts = usable.map((b) => ({ ...b, made: placed.filter((p) => p.beer === b.idx).length }));
  const naiveOrder = rotation(usable.map((b) => b.idx), requestCounts(c2, { fermenters: shared.fermenters, brites: shared.brites }));
  const naivePlaced = decode(naiveOrder, c2);
  const naiveValue = valueOf(naivePlaced, usable);
  if (res.short > 0) warnings.push(`The minimum batch counts cannot all be met in ${shared.weeks} weeks with these tanks: ${res.short} batch${res.short === 1 ? " is" : "es are"} short. Lower a minimum or add tank time.`);
  const bound = upperBound(c2);
  const H = c2.H;
  const rowsF = shared.fermenters.map((_, i) => tankRow(placed, c2, "f", i));
  const rowsB = shared.brites.map((_, i) => tankRow(placed, c2, "b", i));
  const annual = 52 / shared.weeks;
  const scenarios = [];
  if (opts.scenarios !== false) {
    const bigF = Math.max(...shared.fermenters);
    const withF = { fermenters: shared.fermenters.concat(bigF), brites: shared.brites };
    const vF = optimize(c2, { iterations: Math.round(iterations / 2), tanks: withF, startOrder: res.order }).score;
    scenarios.push({ label: `One more ${bigF}-bbl fermenter`, gain: Math.max(0, vF - res.score) });
    if (shared.brites.length && usable.some((b) => b.conditionDays > 0)) {
      const bigB = Math.max(...shared.brites);
      const withB = { fermenters: shared.fermenters, brites: shared.brites.concat(bigB) };
      const vB = optimize(c2, { iterations: Math.round(iterations / 2), tanks: withB, startOrder: res.order }).score;
      scenarios.push({ label: `One more ${bigB}-bbl bright tank`, gain: Math.max(0, vB - res.score) });
    }
  }
  return {
    ok: true,
    warnings,
    problems,
    shared,
    horizonDays: H,
    placed,
    schedule: placed.map((p, n) => {
      const b = usable[p.beer];
      return { n: n + 1, beer: b.name, bbl: b.batchBbl, brew: dayLabel(p.start), fermenter: p.fermenter + 1, fermenterBbl: shared.fermenters[p.fermenter], brite: p.brite >= 0 ? p.brite + 1 : null, ready: p.ready >= H ? "end of horizon" : dayLabel(p.ready), value: b.value };
    }),
    beers: counts,
    value: res.value,
    naiveValue,
    gain: res.value - naiveValue,
    annualGain: (res.value - naiveValue) * annual,
    bound,
    gapPct: bound > 0 ? Math.max(0, ((bound - res.value) / bound) * 100) : 0,
    barrels: placed.reduce((t, p) => t + usable[p.beer].batchBbl, 0),
    fermUtil: rowsF.map((r) => usedDays(r) / H),
    briteUtil: rowsB.map((r) => usedDays(r) / H),
    rowsF,
    rowsB,
    scenarios: scenarios.map((s) => ({ ...s, annual: s.gain * annual })),
    annualFactor: annual,
  };
}

export function toCsv(a) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = ["batch,beer,barrels,brew_day,fermenter,fermenter_bbl,bright_tank,ready,margin"];
  for (const r of a.schedule) lines.push([r.n, q(r.beer), r.bbl, q(r.brew), r.fermenter, r.fermenterBbl, r.brite ?? "", q(r.ready), Math.round(r.value)].join(","));
  return lines.join("\n") + "\n";
}
