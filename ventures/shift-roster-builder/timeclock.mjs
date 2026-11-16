// Time clock and timesheets for the team hub (2026-11-15). No Node built-ins, so it runs on the Node server and the
// Cloudflare Worker alike. Staff clock in and out on the team page; the time is the server's clock, never the phone's.
// The manager sees each person's worked time beside the published week: late starts, early finishes, time past the
// shift's end, shifts with no punch, time worked on no scheduled shift and punches left open, and can add a missed punch
// (marked as added by the manager, kept in the CSV) or remove a wrong one.
//
// Optional checks (clockguard.mjs, 2026-11-16): a per-person clock PIN and a site geofence, both off by default. With
// neither on it is an honour system (anyone with the team link can punch for anyone; the manager's edits and the
// "added by manager" marks are the check). It flags weekly hours over 40 only as a
// number to look at; daily overtime, breaks and rounding rules depend on where you are and are not applied.

import { placeFlag } from "./clockguard.mjs";

export const MAX_PUNCHES = 3000; // about 100 days of a 15-person team punching twice a day
const OPEN_LIMIT_MIN = 16 * 60; // an "in" with no "out" after this long is a missing clock-out, not someone still working

const fmt2 = (n) => String(n).padStart(2, "0");
export const clock = (m) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${fmt2(Math.floor(x / 60))}:${fmt2(x % 60)}`; };

// A valid IANA zone name or "UTC".
export function zoneOf(tz) {
  const z = String(tz || "").trim();
  if (!z) return "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return z; } catch { return "UTC"; }
}

// The wall-clock date and minute of an instant in a time zone.
export function localParts(ms, tz) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: zoneOf(tz), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) + Number(p.second) / 60 };
}

// The instant of a wall-clock date and minute in a time zone (the earlier one when a clock change repeats an hour).
export function fromLocal(date, min, tz) {
  const [y, mo, d] = String(date).split("-").map(Number);
  if (!y || !mo || !d || !(min >= 0 && min < 1440)) return null;
  const wall = Date.UTC(y, mo - 1, d) + min * 60000;
  let t = wall;
  for (let k = 0; k < 3; k++) {
    const p = localParts(t, tz), seen = Date.UTC(...p.date.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v)))) + Math.round(p.min) * 60000;
    if (seen === wall) return t;
    t += wall - seen;
  }
  return t;
}

const dayNum = (date) => { const [y, m, d] = date.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
// Minutes from 00:00 on the week's Monday, in the site's wall-clock time.
const weekMin = (ms, weekStart, tz) => { const p = localParts(ms, tz); return (dayNum(p.date) - dayNum(weekStart)) * 1440 + p.min; };

// Who is on the clock now: person -> the open "in" punch (if it is younger than the open limit).
export function onTheClock(punches, nowMs) {
  const last = new Map();
  for (const p of [...(punches || [])].sort((a, b) => a.at - b.at)) last.set(p.person, p);
  const out = new Map();
  for (const [name, p] of last) if (p.kind === "in" && nowMs - p.at < OPEN_LIMIT_MIN * 60000) out.set(name, p);
  return out;
}

// Record a punch with the server's time. Refuses a second "in" while one is open and an "out" with nothing open,
// so a double tap cannot make a zero-length or negative shift.
export function punch(state, person, kind, nowMs, { by = "staff", tz = "UTC", where = null } = {}) {
  if (kind !== "in" && kind !== "out") return { error: "Choose clock in or clock out." };
  state.punches = state.punches || [];
  const open = onTheClock(state.punches, nowMs).get(person);
  if (by === "staff" && kind === "in" && open) return { error: `${person} is already clocked in (since ${clock(localParts(open.at, tz).min)}, ${zoneOf(tz)}). Clock out first.` };
  if (by === "staff" && kind === "out" && !open) return { error: `${person} is not clocked in. Ask your manager to add a missed clock-in.` };
  state.punchSeq = (state.punchSeq || 0) + 1;
  const p = { id: state.punchSeq, person, kind, at: nowMs, by };
  if (where) p.where = where; // distance from the site only (clockguard.mjs placeOf), never coordinates
  state.punches.push(p);
  trimPunches(state, MAX_PUNCHES, nowMs);
  return { ok: true, punch: p };
}

// Every closed worked stretch in the punches: { person, inAt, outAt }.
export function workedSpans(punches, nowMs) {
  const by = new Map();
  for (const p of punches || []) { if (!by.has(p.person)) by.set(p.person, []); by.get(p.person).push(p); }
  const out = [];
  for (const [person, list] of by) {
    list.sort((a, b) => a.at - b.at || a.id - b.id);
    for (const sp of pairPunches(list, nowMs).spans) if (sp.out) out.push({ person, inAt: sp.in.at, outAt: sp.out.at });
  }
  return out;
}

// Keep the newest `keep` punches. The closed stretches among the dropped ones are first folded into state.leaveBank
// (person -> UTC date of the clock-out -> { minutes, at }), so leave earned from them (leave.mjs) is not lost with them.
// A stretch whose clock-in is dropped and clock-out kept is lost either way (it reads as a missing clock-in).
export function trimPunches(state, keep, nowMs) {
  const list = state.punches || [];
  if (list.length <= keep) return 0;
  const drop = list.slice(0, list.length - keep);
  state.leaveBank = state.leaveBank || {};
  for (const sp of workedSpans(drop, nowMs)) {
    const day = new Date(sp.outAt).toISOString().slice(0, 10), mine = (state.leaveBank[sp.person] ||= {});
    const b = (mine[day] ||= { minutes: 0, at: sp.outAt });
    b.minutes += (sp.outAt - sp.inAt) / 60000; b.at = Math.max(b.at, sp.outAt);
  }
  list.splice(0, drop.length);
  return drop.length;
}

// A manager's missed punch, typed as the site's wall-clock date and time ("2026-11-16", "09:05").
export function addPunch(state, { person, date, time, kind }, tz, nowMs) {
  const m = String(time || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!person) return { error: "Pick a person." };
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return { error: "Type the time as HH:MM, for example 09:05." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return { error: "Pick a date." };
  const at = fromLocal(date, Number(m[1]) * 60 + Number(m[2]), tz);
  if (at == null) return { error: "That date and time could not be read." };
  if (at > nowMs + 60000) return { error: "That time is in the future." };
  return punch(state, person, kind, at, { by: "manager", tz });
}

export function removePunch(state, id) {
  const n = (state.punches || []).length;
  state.punches = (state.punches || []).filter((p) => p.id !== Number(id));
  return state.punches.length < n;
}

// One person's punches paired in time order: in then out is a worked stretch; an in followed by another in (or by
// nothing, past the open limit) is a missing clock-out; an out with no in before it is a missing clock-in.
function pairPunches(list, nowMs) {
  const spans = [], strays = [];
  let open = null;
  for (const p of list) {
    if (p.kind === "in") { if (open) strays.push({ kind: "no-out", punch: open }); open = p; }
    else if (open) { spans.push({ in: open, out: p }); open = null; }
    else strays.push({ kind: "no-in", punch: p });
  }
  if (open) (nowMs - open.at < OPEN_LIMIT_MIN * 60000 ? spans.push({ in: open, out: null }) : strays.push({ kind: "no-out", punch: open }));
  return { spans, strays };
}

// The timesheet for one published week: per person the worked stretches matched to their scheduled shifts, totals and
// flags. `week` is { weekStart, assignments, people? } (the published week or one from history).
export function timesheet(punches, week, { tz = "UTC", graceMin = 5, nowMs = Date.now(), overtimeAfter = 40 } = {}) {
  if (!week || !week.weekStart) return { error: "Set the week's Monday and publish it before reading a timesheet." };
  const ws = week.weekStart, zone = zoneOf(tz);
  const names = [...new Set([...(week.people || []).map((p) => p.name), ...week.assignments.filter((a) => a.person).map((a) => a.person), ...(punches || []).map((p) => p.person)])];
  const inWeek = (m) => m >= 0 && m < 7 * 1440;
  const nowW = weekMin(nowMs, ws, zone);
  const people = [];
  for (const name of names) {
    const mine = (punches || []).filter((p) => p.person === name).sort((a, b) => a.at - b.at || a.id - b.id);
    const { spans, strays } = pairPunches(mine, nowMs);
    const shifts = week.assignments.filter((a) => a.person === name).map((a) => ({ day: a.slot.day, startMin: a.slot.startMin, endMin: a.slot.endMin, label: a.slot.label || "", s: a.slot.day * 1440 + a.slot.startMin, e: a.slot.day * 1440 + a.slot.endMin, spans: [] }));
    const rows = [];
    for (const sp of spans) {
      const a = weekMin(sp.in.at, ws, zone);
      if (!inWeek(a)) continue;
      const b = sp.out ? weekMin(sp.out.at, ws, zone) : nowW;
      // The shift it overlaps most, or else one starting within two hours of the clock-in.
      let best = null, bestOv = 0;
      for (const sh of shifts) { const ov = Math.min(b, sh.e) - Math.max(a, sh.s); if (ov > bestOv) { bestOv = ov; best = sh; } }
      if (!best) { let gap = 121; for (const sh of shifts) { const g = Math.abs(sh.s - a); if (g < gap) { gap = g; best = sh; } } }
      const row = { person: name, inAt: sp.in.at, outAt: sp.out ? sp.out.at : null, a, b, minutes: sp.out ? b - a : 0, open: !sp.out, shift: best, flags: [], byManager: sp.in.by === "manager" || (sp.out && sp.out.by === "manager") };
      if (best) best.spans.push(row); else row.flags.push("no scheduled shift");
      if (row.open) row.flags.push("on the clock now");
      if (row.byManager) row.flags.push("punch added by manager");
      for (const f of [placeFlag(sp.in, "clock-in"), placeFlag(sp.out, "clock-out")]) if (f) row.flags.push(f);
      rows.push(row);
    }
    for (const sh of shifts) {
      if (!sh.spans.length) continue;
      const first = Math.min(...sh.spans.map((r) => r.a)), closed = sh.spans.filter((r) => !r.open), last = closed.length ? Math.max(...closed.map((r) => r.b)) : null;
      const head = sh.spans.find((r) => r.a === first);
      if (first - sh.s > graceMin) head.flags.push(`late ${Math.round(first - sh.s)} min`);
      if (last != null && closed.length === sh.spans.length) {
        const tail = closed.find((r) => r.b === last);
        if (sh.e - last > graceMin) tail.flags.push(`left ${Math.round(sh.e - last)} min early`);
        if (last - sh.e > graceMin) tail.flags.push(`${Math.round(last - sh.e)} min past shift end`);
      }
    }
    const noShow = shifts.filter((sh) => !sh.spans.length && sh.s + graceMin < nowW).map((sh) => ({ day: sh.day, startMin: sh.startMin, endMin: sh.endMin, label: sh.label }));
    const missing = strays.filter((x) => inWeek(weekMin(x.punch.at, ws, zone))).map((x) => ({ kind: x.kind, at: x.punch.at, id: x.punch.id, by: x.punch.by }));
    const workedMin = rows.reduce((t, r) => t + r.minutes, 0);
    const scheduledMin = shifts.reduce((t, sh) => t + (sh.e - sh.s), 0);
    if (!rows.length && !scheduledMin && !missing.length) continue;
    people.push({ name, rows, workedH: workedMin / 60, scheduledH: scheduledMin / 60, overH: Math.max(0, workedMin / 60 - overtimeAfter), noShow, missing });
  }
  people.sort((x, y) => x.name.localeCompare(y.name));
  const local = (ms) => { const p = localParts(ms, zone); return { date: p.date, time: clock(p.min) }; };
  return { weekStart: ws, tz: zone, graceMin, overtimeAfter, people, local };
}

// CSV formula injection guard: a staff name typed as "=HYPERLINK(...)" must not run when payroll opens the file.
const q = (v) => { let s = String(v); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
// One line per worked stretch (in the site's time zone), then each person's total: the file a bookkeeper pastes into payroll.
// With `pay` (payrules.mjs `payForTimesheet`), a second block follows: hours by pay class and the gross estimate.
export function timesheetCsv(ts, pay = null) {
  const out = [["person", "date", "clock_in", "clock_out", "hours", "scheduled_shift", "flags"].join(",")];
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (const p of ts.people) {
    for (const r of p.rows) {
      const i = ts.local(r.inAt), o = r.outAt != null ? ts.local(r.outAt) : null;
      const sh = r.shift ? `${DAYS[r.shift.day]} ${clock(r.shift.startMin)}-${clock(r.shift.endMin)}` : "";
      out.push([q(p.name), i.date, i.time, o ? o.time : "", r.open ? "" : (r.minutes / 60).toFixed(2), sh, q(r.flags.join("; "))].join(","));
    }
    for (const m of p.missing) { const t = ts.local(m.at); out.push([q(p.name), t.date, m.kind === "no-out" ? t.time : "", m.kind === "no-in" ? t.time : "", "", "", m.kind === "no-out" ? "missing clock-out" : "missing clock-in"].join(",")); }
    out.push([q(p.name), "TOTAL", "", "", p.workedH.toFixed(2), `scheduled ${p.scheduledH.toFixed(2)}`, q([p.overH > 0 ? `${p.overH.toFixed(2)} h over ${ts.overtimeAfter}` : "", p.noShow.length ? `${p.noShow.length} shift(s) with no punch` : ""].filter(Boolean).join("; "))].join(","));
  }
  if (pay && pay.length) {
    out.push("");
    out.push(["person", "pay_rules", "regular_hours", "overtime_hours_1_5x", "double_hours_2x", "meal_premium_days", "regular_rate", "estimated_gross", "rounding_net_min", "checks"].join(","));
    const f = (x) => (x == null ? "" : x.toFixed(2));
    for (const r of pay) out.push([q(r.name), r.rules, f(r.regularH), f(r.overtimeH), f(r.doubleH), r.mealPremiumDays, f(r.regularRate), f(r.gross), r.roundMin ? Math.round(r.roundNetMin) : "", q([...r.flags, ...r.notes].join("; "))].join(","));
  }
  return out.join("\n") + "\n";
}
