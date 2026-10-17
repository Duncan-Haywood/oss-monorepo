// Short-term-rental turnover crew planner: a cleaning company has one to
// three crews and a queue of turnovers, each with a fee, a supplies cost, a
// clean time, a checkout time (the crew cannot start before it) and the next
// guest's check-in (the clean must be finished by then, so the latest start is
// check-in minus clean minutes), at a spot in miles east and north of the
// depot. Which turnovers should the company take, and which crew does which,
// in what order?
//
// One crew's best route over every set of jobs is found exactly by dynamic
// programming over (set of jobs done, last job), keeping every non-dominated
// (finish time, profit) pair per state. The best split of the queue across up
// to three crews is then found exactly over every partition of the jobs
// (subset convolution), so the tests can check both against brute force.
// Pure functions, no network, no dependencies.

export const MODEL_NOTE =
  "Day profit = sum of (fee - supplies - crew hourly cost x clean hours) - per-mile cost x miles driven - crew hourly cost x drive hours, including each crew's drive back to the depot. " +
  "Drive minutes = straight-line miles x circuity factor / speed. A crew waiting for a checkout is not charged. Every figure is your estimate; the plan is the exact best answer for the numbers you supply, not a forecast.";

export const INPUT_NOTES = [
  { what: "Unit 4B,95,14,90,11:00,15:00,3,4", detail: "One turnover per row: name,fee,supplies cost,clean minutes,checkout time,next check-in,miles east of depot,miles north of depot[,note]. Dollars as plain numbers; times as 24-hour 13:30 or 1:30pm." },
  { what: "Checkout and next check-in", detail: "The crew cannot start before the guest checks out, and the clean must be finished by the next check-in, so the latest start is check-in minus clean minutes. Use a late check-in (or the end of the shift) for a vacant unit." },
  { what: "Fee", detail: "What the owner pays you for the turnover, plus any pass-through you keep. A job paid per hour: type hours x rate." },
  { what: "Supplies cost", detail: "Linens laundered, consumables and anything else you pay per turnover that is not crew time." },
  { what: "Miles east / north", detail: "Where the property is, from the depot in miles (negative for west or south). The tool uses straight-line distance times the circuity factor." },
  { what: "Crews", detail: "1 to 3 identical crews that all leave the same depot. A crew's hourly cost is what an hour of that crew costs you, driving or cleaning; waiting is free." },
  { what: "Header row and # comments", detail: "A first row starting with name, blank lines and lines starting with # are skipped. Avoid commas inside names." },
];

export const MAX_JOBS = 12;
export const MAX_CREWS = 3;
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

export function parseJobs(text) {
  const jobs = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cells = line.split(",").map((c) => c.trim());
    if (/^name$/i.test(cells[0])) return;
    const where = `line ${i + 1}`;
    if (cells.length < 8) {
      errors.push(`${where}: expected name,fee,supplies,clean_min,checkout,next_checkin,east_miles,north_miles`);
      return;
    }
    const before = errors.length;
    const price = nonNeg(cells[1], "fee", where, errors);
    const materials = nonNeg(cells[2], "supplies cost", where, errors);
    const service = nonNeg(cells[3], "clean minutes", where, errors);
    const earliest = parseClock(cells[4]);
    const checkin = parseClock(cells[5]);
    if (earliest === null) errors.push(`${where}: checkout must be a time like 11:00 or 11am`);
    if (checkin === null) errors.push(`${where}: next check-in must be a time like 15:00 or 3pm`);
    const x = signed(cells[6], "miles east", where, errors);
    const y = signed(cells[7], "miles north", where, errors);
    if (errors.length > before) return;
    if (service <= 0) errors.push(`${where}: clean minutes must be above zero`);
    else if (checkin - service < earliest) errors.push(`${where}: the clean (${service} min) does not fit between checkout and next check-in`);
    else jobs.push({ name: cells[0] || `Turnover ${jobs.length + 1}`, price, materials, service, earliest, checkin, latest: checkin - service, x, y, note: cells.slice(8).join(",") });
  });
  return { jobs, errors };
}

