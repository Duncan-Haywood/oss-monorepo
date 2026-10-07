// Greenhouse bench planner: backward-schedule sowing from sale dates against germination and bench space.
// Pure functions; no DOM, no network.

const DAY = 864e5;
const WEEK = 7 * DAY;
const MONDAY0 = Date.UTC(1970, 0, 5);

export const DEFAULTS = { benchSqft: 400, germSqft: 30, germDensity: 60, maxHoldWeeks: 2, holdCost: 0.5, latePenaltyPct: 10 };

export function money(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function parseDate(s) {
  s = String(s || "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) { y = +m[3]; mo = +m[1]; d = +m[2]; }
  else return null;
  const t = Date.UTC(y, mo - 1, d);
  const c = new Date(t);
  return c.getUTCFullYear() === y && c.getUTCMonth() === mo - 1 && c.getUTCDate() === d ? t : null;
}

const iso = (t) => new Date(t).toISOString().slice(0, 10);
export const weekIndex = (t) => Math.floor((t - MONDAY0) / WEEK);
export const weekStart = (i) => iso(MONDAY0 + i * WEEK);

function splitLine(line) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') inQ = false; else cur += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === "," || ch === "\t") { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseCrops(text) {
  const crops = [], errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const f = splitLine(line);
    if (/^crop$/i.test(f[0])) return;
    const n = (k, def) => (f[k] === undefined || f[k] === "" ? def : Number(f[k].replace(/[$%\s]/g, "")));
    const sale = parseDate(f[1]);
    const c = { name: f[0], sale, units: n(2, NaN), germ: n(3, NaN), grow: n(4, NaN), density: n(5, NaN), survival: n(6, 90), price: n(7, 0), cost: n(8, 0), flex: n(9, 0) };
    const bad = !c.name ? "no crop name" : sale === null ? "sale date must be YYYY-MM-DD" : !(c.units > 0) ? "units must be above 0"
      : !(c.germ >= 0) || !(c.grow >= 0) || c.germ + c.grow <= 0 ? "germination and growing weeks must be numbers" : !(c.density > 0) ? "units per square foot must be above 0"
      : !(c.survival > 0 && c.survival <= 100) ? "survival must be between 1 and 100" : !(c.price >= 0) || !(c.cost >= 0) || !(c.flex >= 0) ? "price, cost and flex weeks cannot be negative" : "";
    if (bad) { errors.push(`Line ${i + 1} (${f[0] || "blank"}): ${bad}.`); return; }
    c.germ = Math.ceil(c.germ); c.grow = Math.ceil(c.grow); c.flex = Math.floor(c.flex);
    c.id = crops.length;
    crops.push(c);
  });
  return { crops, errors };
}

