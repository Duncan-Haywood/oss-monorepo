// Shipping box assortment optimizer. Pure functions, no DOM.
//
// The question: you can only keep a handful of carton sizes on the shelf, and
// every order ships in the cheapest one it fits. Which K sizes should those be,
// and what does each extra size save a month?
//
// That is the p-median (cardinality-constrained facility location) problem:
// choose at most K "facilities" (box sizes) from a candidate list so that the
// sum over "customers" (SKUs, weighted by monthly orders) of the cheapest
// assigned cost is minimal. The landed cost of SKU s in box b is postage at
// the carrier's billable weight (the greater of actual and dimensional
// weight, rounded up) plus the box itself plus the void fill for the empty
// space. Small instances are solved exactly by enumeration; larger ones by a
// greedy start polished with Teitz-Bart vertex-substitution (1-swap) local
// search, and the report says which.
//
// Arithmetic on figures the user types. No carrier rate, box price or
// surcharge table is asserted here.

export const DEFAULTS = Object.freeze({
  paddingIn: 0.5,
  wallIn: 0.125,
  dimDivisor: 139,
  firstLb: 9.5,
  addlLb: 0.85,
  voidFillPerCuFt: 0.35,
  boardLbPerSqFt: 0.1,
  maxSizes: 6,
  holdingPerSize: 25,
  customBase: 0.6,
  customPerSqFt: 0.18,
});

export const EXACT_LIMIT = 3_000_000; // combinations x SKUs evaluated before falling back to local search
export const MAX_CANDIDATES = 400;
export const MAX_K = 10;
export const MULTI_STARTS = 8; // extra local-search starts when the exact search is too big

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

const cellsOf = (line) =>
  (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));

const desc = (a) => [...a].sort((x, y) => y - x);

// SKUs: "name, length, width, height, weight lb, orders per month". Dims are
// the product as it goes into the box, in inches. Header optional.
export function parseSkus(text) {
  const rows = [], warnings = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const c = cellsOf(line);
    if (c.length < 5) { skipped++; continue; }
    const [l, w, h, wt] = [1, 2, 3, 4].map((i) => num(c[i], NaN));
    if (![l, w, h, wt].every(Number.isFinite)) {
      if (rows.length || !/name|sku|length|weight/i.test(line)) skipped++;
      continue;
    }
    const qty = num(c[5], 1);
    if (!(l > 0 && w > 0 && h > 0 && wt >= 0 && qty >= 0) || !Number.isFinite(qty)) { skipped++; continue; }
    rows.push({ name: c[0] || `SKU ${rows.length + 1}`, dims: desc([l, w, h]), weight: wt, qty });
  }
  if (skipped) warnings.push(`${skipped} product line(s) skipped (need a name, three positive dimensions, a weight, and orders per month).`);
  if (!rows.length) return { error: "Add at least one product: name, length, width, height (inches), weight (lb), orders per month." };
  if (!rows.some((r) => r.qty > 0)) return { error: "At least one product needs orders per month above zero." };
  return { rows, warnings };
}

// Boxes: "name, inside length, width, height, cost per box". A leading * on
// the name marks a size you stock today (the baseline the savings are measured
// against).
export function parseBoxes(text) {
  const rows = [], warnings = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const c = cellsOf(line);
    if (c.length < 4) { skipped++; continue; }
    const [l, w, h] = [1, 2, 3].map((i) => num(c[i], NaN));
    if (![l, w, h].every(Number.isFinite)) {
      if (rows.length || !/name|box|length|cost/i.test(line)) skipped++;
      continue;
    }
    const cost = num(c[4], 0);
    if (!(l > 0 && w > 0 && h > 0) || !(cost >= 0)) { skipped++; continue; }
    let name = c[0] || "";
    const current = name.startsWith("*");
    name = name.replace(/^\*\s*/, "") || `${l}x${w}x${h}`;
    rows.push({ name, dims: desc([l, w, h]), cost, current, custom: false });
  }
  if (skipped) warnings.push(`${skipped} box line(s) skipped (need a name, three positive inside dimensions and a cost).`);
  return { rows, warnings };
}

