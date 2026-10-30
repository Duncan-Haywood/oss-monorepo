// Babysitting Business Kit: open slots, openings text, the week grid and booking
// requests. Pure functions over the same desk as engine.mjs; callers pass the date
// (and, for today, the minute of the day) so nothing here reads the clock.
//
//   openSlots(desk, { from, weeks })      free windows per day: weekly availability minus
//                                         booked sits (with a travel buffer each side) and
//                                         pending requests, at least the minimum-hours long
//   openingsText(days, { from })          "Openings this week: Tue 3-10pm, Sat all day"
//   weekGrid(desk, weekStart)             7 columns of sits as blocks, with allergies
//   toggleSkip(booking, date)             skip (or restore) one date of a weekly repeat
//   bookingRequest(fields, desk, today)   a family's request from /book becomes a lead
//                                         with status "requested"; it is never a booking
//   approveRequest(desk, leadId)          the sitter's yes: a family and a booking
//   bookPage(desk, days, opts)            the public /book page: times only, no families

import { DAYS, toMin, fmtMin, dayOf, addDays, daysBetween, parseWeekly, expandBookings, leadFromForm, canTake, newId } from "./engine.mjs";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (x, d = 0) => (Number.isFinite(Number(x)) && x !== "" && x !== null ? Number(x) : d);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EPOCH = "2000-01-03"; // a Monday; absolute minutes count from it
const base = (date) => daysBetween(EPOCH, date) * 1440;

export const DEFAULT_BUFFER_MIN = 30;
export const bufferOf = (profile = {}) => Math.max(0, num(profile.travelBufferMin, DEFAULT_BUFFER_MIN));

// The minute of the day at `ms` in time zone `tz` (the server's "now").
export function localMinutes(ms, tz) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz || undefined, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  return get("hour") * 60 + get("minute");
}

// Monday of the week that holds `date`.
export const weekStart = (date) => addDays(date, -((dayOf(date) + 6) % 7));

