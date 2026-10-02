// Owner-operator load chain planner: pure functions, no I/O, no network.
//
// Everything here is arithmetic on numbers the user types: the loads on their
// shortlist (pickup city, drop city, rate, time windows), what a mile costs
// them and how fast they drive. Nothing is a market rate and nothing is a
// forecast. The distances are straight-line miles between approximate city
// centres times a road factor, unless the user gives a load's own miles.
//
// The search is exact: a label-setting dynamic programme over (set of loads
// taken, last load) that keeps every Pareto-optimal (clock, hours driven since
// the last rest, profit) label, so a wait for a pickup window or a forced
// 10-hour rest is priced into the chain instead of ignored. The tests check it
// against every ordered subset.

export const MAX_LOADS = 14;
export const EPS = 1e-9;
export const NODE_LIMIT = 2_500_000;

export const MODEL_NOTE =
  "Estimates, not a market rate and not a forecast: every rate, cost, speed and time window is a number you typed. Distances are straight-line miles between approximate city centres times a road factor unless you give a load's own miles. The drive/rest rule is a simplified 11-hour drive then 10-hour rest, not a log and not hours-of-service compliance.";

export const INPUT_NOTES = [
  { what: "name,from,to,rate[,miles,pickup_open,pickup_close,deliver_by,extra,note]", detail: "One load per row. from and to are cities as 'Dallas TX' (no comma) or exact coordinates as @32.78/-96.80. rate is the total dollars the load pays you, fuel surcharge included. The rest are optional." },
  { what: "miles", detail: "Loaded miles from the load board. Blank uses the straight-line distance times the road factor." },
  { what: "pickup_open, pickup_close", detail: "Hours after you are ready (hour 0) when pickup opens and when it closes. Arriving early means waiting for it to open; arriving after it closes makes the load impossible. Blank means no limit. Day 2 at 8am is 32." },
  { what: "deliver_by", detail: "Hour by which the load must arrive at the drop. Blank means no limit." },
  { what: "extra", detail: "Dollars this load costs you beyond miles: tolls, lumper, scale, detention you will not be paid for. Blank is 0." },
  { what: "Fixed cost per day", detail: "Truck note, insurance, permits and your own pay spread per day. The 'total' objective charges it for the whole window; 'per day' charges it for the days the chain takes." },
  { what: "Objective", detail: "'total' maximises profit before fixed costs inside the window you are free. 'per day' maximises profit per day the chain takes (at least one day), for when you can re-plan after the chain." },
  { what: "Walk-away rate", detail: "For each load in the plan, the lowest rate at which it still belongs in the best plan, found exactly against the best plan without it. Counter at or above it." },
];

export const money = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  const r = Math.round(Math.abs(v) * 100) / 100;
  return `${v < -0.004 ? "-" : ""}$${r.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
export const pct = (p, digits = 1) => (p === null || p === undefined ? "n/a" : `${(p * 100).toFixed(digits).replace(/\.0+$/, "")}%`);
export const miles = (m) => `${Math.round(m).toLocaleString("en-US")} mi`;
export const hours = (h) => `${(Math.round(h * 10) / 10).toFixed(1)} h`;
/** Clock label for an hour offset: hour 32 is "day 2 08:00". */
export const clock = (h) => {
  const total = Math.round(h * 60);
  const day = Math.floor(total / 1440) + 1;
  const m = total % 1440;
  return `day ${day} ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

