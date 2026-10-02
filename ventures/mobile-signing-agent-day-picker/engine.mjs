// Mobile signing agent day picker: one notary, a queue of offered signings with time
// windows, which signings should the day accept and in what order?
//
// Each signing has a price, a print and supply cost, a service time, a window (you
// cannot start before `earliest`, and must start by `latest`) and a spot on a
// map in miles east and north of the home base. Driving costs a per-mile amount
// plus the your hourly cost for the drive minutes; service minutes
// carry the same hourly cost; waiting for a window to open is free (you
// sits parked). You leaves the home base at shift start and must be back by
// shift end.
//
// The exact best day is found by dynamic programming over (set of signings done,
// last signing) keeping, for each state, every non-dominated (finish time, profit)
// pair, so a longer drive that finishes earlier is never thrown away. Up to
// MAX_JOBS signings. The tests check it against trying every ordering of every
// subset. Pure functions, no network, no dependencies.

export const MODEL_NOTE =
  "Day profit = sum of (price - materials - hourly cost x service hours) - per-mile cost x miles driven - hourly cost x drive hours, including the drive back to the home base. " +
  "Drive minutes = straight-line miles x circuity factor / speed. Waiting for a window to open is free. Every figure is your estimate; the plan is the exact best answer for the numbers you supply, not a forecast.";

export const INPUT_NOTES = [
  { what: "Flat fix,85,18,30,08:00,10:00,3,4", detail: "One signing per row: name,price,print and supply cost,service minutes,window opens,latest start,miles east of home base,miles north of home base[,note]. Dollars as plain numbers; times as 24-hour 13:30 or 1:30pm." },
  { what: "Window opens / latest start", detail: "You cannot begin before the first time (the customer is not ready, or the shop is closed) and must begin by the second. Use the whole shift for an open-ended signing." },
  { what: "Miles east / north", detail: "Where the signing is, measured from the home base in miles (negative for west or south). Read them off a map or a distance table; the tool uses straight-line distance times the circuity factor." },
  { what: "Per-mile cost", detail: "Fuel, tires and wear per mile driven. A common starting point is your mileage-method rate, but use your own cost." },
  { what: "Your hourly cost", detail: "What an hour of your time costs you while driving or signing (your target wage, E&O insurance and phone divided by working hours). Waiting is not charged." },
  { what: "Header row and # comments", detail: "A first row starting with name, blank lines and lines starting with # are skipped. Avoid commas inside names." },
];

export const MAX_JOBS = 14;
const EPS = 1e-9;

