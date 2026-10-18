// Support staffing planner: how many people does a phone, chat or ticket
// queue need in every half hour, and what is the cheapest set of shifts that
// covers it?
//
// Per interval: workload A (erlangs) = contacts x average handle time /
// interval length. The fewest agents N that meet the service target
// ("X% answered within T seconds", Erlang C) and an optional occupancy cap
// are found by search. Agents scheduled = ceil(N / (1 - shrinkage)), shrinkage
// being breaks, training, meetings and leave.
//
// The cheapest shifts that cover the scheduled requirement in every interval
// is an interval-covering problem (consecutive-ones matrix), solved exactly
// as a min-cost flow on a line of interval boundaries; the tests check it
// against trying every combination of shifts. Pure functions, no network, no
// dependencies.

export const MODEL_NOTE =
  "Workload = contacts x handle time / interval. Agents on the queue come from the Erlang C formula (answered within your target time at your target percent, under your occupancy cap); " +
  "scheduled agents = on-queue / (1 - shrinkage). Shifts are chosen to cover every interval at the lowest total paid cost. Erlang C assumes random arrivals and that no contact gives up while waiting; " +
  "volumes, handle times and shrinkage are your estimates, so this is a planning aid, not a forecast.";

export const INPUT_NOTES = [
  { what: "Mon,09:00,42,300", detail: "One interval per row: day label, interval start (HH:MM), contacts that arrive in it, average handle time in seconds (optional, falls back to the default). Intervals must be multiples of the interval length." },
  { what: "Interval length", detail: "Minutes per row, usually 30 (15 or 60 also work). Every row on a day must sit on that grid; gaps are treated as zero contacts." },
  { what: "Service target", detail: "Percent of contacts answered within a number of seconds, e.g. 80 in 20. Chat and email teams can use a long window (e.g. 90 in 300)." },
  { what: "Shrinkage and occupancy", detail: "Shrinkage is the share of paid time agents are not on the queue (breaks, meetings, leave). The occupancy cap stops the plan from running agents flat out." },
  { what: "Shifts and wage", detail: "Shift lengths allowed in hours (for example 8,4), a start step in minutes, a shortest closing shift and a fully loaded hourly cost. A shift must fit inside the hours you gave, apart from a shorter closing shift." },
  { what: "Header row and # comments", detail: "A first row starting with day, blank lines and lines starting with # are skipped." },
];

const MAX_ROWS = 7 * 96;