// Approximate city-centre coordinates (latitude, longitude). Straight-line
// distances between them, times a road factor, stand in for a routing engine;
// they are good to a few percent on long hauls and worse on short ones, which
// is why a load's own miles can be supplied.
const CITY_TABLE = `
Albany NY 42.65 -73.76|Albuquerque NM 35.08 -106.65|Amarillo TX 35.22 -101.83|Atlanta GA 33.75 -84.39|Austin TX 30.27 -97.74|
Baltimore MD 39.29 -76.61|Baton Rouge LA 30.45 -91.19|Billings MT 45.78 -108.50|Birmingham AL 33.52 -86.80|Boise ID 43.62 -116.20|
Boston MA 42.36 -71.06|Buffalo NY 42.89 -78.88|Charleston SC 32.78 -79.93|Charlotte NC 35.23 -80.84|Cheyenne WY 41.14 -104.82|
Chicago IL 41.88 -87.63|Cincinnati OH 39.10 -84.51|Cleveland OH 41.50 -81.69|Columbia SC 34.00 -81.03|Columbus OH 39.96 -83.00|
Dallas TX 32.78 -96.80|Denver CO 39.74 -104.99|Des Moines IA 41.59 -93.62|Detroit MI 42.33 -83.05|El Paso TX 31.76 -106.49|
Fargo ND 46.88 -96.79|Fort Worth TX 32.76 -97.33|Fresno CA 36.74 -119.79|Grand Rapids MI 42.96 -85.67|Green Bay WI 44.51 -88.01|
Greensboro NC 36.07 -79.79|Harrisburg PA 40.27 -76.88|Hartford CT 41.76 -72.67|Houston TX 29.76 -95.37|Indianapolis IN 39.77 -86.16|
Jackson MS 32.30 -90.18|Jacksonville FL 30.33 -81.66|Kansas City MO 39.10 -94.58|Knoxville TN 35.96 -83.92|Laredo TX 27.51 -99.51|
Las Vegas NV 36.17 -115.14|Lexington KY 38.04 -84.50|Little Rock AR 34.75 -92.29|Los Angeles CA 34.05 -118.24|Louisville KY 38.25 -85.76|
Lubbock TX 33.58 -101.86|McAllen TX 26.20 -98.23|Memphis TN 35.15 -90.05|Miami FL 25.76 -80.19|Milwaukee WI 43.04 -87.91|
Minneapolis MN 44.98 -93.27|Mobile AL 30.69 -88.04|Nashville TN 36.16 -86.78|New Orleans LA 29.95 -90.07|New York NY 40.71 -74.01|
Newark NJ 40.74 -74.17|Oklahoma City OK 35.47 -97.52|Omaha NE 41.26 -95.93|Orlando FL 28.54 -81.38|Philadelphia PA 39.95 -75.17|
Phoenix AZ 33.45 -112.07|Pittsburgh PA 40.44 -80.00|Portland OR 45.52 -122.68|Raleigh NC 35.78 -78.64|Reno NV 39.53 -119.81|
Richmond VA 37.54 -77.44|Sacramento CA 38.58 -121.49|Salt Lake City UT 40.76 -111.89|San Antonio TX 29.42 -98.49|San Diego CA 32.72 -117.16|
San Francisco CA 37.77 -122.42|Savannah GA 32.08 -81.09|Seattle WA 47.61 -122.33|Shreveport LA 32.53 -93.75|Sioux Falls SD 43.54 -96.73|
Spokane WA 47.66 -117.43|St. Louis MO 38.63 -90.20|Tampa FL 27.95 -82.46|Toledo OH 41.65 -83.54|Tucson AZ 32.22 -110.97|
Tulsa OK 36.15 -95.99|Wichita KS 37.69 -97.34
`;

const normKey = (s) => String(s).toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();

export const CITIES = CITY_TABLE.split("|").map((chunk) => {
  const m = /^\s*(.+?)\s+([A-Z]{2})\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s*$/.exec(chunk);
  if (!m) throw new Error(`bad city row: ${chunk}`);
  return { city: m[1], state: m[2], name: `${m[1]} ${m[2]}`, lat: Number(m[3]), lon: Number(m[4]) };
});

const CITY_INDEX = new Map(CITIES.map((c) => [normKey(c.name), c]));
const CITY_BY_NAME = new Map();
for (const c of CITIES) {
  const k = normKey(c.city);
  CITY_BY_NAME.set(k, CITY_BY_NAME.has(k) ? null : c);
}

/** Resolve "Dallas TX", "Dallas" (if unambiguous) or "@lat/lon" to a place, or null. */
export function resolvePlace(text) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  const co = /^@\s*(-?\d+(?:\.\d+)?)\s*[/;]\s*(-?\d+(?:\.\d+)?)$/.exec(s);
  if (co) {
    const lat = Number(co[1]);
    const lon = Number(co[2]);
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { name: `@${lat}/${lon}`, lat, lon };
  }
  const k = normKey(s);
  const hit = CITY_INDEX.get(k) || CITY_BY_NAME.get(k);
  return hit ? { name: hit.name, lat: hit.lat, lon: hit.lon } : null;
}

