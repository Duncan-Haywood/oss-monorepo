// Route Stop Optimizer: order a day's stops (and split them across drivers)
// to cut drive time, with service times and customer time windows.
//
// Exact (Held-Karp dynamic programme, windows respected) up to EXACT_MAX
// stops on one route; above that, multi-start nearest-neighbour + 2-opt +
// Or-opt with a lateness penalty. Travel time is straight-line distance
// (haversine) times a circuity factor at an average speed: an estimate, not
// a road network. No network calls, no imports.

export const EXACT_MAX = 12;
export const MAX_STOPS = 200;
const EARTH_MI = 3958.8;
const LATE_WEIGHT = 1000; // one late minute outweighs any drive-time saving

export const num = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
export const money = (x) => "$" + Number(x).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const pct = (x, d = 0) => (x * 100).toFixed(d) + "%";

export function fmtTime(min) {
  const m = Math.round(min);
  const day = Math.floor(m / 1440);
  const r = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(r / 60), mm = r % 60;
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ap}${day > 0 ? ` +${day}d` : ""}`;
}

export function parseClock(s) {
  if (s === undefined || s === null) return null;
  const t = String(s).trim().toLowerCase();
  if (t === "") return null;
  let m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return NaN;
  let h = Number(m[1]);
  const mi = m[2] ? Number(m[2]) : 0;
  if (mi > 59) return NaN;
  if (m[3]) {
    if (h < 1 || h > 12) return NaN;
    h = h % 12 + (m[3][0] === "p" ? 12 : 0);
  } else if (h > 24) return NaN;
  return h * 60 + mi;
}

const isNum = (s) => s !== "" && Number.isFinite(Number(s));

function splitLine(line) {
  const d = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
  return line.split(d).map((x) => x.trim().replace(/^"|"$/g, ""));
}

// Rows: [name,] lat, lng [, service_min [, open [, close]]].
export function parseStops(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const stops = [];
  const errors = [];
  lines.forEach((line, i) => {
    const f = splitLine(line);
    let o = 0;
    let name = "";
    if (!(isNum(f[0]) && isNum(f[1]))) {
      if (isNum(f[1]) && isNum(f[2])) { name = f[0]; o = 1; }
      else if (i === 0) return; // header row
      else { errors.push(`Line ${i + 1}: could not find a latitude and longitude.`); return; }
    }
    const lat = Number(f[o]), lng = Number(f[o + 1]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) { errors.push(`Line ${i + 1}: latitude must be within ±90 and longitude within ±180.`); return; }
    const svcRaw = f[o + 2];
    const service = svcRaw === undefined || svcRaw === "" ? 0 : Number(svcRaw);
    if (!Number.isFinite(service) || service < 0) { errors.push(`Line ${i + 1}: service minutes must be a number of 0 or more.`); return; }
    const open = parseClock(f[o + 3]), close = parseClock(f[o + 4]);
    if (Number.isNaN(open) || Number.isNaN(close)) { errors.push(`Line ${i + 1}: could not read the time window (try 9:00 or 9am).`); return; }
    if (open !== null && close !== null && close < open) { errors.push(`Line ${i + 1}: the window closes before it opens.`); return; }
    stops.push({ name: name || `Stop ${stops.length + 1}`, lat, lng, service, open, close });
  });
  if (errors.length) return { error: errors.slice(0, 4).join(" ") };
  return { stops };
}

export function parsePoint(text) {
  const f = splitLine(String(text || "").trim());
  if (f.length < 2 || !isNum(f[0]) || !isNum(f[1])) return null;
  const lat = Number(f[0]), lng = Number(f[1]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { name: "Depot", lat, lng, service: 0, open: null, close: null };
}

export function haversineMiles(a, b) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

// nodes[0] is the depot. Returns road-mile and minute matrices.
export function buildMatrices(nodes, circuity, mph) {
  const n = nodes.length;
  const miles = Array.from({ length: n }, () => new Float64Array(n));
  const mins = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineMiles(nodes[i], nodes[j]) * circuity;
      miles[i][j] = miles[j][i] = d;
      mins[i][j] = mins[j][i] = (d / mph) * 60;
    }
  }
  return { miles, mins };
}

// Walk one route (array of node indexes >= 1) from the depot at `start`.
export function evaluateRoute(order, ctx) {
  const { nodes, miles, mins, start, back } = ctx;
  let t = start, prev = 0, dist = 0, drive = 0, wait = 0, late = 0;
  const visits = [];
  for (const k of order) {
    const s = nodes[k];
    t += mins[prev][k];
    drive += mins[prev][k];
    dist += miles[prev][k];
    const arrive = t;
    if (s.open !== null && t < s.open) { wait += s.open - t; t = s.open; }
    const lateBy = s.close !== null && t > s.close ? t - s.close : 0;
    late += lateBy;
    const begin = t;
    t += s.service;
    visits.push({ node: k, arrive, begin, depart: t, legMiles: miles[prev][k], lateBy });
    prev = k;
  }
  if (back && order.length) {
    t += mins[prev][0];
    drive += mins[prev][0];
    dist += miles[prev][0];
  }
  const service = order.reduce((a, k) => a + nodes[k].service, 0);
  return { visits, finish: t, elapsed: order.length ? t - start : 0, drive, wait, service, late, miles: dist };
}

const score = (order, ctx) => {
  const e = evaluateRoute(order, ctx);
  return e.elapsed + LATE_WEIGHT * e.late;
};

// Exact: minimum finish time with every window respected, or null if none.
export function solveExact(ids, ctx) {
  const n = ids.length;
  if (n === 0) return [];
  const { nodes, mins, start, back } = ctx;
  const size = 1 << n;
  const INF = Infinity;
  const f = new Float64Array(size * n).fill(INF);
  const par = new Int8Array(size * n).fill(-1);
  const serve = (arrive, node) => {
    const s = nodes[node];
    const begin = s.open !== null && arrive < s.open ? s.open : arrive;
    if (s.close !== null && begin > s.close + 1e-9) return INF;
    return begin + s.service;
  };
  for (let i = 0; i < n; i++) f[(1 << i) * n + i] = serve(start + mins[0][ids[i]], ids[i]);
  for (let mask = 1; mask < size; mask++) {
    for (let last = 0; last < n; last++) {
      const cur = f[mask * n + last];
      if (cur === INF || !(mask & (1 << last))) continue;
      for (let nx = 0; nx < n; nx++) {
        if (mask & (1 << nx)) continue;
        const done = serve(cur + mins[ids[last]][ids[nx]], ids[nx]);
        const nm = mask | (1 << nx);
        if (done < f[nm * n + nx]) { f[nm * n + nx] = done; par[nm * n + nx] = last; }
      }
    }
  }
  const full = size - 1;
  let bestEnd = -1, bestT = INF;
  for (let last = 0; last < n; last++) {
    const v = f[full * n + last];
    if (v === INF) continue;
    const total = v + (back ? mins[ids[last]][0] : 0);
    if (total < bestT) { bestT = total; bestEnd = last; }
  }
  if (bestEnd < 0) return null;
  const order = [];
  let mask = full, last = bestEnd;
  while (last >= 0) {
    order.push(ids[last]);
    const p = par[mask * n + last];
    mask &= ~(1 << last);
    last = p;
  }
  return order.reverse();
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nearestNeighbour(ids, ctx, jitter, rand) {
  const left = new Set(ids);
  const order = [];
  let prev = 0;
  while (left.size) {
    let best = -1, bestV = Infinity;
    for (const k of left) {
      const s = ctx.nodes[k];
      let v = ctx.mins[prev][k] + (s.close !== null ? Math.max(0, (s.close - ctx.start) / 600) : 0);
      if (jitter) v *= 1 + (rand() - 0.5) * jitter;
      if (v < bestV) { bestV = v; best = k; }
    }
    left.delete(best);
    order.push(best);
    prev = best;
  }
  return order;
}

function localSearch(order, ctx) {
  let cur = order.slice();
  let curV = score(cur, ctx);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 60) {
    improved = false;
    // 2-opt: reverse a segment.
    for (let i = 0; i < cur.length - 1; i++) {
      for (let j = i + 1; j < cur.length; j++) {
        const cand = cur.slice(0, i).concat(cur.slice(i, j + 1).reverse(), cur.slice(j + 1));
        const v = score(cand, ctx);
        if (v < curV - 1e-9) { cur = cand; curV = v; improved = true; }
      }
    }
    // Or-opt: move a run of 1-3 stops elsewhere.
    for (let len = 1; len <= 3; len++) {
      for (let i = 0; i + len <= cur.length; i++) {
        const seg = cur.slice(i, i + len);
        const rest = cur.slice(0, i).concat(cur.slice(i + len));
        for (let p = 0; p <= rest.length; p++) {
          if (p === i) continue;
          const cand = rest.slice(0, p).concat(seg, rest.slice(p));
          const v = score(cand, ctx);
          if (v < curV - 1e-9) { cur = cand; curV = v; improved = true; break; }
        }
      }
    }
  }
  return cur;
}

// One vehicle: best order found for the given stop ids.
export function solveSingle(ids, ctx, opts = {}) {
  if (ids.length <= 1) return { order: ids.slice(), exact: true };
  if (ids.length <= EXACT_MAX && !opts.forceHeuristic) {
    const ex = solveExact(ids, ctx);
    if (ex) return { order: ex, exact: true };
  }
  const rand = rng(12345 + ids.length);
  const starts = ids.length > 80 ? 3 : ids.length > 40 ? 5 : 8;
  let best = null, bestV = Infinity;
  for (let s = 0; s < starts; s++) {
    const seed = nearestNeighbour(ids, ctx, s === 0 ? 0 : 0.6, rand);
    const order = localSearch(seed, ctx);
    const v = score(order, ctx);
    if (v < bestV) { bestV = v; best = order; }
  }
  return { order: best, exact: false };
}

function sweepSplit(ids, ctx, k) {
  const dep = ctx.nodes[0];
  const ang = (i) => Math.atan2(ctx.nodes[i].lat - dep.lat, ctx.nodes[i].lng - dep.lng);
  const sorted = ids.slice().sort((a, b) => ang(a) - ang(b));
  const groups = Array.from({ length: k }, () => []);
  sorted.forEach((id, i) => groups[Math.min(k - 1, Math.floor((i * k) / sorted.length))].push(id));
  return groups;
}

const planScore = (routes, ctx) => {
  let sum = 0, max = 0;
  for (const r of routes) {
    const e = evaluateRoute(r, ctx);
    const v = e.elapsed + LATE_WEIGHT * e.late;
    sum += v;
    if (v > max) max = v;
  }
  return sum + 2 * max;
};

// Split stops across `vehicles` drivers and order each route.
export function solvePlan(ids, ctx, vehicles, opts = {}) {
  const k = Math.max(1, Math.min(vehicles, ids.length || 1));
  if (k === 1) {
    const r = solveSingle(ids, ctx, opts);
    return { routes: [r.order], exact: r.exact };
  }
  let groups = sweepSplit(ids, ctx, k);
  let routes = groups.map((g) => solveSingle(g, ctx, { forceHeuristic: true }).order);
  let cur = planScore(routes, ctx);
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (let a = 0; a < k; a++) {
      for (const stop of routes[a].slice()) {
        if (routes[a].length <= 1) break;
        let bestRoutes = null, bestV = cur;
        for (let b = 0; b < k; b++) {
          if (b === a) continue;
          for (let p = 0; p <= routes[b].length; p++) {
            const cand = routes.map((r) => r.slice());
            cand[a] = cand[a].filter((x) => x !== stop);
            cand[b].splice(p, 0, stop);
            const v = planScore(cand, ctx);
            if (v < bestV - 1e-9) { bestV = v; bestRoutes = cand; }
          }
        }
        if (bestRoutes) { routes = bestRoutes; cur = bestV; moved = true; }
      }
    }
    routes = routes.map((r) => localSearch(r, ctx));
    cur = planScore(routes, ctx);
    if (!moved) break;
  }
  return { routes, exact: false };
}

function chunkContiguous(ids, k) {
  const out = Array.from({ length: k }, () => []);
  ids.forEach((id, i) => out[Math.min(k - 1, Math.floor((i * k) / ids.length))].push(id));
  return out;
}

function summarise(routes, ctx, o) {
  const evals = routes.map((r) => evaluateRoute(r, ctx));
  const tot = evals.reduce((a, e) => ({
    miles: a.miles + e.miles, elapsed: a.elapsed + e.elapsed, drive: a.drive + e.drive,
    wait: a.wait + e.wait, late: a.late + e.late,
  }), { miles: 0, elapsed: 0, drive: 0, wait: 0, late: 0 });
  const fuel = o.mpg > 0 ? (tot.miles / o.mpg) * o.fuelPrice : 0;
  const labor = (tot.elapsed / 60) * o.wage;
  const lateStops = evals.reduce((a, e) => a + e.visits.filter((v) => v.lateBy > 0).length, 0);
  return { routes, evals, ...tot, fuel, labor, cost: fuel + labor, lateStops, longest: Math.max(0, ...evals.map((e) => e.elapsed)) };
}

export function optimize(input, raw = {}) {
  const o = {
    circuity: raw.circuity ?? 1.3, mph: raw.mph ?? 30, back: raw.returnToDepot !== false,
    start: raw.startMinute ?? 480, vehicles: raw.vehicles ?? 1, mpg: raw.mpg ?? 0, fuelPrice: raw.fuelPrice ?? 0,
    wage: raw.wage ?? 0, daysPerYear: raw.daysPerYear ?? 0,
  };
  const { depot, stops } = input;
  if (!depot) return { error: "Add a depot (start) location as latitude, longitude." };
  if (!stops || stops.length < 2) return { error: "Add at least two stops." };
  if (stops.length > MAX_STOPS) return { error: `This tool plans up to ${MAX_STOPS} stops at a time; you gave ${stops.length}.` };
  if (!(o.circuity >= 1 && o.circuity <= 3)) return { error: "Road-to-straight-line factor must be between 1 and 3." };
  if (!(o.mph >= 3 && o.mph <= 90)) return { error: "Average speed must be between 3 and 90 mph." };
  if (!Number.isInteger(o.vehicles) || o.vehicles < 1 || o.vehicles > 20) return { error: "Drivers must be a whole number from 1 to 20." };
  if (!(o.start >= 0 && o.start < 1440)) return { error: "Start time must be within a day." };
  for (const v of [o.mpg, o.fuelPrice, o.wage, o.daysPerYear]) if (!(v >= 0)) return { error: "Cost fields must be 0 or more." };

  const nodes = [depot, ...stops];
  const { miles, mins } = buildMatrices(nodes, o.circuity, o.mph);
  const ctx = { nodes, miles, mins, start: o.start, back: o.back };
  const ids = stops.map((_, i) => i + 1);
  const warnings = [];

  const far = Math.max(...stops.map((s) => haversineMiles(depot, s)));
  if (far > 300) warnings.push(`One stop is about ${num(far)} miles in a straight line from the depot; check the coordinates, since a straight-line estimate gets worse over long distances.`);

  const plan = solvePlan(ids, ctx, o.vehicles);
  const best = summarise(plan.routes, ctx, o);
  if (best.lateStops) warnings.push(`${best.lateStops} stop${best.lateStops === 1 ? " is" : "s are"} still late: the windows cannot all be met from this start time with this many drivers. Try an earlier start or another driver.`);

  const listed = summarise(o.vehicles === 1 ? [ids] : chunkContiguous(ids, Math.min(o.vehicles, ids.length)), ctx, o);

  // What do the customer windows cost? Re-plan with them removed.
  let windowCost = null;
  const hasWindows = stops.some((s) => s.open !== null || s.close !== null);
  if (hasWindows) {
    const freeNodes = nodes.map((s, i) => (i === 0 ? s : { ...s, open: null, close: null }));
    const fctx = { ...ctx, nodes: freeNodes };
    const free = summarise(solvePlan(ids, fctx, o.vehicles).routes, fctx, o);
    const freeOnOriginal = summarise(free.routes, ctx, o);
    windowCost = { elapsed: Math.max(0, best.elapsed - free.elapsed), miles: Math.max(0, best.miles - free.miles), freeLate: freeOnOriginal.late };
  }

  const saveMiles = listed.miles - best.miles, saveMin = listed.elapsed - best.elapsed, saveCost = listed.cost - best.cost;
  return {
    options: o, nodes, exact: plan.exact, best, listed, windowCost, warnings,
    saveMiles, saveMin, saveCost, saveYear: o.daysPerYear ? saveCost * o.daysPerYear : 0,
    savePct: listed.elapsed > 0 ? saveMin / listed.elapsed : 0,
  };
}

export function mapsLinks(result, routeIndex) {
  const order = result.best.routes[routeIndex];
  const pt = (k) => `${result.nodes[k].lat},${result.nodes[k].lng}`;
  const seq = [0, ...order, ...(result.options.back ? [0] : [])];
  const links = [];
  for (let i = 0; i < seq.length - 1; i += 9) {
    const part = seq.slice(i, Math.min(seq.length, i + 10));
    if (part.length < 2) break;
    const via = part.slice(1, -1).map(pt).join("|");
    links.push(`https://www.google.com/maps/dir/?api=1&origin=${pt(part[0])}&destination=${pt(part[part.length - 1])}${via ? `&waypoints=${via}` : ""}&travelmode=driving`);
    if (part.length < 10) break;
  }
  return links;
}

