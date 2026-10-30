// Babysitting Business Kit: the waitlist, peak nights and tentative holds. Pure functions
// over the desk's `waitlist` key; callers pass the date and the time (ms), so nothing here
// reads the clock.
//
//   waitlistOf(desk)                     the desk's waitlist with every field filled in
//   joinWaitlist(desk, fields, opts)     a request for a taken time becomes a waitlist entry
//   offerSlots(desk, { today, at })      cancelled sits (and peak nights now open to all)
//                                        with the waitlist in order and a drafted offer
//   offerTo / answerOffer                record that an offer went out, and the answer
//   peakNights(desk, today)              New Year's Eve, Valentine's Day, Halloween, Mother's
//                                        Day weekend, Christmas-party weekends (editable)
//   loyalty / regulars / priorityList    sits in the last 12 months; who gets first pick
//   priorityRules / announcement         the order in plain words; a note to regulars
//   placeHold / releaseHold / confirmHold / expireHolds
//                                        a 24- or 48-hour hold that cannot double-book and
//                                        lapses by itself
//   heldSpans(desk, { today, at })       held time for slots.mjs (open slots and week grid)
//   mergeWaitlist(server, incoming)      keeps entries families added through /book on sync
//
// Fairness: the order uses only sits in the last 12 months and the time someone joined.
// A family's beliefs, or anything else about who they are, play no part.

import { DAYS, toMin, dayOf, addDays, daysBetween, expandBookings, conflicts, newId } from "./engine.mjs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{1,2}:\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const num = (x, d = 0) => (Number.isFinite(Number(x)) && x !== "" && x !== null ? Number(x) : d);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const first = (name) => String(name || "").trim().split(/\s+/)[0] || "there";
const sign = (profile = {}) => (profile.name && profile.name !== "Your Name" ? ` ${profile.name}` : "");

export const WAITLIST_DEFAULTS = Object.freeze({
  minSits: 3, // sits in the last 12 months that make a family "regular"
  announceDays: 42, // a peak night is announced to regulars this many days before
  regularsDays: 7, // regulars-only days, then it opens to all
  offerHours: 12, // how long a waitlisted family has to answer an offer
  peakOn: false, // peak nights reserve time on /book only once the sitter turns them on
  publicJoin: true, // the /book page offers "join the waitlist"
});
export const HOLD_HOURS = [24, 48];
export const MAX_ENTRIES = 500;

const CLOSED = new Set(["booked", "declined", "removed"]);

export function waitlistOf(desk = {}) {
  const w = desk.waitlist && typeof desk.waitlist === "object" && !Array.isArray(desk.waitlist) ? desk.waitlist : {};
  const list = (x) => (Array.isArray(x) ? x.filter((e) => e && typeof e === "object") : []);
  const settings = { ...WAITLIST_DEFAULTS, ...(w.settings && typeof w.settings === "object" ? w.settings : {}) };
  for (const k of ["minSits", "announceDays", "regularsDays", "offerHours"]) settings[k] = Math.max(0, num(settings[k], WAITLIST_DEFAULTS[k]));
  return { entries: list(w.entries), holds: list(w.holds), nights: Array.isArray(w.nights) ? list(w.nights) : null, settings };
}
// The same, written back onto the desk so callers can mutate it in place.
export function ensureWaitlist(desk) {
  const w = waitlistOf(desk);
  desk.waitlist = { ...(desk.waitlist || {}), entries: w.entries, holds: w.holds, settings: w.settings, ...(w.nights ? { nights: w.nights } : {}) };
  return desk.waitlist;
}

// ---------- time helpers ----------