export function haversineMiles(a, b) {
  const R = 3958.8;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const toNumber = (s) => {
  const t = String(s ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Number(t);
};

/** Parse load rows. Never throws; errors carry line numbers. */
export function parseLoads(text) {
  const loads = [];
  const errors = [];
  let seenHeader = false;
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const f = line.split(",").map((s) => s.trim());
    if (!seenHeader && /^(name|load|id)$/i.test(f[0])) { seenHeader = true; return; }
    seenHeader = true;
    const at = `line ${i + 1}`;
    if (f.length < 4) { errors.push(`${at}: expected name,from,to,rate[,miles,pickup_open,pickup_close,deliver_by,extra,note] but found ${f.length} field(s)`); return; }
    if (!f[0]) { errors.push(`${at}: name is empty`); return; }
    const from = resolvePlace(f[1]);
    const to = resolvePlace(f[2]);
    if (!from) { errors.push(`${at}: pickup "${f[1]}" is not a known city (use 'Dallas TX' or @lat/lon)`); return; }
    if (!to) { errors.push(`${at}: drop "${f[2]}" is not a known city (use 'Dallas TX' or @lat/lon)`); return; }
    const rate = toNumber(f[3]);
    if (rate === null || rate < 0) { errors.push(`${at}: rate "${f[3]}" is not a dollar amount`); return; }
    const opt = (idx, label, min) => {
      if (f[idx] === undefined || f[idx] === "") return { v: null };
      const n = toNumber(f[idx]);
      if (n === null || n < min) return { err: `${at}: ${label} "${f[idx]}" is not a valid number` };
      return { v: n };
    };
    const mi = opt(4, "miles", 0);
    const open = opt(5, "pickup_open", 0);
    const close = opt(6, "pickup_close", 0);
    const by = opt(7, "deliver_by", 0);
    const extra = opt(8, "extra", 0);
    const bad = [mi, open, close, by, extra].find((x) => x.err);
    if (bad) { errors.push(bad.err); return; }
    if (mi.v !== null && mi.v === 0 && from.name !== to.name) { errors.push(`${at}: miles must be above 0`); return; }
    if (open.v !== null && close.v !== null && close.v < open.v) { errors.push(`${at}: pickup_close is before pickup_open`); return; }
    loads.push({
      name: f[0], from, to, rate, miles: mi.v,
      open: open.v ?? 0, close: close.v ?? Infinity, deliverBy: by.v ?? Infinity,
      extra: extra.v ?? 0, note: f.slice(9).join(",").trim(),
    });
  });
  if (loads.length > MAX_LOADS) errors.push(`${loads.length} loads is more than the ${MAX_LOADS}-load limit; the search is exact and doubles with every load. Shortlist the best ${MAX_LOADS}.`);
  return { loads, errors };
}

export const DEFAULTS = {
  horizon: 168, mph: 50, mpg: 6.5, fuel: 3.9, perMile: 0.25, fixedDay: 150, dwell: 2,
  hos: true, hosDrive: 11, hosRest: 10, roadFactor: 1.2, returnHome: false, objective: "total",
};

const bool = (v, dflt) => (v === undefined || v === null || v === "" ? dflt : v === true || v === "true" || v === "1" || v === 1 || v === "on");

/** Validate and fill options; throws Error with a message the UI can show. */
export function normalizeOptions(raw = {}) {
  const num = (key, label, { min = 0, max = Infinity, positive = false } = {}) => {
    const v = raw[key];
    if (v === undefined || v === null || v === "") return DEFAULTS[key];
    const n = toNumber(v);
    if (n === null || n < min || n > max || (positive && n <= 0)) throw new Error(`${label} must be ${positive ? "above" : "at least"} ${positive ? 0 : min}${max === Infinity ? "" : ` and at most ${max}`}`);
    return n;
  };
  const start = resolvePlace(raw.start);
  if (!start) throw new Error(raw.start ? `Start "${raw.start}" is not a known city (use 'Dallas TX' or @lat/lon)` : "Give a start city (where you are ready to load)");
  const objective = raw.objective === undefined || raw.objective === "" ? DEFAULTS.objective : raw.objective;
  if (objective !== "total" && objective !== "perDay") throw new Error("Objective must be total or perDay");
  const o = {
    start,
    horizon: num("horizon", "Window (hours)", { positive: true, max: 24 * 30 }),
    mph: num("mph", "Average moving speed", { positive: true, max: 90 }),
    mpg: num("mpg", "Miles per gallon", { positive: true, max: 40 }),
    fuel: num("fuel", "Fuel price per gallon"),
    perMile: num("perMile", "Other cost per mile"),
    fixedDay: num("fixedDay", "Fixed cost per day"),
    dwell: num("dwell", "Hours at each stop", { max: 48 }),
    hos: bool(raw.hos, DEFAULTS.hos),
    hosDrive: num("hosDrive", "Drive hours before a rest", { positive: true, max: 24 }),
    hosRest: num("hosRest", "Rest hours", { max: 48 }),
    roadFactor: num("roadFactor", "Road factor", { min: 1, max: 2 }),
    returnHome: bool(raw.returnHome, DEFAULTS.returnHome),
    objective,
  };
  o.varPerMile = o.fuel / o.mpg + o.perMile;
  return o;
}

