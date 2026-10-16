// Server-rendered pages. Every dynamic value goes through esc().
import { summary, formFor } from "./book.mjs";
import { groupByDay, fmtTime, fmtDay, hoursText } from "./slot.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const q = encodeURIComponent;
const when = (ms, tz) => `${fmtDay(ms, tz)}, ${fmtTime(ms, tz)}`;

const CSS = `:root{font:16px system-ui,sans-serif;color:#1c2030;background:#f4f7f5}body{max-width:760px;margin:auto;padding:24px}a{color:#0b5d46}.card{background:#fff;border:1px solid #d8e2dd;border-radius:12px;padding:18px;margin:16px 0}label{display:block;font-weight:600;margin:10px 0 4px}input,select,textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid #a9bbb3;border-radius:6px;font:inherit}button,.btn{display:inline-block;padding:8px 14px;border:0;border-radius:6px;background:#0b5d46;color:#fff;font:inherit;cursor:pointer;text-decoration:none}button.alt,.btn.alt{background:#e2ebe7;color:#1c2030}button.danger{background:#a3191f}.muted{color:#46564f;font-size:.85rem}.times{display:flex;flex-wrap:wrap;gap:8px}.days a{display:inline-block;margin:0 6px 6px 0;padding:6px 10px;border:1px solid #a9bbb3;border-radius:8px;text-decoration:none;background:#fff}.days a.on{background:#0b5d46;color:#fff;border-color:#0b5d46}table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e1e9e5;vertical-align:top}pre{background:#eef3f0;padding:10px;border-radius:8px;overflow-x:auto;font-size:.82rem;white-space:pre-wrap}form.inline{display:inline}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}.grid div{background:#eef3f0;border-radius:8px;padding:10px}.grid b{display:block;font-size:1.4rem}.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0 12px}.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:.78rem;background:#e2ebe7}.pill.bad{background:#fbd9db;color:#8a1118}`;
const foot = (cfg) => `<p class="muted">No warranty; no delivery or uptime guarantee. Check the time and zone before you rely on a booking.${cfg.sponsor ? ` <a href="https://github.com/sponsors/Duncan-Haywood">Sponsor the author</a>.` : ""}</p>`;
const shell = (cfg, title, body, { robots = "noindex", home = "/admin" } = {}) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="${robots}"><title>${esc(title)}</title><style>${CSS}</style></head><body><main>${body}${foot(cfg)}</main></body></html>`;

const zones = (() => { try { return Intl.supportedValuesOf("timeZone"); } catch { return ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"]; } })();
const zoneOptions = (cur) => [...new Set(["UTC", ...zones, cur])].map((z) => `<option${z === cur ? " selected" : ""}>${esc(z)}</option>`).join("");

export function eventPage(cfg, ev, slots, { tz, d, reschedule }, now) {
  const days = groupByDay(slots, tz), keys = [...days.keys()].slice(0, 21);
  const day = days.has(d) ? d : keys[0];
  const keep = reschedule ? `&reschedule=${q(reschedule)}` : "";
  const dayLinks = keys.map((k) => `<a href="?tz=${q(tz)}&d=${k}${keep}"${k === day ? ' class="on" aria-current="date"' : ""}>${esc(fmtDay(days.get(k)[0], tz).replace(/, \d{4}$/, ""))} <span class="muted">(${days.get(k).length})</span></a>`).join("");
  const times = day ? days.get(day).map((s) => `<a class="btn alt" href="/b/${esc(ev.id)}/confirm?start=${s}&tz=${q(tz)}${keep}">${esc(fmtTime(s, tz))}</a>`).join("") : "";
  return shell(cfg, `${ev.name} · ${cfg.company}`, `
<h1>${esc(ev.name)}</h1><p class="muted">${esc(cfg.company)} · ${ev.minutes} minutes${ev.location ? ` · ${esc(ev.location)}` : ""}</p>${ev.description ? `<p>${esc(ev.description)}</p>` : ""}${reschedule ? `<p class="card">Pick a new time. Your current booking stays until you confirm.</p>` : ""}
<form method="get" class="card"><input type="hidden" name="d" value="${esc(day || "")}">${reschedule ? `<input type="hidden" name="reschedule" value="${esc(reschedule)}">` : ""}<label for="tz">Show times in</label><select id="tz" name="tz">${zoneOptions(tz)}</select><p><button class="alt">Change time zone</button></p></form>
${keys.length ? `<div class="card"><h2>Pick a day</h2><div class="days">${dayLinks}</div><h2>${esc(fmtDay(days.get(day)[0], tz))}</h2><div class="times">${times}</div><p class="muted">Times are in ${esc(tz)}.</p></div>` : `<div class="card"><p>No times are open right now. Please check back later.</p></div>`}`, { robots: "noindex" });
}

export function confirmPage(cfg, ev, start, tz, { reschedule, prefill } = {}) {
  return shell(cfg, `Confirm · ${ev.name}`, `
