// Time-zone-correct availability. Browser-safe: no Node imports, only Intl.
// Everything is in UTC milliseconds; a zone name is only used to read or build wall-clock times.

export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const fmtCache = new Map();

export function validZone(tz) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return typeof tz === "string" && tz.length > 0; } catch { return false; }
}

function fmt(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    if (fmtCache.size > 200) fmtCache.clear();
    fmtCache.set(tz, f);
  }
  return f;
}

// Wall-clock parts of an instant in a zone.
export function zonedParts(ms, tz) {
  const o = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year, m: o.month, d: o.day, h: o.hour, i: o.minute, s: o.second, dow: new Date(Date.UTC(o.year, o.month - 1, o.day)).getUTCDay() };
}

const offsetMs = (ms, tz) => {
  const p = zonedParts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.i, p.s) - Math.floor(ms / 1000) * 1000;
};

// The instant at which the wall clock in `tz` reads this time, or null when that time does not exist (the spring-forward gap).
// When it happens twice (the autumn repeat) the earlier instant is returned.
export function zonedToUtc(y, m, d, h, i, tz) {
  const guess = Date.UTC(y, m - 1, d, h, i);
  let t = guess - offsetMs(guess, tz);
  t = guess - offsetMs(t, tz);
  const p = zonedParts(t, tz);
  if (p.y !== y || p.m !== m || p.d !== d || p.h !== h || p.i !== i) return null;
  const earlier = t - 3_600_000;
  const q = zonedParts(earlier, tz);
  return q.y === y && q.m === m && q.d === d && q.h === h && q.i === i ? earlier : t;
}

