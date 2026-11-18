// Turns a pasted layout, SKU locations and orders into pick routes and cart
// batches, and compares picking policies on walking distance, hours and cost.
import { optimalRoute, sShapeRoute, largestGapRoute, returnRoute } from "./route.mjs";

export const DEFAULTS = {
  aisles: 10,
  baysPerAisle: 20,
  bayLengthFt: 4,
  aisleSpacingFt: 10,
  depotAisle: 1,
  backAisle: 1,
  cartOrders: 4,
  cartLines: 0,
  walkFtPerMin: 200,
  wagePerHour: 20,
  daysPerYear: 250,
};

export const LIMITS = { aisles: 60, baysPerAisle: 200, orders: 1500, lines: 12000 };

/** Layout geometry from the form numbers. Aisle a is at x=(a-1)*spacing; bay b is mid-bay. */
export function layoutFrom(inp) {
  const n = Math.round(inp.aisles);
  const aisleXs = Array.from({ length: n }, (_, i) => i * inp.aisleSpacingFt);
  return {
    aisleXs,
    aisleLength: inp.baysPerAisle * inp.bayLengthFt,
    depotX: (inp.depotAisle - 1) * inp.aisleSpacingFt,
    backAisle: Boolean(inp.backAisle),
  };
}

export function locationPoint(aisle, bay, inp) {
  return { x: (aisle - 1) * inp.aisleSpacingFt, y: (bay - 0.5) * inp.bayLengthFt };
}

export function validateInputs(inp) {
  const errs = [];
  const need = (k, ok, msg) => {
    if (!Number.isFinite(inp[k]) || !ok(inp[k])) errs.push(`${k}: ${msg}`);
  };
  need("aisles", (v) => v >= 1 && v <= LIMITS.aisles && Number.isInteger(v), `a whole number from 1 to ${LIMITS.aisles}`);
  need("baysPerAisle", (v) => v >= 1 && v <= LIMITS.baysPerAisle && Number.isInteger(v), `a whole number from 1 to ${LIMITS.baysPerAisle}`);
  need("bayLengthFt", (v) => v > 0 && v <= 100, "more than 0");
  need("aisleSpacingFt", (v) => v > 0 && v <= 200, "more than 0");
  need("depotAisle", (v) => v >= 0 && v <= inp.aisles + 1, "between 0 and one past the last aisle (decimals allowed)");
  need("cartOrders", (v) => v >= 1 && v <= 50 && Number.isInteger(v), "a whole number from 1 to 50");
  need("cartLines", (v) => v >= 0 && Number.isInteger(v), "0 (no limit) or a whole number");
  need("walkFtPerMin", (v) => v > 0, "more than 0");
  need("wagePerHour", (v) => v >= 0, "0 or more");
  need("daysPerYear", (v) => v >= 0 && v <= 366, "0 to 366");
  return errs;
}

const LOC_RE = /^(\d+)\s*[-/.]\s*(\d+)$/;

/** "SKU, aisle, bay" lines (comma, tab or semicolon). Header lines are skipped. */
export function parseLocations(text) {
  const map = new Map();
  const errors = [];
  String(text || "")
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith("#")) return;
      const parts = line.split(/[,\t;]/).map((s) => s.trim());
      if (parts.length < 3) {
        const m = parts.length === 2 && parts[1].match(LOC_RE);
        if (m) return map.set(parts[0].toUpperCase(), { aisle: +m[1], bay: +m[2] });
        errors.push(`location line ${i + 1}: expected SKU, aisle, bay`);
        return;
      }
      const aisle = Number(parts[1]);
      const bay = Number(parts[2]);
      if (!Number.isInteger(aisle) || !Number.isInteger(bay)) {
        if (i === 0) return; // header
        errors.push(`location line ${i + 1}: aisle and bay must be whole numbers`);
        return;
      }
      map.set(parts[0].toUpperCase(), { aisle, bay });
    });
  return { map, errors };
}

/**
 * Orders, one per line: optional "ID:" then SKUs or aisle-bay codes separated
 * by commas or spaces. "SKU x3" or "SKU*3" sets a quantity.
 */