// Optional rate card: "billable lb, price" per line. Prices between listed
// weights take the next listed weight up; beyond the last, the last step's
// per-pound slope continues.
export function parseRateTable(text) {
  const pts = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const c = line.split(/[,\t=:]/).map((s) => s.trim());
    const lb = num(c[0], NaN), price = num(c[1], NaN);
    if (Number.isFinite(lb) && Number.isFinite(price) && lb > 0 && price >= 0) pts.push([lb, price]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  return pts;
}

export function postage(lb, o, table) {
  if (table && table.length) {
    for (const [w, p] of table) if (lb <= w + 1e-9) return p;
    if (table.length === 1) return table[0][1];
    const [w1, p1] = table[table.length - 2], [w2, p2] = table[table.length - 1];
    const slope = (p2 - p1) / (w2 - w1);
    return p2 + slope * (lb - w2);
  }
  return o.firstLb + o.addlLb * Math.max(0, lb - 1);
}

// Does an item (sorted dims) plus padding on every side fit a box (sorted inside dims)?
// Sorting both descending and comparing pairwise is exact for one cuboid in
// another with axis-aligned rotations.
export function fits(itemDims, boxDims, padding = 0) {
  for (let i = 0; i < 3; i++) if (itemDims[i] + 2 * padding > boxDims[i] + 1e-9) return false;
  return true;
}

const roundHalfUp = (x) => Math.floor(x + 0.5 + 1e-9);
const ceilLb = (x) => Math.max(1, Math.ceil(x - 1e-9));

// Landed cost of shipping one unit of `sku` in `box`, or null if it does not fit.
export function landedCost(sku, box, o, table) {
  if (!fits(sku.dims, box.dims, o.paddingIn)) return null;
  const outer = box.dims.map((d) => d + 2 * o.wallIn);
  const rounded = outer.map(roundHalfUp);
  const cube = rounded[0] * rounded[1] * rounded[2];
  const dimWeight = cube / o.dimDivisor;
  const area = 2 * (outer[0] * outer[1] + outer[0] * outer[2] + outer[1] * outer[2]) / 144;
  const actual = sku.weight + area * o.boardLbPerSqFt;
  const billable = ceilLb(Math.max(actual, dimWeight));
  const ship = postage(billable, o, table);
  const voidCuFt = Math.max(0, box.dims[0] * box.dims[1] * box.dims[2] - sku.dims[0] * sku.dims[1] * sku.dims[2]) / 1728;
  const fill = voidCuFt * o.voidFillPerCuFt;
  return {
    total: ship + box.cost + fill,
    ship, fill, boxCost: box.cost, billable, dimWeight, actual,
    dimBilled: dimWeight > actual, cube, voidCuFt,
  };
}

// Custom candidates: each SKU's padded size rounded up to the inch, and the
// pairwise envelopes of those, priced from board area.
export function customCandidates(skus, o) {
  const seen = new Map();
  const add = (dims, why) => {
    const d = desc(dims.map((x) => Math.ceil(x - 1e-9)));
    const key = d.join("x");
    if (seen.has(key)) return;
    const outer = d.map((x) => x + 2 * o.wallIn);
    const area = 2 * (outer[0] * outer[1] + outer[0] * outer[2] + outer[1] * outer[2]) / 144;
    seen.set(key, { name: `Custom ${key}`, dims: d, cost: o.customBase + o.customPerSqFt * area, current: false, custom: true, why });
  };
  const padded = skus.map((s) => s.dims.map((x) => x + 2 * o.paddingIn));
  padded.forEach((p, i) => add(p, skus[i].name));
  for (let i = 0; i < padded.length; i++)
    for (let j = i + 1; j < padded.length; j++)
      add([0, 1, 2].map((k) => Math.max(padded[i][k], padded[j][k])), `${skus[i].name} + ${skus[j].name}`);
  return [...seen.values()];
}

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) { r = (r * (n - k + i)) / i; if (r > 1e12) return Infinity; }
  return Math.round(r);
}

// Cost of a set of candidate indices: sum over SKUs of qty x cheapest fitting
// box in the set. Uncovered SKUs carry `penalty[s]` so search can still move.
function setCost(set, C, qty, penalty) {
  let total = 0, uncovered = 0;
  for (let s = 0; s < qty.length; s++) {
    let best = Infinity;
    for (const b of set) { const c = C[s][b]; if (c < best) best = c; }
    if (best === Infinity) { uncovered++; total += penalty[s]; } else total += qty[s] * best;
  }
  return { total, uncovered };
}

