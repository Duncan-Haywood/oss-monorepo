// The team hub's request handler, shared by the Node server (server.mjs) and the Cloudflare Worker (hub-worker.mjs).
// No Node built-ins (no http, fs, crypto or Buffer), so the same code runs on a Worker: state is a plain object the
// caller loads and `save` persists (a JSON file on Node, Durable Object storage on Cloudflare). Requests arrive as a
// Node-style (req, res) pair; hub-worker.mjs adapts a fetch Request to that shape.
import { parseStaff, parseShifts, buildRoster, rosterFromOwner, rosterIcs, rosterFeedIcs, rosterMessages, coverOptions, checkTrade, parseAvailabilityReply, mergeAvailabilityReplies, parseTimeOffRequest, addTimeOff, scheduleFlags, fmtClock, money, num, DAYS, sampleStaff, sampleShifts } from "./calc.mjs";
import { punch, addPunch, removePunch, onTheClock, timesheet, timesheetCsv, zoneOf, localParts, clock } from "./timeclock.mjs";
import { readPayEnv, payForTimesheet, MEAL_RULES } from "./payrules.mjs";
import { readLeaveEnv, leaveBalances, addLeaveUse, removeLeaveUse, setLeaveOpening, leaveCsv } from "./leave.mjs";
import { setPin, hasPin, checkPin, validPin, readGeofence, placeOf, GEO_SCRIPT } from "./clockguard.mjs";
import { FIELDS, splitCsvLine, readTemplate, parseOverrides, parseIds, payrollRows, fillTemplate } from "./payroll-export.mjs";
import { readNoticeEnv, diffAssignments, logChanges, markRequested, noticeReport, noticeCsv, slotLabel, teamOfferText, standbyNoticeText, standbyAskText, onCallShifts, MAX_CHANGES } from "./notice.mjs";

const MAX_BODY = 64 * 1024, MAX_REPLIES = 200, MAX_CALLOUTS = 100, MAX_TRADES = 100, MAX_CLAIMS = 100, MAX_OFFS = 100;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Constant-time compare of two secrets (the length still shows, as with crypto.timingSafeEqual).
const enc = new TextEncoder();
export const same = (a, b) => { const x = enc.encode(String(a)), y = enc.encode(String(b)); if (x.length !== y.length) return false; let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0; };