<h1>${esc(ev.name)}</h1><p><b>${esc(when(start, tz))}</b> <span class="muted">(${esc(tz)}, ${ev.minutes} min)</span></p>
<form class="card" method="post" action="/b/${esc(ev.id)}/book"><input type="hidden" name="start" value="${start}"><input type="hidden" name="tz" value="${esc(tz)}">${reschedule ? `<input type="hidden" name="reschedule" value="${esc(reschedule)}">` : ""}
<label for="n">Your name</label><input id="n" name="name" required maxlength="80" value="${esc(prefill?.name)}" autocomplete="name">
<label for="e">Your email</label><input id="e" name="email" type="email" required maxlength="254" value="${esc(prefill?.email)}" autocomplete="email">
<label for="o">Anything we should know? (optional)</label><textarea id="o" name="notes" maxlength="2000" rows="4"></textarea>
<input name="_gotcha" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
<p><button>${reschedule ? "Move my booking" : "Confirm booking"}</button> <a href="/b/${esc(ev.id)}?tz=${q(tz)}${reschedule ? `&reschedule=${q(reschedule)}` : ""}">Pick another time</a></p></form>`);
}

export function bookingPage(cfg, b, ev, base) {
  const tz = b.tz, live = b.status === "confirmed";
  return shell(cfg, `Your booking · ${b.eventName}`, `
<h1>${live ? "You're booked" : "Booking cancelled"}</h1>
<div class="card"><p><b>${esc(b.eventName)}</b> with ${esc(cfg.company)}</p><p>${esc(when(b.start, tz))} <span class="muted">(${esc(tz)})</span></p>${ev?.location ? `<p>${esc(ev.location)}</p>` : ""}<p class="muted">${esc(b.name)} · ${esc(b.email)}</p></div>
${live && b.end > (cfg.now?.() ?? Date.now()) ? `<p><a class="btn" href="/c/${esc(b.token)}.ics">Add to calendar</a> <a class="btn alt" href="/b/${esc(b.event)}?tz=${q(tz)}&reschedule=${esc(b.token)}">Reschedule</a></p>
<form method="post" action="/c/${esc(b.token)}/cancel"><button class="danger">Cancel this booking</button></form>` : live ? "" : `<p><a href="/b/${esc(b.event)}">Book another time</a></p>`}`);
}

export const thanksCancel = (cfg) => shell(cfg, "Cancelled", `<h1>Booking cancelled</h1><p>We have told the host. You can book another time whenever you like.</p>`);

const dur = (m) => (m % 60 === 0 ? `${m / 60} h` : `${m} min`);

export function adminPage(cfg, state, base, now) {
  const evs = Object.values(state.events), s = summary(state, now);
  const live = Object.values(state.bookings).filter((b) => b.status === "confirmed" && b.end > now).sort((a, c) => a.start - c.start);
  const recent = Object.values(state.bookings).filter((b) => b.status === "cancelled" || b.end <= now).sort((a, c) => c.start - a.start).slice(0, 25);
  const hostTz = evs[0]?.tz || "UTC";
  const row = (b, act) => `<tr><td>${esc(when(b.start, hostTz))}</td><td>${esc(b.eventName)}</td><td>${esc(b.name)}<div class="muted">${esc(b.email)}${b.notes ? ` · ${esc(b.notes.slice(0, 120))}` : ""}</div></td><td>${act ? `<form class="inline" method="post" action="/admin/b/${esc(b.id)}/cancel"><button class="alt">Cancel</button></form>` : `<span class="pill${b.status === "cancelled" ? " bad" : ""}">${esc(b.status === "cancelled" ? `cancelled (${b.cancelledBy})` : "done")}</span>`}</td></tr>`;
  const evRows = evs.map((e) => `<tr><td><a href="/admin/event/${esc(e.id)}">${esc(e.name)}</a></td><td>${dur(e.minutes)}</td><td><code>${esc(base)}/b/${esc(e.id)}</code></td><td>${esc(e.tz)}</td></tr><tr><td colspan="4"><details><summary>Embed or link</summary><pre>${esc(`<a href="${base}/b/${e.id}">Book a ${e.minutes}-minute call</a>\n<iframe src="${base}/b/${e.id}" style="width:100%;height:640px;border:0" title="Book a time"></iframe>`)}</pre><p class="muted">The iframe works when your site is allowed in <code>EMBED_ORIGINS</code>. JSON for your own page: <code>${esc(base)}/api/${esc(e.id)}/slots?tz=Europe/London</code></p></details></td></tr>`).join("");
  return shell(cfg, `${cfg.company} bookings`, `