function exactBest(n, k, C, qty, penalty) {
  let best = null;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    const r = setCost(idx, C, qty, penalty);
    if (!best || r.total < best.total - 1e-9) best = { set: [...idx], ...r };
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return best;
}

// Greedy add, then Teitz-Bart 1-swap until no swap improves.
function localSearch(n, k, C, qty, penalty, start) {
  let set = start ? [...start] : [];
  const inSet = new Set(set);
  while (set.length < k) {
    let bestB = -1, bestT = Infinity;
    for (let b = 0; b < n; b++) {
      if (inSet.has(b)) continue;
      const t = setCost([...set, b], C, qty, penalty).total;
      if (t < bestT - 1e-9) { bestT = t; bestB = b; }
    }
    if (bestB < 0) break;
    set.push(bestB); inSet.add(bestB);
  }
  let cur = setCost(set, C, qty, penalty);
  let improved = true, passes = 0;
  while (improved && passes < 50) {
    improved = false; passes++;
    for (let i = 0; i < set.length; i++) {
      for (let b = 0; b < n; b++) {
        if (inSet.has(b)) continue;
        const trial = [...set]; trial[i] = b;
        const r = setCost(trial, C, qty, penalty);
        if (r.total < cur.total - 1e-9) {
          inSet.delete(set[i]); inSet.add(b);
          set = trial; cur = r; improved = true;
        }
      }
    }
  }
  return { set: [...set].sort((a, b) => a - b), ...cur };
}

export function solveK(k, C, qty, penalty, n, warmStart, forceHeuristic = false) {
  const kk = Math.min(k, n);
  const combos = choose(n, kk);
  if (!forceHeuristic && combos * qty.length <= EXACT_LIMIT) return { ...exactBest(n, kk, C, qty, penalty), exact: true };
  // Multi-start: greedy from empty, from the previous K's answer, and with
  // each of the best few single sizes forced in first. 1-swap search is a
  // local optimum, so several starts buy most of the gap to the exact answer.
  let best = localSearch(n, kk, C, qty, penalty, null);
  const consider = (start) => {
    const r = localSearch(n, kk, C, qty, penalty, start);
    if (r.total < best.total - 1e-9) best = r;
  };
  if (warmStart && warmStart.length < kk) consider(warmStart);
  const singles = Array.from({ length: n }, (_, b) => [b, setCost([b], C, qty, penalty).total])
    .sort((a, b) => a[1] - b[1]).slice(0, MULTI_STARTS).map(([b]) => b);
  for (const b of singles) consider([b]);
  return { ...best, exact: false };
}

const clean = (opts) => {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (opts && opts[k] !== undefined) o[k] = num(opts[k], DEFAULTS[k]);
  return o;
};

