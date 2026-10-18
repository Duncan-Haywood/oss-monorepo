// Beef cattle ration optimizer: the least-cost feed formulation problem. Given
// feeds with a price per ton as-fed, dry matter and nutrient content, and an
// animal's requirements (dry matter intake, crude protein, TDN energy, calcium,
// phosphorus, a Ca:P ratio and a minimum forage share), find the pounds of each
// feed per head per day that meet every requirement at the lowest cost. A
// linear program solved with a two-phase simplex (Bland's rule). Shadow prices
// come from re-solving; the price at which an unused feed would enter the
// ration comes from bisection. Pure functions, no I/O.
//
// Arithmetic on figures the user types or edits. The starter feeds carry
// approximate book values and EXAMPLE prices, and the requirement presets are
// rounded rules of thumb. Not veterinary or nutritionist advice.

const EPS = 1e-9;

// maximise c.x subject to rows [{a, rel: "<="|">=", b}], x >= 0.
// Returns {status: "optimal"|"infeasible"|"unbounded", value, x}.
export function simplex(c, rows) {
  const n = c.length, m = rows.length;
  const A = [], b = [], neg = [];
  for (const r of rows) {
    let a = r.a.slice(), rhs = r.b;
    if (r.rel === ">=") { a = a.map((v) => -v); rhs = -rhs; }
    A.push(a); b.push(rhs); neg.push(rhs < -EPS);
  }
  const nArt = neg.filter(Boolean).length;
  const cols = n + m + nArt; // originals, one slack/surplus per row, artificials
  const T = [];
  const basis = [];
  let ai = 0;
  for (let i = 0; i < m; i++) {
    const row = new Array(cols + 1).fill(0);
    if (!neg[i]) {
      for (let j = 0; j < n; j++) row[j] = A[i][j];
      row[n + i] = 1; row[cols] = b[i]; basis.push(n + i);
    } else {
      for (let j = 0; j < n; j++) row[j] = -A[i][j];
      row[n + i] = -1; row[n + m + ai] = 1; row[cols] = -b[i]; basis.push(n + m + ai); ai++;
    }
    T.push(row);
  }
  const pivot = (pr, pc) => {
    const p = T[pr][pc];
    for (let j = 0; j <= cols; j++) T[pr][j] /= p;
    for (let i = 0; i < m; i++) {
      if (i === pr) continue;
      const f = T[i][pc];
      if (Math.abs(f) > 0) for (let j = 0; j <= cols; j++) T[i][j] -= f * T[pr][j];
    }
    basis[pr] = pc;
  };
  // objective as reduced costs: z_j - c_j style kept in `obj` (maximise)
  const run = (cost, allowed) => {
    for (let iter = 0; iter < 20000; iter++) {
      // reduced cost of column j: cost_j - sum cost_B * T[i][j]
      let enter = -1;
      for (let j = 0; j < cols; j++) {
        if (!allowed(j) || basis.includes(j)) continue;
        let rc = cost[j];
        for (let i = 0; i < m; i++) rc -= cost[basis[i]] * T[i][j];
        if (rc > 1e-9) { enter = j; break; } // Bland: lowest index
      }
      if (enter < 0) return "optimal";
      let leave = -1, best = Infinity;
      for (let i = 0; i < m; i++) {
        if (T[i][enter] > 1e-9) {
          const ratio = T[i][cols] / T[i][enter];
          if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[i] < basis[leave])) { best = ratio; leave = i; }
        }
      }
      if (leave < 0) return "unbounded";
      pivot(leave, enter);
    }
    return "iterations";
  };
  if (nArt) {
    const cost1 = new Array(cols).fill(0);
    for (let j = n + m; j < cols; j++) cost1[j] = -1;
    run(cost1, () => true);
    const infeas = basis.reduce((s, bj, i) => s + (bj >= n + m ? T[i][cols] : 0), 0);
    if (infeas > 1e-7) return { status: "infeasible" };
    for (let i = 0; i < m; i++) {
      if (basis[i] >= n + m) {
        let pc = -1;
        for (let j = 0; j < n + m; j++) if (Math.abs(T[i][j]) > 1e-9) { pc = j; break; }
        if (pc >= 0) pivot(i, pc);
      }
    }
  }
  const cost2 = new Array(cols).fill(0);
  for (let j = 0; j < n; j++) cost2[j] = c[j];
  const st = run(cost2, (j) => j < n + m);
  if (st !== "optimal") return { status: st === "unbounded" ? "unbounded" : "infeasible" };
  const x = new Array(n).fill(0);
  for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = T[i][cols];
  let value = 0;
  for (let j = 0; j < n; j++) value += c[j] * x[j];
  return { status: "optimal", value, x };
}


