// Preventive-maintenance due dates: calendar, meter, or whichever comes first.
//
// Days are whole UTC day numbers (days since 1970-01-01) so that the
// arithmetic never meets a time zone or a daylight-saving hour.
//
// A plan:
//   { id, assetId, title, start: "YYYY-MM-DD",
//     every: { n: 3, unit: "month" } | null,           // calendar trigger
//     meter: { every: 250 } | null,                    // meter trigger, in the asset's meter unit
//     mode: "fixed" | "floating",                      // fixed keeps the cadence from `start`; floating counts from the last completion
//     leadDays: 7,                                     // "due soon" window (default: 10% of the interval, 1 to 14 days)
//     hours: 1.5, trade: "mechanical",                 // estimated labour, for the workload forecast
//     completions: [{ date: "YYYY-MM-DD", meter: 1234 }] }
//
// An asset's meter readings: [{ date: "YYYY-MM-DD", value: 1234 }].

export const UNITS = ["day", "week", "month", "year"];

export function parseDay(s) {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return Math.round(Date.UTC(y, mo - 1, d) / 86400000);
}

export function fmtDay(n) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

function daysInMonth(y, mo) {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

// Add n units to a day. Months and years clamp to the month's last day
// (31 Jan + 1 month = 28 or 29 Feb), the way a planner reads "monthly".
export function addInterval(day, n, unit) {
  if (unit === "day") return day + n;
  if (unit === "week") return day + 7 * n;
  const dt = new Date(day * 86400000);
  let y = dt.getUTCFullYear(), mo = dt.getUTCMonth(); // 0-based
  const d = dt.getUTCDate();
  const months = unit === "year" ? 12 * n : n;
  if (unit !== "month" && unit !== "year") throw new Error(`unknown unit: ${unit}`);
  const total = y * 12 + mo + months;
  y = Math.floor(total / 12);
  mo = total - y * 12;
  const dd = Math.min(d, daysInMonth(y, mo + 1));
  return Math.round(Date.UTC(y, mo, dd) / 86400000);
}

// Nominal interval length in days, for tolerance and lead windows.
export function intervalDays(every) {
  const per = { day: 1, week: 7, month: 30.4375, year: 365.25 }[every.unit];
  return every.n * per;
}

// The k-th occurrence of a fixed calendar schedule (k = 0 is `start`).
// Counting each occurrence from `start`, not from the one before, stops the
// month-end clamp from drifting (31 Jan, 28 Feb, 31 Mar, not 28 Mar).
function occurrence(start, every, k) {
  return addInterval(start, every.n * k, every.unit);
}

// The occurrence index nearest to a day (ties go to the earlier one).
function nearestOccurrence(start, every, day) {
  const approx = Math.round((day - start) / intervalDays(every));
  let best = Math.max(0, approx), bestGap = Infinity;
  for (let k = Math.max(0, approx - 2); k <= approx + 2; k++) {
    const gap = Math.abs(occurrence(start, every, k) - day);
    if (gap < bestGap) { best = k; bestGap = gap; }
  }
  return best;
}

// Usage rate per day from meter readings: least squares over the readings in
// the last `windowDays` before `asOf` (all readings when fewer than three fall
// inside). A meter that was replaced or rolled over (a reading lower than the
// one before) starts a new segment; only the latest segment is used.
export function meterRate(readings, asOf, windowDays = 120) {
  const pts = (readings || [])
    .map((r) => ({ day: parseDay(r.date), value: Number(r.value) }))
    .filter((p) => p.day !== null && Number.isFinite(p.value) && (asOf === undefined || p.day <= asOf))
    .sort((a, b) => a.day - b.day || a.value - b.value);
  if (!pts.length) return null;
  let segStart = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].value < pts[i - 1].value) segStart = i;
  const seg = pts.slice(segStart);
  const last = seg[seg.length - 1];
  let use = seg.filter((p) => asOf === undefined || p.day >= asOf - windowDays);
  if (use.length < 3) use = seg;
  if (use.length < 2 || use[use.length - 1].day === use[0].day) return { rate: null, last, points: use.length };
  const n = use.length;
  const mx = use.reduce((s, p) => s + p.day, 0) / n;
  const my = use.reduce((s, p) => s + p.value, 0) / n;
  let sxy = 0, sxx = 0;
  for (const p of use) { sxy += (p.day - mx) * (p.value - my); sxx += (p.day - mx) ** 2; }
  const rate = Math.max(0, sxy / sxx);
  return { rate, last, points: n };
}