export function analyze(skus, boxes, opts = {}) {
  const o = clean(opts);
  for (const k of Object.keys(DEFAULTS)) if (!Number.isFinite(o[k]) || o[k] < 0) return { error: `Check the number in "${k}".` };
  if (o.dimDivisor <= 0) return { error: "The DIM divisor must be above zero." };
  o.maxSizes = Math.max(1, Math.min(MAX_K, Math.round(o.maxSizes)));
  const table = parseRateTable(opts.rateTable);
  const useCustom = Boolean(opts.includeCustom);
  const warnings = [];

  let candidates = boxes.map((b) => ({ ...b }));
  if (useCustom) candidates = candidates.concat(customCandidates(skus, o));
  // Drop exact duplicates (keep the cheaper, and keep the "current" flag).
  const byKey = new Map();
  for (const b of candidates) {
    const key = b.dims.join("x");
    const prev = byKey.get(key);
    if (!prev || b.cost < prev.cost - 1e-9) byKey.set(key, prev && prev.current ? { ...b, current: true } : b);
    else if (b.current) prev.current = true;
  }
  candidates = [...byKey.values()];
  if (!candidates.length) return { error: "Add at least one box size, or tick “also consider custom sizes”." };

  // Drop candidates nothing fits in, then cap the list.
  candidates = candidates.filter((b) => skus.some((s) => fits(s.dims, b.dims, o.paddingIn)));
  if (candidates.length > MAX_CANDIDATES) {
    const keep = candidates.filter((b) => b.current);
    const rest = candidates.filter((b) => !b.current).sort((a, b) => a.dims[0] * a.dims[1] * a.dims[2] - b.dims[0] * b.dims[1] * b.dims[2]);
    candidates = keep.concat(rest.slice(0, MAX_CANDIDATES - keep.length));
    warnings.push(`Only the ${MAX_CANDIDATES} smallest candidate sizes were searched.`);
  }

  const active = skus.filter((s) => s.qty > 0);
  const homeless = active.filter((s) => !candidates.some((b) => fits(s.dims, b.dims, o.paddingIn)));
  for (const s of homeless) warnings.push(`“${s.name}” fits none of the boxes with ${o.paddingIn}" padding, so it is left out of every total.`);
  const fitSkus = active.filter((s) => !homeless.includes(s));
  if (!fitSkus.length) return { error: "No product fits any box. Check the dimensions, the padding, or add larger sizes." };
  if (!candidates.length) return { error: "No box fits any product. Check the dimensions and padding." };

  const n = candidates.length;
  const detail = fitSkus.map((s) => candidates.map((b) => landedCost(s, b, o, table)));
  const C = detail.map((row) => row.map((d) => (d ? d.total : Infinity)));
  const qty = fitSkus.map((s) => s.qty);
  const penalty = C.map((row, s) => 10 * qty[s] * Math.max(...row.filter(Number.isFinite)) + 1000);

  const oversize = candidates.filter((b) => b.dims[0] + 2 * o.wallIn > 48);
  if (oversize.length) warnings.push(`${oversize.length} candidate size(s) are over 48" on the longest side, where carriers commonly add handling surcharges this tool does not price.`);

  // The floor: every SKU in its own cheapest candidate, unlimited sizes.
  const floor = C.reduce((t, row, s) => t + qty[s] * Math.min(...row), 0);
  const floorSizes = new Set(C.map((row) => row.indexOf(Math.min(...row)))).size;

  const plan = (set) => {
    const assign = fitSkus.map((s, i) => {
      let bi = -1, best = Infinity;
      for (const b of set) if (C[i][b] < best) { best = C[i][b]; bi = b; }
      return bi < 0 ? { sku: s, box: null } : { sku: s, box: candidates[bi], idx: bi, ...detail[i][bi], monthly: s.qty * detail[i][bi].total };
    });
    const monthly = assign.reduce((t, a) => t + (a.box ? a.monthly : 0), 0);
    const orders = assign.reduce((t, a) => t + (a.box ? a.sku.qty : 0), 0);
    const lb = assign.reduce((t, a) => t + (a.box ? a.billable * a.sku.qty : 0), 0);
    const dimOrders = assign.reduce((t, a) => t + (a.box && a.dimBilled ? a.sku.qty : 0), 0);
    const uncovered = assign.filter((a) => !a.box).map((a) => a.sku.name);
    const boxesUsed = set.map((b) => ({
      ...candidates[b],
      orders: assign.reduce((t, a) => t + (a.idx === b ? a.sku.qty : 0), 0),
      skus: assign.filter((a) => a.idx === b).map((a) => a.sku.name),
    })).sort((a, b) => a.dims[0] * a.dims[1] * a.dims[2] - b.dims[0] * b.dims[1] * b.dims[2]);
    return { assign, monthly, orders, avgBillable: orders ? lb / orders : 0, dimShare: orders ? dimOrders / orders : 0, uncovered, boxes: boxesUsed };
  };

  // Baseline: the sizes stocked today.
  const currentIdx = candidates.map((b, i) => (b.current ? i : -1)).filter((i) => i >= 0);
  const baseline = currentIdx.length ? plan(currentIdx) : null;
  if (baseline && baseline.uncovered.length)
    warnings.push(`With today's boxes, ${baseline.uncovered.join(", ")} fit${baseline.uncovered.length === 1 ? "s" : ""} nothing, so today's total leaves ${baseline.uncovered.length === 1 ? "it" : "them"} out.`);

  // Solve K = 1..maxSizes, warm-starting each from the previous answer.
  const curve = [];
  let prev = null;
  for (let k = 1; k <= Math.min(o.maxSizes, n); k++) {
    const sol = solveK(k, C, qty, penalty, n, prev ? prev.set : null);
    // Monotone guard: adding a size can never hurt (the old set is still allowed).
    if (prev && prev.total < sol.total - 1e-9) Object.assign(sol, { set: prev.set, total: prev.total, uncovered: prev.uncovered });
    const p = plan(sol.set);
    curve.push({
      k, set: sol.set, exact: sol.exact, feasible: sol.uncovered === 0,
      monthly: p.monthly, withHolding: p.monthly + k * o.holdingPerSize, plan: p,
    });
    prev = sol;
  }
  curve.forEach((c, i) => { c.marginal = i === 0 ? null : curve[i - 1].monthly - c.monthly; });

  const feasible = curve.filter((c) => c.feasible);
  const recommended = feasible.length ? feasible.reduce((a, c) => (c.withHolding < a.withHolding - 1e-9 ? c : a)) : curve[curve.length - 1];
  const minFeasibleK = feasible.length ? feasible[0].k : null;
  if (!feasible.length) warnings.push(`Covering every product needs more than ${o.maxSizes} sizes from this list. Raise the size limit or add a larger box.`);

  // Like-for-like: same number of sizes as today, chosen by the optimizer.
  const sameCount = baseline ? curve.find((c) => c.k === currentIdx.length) || null : null;

  let verdict;
  const totalOrders = qty.reduce((a, b) => a + b, 0);
  if (baseline && !baseline.uncovered.length) {
    const save = baseline.monthly - recommended.monthly;
    verdict = save > 0.005
      ? `Stocking the ${recommended.k} size${recommended.k === 1 ? "" : "s"} below instead of today's ${currentIdx.length} saves about ${money(save)} a month on ${fmtInt(totalOrders)} orders (${money(save * 12)} a year), before the cost of stocking each size.`
      : `Today's boxes are already as cheap as anything this candidate list offers at the size counts tried.`;
  } else {
    verdict = `${recommended.k} size${recommended.k === 1 ? "" : "s"} gives the lowest monthly cost once each stocked size is charged ${money(o.holdingPerSize)} a month.`;
  }

  return {
    options: o, warnings, candidates, rateTable: table,
    skus: fitSkus, homeless: homeless.map((s) => s.name), totalOrders,
    baseline, curve, recommended, minFeasibleK, sameCount,
    floor, floorSizes, verdict,
    searched: { candidates: n, exact: curve.every((c) => c.exact) },
  };
}