// ------------------------------------------------------------ requirements

export const NUTRIENTS = ["dm", "cp", "tdn", "ca", "p"];
export const LABEL = { dm: "Dry matter", cp: "Crude protein", tdn: "TDN (energy)", ca: "Calcium", p: "Phosphorus" };

// Rounded rules of thumb for a 1,000-1,400 lb animal class, as % of dry matter.
// Real requirements depend on weight, gain, milk, weather and breed; use these
// as a starting point and replace them with your own nutritionist's numbers.
export const PRESETS = {
  "cow-mid": { label: "Beef cow, mid-gestation", weight: 1300, dmiPct: 2.0, cp: 7.5, tdn: 52, ca: 0.25, p: 0.18, forageMin: 80 },
  "cow-late": { label: "Beef cow, last third of gestation", weight: 1300, dmiPct: 2.1, cp: 9, tdn: 56, ca: 0.35, p: 0.20, forageMin: 75 },
  "cow-lact": { label: "Beef cow, lactating", weight: 1300, dmiPct: 2.4, cp: 11, tdn: 60, ca: 0.45, p: 0.25, forageMin: 70 },
  "bull": { label: "Breeding bull, maintenance", weight: 1800, dmiPct: 2.0, cp: 8, tdn: 55, ca: 0.30, p: 0.20, forageMin: 75 },
  "grower": { label: "Growing calf or stocker (about 600 lb)", weight: 600, dmiPct: 2.5, cp: 12, tdn: 65, ca: 0.50, p: 0.25, forageMin: 45 },
  "finisher": { label: "Finishing steer or heifer (about 900 lb+)", weight: 900, dmiPct: 2.2, cp: 12, tdn: 78, ca: 0.40, p: 0.25, forageMin: 12 },
};

export const DEFAULTS = {
  preset: "cow-mid", weight: 1300, dmiPct: 2.0, cp: 7.5, tdn: 52, ca: 0.25, p: 0.18,
  forageMin: 80, caPMin: 1.5, caPMax: 7, tol: 2, head: 40, days: 120, waste: 5,
};

export function applyPreset(key, weight) {
  const p = PRESETS[key];
  if (!p) return null;
  return { ...DEFAULTS, ...p, preset: key, weight: weight ?? p.weight };
}

// ------------------------------------------------------------ parsing

/** Feeds, one per line: Name | $ per ton as-fed | DM % | CP % of DM | TDN % of DM | Ca % of DM | P % of DM | F/C/M | max lb as-fed per head per day (optional). */
export function parseFeeds(text) {
  const rows = [];
  const errors = [];
  const seen = new Set();
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const c = line.split("|").map((s) => s.trim());
    const name = c[0].replace(/\s+/g, " ");
    const nums = c.slice(1, 7).map((s) => (s === undefined || s === "" ? NaN : Number(s.replace(/^\$/, "").replace(/,/g, ""))));
    const type = (c[7] || "").toUpperCase();
    const bad = !name || c.length < 8 || nums.some((v) => !Number.isFinite(v) || v < 0) || !["F", "C", "M"].includes(type);
    if (bad) {
      errors.push(`Feed line ${i + 1} ("${line.slice(0, 40)}") needs: name | $ per ton | DM % | CP % | TDN % | Ca % | P % | F, C or M [| max lb per day], no negatives.`);
      return;
    }
    if (nums[1] > 100 || nums[2] > 100 || nums[3] > 100 || nums[4] > 100 || nums[5] > 100) { errors.push(`"${name}" (line ${i + 1}): percentages cannot exceed 100.`); return; }
    if (!(nums[1] > 0)) { errors.push(`"${name}" (line ${i + 1}) needs a dry matter above 0%.`); return; }
    if (seen.has(name.toLowerCase())) { errors.push(`"${name}" is listed twice (line ${i + 1}).`); return; }
    seen.add(name.toLowerCase());
    const max = c.length >= 9 && c[8] !== "" ? Number(c[8]) : NaN;
    rows.push({ name, ton: nums[0], dm: nums[1], cp: nums[2], tdn: nums[3], ca: nums[4], p: nums[5], type, max: Number.isFinite(max) && max >= 0 ? max : null });
  });
  return { feeds: rows, errors };
}