function planCore(crops, o) {
  const germUsed = new Map(), benchUsed = new Map();
  const get = (m, w) => m.get(w) || 0;
  const jobs = crops.map((c) => {
    const surv = c.survival / 100;
    const unitMargin = c.price - c.cost;
    const margin = c.units * unitMargin;
    const benchSq = c.units / c.density;
    const germSq = Math.ceil(c.units / surv) / o.germDensity;
    const spaceWeeks = benchSq * c.grow + germSq * c.germ;
    return { c, surv, unitMargin, margin, density: margin / Math.max(spaceWeeks, 1e-9) };
  }).sort((a, b) => b.density - a.density || a.c.sale - b.c.sale || a.c.id - b.c.id);

  const rows = [];
  for (const j of jobs) {
    const { c } = j;
    const cands = [{ kind: "on time", early: 0, late: 0 }];
    for (let k = 1; k <= o.maxHoldWeeks; k++) cands.push({ kind: "early", early: k, late: 0 });
    for (let k = 1; k <= c.flex; k++) cands.push({ kind: "late", early: 0, late: k });
    let best = null;
    for (const cd of cands) {
      const saleWeek = weekIndex(c.sale) + cd.late;
      const ws = saleWeek - c.grow - cd.early - c.germ;
      const benchFrom = ws + c.germ, benchTo = saleWeek; // bench weeks [benchFrom, benchTo)
      let freeG = Infinity, freeB = Infinity;
      for (let w = ws; w < ws + c.germ; w++) freeG = Math.min(freeG, o.germSqft - get(germUsed, w));
      for (let w = benchFrom; w < benchTo; w++) freeB = Math.min(freeB, o.benchSqft - get(benchUsed, w));
      const sold = Math.max(0, Math.min(c.units, Math.floor(freeB * c.density + 1e-9), Math.floor(freeG * o.germDensity * j.surv + 1e-9)));
      const benchSq = sold / c.density;
      const penalty = cd.early * benchSq * o.holdCost + (cd.late ? sold * j.unitMargin * (o.latePenaltyPct / 100) * cd.late : 0);
      const value = sold * j.unitMargin - penalty;
      const full = sold >= c.units;
      const better = !best || (full && !best.full) || (full === best.full && (full ? penalty < best.penalty - 1e-9 : value > best.value + 1e-9));
      if (better) best = { ...cd, ws, saleWeek, benchFrom, benchTo, sold, penalty, value, full };
    }
    const sown = Math.ceil(best.sold / j.surv - 1e-9);
    if (best.sold > 0) {
      for (let w = best.ws; w < best.ws + c.germ; w++) germUsed.set(w, get(germUsed, w) + sown / o.germDensity);
      for (let w = best.benchFrom; w < best.benchTo; w++) benchUsed.set(w, get(benchUsed, w) + best.sold / c.density);
    }
    const saleDate = c.sale + best.late * WEEK;
    rows.push({
      crop: c.name, target: iso(c.sale), sale: iso(saleDate), sow: iso(saleDate - (c.germ + c.grow + best.early) * WEEK),
      sown, units: c.units, sold: best.sold, short: c.units - best.sold, shift: best.early ? `${best.early} wk early (held)` : best.late ? `${best.late} wk late` : "on time",
      early: best.early, late: best.late, benchSqft: best.sold / c.density, germSqft: sown / o.germDensity,
      margin: best.sold * j.unitMargin - best.penalty, fullMargin: j.margin, id: c.id, germ: c.germ, grow: c.grow, sowTime: saleDate - (c.germ + c.grow + best.early) * WEEK,
    });
  }
  rows.sort((a, b) => a.sowTime - b.sowTime || a.id - b.id);
  const weeks = [...new Set([...germUsed.keys(), ...benchUsed.keys()])].sort((a, b) => a - b);
  const table = weeks.length ? Array.from({ length: weeks[weeks.length - 1] - weeks[0] + 1 }, (_, i) => {
    const w = weeks[0] + i;
    return { week: weekStart(w), germ: get(germUsed, w), bench: get(benchUsed, w), germCap: o.germSqft, benchCap: o.benchSqft, util: get(benchUsed, w) / o.benchSqft };
  }) : [];
  return { rows, weeks: table };
}