export function parseOrders(text, locations, inp) {
  const orders = [];
  const errors = [];
  const unknown = new Set();
  String(text || "")
    .split(/\r?\n/)
    .forEach((raw, i) => {
      let line = raw.trim();
      if (!line || line.startsWith("#")) return;
      let id = `#${orders.length + 1}`;
      const colon = line.indexOf(":");
      if (colon > 0) {
        id = line.slice(0, colon).trim();
        line = line.slice(colon + 1);
      }
      const tokens = line.replace(/\s+[x*]\s*(\d+)/gi, "*$1").split(/[,\s]+/).filter(Boolean);
      const lines = [];
      for (const tok of tokens) {
        const [name, q] = tok.split("*");
        const qty = q ? Math.max(1, parseInt(q, 10) || 1) : 1;
        let loc = locations.get(name.toUpperCase());
        let sku = name;
        if (!loc) {
          const m = name.match(LOC_RE);
          if (m) loc = { aisle: +m[1], bay: +m[2] };
        }
        if (!loc) {
          unknown.add(name);
          continue;
        }
        if (loc.aisle < 1 || loc.aisle > inp.aisles || loc.bay < 1 || loc.bay > inp.baysPerAisle) {
          errors.push(`order line ${i + 1}: ${sku} is at aisle ${loc.aisle} bay ${loc.bay}, outside the layout`);
          continue;
        }
        lines.push({ sku, qty, aisle: loc.aisle, bay: loc.bay });
      }
      if (lines.length) orders.push({ id, lines });
    });
  if (unknown.size) errors.push(`no location for: ${[...unknown].slice(0, 12).join(", ")}${unknown.size > 12 ? ` and ${unknown.size - 12} more` : ""}`);
  return { orders, errors };
}

const locKey = (l) => `${l.aisle}-${l.bay}`;

/** Router with a cache keyed on the set of locations. */
export function makeRouter(inp) {
  const layout = layoutFrom(inp);
  const cache = new Map();
  const pointsOf = (keys) => keys.map((k) => {
    const [a, b] = k.split("-").map(Number);
    return locationPoint(a, b, inp);
  });
  return {
    layout,
    length(keys) {
      const sorted = [...new Set(keys)].sort();
      const k = sorted.join(",");
      if (!cache.has(k)) cache.set(k, optimalRoute(pointsOf(sorted), layout).length);
      return cache.get(k);
    },
    route(keys, policy = "optimal") {
      const sorted = [...new Set(keys)].sort();
      const pts = pointsOf(sorted);
      const f = { optimal: optimalRoute, sshape: sShapeRoute, largestgap: largestGapRoute, return: returnRoute }[policy];
      const r = f(pts, layout);
      return r && { ...r, keys: sorted, points: pts };
    },
  };
}

const orderKeys = (o) => o.lines.map(locKey);
const fits = (batch, o, inp) =>
  batch.length < inp.cartOrders && (!inp.cartLines || batch.reduce((s, b) => s + b.lines.length, 0) + o.lines.length <= inp.cartLines);

/** Batches in the order the orders arrived. */
export function fcfsBatches(orders, inp) {
  const batches = [];
  let cur = [];
  for (const o of orders) {
    if (cur.length && !fits(cur, o, inp)) {
      batches.push(cur);
      cur = [];
    }
    cur.push(o);
  }
  if (cur.length) batches.push(cur);
  return batches;
}

/**
 * Seed batching then local search. Seed: the unbatched order with the longest
 * walk on its own; then add the order that adds least walking, until the cart
 * is full. Improve: move or swap single orders between carts while total
 * walking falls. Every route is scored with the exact router.
 */
