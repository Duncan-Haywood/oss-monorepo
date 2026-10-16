// Booking state and rules. Pure functions over one plain object, so the server only does I/O.
import { computeSlots, validZone, parseWeekly, parseTimeOff, formatWeekly, formatTimeOff } from "./slots.mjs";

export const isEmail = (s) => typeof s === "string" && s.length <= 254 && /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]{2,}$/.test(s);
const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, n);
const oneLine = (s, n) => clean(s, n).replace(/\s+/g, " ");
const int = (v, lo, hi, dflt) => { if (v === undefined || v === "" || v === null) return dflt; const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`must be a whole number from ${lo} to ${hi}`); return n; };

export function token(bytes = 16) {
  const b = new Uint8Array(bytes); globalThis.crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function newState() {
  return {
    settings: { name: "", tz: "UTC", weekly: parseWeekly("weekdays 09:00-17:00"), timeOff: [], icsUrl: "", hostEmail: "" },
    types: {}, bookings: {}, seq: 1,
  };
}

export function updateSettings(state, f) {
  const s = state.settings;
  if (f.tz !== undefined) { if (!validZone(String(f.tz).trim())) throw new Error(`unknown time zone "${oneLine(f.tz, 60)}": use a name like America/New_York or Europe/Berlin`); s.tz = String(f.tz).trim(); }
  if (f.name !== undefined) s.name = oneLine(f.name, 80);
  if (f.weekly !== undefined) s.weekly = parseWeekly(f.weekly);
  if (f.timeOff !== undefined) s.timeOff = parseTimeOff(f.timeOff);
  if (f.hostEmail !== undefined) { const e = oneLine(f.hostEmail, 254).toLowerCase(); if (e && !isEmail(e)) throw new Error("host email is not an email address"); s.hostEmail = e; }
  if (f.icsUrl !== undefined) {
    const u = String(f.icsUrl).trim();
    if (u) { let url; try { url = new URL(u); } catch { throw new Error("calendar feed must be a full https:// address"); } if (url.protocol !== "https:") throw new Error("calendar feed must be https"); if (url.username || url.password) throw new Error("calendar feed address must not contain a user name or password"); }
    s.icsUrl = u;
  }
  return s;
}

export const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

export function upsertType(state, f) {
  const name = oneLine(f.name, 80); if (!name) throw new Error("give the meeting a name");
  const slug = slugify(f.slug || name); if (!slug) throw new Error("the name needs letters or numbers");
  const t = {
    slug, name, description: clean(f.description, 1000),
    minutes: int(f.minutes, 5, 480, 30), buffer: int(f.buffer, 0, 240, 0), step: int(f.step, 5, 480, 0) || 0,
    notice: int(f.notice, 0, 60 * 24 * 90, 240), horizonDays: int(f.horizonDays, 1, 365, 60), maxPerDay: int(f.maxPerDay, 0, 50, 0),
    reminderMinutes: int(f.reminderMinutes, 0, 60 * 24 * 7, 1440), location: oneLine(f.location, 300),
    weekly: f.weekly && String(f.weekly).trim() ? parseWeekly(f.weekly) : null, hidden: f.hidden === "on" || f.hidden === true,
  };
  if (!t.step) t.step = t.minutes;
  state.types[slug] = t; return t;
}
export const removeType = (state, slug) => (state.types[slug] ? (delete state.types[slug], true) : false);

export const active = (state) => Object.values(state.bookings).filter((b) => b.status === "confirmed");
const typeOf = (state, b) => state.types[b.type];

export function busyOf(state, external = [], ignoreId = null) {
  const own = active(state).filter((b) => b.id !== ignoreId).map((b) => ({ id: b.id, start: b.start, end: b.end, kind: "booking" }));
  return own.concat(external.map((e) => ({ start: e.start, end: e.end, kind: "external" })));
}

export function slotsFor(state, type, { external = [], now, from, to, ignoreId = null }) {
  return computeSlots({ cfg: state.settings, type, busy: busyOf(state, external, ignoreId), now, from, to, ignoreId });
}

export function book(state, slug, f, now, external = []) {
  const type = state.types[slug]; if (!type) return { error: "no such meeting", status: 404 };
  const email = oneLine(f.email, 254).toLowerCase(), name = oneLine(f.name, 100), start = Number(f.start);
  if (!name) return { error: "please enter your name", status: 400 };
  if (!isEmail(email)) return { error: "please enter a valid email address", status: 400 };
  if (!Number.isSafeInteger(start)) return { error: "pick a time first", status: 400 };
  const tz = validZone(f.tz) ? f.tz : state.settings.tz;
  if (active(state).filter((b) => b.email === email && b.end > now).length >= 3) return { error: "this email already has three upcoming bookings; cancel one first", status: 429 };
  const ok = slotsFor(state, type, { external, now, from: start, to: start + 1 }).includes(start);
  if (!ok) return { error: "that time is no longer available; please pick another", status: 409 };
  const b = { id: `b${state.seq++}`, token: token(), type: slug, start, end: start + type.minutes * 60_000, name, email, notes: clean(f.notes, 2000), tz, status: "confirmed", created: now, reminded: false, rev: 0 };
  state.bookings[b.id] = b; return { booking: b };
}

export function reschedule(state, b, start, now, external = []) {
  const type = typeOf(state, b); if (!type) return { error: "this meeting type no longer exists", status: 410 };
  if (b.status !== "confirmed") return { error: "this booking is cancelled", status: 409 };
  if (!Number.isSafeInteger(start)) return { error: "pick a time first", status: 400 };
  if (!slotsFor(state, type, { external, now, from: start, to: start + 1, ignoreId: b.id }).includes(start)) return { error: "that time is no longer available; please pick another", status: 409 };
  b.start = start; b.end = start + type.minutes * 60_000; b.reminded = false; b.rev++; return { booking: b };
}

export function cancel(b, by, now, reason = "") {
  if (b.status !== "confirmed") return false;
  b.status = "cancelled"; b.cancelledBy = by; b.cancelledAt = now; b.reason = oneLine(reason, 300); b.rev++; return true;
}

export const upcoming = (state, now) => active(state).filter((b) => b.end > now).sort((a, b) => a.start - b.start);
export function dueReminders(state, now) {
  return upcoming(state, now).filter((b) => !b.reminded && b.start > now && (typeOf(state, b)?.reminderMinutes || 0) > 0 && b.start - now <= typeOf(state, b).reminderMinutes * 60_000);
}

export function purgeOlderThan(state, days, now) {
  if (!(days > 0)) return 0; let n = 0;
  for (const b of Object.values(state.bookings)) if (b.end < now - days * 86_400_000 || (b.status === "cancelled" && b.cancelledAt < now - days * 86_400_000)) { delete state.bookings[b.id]; n++; }
  return n;
}

const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(state) {
  const rows = [["id", "meeting", "start_utc", "end_utc", "name", "email", "status", "notes"]];
  for (const b of Object.values(state.bookings).sort((x, y) => x.start - y.start)) rows.push([b.id, b.type, new Date(b.start).toISOString(), new Date(b.end).toISOString(), b.name, b.email, b.status, b.notes]);
  return rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

export { parseWeekly, formatWeekly, parseTimeOff, formatTimeOff };
