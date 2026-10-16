// Booking state: event types, bookings, double-booking checks, cancel and reschedule, reminders, CSV.
// Pure functions over a plain object, no Node imports.
import { parseHours, hoursText, validTz, freeSlots, dateKey } from "./slot.mjs";

const MIN = 60_000;
export const isEmail = (s) => /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]{2,}$/.test(s) && s.length <= 254;
const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, n);
const num = (v, lo, hi, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) && String(v).trim() !== "" ? Math.min(hi, Math.max(lo, n)) : dflt; };
export const rid = (len = 22) => { const a = new Uint8Array(len); globalThis.crypto.getRandomValues(a); return [...a].map((x) => "abcdefghijkmnpqrstuvwxyz23456789"[x % 32]).join(""); };

export function newState() { return { events: {}, bookings: {}, feedToken: rid(24), seq: 0 }; }

// form: {id, name, minutes, tz, hours, bufferBefore, bufferAfter, noticeMin, horizonDays, step, maxPerDay, location, description, closed}
export function saveEvent(state, f) {
  const errors = [], id = clean(f.id || f.name, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!id) errors.push("a name is required");
  const tz = clean(f.tz, 60) || "UTC";
  if (!validTz(tz)) errors.push(`unknown time zone "${tz}"`);
  const { hours, errors: he } = parseHours(f.hours);
  errors.push(...he);
  if (!Object.keys(hours).length && !he.length) errors.push("add some weekly hours, for example: mon-fri 09:00-17:00");
  if (errors.length) return { errors };
  const minutes = num(f.minutes, 5, 480, 30);
  const closed = String(f.closed || "").split(/[\s,]+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 400);
  const ev = { id, name: clean(f.name, 80) || id, minutes, tz, hours, step: num(f.step, 5, 480, minutes), bufferBefore: num(f.bufferBefore, 0, 240, 0), bufferAfter: num(f.bufferAfter, 0, 240, 0), noticeMin: num(f.noticeMin, 0, 60 * 24 * 90, 240), horizonDays: num(f.horizonDays, 1, 365, 30), maxPerDay: num(f.maxPerDay, 0, 100, 0), location: clean(f.location, 300), description: clean(f.description, 1000), closed, created: state.events[id]?.created ?? null };
  state.events[id] = ev;
  return { event: ev, errors: [] };
}

export const formFor = (ev) => ({ ...ev, hours: hoursText(ev.hours), closed: (ev.closed || []).join(" ") });

// Everything that blocks time: confirmed bookings (with the buffers their event type asks for) plus calendar-feed busy intervals.
export function busyList(state, external = []) {
  const out = external.map((b) => ({ start: b.start, end: b.end }));
  for (const b of Object.values(state.bookings)) if (b.status === "confirmed") out.push({ id: b.id, event: b.event, start: b.start, end: b.end, before: b.before, after: b.after });
  return out;
}

// Busy time from the calendar feed. A copy older than `maxAgeMs` (or none at all) is not trusted: block everything, so a dead feed
// cannot let a guest book over a meeting the host made elsewhere. The admin page shows why.
export function feedBusy(feed, now, { configured = true, maxAgeMs = 3_600_000 } = {}) {
  if (!configured) return [];
  return feed.at && now - feed.at <= maxAgeMs ? feed.busy : [{ start: 0, end: 8.64e15 }];
}

export function slotsFor(state, ev, now, external = [], ignore = null) { return freeSlots(ev, busyList(state, external), now, { ignore }); }

// Only a time freeSlots offers right now can be booked, so a forged or stale start is refused here, not in the page.
export function book(state, eventId, f, now, external = []) {
  const ev = state.events[eventId];
  if (!ev) return { error: "no such event", status: 404 };
  const email = clean(f.email, 254).toLowerCase(), name = clean(f.name, 80), start = Number(f.start);
  if (!name || !isEmail(email)) return { error: "a name and a valid email address are required", status: 400 };
  let old = null;
  if (f.reschedule) {
    old = Object.values(state.bookings).find((b) => b.token === f.reschedule && b.event === eventId && b.status === "confirmed" && b.email === email);
    if (!old) return { error: "that booking can no longer be rescheduled with this email address", status: 400 };
  }
  if (!Number.isInteger(start) || !slotsFor(state, ev, now, external, old?.id).includes(start)) return { error: "that time is no longer available; please pick another", status: 409 };
  if (Object.values(state.bookings).filter((b) => b.status === "confirmed" && b.email === email && b.start > now && b.id !== old?.id).length >= 5) return { error: "this address already has several upcoming bookings", status: 429 };
  if (old) { old.status = "cancelled"; old.cancelledAt = now; old.cancelledBy = "rescheduled"; }
  const id = `b${++state.seq}`;
  const b = { id, event: eventId, eventName: ev.name, start, end: start + ev.minutes * MIN, before: ev.bufferBefore, after: ev.bufferAfter, name, email, notes: clean(f.notes, 2000), tz: validTz(f.tz) ? f.tz : ev.tz, status: "confirmed", token: rid(), created: now, remindedAt: null, rescheduledFrom: old?.id ?? null };
  state.bookings[id] = b;
  return { booking: b, replaced: old };
}

export function cancel(state, b, by, now) {
  if (b.status !== "confirmed") return false;
  b.status = "cancelled"; b.cancelledAt = now; b.cancelledBy = by;
  return true;
}

export const byToken = (state, token) => Object.values(state.bookings).find((b) => b.token === token);

export function dueReminders(state, now, hoursAhead) {
  if (!hoursAhead) return [];
  return Object.values(state.bookings).filter((b) => b.status === "confirmed" && !b.remindedAt && b.start > now && b.start - now <= hoursAhead * 3600_000 && now - b.created > 30 * MIN);
}

export function purgeOlderThan(state, now, days) {
  if (!days) return 0;
  let n = 0;
  for (const [id, b] of Object.entries(state.bookings)) if (b.end < now - days * 86_400_000) { delete state.bookings[id]; n++; }
  return n;
}

export function summary(state, now) {
  const all = Object.values(state.bookings), live = all.filter((b) => b.status === "confirmed");
  const next7 = live.filter((b) => b.start > now && b.start < now + 7 * 86_400_000).length;
  const past = live.filter((b) => b.end <= now).length, cancelled = all.filter((b) => b.status === "cancelled").length;
  const total = live.length + cancelled;
  return { upcoming: live.filter((b) => b.start > now).length, next7, past, cancelled, cancelRate: total ? Math.round((cancelled / total) * 100) : null };
}

// Spreadsheet-formula-safe CSV.
const cell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(state) {
  const rows = [["id", "event", "start_utc", "end_utc", "name", "email", "status", "notes", "booked_at_utc"]];
  for (const b of Object.values(state.bookings).sort((a, c) => a.start - c.start)) rows.push([b.id, b.eventName, new Date(b.start).toISOString(), new Date(b.end).toISOString(), b.name, b.email, b.status, b.notes, new Date(b.created).toISOString()]);
  return `${rows.map((r) => r.map(cell).join(",")).join("\n")}\n`;
}

export { dateKey };