<h1>${esc(cfg.company)} · bookings</h1>
${cfg.feedError ? `<p class="card pill bad">Your busy-calendar feed could not be read (${esc(cfg.feedError)}). The last good copy is used for an hour; after that no times are offered, so nobody can book over a meeting you made elsewhere.</p>` : ""}
<div class="card"><div class="grid"><div><b>${s.upcoming}</b>upcoming</div><div><b>${s.next7}</b>in the next 7 days</div><div><b>${s.cancelled}</b>cancelled</div><div><b>${s.cancelRate === null ? "—" : `${s.cancelRate}%`}</b>cancel rate</div></div></div>
<div class="card"><h2>Event types</h2>${evs.length ? `<table><tr><th>Name</th><th>Length</th><th>Booking page</th><th>Zone</th></tr>${evRows}</table>` : `<p>None yet. Add one below; your booking link appears here.</p>`}<p><a class="btn" href="/admin/event/new">New event type</a></p></div>
<div class="card"><h2>Upcoming</h2>${live.length ? `<table><tr><th>When (${esc(hostTz)})</th><th>Event</th><th>Who</th><th></th></tr>${live.map((b) => row(b, true)).join("")}</table>` : `<p>Nothing booked yet.</p>`}</div>
${recent.length ? `<div class="card"><h2>Recent</h2><table><tr><th>When</th><th>Event</th><th>Who</th><th></th></tr>${recent.map((b) => row(b, false)).join("")}</table></div>` : ""}
<div class="card"><h2>Your calendar</h2><p>Subscribe to bookings in Google Calendar, Apple Calendar or Outlook ("add by URL"). Keep the link private:</p><pre>${esc(base)}/feed/${esc(state.feedToken)}.ics</pre><p><a href="/admin/export.csv">Export bookings (CSV)</a></p></div>`);
}

export function eventFormPage(cfg, ev, errors = []) {
  const f = ev ? formFor(ev) : { minutes: 30, tz: cfg.defaultTz || "UTC", hours: "mon-fri 09:00-17:00", noticeMin: 240, horizonDays: 30, bufferBefore: 0, bufferAfter: 0, maxPerDay: 0, step: "" };
  const inp = (id, label, type = "text", extra = "") => `<div><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" value="${esc(f[id])}" ${extra}></div>`;
  return shell(cfg, ev ? `Edit ${ev.name}` : "New event type", `
<h1>${ev ? `Edit ${esc(ev.name)}` : "New event type"}</h1>${errors.length ? `<div class="card pill bad">${errors.map(esc).join("<br>")}</div>` : ""}
<form class="card" method="post" action="/admin/events">
${inp("name", "Name", "text", `required maxlength="80"`)}${ev ? `<input type="hidden" name="id" value="${esc(ev.id)}">` : ""}
<div class="cols">${inp("minutes", "Length (minutes)", "number", `min="5" max="480"`)}${inp("step", "Start every (minutes, blank = length)", "number", `min="5" max="480"`)}${inp("bufferBefore", "Buffer before", "number", `min="0" max="240"`)}${inp("bufferAfter", "Buffer after", "number", `min="0" max="240"`)}${inp("noticeMin", "Minimum notice (minutes)", "number", `min="0"`)}${inp("horizonDays", "Bookable days ahead", "number", `min="1" max="365"`)}${inp("maxPerDay", "Max per day (0 = no limit)", "number", `min="0"`)}</div>
<label for="tz">Your time zone</label><select id="tz" name="tz">${zoneOptions(f.tz)}</select>
<label for="hours">Weekly hours <span class="muted">(your time zone)</span></label><input id="hours" name="hours" value="${esc(f.hours)}" placeholder="mon-fri 09:00-12:00,13:00-17:00; sat 10:00-12:00">
${inp("location", "Where (link or address, shown to the invitee)", "text", `maxlength="300"`)}
<label for="description">Description</label><textarea id="description" name="description" rows="3" maxlength="1000">${esc(f.description)}</textarea>
<label for="closed">Days off <span class="muted">(YYYY-MM-DD, space separated)</span></label><input id="closed" name="closed" value="${esc(f.closed)}">
<p><button>Save</button> <a href="/admin">Back</a></p></form>
${ev ? `<form method="post" action="/admin/events/${esc(ev.id)}/delete"><button class="danger">Delete this event type</button> <span class="muted">Existing bookings stay.</span></form>` : ""}`);
}

export { hoursText };