export function optimiseBatches(orders, inp, router, { candidates = 12, maxEvals = 30000 } = {}) {
  if (inp.cartOrders <= 1) return orders.map((o) => [o]);
  let evals = 0;
  const len = (keys) => {
    evals++;
    return router.length(keys);
  };
  const solo = new Map(orders.map((o) => [o, len(orderKeys(o))]));
  const aisleSet = (o) => new Set(o.lines.map((l) => l.aisle));
  const left = new Set(orders);
  const batches = [];
  while (left.size) {
    let seed = null;
    for (const o of left) if (!seed || solo.get(o) > solo.get(seed)) seed = o;
    left.delete(seed);
    const batch = [seed];
    let keys = orderKeys(seed);
    let base = solo.get(seed);
    while (batch.length < inp.cartOrders && left.size) {
      // Cheap filter: fewest new aisles, then nearest deepest bay.
      const have = new Set(batch.flatMap((b) => b.lines.map((l) => l.aisle)));
      const ranked = [...left]
        .filter((o) => fits(batch, o, inp))
        .map((o) => {
          const as = aisleSet(o);
          let fresh = 0;
          for (const a of as) if (!have.has(a)) fresh++;
          return [fresh * 1e6 + solo.get(o), o];
        })
        .sort((a, b) => a[0] - b[0])
        .slice(0, candidates);
      if (!ranked.length) break;
      let pick = null;
      let pickAdd = Infinity;
      for (const [, o] of ranked) {
        const add = len([...keys, ...orderKeys(o)]) - base;
        if (add < pickAdd - 1e-9) {
          pickAdd = add;
          pick = o;
        }
      }
      batch.push(pick);
      left.delete(pick);
      keys = [...keys, ...orderKeys(pick)];
      base += pickAdd;
    }
    batches.push(batch);
  }
  // Local search.
  const bkeys = (b) => b.flatMap(orderKeys);
  const cost = batches.map((b) => len(bkeys(b)));
  let improved = true;
  while (improved && evals < maxEvals) {
    improved = false;
    for (let i = 0; i < batches.length && evals < maxEvals; i++) {
      for (let j = 0; j < batches.length && evals < maxEvals; j++) {
        if (i === j) continue;
        const A = batches[i];
        const B = batches[j];
        // Move one order from A to B.
        for (let a = 0; a < A.length && A.length > 1; a++) {
          const o = A[a];
          if (!fits(B, o, inp)) continue;
          const nA = A.filter((_, k) => k !== a);
          const nB = [...B, o];
          const ca = len(bkeys(nA));
          const cb = len(bkeys(nB));
          if (ca + cb < cost[i] + cost[j] - 1e-6) {
            batches[i] = nA;
            batches[j] = nB;
            cost[i] = ca;
            cost[j] = cb;
            improved = true;
            break;
          }
        }
        if (improved) break;
        // Swap one order each way.
        if (j < i) continue;
        outer: for (let a = 0; a < A.length; a++) {
          for (let b = 0; b < B.length; b++) {
            const nA = [...A.slice(0, a), B[b], ...A.slice(a + 1)];
            const nB = [...B.slice(0, b), A[a], ...B.slice(b + 1)];
            if (inp.cartLines && (nA.reduce((s, o) => s + o.lines.length, 0) > inp.cartLines || nB.reduce((s, o) => s + o.lines.length, 0) > inp.cartLines)) continue;
            const ca = len(bkeys(nA));
            const cb = len(bkeys(nB));
            if (ca + cb < cost[i] + cost[j] - 1e-6) {
              batches[i] = nA;
              batches[j] = nB;
              cost[i] = ca;
              cost[j] = cb;
              improved = true;
              break outer;
            }
          }
        }
        if (improved) break;
      }
      if (improved) break;
    }
  }
  return batches.filter((b) => b.length);
}