// The meter value estimated for a day, from the last reading and the rate.
export function meterAt(readings, day) {
  const r = meterRate(readings, day);
  if (!r) {
    // nothing read yet on that day: the earliest reading is the best floor
    const first = meterRate(readings);
    return first ? Math.min(...(readings || []).map((x) => Number(x.value)).filter(Number.isFinite)) : null;
  }
  if (r.rate === null) return r.last.value;
  return r.last.value + r.rate * Math.max(0, day - r.last.day);
}

function sortedCompletions(plan) {
  return (plan.completions || [])
    .map((c) => ({ day: parseDay(c.date), meter: c.meter === undefined || c.meter === null || c.meter === "" ? null : Number(c.meter) }))
    .filter((c) => c.day !== null)
    .sort((a, b) => a.day - b.day);
}

// Calendar due day after the completions so far (`done` sorted, may be empty).
function calendarDue(plan, done) {
  const start = parseDay(plan.start);
  if (!plan.every || start === null) return null;
  if (!done.length) return start;
  const last = done[done.length - 1].day;
  if (plan.mode === "floating") return addInterval(last, plan.every.n, plan.every.unit);
  // fixed: the completion satisfied its nearest occurrence; the next one is due
  return occurrence(start, plan.every, nearestOccurrence(start, plan.every, last) + 1);
}

// Meter value at which the next service is due.
function meterDue(plan, done, readings) {
  if (!plan.meter || !(plan.meter.every > 0)) return null;
  const every = Number(plan.meter.every);
  const withMeter = done.filter((c) => c.meter !== null);
  const start = parseDay(plan.start);
  // `startAt` is the reading at the last service before the plan began (or
  // when it began); without it, the reading estimated on the start day.
  let base;
  if (plan.meter.startAt !== undefined && plan.meter.startAt !== null && plan.meter.startAt !== "") base = Number(plan.meter.startAt);
  else base = start !== null ? meterAt(readings, start) : null;
  if (!withMeter.length) return base === null ? null : base + every;
  const lastM = withMeter[withMeter.length - 1].meter;
  if (plan.mode === "fixed" && base !== null) {
    const k = Math.round((lastM - base) / every);
    return base + (Math.max(0, k) + 1) * every;
  }
  return lastM + every;
}