// "What if the carrier changes its rates or divisor?" Re-solves with the
// changed postage fields and prices the sets you would otherwise keep. Only
// dimDivisor, firstLb and addlLb change; a pasted rate card is dropped when
// either postage field changes, because the card would override it.
export function whatIf(skus, boxes, opts = {}, change = {}) {
  const base = analyze(skus, boxes, opts);
  if (base.error) return base;
  const next = { ...opts };
  let any = false;
  for (const k of ["dimDivisor", "firstLb", "addlLb"]) {
    if (change[k] !== undefined && change[k] !== "" && String(change[k]) !== String(opts[k] ?? DEFAULTS[k])) { next[k] = change[k]; any = true; }
  }
  if (!any) return { error: "Change at least one of the DIM divisor, first-pound price or additional-pound price." };
  if (next.firstLb !== opts.firstLb || next.addlLb !== opts.addlLb) next.rateTable = "";
  const after = analyze(skus, boxes, next);
  if (after.error) return after;

  // Price a set of boxes (by inside size) under the new rates.
  const key = (b) => b.dims.join("x");
  const priceSet = (set) => {
    const keys = new Set(set.map(key));
    const chosen = after.candidates.filter((b) => keys.has(key(b)));
    let monthly = 0, lost = [];
    for (const s of after.skus) {
      let best = Infinity;
      for (const b of chosen) { const d = landedCost(s, b, after.options, after.rateTable); if (d && d.total < best) best = d.total; }
      if (best === Infinity) lost.push(s.name); else monthly += s.qty * best;
    }
    return { monthly, lost };
  };
  const oldRec = base.recommended.plan.boxes;
  const newRec = after.recommended.plan.boxes;
  const oldKeys = new Set(oldRec.map(key)), newKeys = new Set(newRec.map(key));
  const keepOld = priceSet(oldRec);
  const today = base.baseline ? priceSet(base.baseline.boxes) : null;
  const sameSet = oldKeys.size === newKeys.size && [...oldKeys].every((k) => newKeys.has(k));
  const sameK = base.recommended.k === after.recommended.k;
  // Fair comparison: optimum at the old size count under the new rates.
  const sameCount = after.curve.find((c) => c.k === base.recommended.k) || after.recommended;
  const regret = keepOld.lost.length ? NaN : keepOld.monthly - sameCount.monthly;
  return {
    base, after, change: Object.fromEntries(["dimDivisor", "firstLb", "addlLb"].filter((k) => next[k] !== opts[k]).map((k) => [k, next[k]])),
    keepOldMonthly: keepOld.monthly, keepOldLost: keepOld.lost,
    todayUnderNew: today && !today.lost.length ? today.monthly : null,
    newBestMonthly: sameCount.monthly, regret, sameSet, sameK,
    added: newRec.filter((b) => !oldKeys.has(key(b))).map((b) => b.name),
    dropped: oldRec.filter((b) => !newKeys.has(key(b))).map((b) => b.name),
    baseMonthly: base.recommended.monthly, afterMonthly: after.recommended.monthly,
  };
}