// Optional alerts to a webhook the deployer owns (Slack, Discord, ntfy or plain JSON), off unless a URL is set.
// NOTIFY_WEBHOOK_URL gets manager alerts (a new call-out, trade, open-shift ask, time-off ask or availability reply);
// TEAM_WEBHOOK_URL gets each person's shifts when a week is published. Nothing goes to a service we run. Messages
// carry no admin key and no wages. Fire and forget: a dead webhook never blocks a staff request.
export function webhookBody(format, text) {
  const t = String(text).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").slice(0, 1800);
  if (format === "discord") return { type: "application/json", body: JSON.stringify({ content: t, allowed_mentions: { parse: [] } }) };
  if (format === "ntfy") return { type: "text/plain; charset=utf-8", body: t };
  if (format === "json") return { type: "application/json", body: JSON.stringify({ text: t }) };
  // Slack: stop staff-typed text from pinging a channel (<!channel>, <@U1>, links).
  return { type: "application/json", body: JSON.stringify({ text: t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }) };
}
export function notifier(env, fetchImpl = globalThis.fetch) {
  const format = String(env.NOTIFY_FORMAT || "slack").toLowerCase();
  const base = String(env.PUBLIC_URL || "").replace(/\/+$/, "");
  const post = (url, text) => {
    if (!/^https?:\/\//i.test(url || "") || typeof fetchImpl !== "function") return Promise.resolve(false);
    const { type, body } = webhookBody(format, text);
    return Promise.resolve().then(() => fetchImpl(url, { method: "POST", headers: { "content-type": type }, body, signal: AbortSignal.timeout(5000) }))
      .then((r) => !!(r && r.ok), (e) => { console.error("webhook failed:", e && e.message); return false; });
  };
  return {
    manager: (text) => post(env.NOTIFY_WEBHOOK_URL, text + (base ? `\nOpen ${base}/admin and enter your admin key.` : "")),
    team: (text) => post(env.TEAM_WEBHOOK_URL, text),
  };
}

const CSS = `body{font:16px/1.5 system-ui,sans-serif;max-width:60rem;margin:0 auto;padding:1rem;color:#1a1a1a}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:.35rem .5rem;text-align:left}textarea,input{width:100%;font:inherit;box-sizing:border-box}textarea{font-family:ui-monospace,monospace;min-height:9rem}button{font:inherit;padding:.5rem 1rem;margin:.5rem .5rem .5rem 0}.note{color:#555;font-size:.9rem}.err{color:#b00020}.ok{color:#176f2c}`;
const page = (title, body, head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">${head}<title>${esc(title)}</title><style>${CSS}</style></head><body><h1>${esc(title)}</h1>${body}<p class="note">Self-hosted with <a href="https://marisstella.app/shift-roster-builder/">Shift Roster Builder</a> (MIT). Not legal advice: check breaks, minors and predictive-scheduling rules yourself.</p></body></html>`;

export function emptyState() { return { staff: "", shifts: "", weekStart: "", published: null, replies: [], history: [], callouts: [], trades: [], claims: [], offs: [], punches: [], punchSeq: 0, leaveUses: [], leaveSeq: 0, leaveOpening: {}, leaveBank: {}, changeLog: [], changeSeq: 0, postedAt: {}, onCall: {}, standby: [], standbyHistory: [] }; }

// What staff may see: who works when. Never wages, hour caps or the cost of the week.
// `owner` (optional) is a roster built in the manager's browser (BUILD_IN_BROWSER): it is checked against every hard
// rule and priced here (rosterFromOwner), with no search, so a host with a tight CPU limit can still publish.
export function publish(state, now, owner = null) {
  const st = parseStaff(state.staff, { weekStart: state.weekStart || null }), sh = parseShifts(state.shifts);
  const errs = [...(st.errors || []), ...(sh.errors || [])];
  if (errs.length) return { error: errs[0] };
  const r = owner ? rosterFromOwner(st.staff, sh.slots, owner) : buildRoster(st.staff, sh.slots);
  if (r.error) return { error: r.error };
  const flags = state.weekStart ? scheduleFlags(r, { weekStart: state.weekStart, today: new Date(now).toISOString().slice(0, 10) }) : null;
  state.callouts = []; state.trades = []; state.claims = [];
  // Predictive scheduling (notice.mjs): a republished week logs what it changed for whom; the first publish of a week
  // is when it was posted.
  const ws = state.weekStart || null, nextAs = r.assignments.map((a) => ({ person: a.person || null, slot: a.slot }));
  if (state.published && (state.published.weekStart || null) === ws) logChanges(state, diffAssignments(state.published.assignments, nextAs), { at: now, weekStart: ws, cause: "republish" });
  if (ws) {
    state.postedAt = state.postedAt && typeof state.postedAt === "object" ? state.postedAt : {};
    if (!Number.isFinite(state.postedAt[ws])) state.postedAt[ws] = now;
    const keep = new Set([ws, state.published && state.published.weekStart, ...(state.history || []).map((h) => h.weekStart)]);
    for (const k of Object.keys(state.postedAt)) if (!keep.has(k)) delete state.postedAt[k];
    if (state.onCall && typeof state.onCall === "object") for (const k of Object.keys(state.onCall)) if (!keep.has(k.split("|")[0])) delete state.onCall[k];
  }
  // Keep earlier weeks (last 12) for the calendar feed; publishing the same week again replaces it.
  if (state.published && state.published.weekStart && state.published.weekStart !== (state.weekStart || null)) {
    state.history = [...(state.history || []).filter((h) => h.weekStart !== state.published.weekStart), { weekStart: state.published.weekStart, assignments: state.published.assignments }].slice(-12);
  }
  state.history = (state.history || []).filter((h) => h.weekStart !== (state.weekStart || null));
  state.published = {
    at: new Date(now).toISOString(), weekStart: state.weekStart || null, unfilled: r.unfilledSlots,
    // The lists the week was built from, so the request checks below read the published week, not later edits.
    staffText: state.staff, shiftsText: state.shifts,
    people: r.people.map((p) => ({ name: p.name, hours: p.hours })),
    assignments: r.assignments.map((a) => ({ person: a.person || null, slot: { day: a.slot.day, startMin: a.slot.startMin, endMin: a.slot.endMin, label: a.slot.label || "", role: a.slot.role || "" } })),
  };
  return { ok: true, cost: r.cost, flags };
}

const dayDate = (ws, d) => { const t = new Date(ws + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(5, 10); };

// Installable on a phone's home screen and readable offline: the staff page links a manifest and a small service
// worker that keeps the last schedule the phone saw. Nothing but the schedule page is cached; forms are never replayed.
const teamHead = (token) => `<link rel="manifest" href="/team/manifest.webmanifest?t=${esc(token)}"><meta name="theme-color" content="#176f2c"><link rel="icon" href="/team/icon.svg?t=${esc(token)}"><script>if("serviceWorker"in navigator)navigator.serviceWorker.register("/team/sw.js?t=${esc(token)}",{scope:"/team"}).catch(function(){})</script>`;
export const manifestFor = (token) => JSON.stringify({ name: "Team schedule", short_name: "Schedule", start_url: `/team?t=${encodeURIComponent(token)}`, scope: "/team", display: "standalone", background_color: "#ffffff", theme_color: "#176f2c", icons: [{ src: `/team/icon.svg?t=${encodeURIComponent(token)}`, sizes: "any", type: "image/svg+xml", purpose: "any" }] });
export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#176f2c"/><path d="M14 22h36M14 34h36M14 46h22" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>`;
export const SW_JS = `const C="schedule-v1";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{const r=e.request,u=new URL(r.url);
if(r.method!=="GET"||u.pathname!=="/team")return;
e.respondWith(fetch(r).then(x=>{if(x.ok){const c=x.clone();caches.open(C).then(k=>k.put(r.url,c))}return x}).catch(()=>caches.match(r.url).then(m=>m||new Response("Offline and no saved schedule yet.",{status:503,headers:{"content-type":"text/plain"}}))))});`;

// The time clock on the staff page (TIME_CLOCK, on unless set to 0): who is on the clock now, and one form to clock in
// or out. The time recorded is the server's, shown in the site's zone (TIMEZONE, an IANA name; UTC if unset).
// Optional checks (clockguard.mjs): a PIN box when anyone has a PIN or CLOCK_PIN=required, and with CLOCK_GEOFENCE the
// phone's location is read when a button is pressed (only the distance from the site is kept).
function clockSection(state, token, p, tc) {
  const on = onTheClock(state.punches, tc.now);
  const list = [...on.values()].sort((a, b) => a.person.localeCompare(b.person)).map((x) => `${esc(x.person)} since ${esc(clock(localParts(x.at, tc.tz).min))}`).join(", ");
  const pins = tc.pinRequired || p.people.some((q) => hasPin(state, q.name));
  const fence = tc.fence && !tc.fence.error ? tc.fence : null;
  const pinBox = pins ? `<label>Your clock PIN${tc.pinRequired ? "" : " (if your manager gave you one)"}<input type="password" name="pin" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off"${tc.pinRequired ? " required" : ""}></label>` : "";
  const geo = fence ? `<input type="hidden" name="kind" value=""><input type="hidden" name="lat"><input type="hidden" name="lon"><input type="hidden" name="acc"><input type="hidden" name="geoerr">` : "";
  const geoNote = fence ? `<p class="note" data-geo-note>Your phone's location is checked when you press a button: only how far you are from the site is kept, not where you are. ${fence.mode === "block" ? `Punches from more than ${fence.radius} m away, or with location turned off, are refused.` : `Punches from more than ${fence.radius} m away, or with location turned off, are flagged for your manager.`}</p>` : "";
  return `<h2>Clock in or out</h2><p class="note">On the clock now: ${list || "nobody"}. Times are ${esc(tc.tz)}.</p><form method="post" action="/team/punch?t=${esc(token)}"${fence ? " data-geo" : ""}>${geo}<label>Who are you?<select name="name" required>${p.people.map((q) => `<option>${esc(q.name)}</option>`).join("")}</select></label>${pinBox}<button name="kind" value="in">Clock in</button><button name="kind" value="out">Clock out</button></form>${geoNote}<p class="note">The time is taken from the server when you press the button, not from your phone. Forgot to punch? Tell your manager; they can add it, and it is marked as added by them.</p>${fence ? GEO_SCRIPT : ""}`;
}

// The voluntary standby list (Oregon ORS 653.432; on where the rule set has standby, FWW_STANDBY=1 elsewhere): who
// agreed in writing to be asked for extra hours, and a dated record of each join and removal.
export const MAX_STANDBY_HISTORY = 500;
const standbyNames = (state) => (state.standby || []).map((x) => x.person);
function standbyLog(state, person, act, by, at) {
  if (!Array.isArray(state.standbyHistory)) state.standbyHistory = [];
  state.standbyHistory.push({ person, act, by, at });
  if (state.standbyHistory.length > MAX_STANDBY_HISTORY) state.standbyHistory.splice(0, state.standbyHistory.length - MAX_STANDBY_HISTORY);
}
// People on the list the employer has not asked for this call-out (ORS 653.455(3)(k)(C)), leaving out the caller and
// the person taking the shift.
export function standbyNotAsked(state, c, taker = "") {
  const asked = new Set(c.standbyAsked || []);
  return standbyNames(state).filter((n) => n !== c.person && n !== taker && !asked.has(n));
}

function standbySection(state, token, p) {
  const on = standbyNames(state), names = p.people.map((q) => q.name);
  const asks = state.callouts.filter((c) => c.standbyAskedAt && (c.standbyAsked || []).length).map((c) => `<form method="post" action="/team/standby-take?t=${esc(token)}"><p>${esc(c.standbyText || standbyAskText(c, p.weekStart))}</p><input type="hidden" name="shift" value="${esc(c.person + "|" + c.day + "|" + c.startMin + "|" + c.endMin)}"><label>Who are you?<select name="name" required>${c.standbyAsked.map((n) => `<option>${esc(n)}</option>`).join("")}</select></label><button>I'll take it</button>${(c.standbyAccepts || []).length ? `<span class="note"> Already said yes: ${c.standbyAccepts.map((a) => esc(a.person)).join(", ")}.</span>` : ""}</form>`).join("");
  return `<h2>Standby list (voluntary)</h2><ul>${standbyNoticeText().map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="note">On the list now: ${on.length ? on.map(esc).join(", ") : "nobody"}.</p>${asks ? `<h3>Extra hours offered to the standby list</h3>${asks}` : ""}<form method="post" action="/team/standby?t=${esc(token)}"><label>Who are you?<select name="name" required>${names.map((n) => `<option>${esc(n)}</option>`).join("")}</select></label><label><input type="checkbox" name="agree" value="yes" required style="width:auto"> I have read the above and agree in writing to be on the standby list.</label><button name="act" value="join">Join the standby list</button></form>${on.length ? `<form method="post" action="/team/standby?t=${esc(token)}"><label>Take me off the list<select name="name" required>${on.map((n) => `<option>${esc(n)}</option>`).join("")}</select></label><button name="act" value="leave">Leave the standby list</button></form>` : ""}<p class="note">Not joining, leaving, or saying no to hours will not count against you. Your manager keeps a dated record of who joined and left.</p>`;
}

function teamPage(state, token, tc = null, fww = null) {
  const p = state.published;
  const form = `<h2>Send your availability</h2><form method="post" action="/team/reply?t=${esc(token)}"><label>One line: <code>Your name | Mon-Fri 9-17; Sat off | max: 30</code><input name="line" required maxlength="300"></label><button>Send</button></form><p class="note">Your manager sees it and decides. Nothing changes until they merge it.</p>`;
  const mine = (p ? p.assignments.filter((a) => a.person) : []).map((a, i) => ({ a, i })).sort((x, y) => x.a.person.localeCompare(y.a.person) || x.a.slot.day - y.a.slot.day || x.a.slot.startMin - y.a.slot.startMin);
  const dl = (d) => (p.weekStart ? dayDate(p.weekStart, d) + " " : "") + DAYS[d];
  const callout = p && mine.length ? `<h2>Cannot make a shift?</h2><form method="post" action="/team/callout?t=${esc(token)}"><label>Your shift<select name="shift" required>${mine.map(({ a }) => `<option value="${esc(a.person + "|" + a.slot.day + "|" + a.slot.startMin + "|" + a.slot.endMin)}">${esc(a.person)}: ${esc(dl(a.slot.day))} ${esc(fmtClock(a.slot.startMin))}-${esc(fmtClock(a.slot.endMin))}</option>`).join("")}</select></label><label>Note (optional)<input name="note" maxlength="140"></label><button>Tell my manager</button></form><p class="note">This only asks. Your manager sees who could cover it and decides; your shift stays yours until they change it.</p>` : "";
  const others = p ? mine.filter(({ a }) => a.person) : [];
  const shiftOpt = ({ a }) => `<option value="${esc(a.person + "|" + a.slot.day + "|" + a.slot.startMin + "|" + a.slot.endMin)}">${esc(a.person)}: ${esc(dl(a.slot.day))} ${esc(fmtClock(a.slot.startMin))}-${esc(fmtClock(a.slot.endMin))}</option>`;
  const trade = p && new Set(others.map(({ a }) => a.person)).size > 1 ? `<h2>Want to trade shifts?</h2><form method="post" action="/team/trade?t=${esc(token)}"><label>Your shift<select name="mine" required>${others.map(shiftOpt).join("")}</select></label><label>Their shift<select name="theirs" required>${others.map(shiftOpt).join("")}</select></label><label>Note (optional)<input name="note" maxlength="140"></label><button>Ask my manager</button></form><p class="note">Agree it with your colleague first. Your manager sees whether the trade keeps both weeks inside the rules and decides; both shifts stay as they are until then.</p>` : "";
  const openKey = (a) => `${a.slot.day}|${a.slot.startMin}|${a.slot.endMin}`;
  const openSeen = new Set();
  const openUnique = (p ? p.assignments.filter((a) => !a.person) : []).filter((a) => !openSeen.has(openKey(a)) && openSeen.add(openKey(a)));
  const claim = p && openUnique.length && p.people.length ? `<h2>Open shifts you can pick up</h2><form method="post" action="/team/claim?t=${esc(token)}"><label>Shift<select name="shift" required>${openUnique.map((a) => `<option value="${esc(openKey(a))}">${esc(dl(a.slot.day))} ${esc(fmtClock(a.slot.startMin))}-${esc(fmtClock(a.slot.endMin))}${a.slot.label ? " (" + esc(a.slot.label) + ")" : ""}</option>`).join("")}</select></label><label>Who are you?<select name="name" required>${p.people.map((q) => `<option>${esc(q.name)}</option>`).join("")}</select></label><label>Note (optional)<input name="note" maxlength="140"></label><button>Ask to take it</button></form><p class="note">This only asks. Your manager sees whether it fits your availability, rest and hour limits and decides; the shift stays open until they approve.</p>` : "";
  const offered = p ? state.callouts.filter((c) => c.offeredAt) : [];
  const offers = offered.length && p.people.length ? `<h2>Shifts offered to everyone</h2>${offered.map((c) => `<form method="post" action="/team/offer?t=${esc(token)}"><p>${esc(c.offerText || teamOfferText(c, p.weekStart))}</p><input type="hidden" name="shift" value="${esc(c.person + "|" + c.day + "|" + c.startMin + "|" + c.endMin)}"><label>Who are you?<select name="name" required>${p.people.filter((q) => q.name !== c.person).map((q) => `<option>${esc(q.name)}</option>`).join("")}</select></label><button>I'll take it</button>${(c.accepts || []).length ? `<span class="note"> Already said yes: ${(c.accepts || []).map((a) => esc(a.person)).join(", ")}.</span>` : ""}</form>`).join("")}<p class="note">Saying yes tells your manager; they give the shift to one person who said yes and fits the rules.</p>` : "";
  const names = p ? p.people.map((q) => q.name) : [];
  const off = names.length ? `<h2>Need days off?</h2><form method="post" action="/team/timeoff?t=${esc(token)}"><label>Who are you?<select name="name" required>${names.map((n) => `<option>${esc(n)}</option>`).join("")}</select></label><label>First day<input type="date" name="from" required></label><label>Last day (leave blank for one day)<input type="date" name="to"></label><label>Note (optional)<input name="note" maxlength="140"></label><button>Ask my manager</button></form><p class="note">This only asks. If your manager agrees, the days come off your availability when they build that week.</p>` : "";
  if (!p) return page("Team schedule", `<p>No schedule has been published yet.</p>${form}`, teamHead(token));
  const clockBlock = tc && p.people.length ? clockSection(state, token, p, tc) : "";
  const standbyBlock = fww && fww.standby && p.people.length ? standbySection(state, token, p) : "";
  const msgs = rosterMessages({ assignments: p.assignments, people: p.people }, p.weekStart);
  const rows = msgs.map((m) => `<tr><td><strong>${esc(m.person)}</strong></td><td>${esc(m.text.split("\n").slice(1, -1).join(" · ") || "no shifts")}</td><td>${p.weekStart && m.shifts ? `<a href="/team/ics?t=${esc(token)}&person=${encodeURIComponent(m.person)}">Add to calendar</a><br><a href="/team/feed.ics?t=${esc(token)}&person=${encodeURIComponent(m.person)}">Live feed</a>` : ""}</td></tr>`).join("");
  return page(`Schedule${p.weekStart ? ", week of " + p.weekStart : ""}`, `<p class="note">Published ${esc(p.at.slice(0, 16).replace("T", " "))} UTC${p.unfilled ? `. ${p.unfilled} shift(s) are still open: ask your manager.` : "."}</p><table><thead><tr><th>Person</th><th>Shifts</th><th></th></tr></thead><tbody>${rows}</tbody></table>${clockBlock}${offers}${standbyBlock}${claim}${callout}${trade}${off}${form}<p class="note">Calendar: "Live feed" is a link to paste into your calendar app's "add calendar from URL"; it keeps past weeks and updates when your manager publishes again. Tip: add this page to your home screen to open it like an app. It keeps the last schedule your phone saw, so you can read it with no signal.</p>`, teamHead(token));
}

// Who could take each reported shift without moving anyone else, cheapest first. Read from the published week itself
// (2026-11-15): the staff and shift lists saved at publish, and the owner of each shift as published, so a trade, cover
// or pick-up already approved counts, later edits to the draft lists do not, and no search runs (cheap enough for a
// Worker's CPU limit). A state saved before publish kept its lists falls back to rebuilding from the current lists.
export function rosterCtx(state) {
  const p = state.published;
  if (p && typeof p.staffText === "string" && typeof p.shiftsText === "string") {
    try {
      const st = parseStaff(p.staffText, { weekStart: p.weekStart || null }), sh = parseShifts(p.shiftsText);
      if ((st.errors || []).length || (sh.errors || []).length || sh.slots.length !== p.assignments.length) return null;
      const idx = new Map(st.staff.map((q, k) => [q.name, k]));
      const owner = p.assignments.map((a) => (a.person ? idx.get(a.person) ?? -2 : -1));
      if (owner.includes(-2) || sh.slots.some((s, k) => s.day !== p.assignments[k].slot.day || s.startMin !== p.assignments[k].slot.startMin || s.endMin !== p.assignments[k].slot.endMin)) return null;
      return { st, sh, r: { owner } };
    } catch { return null; }
  }
  try {
    const st = parseStaff(state.staff, { weekStart: state.weekStart || null }), sh = parseShifts(state.shifts);
    if (!(st.errors || []).length && !(sh.errors || []).length) { const r = buildRoster(st.staff, sh.slots); if (!r.error) return { st, sh, r }; }
  } catch { /* fall through */ }
  return null;
}
const slotIndexOf = (ctx, x) => ctx.sh.slots.findIndex((s, k) => ctx.r.owner[k] >= 0 && ctx.st.staff[ctx.r.owner[k]].name === x.person && s.day === x.day && s.startMin === x.startMin && s.endMin === x.endMin);

export function calloutRows(state) {
  if (!state.callouts.length) return [];
  const ctx = rosterCtx(state);
  return state.callouts.map((c) => {
    if (!ctx) return { c, note: "Staff or shifts no longer build; fix them, then publish again." };
    const i = slotIndexOf(ctx, c);
    if (i < 0) return { c, note: "That shift is not in the current roster (it changed since it was published)." };
    const o = coverOptions(ctx.st.staff, ctx.sh.slots, ctx.r, i);
    return o.error ? { c, note: o.error } : { c, fits: o.fits.slice(0, 5) };
  });
}

// Each trade request, checked against the same hard rules as the browser tool's trade checker.
export function tradeRows(state) {
  if (!state.trades.length) return [];
  const ctx = rosterCtx(state);
  return state.trades.map((t) => {
    if (!ctx) return { t, note: "Staff or shifts no longer build; fix them, then publish again." };
    const i = slotIndexOf(ctx, t.a), j = slotIndexOf(ctx, t.b);
    if (i < 0 || j < 0) return { t, note: "One of those shifts is not in the current roster (it changed since it was published)." };
    const v = checkTrade(ctx.st.staff, ctx.sh.slots, ctx.r, i, j);
    return v.error ? { t, note: v.error } : { t, v };
  });
}

// Each pick-up request for an open shift, checked against the same hard rules as the sick-call finder.
export function claimRows(state) {
  if (!state.claims.length) return [];
  const ctx = rosterCtx(state);
  return state.claims.map((c) => {
    if (!ctx) return { c, note: "Staff or shifts no longer build; fix them, then publish again." };
    const i = ctx.sh.slots.findIndex((s, k) => ctx.r.owner[k] < 0 && s.day === c.day && s.startMin === c.startMin && s.endMin === c.endMin);
    if (i < 0) return { c, note: "That shift is not open in the current roster (it changed since it was published)." };
    const o = coverOptions(ctx.st.staff, ctx.sh.slots, ctx.r, i);
    if (o.error) return { c, note: o.error };
    const fit = o.fits.find((f) => f.name === c.person);
    if (fit) return { c, fit };
    const bl = o.blocked.find((f) => f.name === c.person);
    return { c, blocked: bl ? bl.reason : "is not eligible for this shift" };
  });
}

const sameShift = (x, y) => x.day === y.day && x.startMin === y.startMin && x.endMin === y.endMin;

// Give the first still-open copy of the shift to the claimant and keep the per-person hours in step.
function applyClaim(state, c) {
  const p = state.published;
  const a = p && p.assignments.find((x) => !x.person && sameShift({ day: x.slot.day, startMin: x.slot.startMin, endMin: x.slot.endMin }, c));
  const q = p && p.people.find((x) => x.name === c.person);
  if (!a || !q) return false;
  a.person = c.person; q.hours += (a.slot.endMin - a.slot.startMin) / 60; p.unfilled = Math.max(0, p.unfilled - 1);
  return true;
}

// Hand a called-out shift to the chosen cover and keep the per-person hours in step.
function applyCover(state, c, name) {
  const p = state.published;
  const a = p && p.assignments.find((x) => x.person === c.person && sameShift({ day: x.slot.day, startMin: x.slot.startMin, endMin: x.slot.endMin }, c));
  const from = p && p.people.find((x) => x.name === c.person), to = p && p.people.find((x) => x.name === name);
  if (!a || !from || !to) return false;
  const h = (a.slot.endMin - a.slot.startMin) / 60;
  a.person = name; from.hours -= h; to.hours += h;
  return true;
}

// Swap the two people on the published roster and keep the per-person hours in step.
function applyTrade(state, t) {
  const p = state.published;
  const find = (x) => p.assignments.find((a) => a.person === x.person && a.slot.day === x.day && a.slot.startMin === x.startMin && a.slot.endMin === x.endMin);
  const A = find(t.a), B = find(t.b);
  if (!A || !B) return false;
  const len = (a) => (a.slot.endMin - a.slot.startMin) / 60;
  const la = len(A), lb = len(B), pa = t.a.person, pb = t.b.person;
  A.person = pb; B.person = pa;
  for (const q of p.people) { if (q.name === pa) q.hours += lb - la; if (q.name === pb) q.hours += la - lb; }
  return true;
}

// BUILD_IN_BROWSER: "Build and publish" runs the roster search in the manager's browser (the same calc.mjs, served at
// /calc.mjs) and posts only who works which shift; the host checks that against every rule and prices it. A free
// Cloudflare Worker allows about 10 ms of CPU a request, and one build takes hundreds of ms (the sample week ~300 ms).
export const BROWSER_BUILD = `<script type="module">
const f = document.querySelector('form[action^="/admin/save"]'), note = document.getElementById("build-note");
let go = false;
f.addEventListener("submit", async (e) => {
  if (go || !e.submitter || e.submitter.value !== "publish") return;
  e.preventDefault();
  note.textContent = " Building in this browser...";
  try {
    const c = await import("/calc.mjs");
    const st = c.parseStaff(f.staff.value, { weekStart: f.weekStart.value.trim() || null }), sh = c.parseShifts(f.shifts.value);
    const errs = [...(st.errors || []), ...(sh.errors || [])];
    if (errs.length) { note.textContent = " " + errs[0]; return; }
    const r = c.buildRoster(st.staff, sh.slots);
    if (r.error) { note.textContent = " " + r.error; return; }
    f.owner.value = JSON.stringify(r.owner);
  } catch (err) { note.textContent = " Could not build here: " + (err && err.message || err); return; }
  go = true;
  const b = document.createElement("input"); b.type = "hidden"; b.name = "act"; b.value = "publish"; f.appendChild(b);
  f.submit();
});
</script>`;

function standbyAdmin(state, k) {
  const on = state.standby || [], hist = [...(state.standbyHistory || [])].reverse().slice(0, 20);
  return `<h2>Standby list (${on.length})</h2><p class="note">Staff join on their page by agreeing in writing to the notice ORS 653.432(1) asks for, and leave there or by asking you. Remove someone the moment they ask; coercing anyone onto the list carries a civil penalty of up to $2,000 a violation (653.432(7)). The list is not the on-call schedule and need not be posted with it (653.432(8)).</p>${on.length ? `<table><thead><tr><th>Person</th><th>Agreed</th><th></th></tr></thead><tbody>${on.map((x) => `<tr><td>${esc(x.person)}</td><td>${esc(String(x.at).slice(0, 16).replace("T", " "))} UTC</td><td><form method="post" action="/admin/standby-remove?key=${k}"><input type="hidden" name="name" value="${esc(x.person)}"><button>Remove (they asked)</button></form></td></tr>`).join("")}</tbody></table>` : ""}${hist.length ? `<p class="note">Record (latest 20 of ${(state.standbyHistory || []).length}): ${hist.map((h) => `${esc(h.person)} ${esc(h.act)} ${esc(String(h.at).slice(0, 10))}${h.by === "manager" ? " (by manager)" : ""}`).join("; ")}.</p>` : ""}`;
}

const slotText = (x) => `${esc(DAYS[x.day])} ${esc(fmtClock(x.startMin))}-${esc(fmtClock(x.endMin))}`;

function adminPage(state, key, note = "", browserBuild = false, clockOn = false, fww = null) {
  const k = esc(key), p = state.published, sbOn = !!(fww && fww.standby);
  const calls = calloutRows(state).map(({ c, fits, note: n }, i) => `<tr><td><strong>${esc(c.person)}</strong> cannot make ${esc(DAYS[c.day])} ${esc(fmtClock(c.startMin))}-${esc(fmtClock(c.endMin))}${c.note ? `<br><span class="note">"${esc(c.note)}"</span>` : ""}</td><td>${n ? esc(n) : fits.length ? fits.map((f) => `${esc(f.name)} (${f.extraCost >= 0 ? "+" : "-"}${esc(money(Math.abs(f.extraCost)))}${f.overtimeAfter > 0 ? ", overtime" : ""})`).join("; ") : "nobody free can take it without changing someone else's week"}</td><td>${fits && fits.length ? `<form method="post" action="/admin/cover?key=${k}"><input type="hidden" name="i" value="${i}">${fits.map((f) => `<button name="name" value="${esc(f.name)}">Give to ${esc(f.name)}${(c.standbyAccepts || []).some((a) => a.person === f.name) ? " (said yes from the standby list)" : (c.accepts || []).some((a) => a.person === f.name) ? " (said yes to the team offer)" : ""}</button>`).join(" ")}</form>` : ""}${n || !sbOn ? "" : c.standbyAskedAt ? `<p class="note">Standby list asked ${esc(String(c.standbyAskedAt).slice(0, 16).replace("T", " "))} UTC (${(c.standbyAsked || []).map(esc).join(", ")}). ${(c.standbyAccepts || []).length ? `Said yes: ${c.standbyAccepts.map((a) => esc(a.person)).join(", ")}.` : "Nobody has said yes yet."}</p>` : standbyNotAsked(state, c).length ? `<form method="post" action="/admin/standby-ask?key=${k}"><input type="hidden" name="i" value="${i}"><button>Ask the standby list (${standbyNotAsked(state, c).length})</button></form>` : ""}${n ? "" : c.offeredAt ? `<p class="note">Offered to the whole team ${esc(String(c.offeredAt).slice(0, 16).replace("T", " "))} UTC. ${(c.accepts || []).length ? `Said yes: ${(c.accepts || []).map((a) => esc(a.person)).join(", ")}. Giving it to one of them logs the added shift as taken from the offer.` : "Nobody has said yes yet."}</p>` : `<form method="post" action="/admin/offer?key=${k}"><input type="hidden" name="i" value="${i}"><button>Offer to the whole team</button></form>`}</td></tr>`).join("");
  const callBlock = state.callouts.length ? `<h2>Call-outs (${state.callouts.length})</h2><p class="note">"Offer to the whole team" posts the shift on the staff page (and to the team webhook) as a written group offer saying taking it is voluntary. Where FAIR_WORKWEEK is seattle or oregon, the hours someone takes from that offer owe no predictability pay; giving the shift straight to someone does.${sbOn ? ` In Oregon that holds only once everyone on the standby list has been asked (ORS 653.455(3)(k)(C)), so ask the standby list first; hours someone on it agrees to owe nothing (ORS 653.432(4)).` : ""}</p><table><thead><tr><th>Request</th><th>Could cover, cheapest first</th><th></th></tr></thead><tbody>${calls}</tbody></table><form method="post" action="/admin/clear-callouts?key=${k}"><button>Clear call-outs</button></form>` : "";
  const tr = tradeRows(state).map(({ t, v, note: n }, i) => `<tr><td><strong>${esc(t.a.person)}</strong> gives ${slotText(t.a)}<br><strong>${esc(t.b.person)}</strong> gives ${slotText(t.b)}${t.note ? `<br><span class="note">"${esc(t.note)}"</span>` : ""}</td><td>${n ? esc(n) : v.ok ? `<span class="ok">Keeps both weeks inside the rules</span> (payroll ${v.extraCost >= 0 ? "+" : "-"}${esc(money(Math.abs(v.extraCost)))})` : `<span class="err">Blocked:</span> ${v.problems.map((x) => `${esc(x.name)} ${esc(x.reason)}`).join("; ")}`}</td><td><form method="post" action="/admin/trade?key=${k}"><input type="hidden" name="i" value="${i}"><button name="act" value="approve" ${v && v.ok ? "" : "disabled"}>Approve</button><button name="act" value="decline">Decline</button></form></td></tr>`).join("");
  const tradeBlock = state.trades.length ? `<h2>Trade requests (${state.trades.length})</h2><table><thead><tr><th>Request</th><th>Check</th><th></th></tr></thead><tbody>${tr}</tbody></table>` : "";
  const cl = claimRows(state).map(({ c, fit, blocked, note: n }, i) => `<tr><td><strong>${esc(c.person)}</strong> asks to take ${slotText(c)}${c.note ? `<br><span class="note">"${esc(c.note)}"</span>` : ""}</td><td>${n ? esc(n) : fit ? `<span class="ok">Fits inside the rules</span> (payroll ${fit.extraCost >= 0 ? "+" : "-"}${esc(money(Math.abs(fit.extraCost)))}${fit.overtimeAfter > 0 ? ", overtime" : ""})` : `<span class="err">Blocked:</span> ${esc(c.person)} ${esc(blocked)}`}</td><td><form method="post" action="/admin/claim?key=${k}"><input type="hidden" name="i" value="${i}">${fit ? `<button name="act" value="approve">Approve</button>` : blocked ? `<button name="act" value="override">Approve anyway</button>` : ""}<button name="act" value="decline">Decline</button></form></td></tr>`).join("");
  const ocs = onCallShifts(state.published, state.onCall || {});
  const ocRow = (x) => `<tr><td><strong>${esc(x.person)}</strong></td><td>${esc(slotLabel(x.slot))}</td><td>${x.status === "waiting" ? `<form method="post" action="/admin/oncall?key=${k}"><input type="hidden" name="key" value="${esc(x.key)}"><button name="act" value="called">Called in</button><button name="act" value="released">Not needed</button></form>` : x.status === "called" ? "Called in" : "Not needed (logged on the changes page)"}</td></tr>`;
  const onCallBlock = ocs.length ? `<h2>On-call shifts (${ocs.filter((x) => x.status === "waiting").length} waiting)</h2><p class="note">Shifts whose label says "on-call". Mark each one called in or not needed as soon as you know: "Not needed" is logged as hours taken away and priced on the <a href="/admin/changes?key=${k}">changes page</a>; one still waiting when it ends is counted there as never called in.</p><table><thead><tr><th>Person</th><th>Shift</th><th></th></tr></thead><tbody>${ocs.map(ocRow).join("")}</tbody></table>` : "";
  const claimBlock = state.claims.length ? `<h2>Open-shift requests (${state.claims.length})</h2><p class="note">A shift is open because nobody on the staff list was free for it. A request that breaks a standing rule can still be approved, as your decision, once you have agreed it with the person (they said yes to a one-off). It is the rule shown, not a check, that you are overriding.</p><table><thead><tr><th>Request</th><th>Check</th><th></th></tr></thead><tbody>${cl}</tbody></table>` : "";
  const ofs = state.offs.map((o, i) => `<tr><td><strong>${esc(o.person)}</strong> asks for ${esc(o.entry.replace("..", " to "))} off${o.note ? `<br><span class="note">"${esc(o.note)}"</span>` : ""}</td><td><form method="post" action="/admin/timeoff?key=${k}"><input type="hidden" name="i" value="${i}"><button name="act" value="approve">Add to staff list</button><button name="act" value="decline">Decline</button></form></td></tr>`).join("");
  // Nothing is sent by the server (no SMS or email bill): each link opens the manager's own messaging app with the
  // person's shifts typed in, so they pick the contact and press send.
  const tell = p ? rosterMessages(p, p.weekStart).map((m) => `<tr><td><strong>${esc(m.person)}</strong><br><span class="note">${esc(m.text).replace(/\n/g, "<br>")}</span></td><td><a href="sms:?&amp;body=${esc(encodeURIComponent(m.text))}">Text</a> · <a href="mailto:?subject=${esc(encodeURIComponent("Your shifts" + (p.weekStart ? ", week of " + p.weekStart : "")))}&amp;body=${esc(encodeURIComponent(m.text))}">Email</a></td></tr>`).join("") : "";
  const tellBlock = tell ? `<h2>Tell the team</h2><p class="note">Nothing is sent from this server. Each link opens your own text or email app with that person's shifts filled in; you choose the contact and press send.</p><table><tbody>${tell}</tbody></table>` : "";
  const offBlock = state.offs.length ? `<h2>Time-off requests (${state.offs.length})</h2><p class="note">Approving adds the dates to that person's <code>off:</code> cell in the staff list. It applies only to the week whose Monday you set above, and does not change a roster you already published.</p><table><thead><tr><th>Request</th><th></th></tr></thead><tbody>${ofs}</tbody></table>` : "";
  const replies = state.replies.map((r) => esc(r.line)).join("\n");
  return page("Roster admin", `${note}
<form method="post" action="/admin/save?key=${k}"><label>Week starting (a Monday, YYYY-MM-DD)<input name="weekStart" value="${esc(state.weekStart)}" placeholder="2026-10-19"></label>
<label>Staff<textarea name="staff">${esc(state.staff || sampleStaff())}</textarea></label>
<label>Shifts to cover<textarea name="shifts">${esc(state.shifts || sampleShifts())}</textarea></label>
<button name="act" value="save">Save</button><button name="act" value="publish">Build and publish</button>${browserBuild ? `<input type="hidden" name="owner" value=""><span class="note" id="build-note"></span>` : ""}</form>${browserBuild ? BROWSER_BUILD : ""}
${tellBlock}
${callBlock}
${tradeBlock}
${onCallBlock}
${sbOn ? standbyAdmin(state, k) : ""}
${claimBlock}
${offBlock}
<h2>Availability replies (${state.replies.length})</h2>
<form method="post" action="/admin/merge?key=${k}"><textarea name="replies" readonly>${replies}</textarea><button ${state.replies.length ? "" : "disabled"}>Merge into staff list</button></form>
<p class="note">${p ? `Published ${esc(p.at)}: ${p.unfilled} open shift(s).` : "Nothing published yet."} Staff link: <code>/team?t=TEAM_TOKEN</code></p><p><a href="/admin/changes?key=${k}">Schedule changes and notice pay</a> (${(state.changeLog || []).length} change(s) logged)</p>${clockOn ? `<p><a href="/admin/timesheet?key=${k}">Timesheet: hours worked against the schedule</a> (${(state.punches || []).length} punch(es) recorded) · <a href="/admin/leave?key=${k}">Leave balances</a> · <a href="/admin/payroll?key=${k}">Payroll import file</a></p>` : ""}<p class="note"><a href="/admin/export.json?key=${k}">Download a backup</a> of everything this hub holds (one JSON file; it includes wages, so keep it private).</p>`);
}

// The manager's timesheet for a published week (the current one or one of the last 12): worked time beside the
// schedule, with the flags a payroll check needs, a missed-punch form and a CSV for payroll.
export function weeksOf(state) {
  const p = state.published;
  return [...(p && p.weekStart ? [p] : []), ...[...(state.history || [])].reverse()].filter((w) => w.weekStart);
}
// Each person's wage from the published week's staff list (or the current one): name -> hourly rate.
export function wagesOf(state) {
  const text = state.published && typeof state.published.staffText === "string" ? state.published.staffText : state.staff;
  const m = new Map();
  try { for (const p of parseStaff(text || "").staff || []) if (Number.isFinite(Number(p.wage)) && Number(p.wage) > 0) m.set(p.name, Number(p.wage)); } catch { /* no wages */ }
  return m;
}
const RULE_NAME = { federal: "federal (over 40 a week)", california: "California (daily, double time, seventh day, meal periods)", alaska: "Alaska (over 8 a day or 40 a week)", colorado: "Colorado (over 12 a day, 12 in a row or 40 a week)",
  nevada: "Nevada (over 8 in a 24-hour workday under 1.5x the minimum wage, or 40 a week; meal period)" };
RULE_NAME.kentucky = "Kentucky (over 40 a week, the seventh day at 1.5x; meal-period check from the US DOL state table)";
for (const [k, v] of Object.entries(MEAL_RULES)) if (!Object.hasOwn(RULE_NAME, k)) RULE_NAME[k] = `${v.name} (over 40 a week; meal-period check from the US DOL state table)`;
const cents = (x) => {
  const format = (x) => "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!(Number(x) < 0)) return format(x);
  const text = format(Math.abs(x));
  return /[1-9]/.test(text) ? `-${text}` : text;
};
export function payTable(rows, pay) {
  const h = (x) => x.toFixed(2);
  const body = rows.map((r) => `<tr><td><strong>${esc(r.name)}</strong></td><td>${h(r.regularH)}</td><td>${h(r.overtimeH)}</td><td>${h(r.doubleH)}</td><td>${r.mealPremiumDays || ""}</td><td>${r.regularRate == null ? "" : esc(cents(r.regularRate))}</td><td>${r.gross == null ? "" : esc(cents(r.gross))}</td><td>${esc([...r.flags, ...r.notes, pay.roundMin && r.roundNetMin ? `rounding ${r.roundNetMin > 0 ? "+" : ""}${Math.round(r.roundNetMin)} min` : ""].filter(Boolean).join("; "))}</td></tr>`).join("");
  const tot = rows.reduce((t, r) => t + (r.gross || 0), 0);
  return `<h2>Pay estimate: ${esc(Object.hasOwn(RULE_NAME, pay.rules) ? RULE_NAME[pay.rules] : pay.rules)}</h2><p class="note">Set PAY_RULES to federal, california, alaska, colorado, nevada or a state with a meal-period law (washington, oregon, connecticut, delaware, illinois, kentucky, maine, massachusetts, minnesota, new-hampshire, rhode-island, tennessee, west-virginia; two-letter codes work)${pay.rules === "nevada" ? `, MIN_WAGE (now ${esc(cents(pay.minWage ?? 12))}) and NV_FOUR_TENS=1 for an agreed four 10s` : ""}${pay.rules === "california" ? "" : `, PUNCH_ROUND_MIN to 5, 6 or 15 to round punches (now ${pay.roundMin || "off"})`}. ${pay.notes.map(esc).join(" ")} Wages from the published staff list; overtime at the regular rate's 1.5x, double time 2x${pay.rules === "california" ? ", one extra hour for a day with a missed meal break (a break is a clock-out of 30 min or more)" : Object.hasOwn(MEAL_RULES, pay.rules) ? "; meal-period flags carry no premium in this state's table, but a missed break can still be a violation" : ""}. An estimate to check before payroll: tips, bonuses, differentials, local ordinances and union rules are not in it.</p>
<table><thead><tr><th>Person</th><th>Regular h</th><th>Overtime h (1.5x)</th><th>Double h (2x)</th><th>Meal premium days</th><th>Regular rate</th><th>Est. gross</th><th>Check</th></tr></thead><tbody>${body || `<tr><td colspan="8">No closed stretches this week.</td></tr>`}</tbody><tfoot><tr><td colspan="6">Total</td><td>${esc(cents(tot))}</td><td></td></tr></tfoot></table>`;
}
function timesheetPage(state, key, tc, weekStart, note = "") {
  const k = esc(key), weeks = weeksOf(state), week = weeks.find((w) => w.weekStart === weekStart) || weeks[0];
  if (!week) return page("Timesheet", `${note}<p>Set the week's Monday and publish it first; the timesheet reads punches against the published week.</p><p><a href="/admin?key=${k}">Back to admin</a></p>`);
  const ts = timesheet(state.punches, week, { tz: tc.tz, nowMs: tc.now, graceMin: tc.grace });
  const pick = weeks.length > 1 ? `<form method="get" action="/admin/timesheet"><input type="hidden" name="key" value="${k}"><label>Week<select name="week">${weeks.map((w) => `<option${w.weekStart === week.weekStart ? " selected" : ""}>${esc(w.weekStart)}</option>`).join("")}</select></label><button>Show</button></form>` : "";
  const DAYN = DAYS;
  const sum = ts.people.map((x) => `<tr><td><strong>${esc(x.name)}</strong></td><td>${x.workedH.toFixed(2)}</td><td>${x.scheduledH.toFixed(2)}</td><td>${(x.workedH - x.scheduledH >= 0 ? "+" : "") + (x.workedH - x.scheduledH).toFixed(2)}</td><td>${[x.overH > 0 ? `<span class="err">${x.overH.toFixed(2)} h over ${ts.overtimeAfter}</span>` : "", x.noShow.length ? `<span class="err">no punch:</span> ${x.noShow.map((n) => `${esc(DAYN[n.day])} ${esc(fmtClock(n.startMin))}`).join(", ")}` : "", x.missing.length ? `<span class="err">${x.missing.length} punch(es) unpaired</span>` : ""].filter(Boolean).join("; ")}</td></tr>`).join("");
  const det = ts.people.flatMap((x) => [
    ...x.rows.map((r) => { const i = ts.local(r.inAt), o = r.outAt != null ? ts.local(r.outAt) : null; return `<tr><td>${esc(x.name)}</td><td>${esc(i.date)}</td><td>${esc(i.time)}</td><td>${o ? esc(o.time) : ""}</td><td>${r.open ? "" : (r.minutes / 60).toFixed(2)}</td><td>${r.shift ? `${esc(DAYN[r.shift.day])} ${esc(fmtClock(r.shift.startMin))}-${esc(fmtClock(r.shift.endMin))}` : ""}</td><td>${esc(r.flags.join("; "))}</td></tr>`; }),
    ...x.missing.map((m) => { const t = ts.local(m.at); return `<tr><td>${esc(x.name)}</td><td>${esc(t.date)}</td><td>${m.kind === "no-out" ? esc(t.time) : ""}</td><td>${m.kind === "no-in" ? esc(t.time) : ""}</td><td></td><td></td><td class="err">${m.kind === "no-out" ? "missing clock-out" : "missing clock-in"}</td></tr>`; }),
  ]).join("");
  const names = [...new Set([...(state.published ? state.published.people.map((q) => q.name) : []), ...ts.people.map((x) => x.name)])];
  const recent = [...(state.punches || [])].sort((a, b) => b.at - a.at).slice(0, 30).map((x) => { const t = ts.local(x.at); return `<tr><td>${esc(x.person)}</td><td>${x.kind === "in" ? "in" : "out"}</td><td>${esc(t.date)} ${esc(t.time)}</td><td>${x.by === "manager" ? "manager" : "staff"}</td><td><form method="post" action="/admin/punch-remove?key=${k}"><input type="hidden" name="id" value="${x.id}"><input type="hidden" name="week" value="${esc(week.weekStart)}"><button>Remove</button></form></td></tr>`; }).join("");
  return page(`Timesheet, week of ${week.weekStart}`, `${note}${pick}<p class="note">Times are ${esc(ts.tz)} (set TIMEZONE to your site's zone, for example America/Chicago). Late and early flags allow ${ts.graceMin} min (TIME_GRACE_MIN). The pay estimate below applies the PAY_RULES you set; check it against your own state's rules before paying.</p>
<table><thead><tr><th>Person</th><th>Worked h</th><th>Scheduled h</th><th>Difference</th><th>Check</th></tr></thead><tbody>${sum || `<tr><td colspan="5">No punches or shifts this week.</td></tr>`}</tbody></table>
<p><a href="/admin/timesheet.csv?key=${k}&amp;week=${esc(week.weekStart)}">Download CSV for payroll</a> · <a href="/admin/payroll?key=${k}&amp;week=${esc(week.weekStart)}">Fill your payroll service's template</a> · ${tc.leave ? `<a href="/admin/leave?key=${k}">${esc(tc.leave.name || "Leave")} balances</a> · ` : ""}<a href="/admin?key=${k}">Back to admin</a></p>
${tc.pay ? payTable(payForTimesheet(ts, wagesOf(state), tc.pay), tc.pay) : ""}
<h2>Every stretch worked</h2><table><thead><tr><th>Person</th><th>Date</th><th>In</th><th>Out</th><th>Hours</th><th>Scheduled shift</th><th>Flags</th></tr></thead><tbody>${det}</tbody></table>
<h2>Add a missed punch</h2><form method="post" action="/admin/punch-add?key=${k}"><input type="hidden" name="week" value="${esc(week.weekStart)}"><label>Person<select name="name" required>${names.map((n) => `<option>${esc(n)}</option>`).join("")}</select></label><label>Date<input type="date" name="date" required></label><label>Time (HH:MM, ${esc(ts.tz)})<input name="time" required placeholder="09:00" maxlength="5"></label><button name="kind" value="in">Add clock-in</button><button name="kind" value="out">Add clock-out</button></form><p class="note">Added punches are marked "added by manager" here and in the CSV, so the record shows what was typed in later.</p>
<h2>Latest punches</h2><table><thead><tr><th>Person</th><th></th><th>When</th><th>By</th><th></th></tr></thead><tbody>${recent}</tbody></table>
${pinSection(state, k, week.weekStart, names, tc)}`);
}

// The payroll provider's own template, filled from the week's timesheet (payroll-export.mjs). The manager saves the
// template's header row, payroll IDs and any column fixes once; each week is then one download.
const MAX_TEMPLATE = 4000, MAX_IDS = 16 * 1024, MAX_OVERRIDES = 4000;
export function payrollFile(state, tc, week) {
  const cfg = state.payrollTemplate || {};
  if (!cfg.header) return { error: "No template saved yet." };
  const ts = timesheet(state.punches, week, { tz: tc.tz, nowMs: tc.now, graceMin: tc.grace });
  const pay = payForTimesheet(ts, wagesOf(state), tc.pay);
  const rows = payrollRows(pay, { weekStart: week.weekStart, leaveUses: tc.leave && !tc.leave.error ? state.leaveUses || [] : [], ids: parseIds(cfg.ids) });
  const ov = parseOverrides(cfg.overrides);
  const out = fillTemplate(cfg.header, rows, { overrides: ov.map, zeros: cfg.zeros === "zero" ? "zero" : "blank" });
  return out.error ? out : { ...out, rows, overrideErrors: ov.errors, open: ts.people.filter((x) => x.rows.some((r) => r.open) || x.missing.length).map((x) => x.name) };
}
function payrollPage(state, key, tc, weekStart, note = "") {
  const k = esc(key), weeks = weeksOf(state), week = weeks.find((w) => w.weekStart === weekStart) || weeks[0];
  const cfg = state.payrollTemplate || {};
  const back = `<p><a href="/admin/timesheet?key=${k}${week ? `&amp;week=${esc(week.weekStart)}` : ""}">Timesheet</a> · <a href="/admin?key=${k}">Back to admin</a></p>`;
  let preview = "";
  if (!week) preview = `<p>Publish a week first: the file is filled from the timesheet of a published week.</p>`;
  else if (cfg.header) {
    const f = payrollFile(state, tc, week);
    if (f.error) preview = `<p class="err">${esc(f.error)}</p>`;
    else {
      const pick = weeks.length > 1 ? `<form method="get" action="/admin/payroll"><input type="hidden" name="key" value="${k}"><label>Week<select name="week">${weeks.map((w) => `<option${w.weekStart === week.weekStart ? " selected" : ""}>${esc(w.weekStart)}</option>`).join("")}</select></label><button>Show</button></form>` : "";
      const how = { name: "matched by name", guess: '<span class="err">guessed</span>: check it', "you chose": "you chose", "fixed value": "fixed value", "no match": '<span class="err">left empty</span>' };
      const cols = f.columns.map((c) => `<tr><td><code>${esc(c.header)}</code></td><td>${c.value != null ? `"${esc(c.value)}"` : c.field ? esc(FIELDS[c.field].label) : ""}</td><td>${how[c.how] || ""}</td></tr>`).join("");
      const lines = f.csv.trim().split(/\r?\n/);
      const grid = lines.slice(0, 26).map((l, i) => `<tr>${splitCsvLine(l, f.sep).map((x) => (i ? `<td>${esc(x)}</td>` : `<th>${esc(x)}</th>`)).join("")}</tr>`).join("");
      const warn = [...f.overrideErrors, ...f.warnings, ...(f.open.length ? [`Still on the clock or with an unpaired punch: ${f.open.join(", ")}. Their open stretch is not counted; fix it on the timesheet first.`] : [])];
      preview = `<h2>Week of ${esc(week.weekStart)}</h2>${pick}${warn.length ? `<ul>${warn.map((w) => `<li class="err">${esc(w)}</li>`).join("")}</ul>` : `<p class="ok">Every column is filled or deliberately empty.</p>`}
<p><a href="/admin/payroll.csv?key=${k}&amp;week=${esc(week.weekStart)}"><strong>Download the filled template</strong></a> (${f.rows.length} people)</p>
<h3>How each column is filled</h3><table><thead><tr><th>Column in your template</th><th>Filled with</th><th>How</th></tr></thead><tbody>${cols}</tbody></table>
<h3>The file</h3><div style="overflow-x:auto"><table>${grid}</table></div>${lines.length > 26 ? `<p class="note">First 25 rows shown.</p>` : ""}`;
    }
  }
  const fields = Object.entries(FIELDS).map(([key, f]) => `<code>${esc(key)}</code> (${esc(f.label)})`).join(", ");
  const pick = `<script>document.querySelectorAll("input[data-template]").forEach(function(i){i.addEventListener("change",function(){var f=i.files&&i.files[0];if(!f)return;f.slice(0,65536).text().then(function(t){var l=t.replace(/^\uFEFF/,"").split(/\r?\n/).filter(function(x){return x.trim()})[0]||"";document.getElementById("header").value=l})})})</script>`;
  return page("Payroll import file", `${note}<p class="note">Your payroll service imports hours from a spreadsheet, and each service wants its own columns. Download the blank hours template from your payroll service (Gusto, ADP, Paychex, QuickBooks and others offer one on their run-payroll or import screen), choose it below or paste its first row, and save. Each week this page fills the same columns, in the same order, from the timesheet and the pay rules on this server. Nothing is sent to your payroll service from here: you download the file and upload it there yourself.</p>
${preview}
<h2>Your template</h2><form method="post" action="/admin/payroll-template?key=${k}"><input type="hidden" name="week" value="${week ? esc(week.weekStart) : ""}">
<label>Blank template file (only its first row is read, in your browser)<input type="file" accept=".csv,.txt,text/csv" data-template></label>
<label>Header row<textarea id="header" name="header" maxlength="${MAX_TEMPLATE}" style="min-height:4rem" placeholder="Employee ID,First Name,Last Name,Regular Hours,Overtime Hours">${esc(cfg.header || "")}</textarea></label>
<label>Payroll IDs, one per line as <code>Name = ID</code> (as your payroll service shows them; leading zeros kept)<textarea name="ids" maxlength="${MAX_IDS}" placeholder="Ana Ruiz = 000123">${esc(cfg.ids || "")}</textarea></label>
<label>Column fixes, one per line: <code>Column = field</code> to choose what fills a column, <code>Column = blank</code> to leave it empty, or <code>Column = "value"</code> for the same value on every row (a company code or batch ID)<textarea name="overrides" maxlength="${MAX_OVERRIDES}" style="min-height:5rem" placeholder='Co Code = "ABC"'>${esc(cfg.overrides || "")}</textarea></label>
<label><input type="checkbox" name="zeros" value="zero" style="width:auto"${cfg.zeros === "zero" ? " checked" : ""}> Write 0.00 for zero hours (default: leave the cell empty)</label>
<button>Save template</button></form>
<p class="note">Fields: ${fields}. A column whose name is not recognised is left empty and listed above; a guessed column is marked so you can check it. The hours are the estimate from PAY_RULES (regular, 1.5x and 2x), leave hours are those recorded on the leave page inside the week, and the rate and gross come from the wages in the staff list. Check the file in your payroll service's preview before you submit payroll: tips, bonuses, differentials and local rules are not in it.</p>
${back}${pick}`);
}

// Accrued leave from the time clock (leave.mjs): each person's balance, the uses the manager recorded, a form to record
// one, and opening balances carried over from another system. Off until LEAVE_ACCRUAL is set.
function leavePage(state, key, tc, note = "") {
  const k = esc(key), L = tc.leave;
  if (!L) return page("Leave balances", `${note}<p>Leave tracking is off. Set LEAVE_ACCRUAL to your policy's rate, for example <code>LEAVE_ACCRUAL=1/30</code> for one hour earned per 30 hours worked, and optionally LEAVE_YEAR_CAP, LEAVE_BALANCE_CAP, LEAVE_CARRYOVER_CAP (hours) and LEAVE_YEAR_START (MM-DD, default 01-01).</p><p><a href="/admin?key=${k}">Back to admin</a></p>`);
  if (L.error) return page("Leave balances", `${note}<p class="err">${esc(L.error)}</p><p><a href="/admin?key=${k}">Back to admin</a></p>`);
  const rows = leaveBalances(state, L, { tz: tc.tz, nowMs: tc.now });
  const h = (x) => x.toFixed(2);
  const body = rows.map((r) => `<tr><td><strong>${esc(r.name)}</strong></td><td>${r.year}</td><td>${h(r.workedH)}</td><td>${h(r.earnedH)}</td><td>${h(r.usedH)}</td><td><strong>${h(r.balanceH)}</strong></td><td>${r.flags.map((f) => (/more than the balance/.test(f) ? `<span class="err">${esc(f)}</span>` : esc(f))).join("; ")}</td></tr>`).join("");
  const names = [...new Set([...(state.published ? state.published.people.map((p) => p.name) : []), ...rows.map((r) => r.name)])].sort((a, b) => a.localeCompare(b));
  const opt = names.map((n) => `<option>${esc(n)}</option>`).join("");
  const uses = [...(state.leaveUses || [])].sort((a, b) => b.at - a.at).slice(0, 50).map((u) => `<tr><td>${esc(u.person)}</td><td>${esc(u.date)}</td><td>${h(u.hours)}</td><td>${esc(u.note || "")}</td><td><form method="post" action="/admin/leave-remove?key=${k}"><input type="hidden" name="id" value="${u.id}"><button>Remove</button></form></td></tr>`).join("");
  const opening = Object.entries(state.leaveOpening || {}).map(([n, o]) => `${esc(n)} ${h(o.hours)} h`).join(", ");
  const caps = [L.yearCap != null ? `at most ${L.yearCap} h earned per leave year` : "", L.balanceCap != null ? `a balance of at most ${L.balanceCap} h (earning pauses there)` : "", L.carryCap != null ? `at most ${L.carryCap} h carried into a new leave year` : ""].filter(Boolean);
  return page(`${L.name} balances`, `${note}<p class="note">Policy as set on this server: ${esc(L.label)}${caps.length ? "; " + esc(caps.join("; ")) : "; no caps"}; the leave year starts ${esc(L.yearStart)} (${esc(tc.tz)}). ${L.notes.map(esc).join(" ")} Earned from closed clock-in/clock-out stretches, so hours worked off the clock are not counted. These are the numbers you typed, not any state's or city's rule: check your own law for the rate, caps, carryover, waiting period, front-loading and who is covered.</p>
<table><thead><tr><th>Person</th><th>Leave year</th><th>Worked h</th><th>Earned h</th><th>Used h</th><th>Balance h</th><th>Check</th></tr></thead><tbody>${body || `<tr><td colspan="7">No punches or leave recorded yet.</td></tr>`}</tbody></table>
<p><a href="/admin/leave.csv?key=${k}">Download leave CSV</a> · <a href="/admin/timesheet?key=${k}">Timesheet</a> · <a href="/admin?key=${k}">Back to admin</a></p>
<h2>Record leave taken</h2><form method="post" action="/admin/leave-use?key=${k}"><label>Person<select name="name" required>${opt}</select></label><label>Date<input type="date" name="date" required></label><label>Hours<input name="hours" inputmode="decimal" required placeholder="8" maxlength="5"></label><label>Note<input name="note" maxlength="140"></label><button>Record</button></form>
<table><thead><tr><th>Person</th><th>Date</th><th>Hours</th><th>Note</th><th></th></tr></thead><tbody>${uses || `<tr><td colspan="5">None recorded.</td></tr>`}</tbody></table>
<h2>Opening balances</h2><p class="note">Moving from another system or paper? Set each person's balance as of now; hours worked from now on add to it. Leave the hours empty to clear one. ${opening ? "Set: " + opening + "." : "None set."}</p>
<form method="post" action="/admin/leave-opening?key=${k}"><label>Person<select name="name" required>${opt}</select></label><label>Balance now (h)<input name="hours" inputmode="decimal" maxlength="7"></label><button>Set</button></form>`);
}

// Clock PINs and the geofence's settings, on the timesheet page. A PIN is shown only once, as typed; it is stored hashed.
function pinSection(state, k, weekStart, names, tc) {
  const rows = names.map((n) => `<tr><td>${esc(n)}</td><td>${hasPin(state, n) ? "set" : tc.pinRequired ? `<span class="err">none (cannot punch)</span>` : "none"}</td></tr>`).join("");
  const f = tc.fence;
  const fenceNote = !f ? "Off. Set CLOCK_GEOFENCE=lat,lon,radius_m (for example 41.8789,-87.6359,150) to check how far from the site each punch is made; CLOCK_GEOFENCE_MODE=block refuses far punches instead of flagging them. Tell your staff before you turn it on."
    : f.error ? `<span class="err">${esc(f.error)}</span>` : `On: ${f.radius} m around ${f.lat}, ${f.lon}, ${f.mode === "block" ? "far punches and punches with no location are refused" : "far punches and punches with no location are flagged above"}. Only the distance is stored, never where the phone was.`;
  return `<h2>Clock PINs</h2><p class="note">${tc.pinRequired ? "CLOCK_PIN=required: everyone needs a PIN to punch." : "A person with a PIN must type it to punch; people without one punch as before. Set CLOCK_PIN=required to make everyone use one."} Five wrong PINs in 15 minutes lock that person's punches for 15 minutes. PINs are stored hashed; you cannot read one back, only set a new one.</p>
<table><thead><tr><th>Person</th><th>PIN</th></tr></thead><tbody>${rows}</tbody></table>
<form method="post" action="/admin/pin?key=${k}" autocomplete="off"><input type="hidden" name="week" value="${esc(weekStart)}"><label>Person<select name="name" required>${names.map((n) => `<option>${esc(n)}</option>`).join("")}</select></label><label>New PIN (4-8 digits)<input name="pin" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" autocomplete="off"></label><button name="act" value="set">Set PIN</button><button name="act" value="clear">Remove PIN</button></form>
<h2>Where punches come from</h2><p class="note">${fenceNote}</p>`;
}

// Predictive scheduling: every logged change to a posted week, newest first, with its notice and the premium under the
// FAIR_WORKWEEK rule set; shifts posted with too little notice; short rests in the current week. notice.mjs.
const $ = (x) => {
  const format = (x) => (x == null ? "" : "$" + x.toFixed(2));
  if (!(Number(x) < 0)) return format(x);
  const text = format(Math.abs(x));
  return /[1-9]/.test(text) ? `-${text}` : text;
};
const r2h = (x) => Math.round(x * 100) / 100;
// The rest rule in words, for the rule-set note, and the short-rest table's pay heading.
function restRule(r) {
  if (!(r.restHours > 0)) return "no rest-between-shifts premium in this rule set";
  const after = r.restAcross ? `a shift starting under ${r.restHours} h after the end of a prior day's shift` : `hours worked under ${r.restHours} h after the last shift`;
  const parts = [];
  if (r.restMult > 1) parts.push(r.restWhole ? `${r.restMult}x for the whole later shift` : `${r.restMult}x`);
  if (r.restFlat > 0) parts.push(`${$(r.restFlat)} each`);
  if (!parts.length) return `${after}: nothing priced`;
  return r.restWhole || r.restFlat > 0 ? `${after} pays ${parts.join(" plus ")}` : `${after} are paid at ${parts.join(" plus ")}`;
}
// A flat per-change table in words (New York City 20-1222(a)).
function flatRule(r) {
  const band = (t, i) => (i === 0 ? `${r.noticeDays} to ${r2h(t.fromH / 24)} days` : t.fromH > 0 ? `${r2h(r.flat[i - 1].fromH / 24)} days to ${t.fromH} h` : `under ${r.flat[i - 1].fromH} h`);
  return `a change made inside that window${r.noticeFromWeek ? ", counted to 12:00 a.m. on the week's first day," : ""} owes a flat sum per change: ${r.flat.map((t, i) => `${band(t, i)}, ${$(t.add)} added or moved, ${$(t.cut)} hours taken away`).join("; ")}${r.minEdgeMin ? `; a start and an end each moved by ${r.minEdgeMin} min or less owe nothing` : ""}`;
}
// Hours of pay by notice tier in words (San Francisco, Emeryville, Berkeley, Evanston).
function tierRule(r) {
  const t = r.tiers, parts = t.map((x, i) => {
    const band = x.fromH > 0 ? `under ${r.noticeDays} days and ${x.fromH} h or more` : `under ${t[i - 1] ? t[i - 1].fromH : 24} h`;
    const cut = x.cutLostCap ? `hours taken away the lesser of the hours taken away and ${x.cutLostCap} h` : x.cutShiftCap ? `hours taken away the lesser of the shift's hours and ${x.cutShiftCap} h` : x.cut !== x.add ? `hours taken away ${x.cut} h` : "";
    const size = x.overH != null ? ` (${x.over} h when more than ${x.overH} h change)` : "";
    return `${band}, ${x.add} h of pay per change${size}${cut ? `, ${cut}` : ""}`;
  });
  const oc = r.onCallPay ? `; an on-call shift not called in, or released under ${r.onCallPay.windowH} h ahead, ${r.onCallPay.small} h (${r.onCallPay.overH} h or shorter) or ${r.onCallPay.big} h` : "";
  const cover = r.coverAbsenceDays > 0 ? `; covering a colleague's absence reported under ${r.coverAbsenceDays} days ahead owes nothing` : "";
  const edge = r.minEdgeMin ? `; ${r.minEdgeMin} min or less added or taken at a start or end owes nothing` : "";
  const grace = !r.minEdgeMin && r.minExtendMin ? `; up to ${r.minExtendMin} min added ${r.extendEach ? "at the start and again at the end" : "to a shift"} owes nothing` : "";
  const date = r.pairDates ? "; a shift moved to another day is one change" : "";
  return `a change made inside that window owes ${parts.join("; ")}${edge}${grace}${date}${oc}${cover}`;
}
const restHead = (r) => (r.restMult > 1 ? `Extra pay (${r2h(r.restMult - 1)}x${r.restFlat > 0 ? ` + ${$(r.restFlat)}` : ""})` : `Owed (${$(r.restFlat || 0)} each)`);
function changesPage(state, key, fww, rep, tz, note = "") {
  const k = esc(key), rules = fww && !fww.error ? fww : null;
  const how = fww && fww.error ? `<p class="err">${esc(fww.error)}</p>` : rules
    ? `<p class="note">Rule set: <strong>${esc(rules.label)}</strong>${rules.overrides.length ? ` with ${esc(rules.overrides.join(", "))}` : ""}. Post ${rules.postDays || rules.noticeDays} days ahead${rules.postDays && rules.postDays !== rules.noticeDays ? ` (premiums start under ${rules.noticeDays} days)` : ""}; ${rules.flat ? flatRule(rules) : rules.tiers ? tierRule(rules) : `inside that window an added or moved shift owes ${rules.addHours} h of pay${rules.minMoveMin ? ` (moves of ${rules.minMoveMin} min or less excepted)` : ""}${rules.minExtendMin ? `, added time of ${rules.minExtendMin} min or less excepted` : ""}; hours taken away owe ${rules.cancelFraction} of the lost hours' pay${rules.minCutMin ? ` (cuts under ${rules.minCutMin} min excepted)` : ""}${rules.cancelWindowH < rules.noticeDays * 24 ? ` inside ${rules.cancelWindowH} h of the shift and ${rules.cancelElseHours} h of pay before that` : ""}${rules.coverAccept ? `; hours accepted to cover a colleague's absence owe nothing, team offer or one-to-one ask, once the voluntariness notice and consent are on record` : ""}`}; ${restRule(rules)}. ${rules.notes.map(esc).join(" ")}</p>`
    : `<p class="note">No rule set is chosen, so nothing is priced; the log below is kept anyway. Set FAIR_WORKWEEK to seattle, oregon, chicago, philadelphia, los-angeles, los-angeles-county, new-york-city, san-francisco, emeryville, berkeley or evanston (or custom with FWW_NOTICE_DAYS, FWW_ADD_HOURS, FWW_CANCEL_FRACTION, FWW_CANCEL_WINDOW_HOURS, FWW_CANCEL_ELSE_HOURS, FWW_MIN_MOVE_MIN, FWW_MIN_EXTEND_MIN, FWW_REST_HOURS, FWW_REST_MULT, FWW_REST_FLAT, FWW_REST_WHOLE_SHIFT, FWW_REST_ACROSS_DAYS).</p>`;
  const when = (ms) => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms)).replace(",", ""); } catch { return new Date(ms).toISOString(); } };
  const rows = rep.priced.map((p) => `<tr><td>${esc(when(p.at))}</td><td><strong>${esc(p.person)}</strong></td><td>${esc(p.kind)}: ${esc(slotLabel(p.from))}${p.from && p.to ? " to " : ""}${esc(slotLabel(p.to))}${p.weekStart ? `<br><span class="note">week of ${esc(p.weekStart)}</span>` : ""}</td><td>${esc(p.cause)}</td><td>${p.noticeH == null ? "" : p.noticeH >= 48 ? `${(p.noticeH / 24).toFixed(1)} days` : `${p.noticeH.toFixed(1)} h`}</td><td>${p.unpriced ? `<span class="err">${p.hoursOfPay} h of pay, no wage</span>` : p.premium ? `<strong>${esc($(p.premium))}</strong>` : ""}<br><span class="note">${esc(p.why)}</span></td><td><form method="post" action="/admin/change-mark?key=${k}"><input type="hidden" name="id" value="${p.id}">${p.requested ? `<button name="requested" value="0">Not requested</button>` : `<button name="requested" value="1">Employee asked</button>`}</form></td></tr>`).join("");
  const never = (rep.never || []).map((x) => `<tr><td><strong>${esc(x.person)}</strong></td><td>${esc(slotLabel(x.from))}</td><td>${x.lostH.toFixed(2)} h</td><td>${x.unpriced ? `<span class="err">${x.hoursOfPay} h of pay, no wage</span>` : esc($(x.premium || 0))}</td></tr>`).join("");
  const late = rep.late.map((x) => `<li>${esc(x.person)}, week of ${esc(x.weekStart)}, ${esc(slotLabel(x.slot))}: posted ${x.noticeH >= 48 ? `${(x.noticeH / 24).toFixed(1)} days` : `${x.noticeH.toFixed(1)} h`} ahead</li>`).join("");
  const rests = rep.rests.map((x) => `<tr><td><strong>${esc(x.person)}</strong></td><td>${x.firstLastWeek ? "last week's " : ""}${esc(slotLabel(x.first))} then ${esc(slotLabel(x.second))}</td><td>${x.gapH.toFixed(1)} h</td><td>${(x.paidH ?? x.insideH).toFixed(2)} h</td><td>${x.premium == null ? `<span class="err">no wage</span>` : esc($(x.premium))}</td></tr>`).join("");
  return page("Schedule changes", `${note}${how}
<p>${rep.priced.length} change(s) logged${rules ? `. Notice pay to check: <strong>${esc($(rep.changeTotal))}</strong>; short-rest pay this week (above the regular rate): <strong>${esc($(rep.restTotal))}</strong>${rep.never && rep.never.length ? `; on-call shifts never called in: <strong>${esc($(rep.onCallTotal))}</strong>` : ""}${rep.unpriced ? ` (${rep.unpriced} item(s) have no wage in the staff list)` : ""}` : ""}. <a href="/admin/changes.csv?key=${k}">Download CSV</a> · <a href="/admin?key=${k}">Back to admin</a></p>
<p class="note">Logged by themselves: a week published again (what it changed for whom), an approved trade or open-shift pick-up (marked employee-asked), and a call-out given to someone (the caller's dropped shift marked employee-asked; the added shift is not, because you picked the person, unless they said yes to your offer to the whole team: then it is marked "team offer"), and an on-call shift you mark not needed. Mark a change "Employee asked" when they asked for it in writing, and keep that request. Seattle asks for records to be kept three years: the hub keeps the last ${MAX_CHANGES} changes, so download the CSV with each payroll.</p>
${rules && never ? `<h2>On-call shifts never called in</h2><p class="note">Ended without being marked called in or not needed on the admin page, so counted as released at the start: ${esc($(rep.onCallTotal))}. If the person did work it, mark it called in.</p><table><thead><tr><th>Person</th><th>Shift</th><th>Hours</th><th>Owed</th></tr></thead><tbody>${never}</tbody></table>` : ""}
${rules && late ? `<h2>Posted with less than ${rules.postDays || rules.noticeDays} days' notice</h2><ul>${late}</ul>` : ""}
${rules && rests ? `<h2>Short rests this week</h2><table><thead><tr><th>Person</th><th>Shifts</th><th>Rest</th><th>${rules.restWhole ? "Hours of the later shift" : "Hours inside the window"}</th><th>${restHead(rules)}</th></tr></thead><tbody>${rests}</tbody></table>` : ""}
<h2>Changes, newest first</h2><table><thead><tr><th>When (${esc(tz)})</th><th>Person</th><th>Change</th><th>Cause</th><th>Notice</th><th>Premium</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="7">No changes yet. Publishing a week again, or approving a trade, pick-up or cover, logs one.</td></tr>`}</tbody></table>
<p class="note">An estimate from the published rule set's main numbers, to check before payroll. Not modelled: which employers are covered, the emergency exceptions, the right to decline added hours, and the good-faith estimate at hire. Oregon's numbers, its standby list and the standby-first condition on its team offer are from ORS 653.432 and 653.455 as published by the Oregon Legislature; Seattle's and Chicago's team-offer exception and on-call pay come from summaries of their guidance, not the code's text. Philadelphia's and Los Angeles's numbers come from search summaries of the cities' FAQs, regulations and law-firm notes (their own sites were out of reach when they were added): check them against Phila. Code 9-4600 and LAMC 185 before relying on them. Berkeley's are from the city's January 2024 notice and its FAQ of 2024-08-23, not the text of BMC 13.102. Evanston's come from search summaries of the city's Fair Workweek page and law-firm alerts, not the text of Ordinance 24-O-23 (City Code 3-34), which was out of reach when they were added: check them, and the city's enforcement date, before relying on them. Los Angeles County's are from the county's own text of Chapter 8.102 (2024) and the 2025 amendment to 8.102.080; they apply in unincorporated areas only, not in cities such as Los Angeles, Pasadena or Santa Monica.</p>`);
}

export function handler(state, save, env = globalThis.process?.env ?? {}, now = Date.now, fetchImpl = globalThis.fetch) {
  const adminKey = env.ADMIN_KEY || "", teamToken = env.TEAM_TOKEN || "", browserBuild = !!env.BUILD_IN_BROWSER;
  const clockOn = String(env.TIME_CLOCK ?? "1") !== "0", tz = zoneOf(env.TIMEZONE);
  const grace = Math.max(0, Math.min(60, Number(env.TIME_GRACE_MIN ?? 5) || 0));
  const pay = readPayEnv(env);
  const pinRequired = String(env.CLOCK_PIN || "").toLowerCase() === "required", fence = readGeofence(env);
  const leave = readLeaveEnv(env);
  const fww = readNoticeEnv(env);
  const tcNow = () => ({ tz, grace, now: now(), pay, pinRequired, fence, leave });
  const notify = notifier(env, fetchImpl);
  return async (req, res) => {
    const send = (code, body, type = "text/html; charset=utf-8", extra = {}) => { res.writeHead(code, { "content-type": type, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...extra }); res.end(body); };
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");
    if (!adminKey || !teamToken) return send(503, "Set ADMIN_KEY and TEAM_TOKEN.\n", "text/plain");
    const isAdmin = url.pathname.startsWith("/admin"), isTeam = url.pathname.startsWith("/team");
    if (!isAdmin && !isTeam) return send(404, "not found\n", "text/plain");
    if (isAdmin ? !same(url.searchParams.get("key") ?? "", adminKey) : !same(url.searchParams.get("t") ?? "", teamToken)) return send(401, "link required\n", "text/plain");
    let form = new URLSearchParams();
    if (req.method === "POST") {
      let size = 0; const chunks = [];
      for await (const c of req) { size += c.length; if (size > MAX_BODY) return send(413, "too large\n", "text/plain"); chunks.push(c); }
      const all = new Uint8Array(size); let at = 0;
      for (const c of chunks) { all.set(c, at); at += c.length; }
      form = new URLSearchParams(new TextDecoder().decode(all));
    }
    const back = (dest, note) => send(303, "", "text/plain", { location: dest + (note ? `&note=${encodeURIComponent(note)}` : "") });
    const t = url.searchParams.get("t");
    if (isTeam) {
      if (req.method === "GET" && url.pathname === "/team") return send(200, teamPage(state, t, clockOn ? tcNow() : null, fww));
      if (req.method === "GET" && url.pathname === "/team/manifest.webmanifest") return send(200, manifestFor(t), "application/manifest+json");
      if (req.method === "GET" && url.pathname === "/team/icon.svg") return send(200, ICON_SVG, "image/svg+xml");
      if (req.method === "GET" && url.pathname === "/team/sw.js") return send(200, SW_JS, "text/javascript; charset=utf-8", { "service-worker-allowed": "/team" });
      if (req.method === "GET" && url.pathname === "/team/ics") {
        const p = state.published, person = url.searchParams.get("person");
        if (!p || !p.weekStart || !p.people.some((x) => x.name === person)) return send(404, "no such schedule\n", "text/plain");
        return send(200, rosterIcs({ assignments: p.assignments }, p.weekStart, person), "text/calendar; charset=utf-8", { "content-disposition": 'attachment; filename="shifts.ics"' });
      }
      if (req.method === "GET" && url.pathname === "/team/feed.ics") {
        const p = state.published, person = url.searchParams.get("person");
        if (!p || !p.weekStart || !p.people.some((x) => x.name === person)) return send(404, "no such schedule\n", "text/plain");
        return send(200, rosterFeedIcs([...(state.history || []), { weekStart: p.weekStart, assignments: p.assignments }], person, { name: person + "'s shifts" }), "text/calendar; charset=utf-8");
      }
      if (req.method === "POST" && url.pathname === "/team/punch" && clockOn) {
        const p = state.published, person = String(form.get("name") || ""), kind = String(form.getAll("kind").find(Boolean) || "");
        const bad = (m, code = 400) => send(code, page("Could not record that", `<p class="err">${esc(m)}</p><p><a href="/team?t=${esc(t)}">Back</a></p>`));
        if (!p || !p.people.some((q) => q.name === person)) return bad("Pick your name from the list.");
        if (kind !== "in" && kind !== "out") return bad("Choose clock in or clock out.");
        const pc = await checkPin(state, person, String(form.get("pin") || ""), now(), { required: pinRequired });
        if (pc.error) { if (state.pinFails && state.pinFails[person]) save(); return bad(pc.error, pc.locked ? 429 : 403); }
        let where = null;
        if (fence && !fence.error) {
          where = placeOf(fence, form);
          if (fence.mode === "block" && (where.none || where.away)) return bad(where.none ? `Your manager asks for your location when you clock ${kind}, and none came through (${where.why}). Turn location on for this page and try again, or ask your manager to add the punch.` : `You look to be ${where.m} m from the site (phone accuracy ${where.acc ?? "unknown"} m), more than the ${fence.radius} m allowed. Try again on site, or ask your manager to add the punch.`, 403);
        }
        const r = punch(state, person, kind, now(), { tz, where });
        if (r.error) return bad(r.error);
        save();
        return send(200, page("Recorded", `<p class="ok">${esc(person)} clocked ${kind === "in" ? "in" : "out"} at ${esc(clock(localParts(r.punch.at, tz).min))} (${esc(tz)}).</p><p><a href="/team?t=${esc(t)}">Back to the schedule</a></p>`));
      }
      if (req.method === "POST" && url.pathname === "/team/reply") {
        const line = String(form.get("line") || "").replace(/[\r\n]+/g, " ").trim().slice(0, 300);
        const r = parseAvailabilityReply(line);
        if (r.error) return send(400, page("Could not read that", `<p class="err">${esc(r.error)}</p><p><a href="/team?t=${esc(t)}">Back</a></p>`));
        state.replies.push({ line, at: new Date(now()).toISOString() });
        notify.manager(`New availability reply: ${line}`);
        if (state.replies.length > MAX_REPLIES) state.replies.shift();
        save();
        return send(200, page("Thanks", `<p class="ok">Sent to your manager.</p><p><a href="/team?t=${esc(t)}">Back to the schedule</a></p>`));
      }
      if (req.method === "POST" && url.pathname === "/team/callout") {
        const p = state.published, [person, day, startMin, endMin] = String(form.get("shift") || "").split("|");
        const hit = p && p.assignments.find((a) => a.person === person && String(a.slot.day) === day && String(a.slot.startMin) === startMin && String(a.slot.endMin) === endMin);
        if (!hit) return send(400, page("Could not read that", `<p class="err">That shift is not on the published schedule.</p><p><a href="/team?t=${esc(t)}">Back</a></p>`));
        const note = String(form.get("note") || "").replace(/[\r\n]+/g, " ").trim().slice(0, 140);
        state.callouts.push({ person, day: hit.slot.day, startMin: hit.slot.startMin, endMin: hit.slot.endMin, note, at: new Date(now()).toISOString() });
        notify.manager(`${person} cannot make their ${DAYS[hit.slot.day]} ${fmtClock(hit.slot.startMin)}-${fmtClock(hit.slot.endMin)} shift.${note ? ` "${note}"` : ""}`);
        if (state.callouts.length > MAX_CALLOUTS) state.callouts.shift();
        save();
        return send(200, page("Thanks", `<p class="ok">Your manager has been told. Your shift stays yours until they change it.</p><p><a href="/team?t=${esc(t)}">Back to the schedule</a></p>`));
      }
      if (req.method === "POST" && url.pathname === "/team/trade") {
        const p = state.published, parse = (v) => { const [person, day, startMin, endMin] = String(v || "").split("|"); return p && p.assignments.find((a) => a.person === person && String(a.slot.day) === day && String(a.slot.startMin) === startMin && String(a.slot.endMin) === endMin); };
        const A = parse(form.get("mine")), B = parse(form.get("theirs"));
        const bad = (m) => send(400, page("Could not read that", `<p class="err">${esc(m)}</p><p><a href="/team?t=${esc(t)}">Back</a></p>`));
        if (!A || !B) return bad("Those shifts are not on the published schedule.");
        if (A.person === B.person) return bad("Pick a shift that belongs to someone else.");
        const ref = (a) => ({ person: a.person, day: a.slot.day, startMin: a.slot.startMin, endMin: a.slot.endMin });
        const note = String(form.get("note") || "").replace(/[\r\n]+/g, " ").trim().slice(0, 140);
        state.trades.push({ a: ref(A), b: ref(B), note, at: new Date(now()).toISOString() });
        notify.manager(`${A.person} asks to trade their ${DAYS[A.slot.day]} ${fmtClock(A.slot.startMin)} shift for ${B.person}'s ${DAYS[B.slot.day]} ${fmtClock(B.slot.startMin)} shift.${note ? ` "${note}"` : ""}`);
        if (state.trades.length > MAX_TRADES) state.trades.shift();
        save();
        return send(200, page("Thanks", `<p class="ok">Your manager has been asked. Both shifts stay as they are until they approve.</p><p><a href="/team?t=${esc(t)}">Back to the schedule</a></p>`));
      }
      if (req.method === "POST" && url.pathname === "/team/claim") {
        const p = state.published, [day, startMin, endMin] = String(form.get("shift") || "").split("|"), person = String(form.get("name") || "");
        const bad = (m) => send(400, page("Could not read that", `<p class="err">${esc(m)}</p><p><a href="/team?t=${esc(t)}">Back</a></p>`));
        const hit = p && p.assignments.find((a) => !a.person && String(a.slot.day) === day && String(a.slot.startMin) === startMin && String(a.slot.endMin) === endMin);
        if (!hit) return bad("That shift is not open on the published schedule.");
        if (!p.people.some((q) => q.name === person)) return bad("Pick your name from the list.");
        const ref = { person, day: hit.slot.day, startMin: hit.slot.startMin, endMin: hit.slot.endMin };
        if (!state.claims.some((c) => c.person === person && sameShift(c, ref))) {
          const note = String(form.get("note") || "").replace(/[\r\n]+/g, " ").trim().slice(0, 140);
          state.claims.push({ ...ref, note, at: new Date(now()).toISOString() });
        notify.manager(`${person} asks to take the open ${DAYS[hit.slot.day]} ${fmtClock(hit.slot.startMin)}-${fmtClock(hit.slot.endMin)} shift.${note ? ` "${note}"` : ""}`);
          if (state.claims.length > MAX_CLAIMS) state.claims.shift();
          save();
        }
        return send(200, page("Thanks", `<p class="ok">Your manager has been asked. The shift stays open until they approve.</p><p><a href="/team?t=${esc(t)}">Back to the schedule</a></p>`));
      }
      if (req.method === "POST" && url.pathname === "/team/offer") {
        const p = state.published, [who, day, startMin, endMin] = String(form.get("shift") || "").split("|"), person = String(form.get("name") || "");
        const bad = (m) => send(400, page("Could not read that", `<p class="err">${esc(m)}</p><p><a href="/team?t=${esc(t)}">Back</a></p>`));
        const c = state.callouts.find((x) => x.offeredAt && x.person === who && String(x.day) === day && String(x.startMin) === startMin && String(x.endMin) === endMin);
        if (!p || !c) return bad("That offer is no longer open.");
        if (person === c.person || !p.people.some((q) => q.name === person)) return bad("Pick your name from the list.");
        if (!Array.isArray(c.accepts)) c.accepts = [];
        if (!c.accepts.some((a) => a.person === person)) {
          c.accepts.push({ person, at: new Date(now()).toISOString() });
          if (c.accepts.length > 50) c.accepts.shift();
          notify.manager(`${person} said yes to the team offer for ${c.person}'s ${DAYS[c.day]} ${fmtClock(c.startMin)}-${fmtClock(c.endMin)} shift.`);
          save();
        }
        return send(200, page("Thanks", `<p class="ok">Your manager has been told you said yes. The shift is yours once they give it to you.</p><p><a href="/team?t=${esc(t)}">Back to the schedule</a></p>`));
      }
      if (req.method === "POST" && url.pathname === "/team/standby") {
        const p = state.published, person = String(form.get("name") || ""), act = String(form.get("act") || "");
        const bad = (m) => send(400, page("Could not read that", `<p class="err">${esc(m)}</p><p><a href="/team?t=${esc(t)}">Back</a></p>`));
        if (!fww || !fww.standby) return send(404, "not found\n", "text/plain");
        if (!Array.isArray(state.standby)) state.standby = [];
        const on = state.standby.some((x) => x.person === person), when = new Date(now()).toISOString();
        if (act === "leave") {
          if (!on) return bad("That name is not on the standby list.");
          state.standby = state.standby.filter((x) => x.person !== person);
          standbyLog(state, person, "left", "self", when);
          notify.manager(`${person} left the standby list.`);
          save();
          return send(200, page("Done", `<p class="ok">You are off the standby list.</p><p><a href="/team?t=${esc(t)}">Back to the schedule</a></p>`));
        }
        if (act !== "join" || !p || !p.people.some((q) => q.name === person)) return bad("Pick your name from the list.");
        if (form.get("agree") !== "yes") return bad("Joining needs your written agreement: tick the box.");
        if (!on) {
          state.standby.push({ person, at: when });
          standbyLog(state, person, "joined", "self", when);
          notify.manager(`${person} joined the standby list.`);
          save();
        }
        return send(200, page("Thanks", `<p class="ok">You are on the standby list. You can leave it at any time on this page.</p><p><a href="/team?t=${esc(t)}">Back to the schedule</a></p>`));
      }
      if (req.method === "POST" && url.pathname === "/team/standby-take") {
        const [who, day, startMin, endMin] = String(form.get("shift") || "").split("|"), person = String(form.get("name") || "");
        const bad = (m) => send(400, page("Could not read that", `<p class="err">${esc(m)}</p><p><a href="/team?t=${esc(t)}">Back</a></p>`));
        const c = state.callouts.find((x) => x.standbyAskedAt && x.person === who && String(x.day) === day && String(x.startMin) === startMin && String(x.endMin) === endMin);
        if (!state.published || !c) return bad("Those hours are no longer offered.");
        if (!(c.standbyAsked || []).includes(person) || !standbyNames(state).includes(person)) return bad("Only people on the standby list who were asked can take these hours.");
        if (!Array.isArray(c.standbyAccepts)) c.standbyAccepts = [];
        if (!c.standbyAccepts.some((a) => a.person === person)) {
          c.standbyAccepts.push({ person, at: new Date(now()).toISOString() });
          notify.manager(`${person} (standby list) said yes to ${c.person}'s ${DAYS[c.day]} ${fmtClock(c.startMin)}-${fmtClock(c.endMin)} shift.`);
          save();
        }
        return send(200, page("Thanks", `<p class="ok">Your manager has been told you said yes. The hours are yours once they give them to you.</p><p><a href="/team?t=${esc(t)}">Back to the schedule</a></p>`));
      }
      if (req.method === "POST" && url.pathname === "/team/timeoff") {
        const p = state.published, person = String(form.get("name") || "");
        const bad = (m) => send(400, page("Could not read that", `<p class="err">${esc(m)}</p><p><a href="/team?t=${esc(t)}">Back</a></p>`));
        if (!p || !p.people.some((q) => q.name === person)) return bad("Pick your name from the list.");
        const r = parseTimeOffRequest(form.get("from"), form.get("to"));
        if (r.error) return bad(r.error);
        if (!state.offs.some((o) => o.person === person && o.entry === r.entry)) {
          const note = String(form.get("note") || "").replace(/[\r\n]+/g, " ").trim().slice(0, 140);
          state.offs.push({ person, entry: r.entry, note, at: new Date(now()).toISOString() });
        notify.manager(`${person} asks for ${r.entry.replace("..", " to ")} off.${note ? ` "${note}"` : ""}`);
          if (state.offs.length > MAX_OFFS) state.offs.shift();
          save();
        }
        return send(200, page("Thanks", `<p class="ok">Your manager has been asked. Nothing changes until they agree.</p><p><a href="/team?t=${esc(t)}">Back to the schedule</a></p>`));
      }
      return send(404, "not found\n", "text/plain");
    }
    const here = `/admin?key=${encodeURIComponent(adminKey)}`;
    const snap = () => (state.published ? state.published.assignments.map((a) => ({ person: a.person, slot: { ...a.slot } })) : []);
    const logSince = (before, cause, asked) => logChanges(state, diffAssignments(before, state.published.assignments).map((c) => ({ ...c, requested: asked(c) })), { at: now(), weekStart: state.published.weekStart, cause });
    if (req.method === "GET" && (url.pathname === "/admin/changes" || url.pathname === "/admin/changes.csv")) {
      const rep = noticeReport(state, fww && !fww.error ? fww : null, { tz, wages: wagesOf(state), weeks: weeksOf(state), nowMs: now() });
      if (url.pathname.endsWith(".csv")) return send(200, noticeCsv(rep, fww && !fww.error ? fww : null), "text/csv; charset=utf-8", { "content-disposition": `attachment; filename="schedule-changes.csv"` });
      return send(200, changesPage(state, adminKey, fww, rep, tz, url.searchParams.get("note") ? `<p class="ok">${esc(url.searchParams.get("note"))}</p>` : ""));
    }
    if (req.method === "POST" && url.pathname === "/admin/change-mark") {
      const ok = markRequested(state, form.get("id"), form.get("requested") === "1");
      if (ok) save();
      return back(`/admin/changes?key=${encodeURIComponent(adminKey)}`, ok ? "Marked." : "That change is gone.");
    }
    if (req.method === "GET" && url.pathname === "/admin") {
      const note = url.searchParams.get("note");
      return send(200, adminPage(state, adminKey, note ? `<p class="ok">${esc(note)}</p>` : "", browserBuild, clockOn, fww));
    }
    // The whole hub state as one JSON file: a backup, and what aws/migrate-hub.mjs moves into a hosted hub. Admin only
    // (it holds wages and punches); no-store so a shared browser or proxy keeps no copy.
    if (req.method === "GET" && url.pathname === "/admin/export.json") {
      return send(200, JSON.stringify(state), "application/json; charset=utf-8", { "content-disposition": `attachment; filename="hub-state.json"`, "cache-control": "no-store" });
    }
    if (clockOn && req.method === "GET" && url.pathname === "/admin/timesheet") {
      const note = url.searchParams.get("note");
      return send(200, timesheetPage(state, adminKey, tcNow(), url.searchParams.get("week"), note ? `<p class="ok">${esc(note)}</p>` : ""));
    }
    if (clockOn && req.method === "GET" && url.pathname === "/admin/timesheet.csv") {
      const weeks = weeksOf(state), w = weeks.find((x) => x.weekStart === url.searchParams.get("week")) || weeks[0];
      if (!w) return send(404, "no published week\n", "text/plain");
      const c = tcNow();
      const tsw = timesheet(state.punches, w, { tz: c.tz, nowMs: c.now, graceMin: c.grace });
      return send(200, timesheetCsv(tsw, payForTimesheet(tsw, wagesOf(state), c.pay)), "text/csv; charset=utf-8", { "content-disposition": `attachment; filename="timesheet-${w.weekStart}.csv"` });
    }
    if (clockOn && req.method === "GET" && url.pathname === "/admin/payroll") {
      const note = url.searchParams.get("note");
      return send(200, payrollPage(state, adminKey, tcNow(), url.searchParams.get("week"), note ? `<p class="ok">${esc(note)}</p>` : ""));
    }
    if (clockOn && req.method === "GET" && url.pathname === "/admin/payroll.csv") {
      const weeks = weeksOf(state), w = weeks.find((x) => x.weekStart === url.searchParams.get("week")) || weeks[0];
      if (!w) return send(404, "no published week\n", "text/plain");
      const f = payrollFile(state, tcNow(), w);
      if (f.error) return send(404, f.error + "\n", "text/plain");
      return send(200, f.csv, f.sep === "\t" ? "text/tab-separated-values; charset=utf-8" : "text/csv; charset=utf-8", { "content-disposition": `attachment; filename="payroll-${w.weekStart}.${f.sep === "\t" ? "txt" : "csv"}"` });
    }
    if (clockOn && req.method === "POST" && url.pathname === "/admin/payroll-template") {
      const dest = `/admin/payroll?key=${encodeURIComponent(adminKey)}&week=${encodeURIComponent(String(form.get("week") || ""))}`;
      const header = String(form.get("header") || "").replace(/^\uFEFF/, "").split(/\r?\n/).find((l) => l.trim() !== "") || "";
      const ids = String(form.get("ids") || ""), overrides = String(form.get("overrides") || "");
      if (header.length > MAX_TEMPLATE || ids.length > MAX_IDS || overrides.length > MAX_OVERRIDES) return back(dest, "Not saved: too long. Paste only the template's first row.");
      if (header) { const t = readTemplate(header); if (t.error) return back(dest, "Not saved: " + t.error); }
      state.payrollTemplate = { header: header.trim(), ids, overrides, zeros: form.get("zeros") === "zero" ? "zero" : "blank" };
      save();
      return back(dest, header ? "Template saved." : "Template cleared.");
    }
    const leaveHere = `/admin/leave?key=${encodeURIComponent(adminKey)}`;
    if (clockOn && req.method === "GET" && url.pathname === "/admin/leave") {
      const note = url.searchParams.get("note");
      return send(200, leavePage(state, adminKey, tcNow(), note ? `<p class="ok">${esc(note)}</p>` : ""));
    }
    if (clockOn && leave && !leave.error && req.method === "GET" && url.pathname === "/admin/leave.csv") {
      const c = tcNow();
      return send(200, leaveCsv(leaveBalances(state, leave, { tz: c.tz, nowMs: c.now }), leave, state), "text/csv; charset=utf-8", { "content-disposition": `attachment; filename="leave-balances.csv"` });
    }
    if (clockOn && leave && !leave.error && req.method === "POST" && url.pathname === "/admin/leave-use") {
      const r = addLeaveUse(state, { person: String(form.get("name") || ""), date: String(form.get("date") || ""), hours: String(form.get("hours") || "").trim(), note: String(form.get("note") || "") }, tz, now());
      if (r.error) return back(leaveHere, "Not recorded: " + r.error);
      save();
      return back(leaveHere, `Recorded ${r.use.hours} h for ${r.use.person} on ${r.use.date}.`);
    }
    if (clockOn && leave && !leave.error && req.method === "POST" && url.pathname === "/admin/leave-remove") {
      const ok = removeLeaveUse(state, form.get("id"));
      if (ok) save();
      return back(leaveHere, ok ? "Leave record removed." : "That record is gone.");
    }
    if (clockOn && leave && !leave.error && req.method === "POST" && url.pathname === "/admin/leave-opening") {
      const who = String(form.get("name") || ""), hrs = String(form.get("hours") || "").trim();
      const r = setLeaveOpening(state, who, hrs, now());
      if (r.error) return back(leaveHere, "Not set: " + r.error);
      save();
      return back(leaveHere, hrs === "" ? (r.cleared ? `Cleared ${who}'s opening balance.` : `${who} had no opening balance.`) : `Opening balance for ${who} set to ${hrs} h as of now.`);
    }
    const sheet = `/admin/timesheet?key=${encodeURIComponent(adminKey)}&week=${encodeURIComponent(String(form.get("week") || ""))}`;
    if (clockOn && req.method === "POST" && url.pathname === "/admin/punch-add") {
      const r = addPunch(state, { person: String(form.get("name") || ""), date: String(form.get("date") || ""), time: String(form.get("time") || "").trim(), kind: String(form.get("kind") || "") }, tz, now());
      if (r.error) return back(sheet, "Not added: " + r.error);
      save();
      return back(sheet, `Added a clock-${r.punch.kind} for ${r.punch.person}.`);
    }
    if (clockOn && req.method === "POST" && url.pathname === "/admin/pin") {
      const who = String(form.get("name") || ""), clear = form.get("act") === "clear", pin = String(form.get("pin") || "").trim();
      if (!clear && !validPin(pin)) return back(sheet, "Not set: a PIN is 4 to 8 digits.");
      const r = await setPin(state, who, clear ? "" : pin, now());
      if (r.error) return back(sheet, "Not set: " + r.error);
      save();
      return back(sheet, clear ? (r.cleared ? `Removed ${who}'s PIN.` : `${who} had no PIN.`) : `PIN set for ${who}. Tell them in person; it is not shown again.`);
    }
    if (clockOn && req.method === "POST" && url.pathname === "/admin/punch-remove") {
      const ok = removePunch(state, form.get("id"));
      if (ok) save();
      return back(sheet, ok ? "Punch removed." : "That punch is gone.");
    }
    if (req.method === "POST" && url.pathname === "/admin/save") {
      state.staff = String(form.get("staff") || ""); state.shifts = String(form.get("shifts") || ""); state.weekStart = String(form.get("weekStart") || "").trim();
      if (form.get("act") === "publish") {
        let owner = null;
        if (form.get("owner")) { try { owner = JSON.parse(String(form.get("owner"))); } catch { owner = "bad"; } }
        const out = owner === "bad" ? { error: "The roster from the browser could not be read; build it again." }
          : !owner && browserBuild ? { error: "This host builds the roster in your browser: turn on JavaScript and press Build and publish again." }
          : publish(state, now(), owner);
        if (out.error) { save(); return send(400, adminPage(state, adminKey, `<p class="err">${esc(out.error)}</p>`, browserBuild)); }
        save();
        const pub = state.published, link = env.PUBLIC_URL ? `\nSee it: ${String(env.PUBLIC_URL).replace(/\/+$/, "")}/team?t=${teamToken}` : "";
        notify.team(`New schedule${pub.weekStart ? ` for the week of ${pub.weekStart}` : ""}:\n` + rosterMessages({ assignments: pub.assignments, people: pub.people }, pub.weekStart).map((m) => m.text).join("\n\n") + link);
        return back(here, `Published. Payroll ${money(out.cost)}; staff cannot see this.${out.flags && out.flags.length ? " Flags: " + out.flags.length : ""}`);
      }
      save();
      return back(here, "Saved.");
    }
    if (req.method === "POST" && url.pathname === "/admin/merge") {
      const m = mergeAvailabilityReplies(state.staff, state.replies.map((r) => r.line).join("\n"));
      state.staff = m.text; state.replies = [];
      save();
      return back(here, `Merged: ${m.updated.length} updated, ${m.added.length} added${m.errors.length ? ", " + m.errors.length + " unreadable" : ""}.`);
    }
    if (req.method === "POST" && url.pathname === "/admin/trade") {
      const i = Number(form.get("i")), row = tradeRows(state)[i];
      if (!row) return back(here, "That request is gone.");
      if (form.get("act") === "approve") {
        const before = snap();
        if (!row.v || !row.v.ok || !applyTrade(state, row.t)) return back(here, "Not approved: the trade no longer passes the checks.");
        logSince(before, "trade", () => true);
        state.trades.splice(i, 1);
        save();
        return back(here, "Trade approved. The staff page shows the new shifts.");
      }
      state.trades.splice(i, 1);
      save();
      return back(here, "Trade declined.");
    }
    if (req.method === "POST" && url.pathname === "/admin/claim") {
      const i = Number(form.get("i")), row = claimRows(state)[i];
      if (!row) return back(here, "That request is gone.");
      const act = form.get("act");
      if (act === "approve" || act === "override") {
        const before = snap();
        if (!(act === "approve" ? row.fit : row.blocked) || !applyClaim(state, row.c)) return back(here, "Not approved: the shift is no longer open or the check changed.");
        logSince(before, "claim", () => true);
        // The other asks were checked against the week as it was: that person's, and any for a shift with no open copy left, must be asked again.
        const stillOpen = (c) => state.published.assignments.some((a) => !a.person && sameShift({ day: a.slot.day, startMin: a.slot.startMin, endMin: a.slot.endMin }, c));
        state.claims = state.claims.filter((c, k) => k !== i && c.person !== row.c.person && stillOpen(c));
        save();
        return back(here, "Shift approved. The staff page shows it. Other open-shift requests from that person were cleared: they should ask again.");
      }
      state.claims.splice(i, 1);
      save();
      return back(here, "Request declined.");
    }
    if (req.method === "POST" && url.pathname === "/admin/timeoff") {
      const i = Number(form.get("i")), o = state.offs[i];
      if (!o) return back(here, "That request is gone.");
      if (form.get("act") === "approve") {
        const m = addTimeOff(state.staff, o.person, o.entry);
        if (m.error) return back(here, "Not added: " + m.error);
        state.staff = m.text;
        state.offs.splice(i, 1);
        save();
        return back(here, `Added ${o.entry.replace("..", " to ")} off for ${o.person} to the staff list. Set the week's Monday and build to apply it.`);
      }
      state.offs.splice(i, 1);
      save();
      return back(here, "Request declined.");
    }
    if (req.method === "POST" && url.pathname === "/admin/cover") {
      const row = calloutRows(state)[Number(form.get("i"))], name = String(form.get("name") || "");
      const before = snap();
      if (!row || !row.fits || !row.fits.some((f) => f.name === name) || !applyCover(state, row.c, name)) return back(here, "Not assigned: the shift changed or the person no longer fits.");
      // The caller asked to drop the shift. The person given it was picked by the manager, so their added shift counts,
      // unless they said yes to the written offer to the whole team (the exception some rule sets have).
      // Someone on the voluntary standby list who said yes when asked from it: logged as from the standby list. A team
      // offer taken while people on the list were never asked carries how many (Oregon prices it then).
      const viaStandby = !!row.c.standbyAskedAt && (row.c.standbyAccepts || []).some((a) => a.person === name);
      const viaOffer = !viaStandby && !!row.c.offeredAt && (row.c.accepts || []).some((a) => a.person === name);
      const open = viaOffer ? standbyNotAsked(state, row.c, name).length : 0;
      if (viaStandby || viaOffer) logChanges(state, diffAssignments(before, state.published.assignments).map((c) => ({ ...c, requested: c.person === row.c.person, ...(c.person === name ? (viaStandby ? { standby: true, coverFor: row.c.person, absenceAt: Date.parse(row.c.at) } : { massOffer: true, coverFor: row.c.person, standbyOpen: open, absenceAt: Date.parse(row.c.at) }) : {}) })), { at: now(), weekStart: state.published.weekStart, cause: viaStandby ? "standby list" : "team offer" });
      else {
        // The covering person's added shift carries whose absence it covers and when it was reported (San Francisco
        // exempts cover for an absence reported under seven days ahead, 3300G.4(e)(4)).
        const absenceAt = Date.parse(row.c.at);
        logChanges(state, diffAssignments(before, state.published.assignments).map((c) => ({ ...c, requested: c.person === row.c.person, ...(c.person === name ? { coverFor: row.c.person, ...(Number.isFinite(absenceAt) ? { absenceAt } : {}) } : {}) })), { at: now(), weekStart: state.published.weekStart, cause: "cover" });
      }
      // Asks that named this shift were checked against the old week: drop the call-out and any trade on it.
      const onIt = (x) => x.person === row.c.person && sameShift(x, row.c);
      state.callouts = state.callouts.filter((c) => !onIt(c));
      state.trades = state.trades.filter((t) => !onIt(t.a) && !onIt(t.b));
      save();
      return back(here, `Shift given to ${name}. The staff page shows it; tell them with the links below.`);
    }
    if (req.method === "POST" && url.pathname === "/admin/offer") {
      const row = calloutRows(state)[Number(form.get("i"))];
      if (!row || row.note || !state.published) return back(here, "Not offered: that call-out is gone or the shift changed.");
      if (!row.c.offeredAt) {
        row.c.offeredAt = new Date(now()).toISOString(); row.c.offerText = teamOfferText(row.c, state.published.weekStart); row.c.accepts = [];
        const link = env.PUBLIC_URL ? `\nSay yes: ${String(env.PUBLIC_URL).replace(/\/+$/, "")}/team?t=${teamToken}` : "";
        notify.team(row.c.offerText + link);
        save();
      }
      return back(here, "Offered to the whole team on the staff page. Give it to someone who says yes.");
    }
    if (req.method === "POST" && url.pathname === "/admin/standby-ask") {
      const row = calloutRows(state)[Number(form.get("i"))];
      if (!fww || !fww.standby) return back(here, "The standby list is off for this rule set.");
      if (!row || row.note || !state.published) return back(here, "Not asked: that call-out is gone or the shift changed.");
      const names = standbyNotAsked(state, row.c);
      if (!names.length) return back(here, "Nobody on the standby list is left to ask.");
      row.c.standbyAskedAt = new Date(now()).toISOString(); row.c.standbyAsked = [...(row.c.standbyAsked || []), ...names]; row.c.standbyAccepts = row.c.standbyAccepts || [];
      row.c.standbyText = standbyAskText(row.c, state.published.weekStart);
      const link = env.PUBLIC_URL ? `\nSay yes: ${String(env.PUBLIC_URL).replace(/\/+$/, "")}/team?t=${teamToken}` : "";
      notify.team(`${row.c.standbyText} For: ${names.join(", ")}.${link}`);
      save();
      return back(here, `Asked ${names.length} on the standby list. Give it to someone who says yes, or offer it to the whole team if nobody does.`);
    }
    if (req.method === "POST" && url.pathname === "/admin/standby-remove") {
      if (!fww || !fww.standby) return back(here, "The standby list is off for this rule set.");
      const name = String(form.get("name") || "");
      if (!(state.standby || []).some((x) => x.person === name)) return back(here, "That name is not on the standby list.");
      state.standby = state.standby.filter((x) => x.person !== name);
      standbyLog(state, name, "removed", "manager", new Date(now()).toISOString());
      save();
      return back(here, `${name} is off the standby list.`);
    }
    if (req.method === "POST" && url.pathname === "/admin/oncall") {
      const x = onCallShifts(state.published, state.onCall || {}).find((o) => o.key === String(form.get("key") || "")), act = String(form.get("act") || "");
      if (!x || x.status !== "waiting" || (act !== "called" && act !== "released")) return back(here, "That on-call shift is gone or already marked.");
      if (!state.onCall) state.onCall = {};
      state.onCall[x.key] = { status: act, at: now() };
      if (act === "released") logChanges(state, [{ person: x.person, kind: "cancelled", from: x.slot, to: null, onCall: true }], { at: now(), weekStart: state.published.weekStart, cause: "on-call not needed" });
      save();
      return back(here, act === "called" ? `${x.person} marked called in.` : `${x.person}'s on-call shift marked not needed and logged.`);
    }
    if (req.method === "POST" && url.pathname === "/admin/clear-callouts") {
      state.callouts = [];
      save();
      return back(here, "Call-outs cleared.");
    }
    return send(404, "not found\n", "text/plain");
  };
}