export function analyze(text, options = {}) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (Number.isFinite(options[k]) && options[k] >= 0) o[k] = options[k];
  if (!(o.benchSqft > 0)) o.benchSqft = DEFAULTS.benchSqft;
  if (!(o.germSqft > 0)) o.germSqft = DEFAULTS.germSqft;
  if (!(o.germDensity > 0)) o.germDensity = DEFAULTS.germDensity;
  const { crops, errors } = parseCrops(text);
  if (!crops.length) return { summary: null, rows: [], weeks: [], warnings: [], errors: errors.length ? errors : ["No crops found. Use lines of crop, sale date, units, germination weeks, growing weeks, units per sq ft."], sweep: [], economics: [] };

  const base = planCore(crops, o);
  const unlimited = planCore(crops, { ...o, benchSqft: 1e9, germSqft: 1e9 });
  const peak = (t, k) => t.weeks.reduce((m, w) => Math.max(m, w[k]), 0);
  const need = { bench: peak(unlimited, "bench"), germ: peak(unlimited, "germ") };
  const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);
  const requested = sum(base.rows, "units"), planned = sum(base.rows, "sold");
  const fullMargin = sum(base.rows, "fullMargin"), planMargin = sum(base.rows, "margin");

  // The greedy pass is not monotone in space, but extra space can never hurt: the smaller plan still fits.
  // So each row keeps the best plan found at or below its size.
  const sweep = [];
  for (const extra of [0, 50, 100, 200, 400]) {
    const p = extra ? planCore(crops, { ...o, benchSqft: o.benchSqft + extra }) : base;
    const row = { extra, benchSqft: o.benchSqft + extra, sold: sum(p.rows, "sold"), margin: sum(p.rows, "margin") };
    const prev = sweep[sweep.length - 1];
    if (prev && prev.margin > row.margin) { row.sold = prev.sold; row.margin = prev.margin; }
    row.short = requested - row.sold;
    sweep.push(row);
  }

  const warnings = [];
  for (const r of base.rows) {
    if (r.short > 0) warnings.push({ level: "high", text: `${r.crop}: only ${r.sold} of ${r.units} units fit by ${r.target}. ${r.short} cannot be grown with the space you entered.` });
    if (r.early) warnings.push({ level: "medium", text: `${r.crop}: sown ${r.early} week${r.early === 1 ? "" : "s"} early and held on the bench to free the weeks around it.` });
    if (r.late && r.sold > 0) warnings.push({ level: "medium", text: `${r.crop}: sale slips ${r.late} week${r.late === 1 ? "" : "s"} to ${r.sale} (you allowed up to that).` });
  }
  if (options.today) {
    const t = parseDate(options.today);
    if (t !== null) for (const r of base.rows) if (r.sold > 0 && r.sowTime < t) warnings.push({ level: "high", text: `${r.crop}: the sow date ${r.sow} has passed. Sown today it sells ${iso(t + (r.germ + r.grow) * WEEK)} at the earliest, not ${r.sale}.` });
  }
  if (need.bench > o.benchSqft + 1e-9 || need.germ > o.germSqft + 1e-9) {
    const parts = [];
    if (need.bench > o.benchSqft + 1e-9) parts.push(`${Math.ceil(need.bench)} sq ft of bench at the peak week (you have ${o.benchSqft})`);
    if (need.germ > o.germSqft + 1e-9) parts.push(`${Math.ceil(need.germ)} sq ft of germination space (you have ${o.germSqft})`);
    warnings.push({ level: "info", text: `Growing every order on its date with no space limit needs ${parts.join(" and ")}.` });
  }

  const economics = base.rows.map((r) => ({ crop: r.crop, margin: r.margin, perSqftWeek: r.sold > 0 ? r.margin / Math.max(r.benchSqft * r.grow + r.germSqft * r.germ, 1e-9) : 0, sold: r.sold })).sort((a, b) => b.perSqftWeek - a.perSqftWeek);
  const pk = base.weeks.reduce((m, w) => (w.bench > m.bench ? w : m), { bench: -1, week: "" });
  return {
    summary: {
      crops: crops.length, requested, planned, short: requested - planned, margin: planMargin, fullMargin, lost: fullMargin - planMargin,
      peakBench: Math.max(0, pk.bench), peakWeek: pk.week, benchSqft: o.benchSqft, germSqft: o.germSqft, needBench: need.bench, needGerm: need.germ,
      from: base.weeks.length ? base.weeks[0].week : "", to: base.weeks.length ? base.weeks[base.weeks.length - 1].week : "",
    },
    rows: base.rows, weeks: base.weeks, warnings, errors, sweep, economics,
  };
}

const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
export function planCsv(r) {
  const head = ["sow_date", "crop", "units_sown", "sale_date", "units_sold", "units_short", "shift", "bench_sqft", "germination_sqft", "margin"];
  return [head.join(","), ...r.rows.map((x) => [x.sow, q(x.crop), x.sown, x.sale, x.sold, x.short, q(x.shift), x.benchSqft.toFixed(1), x.germSqft.toFixed(1), x.margin.toFixed(2)].join(","))].join("\n") + "\n";
}

export function sowList(r) {
  const by = new Map();
  for (const x of r.rows) if (x.sold > 0) { if (!by.has(x.sow)) by.set(x.sow, []); by.get(x.sow).push(x); }
  return [...by.keys()].sort().map((d) => `Sow ${d}\n` + by.get(d).map((x) => `  ${x.crop}: ${x.sown} seeds/cells, ready ${x.sale}${x.early ? ` (held ${x.early} wk)` : ""}`).join("\n")).join("\n\n") + "\n";
}

export const DEFAULT_CROPS = `# crop, sale date, units, germination wks, growing wks, units per sq ft on the bench, survival %, price, cost, weeks you could sell late
Tomato 4in, 2027-05-08, 300, 2, 6, 2.2, 92, 3.50, 1.10, 1
Pepper 4in, 2027-05-08, 200, 2, 7, 2.2, 90, 3.50, 1.20, 1
Petunia hanging basket, 2027-05-01, 60, 3, 8, 0.8, 88, 14, 5.50, 0
Marigold 6-pack, 2027-04-24, 600, 1, 5, 6, 95, 3.25, 0.70, 2
Basil 4in, 2027-05-22, 250, 1, 5, 2.4, 90, 3.00, 0.80, 1
Zinnia 6-pack, 2027-05-15, 400, 1, 4, 6, 95, 3.25, 0.65, 2
Geranium 6in, 2027-05-01, 60, 4, 9, 1.0, 85, 9, 3.40, 0`;