// Where a plan stands on `today` (a day number).
// Returns { dueDay, dueBy: "calendar"|"meter"|null, calendarDue, meterDue,
//   meterNow, meterRate, status: "overdue"|"due"|"ok"|"unscheduled", daysLeft, meterLeft, lastDone }
export function planStatus(plan, readings, today) {
  const done = sortedCompletions(plan).filter((c) => c.day <= today);
  const cal = calendarDue(plan, done);
  const mDue = meterDue(plan, done, readings);
  const rate = meterRate(readings, today);
  const meterNow = rate ? (rate.rate === null ? rate.last.value : rate.last.value + rate.rate * Math.max(0, today - rate.last.day)) : null;
  let meterDay = null;
  if (mDue !== null && rate) {
    if (meterNow >= mDue) meterDay = Math.min(today, rate.rate ? Math.floor(rate.last.day + (mDue - rate.last.value) / rate.rate) : today);
    else if (rate.rate > 0) meterDay = Math.ceil(rate.last.day + (mDue - rate.last.value) / rate.rate);
  }
  let dueDay = null, dueBy = null;
  if (cal !== null) { dueDay = cal; dueBy = "calendar"; }
  if (meterDay !== null && (dueDay === null || meterDay < dueDay)) { dueDay = meterDay; dueBy = "meter"; }
  const lead = leadDays(plan);
  let status = "unscheduled";
  const meterOver = mDue !== null && meterNow !== null && meterNow >= mDue;
  if (dueDay !== null || meterOver) {
    if (meterOver || dueDay < today) status = "overdue";
    else if (dueDay - today <= lead) status = "due";
    else status = "ok";
  }
  const last = done[done.length - 1] || null;
  return {
    dueDay,
    due: dueDay === null ? null : fmtDay(dueDay),
    dueBy,
    calendarDue: cal === null ? null : fmtDay(cal),
    meterDue: mDue,
    meterNow: meterNow === null ? null : Math.round(meterNow * 10) / 10,
    meterRate: rate && rate.rate !== null ? Math.round(rate.rate * 100) / 100 : null,
    status,
    daysLeft: dueDay === null ? null : dueDay - today,
    meterLeft: mDue !== null && meterNow !== null ? Math.round((mDue - meterNow) * 10) / 10 : null,
    lastDone: last ? fmtDay(last.day) : null,
  };
}

export function leadDays(plan) {
  if (Number.isFinite(plan.leadDays) && plan.leadDays >= 0) return plan.leadDays;
  if (!plan.every) return 7;
  return Math.min(14, Math.max(1, Math.round(intervalDays(plan.every) * 0.1)));
}

// PM compliance: each completion is on time when it is no later than its due
// day plus 10% of the interval (the common "10% rule"), or, for a meter plan,
// no more than 10% of the meter interval past the due reading. Occurrences
// that came due and were never done before the next completion (or `today`)
// count as missed. Returns { onTime, late, missed, total, pct, rows }.
export function compliance(plan, readings, today, { tolerance = 0.1 } = {}) {
  const done = sortedCompletions(plan).filter((c) => c.day <= today);
  const rows = [];
  let onTime = 0, late = 0, missed = 0;
  const tolDays = plan.every ? Math.max(1, Math.round(intervalDays(plan.every) * tolerance)) : null;
  const tolMeter = plan.meter && plan.meter.every > 0 ? plan.meter.every * tolerance : null;
  for (let i = 0; i < done.length; i++) {
    const before = done.slice(0, i);
    const cal = calendarDue(plan, before);
    const mDue = meterDue(plan, before, readings);
    // fixed calendar plans: occurrences skipped between this completion's
    // due and the one it actually satisfied are missed
    if (plan.every && plan.mode !== "floating" && cal !== null) {
      const start = parseDay(plan.start);
      const kDue = nearestOccurrence(start, plan.every, cal);
      const kDone = nearestOccurrence(start, plan.every, done[i].day);
      if (kDone > kDue) {
        for (let k = kDue; k < kDone; k++) rows.push({ due: fmtDay(occurrence(start, plan.every, k)), done: null, result: "missed" });
        missed += kDone - kDue;
      }
    }
    let ok = true, dueText = null;
    const calRef = plan.every && plan.mode !== "floating" && cal !== null
      ? occurrence(parseDay(plan.start), plan.every, nearestOccurrence(parseDay(plan.start), plan.every, done[i].day))
      : cal;
    if (calRef !== null && tolDays !== null) { dueText = fmtDay(calRef); if (done[i].day > calRef + tolDays) ok = false; }
    if (mDue !== null && tolMeter !== null && done[i].meter !== null) {
      dueText = dueText ? `${dueText} / ${mDue}` : String(mDue);
      if (done[i].meter > mDue + tolMeter && (calRef === null || done[i].day > calRef - tolDays)) ok = false;
    }
    if (ok) onTime++; else late++;
    rows.push({ due: dueText, done: fmtDay(done[i].day), meter: done[i].meter, result: ok ? "on time" : "late" });
  }
  // the occurrence open now, if it is past its tolerance
  const st = planStatus(plan, readings, today);
  if (st.dueDay !== null && tolDays !== null && today > st.dueDay + tolDays) {
    missed++;
    rows.push({ due: st.due, done: null, result: "missed" });
  }
  const total = onTime + late + missed;
  return { onTime, late, missed, total, pct: total ? Math.round((1000 * onTime) / total) / 10 : null, rows };
}