const lbPrice = (f) => f.ton / 2000;
/** Pounds of each nutrient in one pound as-fed. */
const perLb = (f) => ({ dm: f.dm / 100, cp: (f.dm * f.cp) / 1e4, tdn: (f.dm * f.tdn) / 1e4, ca: (f.dm * f.ca) / 1e4, p: (f.dm * f.p) / 1e4 });

export function dmiTarget(spec) { return (Number(spec.weight) * Number(spec.dmiPct)) / 100; }

export function validateSpec(spec) {
  const errs = [];
  if (!spec.feeds || spec.feeds.length < 2) errs.push("Add at least two feeds.");
  if (spec.feeds && spec.feeds.length > 40) errs.push("This tool handles up to 40 feeds.");
  const pos = [["weight", "Body weight"], ["dmiPct", "Dry matter intake (% of body weight)"]];
  for (const [k, n] of pos) if (!(Number(spec[k]) > 0)) errs.push(`${n} must be above zero.`);
  if (Number(spec.weight) > 3000) errs.push("Body weight above 3,000 lb is outside what this tool is built for.");
  if (Number(spec.dmiPct) > 4) errs.push("Dry matter intake above 4% of body weight is not realistic for beef cattle.");
  for (const k of ["cp", "tdn", "ca", "p"]) if (!(Number(spec[k]) >= 0) || Number(spec[k]) > 100) errs.push(`The ${LABEL[k]} requirement must be between 0 and 100 (% of dry matter).`);
  if (!(Number(spec.forageMin) >= 0) || Number(spec.forageMin) > 100) errs.push("Minimum forage must be between 0 and 100% of dry matter.");
  if (!(Number(spec.caPMin) >= 0) || !(Number(spec.caPMax) >= Number(spec.caPMin))) errs.push("The Ca:P ratio range is not valid (minimum above maximum).");
  if (!(Number(spec.tol) >= 0) || Number(spec.tol) > 10) errs.push("Intake tolerance must be between 0 and 10%.");
  if (!(Number(spec.head) >= 1) || !(Number(spec.days) >= 1)) errs.push("Head count and days on feed must be at least 1.");
  if (!(Number(spec.waste) >= 0) || Number(spec.waste) > 50) errs.push("Waste allowance must be between 0 and 50%.");
  return errs;
}

// ------------------------------------------------------------ model

/** Constraint rows over x = pounds as-fed per head per day of each feed. */
function buildRows(spec, extra) {
  extra = extra || {};
  return buildRowsInner(spec, extra);
}
function buildRowsInner(spec, extra) {
  const feeds = spec.feeds, n = feeds.length, pl = feeds.map(perLb);
  const dmi = dmiTarget(spec), tol = Number(spec.tol) / 100;
  const rows = [];
  rows.push({ a: pl.map((v) => v.dm), rel: ">=", b: dmi * (1 - tol) });
  rows.push({ a: pl.map((v) => v.dm), rel: "<=", b: dmi * (1 + tol) });
  // Concentration requirements: sum(nutrient_i - req * dm_i) x_i >= 0.
  for (const k of ["cp", "tdn", "ca", "p"]) {
    const req = (Number(spec[k]) + (extra[k] || 0)) / 100;
    if (req > 0) rows.push({ a: pl.map((v) => v[k] - req * v.dm), rel: ">=", b: 0 });
  }
  const fm = (Number(spec.forageMin) + (extra.forageMin || 0)) / 100;
  if (fm > 0) rows.push({ a: feeds.map((f, i) => ((f.type === "F" ? 1 : 0) - fm) * pl[i].dm), rel: ">=", b: 0 });
  // Ca:P between caPMin and caPMax (Ca - r P).
  if (Number(spec.caPMin) > 0) rows.push({ a: pl.map((v) => v.ca - Number(spec.caPMin) * v.p), rel: ">=", b: 0 });
  if (Number(spec.caPMax) > 0) rows.push({ a: pl.map((v) => v.ca - Number(spec.caPMax) * v.p), rel: "<=", b: 0 });
  feeds.forEach((f, i) => {
    if (f.max !== null) { const a = new Array(n).fill(0); a[i] = 1; rows.push({ a, rel: "<=", b: f.max }); }
  });
  return rows;
}

