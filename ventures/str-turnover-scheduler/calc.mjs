// Short-term-rental turnover scheduler. Pure functions, no I/O, no network.
// Input: iCal feeds (Airbnb / VRBO / Booking.com export links, pasted as text) or a
// property,check-in,check-out CSV. Output: one cleaning job per checkout, assigned to
// cleaners day by day (earliest-deadline-first, earliest-finish cleaner), plus the
// smallest crew that clears every deadline, conflicts, and the margin on the cleaning fee.

export const DEFAULTS = { checkoutHour: 11, checkinHour: 16, cleanHours: 2.5, fee: 120, shiftStart: 9, shiftEnd: 17, travelMin: 20, hourlyRate: 25, payTravel: true, cleaners: 2, maxCrew: 8, horizonDays: 14 };

const DAY = 1440;
const BLOCKED = /not available|unavailable|blocked|closed|owner|hold/i;

export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const pad = (n) => String(n).padStart(2, "0");

export function dayIndex(s) {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(String(s).trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCMonth() !== +m[2] - 1) return null; // 2026-02-30 and friends
  return Math.round(t / 86400000);
}
export function dayLabel(i) {
  const d = new Date(i * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export const weekday = (i) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(i * 86400000).getUTCDay()];
export function clock(min) {
  const m = ((Math.round(min) % DAY) + DAY) % DAY;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
export function parseClock(s, fallback) {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i.exec(String(s ?? ""));
  if (!m) return fallback;
  let h = +m[1];
  const mi = m[2] ? +m[2] : 0;
  if (m[3]) { const pm = m[3].toLowerCase() === "pm"; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  if (h > 24 || mi > 59) return fallback;
  return h + mi / 60;
}

function splitCsv(line) {
  const out = []; let cur = "", q = false;
  for (const c of line) {
    if (c === '"') q = !q;
    else if (c === "," && !q) { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

// ---- bookings ----------------------------------------------------------------
export function parseBookings(text) {
  const errors = [];
  const raw = [];
  let skippedBlocks = 0;
  const src = String(text || "").replace(/\r\n?/g, "\n");
  if (/BEGIN:VEVENT/i.test(src)) {
    const unfolded = src.replace(/\n[ \t]/g, "");
    const parts = unfolded.split(/(?=BEGIN:VCALENDAR)/i);
    let n = 0;
    for (const part of parts) {
      if (!/BEGIN:VCALENDAR/i.test(part)) continue;
      n++;
      const before = unfolded.slice(0, unfolded.indexOf(part));
      const hint = (/(?:^|\n)\s*(?:#|PROPERTY:)\s*([^\n]+)\s*$/i.exec(before.trimEnd()) || [])[1];
      const nameLine = (/X-WR-CALNAME:([^\n]+)/i.exec(part) || [])[1];
      const prop = (hint || nameLine || `Property ${n}`).trim();
      for (const ev of part.split(/BEGIN:VEVENT/i).slice(1)) {
        const body = ev.split(/END:VEVENT/i)[0];
        const get = (k) => (new RegExp(`(?:^|\\n)${k}[^:\\n]*:([^\\n]*)`, "i").exec(body) || [])[1];
        const s = dayIndex(get("DTSTART") || ""), e = dayIndex(get("DTEND") || "");
        const summary = (get("SUMMARY") || "").trim();
        if (s === null || e === null) { errors.push(`${prop}: an event without a readable start and end was skipped.`); continue; }
        if (BLOCKED.test(summary)) { skippedBlocks++; continue; }
        if (e <= s) { errors.push(`${prop}: ${dayLabel(s)} ends on or before it starts; skipped.`); continue; }
        raw.push({ property: prop, start: s, end: e, source: summary || "Reserved" });
      }
    }
  } else {
    const lines = src.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    let cols = null;
    lines.forEach((line, i) => {
      const c = splitCsv(line);
      if (!cols) {
        const h = c.map((x) => x.toLowerCase());
        const find = (...ks) => h.findIndex((x) => ks.some((k) => x.includes(k)));
        const p = find("property", "listing", "unit", "name"), s = find("check-in", "checkin", "check in", "start", "arriv"), e = find("check-out", "checkout", "check out", "end", "depart");
        if (p >= 0 && s >= 0 && e >= 0) { cols = { p, s, e }; return; }
        cols = { p: 0, s: 1, e: 2 };
      }
      const s = dayIndex(c[cols.s] || ""), e = dayIndex(c[cols.e] || "");
      if (!c[cols.p] || s === null || e === null) { errors.push(`Line ${i + 1}: needs property, check-in date and check-out date (YYYY-MM-DD).`); return; }
      if (e <= s) { errors.push(`Line ${i + 1}: check-out is not after check-in.`); return; }
      raw.push({ property: c[cols.p], start: s, end: e, source: "Reserved" });
    });
  }
  // Merge duplicates (the same stay exported by two platforms) and flag true overlaps.
  const byProp = new Map();
  for (const b of raw) { if (!byProp.has(b.property)) byProp.set(b.property, []); byProp.get(b.property).push(b); }
  const bookings = [], conflicts = []; let duplicates = 0;
  for (const [property, list] of byProp) {
    list.sort((a, b) => a.start - b.start || a.end - b.end);
    const kept = [];
    for (const b of list) {
      const prev = kept[kept.length - 1];
      if (prev && prev.start === b.start && prev.end === b.end) { duplicates++; continue; }
      if (prev && b.start < prev.end) conflicts.push({ property, a: prev, b });
      kept.push({ ...b });
    }
    bookings.push(...kept);
  }
  return { bookings, errors, conflicts, duplicates, skippedBlocks };
}

// ---- properties --------------------------------------------------------------
// One per line: name, clean hours, cleaning fee charged, checkout time, check-in time
export function parseProperties(text, names = [], base = DEFAULTS) {
  const map = new Map();
  for (const line of String(text || "").split("\n")) {
    const l = line.trim(); if (!l || l.startsWith("#")) continue;
    const c = splitCsv(l);
    const num = (v, f) => { const x = parseFloat(String(v ?? "").replace(/[$,]/g, "")); return Number.isFinite(x) && x >= 0 ? x : f; };
    map.set(c[0], { name: c[0], cleanHours: num(c[1], base.cleanHours) || base.cleanHours, fee: num(c[2], base.fee), checkoutHour: parseClock(c[3], base.checkoutHour), checkinHour: parseClock(c[4], base.checkinHour) });
  }
  for (const n of names) if (!map.has(n)) map.set(n, { name: n, cleanHours: base.cleanHours, fee: base.fee, checkoutHour: base.checkoutHour, checkinHour: base.checkinHour });
  return map;
}

// ---- jobs --------------------------------------------------------------------
export function buildJobs(bookings, props) {
  const byProp = new Map();
  for (const b of bookings) { if (!byProp.has(b.property)) byProp.set(b.property, []); byProp.get(b.property).push(b); }
  const jobs = [];
  for (const [property, list] of byProp) {
    list.sort((a, b) => a.start - b.start || a.end - b.end);
    const p = props.get(property);
    list.forEach((b, i) => {
      const next = list.slice(i + 1).find((n) => n.start >= b.end);
      const earliest = b.end * DAY + Math.round(p.checkoutHour * 60);
      const deadline = next ? next.start * DAY + Math.round(p.checkinHour * 60) : null;
      const dur = Math.round(p.cleanHours * 60);
      jobs.push({ property, guestOut: b.end, earliest, deadline, dur, fee: p.fee, sameDay: !!next && next.start === b.end, windowMin: deadline === null ? null : deadline - earliest, nextIn: next ? next.start : null });
    });
  }
  jobs.sort((a, b) => a.earliest - b.earliest || a.property.localeCompare(b.property));
  jobs.forEach((j, i) => { j.id = i + 1; });
  return jobs;
}

// ---- scheduler ---------------------------------------------------------------
export function schedule(jobs, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const crew = Math.max(1, Math.floor(o.cleaners));
  const shiftStart = Math.round(o.shiftStart * 60), shiftEnd = Math.round(o.shiftEnd * 60);
  const pending = jobs.map((j) => ({ ...j, cleaner: null, start: null, end: null, late: false, overtime: false, lateBy: 0 }));
  if (!pending.length) return { jobs: pending, crew, late: 0, overtime: 0, workMin: 0, travelMin: 0, perCleaner: [] };
  const firstDay = Math.floor(Math.min(...pending.map((j) => j.earliest)) / DAY);
  const lastDay = Math.floor(Math.max(...pending.map((j) => j.earliest)) / DAY) + Math.max(1, Math.floor(o.horizonDays));
  const work = Array.from({ length: crew }, () => ({ jobs: 0, workMin: 0, travelMin: 0 }));
  let left = pending.length;
  for (let d = firstDay; d <= lastDay && left; d++) {
    const dayStart = d * DAY, dayEnd = dayStart + DAY;
    const pool = pending.filter((j) => j.cleaner === null && j.earliest < dayEnd)
      .sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity) || a.earliest - b.earliest || a.id - b.id);
    const state = Array.from({ length: crew }, () => ({ free: dayStart + shiftStart, at: null }));
    for (const j of pool) {
      // A job that cannot wait past today (its deadline falls before tomorrow's shift starts) must be placed now.
      const urgent = j.deadline !== null && j.deadline < dayEnd + shiftStart;
      let best = null;
      state.forEach((s, ci) => {
        const trav = s.at !== null && s.at !== j.property ? o.travelMin : 0;
        const start = Math.max(s.free + trav, j.earliest, dayStart + shiftStart);
        const end = start + j.dur;
        if (!best || end < best.end) best = { ci, start, end, trav };
      });
      const fits = best.end <= dayStart + shiftEnd;
      if (!fits && !urgent) continue; // slack to spare: leave it for tomorrow
      const s = state[best.ci];
      s.free = best.end; s.at = j.property;
      j.cleaner = best.ci + 1; j.start = best.start; j.end = best.end;
      j.overtime = !fits;
      if (j.deadline !== null && best.end > j.deadline) { j.late = true; j.lateBy = best.end - j.deadline; }
      work[best.ci].jobs++; work[best.ci].workMin += j.dur; work[best.ci].travelMin += best.trav;
      left--;
    }
  }
  const done = pending.filter((j) => j.cleaner !== null);
  return {
    jobs: pending, crew,
    unscheduled: pending.filter((j) => j.cleaner === null).length,
    late: done.filter((j) => j.late).length,
    overtime: done.filter((j) => j.overtime).length,
    workMin: work.reduce((a, w) => a + w.workMin, 0),
    travelMin: work.reduce((a, w) => a + w.travelMin, 0),
    perCleaner: work.map((w, i) => ({ cleaner: i + 1, ...w })),
  };
}

// Smallest crew (up to maxCrew) with no late jobs and no overtime.
export function crewSweep(jobs, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const rows = [];
  let minClean = null;
  for (let k = 1; k <= Math.max(1, Math.floor(o.maxCrew)); k++) {
    const r = schedule(jobs, { ...o, cleaners: k });
    const row = { crew: k, late: r.late, overtime: r.overtime, hours: (r.workMin + (o.payTravel ? r.travelMin : 0)) / 60 };
    rows.push(row);
    if (minClean === null && r.late === 0 && r.overtime === 0 && !r.unscheduled) minClean = k;
  }
  // Late jobs caused by an impossible window never clear however big the crew is.
  const impossible = jobs.filter((j) => j.windowMin !== null && j.windowMin < j.dur).length;
  return { rows, minCrew: minClean, impossible };
}

// ---- analysis ----------------------------------------------------------------
export function analyze(bookingText, propsText, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const parsed = parseBookings(bookingText);
  const errors = [...parsed.errors];
  if (!parsed.bookings.length) { errors.unshift("No bookings found. Paste iCal feed text (BEGIN:VCALENDAR ...) or lines of property,check-in,check-out."); return { errors, rows: [], jobs: [], summary: null, warnings: [], sweep: null, economics: [], conflicts: [], perCleaner: [] }; }
  const names = [...new Set(parsed.bookings.map((b) => b.property))];
  const props = parseProperties(propsText, names, o);
  const jobs = buildJobs(parsed.bookings, props);
  const sched = schedule(jobs, o);
  const sweep = crewSweep(jobs, o);
  const warnings = [];
  for (const c of parsed.conflicts) warnings.push({ level: "high", text: `Double booking at ${c.property}: ${dayLabel(c.a.start)}–${dayLabel(c.a.end)} overlaps ${dayLabel(c.b.start)}–${dayLabel(c.b.end)}. Two feeds disagree; one guest will be turned away unless this is fixed.` });
  for (const j of sched.jobs) {
    if (j.windowMin !== null && j.windowMin < j.dur) warnings.push({ level: "high", text: `${j.property}, ${dayLabel(j.guestOut)}: only ${(j.windowMin / 60).toFixed(1)} h between checkout and the next check-in, and a clean takes ${(j.dur / 60).toFixed(1)} h. No crew size fixes this; move the check-in time, block the night, or add a second cleaner on that job.` });
    else if (j.windowMin !== null && j.windowMin - j.dur < 30 && j.sameDay) warnings.push({ level: "medium", text: `${j.property}, ${dayLabel(j.guestOut)}: same-day turnover with under 30 minutes of slack.` });
    if (j.late && !(j.windowMin !== null && j.windowMin < j.dur)) warnings.push({ level: "high", text: `${j.property}, ${dayLabel(j.guestOut)}: finishes ${Math.round(j.lateBy)} min after the next check-in with ${sched.crew} cleaner${sched.crew === 1 ? "" : "s"}.` });
    if (j.overtime) warnings.push({ level: "medium", text: `${j.property}, ${dayLabel(j.guestOut)}: runs past the end of the shift (${clock(j.end % DAY)}).` });
  }
  if (sched.unscheduled) warnings.push({ level: "medium", text: `${sched.unscheduled} clean${sched.unscheduled === 1 ? "" : "s"} could not be placed inside the planning window.` });
  if (parsed.skippedBlocks) warnings.push({ level: "info", text: `${parsed.skippedBlocks} blocked or "not available" calendar entr${parsed.skippedBlocks === 1 ? "y was" : "ies were"} ignored; they are not guest stays.` });
  if (parsed.duplicates) warnings.push({ level: "info", text: `${parsed.duplicates} identical stay${parsed.duplicates === 1 ? "" : "s"} appeared in more than one feed and ${parsed.duplicates === 1 ? "was" : "were"} counted once.` });
  const payable = (sched.workMin + (o.payTravel ? sched.travelMin : 0)) / 60;
  const cost = payable * o.hourlyRate;
  const fees = sched.jobs.reduce((a, j) => a + j.fee, 0);
  const economics = names.map((n) => {
    const mine = sched.jobs.filter((j) => j.property === n);
    const p = props.get(n);
    const c = mine.length * p.cleanHours * o.hourlyRate;
    return { property: n, cleans: mine.length, fees: mine.length * p.fee, cost: c, margin: mine.length * p.fee - c, perClean: p.fee - p.cleanHours * o.hourlyRate };
  });
  return {
    errors, jobs: sched.jobs, conflicts: parsed.conflicts, warnings, sweep, economics, perCleaner: sched.perCleaner,
    summary: { properties: names.length, cleans: sched.jobs.length, sameDay: sched.jobs.filter((j) => j.sameDay).length, late: sched.late, overtime: sched.overtime, crew: sched.crew, minCrew: sweep.minCrew, hours: payable, travelHours: sched.travelMin / 60, cost, fees, margin: fees - cost, from: dayLabel(Math.floor(jobs[0].earliest / DAY)), to: dayLabel(Math.floor(jobs[jobs.length - 1].earliest / DAY)) },
    rows: sched.jobs.map((j) => ({ id: j.id, property: j.property, date: dayLabel(Math.floor(j.earliest / DAY)), cleaner: j.cleaner, start: j.start === null ? "" : `${dayLabel(Math.floor(j.start / DAY))} ${clock(j.start)}`, end: j.end === null ? "" : clock(j.end), window: j.deadline === null ? "no next guest booked" : `${clock(j.earliest)}–${clock(j.deadline)} ${j.sameDay ? "(same day)" : "(" + dayLabel(Math.floor(j.deadline / DAY)) + ")"}`, flag: j.late ? "LATE" : j.overtime ? "overtime" : j.sameDay ? "same-day" : "" })),
  };
}

// ---- exports -----------------------------------------------------------------
const q = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function scheduleCsv(r) {
  const head = ["job", "property", "checkout date", "cleaner", "cleaning starts", "ends", "window", "flag"];
  return [head, ...r.rows.map((x) => [x.id, x.property, x.date, x.cleaner ? `Cleaner ${x.cleaner}` : "unassigned", x.start, x.end, x.window, x.flag])].map((l) => l.map(q).join(",")).join("\n") + "\n";
}
export function cleanerText(r) {
  const out = [];
  const by = new Map();
  for (const j of r.jobs) if (j.cleaner) { if (!by.has(j.cleaner)) by.set(j.cleaner, []); by.get(j.cleaner).push(j); }
  for (const [c, list] of [...by].sort((a, b) => a[0] - b[0])) {
    out.push(`Cleaner ${c}`);
    list.sort((a, b) => a.start - b.start);
    for (const j of list) out.push(`  ${weekday(Math.floor(j.start / DAY))} ${dayLabel(Math.floor(j.start / DAY))}  ${clock(j.start)}–${clock(j.end)}  ${j.property}${j.deadline !== null ? `  (next guest in ${dayLabel(Math.floor(j.deadline / DAY))} ${clock(j.deadline)})` : ""}${j.late ? "  LATE" : ""}`);
    out.push("");
  }
  return out.join("\n");
}
export function icsExport(r) {
  const stamp = (m) => { const d = Math.floor(m / DAY); return dayLabel(d).replace(/-/g, "") + "T" + clock(m).replace(":", "") + "00"; };
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//str-turnover-scheduler//EN"];
  for (const j of r.jobs) {
    if (!j.cleaner) continue;
    lines.push("BEGIN:VEVENT", `UID:turnover-${j.id}@str-turnover-scheduler`, `DTSTAMP:${stamp(j.start)}`, `DTSTART:${stamp(j.start)}`, `DTEND:${stamp(j.end)}`, `SUMMARY:Clean ${j.property} (Cleaner ${j.cleaner})`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export const DEFAULT_PROPS = "# name, clean hours, cleaning fee charged, checkout time, check-in time\nHarbor Loft, 2.5, 140, 11:00, 16:00\nPine Cabin, 3.5, 180, 10:00, 16:00\nMain St Studio, 1.5, 85, 11:00, 15:00\n";

export function sampleBookings() {
  const cal = (name, evs) => `# ${name}\nBEGIN:VCALENDAR\nX-WR-CALNAME:${name}\n` + evs.map(([s, e, t]) => `BEGIN:VEVENT\nDTSTART;VALUE=DATE:${s}\nDTEND;VALUE=DATE:${e}\nSUMMARY:${t || "Reserved"}\nEND:VEVENT\n`).join("") + "END:VCALENDAR\n";
  return [
    cal("Harbor Loft", [["20261012", "20261015"], ["20261015", "20261018"], ["20261018", "20261019"], ["20261021", "20261024"], ["20261024", "20261026"], ["20261020", "20261021", "Airbnb (Not available)"]]),
    cal("Pine Cabin", [["20261011", "20261015"], ["20261015", "20261017"], ["20261017", "20261020"], ["20261016", "20261017"], ["20261022", "20261025"]]),
    cal("Main St Studio", [["20261012", "20261013"], ["20261013", "20261014"], ["20261014", "20261015"], ["20261015", "20261017"], ["20261017", "20261018"], ["20261018", "20261019"], ["20261012", "20261013"]]),
  ].join("\n");
}
