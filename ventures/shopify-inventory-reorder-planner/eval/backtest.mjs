// Replay the planner's reorder points on a real store's order lines and count what a seller
// who followed them would have lived through: units sold vs. lost, stock-outs during a lead time,
// and the stock carried.
//
//   node eval/backtest.mjs <orders.csv> [--lead 14] [--cycle 28] [--window 365] [--methods normal,auto] [--levels 0.9,0.95]
//
// Data used for the published numbers: UCI Machine Learning Repository "Online Retail II"
// (Daqing Chen; CC BY 4.0; archive.ics.uci.edu/dataset/502), a UK online giftware seller's
// 1,067,371 order lines, 2009-12-01 to 2011-12-09. Both sheets of online_retail_II.xlsx
// (sha256 bcbe73b3...2e980) were written to one CSV with the file's own header (Invoice,
// StockCode, Description, Quantity, InvoiceDate, Price, Customer ID, Country); the steps are in
// eval/backtest-2026-11-22.md. Any orders CSV the page reads works.
//
// Method, per SKU: every `cycle` days through the holdout year the planner is rerun on the
// trailing `window` days of orders (what a seller who re-exports monthly would do). Between
// reruns a daily continuous-review policy runs on the real demand: when stock on hand plus on
// order is at or below the reorder point, order up to the target; orders land `lead` days later;
// demand that finds no stock is lost. Stock starts at the first plan's target.
import { readFileSync } from "node:fs";
import { analyze, parseCsv, normalizeSales } from "../calc.mjs";

const DAY = 86400000;
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && !/^\d/.test(a));
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const LEAD = +opt("lead", 14), CYCLE = +opt("cycle", 28), WINDOW = +opt("window", 365);
const LEVELS = opt("levels", "0.9,0.95,0.98,0.99").split(",").map(Number);
const METHODS = opt("methods", "normal,auto").split(",");
if (!file) { console.error("usage: node eval/backtest.mjs <orders.csv> [--lead 14] [--cycle 28] [--window 365]"); process.exit(2); }