const spanOf = (date, start, end) => {
  const s = toMin(start);
  let e = toMin(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  if (e <= s) e += 1440;
  const b = daysBetween("2000-01-03", date) * 1440;
  return [b + s, b + e];
};
const overlap = (a, b) => (a && b ? Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0])) : 0);
export const shortDate = (date) => `${DAYS[dayOf(date)]} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8))}`;
const h12 = (hhmm) => {
  const m = toMin(hhmm);
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};
// "4-6pm", "11am-2pm", "6pm-1am"
export function rangeText(start, end) {
  const a = h12(start), b = h12(end);
  return a.slice(-2) === b.slice(-2) && toMin(end) > toMin(start) ? `${a.slice(0, -2)}-${b}` : `${a}-${b}`;
}
export const whenText = (x) => `${shortDate(x.date)}, ${rangeText(x.start, x.end)}`;
// "Mon 6pm" for a deadline, in the sitter's time zone when given.
export function deadlineText(ms, tz) {
  const d = new Date(ms);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz || undefined, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hourCycle: "h12" }).formatToParts(d);
  const g = (t) => parts.find((p) => p.type === t)?.value || "";
  const min = g("minute") === "00" ? "" : `:${g("minute")}`;
  return `${g("weekday")} ${g("month")} ${g("day")}, ${g("hour")}${min}${g("dayPeriod").toLowerCase()}`;
}

// ---------- waitlist entries ----------

/**
 * A request for a time that is taken. `fields`: name and contact (or familyId), date,
 * start, end, optional kids and notes. Returns { ok, entry } or { ok: false, why }; the
 * caller adds the entry (or use addToWaitlist).
 */
