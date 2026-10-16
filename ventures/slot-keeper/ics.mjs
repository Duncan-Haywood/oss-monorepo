// iCalendar in and out. Browser-safe.
//   busyFromIcs: read a calendar feed (Google, Outlook, Apple "secret address" or a pasted .ics) into busy intervals.
//   buildIcs:    one confirmed booking as an .ics the invitee can add to any calendar.
import { zonedToUtc, validZone, zonedParts, DAYS, addDays } from "./slots.mjs";

function unfold(text) { return String(text).replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n"); }

function prop(line) {
  const i = line.indexOf(":"); if (i < 0) return null;
  const [name, ...params] = line.slice(0, i).split(";");
  const p = {}; for (const x of params) { const [k, v] = x.split("="); if (k) p[k.toUpperCase()] = (v || "").replace(/^"|"$/g, ""); }
  return { name: name.toUpperCase(), params: p, value: line.slice(i + 1).trim() };
}

// -> {kind: "utc"|"zoned"|"floating"|"date", y,m,d,h,i,tz}
function when(pr, defaultTz) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(pr.value);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (m[4] === undefined) return { kind: "date", y, m: mo, d, h: 0, i: 0, tz: defaultTz };
  const base = { y, m: mo, d, h: +m[4], i: +m[5] };
  if (m[7]) return { kind: "utc", ...base, tz: "UTC" };
  const tz = pr.params.TZID && validZone(pr.params.TZID) ? pr.params.TZID : defaultTz; // Windows zone names fall back to the host's zone
  return { kind: pr.params.TZID ? "zoned" : "floating", ...base, tz };
}
const instant = (w) => (w.kind === "utc" ? Date.UTC(w.y, w.m - 1, w.d, w.h, w.i) : zonedToUtc(w.y, w.m, w.d, w.h, w.i, w.tz));

function duration(v) {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v);
  return m ? ((+m[1] || 0) * 604800 + (+m[2] || 0) * 86400 + (+m[3] || 0) * 3600 + (+m[4] || 0) * 60 + (+m[5] || 0)) * 1000 : null;
}

function rrule(v) { const o = {}; for (const kv of v.split(";")) { const [k, val] = kv.split("="); if (k) o[k.toUpperCase()] = val; } return o; }

