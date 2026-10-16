// Server-rendered pages. Every dynamic value goes through esc(). Public pages carry one nonce'd script that only fills in the visitor's time zone.
import { groupByDay, dayLabel, clock, longDate, addDays, dayKey, formatWeekly, formatTimeOff } from "./slots.mjs";
import { upcoming } from "./book.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const css = `:root{font:16px system-ui,sans-serif;color:#1c2030;background:#f6f7fb}body{max-width:860px;margin:auto;padding:24px}a{color:#2342b8}.card{background:#fff;border:1px solid #dde1ec;border-radius:12px;padding:18px;margin:16px 0}label{display:block;font-weight:600;margin:10px 0 4px}input,select,textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid #b5bdd6;border-radius:6px;font:inherit}button{padding:7px 14px;border:0;border-radius:6px;background:#2342b8;color:#fff;font:inherit;cursor:pointer}button.alt{background:#e3e6f1;color:#1c2030}table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e3e6f1;vertical-align:top}pre{background:#eef0f8;padding:10px;border-radius:8px;overflow-x:auto;font-size:.82rem;white-space:pre-wrap}.muted{color:#46506b;font-size:.85rem}form.inline{display:inline}.days{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}.day h3{font-size:.95rem;margin:0 0 6px}.slot{display:block;text-align:center;margin:4px 0;padding:7px;border:1px solid #2342b8;border-radius:6px;text-decoration:none}.slot:hover,.slot:focus{background:#2342b8;color:#fff}.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:.78rem;background:#e3e6f1}.err{background:#fbd9db;color:#6b0f14;padding:10px 14px;border-radius:8px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}.grid div{background:#eef0f8;border-radius:8px;padding:10px}.grid b{display:block;font-size:1.4rem}`;