/** Every policy's walking on the same orders. */
export function comparePolicies(orders, inp, opts = {}) {
  const router = makeRouter(inp);
  const sum = (batches, policy) =>
    batches.reduce((s, b) => {
      const keys = b.flatMap(orderKeys);
      if (policy === "optimal") return s + router.length(keys);
      const r = router.route(keys, policy);
      return r ? s + r.length : NaN;
    }, 0);
  const singles = orders.map((o) => [o]);
  const fcfs = fcfsBatches(orders, inp);
  const smart = optimiseBatches(orders, inp, router, opts);
  const rows = [
    { id: "single_sshape", label: "One order per trip, S-shape route", batches: singles, policy: "sshape" },
    { id: "single_largestgap", label: "One order per trip, largest-gap route", batches: singles, policy: "largestgap" },
    { id: "single_optimal", label: "One order per trip, shortest route", batches: singles, policy: "optimal" },
    { id: "fcfs_sshape", label: `Carts of ${inp.cartOrders} in arrival order, S-shape route`, batches: fcfs, policy: "sshape" },
    { id: "fcfs_optimal", label: `Carts of ${inp.cartOrders} in arrival order, shortest route`, batches: fcfs, policy: "optimal" },
    { id: "smart_optimal", label: `Carts of ${inp.cartOrders} grouped by this tool, shortest route`, batches: smart, policy: "optimal" },
  ];
  if (!inp.backAisle) {
    // With dead-end aisles the in-and-out route is already the shortest one.
    rows.splice(0, 3, { id: "single_optimal", label: "One order per trip, in and out of each aisle (already the shortest)", batches: singles, policy: "optimal" });
    rows.splice(rows.findIndex((r) => r.id === "fcfs_sshape"), 1);
  }
  const ftToCost = (ft) => {
    const hoursPerDay = ft / inp.walkFtPerMin / 60;
    return { hoursPerDay, hoursPerYear: hoursPerDay * inp.daysPerYear, costPerYear: hoursPerDay * inp.daysPerYear * inp.wagePerHour };
  };
  for (const r of rows) {
    r.trips = r.batches.length;
    r.feet = sum(r.batches, r.policy);
    Object.assign(r, ftToCost(r.feet));
  }
  const baseline = rows[0];
  for (const r of rows) r.savingPct = baseline.feet > 0 ? (1 - r.feet / baseline.feet) * 100 : 0;
  return { rows, router, smart, baseline };
}

/** Stops in walking order for one cart, each saying which tote gets what. */
export function pickList(batch, router) {
  const keys = batch.flatMap(orderKeys);
  const r = router.route(keys, "optimal");
  const stops = [];
  for (const idx of r.order) {
    const k = r.keys[idx];
    const [aisle, bay] = k.split("-").map(Number);
    const items = [];
    batch.forEach((o, tote) => {
      for (const l of o.lines) if (locKey(l) === k) items.push({ tote: tote + 1, order: o.id, sku: l.sku, qty: l.qty });
    });
    stops.push({ aisle, bay, items });
  }
  return { length: r.length, path: r.path, stops };
}

export function pickListCsv(batches, router) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = [["cart", "stop", "aisle", "bay", "sku", "qty", "tote", "order"]];
  batches.forEach((b, i) => {
    pickList(b, router).stops.forEach((s, j) => {
      for (const it of s.items) rows.push([i + 1, j + 1, s.aisle, s.bay, it.sku, it.qty, it.tote, it.order]);
    });
  });
  return rows.map((r) => r.map(esc).join(",")).join("\n") + "\n";
}

/** A reproducible example: Pareto-popular SKUs and 1-4 line orders. */
export function exampleData(inp = DEFAULTS, { skus = 160, orders = 120, seed = 42 } = {}) {
  let s = seed >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const locs = [];
  const used = new Set();
  for (let i = 0; i < skus; i++) {
    let a;
    let b;
    do {
      a = 1 + Math.floor(r() * inp.aisles);
      b = 1 + Math.floor(r() * inp.baysPerAisle);
    } while (used.has(`${a}-${b}`));
    used.add(`${a}-${b}`);
    locs.push([`SKU${String(i + 1).padStart(3, "0")}`, a, b]);
  }
  // Popularity ~ 1/rank (a Zipf curve), so a few SKUs take most picks.
  const w = locs.map((_, i) => 1 / (i + 1));
  const tot = w.reduce((x, y) => x + y, 0);
  const draw = () => {
    let u = r() * tot;
    for (let i = 0; i < w.length; i++) if ((u -= w[i]) <= 0) return locs[i][0];
    return locs[locs.length - 1][0];
  };
  const orderLines = [];
  for (let o = 0; o < orders; o++) {
    const n = 1 + Math.floor(r() * r() * 4.99);
    const set = new Set();
    while (set.size < n) set.add(draw());
    orderLines.push(`SO-${1001 + o}: ${[...set].join(", ")}`);
  }
  return {
    locations: ["sku,aisle,bay", ...locs.map((l) => l.join(","))].join("\n"),
    orders: orderLines.join("\n"),
  };
}