function merge(list) {
  const s = list.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function subtract(windows, busy) {
  let out = windows.map((w) => [...w]);
  for (const [bs, be] of busy) {
    const next = [];
    for (const [s, e] of out) {
      if (be <= s || bs >= e) { next.push([s, e]); continue; }
      if (bs > s) next.push([s, bs]);
      if (be < e) next.push([be, e]);
    }
    out = next;
  }
  return out;
}

const spanAbs = (date, start, end) => {
  const s = toMin(start);
  let e = toMin(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  if (e <= s) e += 1440;
  return [base(date) + s, base(date) + e];
};

// Requests a family sent through /book that the sitter has not answered yet. They hold
// their time so two families are not offered the same evening.
export const pendingRequests = (desk) => (desk.leads || []).filter((l) => l.status === "requested" && l.requested && DATE.test(l.requested.date || ""));

/**
 * Free windows for each day from `from` for `weeks` weeks (from through the Sunday of
 * the last week). Each day: { date, day, windows: [{ start, end, minutes, full }] },
 * where start/end are "HH:MM" (end may pass midnight, shown as the next morning's time
 * with `overnight`), and `full` means nothing cut into that availability window.
 */
export function openSlots(desk, { from, weeks = 1, bufferMin, minHours, nowMin, holdRequests = true } = {}) {
  if (!DATE.test(String(from || ""))) throw new Error("openSlots needs a from date (YYYY-MM-DD)");
  const p = desk.profile || {};
  const buf = bufferMin ?? bufferOf(p);
  const minLen = Math.max(15, Math.round(num(minHours ?? p.rates?.minimumHours, 0) * 60));
  const weekly = parseWeekly(p.availability).slots;
  const last = addDays(weekStart(from), 7 * Math.max(1, Math.round(num(weeks, 1))) - 1);
  const busy = [];
  for (const b of expandBookings(desk.bookings || [])) {
    if (b.status === "cancelled" || b.date < addDays(from, -1) || b.date > addDays(last, 1)) continue;
    const sp = spanAbs(b.date, b.start, b.end);
    if (sp) busy.push([sp[0] - buf, sp[1] + buf]);
  }
  if (holdRequests) for (const l of pendingRequests(desk)) {
    const sp = spanAbs(l.requested.date, l.requested.start, l.requested.end);
    if (sp) busy.push([sp[0] - buf, sp[1] + buf]);
  }
  const days = [];
  for (let d = from; d <= last; d = addDays(d, 1)) {
    const b0 = base(d);
    let avail = merge(weekly[dayOf(d)].map(([s, e]) => [b0 + s, b0 + e]));
    const full = avail.map((w) => [...w]);
    let cut = busy;
    if (d === from && Number.isFinite(nowMin)) cut = [...busy, [b0 - 1440, b0 + nowMin]];
    avail = subtract(avail, cut).filter(([s, e]) => e - s >= minLen);
    days.push({
      date: d,
      day: DAYS[dayOf(d)],
      windows: avail.map(([s, e]) => ({ start: fmtMin(s - b0), end: fmtMin((e - b0) % 1440), minutes: e - s, overnight: e - b0 > 1440, full: full.some(([fs, fe]) => fs === s && fe === e) })),
    });
  }
  return days;
}

// 15:00 -> "3pm", 15:30 -> "3:30pm", 0:00 -> "12am".
export function fmt12(hhmm) {
  const m = toMin(hhmm);
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  return `${h % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}
export function fmtRange(start, end) {
  const a = fmt12(start), b = fmt12(end);
  const sa = a.slice(-2), sb = b.slice(-2);
  return sa === sb && toMin(end) > toMin(start) ? `${a.slice(0, -2)}-${b}` : `${a}-${b}`;
}
const ALL_DAY_MIN = 10 * 60;
const windowText = (w) => (w.full && w.minutes >= ALL_DAY_MIN ? "all day" : fmtRange(w.start, w.end));
const shortDate = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8))}`;

/**
 * Text for a group chat or a Facebook post, one line per week:
 *   "Openings this week: Tue 3-10pm, Thu 3-6pm, Sat all day"
 * Weeks after the first carry dates ("Tue Nov 10 3-10pm") so nobody guesses which Tuesday.
 */
export function openingsText(days, { from = days[0]?.date, closing = "Message me to book!", bookUrl = "" } = {}) {
  const w0 = weekStart(from);
  const weeks = new Map();
  for (const d of days) {
    const k = weekStart(d.date);
    if (!weeks.has(k)) weeks.set(k, []);
    if (d.windows.length) weeks.get(k).push(d);
  }
  const lines = [];
  for (const [k, list] of weeks) {
    const n = daysBetween(w0, k) / 7;
    const label = n === 0 ? "this week" : n === 1 ? "next week" : `the week of ${shortDate(k)}`;
    if (!list.length) { lines.push(`I'm fully booked ${label}.`); continue; }
    lines.push(`Openings ${label}: ${list.map((d) => `${d.day}${n > 0 ? ` ${shortDate(d.date)}` : ""} ${d.windows.map(windowText).join(" & ")}`).join(", ")}`);
  }
  if (!lines.length) return "";
  return [...lines, [closing, bookUrl ? `Pick a time: ${bookUrl}` : ""].filter(Boolean).join(" ")].join("\n");
}

/**
 * The Schedule tab's week view. Blocks are placed as fractions (top, height) of the
 * visible hours, which cover the week's availability and sits (at least 7am-10pm).
 * Allergies come from the family's kids; skipped repeats are kept, marked skipped.
 * With `today`, days before it show no open time.
 */
export function weekGrid(desk, start, { bufferMin, today = "" } = {}) {
  const ws = weekStart(start);
  const fam = Object.fromEntries((desk.families || []).map((f) => [f.id, f]));
  const end = addDays(ws, 6);
  const sits = expandBookings(desk.bookings || []).filter((b) => b.date >= ws && b.date <= end);
  const weekly = parseWeekly(desk.profile?.availability).slots;
  let lo = 7 * 60, hi = 22 * 60;
  for (let i = 0; i < 7; i++) for (const [s, e] of weekly[i]) { lo = Math.min(lo, s); hi = Math.max(hi, Math.min(e, 1440)); }
  for (const b of sits) { const s = toMin(b.start), e = toMin(b.end); if (Number.isFinite(s)) lo = Math.min(lo, s); hi = Math.max(hi, Number.isFinite(e) && e > s ? e : 1440); }
  lo = Math.floor(lo / 60) * 60; hi = Math.min(1440, Math.ceil(hi / 60) * 60);
  const open = openSlots(desk, { from: ws, weeks: 1, bufferMin, holdRequests: true });
  const pos = (s, e) => ({ top: Math.max(0, (s - lo) / (hi - lo)), height: Math.max(0.02, (Math.min(e, hi) - Math.max(s, lo)) / (hi - lo)) });
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(ws, i);
    const blocks = sits.filter((b) => b.date === date).map((b) => {
      const s = toMin(b.start);
      let e = toMin(b.end);
      if (e <= s) e += 1440;
      const f = fam[b.familyId] || {};
      return {
        key: b.key, id: b.id, date, occurrence: b.occurrence, repeats: Math.round(num(b.repeatWeeks, 1)) > 1,
        family: f.name || "", start: b.start, end: b.end, kids: b.kids, status: b.status,
        skipped: (b.skip || []).includes(date), overnight: e > 1440,
        allergies: (f.kids || []).filter((k) => k && String(k.allergies || "").trim() && !/^age /.test(k.allergies)).map((k) => (k.name ? `${k.name}: ${k.allergies}` : k.allergies)),
        ...pos(s, e),
      };
    });
    const free = date < today ? [] : open[i].windows.map((w) => { const s = toMin(w.start); return { ...w, ...pos(s, s + w.minutes) }; });
    days.push({ date, day: DAYS[dayOf(date)], blocks, open: free });
  }
  return { start: ws, from: fmtMin(lo), to: hi === 1440 ? "24:00" : fmtMin(hi), hours: (hi - lo) / 60, days };
}

// Skip one date of a weekly repeat, or restore it if it is already skipped. Returns a
// new booking; only dates that fall on the repeat are accepted.
export function toggleSkip(booking, date) {
  const n = Math.max(1, Math.round(num(booking.repeatWeeks, 1)));
  const k = daysBetween(booking.date, date);
  if (n < 2 || k < 0 || k % 7 !== 0 || k / 7 >= n) throw new Error(`${date} is not one of this sit's weekly dates`);
  const skip = new Set(booking.skip || []);
  if (skip.has(date)) skip.delete(date); else skip.add(date);
  return { ...booking, skip: [...skip].sort() };
}

// Find the open window that holds [start, end] on `date`, or say why not.
export function fitsOpenSlot(days, date, start, end) {
  const day = days.find((d) => d.date === date);
  if (!day) return { ok: false, why: "That day is not on the booking page." };
  const s = toMin(start);
  let e = toMin(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return { ok: false, why: "Please give a start and end time." };
  if (e <= s) e += 1440;
  const w = day.windows.find((x) => { const ws = toMin(x.start); return ws <= s && ws + x.minutes >= e; });
  return w ? { ok: true, window: w, minutes: e - s } : { ok: false, why: "That time is not open. Please pick a time inside one of the open windows." };
}

/**
 * A family's request from the public booking page. Returns { ok, lead } where the lead
 * has status "requested" and `requested: { date, start, end }`, or { ok: false, why }.
 * It is only ever a lead: the sitter approves it in the app.
 */
export function bookingRequest(fields, desk, today, { id = newId("lead"), nowMin, weeks = 4 } = {}) {
  const name = String(fields.name || "").trim(), contact = String(fields.contact || "").trim();
  if (!name || !contact) return { ok: false, why: "Please include your name and a phone number or email." };
  const date = String(fields.date || "").trim();
  const start = String(fields.start || "").trim(), end = String(fields.end || "").trim();
  if (!DATE.test(date) || !/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) return { ok: false, why: "Please pick a day and a start and end time." };
  const p = desk.profile || {};
  const minLen = Math.round(num(p.rates?.minimumHours, 0) * 60);
  const days = openSlots(desk, { from: today, weeks, nowMin });
  const fit = fitsOpenSlot(days, date, start, end);
  if (!fit.ok) return fit;
  if (fit.minutes < minLen) return { ok: false, why: `The shortest sit is ${p.rates.minimumHours} hours.` };
  const lead = leadFromForm({ ...fields, name, contact, schedule: `${DAYS[dayOf(date)]} ${date} ${start}-${end}`, wants: fields.wants || "one-time", source: fields.source || "booking page" }, today, id);
  lead.status = "requested";
  lead.requested = { date, start, end };
  return { ok: true, lead };
}

/**
 * The sitter's yes to a request. Returns a new desk (the input is not changed) with the
 * lead marked booked, a family created unless `familyId` names one, and a scheduled
 * booking; `check` says whether it still fits (availability, other sits) so the app
 * can warn before saving.
 */
export function approveRequest(desk, leadId, { familyId, today, bookingId = newId("boo"), newFamilyId = newId("fam") } = {}) {
  const out = structuredClone(desk);
  const lead = out.leads.find((l) => l.id === leadId);
  if (!lead || lead.status !== "requested" || !lead.requested) throw new Error("No pending request with that id");
  const { date, start, end } = lead.requested;
  let fid = familyId && out.families.some((f) => f.id === familyId) ? familyId : "";
  if (!fid) {
    fid = newFamilyId;
    out.families.push({ id: fid, name: `${lead.name.split(" ").slice(-1)[0]} family`, contactName: lead.name, contact: lead.contact, kids: (lead.kids || []).map((a) => ({ name: "", allergies: `age ${a}` })), notes: lead.notes });
  }
  const sit = { id: bookingId, familyId: fid, date, start, end, kids: Math.max(1, (lead.kids || []).length), status: "scheduled", bookedOn: today || lead.created, notes: lead.notes || "" };
  const check = canTake({ ...out, leads: out.leads.filter((l) => l.id !== leadId) }, sit, bufferOf(out.profile));
  out.bookings.push(sit);
  lead.status = "booked";
  lead.bookingId = bookingId;
  lead.familyId = fid;
  return { desk: out, booking: sit, check };
}

// A drafted answer to a request: confirmed, or the time is gone.
export function requestReply(lead, profile = {}, approved = true) {
  const first = String(lead.name || "").split(" ")[0] || "there";
  const r = lead.requested || {};
  const when = r.date ? `${DAYS[dayOf(r.date)]} ${shortDate(r.date)}, ${fmtRange(r.start, r.end)}` : "the time you asked for";
  return approved
    ? `Hi ${first}! You're booked: ${when}. Could you send me your address, the kids' names, any allergies and an emergency contact before then? Thank you! ${profile.name || ""}`.trim()
    : `Hi ${first}, thank you for asking! I'm sorry, I can't take ${when} after all. I'd love to help another time. ${profile.name || ""}`.trim();
}

/**
 * The public booking page. It shows only the sitter's own name, rates line and the open
 * times: never a family, a kid, a lead or why a time is taken.
 */
export function bookPage(desk, days, { action = "/book", message = "" } = {}) {
  const p = desk.profile || {};
  const title = p.businessName || `${p.name} Babysitting`;
  const open = days.filter((d) => d.windows.length);
  const options = open.flatMap((d) => d.windows.map((w) => `<option value="${esc(d.date)}" data-start="${esc(w.start)}" data-end="${esc(w.end)}">${esc(`${d.day} ${shortDate(d.date)}: ${fmtRange(w.start, w.end)}`)}</option>`)).join("");
  const list = open.map((d) => `<li><strong>${esc(`${d.day} ${shortDate(d.date)}`)}</strong>: ${d.windows.map((w) => esc(windowText(w))).join(", ")}</li>`).join("");
  const minH = num(p.rates?.minimumHours, 0);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(`Book a sit with ${title}`)}</title>
<style>
body{margin:0;font:17px/1.6 Georgia,serif;color:#2b2433;background:#fffaf6}main{max-width:640px;margin:auto;padding:24px 16px}
h1{font-size:1.9rem;margin:.4em 0}.card{background:#fff;border:1px solid #eadfd8;border-radius:14px;padding:16px 20px;margin:14px 0}
label{display:block;margin-top:10px;font-weight:600}input,select,textarea{width:100%;box-sizing:border-box;padding:9px;border:1px solid #bbb;border-radius:8px;font:inherit}
button{margin-top:14px;background:#b0507a;color:#fff;border:0;border-radius:8px;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer}
.hp{position:absolute;left:-9999px}.note{color:#6a6175;font-size:.9rem}.msg{background:#fbeef3;border-left:3px solid #b0507a;padding:8px 12px}
</style>
</head>
<body><main>
<h1>${esc(`Book a sit with ${title}`)}</h1>
<p>Pick an open time below and send a request. ${esc(p.name)} will confirm with you directly; a request is not a booking until then.</p>
${message ? `<p class="msg">${esc(message)}</p>` : ""}
<section class="card"><h2>Open times</h2>${list ? `<ul>${list}</ul>` : "<p>No open times right now. Please check back soon.</p>"}${minH ? `<p class="note">Sits are at least ${esc(minH)} hours.</p>` : ""}</section>
${open.length ? `<section class="card"><h2>Request a time</h2><form method="post" action="${esc(action)}">
<label for="d">Day</label><select id="d" name="date" required>${options}</select>
<label for="st">Start</label><input id="st" name="start" type="time" required>
<label for="en">End</label><input id="en" name="end" type="time" required>
<label for="n">Your name</label><input id="n" name="name" required maxlength="120">
<label for="c">Phone or email</label><input id="c" name="contact" required maxlength="200">
<label for="k">Children's ages (e.g. 4, 18 months)</label><input id="k" name="kids" maxlength="200">
<label for="m">Anything I should know?</label><textarea id="m" name="notes" rows="3" maxlength="2000"></textarea>
<label class="hp" for="hp">Leave this empty</label><input class="hp" id="hp" name="website" tabindex="-1" autocomplete="off">
<button type="submit">Send request</button></form></section>
<script>(function(){var d=document.getElementById("d"),s=document.getElementById("st"),e=document.getElementById("en");function f(){var o=d.options[d.selectedIndex];if(!o)return;s.value=o.dataset.start;e.value=o.dataset.end;}d.addEventListener("change",f);f();})();</script>` : ""}
<p class="note"><a href="/site">About ${esc(p.name)}</a></p>
</main></body></html>
`;
}