export function money(n) {
  const v = Math.round(n * 100) / 100;
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}$${abs}`;
}

export function clock(minutes) {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function parseClock(cell) {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap]m)?\s*$/i.exec(String(cell ?? ""));
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ap === "pm" ? 12 : 0);
  } else if (h > 24 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

function nonNeg(cell, what, where, errors) {
  const v = Number(String(cell ?? "").replace(/[$,\s]/g, ""));
  if (cell === undefined || String(cell).trim() === "" || !Number.isFinite(v) || v < 0) {
    errors.push(`${where}: ${what} must be a number, zero or more`);
    return null;
  }
  return v;
}

function signed(cell, what, where, errors) {
  const v = Number(String(cell ?? "").trim());
  if (cell === undefined || String(cell).trim() === "" || !Number.isFinite(v)) {
    errors.push(`${where}: ${what} must be a number (negative for west or south)`);
    return null;
  }
  return v;
}

export function parseSignings(text) {
  const signings = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cells = line.split(",").map((c) => c.trim());
    if (/^name$/i.test(cells[0])) return;
    const where = `line ${i + 1}`;
    if (cells.length < 8) {
      errors.push(`${where}: expected name,price,materials,service_min,earliest,latest,east_miles,north_miles`);
      return;
    }
    const before = errors.length;
    const price = nonNeg(cells[1], "price", where, errors);
    const materials = nonNeg(cells[2], "print and supply cost", where, errors);
    const service = nonNeg(cells[3], "service minutes", where, errors);
    const earliest = parseClock(cells[4]);
    const latest = parseClock(cells[5]);
    if (earliest === null) errors.push(`${where}: window opens must be a time like 08:00 or 8am`);
    if (latest === null) errors.push(`${where}: latest start must be a time like 10:30 or 10:30am`);
    const x = signed(cells[6], "miles east", where, errors);
    const y = signed(cells[7], "miles north", where, errors);
    if (errors.length > before) return;
    if (service <= 0) errors.push(`${where}: service minutes must be above zero`);
    else if (latest < earliest) errors.push(`${where}: latest start is before the window opens`);
    else signings.push({ name: cells[0] || `Signing ${signings.length + 1}`, price, materials, service, earliest, latest, x, y, note: cells.slice(8).join(",") });
  });
  return { signings, errors };
}

const DEFAULTS = { perMile: 0.7, hourly: 35, speed: 30, circuity: 1.3, shiftStart: "08:00", shiftEnd: "17:00" };

export function normalizeOptions(raw = {}) {
  const o = { ...DEFAULTS };
  for (const [k, v] of Object.entries(raw)) if (v !== undefined && v !== null && v !== "") o[k] = v;
  const out = {};
  for (const k of ["perMile", "hourly", "speed", "circuity"]) {
    const v = Number(o[k]);
    if (!Number.isFinite(v) || v < 0) throw new Error(`${k} must be a number, zero or more`);
    out[k] = v;
  }
  if (out.speed <= 0) throw new Error("speed must be above zero");
  if (out.circuity < 1) throw new Error("circuity must be 1 or more (roads are never shorter than a straight line)");
  for (const k of ["shiftStart", "shiftEnd"]) {
    const t = typeof o[k] === "number" ? o[k] : parseClock(o[k]);
    if (t === null) throw new Error(`${k} must be a time like 08:00`);
    out[k] = t;
  }
  if (out.shiftEnd <= out.shiftStart) throw new Error("shiftEnd must be after shiftStart");
  return out;
}

const DEPOT = { x: 0, y: 0 };

function legMiles(a, b, o) {
  return Math.hypot(a.x - b.x, a.y - b.y) * o.circuity;
}
const driveMin = (miles, o) => (miles / o.speed) * 60;
const driveCost = (miles, o) => miles * o.perMile + (driveMin(miles, o) / 60) * o.hourly;
// What the signing itself earns before any driving: price less materials and the
// hours spent at the table.
export const signingValue = (j, o) => j.price - j.materials - (j.service / 60) * o.hourly;

// Run one fixed order and report what happened. Used for the baselines, for
// the route printout, and by the tests as the reference the DP must agree with.
export function simulate(order, signings, o) {
  let t = o.shiftStart;
  let at = DEPOT;
  let profit = 0;
  const stops = [];
  for (const idx of order) {
    const j = signings[idx];
    const miles = legMiles(at, j, o);
    const arrive = t + driveMin(miles, o);
    const start = Math.max(arrive, j.earliest);
    if (start > j.latest + EPS) return { feasible: false };
    const margin = signingValue(j, o) - driveCost(miles, o);
    stops.push({ index: idx, name: j.name, arrive, wait: start - arrive, start, finish: start + j.service, miles, margin });
    profit += margin;
    t = start + j.service;
    at = j;
  }
  const back = legMiles(at, DEPOT, o);
  const home = t + driveMin(back, o);
  if (home > o.shiftEnd + EPS) return { feasible: false };
  if (order.length) profit -= driveCost(back, o);
  return { feasible: true, profit, stops, backMiles: order.length ? back : 0, home: order.length ? home : o.shiftStart };
}

function prune(labels) {
  labels.sort((a, b) => a.t - b.t || b.p - a.p);
  const kept = [];
  let best = -Infinity;
  for (const l of labels) {
    if (l.p > best + EPS) {
      kept.push(l);
      best = l.p;
    }
  }
  return kept;
}

// Exact search. Returns the best order, plus for each signing the best day that
// is forced to include it (used to price a declined signing exactly).
export function optimize(signings, o) {
  const n = signings.length;
  if (n > MAX_JOBS) throw new Error(`at most ${MAX_JOBS} signings per day; split a longer queue into morning and afternoon`);
  const full = 1 << n;
  const table = new Array(full * n).fill(null);
  const value = signings.map((j) => signingValue(j, o));
  const homeMiles = signings.map((j) => legMiles(j, DEPOT, o));
  const best = { profit: 0, label: null };
  const bestWith = new Array(n).fill(null).map(() => ({ profit: -Infinity, label: null }));

  const consider = (label, mask) => {
    const last = label.last;
    const home = label.t + driveMin(homeMiles[last], o);
    if (home > o.shiftEnd + EPS) return;
    const total = label.p - driveCost(homeMiles[last], o);
    if (total > best.profit + EPS) {
      best.profit = total;
      best.label = label;
    }
    for (let j = 0; j < n; j += 1) {
      if (mask & (1 << j) && total > bestWith[j].profit + EPS) {
        bestWith[j].profit = total;
        bestWith[j].label = label;
      }
    }
  };

  const extend = (from, mask, last, t, p) => {
    const fromPoint = last < 0 ? DEPOT : signings[last];
    for (let k = 0; k < n; k += 1) {
      if (mask & (1 << k)) continue;
      const miles = legMiles(fromPoint, signings[k], o);
      const start = Math.max(t + driveMin(miles, o), signings[k].earliest);
      if (start > signings[k].latest + EPS) continue;
      const next = mask | (1 << k);
      const cell = (table[next * n + k] ||= []);
      cell.push({ last: k, t: start + signings[k].service, p: p + value[k] - driveCost(miles, o), prev: from });
    }
  };

  extend(null, 0, -1, o.shiftStart, 0);
  for (let mask = 1; mask < full; mask += 1) {
    for (let last = 0; last < n; last += 1) {
      const cell = table[mask * n + last];
      if (!cell) continue;
      const kept = prune(cell);
      table[mask * n + last] = kept;
      for (const label of kept) {
        consider(label, mask);
        extend(label, mask, last, label.t, label.p);
      }
    }
  }
  const order = (label) => {
    const out = [];
    for (let l = label; l; l = l.prev) out.unshift(l.last);
    return out;
  };
  return {
    profit: best.profit,
    order: best.label ? order(best.label) : [],
    bestWith: bestWith.map((b) => ({ profit: b.profit, order: b.label ? order(b.label) : null })),
  };
}

// Baseline rules an agent might follow without an optimizer: take offers
// in the order they came in, or the highest fees first, accepting each one
// that still fits in the day behind the ones already taken.
function greedy(sequence, signings, o) {
  const taken = [];
  for (const idx of sequence) {
    if (simulate([...taken, idx], signings, o).feasible) taken.push(idx);
  }
  return taken;
}

export function plan(parsed, rawOptions = {}) {
  const o = normalizeOptions(rawOptions);
  const signings = parsed.signings;
  const opt = optimize(signings, o);
  const run = simulate(opt.order, signings, o);
  const chosen = new Set(opt.order);
  const alone = signings.map((j, i) => simulate([i], signings, o));

  const baseline = (label, seq) => {
    const order = greedy(seq, signings, o);
    const r = simulate(order, signings, o);
    return { label, order, profit: order.length ? r.profit : 0, signings: order.length };
  };
  const indices = signings.map((_, i) => i);
  const baselines = [
    baseline("Take signings in the order offers came in", indices),
    baseline("Highest fee first", [...indices].sort((a, b) => signings[b].price - signings[a].price || a - b)),
  ];
  const bestBaseline = baselines.reduce((m, b) => (b.profit > m.profit ? b : m), baselines[0] ?? { profit: 0 });

  const declined = [];
  const findings = [];
  signings.forEach((j, i) => {
    if (chosen.has(i)) return;
    const forced = opt.bestWith[i];
    let reason;
    let minPrice = null;
    if (!alone[i].feasible) {
      reason = "cannot be reached inside its window and back by shift end, even as the only signing";
    } else if (alone[i].profit < 0) {
      reason = "loses money even as the only signing of the day";
      minPrice = j.price - alone[i].profit;
    } else {
      reason = "its slot is worth more to the signings the plan takes instead";
    }
    if (forced.order) minPrice = j.price + (opt.profit - forced.profit);
    declined.push({ index: i, name: j.name, reason, price: j.price, minPrice, standalone: alone[i].feasible ? alone[i].profit : null });
    findings.push({ severity: "warn", rule: "decline", message: `${j.name}: ${reason}.${minPrice !== null ? ` It would earn a place at about ${money(minPrice)} or more.` : ""}` });
  });

  const idle = run.feasible ? run.stops.reduce((s, x) => s + x.wait, 0) : 0;
  const miles = run.feasible ? run.stops.reduce((s, x) => s + x.miles, 0) + run.backMiles : 0;
  const result = {
    options: o,
    signings,
    order: opt.order,
    route: run.feasible ? run.stops : [],
    home: run.feasible ? run.home : o.shiftStart,
    profit: opt.profit,
    miles,
    idleMinutes: idle,
    accepted: opt.order.length,
    declined,
    baselines,
    upliftVsBest: opt.profit - bestBaseline.profit,
    findings,
  };
  if (opt.order.length && idle > 30) {
    findings.push({ severity: "info", rule: "idle", message: `The plan waits ${Math.round(idle)} minutes for windows to open. That time is free in this model, but it may be sellable: a nearby short signing with an earlier window would fill it.` });
  }
  return result;
}

export function summarize(p) {
  if (!p.signings.length) return { status: "none", text: "No signings entered." };
  if (!p.accepted) return { status: "none", text: `No signing is worth running today: each loses money or cannot fit its window. Best day profit ${money(0)}.` };
  const gain = p.upliftVsBest;
  const text =
    `Run ${p.accepted} of ${p.signings.length} signings for ${money(p.profit)} (${p.miles.toFixed(1)} miles, home by ${clock(p.home)}). ` +
    (gain > 0.005 ? `That is ${money(gain)} more than the better of first-come and highest-fee-first.` : "First-come and highest-fee-first rules do as well on this queue.");
  return { status: gain > 0.005 ? "gain" : "ok", text };
}