const shell = (cfg, title, body, { nonce = "", script = "", admin = false } = {}) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${css}</style></head><body><main>
${admin ? `<h1><a href="/admin" style="text-decoration:none;color:inherit">${esc(cfg.state.settings.name || "Bookings")} · admin</a></h1>` : ""}${body}
<p class="muted">No warranty; no uptime or delivery guarantee. Check the time and time zone before you rely on a booking.${cfg.sponsor ? ` <a href="https://github.com/sponsors/Duncan-Haywood">Sponsor the author</a>.` : ""}</p></main>${script ? `<script nonce="${esc(nonce)}">${script}</script>` : ""}</body></html>`;

// Visitors arrive without ?tz=; read it from the browser once, then reload with it. Without scripts the host's zone is shown, labelled.
const tzScript = `if(!/[?&]tz=/.test(location.search)){try{var z=Intl.DateTimeFormat().resolvedOptions().timeZone;if(z){var u=new URL(location.href);u.searchParams.set("tz",z);location.replace(u)}}catch(e){}}`;
export const withTzScript = tzScript;

const zoneList = () => { try { return Intl.supportedValuesOf("timeZone"); } catch { return ["UTC"]; } };
const hostName = (cfg) => cfg.state.settings.name || "the host";

export function homePage(cfg, state) {
  const vis = Object.values(state.types).filter((t) => !t.hidden);
  return shell(cfg, `Book time with ${hostName(cfg)}`, `<h1>Book time with ${esc(hostName(cfg))}</h1>${vis.length ? vis.map((t) => `<div class="card"><h2><a href="/e/${esc(t.slug)}">${esc(t.name)}</a> <span class="pill">${t.minutes} min</span></h2>${t.description ? `<p>${esc(t.description)}</p>` : ""}</div>`).join("") : `<p>Nothing is open for booking yet.</p>`}`);
}

function tzForm(action, tz, extra = "") {
  return `<form method="get" action="${esc(action)}" class="muted">${extra}<label for="tz" style="display:inline">Times shown in</label> <input id="tz" name="tz" value="${esc(tz)}" list="zones" style="width:16em;display:inline"> <button class="alt">Change</button><datalist id="zones">${zoneList().map((z) => `<option value="${esc(z)}">`).join("")}</datalist></form>`;
}

// slots: UTC ms; page: {from: "YYYY-MM-DD", days}; link(ms) -> href
export function slotsPage(cfg, { type, tz, slots, from, days, now, link, base, heading, error = "", note = "" }) {
  const groups = groupByDay(slots, tz);
  const prev = addDays(from, -days), next = addDays(from, days), today = dayKey(now, tz);
  const nav = `<p>${prev >= addDays(today, -days + 1) ? `<a href="${esc(base)}?tz=${encodeURIComponent(tz)}&from=${prev < today ? today : prev}">← Earlier</a> · ` : ""}<a href="${esc(base)}?tz=${encodeURIComponent(tz)}&from=${next}">Later →</a></p>`;
  const body = groups.length ? `<div class="days">${groups.map((g) => `<div class="day"><h3>${esc(dayLabel(g.date))}</h3>${g.slots.map((s) => `<a class="slot" href="${esc(link(s))}">${esc(clock(s, tz))}</a>`).join("")}</div>`).join("")}</div>` : `<p>No times are open from ${esc(dayLabel(from))} for ${days} days.</p>`;
  return shell(cfg, `${heading} · ${hostName(cfg)}`, `<h1>${esc(heading)}</h1>${type.description ? `<p>${esc(type.description)}</p>` : ""}<p class="muted">${type.minutes} minutes${type.location ? ` · ${esc(type.location)}` : ""}</p>${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}${note ? `<p>${esc(note)}</p>` : ""}<div class="card">${tzForm(base, tz, `<input type="hidden" name="from" value="${esc(from)}">`)}${body}${nav}</div>`, { nonce: cfg.nonce, script: tzScript });
}

export function confirmPage(cfg, { type, tz, start, error = "", values = {} }) {
  return shell(cfg, `Confirm · ${type.name}`, `<h1>${esc(type.name)}</h1><p><b>${esc(longDate(start, tz))}</b> · ${type.minutes} minutes</p>${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
<form method="post" action="/e/${esc(type.slug)}/book" class="card"><input type="hidden" name="start" value="${start}"><input type="hidden" name="tz" value="${esc(tz)}">
<label for="n">Your name</label><input id="n" name="name" required maxlength="100" autocomplete="name" value="${esc(values.name)}">
<label for="e">Your email</label><input id="e" name="email" type="email" required maxlength="254" autocomplete="email" value="${esc(values.email)}">
<label for="x">What would you like to cover? (optional)</label><textarea id="x" name="notes" maxlength="2000">${esc(values.notes)}</textarea>
<input name="_gotcha" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
<p><button>Confirm booking</button></p></form><p><a href="/e/${esc(type.slug)}?tz=${encodeURIComponent(tz)}">← Pick another time</a></p>`);
}

export function bookingPage(cfg, state, b, base, { viewTz = b.tz, notice = "" } = {}) {
  const type = state.types[b.type], ok = b.status === "confirmed";
  return shell(cfg, `Your booking · ${type?.name || b.type}`, `<h1>${ok ? "You're booked" : "Booking cancelled"}</h1>${notice ? `<p>${esc(notice)}</p>` : ""}
<div class="card"><h2>${esc(type?.name || b.type)}${type ? ` with ${esc(hostName(cfg))}` : ""}</h2><p><b>${esc(longDate(b.start, viewTz))}</b></p>${type?.location ? `<p>${esc(type.location)}</p>` : ""}<p class="muted">${esc(b.name)} · ${esc(b.email)}</p>
${ok ? `<p><a href="${esc(base)}/b/${esc(b.token)}.ics">Add to your calendar (.ics)</a></p><p><a href="/b/${esc(b.token)}/reschedule?tz=${encodeURIComponent(viewTz)}">Pick a different time</a></p>
<form method="post" action="/b/${esc(b.token)}/cancel"><label for="r">Reason for cancelling (optional)</label><input id="r" name="reason" maxlength="300"><p><button class="alt">Cancel this booking</button></p></form>` : ""}</div>`);
}

export function adminPage(cfg, state, base, now, q = {}, error = "") {
  const s = state.settings, ups = upcoming(state, now);
  const week = ups.filter((b) => b.start < now + 7 * 86_400_000).length;
  const rows = ups.slice(0, 200).map((b) => `<tr><td>${esc(longDate(b.start, s.tz))}</td><td>${esc(state.types[b.type]?.name || b.type)}</td><td>${esc(b.name)}<div class="muted">${esc(b.email)}${b.notes ? ` · ${esc(b.notes.slice(0, 120))}` : ""}</div></td><td><form class="inline" method="post" action="/admin/bookings/${esc(b.id)}/cancel"><button class="alt">Cancel</button></form></td></tr>`).join("");
  const types = Object.values(state.types).map((t) => `<tr><td><a href="/e/${esc(t.slug)}">${esc(t.name)}</a>${t.hidden ? ` <span class="pill">hidden</span>` : ""}</td><td>${t.minutes} min${t.buffer ? ` + ${t.buffer} buffer` : ""}</td><td><code>${esc(base)}/e/${esc(t.slug)}</code><details><summary>Embed on your site</summary><pre>${esc(`<iframe src="${base}/e/${t.slug}" style="width:100%;height:640px;border:0" title="Book ${t.name}"></iframe>`)}</pre><p class="muted">Add your site's origin to EMBED_ORIGINS or the browser will refuse to show it.</p></details></td><td><form class="inline" method="post" action="/admin/types/${esc(t.slug)}/delete"><button class="alt">Delete</button></form></td></tr>`).join("");
  return shell(cfg, "Bookings admin", `${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
<div class="card"><div class="grid"><div><b>${ups.length}</b>upcoming</div><div><b>${week}</b>in the next 7 days</div><div><b>${Object.values(state.bookings).filter((b) => b.status === "cancelled").length}</b>cancelled</div><div><b>${cfg.externalCount ?? 0}</b>calendar events blocking</div></div><p class="muted">Public page: <code>${esc(base)}/</code> · <a href="/admin/export.csv">Export CSV</a> · ${cfg.dryRun ? "email is in dry run (nothing is sent)" : "email on"}</p></div>
<div class="card"><h2>Upcoming</h2><table><tr><th>When (${esc(s.tz)})</th><th>Meeting</th><th>Who</th><th></th></tr>${rows || `<tr><td colspan="4">No upcoming bookings.</td></tr>`}</table></div>
<div class="card"><h2>Meeting types</h2>${types ? `<table><tr><th>Name</th><th>Length</th><th>Link</th><th></th></tr>${types}</table>` : "<p>None yet. Add one below.</p>"}
<form method="post" action="/admin/types"><h3>Add or replace a meeting type</h3>
<label for="tn">Name</label><input id="tn" name="name" required maxlength="80" placeholder="Intro call">
<label for="td">Description</label><textarea id="td" name="description" maxlength="1000"></textarea>
<div class="grid"><div><label for="tm">Minutes</label><input id="tm" name="minutes" type="number" value="30" min="5" max="480"></div><div><label for="tb">Buffer after/before (min)</label><input id="tb" name="buffer" type="number" value="10" min="0" max="240"></div><div><label for="ts">Start times every (min)</label><input id="ts" name="step" type="number" placeholder="= length" min="5" max="480"></div><div><label for="tno">Minimum notice (min)</label><input id="tno" name="notice" type="number" value="240" min="0"></div><div><label for="th">Bookable days ahead</label><input id="th" name="horizonDays" type="number" value="60" min="1" max="365"></div><div><label for="tp">Max per day (0 = no cap)</label><input id="tp" name="maxPerDay" type="number" value="0" min="0" max="50"></div><div><label for="tr">Remind invitee (min before, 0 = off)</label><input id="tr" name="reminderMinutes" type="number" value="1440" min="0"></div></div>
<label for="tl">Where (address, phone or meeting link)</label><input id="tl" name="location" maxlength="300">
<label for="tw">Own hours for this type (optional, same format as below; blank = general hours)</label><textarea id="tw" name="weekly" rows="3"></textarea>
<label style="font-weight:400"><input type="checkbox" name="hidden" style="width:auto"> Hide from the public list (link still works)</label>
<p><button>Save meeting type</button></p></form></div>
<div class="card"><h2>Availability</h2><form method="post" action="/admin/settings">
<label for="sn">Your name or business</label><input id="sn" name="name" value="${esc(s.name)}" maxlength="80">
<label for="stz">Your time zone</label><input id="stz" name="tz" value="${esc(s.tz)}" list="zones"><datalist id="zones">${zoneList().map((z) => `<option value="${esc(z)}">`).join("")}</datalist>
<label for="sw">Weekly hours</label><textarea id="sw" name="weekly" rows="7">${esc(formatWeekly(s.weekly))}</textarea><p class="muted">One line per day or group: <code>mon-fri 09:00-12:00, 13:00-17:00</code>, <code>sat closed</code>, <code>weekdays</code>, <code>daily</code>.</p>
<label for="so">Days off</label><textarea id="so" name="timeOff" rows="3" placeholder="2026-12-24 to 2027-01-02  # holidays">${esc(formatTimeOff(s.timeOff))}</textarea>
<label for="sc">Calendar feed to block busy times (optional, https .ics secret address from Google, Outlook or Apple)</label><input id="sc" name="icsUrl" value="${esc(s.icsUrl)}" placeholder="https://calendar.google.com/calendar/ical/.../basic.ics">
<label for="se">Email me new bookings (optional)</label><input id="se" name="hostEmail" type="email" value="${esc(s.hostEmail)}">
<p><button>Save availability</button></p></form></div>`, { admin: true });
}

export const notFoundPage = (cfg, msg = "This page does not exist.") => shell(cfg, "Not found", `<h1>Not found</h1><p>${esc(msg)}</p><p><a href="/">Book a time</a></p>`);
