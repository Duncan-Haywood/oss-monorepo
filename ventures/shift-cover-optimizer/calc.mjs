// Shift-cover optimizer: the cheapest set of shifts that keeps every open hour
// at or above the staffing it needs.
//
// Each open stretch of a day is a covering problem: choose shifts (contiguous
// intervals of length between the minimum and maximum shift) so that at every
// slot the number of people on shift is at least the requirement, at least
// cost. Interval matrices have the consecutive-ones property, so the linear
// programme has an integer optimum and is a minimum-cost flow on a line graph:
// node t has supply r[t] - r[t-1]; a shift from a to b is an arc a -> b whose
// cost is its pay; a free arc t+1 -> t absorbs over-coverage. Successive
// shortest paths (Bellman-Ford) solves it exactly. No heuristics, no network.

const INF = 1e9;
const EPS = 1e-9;

export const money = (n) =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
export const money2 = (n) =>
  (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (x, d = 0) => (x * 100).toFixed(d) + "%";
export const num = (x, d = 1) => Number(x).toFixed(d);

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_ALIASES = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, weds: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6,
};

export function parseTime(s) {
  const m = String(s).trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3][0] === "p" ? 12 : 0);
  }
  if (h > 23) return null;
  return h * 60 + min;
}

export function fmtTime(minutes) {
  const total = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60), m = total % 60;
  const ap = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? ":" + String(m).padStart(2, "0") : ""}${ap}`;
}

function dayKey(raw) {
  const t = raw.trim();
  const lower = t.toLowerCase();
  if (lower in DAY_ALIASES) return { key: DAY_NAMES[DAY_ALIASES[lower]], order: DAY_ALIASES[lower] };
  if (/^[1-7]$/.test(t)) return { key: DAY_NAMES[Number(t) - 1], order: Number(t) - 1 };
  return { key: t, order: null };
}

// Rows: day, time, value. A header line is optional; if its third cell says
// "staff"/"required"/"people" the value is headcount, otherwise demand.
export function parseDemand(text) {
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload rows of day, hour, and how many staff (or how much demand) you need." };
  let unit = "staff";
  let start = 0;
  const split = (l) => l.split(/[\t,;]/).map((c) => c.trim());
  const first = split(lines[0]);
  if (first.length >= 3 && parseTime(first[1]) === null) {
    start = 1;
    const h = first[2].toLowerCase();
    unit = /staff|required|people|heads|headcount|needed|crew|employees/.test(h) ? "staff" : "demand";
  } else {
    unit = "staff";
  }
  const seen = new Map();
  const dayOrder = [];
  let skipped = 0;
  for (let i = start; i < lines.length; i++) {
    const c = split(lines[i]);
    const t = c.length >= 3 ? parseTime(c[1]) : null;
    const v = c.length >= 3 ? Number(String(c[2]).replace(/[$,%]/g, "")) : NaN;
    if (c[0] === "" || t === null || !Number.isFinite(v) || v < 0) { skipped++; continue; }
    const d = dayKey(c[0]);
    if (!dayOrder.some((x) => x.key === d.key)) dayOrder.push(d);
    const k = d.key + "|" + t;
    if (seen.has(k)) warnings.push(`${d.key} ${fmtTime(t)} appears more than once; the last value is used.`);
    seen.set(k, { day: d.key, minute: t, value: v });
  }
  if (skipped) warnings.push(`${skipped} row${skipped === 1 ? "" : "s"} skipped: each needs a day, a time such as 9, 9:30 or 9am, and a number of zero or more.`);
  if (!seen.size) return { error: "No readable rows. Use day, hour, value, for example: Mon,9,3" };
  if (dayOrder.length > 14) return { error: "More than 14 different days. Paste one week (or two) of rows." };
  const allNamed = dayOrder.every((d) => d.order !== null);
  if (allNamed) dayOrder.sort((a, b) => a.order - b.order);
  const rows = [...seen.values()];
  if (rows.some((r) => r.value > 100000)) return { error: "A value is larger than 100,000; check the units." };
  let step = 60;
  for (const cand of [60, 30, 20, 15, 10, 5]) {
    step = cand;
    if (rows.every((r) => r.minute % cand === 0)) break;
  }
  if (rows.some((r) => r.minute % step !== 0)) return { error: "Times must fall on whole 5-minute marks." };
  if (step < 15) warnings.push(`Times go down to ${step} minutes; results are exact but the schedule will be fragmented.`);
  return { rows, unit, step, dayOrder: dayOrder.map((d) => d.key), warnings };
}

function validateOptions(o) {
  const e = [];
  if (!(o.wage > 0)) e.push("Enter an hourly wage above zero.");
  if (!(o.minShiftHours > 0)) e.push("Minimum shift length must be above zero.");
  if (!(o.maxShiftHours >= o.minShiftHours)) e.push("Maximum shift length cannot be shorter than the minimum.");
  if (o.maxShiftHours > 24) e.push("Maximum shift length cannot exceed 24 hours.");
  if (o.unit === "demand" && !(o.perStaff > 0)) e.push("Enter how much demand one person can handle per hour.");
  for (const [k, name] of [["burdenPct", "payroll burden"], ["overheadHours", "paid setup time"], ["minPaidHours", "minimum paid hours"], ["minStaff", "minimum staff"]]) {
    if (o[k] < 0 || !Number.isFinite(o[k])) e.push(`${name} cannot be negative.`);
  }
  if (!(o.buffer > -0.9)) e.push("Demand buffer must be above -90%.");
  return e;
}

const DEFAULTS = {
  wage: 16, burdenPct: 0, minShiftHours: 4, maxShiftHours: 8, overheadHours: 0, minPaidHours: 0,
  templateHours: 8, unit: "staff", perStaff: 10, minStaff: 1, buffer: 0,
};

// Consecutive open slots of one day form a segment; a shift never spans a closed gap.
export function buildDays(rows, step, dayOrder, o) {
  const days = [];
  for (const label of dayOrder) {
    const slots = rows.filter((r) => r.day === label).sort((a, b) => a.minute - b.minute);
    const segs = [];
    let cur = null;
    for (const s of slots) {
      let req = o.unit === "demand" ? (s.value * (1 + o.buffer)) / o.perStaff : s.value * (1 + o.buffer);
      req = Math.ceil(req - 1e-9);
      req = Math.max(req, o.minStaff, 0);
      if (cur && s.minute === cur.startMinute + cur.req.length * step) cur.req.push(req);
      else { cur = { startMinute: s.minute, req: [req] }; segs.push(cur); }
    }
    days.push({ label, segments: segs });
  }
  return days;
}

// Min-cost flow on the line graph; returns shifts as [startSlot, endSlot) pairs.
export function solveSegment(req, lMin, lMax, costOfLen) {
  const T = req.length;
  lMin = Math.max(1, Math.min(lMin, T));
  lMax = Math.max(lMin, Math.min(lMax, T));
  const b = new Array(T + 1).fill(0);
  for (let t = 0; t <= T; t++) b[t] = (t < T ? req[t] : 0) - (t > 0 ? req[t - 1] : 0);
  const S = T + 1, K = T + 2;
  const edges = [];
  const adj = Array.from({ length: T + 3 }, () => []);
  const add = (u, v, cap, cost, tag) => {
    adj[u].push(edges.length); edges.push({ u, v, cap, cost, flow: 0, tag });
    adj[v].push(edges.length); edges.push({ u: v, v: u, cap: 0, cost: -cost, flow: 0, tag: null });
  };
  for (let a = 0; a < T; a++) {
    for (let L = lMin; L <= lMax && a + L <= T; L++) add(a, a + L, INF, costOfLen(L) + 1e-7, [a, a + L]);
  }
  for (let t = 0; t < T; t++) add(t + 1, t, INF, 0, null);
  let need = 0;
  for (let t = 0; t <= T; t++) {
    if (b[t] > 0) { add(S, t, b[t], 0, null); need += b[t]; }
    else if (b[t] < 0) add(t, K, -b[t], 0, null);
  }
  let sent = 0;
  const N = T + 3;
  while (sent < need) {
    const dist = new Array(N).fill(Infinity), prev = new Array(N).fill(-1);
    dist[S] = 0;
    for (let it = 0; it < N; it++) {
      let changed = false;
      for (let id = 0; id < edges.length; id++) {
        const e = edges[id];
        if (e.cap - e.flow > EPS && dist[e.u] + e.cost < dist[e.v] - EPS) { dist[e.v] = dist[e.u] + e.cost; prev[e.v] = id; changed = true; }
      }
      if (!changed) break;
    }
    if (!Number.isFinite(dist[K])) break;
    let push = need - sent, v = K;
    while (v !== S) { const e = edges[prev[v]]; push = Math.min(push, e.cap - e.flow); v = e.u; }
    v = K;
    while (v !== S) { const id = prev[v]; edges[id].flow += push; edges[id ^ 1].flow -= push; v = edges[id].u; }
    sent += push;
  }
  const shifts = [];
  for (const e of edges) {
    if (e.tag && e.flow > 0.5) for (let i = 0; i < Math.round(e.flow); i++) shifts.push(e.tag);
  }
  shifts.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return shifts;
}

function scheduleAll(days, step, o, lMin, lMax) {
  const sh = step / 60;
  const rate = o.wage * (1 + o.burdenPct / 100);
  const paidHours = (slots) => Math.max(slots * sh, o.minPaidHours) + o.overheadHours;
  const costOfLen = (L) => rate * paidHours(L);
  const out = [];
  for (const day of days) {
    const shifts = [];
    const coverage = [];
    for (const seg of day.segments) {
      const sol = solveSegment(seg.req, lMin, lMax, costOfLen);
      const cov = new Array(seg.req.length).fill(0);
      for (const [a, z] of sol) {
        for (let t = a; t < z; t++) cov[t]++;
        shifts.push({
          startMinute: seg.startMinute + a * step,
          endMinute: seg.startMinute + z * step,
          hours: (z - a) * sh,
          paidHours: paidHours(z - a),
          cost: costOfLen(z - a),
        });
      }
      seg.req.forEach((r, t) => coverage.push({ minute: seg.startMinute + t * step, required: r, scheduled: cov[t] }));
    }
    shifts.sort((x, y) => x.startMinute - y.startMinute || x.endMinute - y.endMinute);
    out.push({ label: day.label, shifts, coverage });
  }
  return out;
}

function totals(sched, step) {
  const sh = step / 60;
  let cost = 0, paid = 0, worked = 0, required = 0, shifts = 0, short = 0;
  for (const d of sched) {
    for (const s of d.shifts) { cost += s.cost; paid += s.paidHours; worked += s.hours; shifts++; }
    for (const c of d.coverage) { required += c.required * sh; if (c.scheduled < c.required) short += c.required - c.scheduled; }
  }
  return { cost, paidHours: paid, workedHours: worked, requiredHours: required, shifts, shortSlots: short };
}

function solveWith(rows, step, dayOrder, o, overrides = {}) {
  const oo = { ...o, ...overrides };
  const days = buildDays(rows, step, dayOrder, oo);
  const sh = step / 60;
  const lMin = Math.ceil(oo.minShiftHours / sh - 1e-9);
  const lMax = Math.floor(oo.maxShiftHours / sh + 1e-9);
  const sched = scheduleAll(days, step, oo, lMin, lMax);
  return { days, sched, ...totals(sched, step) };
}

export function optimize(parsed, opts = {}) {
  if (parsed.error) return { error: parsed.error };
  const o = { ...DEFAULTS, unit: parsed.unit, ...opts };
  const errs = validateOptions(o);
  if (errs.length) return { error: errs[0] };
  const { rows, step, dayOrder } = parsed;
  const sh = step / 60;
  const lMin = Math.ceil(o.minShiftHours / sh - 1e-9);
  const lMax = Math.floor(o.maxShiftHours / sh + 1e-9);
  if (lMin > lMax) return { error: `No shift length fits between ${o.minShiftHours} and ${o.maxShiftHours} hours on ${step}-minute slots.` };
  const warnings = [...(parsed.warnings || [])];

  const base = solveWith(rows, step, dayOrder, o);
  if (base.requiredHours <= 0) return { error: "Nobody is needed in any hour. Raise the minimum staff or check the values." };
  const openSlots = rows.length;
  if (openSlots < 4) return { error: "Give at least four open hours." };

  const shortSegments = base.days.flatMap((d) => d.segments).filter((s) => s.req.length < lMin).length;
  if (shortSegments) warnings.push(`${shortSegments} open period${shortSegments === 1 ? " is" : "s are"} shorter than the minimum shift; those shifts are shortened to fit the period.`);
  if (o.unit === "demand" && o.minStaff > 0) warnings.push(`Every open hour keeps at least ${o.minStaff} on shift even when demand is lower.`);

  // The template: one fixed shift length everywhere, optimally placed.
  const tSlots = Math.max(1, Math.round(o.templateHours / sh));
  const tmpl = scheduleAll(base.days, step, o, tSlots, tSlots);
  const tmplTotals = totals(tmpl, step);

  // Everyone at the peak for the whole open period.
  const rate = o.wage * (1 + o.burdenPct / 100);
  let flatCost = 0, flatHours = 0;
  for (const d of base.days) for (const seg of d.segments) {
    const peak = Math.max(...seg.req);
    const hrs = Math.max(seg.req.length * sh, o.minPaidHours) + o.overheadHours;
    flatCost += peak * rate * hrs;
    flatHours += peak * hrs;
  }

  // Cost of the scheduling rules themselves.
  const minRows = [];
  for (const m of [1, 2, 3, 4, 5, 6, 8]) {
    if (m > o.maxShiftHours) continue;
    const r = solveWith(rows, step, dayOrder, o, { minShiftHours: m });
    minRows.push({ minShiftHours: m, cost: r.cost, shifts: r.shifts, current: Math.abs(m - o.minShiftHours) < 1e-9 });
  }
  if (!minRows.some((r) => r.current)) minRows.push({ minShiftHours: o.minShiftHours, cost: base.cost, shifts: base.shifts, current: true });
  minRows.sort((a, b) => a.minShiftHours - b.minShiftHours);

  // If demand is off.
  const demandRows = [];
  for (const d of [-0.1, 0, 0.1, 0.2, 0.3]) {
    const r = d === 0 ? base : solveWith(rows, step, dayOrder, o, { buffer: (1 + o.buffer) * (1 + d) - 1 });
    demandRows.push({ change: d, cost: r.cost, paidHours: r.paidHours, shifts: r.shifts });
  }

  const dayCount = dayOrder.length;
  const weekly = dayCount === 7;
  const saveTemplate = tmplTotals.cost - base.cost;
  const verdict = tmplTotals.cost - base.cost < 0.005 ? "same" : "saves";
  if (tmplTotals.cost + 1e-6 < base.cost) warnings.push("The fixed template came out cheaper than the flexible plan, which should not happen; please report this input.");

  return {
    step, unit: o.unit, options: o, dayCount, weekly,
    days: base.sched,
    cost: base.cost, paidHours: base.paidHours, workedHours: base.workedHours, requiredHours: base.requiredHours,
    shifts: base.shifts, shortSlots: base.shortSlots,
    overstaffHours: base.workedHours - base.requiredHours,
    efficiency: base.requiredHours / base.workedHours,
    fte: base.paidHours / 40 / (weekly ? 1 : dayCount / 7),
    template: { hours: tSlots * sh, cost: tmplTotals.cost, paidHours: tmplTotals.paidHours, shifts: tmplTotals.shifts, overstaffHours: tmplTotals.workedHours - tmplTotals.requiredHours },
    flat: { cost: flatCost, paidHours: flatHours },
    saveTemplate, saveFlat: flatCost - base.cost,
    saveTemplateAnnual: weekly ? saveTemplate * 52 : null,
    verdict,
    minShiftRows: minRows,
    demandRows,
    warnings,
  };
}

export function scheduleCsv(r) {
  const lines = ["day,start,end,hours,paid_hours,cost"];
  for (const d of r.days) for (const s of d.shifts) {
    lines.push([d.label, fmtTime(s.startMinute), fmtTime(s.endMinute), s.hours.toFixed(2), s.paidHours.toFixed(2), s.cost.toFixed(2)].join(","));
  }
  return lines.join("\n") + "\n";
}

// An invented cafe: demand is customers per hour, one person handles 12.
export function sampleText() {
  const weekday = [[7, 14], [8, 38], [9, 30], [10, 18], [11, 26], [12, 52], [13, 44], [14, 22], [15, 16], [16, 12], [17, 10], [18, 8]];
  const weekend = [[8, 20], [9, 34], [10, 48], [11, 56], [12, 50], [13, 40], [14, 28], [15, 16]];
  const lines = ["day,hour,customers"];
  ["Mon", "Tue", "Wed", "Thu", "Fri"].forEach((d, i) => weekday.forEach(([h, v]) => lines.push(`${d},${h},${Math.round(v * (i === 4 ? 1.15 : 1))}`)));
  ["Sat", "Sun"].forEach((d, i) => weekend.forEach(([h, v]) => lines.push(`${d},${h},${Math.round(v * (i === 1 ? 0.85 : 1))}`)));
  return lines.join("\n");
}

// ---- From a timestamped history (a POS or booking export) to day, hour, demand rows ----------------------------------
// Square, Toast, Shopify POS, Clover and booking tools all export one row per order with a date and time. This turns
// that into the average (or busy-day) demand for each weekday and hour, in the text `parseDemand` reads. Wall-clock time
// as written is used; a trailing Z or offset is dropped, so export in the shop's own time zone.

function parseStamp(raw) {
  const s = String(raw).trim().replace(/\s*(?:Z|[+-]\d{2}:?\d{2}|UTC|[A-Z]{3,4})$/, "");
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(am|pm)?)?$/i);
  let y, mo, d, h = 0, ap;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; h = m[4] === undefined ? null : +m[4]; ap = m[6]; }
  else {
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[T\s]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?)?$/i);
    if (!m) return null;
    let a = +m[1], b = +m[2];
    if (a > 12) [a, b] = [b, a]; // 25/10/2026 can only be day first; otherwise month first
    mo = a; d = b; y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    h = m[4] === undefined ? null : +m[4]; ap = m[6];
  }
  if (h === null) return null; // a date with no time of day cannot say which hour
  if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap.toLowerCase() === "pm" ? 12 : 0); }
  if (h > 23 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { date: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, dow: (dt.getUTCDay() + 6) % 7, hour: h };
}

function splitCsvLine(l) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === "," || c === "\t" || c === ";") { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

// opts: { stat: "mean" | "p80" (busy-day level), valueColumn: header name or null, minShare: 0.25 }
// Rows count as one order each unless a sales/total/amount column is found (or named), then that column is summed.
export function demandFromHistory(text, opts = {}) {
  const { stat = "mean", minShare = 0.25 } = opts;
  const warnings = [];
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { error: "Paste or upload an export with a header line and one row per order, with the date and time of each." };
  const head = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map(splitCsvLine);
  const hasTime = (j) => rows.slice(0, 50).filter((r) => r[j] !== undefined && parseStamp(r[j])).length;
  let tcol = head.findIndex((h, j) => /date|time|created|opened|paid|ordered|start/i.test(h) && hasTime(j) > 0);
  if (tcol < 0) tcol = head.findIndex((_, j) => hasTime(j) > 0);
  if (tcol < 0) return { error: "No column looks like a date and time. Each row needs both, for example 2026-10-05 12:34 or 10/5/2026 12:34 PM." };
  let vcol = -1;
  if (opts.valueColumn) vcol = head.findIndex((h) => h.toLowerCase() === String(opts.valueColumn).toLowerCase());
  else vcol = head.findIndex((h, j) => j !== tcol && /^(net |gross )?(sales|total|amount|revenue|subtotal)\b|net sales|gross sales|grand total/i.test(h));
  const unit = vcol >= 0 ? "sales" : "orders";
  const perHour = new Map(); // date -> hour -> value
  const dates = new Map(); // date -> weekday
  let bad = 0, used = 0;
  for (const r of rows) {
    const t = r[tcol] === undefined ? null : parseStamp(r[tcol]);
    let v = 1;
    if (vcol >= 0) { v = Number(String(r[vcol] ?? "").replace(/[$,£€\s]/g, "").replace(/^\((.*)\)$/, "-$1")); if (!Number.isFinite(v)) { bad++; continue; } if (v < 0) continue; }
    if (!t) { bad++; continue; }
    used++;
    dates.set(t.date, t.dow);
    if (!perHour.has(t.date)) perHour.set(t.date, new Map());
    const h = perHour.get(t.date);
    h.set(t.hour, (h.get(t.hour) || 0) + v);
  }
  if (bad) warnings.push(`${bad} row${bad === 1 ? "" : "s"} skipped: no readable date and time${vcol >= 0 ? " or amount" : ""}.`);
  if (!used) return { error: "No row had a readable date and time." };
  const byDow = DAY_NAMES.map(() => []);
  for (const [date, dow] of dates) byDow[dow].push(date);
  const out = ["day,hour," + unit];
  const days = [];
  for (let dow = 0; dow < 7; dow++) {
    const ds = byDow[dow];
    if (!ds.length) continue;
    const perH = new Map();
    for (let h = 0; h < 24; h++) {
      const vals = ds.map((d) => perHour.get(d).get(h) || 0);
      const seen = vals.filter((x) => x > 0).length;
      if (seen / ds.length < minShare || seen === 0) continue;
      let val;
      if (stat === "p80") { const sorted = vals.slice().sort((a, b) => a - b); val = sorted[Math.min(sorted.length - 1, Math.ceil(0.8 * sorted.length) - 1)]; }
      else val = vals.reduce((a, b) => a + b, 0) / vals.length;
      perH.set(h, val);
    }
    if (!perH.size) continue;
    const lo = Math.min(...perH.keys()), hi = Math.max(...perH.keys());
    for (let h = lo; h <= hi; h++) {
      // an hour inside the open span with no demand stays open at zero
      out.push(`${DAY_NAMES[dow]},${h},${Math.round((perH.get(h) ?? 0) * 10) / 10}`);
    }
    days.push({ day: DAY_NAMES[dow], dates: ds.length, firstHour: lo, lastHour: hi });
  }
  const allDates = [...dates.keys()].sort();
  const weeks = allDates.length / 7;
  if (days.some((d) => d.dates < 3)) warnings.push("Some weekdays rest on fewer than 3 dates, so their averages are rough; a month or more of history is steadier.");
  if (stat === "mean") warnings.push("The average hides busy days; switch to the busy-day level (80th percentile) to staff for a day busier than usual.");
  return { csv: out.join("\n"), unit, stat, orders: used, from: allDates[0], to: allDates[allDates.length - 1], dateCount: allDates.length, weeks, days, warnings };
}

export function sampleHistory() {
  // 4 invented weeks of a café: a morning rush, a lunch peak, a quiet afternoon; Saturday busier.
  const lines = ["Order time,Net Sales,Item count"];
  let s = 7;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const profile = [0, 0, 0, 0, 0, 0, 0, 14, 22, 12, 8, 14, 24, 14, 6, 5, 7, 9, 3];
  for (let d = 0; d < 28; d++) {
    const date = new Date(Date.UTC(2026, 8, 7 + d));
    const dow = (date.getUTCDay() + 6) % 7;
    const mult = dow === 5 ? 1.4 : dow === 6 ? 1.1 : 1;
    for (let h = 7; h <= 18; h++) {
      const n = Math.round(profile[h] * mult * (0.8 + 0.4 * rnd()));
      for (let k = 0; k < n; k++) lines.push(`${date.toISOString().slice(0, 10)} ${String(h).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")},${(6 + rnd() * 12).toFixed(2)},${1 + Math.floor(rnd() * 3)}`);
    }
  }
  return lines.join("\n");
}