const DEFAULTS = { perMile: 0.7, hourly: 40, speed: 30, circuity: 1.3, shiftStart: "09:00", shiftEnd: "18:00", crews: 2 };

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
  const crews = Number(o.crews);
  if (!Number.isInteger(crews) || crews < 1 || crews > MAX_CREWS) throw new Error(`crews must be a whole number from 1 to ${MAX_CREWS}`);
  out.crews = crews;
  for (const k of ["shiftStart", "shiftEnd"]) {
    const t = typeof o[k] === "number" ? o[k] : parseClock(o[k]);
    if (t === null) throw new Error(`${k} must be a time like 09:00`);
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
// What the turnover itself earns before any driving: fee less supplies and the
// crew hours spent cleaning.
export const jobValue = (j, o) => j.price - j.materials - (j.service / 60) * o.hourly;

// Run one crew's fixed order and report what happened. Used for the baselines,
// the printout, and by the tests as the reference the search must agree with.
export function simulate(order, jobs, o) {
  let t = o.shiftStart;
  let at = DEPOT;
  let profit = 0;
  const stops = [];
  for (const idx of order) {
    const j = jobs[idx];
    const miles = legMiles(at, j, o);
    const arrive = t + driveMin(miles, o);
    const start = Math.max(arrive, j.earliest);
    if (start > j.latest + EPS) return { feasible: false };
    const margin = jobValue(j, o) - driveCost(miles, o);
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

const orderOf = (label) => {
  const out = [];
  for (let l = label; l; l = l.prev) out.unshift(l.last);
  return out;
};

// One crew, exact. g[mask] is the best profit of a single crew that does
// exactly the jobs in mask (-Infinity if no order fits), best[mask] its order.
export function crewTable(jobs, o) {
  const n = jobs.length;
  if (n > MAX_JOBS) throw new Error(`at most ${MAX_JOBS} turnovers per day; split a longer queue into two days or two depots`);
  const full = 1 << n;
  const table = new Array(full * n).fill(null);
  const value = jobs.map((j) => jobValue(j, o));
  const homeMiles = jobs.map((j) => legMiles(j, DEPOT, o));
  const g = new Float64Array(full).fill(-Infinity);
  const bestLabel = new Array(full).fill(null);
  g[0] = 0;

  const extend = (from, mask, last, t, p) => {
    const fromPoint = last < 0 ? DEPOT : jobs[last];
    for (let k = 0; k < n; k += 1) {
      if (mask & (1 << k)) continue;
      const miles = legMiles(fromPoint, jobs[k], o);
      const start = Math.max(t + driveMin(miles, o), jobs[k].earliest);
      if (start > jobs[k].latest + EPS) continue;
      const next = mask | (1 << k);
      (table[next * n + k] ||= []).push({ last: k, t: start + jobs[k].service, p: p + value[k] - driveCost(miles, o), prev: from });
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
        const home = label.t + driveMin(homeMiles[last], o);
        if (home <= o.shiftEnd + EPS) {
          const total = label.p - driveCost(homeMiles[last], o);
          if (total > g[mask] + EPS) {
            g[mask] = total;
            bestLabel[mask] = label;
          }
        }
        extend(label, mask, last, label.t, label.p);
      }
    }
  }
  return { g, order: (mask) => (bestLabel[mask] ? orderOf(bestLabel[mask]) : []) };
}

// Split the queue across up to `crews` identical crews, exactly. F[k][mask] is
// the best total when the jobs in mask are all served by at most k crews.
// Returns the best day, the best day forced to include each job, and the
// per-crew job sets of the best day.
export function optimize(jobs, o) {
  const n = jobs.length;
  const full = 1 << n;
  const ct = crewTable(jobs, o);
  const K = o.crews;
  const F = [null, ct.g];
  const split = [null, null];
  for (let k = 2; k <= K; k += 1) {
    const cur = new Float64Array(full).fill(-Infinity);
    const cho = new Int32Array(full).fill(0);
    cur[0] = 0;
    for (let mask = 1; mask < full; mask += 1) {
      // One crew takes `sub` (always a set that contains the lowest job, to
      // avoid trying each split twice); the other crews take the rest.
      const low = mask & -mask;
      for (let sub = mask; sub > 0; sub = (sub - 1) & mask) {
        if (!(sub & low)) continue;
        const a = ct.g[sub];
        if (a === -Infinity) continue;
        const b = F[k - 1][mask ^ sub];
        if (b === -Infinity) continue;
        if (a + b > cur[mask] + EPS) {
          cur[mask] = a + b;
          cho[mask] = sub;
        }
      }
    }
    F.push(cur);
    split.push(cho);
  }
  const top = F[K];
  let bestMask = 0;
  let best = 0;
  const bestWith = new Array(n).fill(null).map(() => ({ profit: -Infinity, mask: null }));
  for (let mask = 0; mask < full; mask += 1) {
    if (top[mask] === -Infinity) continue;
    if (top[mask] > best + EPS) {
      best = top[mask];
      bestMask = mask;
    }
    for (let j = 0; j < n; j += 1) {
      if (mask & (1 << j) && top[mask] > bestWith[j].profit + EPS) bestWith[j] = { profit: top[mask], mask };
    }
  }
  // Rebuild the crews for a mask served by at most K crews.
  const crewsFor = (mask) => {
    const out = [];
    let rest = mask;
    for (let k = K; k >= 2 && rest; k -= 1) {
      if (F[k][rest] === ct.g[rest] && ct.g[rest] > -Infinity) {
        out.push(ct.order(rest));
        rest = 0;
        break;
      }
      const sub = split[k][rest];
      out.push(ct.order(sub));
      rest ^= sub;
    }
    if (rest) out.push(ct.order(rest));
    return out.filter((c) => c.length);
  };
  return {
    profit: best,
    crews: crewsFor(bestMask),
    bestWith: bestWith.map((b) => ({ profit: b.profit, crews: b.mask === null ? null : crewsFor(b.mask) })),
  };
}

// Baseline rules a dispatcher might follow without an optimizer: take the
// turnovers in the order they were booked, or the biggest fees first, giving
// each to the crew where it fits and adds the most, skipping what fits nowhere.
function greedy(sequence, jobs, o) {
  const crews = Array.from({ length: o.crews }, () => []);
  for (const idx of sequence) {
    let pick = -1;
    let gain = -Infinity;
    crews.forEach((c, i) => {
      const before = c.length ? simulate(c, jobs, o).profit : 0;
      const r = simulate([...c, idx], jobs, o);
      if (r.feasible && r.profit - before > gain + EPS) {
        gain = r.profit - before;
        pick = i;
      }
    });
    if (pick >= 0) crews[pick].push(idx);
  }
  return crews.filter((c) => c.length);
}

const totalOf = (crews, jobs, o) => crews.reduce((s, c) => s + simulate(c, jobs, o).profit, 0);

export function plan(parsed, rawOptions = {}) {
  const o = normalizeOptions(rawOptions);
  const jobs = parsed.jobs;
  const opt = optimize(jobs, o);
  const runs = opt.crews.map((order) => ({ order, ...simulate(order, jobs, o) }));
  const chosen = new Set(opt.crews.flat());
  const alone = jobs.map((j, i) => simulate([i], jobs, o));

  const baseline = (label, seq) => {
    const crews = greedy(seq, jobs, o);
    return { label, crews, profit: crews.length ? totalOf(crews, jobs, o) : 0, jobs: crews.flat().length };
  };
  const indices = jobs.map((_, i) => i);
  const baselines = [
    baseline("Book turnovers in the order they came in", indices),
    baseline("Biggest fees first", [...indices].sort((a, b) => jobs[b].price - jobs[a].price || a - b)),
  ];
  const bestBaseline = baselines.reduce((m, b) => (b.profit > m.profit ? b : m), baselines[0] ?? { profit: 0 });

  const declined = [];
  const findings = [];
  jobs.forEach((j, i) => {
    if (chosen.has(i)) return;
    const forced = opt.bestWith[i];
    let reason;
    let minFee = null;
    if (!alone[i].feasible) {
      reason = "cannot be reached between its checkout and check-in and back by shift end, even as the only job";
    } else if (alone[i].profit < 0) {
      reason = "loses money even as the only job of the day";
      minFee = j.price - alone[i].profit;
    } else {
      reason = "the crew time is worth more on the turnovers the plan takes instead";
    }
    if (forced.crews) minFee = j.price + (opt.profit - forced.profit);
    declined.push({ index: i, name: j.name, reason, price: j.price, minPrice: minFee, standalone: alone[i].feasible ? alone[i].profit : null });
    findings.push({ severity: "warn", rule: "decline", message: `${j.name}: ${reason}.${minFee !== null ? ` It would earn a place at about ${money(minFee)} or more.` : ""}` });
  });

  const stopsAll = runs.flatMap((r) => r.stops);
  const idle = stopsAll.reduce((s, x) => s + x.wait, 0);
  const miles = runs.reduce((s, r) => s + r.stops.reduce((m, x) => m + x.miles, 0) + r.backMiles, 0);
  const result = {
    options: o,
    jobs,
    crews: runs.map((r, i) => ({ crew: i + 1, order: r.order, route: r.stops, home: r.home, profit: r.profit })),
    profit: opt.profit,
    miles,
    idleMinutes: idle,
    accepted: chosen.size,
    declined,
    baselines,
    upliftVsBest: opt.profit - bestBaseline.profit,
    findings,
  };
  if (chosen.size && idle > 45) {
    findings.push({ severity: "info", rule: "idle", message: `Crews wait ${Math.round(idle)} minutes in total for checkouts. That time is free in this model, but a nearby early-checkout turnover would fill it.` });
  }
  if (o.crews > 1 && runs.length < o.crews && chosen.size) {
    findings.push({ severity: "info", rule: "spare-crew", message: `Only ${runs.length} of ${o.crews} crews are needed on this queue; the spare crew has no turnover that earns its hours.` });
  }
  return result;
}

export function summarize(p) {
  if (!p.jobs.length) return { status: "none", text: "No turnovers entered." };
  if (!p.accepted) return { status: "none", text: `No turnover is worth running today: each loses money or cannot fit between checkout and check-in. Best day profit ${money(0)}.` };
  const gain = p.upliftVsBest;
  const text =
    `Run ${p.accepted} of ${p.jobs.length} turnovers with ${p.crews.length} crew${p.crews.length === 1 ? "" : "s"} for ${money(p.profit)} (${p.miles.toFixed(1)} miles). ` +
    (gain > 0.005 ? `That is ${money(gain)} more than the better of first-come and biggest-fee-first booking.` : "First-come and biggest-fee-first booking do as well on this queue.");
  return { status: gain > 0.005 ? "gain" : "ok", text };
}