function buildModel(loads, o) {
  const n = loads.length;
  const mi = (a, b) => haversineMiles(a, b) * o.roadFactor;
  const loaded = loads.map((l) => (l.miles !== null ? l.miles : mi(l.from, l.to)));
  const dh0 = loads.map((l) => mi(o.start, l.from));
  const dh = loads.map((a) => loads.map((b) => mi(a.to, b.from)));
  const ret = loads.map((l) => mi(l.to, o.start));
  return { n, loads, o, loaded, dh0, dh, ret };
}

/** Drive `h` hours from clock t with d hours driven since the last rest. */
export function drive(o, t, d, h) {
  if (!o.hos) return { t: t + h, d: 0, rests: 0 };
  let rests = 0;
  let left = h;
  let guard = 0;
  while (left > EPS && guard++ < 10000) {
    const avail = o.hosDrive - d;
    if (left <= avail + EPS) { t += left; d += left; left = 0; } else { t += Math.max(0, avail); left -= Math.max(0, avail); t += o.hosRest; d = 0; rests += 1; }
  }
  return { t, d, rests };
}

const milesTo = (m, prev, j) => (prev < 0 ? m.dh0[j] : m.dh[prev][j]);

/** Take load j next from (t, d) after load `prev` (-1 = the start). Null if impossible. */
function advance(m, t, d, prev, j) {
  const o = m.o;
  const L = m.loads[j];
  const dead = milesTo(m, prev, j);
  let r = drive(o, t, d, dead / o.mph);
  let rests = r.rests;
  t = r.t; d = r.d;
  if (t > L.close + EPS) return null;
  let wait = 0;
  if (t < L.open) {
    wait = L.open - t;
    if (o.hos && wait >= o.hosRest - EPS) d = 0;
    t = L.open;
  }
  const pickup = t;
  t += o.dwell;
  r = drive(o, t, d, m.loaded[j] / o.mph);
  rests += r.rests;
  if (r.t > L.deliverBy + EPS) return null;
  const arrive = r.t;
  t = r.t + o.dwell;
  if (t > o.horizon + EPS) return null;
  return { t, d: r.d, v: L.rate - L.extra - (dead + m.loaded[j]) * o.varPerMile, dead, wait, pickup, arrive, rests };
}

function finish(m, t, d, v, prev) {
  const o = m.o;
  let rests = 0;
  let retMiles = 0;
  if (o.returnHome && prev >= 0) {
    retMiles = m.ret[prev];
    const r = drive(o, t, d, retMiles / o.mph);
    t = r.t; rests = r.rests;
    v -= retMiles * o.varPerMile;
    if (t > o.horizon + EPS) return null;
  }
  const days = Math.max(t, 24) / 24;
  return { tEnd: t, V: v, days, obj: o.objective === "total" ? v : v / days, retMiles, retRests: rests };
}

/** Evaluate one ordered chain of load indexes with a full trace; null if impossible. */
export function evaluateChain(loads, order, options) {
  const o = options.varPerMile !== undefined ? options : normalizeOptions(options);
  const m = buildModel(loads, o);
  return traceChain(m, order);
}

function traceChain(m, order) {
  let t = 0, d = 0, v = 0, prev = -1;
  const legs = [];
  for (const j of order) {
    const s = advance(m, t, d, prev, j);
    if (!s) return null;
    legs.push({ index: j, deadheadMiles: s.dead, loadedMiles: m.loaded[j], wait: s.wait, pickupAt: s.pickup, deliverAt: s.arrive, rests: s.rests, net: s.v });
    t = s.t; d = s.d; v += s.v; prev = j;
  }
  if (!order.length) return { legs, tEnd: 0, V: 0, days: 1, obj: 0, retMiles: 0, retRests: 0 };
  const f = finish(m, t, d, v, prev);
  return f ? { legs, ...f } : null;
}

