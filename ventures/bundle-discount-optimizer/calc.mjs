// Bundle discount optimizer: which two products to bundle, and how big a discount
// pays for itself, from a store's own order history. Pure functions, no I/O.

export const DEFAULTS = {
  feePct: 2.9, // % taken from every dollar of revenue (payments + marketplace)
  handling: 1.5, // extra pack/ship cost per added item, dollars
  attachLift: 40, // % rise in how often one item's buyers also add the other, caused by a 10% bundle discount
  maxDiscount: 40, // largest discount searched, %
  minPairOrders: 3, // fewest orders containing both items for a pair to be considered
  bootstrap: 300,
  seed: 7,
  holdout: 0.3, // share of the newest orders held out to check the pairing persists
};

const REF_DISCOUNT = 0.1;
export const MIN_TRY_ORDERS = 10; // fewer paired orders than this is too thin to call a pairing real
export const GRID = [0.05, 0.1, 0.15, 0.2];

export const money = (n) => {
  const v = Math.round(Number(n) * 100) / 100;
  return (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
export const num = (n, d = 1) => (Math.round(Number(n) * 10 ** d) / 10 ** d).toLocaleString("en-US", { maximumFractionDigits: d });
export const pct = (x, d = 1) => `${num(x * 100, d)}%`;

function splitLine(line) {
  const sep = line.includes("\t") ? "\t" : line.includes(",") ? "," : line.includes(";") ? ";" : null;
  if (!sep) return line.trim().split(/\s{2,}/);
  const out = [];
  let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === sep && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const toNum = (s) => {
  const t = String(s ?? "").replace(/[$,\s]/g, "");
  if (t === "") return NaN;
  return Number(t);
};

const rows = (text) =>
  String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map(splitLine);

const isHeader = (cells, words) => cells.length > 0 && cells.some((c) => words.test(String(c).toLowerCase())) && !cells.some((c) => /^\$?\d+(\.\d+)?$/.test(c));

/** Products: sku, price, cost. */
export function parseProducts(text) {
  const all = rows(text);
  if (!all.length) return { error: "Add your products: one per line as sku, price, unit cost." };
  if (isHeader(all[0], /sku|product|item|price|cost|name/)) all.shift();
  const products = new Map();
  for (const [i, c] of all.entries()) {
    if (c.length < 3) return { error: `Product line ${i + 1} needs three values: sku, price, unit cost.` };
    const sku = c[0];
    const price = toNum(c[1]);
    const cost = toNum(c[2]);
    if (!sku) return { error: `Product line ${i + 1} has no sku.` };
    if (!(price > 0)) return { error: `Product "${sku}" needs a price above zero.` };
    if (!(cost >= 0)) return { error: `Product "${sku}" needs a unit cost of zero or more.` };
    if (products.has(sku)) return { error: `Product "${sku}" appears twice.` };
    products.set(sku, { sku, price, cost });
  }
  if (products.size < 2) return { error: "Add at least two products." };
  return { products };
}

/** Orders: order id, sku (one line per item). Quantity is ignored: an order either contains a product or not. */
export function parseOrders(text) {
  const all = rows(text);
  if (!all.length) return { error: "Paste your orders: one line per item as order id, sku." };
  if (isHeader(all[0], /order|sku|product|item|id/)) all.shift();
  const byOrder = new Map();
  for (const [i, c] of all.entries()) {
    if (c.length < 2) return { error: `Order line ${i + 1} needs an order id and a sku.` };
    const [id, sku] = c;
    if (!id || !sku) return { error: `Order line ${i + 1} is missing the order id or the sku.` };
    if (!byOrder.has(id)) byOrder.set(id, new Set());
    byOrder.get(id).add(sku);
  }
  if (byOrder.size < 10) return { error: `Only ${byOrder.size} orders found. Pairings need at least 10 orders, and a few hundred to be trusted.` };
  return { orders: [...byOrder.values()].map((s) => [...s]), orderIds: [...byOrder.keys()] };
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

/** Counts how many orders hold each product and each pair. */
export function countPairs(orders, skus) {
  const single = new Map(skus.map((s) => [s, 0]));
  const pair = new Map();
  for (const o of orders) {
    const items = o.filter((s) => single.has(s));
    for (const s of items) single.set(s, single.get(s) + 1);
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++) {
        const k = items[i] < items[j] ? `${items[i]}\u0001${items[j]}` : `${items[j]}\u0001${items[i]}`;
        pair.set(k, (pair.get(k) || 0) + 1);
      }
  }
  return { single, pair };
}

/**
 * Change in profit from offering bundle A+B at discount d (fraction of the two prices added together).
 * Orders already holding both pay less (a pure loss). The discount also raises how often a buyer of one item
 * adds the other, by a fraction m of the attach rate already observed (nAB/nA and nAB/nB), so a pair nobody
 * buys together gains nothing however cheap it is. Each added item is sold at the bundle price. Orders are
 * the unit: the fixed per-order fee is unchanged.
 */
export function bundleProfit({ pA, pB, cA, cB, nA, nB, nAB }, d, m, opts = {}) {
  const f = (opts.feePct ?? DEFAULTS.feePct) / 100;
  const h = opts.handling ?? DEFAULTS.handling;
  const nAonly = nA - nAB, nBonly = nB - nAB;
  const bundle = (pA + pB) * (1 - d);
  const loss = (pA + pB) * d * (1 - f);
  const gainAddB = (bundle - pA) * (1 - f) - cB - h; // an A-only order adds B
  const gainAddA = (bundle - pB) * (1 - f) - cA - h; // a B-only order adds A
  const addersB = nA > 0 ? nAonly * (nAB / nA) * m : 0; // A-only orders that add B
  const addersA = nB > 0 ? nBonly * (nAB / nB) * m : 0;
  const gain = addersB * gainAddB + addersA * gainAddA;
  return { bundle, loss: nAB * loss, gain, profit: gain - nAB * loss, gainAddA, gainAddB, nAonly, nBonly };
}

/** The attach-rate rise grows with the discount with diminishing returns: m = mRef * sqrt(d / 10%). */
export const liftAt = (mRef, d) => mRef * Math.sqrt(d / REF_DISCOUNT);

/** The rise in attach rate (a fraction of today's) the discount must cause to break even; Infinity if it cannot. */
export function breakEvenLift(c, d, opts = {}) {
  const at1 = bundleProfit(c, d, 1, opts); // gain is linear in m, so m = 1 gives the gain per unit
  if (!(at1.gain > 0)) return Infinity;
  return at1.loss / at1.gain;
}

function bestDiscount(c, mRef, opts) {
  const max = Math.round((opts.maxDiscount ?? DEFAULTS.maxDiscount));
  let best = { d: 0, profit: 0 };
  for (let k = 1; k <= max; k++) {
    const d = k / 100;
    const p = bundleProfit(c, d, liftAt(mRef, d), opts).profit;
    if (p > best.profit + 1e-9) best = { d, profit: p };
  }
  return best;
}

function attach(orders, a, b) {
  let nA = 0, nB = 0, nAB = 0;
  for (const o of orders) {
    const ha = o.includes(a), hb = o.includes(b);
    if (ha) nA++;
    if (hb) nB++;
    if (ha && hb) nAB++;
  }
  return { nA, nB, nAB };
}

export function analyze({ products, orders }, options = {}) {
  const opts = { ...DEFAULTS };
  for (const [k, v] of Object.entries(options)) if (Number.isFinite(v)) opts[k] = v;
  if (opts.feePct < 0 || opts.feePct >= 100) return { error: "The fee percentage must be between 0 and 100." };
  if (opts.attachLift <= 0 || opts.attachLift > 500) return { error: "The attach-rate rise must be above 0 and at most 500 percent." };
  const mRef = opts.attachLift / 100;
  const warnings = [];
  const skus = [...products.keys()];
  const unknown = new Set();
  const clean = orders.map((o) => o.filter((s) => (products.has(s) ? true : (unknown.add(s), false))));
  if (unknown.size) warnings.push(`${unknown.size} sku(s) in your orders are not in the product list and were ignored: ${[...unknown].slice(0, 6).join(", ")}${unknown.size > 6 ? "…" : ""}.`);
  const N = clean.length;
  const { single, pair } = countPairs(clean, skus);
  const cut = Math.max(1, Math.floor(N * (1 - opts.holdout)));
  const train = clean.slice(0, cut), test = clean.slice(cut);
  const cands = [];
  for (const [k, nAB] of pair) {
    if (nAB < opts.minPairOrders) continue;
    const [a, b] = k.split("\u0001");
    const A = products.get(a), B = products.get(b);
    const c = { pA: A.price, pB: B.price, cA: A.cost, cB: B.cost, nA: single.get(a), nB: single.get(b), nAB };
    const best = bestDiscount(c, mRef, opts);
    const dRef = best.d || REF_DISCOUNT;
    const pAB = nAB / N;
    const lift = pAB / ((c.nA / N) * (c.nB / N));
    const tr = attach(train, a, b), te = attach(test, a, b);
    const rate = (x) => (x.nA + x.nB > 0 ? (2 * x.nAB) / (x.nA + x.nB) : 0); // share of single-item presence that is paired
    const trainRate = rate(tr), testRate = rate(te);
    const testable = te.nA + te.nB >= 6;
    const persists = testable ? testRate >= 0.5 * trainRate && te.nAB >= 1 : null;
    cands.push({
      a, b, nameA: a, nameB: b, ...c, lift, best, dRef,
      bundlePrice: (c.pA + c.pB) * (1 - dRef),
      breakEven: best.d ? breakEvenLift(c, best.d, opts) : Infinity,
      trainRate, testRate, testable, persists, testPairs: te.nAB,
    });
  }
  cands.sort((x, y) => y.best.profit - x.best.profit || y.nAB - x.nAB);
  const top = cands.slice(0, 12);
  // Bootstrap the order history: how much of the estimate is luck in which orders happened to arrive?
  const rand = rng(opts.seed);
  const B = Math.max(0, Math.floor(opts.bootstrap));
  const sums = top.map(() => []);
  if (B > 0 && top.length) {
    const sets = top.map((c) => ({ a: c.a, b: c.b }));
    for (let r = 0; r < B; r++) {
      const cnt = top.map(() => ({ nA: 0, nB: 0, nAB: 0 }));
      for (let i = 0; i < N; i++) {
        const o = clean[Math.floor(rand() * N)];
        for (let t = 0; t < sets.length; t++) {
          const ha = o.includes(sets[t].a), hb = o.includes(sets[t].b);
          if (ha) cnt[t].nA++;
          if (hb) cnt[t].nB++;
          if (ha && hb) cnt[t].nAB++;
        }
      }
      for (let t = 0; t < top.length; t++) {
        const c = top[t];
        const d = c.best.d || REF_DISCOUNT;
        sums[t].push(bundleProfit({ ...c, ...cnt[t] }, d, liftAt(mRef, d), opts).profit);
      }
    }
  }
  const q = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
  top.forEach((c, t) => {
    c.grid = GRID.map((d) => ({ d, profit: bundleProfit(c, d, liftAt(mRef, d), opts).profit, breakEven: breakEvenLift(c, d, opts) }));
    c.p10 = q(sums[t], 0.1);
    c.p90 = q(sums[t], 0.9);
    const robust = c.breakEven <= liftAt(mRef, c.best.d) / 2;
    if (c.best.profit <= 0 || !Number.isFinite(c.breakEven)) c.verdict = "skip";
    else if (c.nAB < MIN_TRY_ORDERS) c.verdict = "thin";
    else if (robust && c.persists !== false && (c.p10 == null || c.p10 > 0)) c.verdict = "try";
    else c.verdict = "marginal";
  });
  const singles = skus.map((s) => ({ sku: s, orders: single.get(s), share: single.get(s) / N })).sort((x, y) => y.orders - x.orders);
  if (!cands.length) warnings.push(`No two products appear together in at least ${opts.minPairOrders} orders, so there is no pairing to price. Lower the minimum or add more order history.`);
  if (N < 100) warnings.push(`Only ${N} orders. Pairings from this few orders are noisy; read the "holds up" and range columns before acting.`);
  return { options: opts, orderCount: N, skuCount: skus.length, pairsConsidered: cands.length, bundles: top, singles, warnings };
}

export function bundlesCsv(r) {
  const head = "product_a,product_b,orders_with_both,best_discount_pct,bundle_price,break_even_attach_rise_pct,est_profit_change,range_low,range_high,verdict";
  const lines = r.bundles.map((c) => [c.a, c.b, c.nAB, Math.round(c.best.d * 100), c.bundlePrice.toFixed(2), Number.isFinite(c.breakEven) ? (c.breakEven * 100).toFixed(1) : "never", c.best.profit.toFixed(2), c.p10 == null ? "" : c.p10.toFixed(2), c.p90 == null ? "" : c.p90.toFixed(2), c.verdict].map((x) => (/[",]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : x)).join(","));
  return [head, ...lines].join("\n") + "\n";
}

// An invented store: eight products with three planted affinities, so the example shows
// what a real pairing looks like. Orders arrive oldest first.
const SAMPLE_PRODUCTS = [
  ["candle-cedar", 24, 7.5], ["candle-holder", 18, 5], ["wick-trimmer", 12, 3], ["soap-oat", 9, 2.6],
  ["soap-dish", 14, 4.2], ["lotion-bar", 13, 3.8], ["gift-box", 6, 1.9], ["linen-spray", 16, 4.4],
];

export function sampleProducts() {
  return "sku,price,unit cost\n" + SAMPLE_PRODUCTS.map((p) => p.join(",")).join("\n");
}

export function sampleOrders(count = 420, seed = 11) {
  const rand = rng(seed);
  const pick = () => {
    const r = rand();
    const items = [];
    const base = r < 0.3 ? "candle-cedar" : r < 0.5 ? "soap-oat" : r < 0.65 ? "lotion-bar" : r < 0.8 ? "linen-spray" : r < 0.9 ? "soap-dish" : r < 0.96 ? "wick-trimmer" : "gift-box";
    items.push(base);
    if (base === "candle-cedar" && rand() < 0.28) items.push("wick-trimmer");
    if (base === "candle-cedar" && rand() < 0.1) items.push("candle-holder");
    if (base === "soap-oat" && rand() < 0.33) items.push("soap-dish");
    if (base === "lotion-bar" && rand() < 0.2) items.push("gift-box");
    if (rand() < 0.07) items.push(["gift-box", "linen-spray", "lotion-bar"][Math.floor(rand() * 3)]);
    return [...new Set(items)];
  };
  const out = ["order id,sku"];
  for (let i = 1; i <= count; i++) for (const s of pick()) out.push(`A${1000 + i},${s}`);
  return out.join("\n");
}