function relaxed(spec, extra, priceOverride) {
  const c = spec.feeds.map((f, i) => -(priceOverride && priceOverride.i === i ? priceOverride.ton : f.ton) / 2000);
  const res = simplex(c, buildRows(spec, extra));
  if (res.status !== "optimal") return res;
  return { status: "optimal", x: res.x, cost: -res.value };
}

export function totals(spec, x) {
  const t = { dm: 0, cp: 0, tdn: 0, ca: 0, p: 0, forageDm: 0 };
  spec.feeds.forEach((f, i) => {
    const v = perLb(f);
    for (const k of NUTRIENTS) t[k] += v[k] * x[i];
    if (f.type === "F") t.forageDm += v.dm * x[i];
  });
  return t;
}

export const planCost = (spec, x) => spec.feeds.reduce((s, f, i) => s + lbPrice(f) * x[i], 0);

/** Independent re-check of every requirement, without the solver. */
export function planFeasible(spec, x, slack = 1e-6) {
  const t = totals(spec, x), dmi = dmiTarget(spec), tol = Number(spec.tol) / 100;
  if (x.some((v, i) => v < -slack || (spec.feeds[i].max !== null && v > spec.feeds[i].max + slack))) return false;
  if (t.dm < dmi * (1 - tol) - slack || t.dm > dmi * (1 + tol) + slack) return false;
  for (const k of ["cp", "tdn", "ca", "p"]) if (t[k] < (Number(spec[k]) / 100) * t.dm - slack) return false;
  if (t.forageDm < (Number(spec.forageMin) / 100) * t.dm - slack) return false;
  if (t.ca < Number(spec.caPMin) * t.p - slack) return false;
  if (Number(spec.caPMax) > 0 && t.ca > Number(spec.caPMax) * t.p + slack) return false;
  return true;
}

/** Why the problem might be infeasible: which single requirement the feed list cannot reach on its own. */
export function diagnose(spec) {
  const out = [];
  const best = (k) => Math.max(...spec.feeds.map((f) => (f.dm * f[k]) / (f.dm || 1)));
  for (const k of ["cp", "tdn", "ca", "p"]) if (best(k) < Number(spec[k]) - 1e-9) out.push(`No feed on the list reaches ${Number(spec[k])}% ${LABEL[k]} of dry matter (the best is ${best(k).toFixed(2)}%).`);
  if (!spec.feeds.some((f) => f.type === "F") && Number(spec.forageMin) > 0) out.push("You require forage but no feed is marked F.");
  const room = spec.feeds.every((f) => f.max !== null) ? spec.feeds.reduce((s, f) => s + f.max * f.dm / 100, 0) : Infinity;
  if (room < dmiTarget(spec) * (1 - Number(spec.tol) / 100)) out.push("The per-feed maximums cap the total dry matter below the intake target.");
  return out;
}

const STEP = { cp: 1, tdn: 1, forageMin: 10 };

/** The price (per ton) below which an unused feed would enter the ration, by bisection. */
function entryPrice(spec, i, base) {
  const f = spec.feeds[i];
  const used = (ton) => { const r = relaxed(spec, null, { i, ton }); return r.status === "optimal" && r.x[i] > 0.01; };
  if (!used(0)) return null; // even free, the rest of the list does the job better or the feed cannot help
  let lo = 0, hi = f.ton;
  for (let it = 0; it < 22; it++) { const mid = (lo + hi) / 2; if (used(mid)) lo = mid; else hi = mid; }
  return lo;
}