export function money(n) {
  const v = Math.round(n * 100) / 100;
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}$${abs}`;
}

export function pct(n, digits = 0) {
  return Number.isFinite(n) ? `${(Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits)}%` : "n/a";
}

export function clock(minute) {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function parseClock(cell) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(cell ?? "").trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return NaN;
  return +m[1] * 60 + +m[2];
}

// ---- Erlang C -------------------------------------------------------------

// Probability a contact has to wait, for N agents and A erlangs (N > A).
export function erlangC(n, a) {
  if (a <= 0) return 0;
  if (n <= a) return 1;
  let b = 1; // Erlang B by the stable recursion
  for (let k = 1; k <= n; k += 1) b = (a * b) / (k + a * b);
  return (n * b) / (n - a * (1 - b));
}

export function serviceLevel(n, a, ahtSeconds, answerSeconds) {
  if (a <= 0) return 1;
  if (n <= a) return 0;
  return 1 - erlangC(n, a) * Math.exp((-(n - a) * answerSeconds) / ahtSeconds);
}

export function averageSpeedOfAnswer(n, a, ahtSeconds) {
  if (a <= 0) return 0;
  if (n <= a) return Infinity;
  return (erlangC(n, a) * ahtSeconds) / (n - a);
}

// Fewest agents on the queue meeting the service target and occupancy cap.
export function agentsNeeded(a, ahtSeconds, o) {
  if (a <= 0) return 0;
  let n = Math.floor(a) + 1;
  for (; n < 100000; n += 1) {
    if (o.maxOccupancy > 0 && a / n > o.maxOccupancy / 100 + 1e-12) continue;
    if (serviceLevel(n, a, ahtSeconds, o.answerSeconds) >= o.serviceLevel / 100 - 1e-12) return n;
  }
  throw new Error("Workload is too large to staff with these settings");
}

// ---- input ----------------------------------------------------------------

export function parseDemand(text) {
  const rows = [];
  const errors = [];
  const seen = new Set();
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cells = line.split(",").map((c) => c.trim());
    if (/^day$/i.test(cells[0])) return;
    const where = `line ${i + 1}`;
    const day = cells[0];
    const minute = parseClock(cells[1]);
    if (!day) { errors.push(`${where}: the row needs a day label`); return; }
    if (Number.isNaN(minute)) { errors.push(`${where}: start must be HH:MM (got "${cells[1] ?? ""}")`); return; }
    const contacts = Number(String(cells[2] ?? "").replace(/[,\s]/g, ""));
    if (cells[2] === undefined || cells[2] === "" || !Number.isFinite(contacts) || contacts < 0) { errors.push(`${where}: contacts must be a number, zero or more`); return; }
    let aht = null;
    if (cells[3] !== undefined && cells[3] !== "") {
      aht = Number(cells[3]);
      if (!Number.isFinite(aht) || aht <= 0) { errors.push(`${where}: handle time must be a positive number of seconds`); return; }
    }
    const key = `${day}|${minute}`;
    if (seen.has(key)) { errors.push(`${where}: ${day} ${clock(minute)} appears twice`); return; }
    seen.add(key);
    rows.push({ day, minute, contacts, aht });
  });
  if (rows.length > MAX_ROWS) errors.push(`Too many rows: ${rows.length} (limit ${MAX_ROWS})`);
  return { rows, errors };
}

function numOpt(v, def, name, { min = 0, max = Infinity, positive = false } = {}) {
  const x = v === undefined || v === null || v === "" ? def : Number(v);
  if (!Number.isFinite(x) || x < min || x > max || (positive && x <= 0)) throw new Error(`${name} must be a number${positive ? " above zero" : ""}${max < Infinity ? ` up to ${max}` : ""}`);
  return x;
}

export function normalizeOptions(options = {}) {
  const o = {
    intervalMinutes: numOpt(options.intervalMinutes, 30, "interval", { positive: true, max: 240 }),
    serviceLevel: numOpt(options.serviceLevel, 80, "service level", { positive: true, max: 99.9 }),
    answerSeconds: numOpt(options.answerSeconds, 20, "answer time", { max: 86400 }),
    shrinkage: numOpt(options.shrinkage, 30, "shrinkage", { max: 90 }),
    maxOccupancy: numOpt(options.maxOccupancy, 85, "max occupancy", { max: 100 }),
    aht: numOpt(options.aht, 300, "handle time", { positive: true }),
    wage: numOpt(options.wage, 22, "hourly cost"),
    startStepMinutes: numOpt(options.startStepMinutes, 60, "start step", { positive: true, max: 480 }),
    minShiftHours: numOpt(options.minShiftHours, 3, "shortest closing shift", { positive: true, max: 24 }),
  };
  const raw = Array.isArray(options.shifts) ? options.shifts : String(options.shifts ?? "8,4").split(",");
  o.shifts = [...new Set(raw.map((x) => Number(String(x).trim())))].sort((a, b) => b - a);
  if (!o.shifts.length || o.shifts.some((h) => !Number.isFinite(h) || h <= 0 || h > 24)) throw new Error("shifts must be a list of lengths in hours, for example 8,4");
  if (o.maxOccupancy > 0 && o.maxOccupancy < 10) throw new Error("max occupancy must be 0 (no cap) or at least 10");
  const im = o.intervalMinutes;
  if (!Number.isInteger(im) || 1440 % im !== 0) throw new Error("interval must be a whole number of minutes that divides a day (15, 30, 60 ...)");
  for (const h of o.shifts) if (!Number.isInteger((h * 60) / im)) throw new Error(`shift of ${h}h is not a whole number of ${im}-minute intervals`);
  if (!Number.isInteger(o.startStepMinutes / im)) throw new Error(`start step must be a multiple of the ${im}-minute interval`);
  if (!Number.isInteger((o.minShiftHours * 60) / im)) throw new Error(`shortest closing shift must be a whole number of ${im}-minute intervals`);
  return o;
}

// ---- demand to scheduled requirement ----------------------------------------

function buildDays(parsed, o) {
  const order = [];
  const by = new Map();
  for (const r of parsed.rows) {
    if (r.minute % o.intervalMinutes) throw new Error(`${r.day} ${clock(r.minute)} is not on the ${o.intervalMinutes}-minute grid`);
    if (!by.has(r.day)) { by.set(r.day, []); order.push(r.day); }
    by.get(r.day).push(r);
  }
  return order.map((name) => {
    const rows = by.get(name);
    const first = Math.min(...rows.map((r) => r.minute / o.intervalMinutes));
    const last = Math.max(...rows.map((r) => r.minute / o.intervalMinutes));
    const slots = [];
    for (let k = first; k <= last; k += 1) slots.push({ index: k, minute: k * o.intervalMinutes, contacts: 0, aht: o.aht, given: false });
    for (const r of rows) {
      const s = slots[r.minute / o.intervalMinutes - first];
      s.contacts = r.contacts; s.aht = r.aht ?? o.aht; s.given = true;
    }
    for (const s of slots) {
      s.erlangs = (s.contacts * s.aht) / (o.intervalMinutes * 60);
      s.onQueue = agentsNeeded(s.erlangs, s.aht, o);
      s.occupancyBound = s.onQueue > 0 && o.maxOccupancy > 0 && serviceLevel(s.onQueue - 1, s.erlangs, s.aht, o.answerSeconds) >= o.serviceLevel / 100 - 1e-12;
      s.required = s.onQueue === 0 ? 0 : Math.ceil(s.onQueue / (1 - o.shrinkage / 100) - 1e-9);
    }
    return { name, firstMinute: first * o.intervalMinutes, slots };
  });
}

// ---- cheapest cover (min-cost flow on a line) --------------------------------

export function candidateShifts(T, o, lengthsHours) {
  const im = o.intervalMinutes;
  const step = o.startStepMinutes / im;
  const minLen = Math.round((o.minShiftHours * 60) / im);
  const seen = new Map();
  for (const h of lengthsHours) {
    const L = Math.round((h * 60) / im);
    for (let s = 0; s < T; s += step) {
      let e = s + L;
      if (e > T) { if (T - s < minLen) continue; e = T; }
      const key = `${s}-${e}`;
      if (!seen.has(key)) seen.set(key, { start: s, end: e, hours: ((e - s) * im) / 60 });
    }
  }
  return [...seen.values()];
}

export function minCostCover(demand, cands, wage) {
  const T = demand.length;
  const top = Math.max(0, ...demand);
  if (top === 0) return { shifts: [], cost: 0 };
  // Coverage in any interval can never usefully exceed the number of shifts,
  // and an optimal plan needs at most one shift per unit of requirement, so
  // the total flow M is the sum of the requirement. A smaller M would forbid
  // fixed-length shifts from overlapping past the busiest interval.
  const M = demand.reduce((a, b) => a + b, 0);
  const to = []; const cap = []; const cost = []; const adj = Array.from({ length: T + 1 }, () => []);
  const add = (u, v, c, w) => {
    adj[u].push(to.length); to.push(v); cap.push(c); cost.push(w);
    adj[v].push(to.length); to.push(u); cap.push(0); cost.push(-w);
  };
  for (let t = 0; t < T; t += 1) add(t, t + 1, M - demand[t], 0);
  const shiftEdge = cands.map((c) => { const id = to.length; add(c.start, c.end, M, Math.round(c.hours * wage * 100)); return id; });
  let flow = 0;
  while (flow < M) {
    const dist = new Array(T + 1).fill(Infinity); const prev = new Array(T + 1).fill(-1);
    dist[0] = 0;
    for (let pass = 0; pass <= T + 1; pass += 1) {
      let changed = false;
      for (let u = 0; u <= T; u += 1) {
        if (dist[u] === Infinity) continue;
        for (const id of adj[u]) {
          if (cap[id] > 0 && dist[u] + cost[id] < dist[to[id]]) { dist[to[id]] = dist[u] + cost[id]; prev[to[id]] = id; changed = true; }
        }
      }
      if (!changed) break;
    }
    if (dist[T] === Infinity) return null;
    let push = M - flow;
    for (let v = T; v !== 0; v = to[prev[v] ^ 1]) push = Math.min(push, cap[prev[v]]);
    for (let v = T; v !== 0; v = to[prev[v] ^ 1]) { cap[prev[v]] -= push; cap[prev[v] ^ 1] += push; }
    flow += push;
  }
  const shifts = [];
  let total = 0;
  cands.forEach((c, i) => {
    const n = cap[shiftEdge[i] ^ 1];
    if (n > 0) { shifts.push({ ...c, count: n }); total += n * c.hours * wage; }
  });
  return { shifts, cost: total };
}

function solveDays(days, o, lengths, requirement = (s) => s.required) {
  let cost = 0; let hours = 0; let shifts = 0;
  const solved = days.map((d) => {
    const demand = d.slots.map(requirement);
    const cands = candidateShifts(demand.length, o, lengths);
    const r = minCostCover(demand, cands, o.wage);
    if (!r) throw new Error(`No allowed shift can cover ${d.name} (check the shift lengths, start step and shortest closing shift)`);
    const coverage = new Array(demand.length).fill(0);
    for (const s of r.shifts) for (let t = s.start; t < s.end; t += 1) coverage[t] += s.count;
    r.shifts.sort((a, b) => a.start - b.start || b.hours - a.hours);
    cost += r.cost;
    for (const s of r.shifts) { hours += s.count * s.hours; shifts += s.count; }
    return { day: d, demand, shifts: r.shifts, coverage, cost: r.cost };
  });
  return { solved, cost, hours, shifts };
}

// ---- the plan -----------------------------------------------------------------

function scenario(parsed, o, tweak) {
  const p2 = tweak.rows ? { rows: parsed.rows.map(tweak.rows) } : parsed;
  const o2 = { ...o, ...(tweak.opts || {}) };
  const days = buildDays(p2, o2);
  return { o: o2, days, res: solveDays(days, o2, o2.shifts) };
}

export function plan(parsed, options = {}) {
  const o = normalizeOptions(options);
  if (!parsed.rows.length) throw new Error("No interval rows found");
  const days = buildDays(parsed, o);
  const base = solveDays(days, o, o.shifts);
  const im = o.intervalMinutes;

  const dayOut = base.solved.map((s) => {
    const slots = s.day.slots.map((sl, t) => {
      const onQ = Math.floor((s.coverage[t] * (1 - o.shrinkage / 100)) + 1e-9);
      const sl2 = sl.contacts > 0 ? serviceLevel(Math.max(onQ, 0), sl.erlangs, sl.aht, o.answerSeconds) : 1;
      return {
        time: clock(sl.minute), contacts: sl.contacts, aht: sl.aht, erlangs: sl.erlangs, onQueue: sl.onQueue, required: sl.required,
        scheduled: s.coverage[t], surplus: s.coverage[t] - sl.required,
        occupancy: sl.onQueue ? sl.erlangs / sl.onQueue : 0, serviceLevel: sl.onQueue ? serviceLevel(sl.onQueue, sl.erlangs, sl.aht, o.answerSeconds) * 100 : 100,
        serviceLevelWithScheduled: sl2 * 100, asa: sl.onQueue ? averageSpeedOfAnswer(sl.onQueue, sl.erlangs, sl.aht) : 0,
        occupancyBound: sl.occupancyBound,
      };
    });
    return {
      day: s.day.name, contacts: slots.reduce((a, x) => a + x.contacts, 0), peakRequired: Math.max(...slots.map((x) => x.required)),
      cost: s.cost, shifts: s.shifts.map((x) => ({ start: clock(s.day.slots[0].minute + x.start * im), end: clock(s.day.slots[0].minute + x.end * im), hours: x.hours, count: x.count })),
      slots,
    };
  });

  const contacts = dayOut.reduce((a, d) => a + d.contacts, 0);
  const requiredHours = days.reduce((a, d) => a + d.slots.reduce((b, s) => b + s.required, 0), 0) * (im / 60);
  const onQueueHours = days.reduce((a, d) => a + d.slots.reduce((b, s) => b + s.onQueue, 0), 0) * (im / 60);

  // Comparisons: the shortcuts people use instead.
  const longest = Math.max(...o.shifts);
  const fullOnly = (() => { try { return solveDays(days, o, [longest]).cost; } catch { return null; } })();
  const flatPeak = days.reduce((a, d) => a + Math.max(...d.slots.map((s) => s.required)) * d.slots.length * (im / 60) * o.wage, 0);
  // Occupancy-only rule: workload / occupancy target, no queueing maths.
  const occTarget = o.maxOccupancy > 0 ? o.maxOccupancy / 100 : 0.85;
  const naiveReq = (s) => (s.erlangs <= 0 ? 0 : Math.ceil(Math.ceil(s.erlangs / occTarget - 1e-9) / (1 - o.shrinkage / 100) - 1e-9));
  const naive = solveDays(days, o, o.shifts, naiveReq);
  let naiveWorst = 100; let naiveMissed = 0;
  for (const d of days) for (const s of d.slots) {
    if (s.erlangs <= 0) continue;
    const n = Math.ceil(s.erlangs / occTarget - 1e-9);
    const lvl = serviceLevel(Math.max(n, 1), s.erlangs, s.aht, o.answerSeconds) * 100;
    naiveWorst = Math.min(naiveWorst, lvl);
    if (lvl < o.serviceLevel - 1e-9) naiveMissed += 1;
  }

  // Cost of each service target, and what-ifs.
  const levels = [...new Set([60, 70, 80, 90, 95, o.serviceLevel])].sort((a, b) => a - b);
  const curve = levels.map((lv) => ({ serviceLevel: lv, cost: scenario(parsed, o, { opts: { serviceLevel: lv } }).res.cost, current: lv === o.serviceLevel }));
  const what = [
    { label: "Handle time 10% shorter", t: { rows: (r) => ({ ...r, aht: (r.aht ?? o.aht) * 0.9 }) } },
    { label: "Contacts 10% higher", t: { rows: (r) => ({ ...r, contacts: r.contacts * 1.1 }) } },
    { label: "Contacts 10% lower (deflected to self-service)", t: { rows: (r) => ({ ...r, contacts: r.contacts * 0.9 }) } },
    { label: "Shrinkage 5 points lower", t: { opts: { shrinkage: Math.max(0, o.shrinkage - 5) } } },
    { label: "Shrinkage 5 points higher", t: { opts: { shrinkage: Math.min(90, o.shrinkage + 5) } } },
  ].map((w) => { const c = scenario(parsed, o, w.t).res.cost; return { label: w.label, cost: c, delta: c - base.cost }; });

  const findings = [];
  const allSlots = dayOut.flatMap((d) => d.slots.map((s) => ({ ...s, day: d.day })));
  const peak = allSlots.reduce((m, s) => (s.required > m.required ? s : m), allSlots[0]);
  if (peak.required > 0) findings.push({ severity: "info", rule: "peak", message: `Busiest interval: ${peak.day} ${peak.time} needs ${peak.required} scheduled agents (${peak.onQueue} on the queue) for ${peak.contacts} contacts.` });
  const idle = allSlots.filter((s) => s.contacts === 0 && s.scheduled > 0).length;
  if (idle) findings.push({ severity: "info", rule: "idle-cover", message: `${idle} interval${idle === 1 ? "" : "s"} with no contacts still carry paid cover, because shifts cannot be cut shorter than the lengths you allowed.` });
  const surplusHours = allSlots.reduce((a, s) => a + s.surplus, 0) * (im / 60);
  if (surplusHours > 0) findings.push({ severity: "info", rule: "surplus", message: `${surplusHours.toFixed(1)} paid agent-hours (${pct((surplusHours / base.hours) * 100)} of the total) sit above the requirement because whole shifts cannot follow the curve exactly. Shorter shifts or a finer start step reduce this.` });
  const capped = allSlots.filter((s) => s.occupancyBound).length;
  if (capped) findings.push({ severity: "info", rule: "occupancy", message: `In ${capped} interval${capped === 1 ? "" : "s"} the occupancy cap, not the service target, sets the headcount.` });
  const single = allSlots.filter((s) => s.contacts > 0 && s.onQueue === 1).length;
  if (single) findings.push({ severity: "warn", rule: "single-cover", message: `${single} interval${single === 1 ? "" : "s"} rely on one person on the queue. Any absence leaves the queue unstaffed; consider a second cover at those times.` });
  if (naiveMissed) findings.push({ severity: "warn", rule: "occupancy-rule", message: `Staffing by an occupancy rule alone would cost ${money(naive.cost)} but miss the service target in ${naiveMissed} interval${naiveMissed === 1 ? "" : "s"} (worst ${pct(naiveWorst)}).` });

  return {
    options: o, days: dayOut, contacts,
    totals: {
      cost: base.cost, paidHours: base.hours, shifts: base.shifts, requiredHours, onQueueHours,
      costPerContact: contacts ? base.cost / contacts : 0, contactsPerPaidHour: base.hours ? contacts / base.hours : 0,
      fullShiftOnly: fullOnly, flatPeak, occupancyRule: naive.cost, occupancyRuleWorstServiceLevel: naiveWorst, occupancyRuleMissedIntervals: naiveMissed,
    },
    curve, whatIf: what, findings,
  };
}

export function summarize(p) {
  const t = p.totals;
  const o = p.options;
  const text = `Staff ${t.shifts} shift${t.shifts === 1 ? "" : "s"} (${t.paidHours.toFixed(1)} paid hours) for ${money(t.cost)}: ${money(t.costPerContact)} per contact across ${p.contacts.toLocaleString("en-US")} contacts, meeting ${pct(o.serviceLevel)} answered within ${o.answerSeconds}s in every interval at ${pct(o.shrinkage)} shrinkage. Flat peak staffing would cost ${money(t.flatPeak)}${t.fullShiftOnly != null && t.fullShiftOnly > t.cost ? `; ${Math.max(...o.shifts)}-hour shifts only would cost ${money(t.fullShiftOnly)}` : ""}.`;
  return { status: t.shifts ? "plan" : "none", text };
}