// Read through the page's own parser, so the replay sees what a seller's upload would.
const t0 = Date.now();
const table = parseCsv(readFileSync(file, "utf8"));
const norm = normalizeSales(table);
// Online Retail II: keep product codes (five digits, optional letter); POST, M, DOT, BANK CHARGES,
// AMAZONFEE and similar are fees and adjustments, not stock.
const sales = norm.items.filter((s) => /^\d{5}[a-z]*$/i.test(s.sku));
let tMin = Infinity, tMax = -Infinity;
for (const s of sales) { if (s.t < tMin) tMin = s.t; if (s.t > tMax) tMax = s.t; }
const day0 = Math.floor(tMin / DAY) * DAY, lastDay = Math.floor(tMax / DAY) * DAY;
const nDays = (lastDay - day0) / DAY + 1;
const skuIdx = new Map(), skuList = [];
for (const s of sales) { const k = s.sku.toLowerCase(); if (!skuIdx.has(k)) { skuIdx.set(k, skuList.length); skuList.push(s.sku); } }
// Daily net demand per SKU (returns netted within the day, then floored at zero: a return is not
// demand a shelf has to meet).
const daily = skuList.map(() => new Float64Array(nDays));
for (const s of sales) daily[skuIdx.get(s.sku.toLowerCase())][Math.floor((s.t - day0) / DAY)] += s.qty;
for (const d of daily) for (let i = 0; i < nDays; i++) if (d[i] < 0) d[i] = 0;
const price = new Float64Array(skuList.length), priced = new Float64Array(skuList.length);
for (const s of sales) if (s.price !== null && s.qty > 0) { const i = skuIdx.get(s.sku.toLowerCase()); price[i] += s.qty * s.price; priced[i] += s.qty; }
for (let i = 0; i < price.length; i++) price[i] = priced[i] ? price[i] / priced[i] : 0;
console.error(`read ${table.length - 1} rows, ${sales.length} product lines, ${skuList.length} SKUs, ${nDays} days in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// Holdout: the last 364 days (13 plans of 28 days); the first plan sees the WINDOW days before it.
const H0 = nDays - 364;
const planDays = []; for (let d = H0; d < nDays; d += CYCLE) planDays.push(d);
const salesSorted = sales.slice().sort((a, b) => a.t - b.t);

// Plans: per plan day, per SKU {rop, target, velocity}. "normal" is the shipped rule (analyze()).
function plans(level, method) {
  const out = [];
  for (const pd of planDays) {
    const asOf = day0 + pd * DAY - 1, from = asOf - WINDOW * DAY;
    const win = salesSorted.filter((s) => s.t > from && s.t <= asOf);
    const r = analyze(win, [], { leadDays: LEAD, cycleDays: CYCLE, serviceLevel: level, asOf, safetyMethod: method });
    const m = new Map();
    for (const row of r.rows) {
      const i = skuIdx.get(row.sku.toLowerCase());
      if (i === undefined) continue;
      m.set(i, { rop: row.reorderPoint, target: row.velocity * (LEAD + CYCLE) + row.safety, velocity: row.velocity });
    }
    out.push(m);
  }
  return out;
}

// Syntetos-Boylan-Croston class on the year before the holdout: ADI 1.32 and CV^2 0.49 cut-offs.
function sbClass(d) {
  const nz = []; for (let i = Math.max(0, H0 - 365); i < H0; i++) if (d[i] > 0) nz.push(d[i]);
  if (nz.length < 2) return null;
  const adi = 365 / nz.length, m = nz.reduce((a, b) => a + b, 0) / nz.length;
  const cv2 = nz.reduce((a, b) => a + (b - m) ** 2, 0) / (nz.length - 1) / m ** 2;
  return adi < 1.32 ? (cv2 < 0.49 ? "smooth" : "erratic") : (cv2 < 0.49 ? "intermittent" : "lumpy");
}

function simulate(P) {
  const res = [];
  for (let i = 0; i < skuList.length; i++) {
    const p0 = P[0].get(i);
    if (!p0 || p0.velocity <= 0) continue;
    const d = daily[i];
    let dem = 0; for (let t = H0; t < nDays; t++) dem += d[t];
    if (dem <= 0) continue;
    let onHand = Math.ceil(p0.target), served = 0, lost = 0, invDays = 0;
    const pipe = []; // {arrive, qty}
    const orders = []; // {placed, arrive, short}
    for (let t = H0; t < nDays; t++) {
      for (let k = pipe.length - 1; k >= 0; k--) if (pipe[k].arrive === t) { onHand += pipe[k].qty; pipe.splice(k, 1); }
      const s = Math.min(onHand, d[t]); served += s; lost += d[t] - s; onHand -= s;
      if (d[t] - s > 0) for (const o of orders) if (t >= o.placed && t <= o.arrive) o.short = true;
      invDays += onHand;
      const p = P[Math.min(P.length - 1, Math.floor((t - H0) / CYCLE))].get(i);
      if (!p || p.velocity <= 0) continue;
      const position = onHand + pipe.reduce((a, b) => a + b.qty, 0);
      if (position <= p.rop) { const q = Math.ceil(p.target - position); if (q > 0) { pipe.push({ arrive: t + LEAD, qty: q }); orders.push({ placed: t, arrive: t + LEAD, short: false }); } }
    }
    // A lead time still open at the end has not been lived through: leave it out.
    const done = orders.filter((o) => o.arrive < nDays);
    res.push({ i, cls: sbClass(d), dem, served, lost, avgInv: invDays / (nDays - H0), invValue: (invDays / (nDays - H0)) * price[i], cycles: done.length, shortCycles: done.filter((o) => o.short).length });
  }
  return res;
}

const agg = (rs) => {
  const s = (f) => rs.reduce((a, r) => a + f(r), 0);
  const dem = s((r) => r.dem), served = s((r) => r.served), cyc = s((r) => r.cycles), sc = s((r) => r.shortCycles);
  return { skus: rs.length, fill: served / dem, csl: cyc ? 1 - sc / cyc : NaN, cycles: cyc, inv: s((r) => r.invValue), meanSkuFill: s((r) => r.served / r.dem) / rs.length };
};
const pct = (x) => (100 * x).toFixed(1).padStart(5);
console.log(`# node eval/backtest.mjs ${file.split("/").pop()} --lead ${LEAD} --cycle ${CYCLE} --window ${WINDOW} (holdout ${new Date(day0 + H0 * DAY).toISOString().slice(0, 10)} to ${new Date(lastDay).toISOString().slice(0, 10)}, ${planDays.length} plans)`);
console.log(`# fill = units sold / units demanded; CSL = share of lead times with no lost sale (what the service level setting promises); stock = mean on-hand at average selling price`);
console.log("method  target  class         SKUs   fill   CSL  lead-times  stock (GBP)  mean SKU fill");
const runs = {};
for (const method of METHODS) for (const lv of LEVELS) {
  const rs = simulate(plans(lv, method));
  runs[method + lv] = rs;
  const line = (cls, a) => console.log(`${method.padEnd(7)} ${pct(lv)}%  ${cls.padEnd(12)} ${String(a.skus).padStart(5)}  ${pct(a.fill)} ${pct(a.csl)}  ${String(a.cycles).padStart(10)}  ${Math.round(a.inv).toLocaleString("en-GB").padStart(11)}  ${pct(a.meanSkuFill)}`);
  line("all", agg(rs));
  for (const c of ["smooth", "erratic", "intermittent", "lumpy"]) { const sub = rs.filter((r) => r.cls === c); if (sub.length) line(c, agg(sub)); }
}

// Paired bootstrap over SKUs (2,000 resamples, fixed seed): the second method minus the first, at
// each setting, for lead-time CSL (points), fill (points) and stock (%).
if (METHODS.length >= 2) {
  const [a, b] = METHODS;
  let seed = 20261122; const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; // mulberry32
  console.log(`\n# paired bootstrap over SKUs, ${b} minus ${a}, 2,000 resamples: mean [2.5%, 97.5%]`);
  console.log("target  CSL (pts)              fill (pts)             stock (%)");
  for (const lv of LEVELS) {
    const A = new Map(runs[a + lv].map((r) => [r.i, r])), B = runs[b + lv].filter((r) => A.has(r.i));
    const pairs = B.map((r) => [A.get(r.i), r]);
    const stat = (idx) => {
      let ac = 0, as = 0, bc = 0, bs = 0, ad = 0, aS = 0, bS = 0, ai = 0, bi = 0;
      for (const k of idx) { const [x, y] = pairs[k]; ac += x.cycles; as += x.shortCycles; bc += y.cycles; bs += y.shortCycles; ad += x.dem; aS += x.served; bS += y.served; ai += x.invValue; bi += y.invValue; }
      return [100 * ((1 - bs / bc) - (1 - as / ac)), 100 * (bS - aS) / ad, 100 * (bi / ai - 1)];
    };
    const full = stat(pairs.map((_, k) => k));
    const boots = [];
    for (let rep = 0; rep < 2000; rep++) boots.push(stat(pairs.map(() => Math.floor(rnd() * pairs.length))));
    const ci = (j) => { const v = boots.map((x) => x[j]).sort((p, q) => p - q); return `${full[j].toFixed(1).padStart(5)} [${v[50].toFixed(1)}, ${v[1949].toFixed(1)}]`.padEnd(23); };
    console.log(`${pct(lv)}%  ${ci(0)}${ci(1)}${ci(2)}`);
  }
}