export const dateKey = (p) => `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
export const dayKey = (ms, tz) => dateKey(zonedParts(ms, tz));
const addDays = (key, n) => { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
export { addDays };

const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s); if (!m || +m[1] > 24 || +m[2] > 59 || (+m[1] === 24 && +m[2])) return null; return +m[1] * 60 + +m[2]; };
const pad = (n) => String(n).padStart(2, "0");
const toHm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

// "mon-fri 09:00-12:00, 13:00-17:00" one line per day group; "sat closed"; "weekdays", "weekends" and "daily" are shortcuts.
// Returns {weekly: {0..6: [[startMin, endMin], ...]}} or throws an Error naming the bad line.
export function parseWeekly(text) {
  const weekly = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim().toLowerCase();
    if (!line || line.startsWith("#")) continue;
    const m = /^([a-z]+(?:\s*-\s*[a-z]+)?)\s+(.+)$/.exec(line);
    if (!m) throw new Error(`cannot read "${raw.trim()}": start with a day, e.g. "mon-fri 09:00-17:00"`);
    const days = dayList(m[1].replace(/\s/g, ""));
    if (!days) throw new Error(`unknown day in "${raw.trim()}"`);
    const ranges = [];
    if (m[2].trim() !== "closed" && m[2].trim() !== "off") {
      for (const r of m[2].split(",")) {
        const mm = /^\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/.exec(r);
        const a = mm && hm(mm[1]), b = mm && hm(mm[2]);
        if (a === null || b === null || a === undefined || b === undefined || b <= a) throw new Error(`bad hours "${r.trim()}" in "${raw.trim()}": use 09:00-17:00 with the end after the start`);
        ranges.push([a, b]);
      }
    }
    for (const d of days) weekly[d] = ranges.slice();
  }
  for (const d of DAYS.keys()) weekly[d] = mergeRanges(weekly[d]);
  return weekly;
}

function dayList(tok) {
  if (tok === "daily" || tok === "everyday") return [0, 1, 2, 3, 4, 5, 6];
  if (tok === "weekdays") return [1, 2, 3, 4, 5];
  if (tok === "weekends") return [0, 6];
  const [a, b] = tok.split("-").map((x) => DAYS.indexOf(x.slice(0, 3)));
  if (a < 0 || (tok.includes("-") && b < 0)) return null;
  if (!tok.includes("-")) return [a];
  const out = []; for (let d = a; ; d = (d + 1) % 7) { out.push(d); if (d === b) break; }
  return out;
}

export function mergeRanges(rs) {
  const s = rs.slice().sort((x, y) => x[0] - y[0]); const out = [];
  for (const r of s) { const l = out[out.length - 1]; if (l && r[0] <= l[1]) l[1] = Math.max(l[1], r[1]); else out.push([r[0], r[1]]); }
  return out;
}

export function formatWeekly(weekly) {
  const lines = [];
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const r = weekly[d] || [];
    lines.push(`${DAYS[d]} ${r.length ? r.map(([a, b]) => `${toHm(a)}-${toHm(b)}`).join(", ") : "closed"}`);
  }
  return lines.join("\n");
}

// Days off: one per line, "2026-12-24" or "2026-12-24 to 2027-01-02", optional "# reason".
export function parseTimeOff(text) {
  const out = [];
  for (const raw of String(text || "").split("\n")) {
    const line = raw.replace(/#.*/, "").trim(); if (!line) continue;
    const m = /^(\d{4}-\d{2}-\d{2})(?:\s*(?:to|-|\.\.)\s*(\d{4}-\d{2}-\d{2}))?$/.exec(line);
    if (!m) throw new Error(`cannot read day off "${raw.trim()}": use 2026-12-24 or 2026-12-24 to 2027-01-02`);
    const to = m[2] || m[1];
    if (to < m[1] || Number.isNaN(Date.parse(m[1])) || Number.isNaN(Date.parse(to))) throw new Error(`bad dates in "${raw.trim()}"`);
    out.push([m[1], to]);
  }
  return out;
}
export const formatTimeOff = (off) => (off || []).map(([a, b]) => (a === b ? a : `${a} to ${b}`)).join("\n");
const isOff = (off, key) => (off || []).some(([a, b]) => key >= a && key <= b);

// Free slot start times (UTC ms) for one event type.
//   cfg:  {tz, weekly, timeOff}            the host's calendar
//   type: {minutes, buffer, step, notice, horizonDays, maxPerDay, weekly?}
//   busy: [{start, end}]                   bookings and imported calendar events, UTC ms
// from/to bound the search (UTC ms, `to` exclusive).
export function computeSlots({ cfg, type, busy = [], now, from, to, ignoreId = null }) {
  const dur = type.minutes * 60_000, buf = (type.buffer || 0) * 60_000, step = (type.step || type.minutes) * 60_000;
  const earliest = Math.max(from, now + (type.notice || 0) * 60_000, now);
  const latest = Math.min(to, now + (type.horizonDays || 60) * 86_400_000);
  if (latest <= earliest) return [];
  const weekly = type.weekly || cfg.weekly;
  const blocks = busy.filter((b) => b.id === undefined || b.id !== ignoreId).map((b) => [b.start - buf, b.end + buf]).sort((a, b) => a[0] - b[0]);
  const perDay = new Map();
  if (type.maxPerDay) for (const b of busy) if (b.id !== undefined && b.id !== ignoreId && b.kind === "booking") { const k = dayKey(b.start, cfg.tz); perDay.set(k, (perDay.get(k) || 0) + 1); }
  const out = [];
  let key = addDays(dayKey(earliest, cfg.tz), -1);
  const last = addDays(dayKey(latest, cfg.tz), 1);
  for (; key <= last; key = addDays(key, 1)) {
    if (isOff(cfg.timeOff, key)) continue;
    const [y, m, d] = key.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    let taken = perDay.get(key) || 0;
    for (const [a, b] of weekly[dow] || []) {
      const ws = zonedToUtc(y, m, d, Math.floor(a / 60), a % 60, cfg.tz);
      const we = b === 1440 ? zonedToUtc(y, m, d + 1, 0, 0, cfg.tz) : zonedToUtc(y, m, d, Math.floor(b / 60), b % 60, cfg.tz);
      if (ws === null || we === null) continue;
      for (let s = ws; s + dur <= we; s += step) {
        if (s < earliest || s >= latest) continue;
        if (type.maxPerDay && taken >= type.maxPerDay) break;
        if (blocks.some(([x, y2]) => s < y2 && s + dur > x)) continue;
        out.push(s);
      }
    }
  }
  return out;
}

// Group slot starts by the viewer's local date.
export function groupByDay(slots, tz) {
  const days = new Map();
  for (const s of slots) { const k = dayKey(s, tz); if (!days.has(k)) days.set(k, []); days.get(k).push(s); }
  return [...days].map(([date, list]) => ({ date, slots: list }));
}

export const clock = (ms, tz) => { const p = zonedParts(ms, tz); return `${pad(p.h)}:${pad(p.i)}`; };
export function longDate(ms, tz) { return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(ms)); }
export const dayLabel = (key) => { const [y, m, d] = key.split("-").map(Number); return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, d))); };
