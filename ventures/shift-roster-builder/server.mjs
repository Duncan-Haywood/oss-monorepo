#!/usr/bin/env node
// Self-hosted team schedule: you build and publish the week, your staff open one link to see their
// shifts, add them to their calendar and send availability. Zero dependencies; run it on a box you own.
//   ADMIN_KEY=... TEAM_TOKEN=... STATE=/data/state.json PORT=8080 node server.mjs
// ADMIN_KEY unlocks /admin. TEAM_TOKEN is the secret in the link you share with staff (/team?t=...).
// Wages never reach the staff page. State is one JSON file: put STATE on a persistent disk.
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { parseStaff, parseShifts, buildRoster, rosterIcs, rosterMessages, coverOptions, checkTrade, parseAvailabilityReply, mergeAvailabilityReplies, parseTimeOffRequest, addTimeOff, scheduleFlags, fmtClock, money, num, DAYS, sampleStaff, sampleShifts } from "./calc.mjs";

const MAX_BODY = 64 * 1024, MAX_REPLIES = 200, MAX_CALLOUTS = 100, MAX_TRADES = 100, MAX_CLAIMS = 100, MAX_OFFS = 100;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

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
const page = (title, body, head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">${head}<title>${esc(title)}</title><style>${CSS}</style></head><body><h1>${esc(title)}</h1>${body}<p class="note">Self-hosted with <a href="https://duncan-haywood.github.io/monorepo-projects/shift-roster-builder/">Shift Roster Builder</a> (MIT). Not legal advice: check breaks, minors and predictive-scheduling rules yourself.</p></body></html>`;

export function emptyState() { return { staff: "", shifts: "", weekStart: "", published: null, replies: [], callouts: [], trades: [], claims: [], offs: [] }; }

// What staff may see: who works when. Never wages, hour caps or the cost of the week.
function publish(state, now) {
  const st = parseStaff(state.staff, { weekStart: state.weekStart || null }), sh = parseShifts(state.shifts);
  const errs = [...(st.errors || []), ...(sh.errors || [])];
  if (errs.length) return { error: errs[0] };
  const r = buildRoster(st.staff, sh.slots);
  if (r.error) return { error: r.error };
  const flags = state.weekStart ? scheduleFlags(r, { weekStart: state.weekStart, today: new Date(now).toISOString().slice(0, 10) }) : null;
  state.callouts = []; state.trades = []; state.claims = [];
  state.published = {
    at: new Date(now).toISOString(), weekStart: state.weekStart || null, unfilled: r.unfilledSlots,
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

function teamPage(state, token) {
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
  const names = p ? p.people.map((q) => q.name) : [];
  const off = names.length ? `<h2>Need days off?</h2><form method="post" action="/team/timeoff?t=${esc(token)}"><label>Who are you?<select name="name" required>${names.map((n) => `<option>${esc(n)}</option>`).join("")}</select></label><label>First day<input type="date" name="from" required></label><label>Last day (leave blank for one day)<input type="date" name="to"></label><label>Note (optional)<input name="note" maxlength="140"></label><button>Ask my manager</button></form><p class="note">This only asks. If your manager agrees, the days come off your availability when they build that week.</p>` : "";
  if (!p) return page("Team schedule", `<p>No schedule has been published yet.</p>${form}`, teamHead(token));
  const msgs = rosterMessages({ assignments: p.assignments, people: p.people }, p.weekStart);
  const rows = msgs.map((m) => `<tr><td><strong>${esc(m.person)}</strong></td><td>${esc(m.text.split("\n").slice(1, -1).join(" · ") || "no shifts")}</td><td>${p.weekStart && m.shifts ? `<a href="/team/ics?t=${esc(token)}&person=${encodeURIComponent(m.person)}">Add to calendar</a>` : ""}</td></tr>`).join("");
  return page(`Schedule${p.weekStart ? ", week of " + p.weekStart : ""}`, `<p class="note">Published ${esc(p.at.slice(0, 16).replace("T", " "))} UTC${p.unfilled ? `. ${p.unfilled} shift(s) are still open: ask your manager.` : "."}</p><table><thead><tr><th>Person</th><th>Shifts</th><th></th></tr></thead><tbody>${rows}</tbody></table>${claim}${callout}${trade}${off}${form}<p class="note">Tip: add this page to your home screen to open it like an app. It keeps the last schedule your phone saw, so you can read it with no signal.</p>`, teamHead(token));
}

// Who could take each reported shift without moving anyone else, cheapest first. Rebuilt from the current staff and
// shifts (the search is deterministic), so after editing either, publish again before trusting the names.
function rosterCtx(state) {
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

const slotText = (x) => `${esc(DAYS[x.day])} ${esc(fmtClock(x.startMin))}-${esc(fmtClock(x.endMin))}`;

function adminPage(state, key, note = "") {
  const k = esc(key), p = state.published;
  const calls = calloutRows(state).map(({ c, fits, note: n }) => `<tr><td><strong>${esc(c.person)}</strong> cannot make ${esc(DAYS[c.day])} ${esc(fmtClock(c.startMin))}-${esc(fmtClock(c.endMin))}${c.note ? `<br><span class="note">"${esc(c.note)}"</span>` : ""}</td><td>${n ? esc(n) : fits.length ? fits.map((f) => `${esc(f.name)} (${f.extraCost >= 0 ? "+" : "-"}${esc(money(Math.abs(f.extraCost)))}${f.overtimeAfter > 0 ? ", overtime" : ""})`).join("; ") : "nobody free can take it without changing someone else's week"}</td></tr>`).join("");
  const callBlock = state.callouts.length ? `<h2>Call-outs (${state.callouts.length})</h2><table><thead><tr><th>Request</th><th>Could cover, cheapest first</th></tr></thead><tbody>${calls}</tbody></table><form method="post" action="/admin/clear-callouts?key=${k}"><button>Clear call-outs</button></form>` : "";
  const tr = tradeRows(state).map(({ t, v, note: n }, i) => `<tr><td><strong>${esc(t.a.person)}</strong> gives ${slotText(t.a)}<br><strong>${esc(t.b.person)}</strong> gives ${slotText(t.b)}${t.note ? `<br><span class="note">"${esc(t.note)}"</span>` : ""}</td><td>${n ? esc(n) : v.ok ? `<span class="ok">Keeps both weeks inside the rules</span> (payroll ${v.extraCost >= 0 ? "+" : "-"}${esc(money(Math.abs(v.extraCost)))})` : `<span class="err">Blocked:</span> ${v.problems.map((x) => `${esc(x.name)} ${esc(x.reason)}`).join("; ")}`}</td><td><form method="post" action="/admin/trade?key=${k}"><input type="hidden" name="i" value="${i}"><button name="act" value="approve" ${v && v.ok ? "" : "disabled"}>Approve</button><button name="act" value="decline">Decline</button></form></td></tr>`).join("");
  const tradeBlock = state.trades.length ? `<h2>Trade requests (${state.trades.length})</h2><table><thead><tr><th>Request</th><th>Check</th><th></th></tr></thead><tbody>${tr}</tbody></table>` : "";
  const cl = claimRows(state).map(({ c, fit, blocked, note: n }, i) => `<tr><td><strong>${esc(c.person)}</strong> asks to take ${slotText(c)}${c.note ? `<br><span class="note">"${esc(c.note)}"</span>` : ""}</td><td>${n ? esc(n) : fit ? `<span class="ok">Fits inside the rules</span> (payroll ${fit.extraCost >= 0 ? "+" : "-"}${esc(money(Math.abs(fit.extraCost)))}${fit.overtimeAfter > 0 ? ", overtime" : ""})` : `<span class="err">Blocked:</span> ${esc(c.person)} ${esc(blocked)}`}</td><td><form method="post" action="/admin/claim?key=${k}"><input type="hidden" name="i" value="${i}">${fit ? `<button name="act" value="approve">Approve</button>` : blocked ? `<button name="act" value="override">Approve anyway</button>` : ""}<button name="act" value="decline">Decline</button></form></td></tr>`).join("");
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
<button name="act" value="save">Save</button><button name="act" value="publish">Build and publish</button></form>
${tellBlock}
${callBlock}
${tradeBlock}
${claimBlock}
${offBlock}
<h2>Availability replies (${state.replies.length})</h2>
<form method="post" action="/admin/merge?key=${k}"><textarea name="replies" readonly>${replies}</textarea><button ${state.replies.length ? "" : "disabled"}>Merge into staff list</button></form>
<p class="note">${p ? `Published ${esc(p.at)}: ${p.unfilled} open shift(s).` : "Nothing published yet."} Staff link: <code>/team?t=TEAM_TOKEN</code></p>`);
}

export function handler(state, save, env = process.env, now = Date.now, fetchImpl = globalThis.fetch) {
  const adminKey = env.ADMIN_KEY || "", teamToken = env.TEAM_TOKEN || "";
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
      form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    }
    const back = (dest, note) => send(303, "", "text/plain", { location: dest + (note ? `&note=${encodeURIComponent(note)}` : "") });
    const t = url.searchParams.get("t");
    if (isTeam) {
      if (req.method === "GET" && url.pathname === "/team") return send(200, teamPage(state, t));
      if (req.method === "GET" && url.pathname === "/team/manifest.webmanifest") return send(200, manifestFor(t), "application/manifest+json");
      if (req.method === "GET" && url.pathname === "/team/icon.svg") return send(200, ICON_SVG, "image/svg+xml");
      if (req.method === "GET" && url.pathname === "/team/sw.js") return send(200, SW_JS, "text/javascript; charset=utf-8", { "service-worker-allowed": "/team" });
      if (req.method === "GET" && url.pathname === "/team/ics") {
        const p = state.published, person = url.searchParams.get("person");
        if (!p || !p.weekStart || !p.people.some((x) => x.name === person)) return send(404, "no such schedule\n", "text/plain");
        return send(200, rosterIcs({ assignments: p.assignments }, p.weekStart, person), "text/calendar; charset=utf-8", { "content-disposition": 'attachment; filename="shifts.ics"' });
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
    if (req.method === "GET" && url.pathname === "/admin") {
      const note = url.searchParams.get("note");
      return send(200, adminPage(state, adminKey, note ? `<p class="ok">${esc(note)}</p>` : ""));
    }
    if (req.method === "POST" && url.pathname === "/admin/save") {
      state.staff = String(form.get("staff") || ""); state.shifts = String(form.get("shifts") || ""); state.weekStart = String(form.get("weekStart") || "").trim();
      if (form.get("act") === "publish") {
        const out = publish(state, now());
        if (out.error) { save(); return send(400, adminPage(state, adminKey, `<p class="err">${esc(out.error)}</p>`)); }
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
        if (!row.v || !row.v.ok || !applyTrade(state, row.t)) return back(here, "Not approved: the trade no longer passes the checks.");
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
        if (!(act === "approve" ? row.fit : row.blocked) || !applyClaim(state, row.c)) return back(here, "Not approved: the shift is no longer open or the check changed.");
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
    if (req.method === "POST" && url.pathname === "/admin/clear-callouts") {
      state.callouts = [];
      save();
      return back(here, "Call-outs cleared.");
    }
    return send(404, "not found\n", "text/plain");
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const statePath = process.env.STATE || "state.json";
  let state = emptyState();
  try { state = { ...state, ...JSON.parse(fs.readFileSync(statePath, "utf8")) }; } catch (e) { if (e.code !== "ENOENT") throw e; }
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state)); fs.renameSync(`${statePath}.tmp`, statePath); };
  const port = Number(process.env.PORT || 8080);
  http.createServer(handler(state, save)).listen(port, () => console.log(`roster hub on :${port}${process.env.ADMIN_KEY && process.env.TEAM_TOKEN ? "" : " (set ADMIN_KEY and TEAM_TOKEN)"}`));
}