/** Exhaustive reference search over every ordered subset. For tests and tiny lists. */
export function bruteForce(loads, options) {
  const o = options.varPerMile !== undefined ? options : normalizeOptions(options);
  const m = buildModel(loads, o);
  let best = { obj: 0, order: [] };
  const used = new Array(m.n).fill(false);
  const rec = (order, t, d, v, prev) => {
    if (order.length) {
      const f = finish(m, t, d, v, prev);
      if (f && f.obj > best.obj + EPS) best = { obj: f.obj, order: order.slice(), V: f.V, tEnd: f.tEnd };
    }
    for (let j = 0; j < m.n; j += 1) {
      if (used[j]) continue;
      const s = advance(m, t, d, prev, j);
      if (!s) continue;
      used[j] = true; order.push(j);
      rec(order, s.t, s.d, v + s.v, j);
      order.pop(); used[j] = false;
    }
  };
  rec([], 0, 0, 0, -1);
  return best;
}

function greedy(m, key) {
  let t = 0, d = 0, v = 0, prev = -1;
  const order = [];
  const left = new Set(m.loads.map((_, i) => i));
  for (;;) {
    let bestJ = -1, bestS = null, bestKey = -Infinity;
    for (const j of left) {
      const s = advance(m, t, d, prev, j);
      if (!s || s.v <= EPS) continue;
      const k = key(j, s);
      if (k > bestKey + EPS) { bestKey = k; bestJ = j; bestS = s; }
    }
    if (bestJ < 0) break;
    order.push(bestJ); left.delete(bestJ);
    t = bestS.t; d = bestS.d; v += bestS.v; prev = bestJ;
  }
  if (!order.length) return { order, obj: 0, V: 0, tEnd: 0 };
  const f = finish(m, t, d, v, prev);
  return f ? { order, obj: f.obj, V: f.V, tEnd: f.tEnd } : { order: [], obj: 0, V: 0, tEnd: 0 };
}

function baselines(m) {
  const byRate = m.loads.map((l, i) => i).sort((a, b) => (m.loads[b].rate / m.loaded[b]) - (m.loads[a].rate / m.loaded[a]) || a - b);
  // Sorted once, tried in order: the posted dollars-per-loaded-mile habit.
  let t = 0, d = 0, v = 0, prev = -1;
  const order = [];
  for (const j of byRate) {
    const s = advance(m, t, d, prev, j);
    if (!s || s.v <= EPS) continue;
    order.push(j); t = s.t; d = s.d; v += s.v; prev = j;
  }
  const f1 = order.length ? finish(m, t, d, v, prev) : null;
  const rate = f1 ? { order, obj: f1.obj, V: f1.V, tEnd: f1.tEnd } : { order: [], obj: 0, V: 0, tEnd: 0 };
  const near = greedy(m, (j, s) => (m.loads[j].rate - m.loads[j].extra) / (s.dead + m.loaded[j]));
  return [
    { label: "Take the highest posted rate per loaded mile first", ...rate },
    { label: "Always take the next load with the best rate per total mile", ...near },
  ];
}