export function joinWaitlist(desk, fields = {}, { today, at = Date.parse(`${today}T12:00:00Z`), id = newId("wait"), source = "app" } = {}) {
  const fam = fields.familyId ? (desk.families || []).find((f) => f.id === fields.familyId) : null;
  const name = String(fields.name || fam?.contactName || fam?.name || "").trim().slice(0, 120);
  const contact = String(fields.contact || fam?.contact || "").trim().slice(0, 200);
  if (!name || (!contact && !fam)) return { ok: false, why: "Please include your name and a phone number or email." };
  const date = String(fields.date || "").trim(), start = String(fields.start || "").trim(), end = String(fields.end || "").trim();
  if (!DATE.test(date) || !TIME.test(start) || !TIME.test(end) || !spanOf(date, start, end)) return { ok: false, why: "Please pick a day and a start and end time." };
  if (today && date < today) return { ok: false, why: "That day has already passed." };
  if (today && daysBetween(today, date) > 400) return { ok: false, why: "That is more than a year away. Please ask closer to the date." };
  const w = waitlistOf(desk);
  const key = (e) => (e.familyId ? `f:${e.familyId}` : `c:${String(e.contact || "").toLowerCase().replace(/[^a-z0-9@.]/g, "")}`);
  const me = key({ familyId: fam?.id, contact });
  if (w.entries.some((e) => !CLOSED.has(e.status) && e.date === date && key(e) === me)) return { ok: false, why: "You're already on the waitlist for that day." };
  if (w.entries.filter((e) => !CLOSED.has(e.status)).length >= MAX_ENTRIES) return { ok: false, why: "The waitlist is full right now. Please get in touch directly." };
  const kids = Array.isArray(fields.kids) ? fields.kids : String(fields.kids || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return {
    ok: true,
    entry: { id, name, contact, familyId: fam?.id || "", date, start, end, kids: kids.slice(0, 8).map((k) => String(k).slice(0, 40)), notes: String(fields.notes || "").slice(0, 1000), created: new Date(at).toISOString(), source, status: "waiting", passed: [] },
  };
}
export function addToWaitlist(desk, fields, opts) {
  const r = joinWaitlist(desk, fields, opts);
  if (r.ok) ensureWaitlist(desk).entries.push(r.entry);
  return r;
}

// Open entries for one day, in the order they joined.
export const waitingOn = (desk, date) => waitlistOf(desk).entries.filter((e) => e.date === date && !CLOSED.has(e.status)).sort((a, b) => String(a.created).localeCompare(String(b.created)));
export function placeInLine(desk, entryId) {
  const e = waitlistOf(desk).entries.find((x) => x.id === entryId);
  return e ? waitingOn(desk, e.date).findIndex((x) => x.id === entryId) + 1 : 0;
}

export function joinedMessage(entry, place, profile = {}) {
  return `Hi ${first(entry.name)}! I'm booked for ${whenText(entry)}, but you're on my waitlist${place ? ` (number ${place} in line)` : ""}. If it opens up I'll message you right away, and you'll have a little while to say yes before I ask the next family.${sign(profile)}`.trim();
}

// ---------- loyalty and peak nights ----------

/** Sits per family in the 12 months before `today` (cancelled and skipped dates don't count). */
export function loyalty(desk, today) {
  const from = addDays(today, -365);
  const out = new Map();
  for (const b of expandBookings(desk.bookings || [])) {
    if (!b.familyId || b.status === "cancelled" || b.date < from || b.date >= today) continue;
    const o = out.get(b.familyId) || { familyId: b.familyId, sits: 0, last: "", firstSit: b.date };
    o.sits++;
    if (b.date > o.last) o.last = b.date;
    if (b.date < o.firstSit) o.firstSit = b.date;
    out.set(b.familyId, o);
  }
  return out;
}
const byLoyalty = (a, b) => b.sits - a.sits || String(b.last).localeCompare(String(a.last)) || String(a.name).localeCompare(String(b.name));

/** Families with at least `minSits` sits in the last 12 months, most sits first. */
export function regulars(desk, today) {
  const { minSits } = waitlistOf(desk).settings;
  const fam = Object.fromEntries((desk.families || []).map((f) => [f.id, f]));
  return [...loyalty(desk, today).values()].filter((x) => fam[x.familyId] && x.sits >= Math.max(1, minSits)).map((x) => ({ ...x, name: fam[x.familyId].name || "", contactName: fam[x.familyId].contactName || "", contact: fam[x.familyId].contact || "" })).sort(byLoyalty);
}

// The nth weekday (0 = Sun) of a month, as YYYY-MM-DD.
function nthWeekday(year, month, weekday, n) {
  const d1 = `${year}-${String(month).padStart(2, "0")}-01`;
  return addDays(d1, ((weekday - dayOf(d1) + 7) % 7) + 7 * (n - 1));
}

/**
 * Busy nights for a year. Dates are calendar facts (Mother's Day is the second Sunday
 * of May); the times are a starting point for the sitter to edit.
 */
export function defaultPeakNights(year) {
  const y = Number(year);
  const md = nthWeekday(y, 5, 0, 2);
  const xmasSats = [1, 2, 3].map((n) => nthWeekday(y, 12, 6, n)).filter((d) => d <= `${y}-12-20`).slice(-2);
  return [
    { id: `vday-${y}`, name: "Valentine's Day", date: `${y}-02-14`, start: "17:00", end: "23:00" },
    { id: `mom-fri-${y}`, name: "Mother's Day weekend (Friday)", date: addDays(md, -2), start: "17:00", end: "23:00" },
    { id: `mom-sat-${y}`, name: "Mother's Day weekend (Saturday)", date: addDays(md, -1), start: "17:00", end: "23:00" },
    { id: `halloween-${y}`, name: "Halloween", date: `${y}-10-31`, start: "16:00", end: "22:00" },
    ...xmasSats.flatMap((sat) => [
      { id: `xmas-fri-${sat}`, name: "Christmas-party weekend (Friday)", date: addDays(sat, -1), start: "18:00", end: "23:30" },
      { id: `xmas-sat-${sat}`, name: "Christmas-party weekend (Saturday)", date: sat, start: "18:00", end: "23:30" },
    ]),
    { id: `nye-${y}`, name: "New Year's Eve", date: `${y}-12-31`, start: "18:00", end: "01:00" },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

/** When regulars may book a night and when it opens to everyone. */
export function peakPhase(night, today, settings = WAITLIST_DEFAULTS) {
  const regularsFrom = addDays(night.date, -Math.round(num(night.announceDays, settings.announceDays)));
  const openFrom = addDays(regularsFrom, Math.round(num(night.regularsDays, settings.regularsDays)));
  const phase = today > night.date ? "past" : today < regularsFrom ? "upcoming" : today < openFrom ? "regulars" : "open";
  return { regularsFrom, openFrom: openFrom > night.date ? night.date : openFrom, phase };
}

/** The sitter's peak nights (their own list, or the defaults) from today, about a year out. */
export function peakNights(desk, today) {
  const w = waitlistOf(desk);
  const y = Number(today.slice(0, 4));
  const list = w.nights || [...defaultPeakNights(y), ...defaultPeakNights(y + 1)];
  return list
    .filter((n) => DATE.test(n.date || "") && TIME.test(n.start || "") && TIME.test(n.end || "") && n.date >= today && daysBetween(today, n.date) <= 400)
    .map((n) => ({ ...n, ...peakPhase(n, today, w.settings) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
export const peakOn = (desk, date, today) => peakNights(desk, today).find((n) => n.date === date) || null;

/**
 * Who gets first pick for a peak night: regular families by sits in the last 12 months
 * (ties: the most recent sit), then the waitlist for that day in the order people joined.
 * Each row carries its reason in plain words.
 */
export function priorityList(desk, night, today) {
  const regs = regulars(desk, today);
  const seen = new Set(regs.map((r) => r.familyId));
  const rows = regs.map((r, i) => ({ rank: i + 1, kind: "regular", familyId: r.familyId, name: r.name, contactName: r.contactName, contact: r.contact, sits: r.sits, reason: `${r.sits} sit${r.sits === 1 ? "" : "s"} in the last 12 months${i > 0 && regs[i - 1].sits === r.sits ? `; tied, and their last sit was ${r.last}` : ""}` }));
  let place = 0;
  for (const e of waitingOn(desk, night.date)) {
    place++;
    if (e.familyId && seen.has(e.familyId)) continue;
    rows.push({ rank: rows.length + 1, kind: "waitlist", entryId: e.id, familyId: e.familyId || "", name: e.name, contact: e.contact, reason: `joined the waitlist on ${String(e.created).slice(0, 10)} (number ${place} in line)` });
  }
  return rows;
}

/** The order, in plain words, for the sitter's policies page or a message. */
export function priorityRules(desk) {
  const s = waitlistOf(desk).settings;
  const min = Math.max(1, s.minSits);
  return [
    `Busy nights (like New Year's Eve and Valentine's Day) go to my regular families first. A regular family is one I've sat for at least ${min} time${min === 1 ? "" : "s"} in the last 12 months.`,
    `I tell regular families about each busy night about ${s.announceDays} days ahead. For the first ${s.regularsDays} day${s.regularsDays === 1 ? "" : "s"}, only they can book it. If two regular families want the same night, the one I've sat for more often in the last 12 months gets it; if that's a tie, the one I sat for most recently.`,
    `After that, the night is open to everyone, and anyone who asked for a time I couldn't take is offered it in the order they joined my waitlist.`,
    `When a sit is cancelled, I offer that time to the waitlist in order. Each family has ${s.offerHours} hours to say yes before I ask the next one.`,
    `That's the whole rule: how often we've worked together this past year, then who asked first. Nothing else about a family counts.`,
  ];
}

/** A note to regular families before a peak night opens to everyone. */
export function announcement(desk, night, today, family) {
  const p = desk.profile || {};
  const { openFrom } = peakPhase(night, today, waitlistOf(desk).settings);
  const hol = (p.holidays || []).includes(night.date.slice(5)) && num(p.rates?.holidayMultiplier, 1) > 1;
  const hi = family ? `Hi ${first(family.contactName || family.name)}!` : "Hi friends!";
  return [
    `${hi} ${night.name} is ${shortDate(night.date)}, and I'm taking bookings for ${rangeText(night.start, night.end)}.`,
    `You're one of my regular families, so you get first pick until ${shortDate(openFrom)}. After that I'll open it to everyone.`,
    hol ? `My holiday rate applies that night (${num(p.rates.holidayMultiplier)}x my usual rate).` : "",
    `If more than one family asks for the same time, it goes to whoever I've sat for most this past year. Just reply with the times you'd like.${sign(p)}`,
  ].filter(Boolean).join(" ").trim();
}

// ---------- offers: cancelled sits and peak nights ----------

const busyBookings = (desk) => expandBookings(desk.bookings || []).filter((b) => b.status !== "cancelled");
const isTaken = (desk, slot, ignoreKey) => {
  const sp = spanOf(slot.date, slot.start, slot.end);
  return busyBookings(desk).some((b) => b.key !== ignoreKey && overlap(spanOf(b.date, b.start, b.end), sp) > 0);
};

// Order candidates: on a peak night still in its regulars window, regular families on the
// waitlist go first by sits; otherwise (and after them) the order people joined.
function orderCandidates(desk, slot, today) {
  const sp = spanOf(slot.date, slot.start, slot.end);
  let list = waitingOn(desk, slot.date).filter((e) => overlap(spanOf(e.date, e.start, e.end), sp) > 0 && !(e.passed || []).includes(slot.key));
  const night = peakOn(desk, slot.date, today);
  if (night && night.phase !== "open") {
    const loy = loyalty(desk, today);
    const min = Math.max(1, waitlistOf(desk).settings.minSits);
    const sits = (e) => (e.familyId && (loy.get(e.familyId)?.sits || 0) >= min ? loy.get(e.familyId).sits : 0);
    list = list.map((e, i) => ({ e, i, s: sits(e) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.e);
  }
  return list.map((e) => {
    const es = spanOf(e.date, e.start, e.end);
    return { entry: e, fits: es[0] >= sp[0] && es[1] <= sp[1] };
  });
}

export function offerMessage(entry, slot, profile = {}, { until, tz } = {}) {
  const fits = (() => { const a = spanOf(entry.date, entry.start, entry.end), b = spanOf(slot.date, slot.start, slot.end); return a[0] >= b[0] && a[1] <= b[1]; })();
  const time = fits ? whenText(entry) : whenText(slot);
  return [
    `Hi ${first(entry.name)}! Good news: a spot opened up on ${time}.`,
    fits ? "You're next on my waitlist, so it's yours if you'd still like it." : `That's a little different from the time you asked for (${rangeText(entry.start, entry.end)}), but you're next on my waitlist, so it's yours if it works.`,
    until ? `Could you let me know by ${deadlineText(until, tz)}? After that I'll offer it to the next family.` : "Could you let me know soon? After that I'll offer it to the next family.",
  ].join(" ") + sign(profile);
}

/**
 * Times the waitlist can be offered: cancelled sits (and skipped weekly dates) from today
 * on that nobody has taken since, plus peak nights that are open to all with nothing
 * booked. Each: { key, kind, date, start, end, label, candidates, offered, next, message }.
 */
export function offerSlots(desk, { today, at = Date.parse(`${today}T12:00:00Z`), tz } = {}) {
  const w = waitlistOf(desk);
  const fam = Object.fromEntries((desk.families || []).map((f) => [f.id, f]));
  const slots = [];
  const seen = new Set();
  for (const b of expandBookings(desk.bookings || [])) {
    if (b.status !== "cancelled" || b.date < today || isTaken(desk, b, b.key)) continue;
    const k = `${b.date}|${b.start}|${b.end}`;
    if (seen.has(k)) continue;
    seen.add(k);
    slots.push({ key: `sit:${b.key}`, kind: "cancelled", date: b.date, start: b.start, end: b.end, label: `${fam[b.familyId]?.name || "A sit"} cancelled` });
  }
  for (const n of peakNights(desk, today)) {
    if (n.phase !== "open" || isTaken(desk, n)) continue;
    slots.push({ key: `peak:${n.id}`, kind: "peak", date: n.date, start: n.start, end: n.end, label: `${n.name}, open to everyone since ${shortDate(n.openFrom)}` });
  }
  return slots.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).map((s) => {
    const candidates = orderCandidates(desk, s, today);
    const offered = candidates.find((c) => c.entry.status === "offered" && c.entry.offer?.slotKey === s.key);
    const next = offered ? null : candidates.find((c) => c.entry.status === "waiting") || null;
    const until = at + w.settings.offerHours * 36e5;
    return { ...s, candidates, offered: offered || null, next, message: next ? offerMessage(next.entry, s, desk.profile, { until, tz }) : "" };
  });
}

/** Record that an offer went out (the sitter sent the drafted message). */
export function offerTo(desk, entryId, slot, { at }) {
  const w = ensureWaitlist(desk);
  const e = w.entries.find((x) => x.id === entryId);
  if (!e || e.status !== "waiting") throw new Error("That family is not waiting for a spot");
  e.status = "offered";
  e.offer = { slotKey: slot.key, date: slot.date, start: slot.start, end: slot.end, at: new Date(at).toISOString(), until: new Date(at + w.settings.offerHours * 36e5).toISOString() };
  return e;
}

/**
 * The family's answer. Yes books the sit (a new family is made for someone who isn't one
 * yet); no, or no answer, passes the slot to the next in line. Returns { entry, booking? }.
 */
export function answerOffer(desk, entryId, yes, { today, bookingId = newId("boo"), newFamilyId = newId("fam") } = {}) {
  const w = ensureWaitlist(desk);
  const e = w.entries.find((x) => x.id === entryId);
  if (!e || e.status !== "offered" || !e.offer) throw new Error("No open offer for that family");
  if (!yes) {
    e.passed = [...new Set([...(e.passed || []), e.offer.slotKey])];
    e.status = "waiting";
    e.offer = null;
    return { entry: e };
  }
  let fid = e.familyId && (desk.families || []).some((f) => f.id === e.familyId) ? e.familyId : "";
  if (!fid) {
    fid = newFamilyId;
    desk.families.push({ id: fid, name: `${String(e.name).split(" ").slice(-1)[0]} family`, contactName: e.name, contact: e.contact, kids: (e.kids || []).map((a) => ({ name: "", allergies: `age ${a}` })), notes: e.notes || "" });
  }
  const sp = spanOf(e.date, e.start, e.end), os = spanOf(e.offer.date, e.offer.start, e.offer.end);
  const fits = sp[0] >= os[0] && sp[1] <= os[1];
  const booking = { id: bookingId, familyId: fid, date: e.offer.date, start: fits ? e.start : e.offer.start, end: fits ? e.end : e.offer.end, kids: Math.max(1, (e.kids || []).length), status: "scheduled", bookedOn: today, notes: `From the waitlist. ${e.notes || ""}`.trim() };
  desk.bookings.push(booking);
  Object.assign(e, { status: "booked", familyId: fid, bookingId, closed: today });
  return { entry: e, booking };
}

// ---------- holds ----------

const asSits = (desk, at, skipHold) => [
  ...(desk.bookings || []),
  ...(desk.leads || []).filter((l) => l.status === "requested" && l.requested && DATE.test(l.requested.date || "")).map((l) => ({ id: `req:${l.id}`, date: l.requested.date, start: l.requested.start, end: l.requested.end, status: "scheduled" })),
  ...activeHolds(desk, at).filter((h) => h.id !== skipHold).map((h) => ({ id: `hold:${h.id}`, familyId: h.familyId, date: h.date, start: h.start, end: h.end, status: "scheduled" })),
];

/** Holds still in force at `at` (ms). Without `at`, every hold not expired, released or booked. */
export function activeHolds(desk, at) {
  return waitlistOf(desk).holds.filter((h) => h.status === "held" && (at === undefined || Date.parse(h.expiresAt) > at));
}

/**
 * Pencil a family in for 24 or 48 hours. Refused if it overlaps (or sits closer than the
 * travel buffer to) a sit, a pending /book request or another hold. Returns
 * { ok, hold, message } or { ok: false, why: [...] }; the hold is added to the desk.
 */
export function placeHold(desk, fields = {}, { at, today, id = newId("hold"), bufferMin = 30 } = {}) {
  const hours = Number(fields.hours);
  if (!HOLD_HOURS.includes(hours)) return { ok: false, why: ["A hold lasts 24 or 48 hours."] };
  const date = String(fields.date || ""), start = String(fields.start || ""), end = String(fields.end || "");
  if (!DATE.test(date) || !TIME.test(start) || !TIME.test(end) || !spanOf(date, start, end)) return { ok: false, why: ["Pick a day and a start and end time."] };
  if (today && date < today) return { ok: false, why: ["That day has already passed."] };
  const fam = (desk.families || []).find((f) => f.id === fields.familyId);
  const name = String(fields.name || fam?.name || "").trim().slice(0, 120);
  if (!name) return { ok: false, why: ["Who is the hold for?"] };
  const probe = { id: "__hold", familyId: fam?.id || "", date, start, end, status: "scheduled" };
  const clash = conflicts([...asSits(desk, at), probe], bufferMin).filter((c) => c.a.id === "__hold" || c.b.id === "__hold");
  if (clash.length) {
    return { ok: false, why: clash.map((c) => { const o = c.a.id === "__hold" ? c.b : c.a; const what = String(o.id).startsWith("hold:") ? "another hold" : String(o.id).startsWith("req:") ? "a booking request" : "a sit"; return c.kind === "overlap" ? `overlaps ${what} (${o.date} ${o.start}-${o.end})` : `only ${c.minutes} min from ${what} at ${o.start}`; }) };
  }
  const hold = { id, familyId: fam?.id || "", name, contactName: String(fam?.contactName || fields.name || "").slice(0, 120), contact: String(fields.contact || fam?.contact || "").slice(0, 200), date, start, end, hours, created: new Date(at).toISOString(), expiresAt: new Date(at + hours * 36e5).toISOString(), status: "held", notes: String(fields.notes || "").slice(0, 500) };
  ensureWaitlist(desk).holds.push(hold);
  return { ok: true, hold };
}
export function holdMessage(hold, profile = {}, tz) {
  return `Hi ${first(fam1(hold))}! I've pencilled you in for ${whenText(hold)}. I'll hold it for you until ${deadlineText(Date.parse(hold.expiresAt), tz)}; just let me know by then and it's yours. After that I'll open the time up again.${sign(profile)}`;
}
const fam1 = (h) => h.contactName || h.name;

export function releaseHold(desk, id) {
  const h = ensureWaitlist(desk).holds.find((x) => x.id === id);
  if (h && h.status === "held") h.status = "released";
  return h || null;
}
/** The family said yes: the hold becomes a scheduled sit. */
export function confirmHold(desk, id, { at, today, bookingId = newId("boo") } = {}) {
  const h = ensureWaitlist(desk).holds.find((x) => x.id === id);
  if (!h || h.status !== "held") throw new Error("That hold is not active");
  if (at !== undefined && Date.parse(h.expiresAt) <= at) { h.status = "expired"; throw new Error("That hold has expired"); }
  if (!h.familyId) throw new Error("Add this family in the Families tab first, then pick them on the hold");
  const booking = { id: bookingId, familyId: h.familyId, date: h.date, start: h.start, end: h.end, kids: 1, status: "scheduled", bookedOn: today, notes: h.notes || "" };
  desk.bookings.push(booking);
  Object.assign(h, { status: "booked", bookingId });
  return booking;
}

/** Mark lapsed holds expired and lapsed offers passed. Returns how many changed. */
export function expireHolds(desk, at) {
  if (!desk.waitlist) return 0;
  const w = ensureWaitlist(desk);
  let n = 0;
  for (const h of w.holds) if (h.status === "held" && !(Date.parse(h.expiresAt) > at)) { h.status = "expired"; n++; }
  for (const e of w.entries) {
    if (e.status === "offered" && e.offer && !(Date.parse(e.offer.until) > at)) {
      e.passed = [...new Set([...(e.passed || []), e.offer.slotKey])];
      e.status = "waiting";
      e.offer = null;
      n++;
    }
  }
  return n;
}

/**
 * Time slots.mjs should treat as taken: active holds, and (once the sitter turns peak
 * nights on) each peak night until it opens to everyone. Labels carry no family details
 * beyond the hold's own name, which only the app shows.
 */
export function heldSpans(desk, { today, at } = {}) {
  if (!desk || !desk.waitlist) return [];
  const w = waitlistOf(desk);
  const out = activeHolds(desk, at).map((h) => ({ kind: "hold", id: h.id, date: h.date, start: h.start, end: h.end, label: `Hold: ${h.name}`, expiresAt: h.expiresAt }));
  if (w.settings.peakOn && today && DATE.test(today)) {
    for (const n of peakNights(desk, today)) if (n.phase !== "open") out.push({ kind: "peak", id: n.id, date: n.date, start: n.start, end: n.end, label: `${n.name}: regulars first until ${shortDate(n.openFrom)}` });
  }
  return out;
}

// ---------- the public /book page's waitlist form, and sync ----------

/** A form for the /book page: a family asks to be told if a taken time opens up. */
export function waitlistSection(desk, { action = "/book/waitlist", today = "", maxDate = "" } = {}) {
  const w = waitlistOf(desk);
  if (!w.settings.publicJoin) return "";
  const min = today ? ` min="${esc(today)}"` : "", max = maxDate ? ` max="${esc(maxDate)}"` : "";
  return `<section class="card"><h2>Time you want is taken?</h2><p>Join the waitlist for it. If it opens up you'll get a message, in the order people joined. Busy nights go to regular families first, then to the waitlist.</p><form method="post" action="${esc(action)}">
<label for="wd">Day</label><input id="wd" name="date" type="date" required${min}${max}>
<label for="wst">Start</label><input id="wst" name="start" type="time" required>
<label for="wen">End</label><input id="wen" name="end" type="time" required>
<label for="wn">Your name</label><input id="wn" name="name" required maxlength="120">
<label for="wc">Phone or email</label><input id="wc" name="contact" required maxlength="200">
<label for="wk">Children's ages</label><input id="wk" name="kids" maxlength="200">
<label class="hp" for="whp">Leave this empty</label><input class="hp" id="whp" name="website" tabindex="-1" autocomplete="off">
<button type="submit">Join the waitlist</button></form></section>`;
}

/**
 * PUT /api/desk: the app's waitlist replaces the server's, except entries families added
 * through /book since the last sync, which are kept. Old closed entries are trimmed.
 */
export function mergeWaitlist(server, incoming, today = "") {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return server && typeof server === "object" ? server : undefined;
  const s = waitlistOf({ waitlist: server }), i = waitlistOf({ waitlist: incoming });
  const ids = new Set(i.entries.map((e) => e.id));
  const cutoff = today ? addDays(today, -180) : "";
  const keep = (e) => !(cutoff && (CLOSED.has(e.status) || e.date < today) && String(e.closed || e.date) < cutoff);
  const holdIds = new Set(i.holds.map((h) => h.id));
  return {
    ...incoming,
    entries: [...i.entries, ...s.entries.filter((e) => !ids.has(e.id))].filter(keep),
    holds: [...i.holds, ...s.holds.filter((h) => !holdIds.has(h.id))].filter((h) => !cutoff || h.date >= cutoff),
    settings: i.settings,
  };
}