export function routeCsv(result) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["driver", "order", "stop", "latitude", "longitude", "arrive", "start_service", "depart", "leg_miles", "late_minutes"]];
  result.best.routes.forEach((r, ri) => {
    result.best.evals[ri].visits.forEach((v, i) => {
      const s = result.nodes[v.node];
      rows.push([ri + 1, i + 1, q(s.name), s.lat, s.lng, fmtTime(v.arrive), fmtTime(v.begin), fmtTime(v.depart), v.legMiles.toFixed(1), Math.round(v.lateBy)]);
    });
  });
  return rows.map((r) => r.join(",")).join("\n") + "\n";
}

export function sampleText() {
  return [
    "name,lat,lng,service_min,open,close",
    "Acme Dental,39.7392,-104.9903,30,9am,11am",
    "Baker Lofts,39.7684,-104.9470,20,,",
    "Cherry Creek Cafe,39.7170,-104.9530,15,,",
    "Dunn Residence,39.6791,-104.9619,45,10am,1pm",
    "Elm St Clinic,39.7505,-105.0000,25,,",
    "Fox Plumbing,39.7780,-105.0250,20,,3pm",
    "Grove Apartments,39.7010,-105.0810,30,,",
    "Hill Bakery,39.7470,-104.8800,15,1pm,4pm",
    "Ivy Office Park,39.6500,-104.9000,40,,",
    "Jade Salon,39.7920,-104.8760,25,,",
  ].join("\n");
}
export const sampleDepot = "39.7420,-104.9850";