export function money(x) {
  if (!Number.isFinite(x)) return "—";
  const s = Math.abs(x).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return (x < 0 ? "−$" : "$") + s;
}
export function money2(x) {
  if (!Number.isFinite(x)) return "—";
  return (x < 0 ? "−$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function pct(x, d = 0) { return Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : "—"; }
export function fmtInt(x) { return Math.round(x).toLocaleString("en-US"); }
export function dimsText(d) { return d.map((x) => +x.toFixed(2)).join(" × "); }

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function reportCsv(r) {
  const rows = [["section", "item", "box", "billable lb", "dim billed", "cost per order", "orders per month", "monthly cost"]];
  for (const a of r.recommended.plan.assign) {
    rows.push(["recommended", a.sku.name, a.box ? a.box.name : "none fits", a.box ? a.billable : "", a.box ? (a.dimBilled ? "yes" : "no") : "", a.box ? a.total.toFixed(2) : "", a.sku.qty, a.box ? a.monthly.toFixed(2) : ""]);
  }
  if (r.baseline) for (const a of r.baseline.assign) {
    rows.push(["today", a.sku.name, a.box ? a.box.name : "none fits", a.box ? a.billable : "", a.box ? (a.dimBilled ? "yes" : "no") : "", a.box ? a.total.toFixed(2) : "", a.sku.qty, a.box ? a.monthly.toFixed(2) : ""]);
  }
  for (const c of r.curve) rows.push(["sizes curve", `${c.k} size(s)`, c.plan.boxes.map((b) => b.name).join(" | "), "", "", "", "", c.monthly.toFixed(2)]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function sampleSkus() {
  return [
    "Candle 8oz tin,3.5,3.5,3,0.7,420",
    "Candle trio gift set,10,4,4,2.4,160",
    "Ceramic mug,5,4,4.5,0.9,300",
    "Mug pair,9,5,4.5,1.9,120",
    "Linen throw (folded),12,10,3,2.2,90",
    "Diffuser + oil set,8,4,9,1.6,140",
    "Large planter,11,11,10,4.5,45",
    "Wall print rolled,20,3,3,0.5,70",
  ].join("\n");
}

export function sampleBoxes() {
  return [
    "6x6x6,6,6,6,0.55",
    "8x6x4,8,6,4,0.50",
    "*8x8x8,8,8,8,0.80",
    "10x6x6,10,6,6,0.70",
    "12x6x6,12,6,6,0.80",
    "10x8x6,10,8,6,0.85",
    "12x9x4,12,9,4,0.90",
    "14x12x6,14,12,6,1.30",
    "*12x12x12,12,12,12,1.45",
    "14x14x14,14,14,14,1.90",
    "*22x14x10,22,14,10,2.60",
    "24x6x6,24,6,6,1.40",
  ].join("\n");
}