// Upcoming occurrences of every plan in [from, from + horizonDays), with
// labour hours. Meter occurrences are projected from the usage rate, and the
// plan restarts from each projected occurrence as if it were done on time.
export function forecast(plans, readingsByAsset, from, horizonDays = 90) {
  const out = [];
  const end = from + horizonDays;
  for (const plan of plans) {
    if (plan.active === false) continue;
    const readings = readingsByAsset[plan.assetId] || [];
    const st = planStatus(plan, readings, from);
    if (st.dueDay === null) continue;
    let day = Math.max(st.dueDay, from);
    const rate = st.meterRate;
    let meterDue = st.meterDue;
    const start = parseDay(plan.start);
    let k = plan.every && plan.mode !== "floating" && st.calendarDue ? nearestOccurrence(start, plan.every, parseDay(st.calendarDue)) : null;
    let calDue = st.calendarDue ? parseDay(st.calendarDue) : null;
    let guard = 0;
    while (day < end && guard++ < 500) {
      out.push({ planId: plan.id, assetId: plan.assetId, title: plan.title, day: fmtDay(day), overdue: day === from && st.dueDay < from, hours: Number(plan.hours) || 0, trade: plan.trade || "general" });
      // next occurrence after one done on `day`
      let nextCal = null, nextMeter = null;
      if (plan.every) {
        if (plan.mode === "floating") nextCal = addInterval(day, plan.every.n, plan.every.unit);
        else { k = (calDue !== null && day >= calDue ? nearestOccurrence(start, plan.every, Math.max(day, calDue)) : k) + 1; nextCal = occurrence(start, plan.every, k); calDue = nextCal; }
      }
      if (plan.meter && plan.meter.every > 0 && rate > 0) {
        meterDue = (meterDue ?? 0) + Number(plan.meter.every);
        nextMeter = day + Math.max(1, Math.round(Number(plan.meter.every) / rate));
      }
      const next = [nextCal, nextMeter].filter((d) => d !== null);
      if (!next.length) break;
      day = Math.min(...next);
    }
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

// ISO week key (YYYY-Www) for a day number, for the weekly workload table.
export function isoWeek(day) {
  const d = new Date(day * 86400000);
  const dow = (d.getUTCDay() + 6) % 7; // Monday 0
  const thursday = day - dow + 3;
  const t = new Date(thursday * 86400000);
  const y = t.getUTCFullYear();
  const jan1 = Math.round(Date.UTC(y, 0, 1) / 86400000);
  const week = Math.floor((thursday - jan1) / 7) + 1;
  return `${y}-W${String(week).padStart(2, "0")}`;
}

// Hours per ISO week and trade from a forecast.
export function workload(occurrences) {
  const weeks = new Map();
  for (const o of occurrences) {
    const w = isoWeek(parseDay(o.day));
    if (!weeks.has(w)) weeks.set(w, { week: w, total: 0, jobs: 0, byTrade: {} });
    const row = weeks.get(w);
    row.total += o.hours;
    row.jobs++;
    row.byTrade[o.trade] = (row.byTrade[o.trade] || 0) + o.hours;
  }
  return [...weeks.values()].sort((a, b) => (a.week < b.week ? -1 : 1)).map((r) => ({ ...r, total: Math.round(r.total * 10) / 10 }));
}