/** Solve. `parsed` is parseLoads output (or {loads}); options are normalised here. */
export function plan(parsed, options = {}) {
  const loads = parsed.loads;
  if (!loads.length) throw new Error("No loads to plan");
  if (loads.length > MAX_LOADS) throw new Error(`At most ${MAX_LOADS} loads`);
  const o = normalizeOptions(options);
  const m = buildModel(loads, o);
  const n = m.n;
  const states = new Array((1 << n) * n);
  let nodes = 0;
  let truncated = false;

  const insert = (key, lab) => {
    let list = states[key];
    if (!list) { states[key] = [lab]; nodes += 1; return; }
    for (const x of list) if (x.t <= lab.t + EPS && x.d <= lab.d + EPS && x.v >= lab.v - EPS) return;
    const keep = list.filter((x) => !(lab.t <= x.t + EPS && lab.d <= x.d + EPS && lab.v >= x.v - EPS));
    keep.push(lab);
    nodes += 1;
    states[key] = keep;
  };

  for (let j = 0; j < n; j += 1) {
    const s = advance(m, 0, 0, -1, j);
    if (s) insert((1 << j) * n + j, { t: s.t, d: s.d, v: s.v, prev: null, j });
  }
  outer:
  for (let mask = 1; mask < 1 << n; mask += 1) {
    for (let last = 0; last < n; last += 1) {
      if (!(mask & (1 << last))) continue;
      const list = states[mask * n + last];
      if (!list) continue;
      for (const lab of list) {
        for (let j = 0; j < n; j += 1) {
          if (mask & (1 << j)) continue;
          const s = advance(m, lab.t, lab.d, last, j);
          if (!s) continue;
          insert((mask | (1 << j)) * n + j, { t: s.t, d: s.d, v: lab.v + s.v, prev: lab, j });
        }
        if (nodes > NODE_LIMIT) { truncated = true; break outer; }
      }
    }
  }

  const finals = [];
  for (let mask = 1; mask < 1 << n; mask += 1) {
    for (let last = 0; last < n; last += 1) {
      const list = states[mask * n + last];
      if (!list) continue;
      for (const lab of list) {
        const f = finish(m, lab.t, lab.d, lab.v, last);
        if (f) finals.push({ lab, mask, ...f });
      }
    }
  }
  let best = null;
  for (const f of finals) {
    if (f.obj <= EPS) continue;
    if (!best || f.obj > best.obj + EPS || (Math.abs(f.obj - best.obj) <= EPS && (f.tEnd < best.tEnd - EPS || (Math.abs(f.tEnd - best.tEnd) <= EPS && popcount(f.mask) < popcount(best.mask))))) best = f;
  }
  const bestObj = best ? best.obj : 0;

  const orderOf = (lab) => { const r = []; for (let x = lab; x; x = x.prev) r.unshift(x.j); return r; };
  const order = best ? orderOf(best.lab) : [];
  const trace = best ? traceChain(m, order) : null;

  const withBest = new Array(n).fill(null);
  const withoutBest = new Array(n).fill(0);
  for (const f of finals) {
    for (let i = 0; i < n; i += 1) {
      if (f.mask & (1 << i)) { if (withBest[i] === null || f.obj > withBest[i]) withBest[i] = f.obj; }
      else if (f.obj > withoutBest[i]) withoutBest[i] = f.obj;
    }
  }
  const unit = o.objective === "total" ? "$" : "$/day";

  const chain = [];
  if (trace) {
    for (const leg of trace.legs) {
      const i = leg.index;
      const L = loads[i];
      let floor = Infinity;
      const B = withoutBest[i];
      for (const f of finals) {
        if (!(f.mask & (1 << i))) continue;
        const dayFactor = o.objective === "total" ? 1 : f.days;
        floor = Math.min(floor, B * dayFactor - f.V);
      }
      const walkAway = Math.max(0, L.rate + floor);
      chain.push({
        name: L.name, from: L.from.name, to: L.to.name, rate: L.rate, extra: L.extra,
        deadheadMiles: leg.deadheadMiles, loadedMiles: leg.loadedMiles,
        ratePerLoadedMile: L.rate / leg.loadedMiles,
        allInPerMile: (L.rate - L.extra) / (leg.deadheadMiles + leg.loadedMiles),
        net: leg.net, waitHours: leg.wait, pickupAt: leg.pickupAt, deliverAt: leg.deliverAt, rests: leg.rests,
        walkAway, headroom: L.rate - walkAway,
      });
    }
  }
  const inChain = new Set(order);
  const others = [];
  loads.forEach((L, i) => {
    if (inChain.has(i)) return;
    const cost = withBest[i] === null ? null : bestObj - withBest[i];
    others.push({
      name: L.name, from: L.from.name, to: L.to.name, rate: L.rate,
      ratePerLoadedMile: L.rate / m.loaded[i], impossible: withBest[i] === null, costToForce: cost,
      reason: withBest[i] === null ? "cannot be reached inside its pickup window, its delivery deadline or your window from anywhere" : `taking it anyway leaves you ${unit === "$" ? money(cost) : `${money(cost)} per day`} worse off than the best plan`,
    });
  });

  const base = baselines(m).map((b) => ({ label: b.label, loads: b.order.map((i) => loads[i].name), obj: b.obj, profit: b.V, hours: b.tEnd }));
  const bestBase = base.reduce((a, b) => (b.obj > a.obj ? b : a), { obj: 0, label: "Stay parked" });
  const loadedMi = trace ? trace.legs.reduce((s, l) => s + l.loadedMiles, 0) : 0;
  const deadMi = trace ? trace.legs.reduce((s, l) => s + l.deadheadMiles, 0) + trace.retMiles : 0;
  const revenue = trace ? trace.legs.reduce((s, l) => s + loads[l.index].rate, 0) : 0;
  const extras = trace ? trace.legs.reduce((s, l) => s + loads[l.index].extra, 0) : 0;
  const waitTotal = trace ? trace.legs.reduce((s, l) => s + l.wait, 0) : 0;
  const rests = trace ? trace.legs.reduce((s, l) => s + l.rests, 0) + trace.retRests : 0;
  const totals = trace ? {
    revenue, extras, loadedMiles: loadedMi, emptyMiles: deadMi, totalMiles: loadedMi + deadMi,
    fuelAndMileCost: (loadedMi + deadMi) * o.varPerMile, profitBeforeFixed: trace.V,
    elapsedHours: trace.tEnd, days: trace.days, perDayBeforeFixed: trace.V / trace.days,
    perDayAfterFixed: trace.V / trace.days - o.fixedDay,
    windowFixedCost: (o.fixedDay * o.horizon) / 24, netOverWindow: trace.V - (o.fixedDay * o.horizon) / 24,
    emptyShare: deadMi / (loadedMi + deadMi), waitHours: waitTotal, restBreaks: rests,
    allInPerMile: revenue / (loadedMi + deadMi), returnMiles: trace.retMiles,
  } : null;

  const result = {
    options: { ...o, start: o.start.name }, status: best ? "chain" : "none", unit, objective: bestObj,
    chain, totals, others, baselines: base, upliftVsBest: best ? bestObj - bestBase.obj : 0,
    bestBaselineLabel: bestBase.label, truncated, nodes, findings: [],
  };
  if (truncated) result.findings.push({ severity: "warn", rule: "search-limit", message: `The search hit its size limit, so the plan shown may not be the best one. Shorten the list or the window.` });
  if (totals && totals.emptyShare > 0.35) result.findings.push({ severity: "warn", rule: "empty-miles", message: `${pct(totals.emptyShare, 0)} of the miles in this plan are empty (${miles(totals.emptyMiles)}). Check the pickup and drop cities.` });
  if (totals && totals.waitHours > 6) result.findings.push({ severity: "info", rule: "waiting", message: `The plan waits ${hours(totals.waitHours)} for pickup windows to open; fixed costs run while you wait.` });
  if (totals && totals.restBreaks > 0) result.findings.push({ severity: "info", rule: "rests", message: `The plan includes ${totals.restBreaks} forced rest(s) under the ${o.hosDrive}-hour drive / ${o.hosRest}-hour rest rule you set. It is a simplified rule, not a log.` });
  if (best && result.upliftVsBest < 0.005) result.findings.push({ severity: "info", rule: "no-gain", message: `A simple rule finds the same plan here; the search adds nothing on this list.` });
  if (!best) result.findings.push({ severity: "warn", rule: "no-plan", message: `No chain of these loads earns a profit before fixed costs inside your window at these costs.` });
  return result;
}

const popcount = (x) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };

export function summarize(p) {
  if (p.status === "none") return { status: "none", text: "No load or chain here covers its running cost inside your window; staying parked beats all of them on these numbers." };
  const t = p.totals;
  const names = p.chain.map((c) => c.name).join(" -> ");
  const head = `Run ${p.chain.length} load${p.chain.length === 1 ? "" : "s"}: ${names}. ${money(t.profitBeforeFixed)} profit before fixed costs over ${hours(t.elapsedHours)} (${money(t.perDayBeforeFixed)} a day), ${money(t.revenue)} gross on ${miles(t.totalMiles)} of which ${pct(t.emptyShare, 0)} empty.`;
  const gain = p.upliftVsBest >= 0.005
    ? ` ${p.unit === "$" ? money(p.upliftVsBest) : `${money(p.upliftVsBest)} a day`} better than the best simple rule (${p.bestBaselineLabel.toLowerCase()}).`
    : " The same as the best simple rule on this list.";
  return { status: p.upliftVsBest >= 0.005 ? "gain" : "tie", text: head + gain };
}