export function solve(spec) {
  const root = relaxed(spec, null);
  if (root.status !== "optimal") return { status: root.status, hints: diagnose(spec) };
  const x = root.x;
  const t = totals(spec, x);
  const items = spec.feeds.map((f, i) => ({ index: i, name: f.name, type: f.type, lb: x[i], dmLb: perLb(f).dm * x[i], cost: lbPrice(f) * x[i], ton: f.ton })).filter((it) => it.lb > 1e-4).sort((a, b) => b.cost - a.cost);
  const marginal = {};
  for (const k of Object.keys(STEP)) {
    const r = relaxed(spec, { [k]: STEP[k] });
    marginal[k] = r.status === "optimal" ? { per: STEP[k], extra: Math.max(0, r.cost - root.cost) } : null;
  }
  const head = Number(spec.head), days = Number(spec.days), waste = 1 + Number(spec.waste) / 100;
  const buy = items.map((it) => ({ name: it.name, tons: (it.lb * head * days * waste) / 2000, cost: (it.lb * head * days * waste * it.ton) / 2000 }));
  const entry = [];
  const used = new Set(items.map((it) => it.index));
  spec.feeds.forEach((f, i) => { if (!used.has(i)) entry.push({ name: f.name, ton: f.ton, enters: entryPrice(spec, i) }); });
  return {
    status: "optimal", x, items, totals: t, cost: root.cost, perHeadMonth: root.cost * 30,
    herdDay: root.cost * head, herdPeriod: root.cost * head * days * waste, marginal, buy, entry,
    cpPct: (t.cp / t.dm) * 100, tdnPct: (t.tdn / t.dm) * 100, caPct: (t.ca / t.dm) * 100, pPct: (t.p / t.dm) * 100,
    caP: t.p > 0 ? t.ca / t.p : null, foragePct: (t.forageDm / t.dm) * 100, asFed: x.reduce((s, v) => s + v, 0),
    feasible: planFeasible(spec, x),
  };
}

/** Independent check of a result. */
export function verifyPlan(spec, res) {
  const problems = [];
  if (res.status !== "optimal") return problems;
  if (!planFeasible(spec, res.x)) problems.push("The ration breaks a requirement or a feed maximum.");
  if (Math.abs(planCost(spec, res.x) - res.cost) > 1e-6) problems.push("Reported cost does not match the pounds.");
  return problems;
}

export const money2 = (x) => (Number.isFinite(x) ? (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2) : "—");
export const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }) : "—");

export function planCsv(spec, res) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["Feed", "Lb as-fed per head per day", "Dry matter lb", "Cost per head per day", "Tons to buy for the period (with waste)"].join(",")];
  for (const it of res.items) {
    const b = res.buy.find((r) => r.name === it.name);
    rows.push([q(it.name), it.lb.toFixed(2), it.dmLb.toFixed(2), it.cost.toFixed(3), b ? b.tons.toFixed(2) : ""].join(","));
  }
  rows.push([q("Total"), res.asFed.toFixed(2), res.totals.dm.toFixed(2), res.cost.toFixed(3), ""].join(","));
  return rows.join("\n") + "\n";
}

// Approximate book values on a dry-matter basis; EXAMPLE prices, edit to your supplier.
export const SAMPLE_FEEDS = [
  "# name | $ per ton as-fed | DM % | CP % of DM | TDN % of DM | Ca % | P % | F forage, C concentrate, M mineral | max lb per day",
  "Grass hay, mid-maturity | 180 | 88 | 10 | 55 | 0.45 | 0.25 | F",
  "Alfalfa hay | 260 | 89 | 18 | 60 | 1.30 | 0.25 | F",
  "Wheat straw | 90 | 90 | 4 | 40 | 0.18 | 0.07 | F | 8",
  "Corn silage | 55 | 35 | 8.5 | 70 | 0.28 | 0.25 | F | 45",
  "Cottonseed hulls | 150 | 91 | 4.2 | 42 | 0.15 | 0.09 | F | 8",
  "Corn grain, cracked | 240 | 88 | 9.5 | 88 | 0.03 | 0.30 | C | 8",
  "Soybean meal, 48% | 380 | 90 | 53 | 84 | 0.35 | 0.72 | C | 4",
  "Dried distillers grains | 230 | 90 | 30 | 90 | 0.20 | 0.80 | C | 6",
  "Soyhulls | 210 | 91 | 12 | 77 | 0.55 | 0.18 | C | 8",
  "Wheat middlings | 190 | 89 | 18 | 78 | 0.15 | 1.00 | C | 6",
  "Limestone | 150 | 100 | 0 | 0 | 38 | 0.02 | M | 0.5",
  "Dicalcium phosphate | 850 | 100 | 0 | 0 | 22 | 18.5 | M | 0.3",
].join("\n");

export function sampleSpec(key = "cow-mid") {
  return { ...applyPreset(key), feeds: parseFeeds(SAMPLE_FEEDS).feeds };
}