// Busy intervals overlapping [from, to). Free ("transparent") and cancelled events are skipped.
export function busyFromIcs(text, { tz = "UTC", from = 0, to = Infinity, max = 20_000 } = {}) {
  const out = [];
  let ev = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") { ev = { ex: [] }; continue; }
    if (line === "END:VEVENT") { if (ev) expand(ev); ev = null; continue; }
    if (!ev) continue;
    const pr = prop(line); if (!pr) continue;
    if (pr.name === "DTSTART") ev.start = when(pr, tz);
    else if (pr.name === "DTEND") ev.end = when(pr, tz);
    else if (pr.name === "DURATION") ev.dur = duration(pr.value);
    else if (pr.name === "RRULE") ev.rule = rrule(pr.value);
    else if (pr.name === "EXDATE") for (const v of pr.value.split(",")) { const w = when({ ...pr, value: v }, tz); if (w) ev.ex.push(instant(w)); }
    else if (pr.name === "STATUS" && pr.value.toUpperCase() === "CANCELLED") ev.cancelled = true;
    else if (pr.name === "TRANSP" && pr.value.toUpperCase() === "TRANSPARENT") ev.free = true;
  }
  return out.sort((a, b) => a.start - b.start);

  function push(s, e) { if (e > from && s < to && out.length < max) out.push({ start: s, end: e, kind: "external" }); }

  function expand(e) {
    if (e.cancelled || e.free || !e.start) return;
    const s0 = instant(e.start); if (s0 === null) return;
    let len;
    if (e.end) len = instant(e.end) - s0;
    else if (e.dur !== undefined && e.dur !== null) len = e.dur;
    else len = e.start.kind === "date" ? 86_400_000 : 0;
    if (!(len > 0)) return;
    if (!e.rule) return push(s0, s0 + len);
    const r = e.rule, step = Math.max(1, +r.INTERVAL || 1), limit = r.COUNT ? +r.COUNT : Infinity;
    const until = r.UNTIL ? (() => { const w = when({ name: "UNTIL", params: {}, value: r.UNTIL }, tz); return w ? (w.kind === "date" ? instant(w) + 86_399_000 : instant(w)) : Infinity; })() : Infinity;
    const st = e.start, startKey = `${st.y}-${String(st.m).padStart(2, "0")}-${String(st.d).padStart(2, "0")}`;
    const at = (key) => { const [y, m, d] = key.split("-").map(Number); return st.kind === "utc" ? Date.UTC(y, m - 1, d, st.h, st.i) : zonedToUtc(y, m, d, st.h, st.i, st.tz); };
    const byday = r.BYDAY ? r.BYDAY.split(",").map((x) => DAYS.findIndex((d) => d.slice(0, 2) === x.slice(-2).toLowerCase())).filter((x) => x >= 0) : null;
    let n = 0;
    const emit = (key) => { const s = at(key); if (s === null || s < s0) return true; if (s > until || s >= to) return false; if (++n > limit) return false; if (!e.ex.includes(s)) push(s, s + len); return true; };
    const dow0 = new Date(Date.UTC(st.y, st.m - 1, st.d)).getUTCDay();
    if (r.FREQ === "DAILY") { for (let i = 0, key = startKey; i < 4000; i++, key = addDays(key, step)) if (!emit(key)) break; }
    else if (r.FREQ === "WEEKLY") {
      const days = byday && byday.length ? byday.slice().sort((a, b) => ((a - 1 + 7) % 7) - ((b - 1 + 7) % 7)) : [dow0];
      const weekStart = addDays(startKey, -((dow0 + 6) % 7)); // Monday
      outer: for (let w = 0, key = weekStart; w < 1500; w++, key = addDays(key, 7 * step)) {
        for (const d of days) if (!emit(addDays(key, (d + 6) % 7))) break outer;
      }
    } else if (r.FREQ === "MONTHLY" || r.FREQ === "YEARLY") {
      for (let i = 0; i < 600; i++) {
        const mo = r.FREQ === "MONTHLY" ? st.m - 1 + i * step : st.m - 1, yr = st.y + (r.FREQ === "YEARLY" ? i * step : 0);
        const dt = new Date(Date.UTC(yr, mo, st.d)); if (dt.getUTCDate() !== st.d) continue; // 31st skips short months, as iCalendar does
        if (!emit(dt.toISOString().slice(0, 10))) break;
      }
    } else push(s0, s0 + len);
  }
}

const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
function fold(line) {
  const bytes = new TextEncoder(); if (bytes.encode(line).length <= 75) return line;
  const parts = []; let cur = "";
  for (const ch of line) { if (bytes.encode(cur + ch).length > (parts.length ? 74 : 75)) { parts.push(cur); cur = ch; } else cur += ch; }
  parts.push(cur); return parts.join("\r\n ");
}

export function buildIcs({ uid, start, end, title, description = "", location = "", organizer, attendee, status = "CONFIRMED", sequence = 0, method = "PUBLISH", now = Date.now() }) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//slot-keeper//EN", "CALSCALE:GREGORIAN", `METHOD:${method}`, "BEGIN:VEVENT",
    `UID:${uid}`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SEQUENCE:${sequence}`, `STATUS:${status}`, `SUMMARY:${esc(title)}`];
  if (description) lines.push(`DESCRIPTION:${esc(description)}`);
  if (location) lines.push(`LOCATION:${esc(location)}`);
  if (organizer?.email) lines.push(`ORGANIZER;CN=${esc(organizer.name || "")}:mailto:${organizer.email}`);
  if (attendee?.email) lines.push(`ATTENDEE;CN=${esc(attendee.name || "")};RSVP=FALSE:mailto:${attendee.email}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export { zonedParts };
