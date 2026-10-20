// Scheduling core: time zones, weekly hours, free slots, busy-calendar parsing, invites.
// Pure functions, no Node imports, so the demo page runs the exact code the server does.

export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MIN = 60_000, DAY = 86_400_000;

const fmtCache = new Map();
function fmt(tz) {
  let f = fmtCache.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" }); fmtCache.set(tz, f); }
  return f;
}

export function validTz(tz) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return typeof tz === "string" && tz.length > 0; } catch { return false; }
}

// Wall-clock parts of an instant in a zone.
export function tzParts(ms, tz) {
  const p = {};
  for (const x of fmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, dow: DAYS.indexOf(p.weekday.toLowerCase().slice(0, 3)) };
}

const offsetAt = (ms, tz) => { const p = tzParts(ms, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; };

// The instant at which a zone's wall clock reads y-m-d h:mi. Null when that time does not exist (spring-forward gap).
export function zonedToUtc(y, m, d, h, mi, tz) {
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let t = wall - offsetAt(wall, tz);
  t = wall - offsetAt(t, tz);
  const p = tzParts(t, tz);
  return p.y === y && p.m === m && p.d === d && p.h === h && p.mi === mi ? t : null;
}

export const dateKey = (ms, tz) => { const p = tzParts(ms, tz); return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; };

const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s); if (!m) return null; const v = +m[1] * 60 + +m[2]; return +m[1] < 24 && +m[2] < 60 ? v : (+m[1] === 24 && +m[2] === 0 ? 1440 : null); };
export const fmtMin = (v) => `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;

// "mon-fri 09:00-12:00,13:00-17:00; sat 10:00-12:00" -> {mon:[[540,720],[780,1020]], ...}
export function parseHours(text) {
  const out = {}, errors = [];
  for (const part of String(text || "").split(/[;\n]/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^([a-z]{3})(?:\s*-\s*([a-z]{3}))?\s+(.+)$/i.exec(part);
    if (!m) { errors.push(`cannot read "${part}"`); continue; }
    const a = DAYS.indexOf(m[1].toLowerCase()), b = m[2] ? DAYS.indexOf(m[2].toLowerCase()) : a;
    if (a < 0 || b < 0) { errors.push(`unknown day in "${part}"`); continue; }
    const ranges = [];
    for (const r of m[3].split(",")) {
      const [s, e] = r.split("-").map((x) => hm(x.trim()));
      if (s == null || e == null || e <= s) { errors.push(`bad hours "${r.trim()}"`); continue; }
      ranges.push([s, e]);
    }
    for (let i = a; ; i = (i + 1) % 7) { out[DAYS[i]] = [...(out[DAYS[i]] || []), ...ranges].sort((x, y) => x[0] - y[0]); if (i === b) break; }
  }
  for (const k of Object.keys(out)) {
    const merged = [];
    for (const r of out[k]) { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([...r]); }
    out[k] = merged;
  }
  return { hours: out, errors };
}

export const hoursText = (hours) => Object.entries(hours || {}).sort((a, b) => DAYS.indexOf(a[0]) - DAYS.indexOf(b[0])).filter(([, r]) => r.length).map(([d, r]) => `${d} ${r.map(([s, e]) => `${fmtMin(s)}-${fmtMin(e)}`).join(",")}`).join("; ");

const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

// busy: [{start, end, before?, after?}] in ms. Bookings carry their own buffers; calendar events carry none.
// Returns start instants (ms) a stranger may book.
export function freeSlots(ev, busy, now, { ignore = null, limit = 2000 } = {}) {
  const out = [], before = (ev.bufferBefore || 0) * MIN, after = (ev.bufferAfter || 0) * MIN, len = ev.minutes * MIN, step = (ev.step || ev.minutes) * MIN;
  const earliest = now + (ev.noticeMin || 0) * MIN, latest = now + (ev.horizonDays || 30) * DAY;
  const live = busy.filter((b) => b.id == null || b.id !== ignore);
  const perDay = new Map();
  for (const b of live) if (b.event === ev.id) perDay.set(dateKey(b.start, ev.tz), (perDay.get(dateKey(b.start, ev.tz)) || 0) + 1);
  const closed = new Set(ev.closed || []);
  const first = tzParts(now, ev.tz);
  for (let i = 0; i <= (ev.horizonDays || 30) + 1 && out.length < limit; i++) {
    const noon = zonedToUtc(first.y, first.m, first.d, 12, 0, ev.tz) + i * DAY; // noon never falls in a gap, so adding days is safe
    const p = tzParts(noon, ev.tz), key = dateKey(noon, ev.tz);
    if (closed.has(key)) continue;
    if (ev.maxPerDay && (perDay.get(key) || 0) >= ev.maxPerDay) continue;
    for (const [w0, w1] of (ev.hours || {})[DAYS[p.dow]] || []) {
      for (let m = w0; m + ev.minutes <= w1; m += ev.step || ev.minutes) {
        const s = zonedToUtc(p.y, p.m, p.d, Math.floor(m / 60), m % 60, ev.tz);
        if (s == null || s < earliest || s > latest) continue;
        const e = s + len;
        if (live.some((b) => overlaps(s - before, e + after, b.start, b.end) || overlaps(s, e, b.start - (b.before || 0) * MIN, b.end + (b.after || 0) * MIN))) continue;
        out.push(s);
      }
    }
  }
  return out;
}

export function groupByDay(slots, tz) {
  const days = new Map();
  for (const s of slots) { const k = dateKey(s, tz); if (!days.has(k)) days.set(k, []); days.get(k).push(s); }
  return days;
}

export function fmtTime(ms, tz) { const p = tzParts(ms, tz); const h = p.h % 12 || 12; return `${h}:${String(p.mi).padStart(2, "0")} ${p.h < 12 ? "AM" : "PM"}`; }
export function fmtDay(ms, tz) { return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(ms)); }

// ---- iCalendar ----

const unfold = (t) => String(t).replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
const icsStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsEsc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line) => { const out = []; let s = line; while (s.length > 73) { out.push(s.slice(0, 73)); s = ` ${s.slice(73)}`; } out.push(s); return out.join("\r\n"); };

// An invitation (METHOD:REQUEST) or cancellation (METHOD:CANCEL) calendar apps add or remove by UID.
export function buildIcs({ uid, start, end, summary, description = "", location = "", organizer = null, attendee = null, method = "REQUEST", sequence = 0, now = Date.now() }) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//slot-keeper//EN", "CALSCALE:GREGORIAN", `METHOD:${method}`, "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${icsStamp(now)}`, `SEQUENCE:${sequence}`, `DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(end)}`, `SUMMARY:${icsEsc(summary)}`];
  if (description) lines.push(`DESCRIPTION:${icsEsc(description)}`);
  if (location) lines.push(`LOCATION:${icsEsc(location)}`);
  if (organizer) lines.push(`ORGANIZER;CN=${icsEsc(organizer.name || "Host").replace(/[":]/g, "")}:mailto:${organizer.email}`);
  if (attendee) lines.push(`ATTENDEE;CN=${icsEsc(attendee.name || "Guest").replace(/[":]/g, "")};RSVP=FALSE:mailto:${attendee.email}`);
  lines.push(`STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT", "END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

const icsDate = (v, params, fallbackTz) => {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v.trim());
  if (!m) return null;
  const allDay = m[4] === undefined, tzp = /TZID=([^;:]+)/i.exec(params || ""), tz = tzp && validTz(tzp[1]) ? tzp[1] : fallbackTz;
  const parts = [+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0)];
  const ms = m[7] ? Date.UTC(...[parts[0], parts[1] - 1, ...parts.slice(2)]) : zonedToUtc(...parts, tz);
  return ms == null ? null : { ms, allDay, tz, parts, utc: !!m[7] };
};

const durMs = (v) => { const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim()); return m ? (+(m[1] || 0) * 7 + +(m[2] || 0)) * DAY + (+(m[3] || 0) * 60 + +(m[4] || 0)) * MIN + +(m[5] || 0) * 1000 : null; };

// Busy intervals from an iCalendar feed (a calendar's secret "iCal address"), within [from, to].
// Handles UTC, TZID and floating times, all-day events, DURATION, DAILY/WEEKLY/MONTHLY/YEARLY RRULEs with INTERVAL,
// COUNT, UNTIL and BYDAY, and EXDATE. Cancelled and "free" (transparent) events are ignored.
// Unsupported rules (BYSETPOS, BYMONTHDAY lists and so on) fall back to the first occurrence only: say so in the README.
export function parseIcsBusy(text, from, to, defaultTz = "UTC") {
  const busy = [], unsupported = [];
  let ev = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") { ev = { x: [] }; continue; }
    if (line === "END:VEVENT") { if (ev) emit(ev); ev = null; continue; }
    if (!ev) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const [name, ...rest] = line.slice(0, i).split(";");
    ev[name.toUpperCase()] = ev[name.toUpperCase()] ?? line.slice(i + 1);
    ev[`${name.toUpperCase()}_P`] = ev[`${name.toUpperCase()}_P`] ?? rest.join(";");
    if (name.toUpperCase() === "EXDATE") ev.x.push(...line.slice(i + 1).split(",").map((v) => icsDate(v, rest.join(";"), defaultTz)).filter(Boolean).map((d) => d.ms));
  }
  function emit(e) {
    if (/^CANCELLED$/i.test(e.STATUS || "") || /^TRANSPARENT$/i.test(e.TRANSP || "") || !e.DTSTART) return;
    const s = icsDate(e.DTSTART, e.DTSTART_P, defaultTz); if (!s) return;
    let len;
    if (e.DTEND) { const en = icsDate(e.DTEND, e.DTEND_P, defaultTz); len = en ? en.ms - s.ms : s.allDay ? DAY : 0; }
    else if (e.DURATION) len = durMs(e.DURATION) ?? 0; else len = s.allDay ? DAY : 0;
    if (len <= 0) return;
    const push = (start) => { if (start < to && start + len > from && !e.x.includes(start)) busy.push({ start, end: start + len }); };
    if (!e.RRULE) return push(s.ms);
    const r = Object.fromEntries(e.RRULE.split(";").map((kv) => kv.split("=")));
    const until = r.UNTIL ? icsDate(r.UNTIL, "", defaultTz)?.ms : Infinity, count = r.COUNT ? +r.COUNT : Infinity, every = Math.max(1, +(r.INTERVAL || 1));
    const freq = r.FREQ, tz = s.utc ? "UTC" : s.tz;
    if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq) || r.BYSETPOS || (r.BYMONTHDAY && freq !== "MONTHLY") || (r.BYDAY && !["WEEKLY"].includes(freq))) { unsupported.push(freq || "?"); return push(s.ms); }
    const [y, mo, d, h, mi] = s.parts;
    const at = (yy, mm, dd) => { // dates roll over (Oct 33 is Nov 2); a month without day 31 has no occurrence
      const n = new Date(Date.UTC(yy, mm - 1, dd));
      if (freq === "MONTHLY" || freq === "YEARLY") { if (n.getUTCDate() !== d) return null; }
      const [ny, nm, nd] = [n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate()];
      return s.utc ? Date.UTC(ny, nm - 1, nd, h, mi) : zonedToUtc(ny, nm, nd, h, mi, tz);
    };
    const byday = r.BYDAY ? r.BYDAY.split(",").map((x) => ["su", "mo", "tu", "we", "th", "fr", "sa"].indexOf(x.slice(-2).toLowerCase())).filter((x) => x >= 0) : null;
    let n = 0;
    const startDow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
    for (let k = 0; k < 4000 && n < count; k++) {
      const cands = [];
      if (freq === "DAILY") cands.push(at(y, mo, d + k * every));
      else if (freq === "WEEKLY") for (const dw of byday || [startDow]) cands.push(at(y, mo, d + k * 7 * every + (dw - startDow)));
      else if (freq === "MONTHLY") cands.push(at(y, mo + k * every, d));
      else cands.push(at(y + k * every, mo, d));
      for (const c of cands.filter((x) => x != null).sort((a, b) => a - b)) {
        if (c < s.ms) continue;
        if (c > until) return;
        if (++n > count) return;
        if (c >= to) return;
        push(c);
      }
    }
  }
  busy.unsupported = unsupported;
  return busy;
}
