#!/usr/bin/env node
// Self-hosted team schedule: you build and publish the week, your staff open one link to see their
// shifts, add them to their calendar and send availability. Zero dependencies; run it on a box you own.
//   ADMIN_KEY=... TEAM_TOKEN=... STATE=/data/state.json PORT=8080 node server.mjs
// ADMIN_KEY unlocks /admin. TEAM_TOKEN is the secret in the link you share with staff (/team?t=...).
// Wages never reach the staff page. State is one JSON file: put STATE on a persistent disk.
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { parseStaff, parseShifts, buildRoster, rosterIcs, rosterMessages, coverOptions, parseAvailabilityReply, mergeAvailabilityReplies, scheduleFlags, fmtClock, money, num, DAYS, sampleStaff, sampleShifts } from "./calc.mjs";

const MAX_BODY = 64 * 1024, MAX_REPLIES = 200, MAX_CALLOUTS = 100;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

const CSS = `body{font:16px/1.5 system-ui,sans-serif;max-width:60rem;margin:0 auto;padding:1rem;color:#1a1a1a}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:.35rem .5rem;text-align:left}textarea,input{width:100%;font:inherit;box-sizing:border-box}textarea{font-family:ui-monospace,monospace;min-height:9rem}button{font:inherit;padding:.5rem 1rem;margin:.5rem .5rem .5rem 0}.note{color:#555;font-size:.9rem}.err{color:#b00020}.ok{color:#176f2c}`;
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body><h1>${esc(title)}</h1>${body}<p class="note">Self-hosted with <a href="https://duncan-haywood.github.io/monorepo-projects/shift-roster-builder/">Shift Roster Builder</a> (MIT). Not legal advice: check breaks, minors and predictive-scheduling rules yourself.</p></body></html>`;

export function emptyState() { return { staff: "", shifts: "", weekStart: "", published: null, replies: [], callouts: [] }; }

// What staff may see: who works when. Never wages, hour caps or the cost of the week.
function publish(state, now) {
  const st = parseStaff(state.staff, { weekStart: state.weekStart || null }), sh = parseShifts(state.shifts);
  const errs = [...(st.errors || []), ...(sh.errors || [])];
  if (errs.length) return { error: errs[0] };
  const r = buildRoster(st.staff, sh.slots);
  if (r.error) return { error: r.error };
  const flags = state.weekStart ? scheduleFlags(r, { weekStart: state.weekStart, today: new Date(now).toISOString().slice(0, 10) }) : null;
  state.callouts = [];
  state.published = {
    at: new Date(now).toISOString(), weekStart: state.weekStart || null, unfilled: r.unfilledSlots,
    people: r.people.map((p) => ({ name: p.name, hours: p.hours })),
    assignments: r.assignments.map((a) => ({ person: a.person || null, slot: { day: a.slot.day, startMin: a.slot.startMin, endMin: a.slot.endMin, label: a.slot.label || "", role: a.slot.role || "" } })),
  };
  return { ok: true, cost: r.cost, flags };
}

const dayDate = (ws, d) => { const t = new Date(ws + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(5, 10); };

function teamPage(state, token) {
  const p = state.published;
  const form = `<h2>Send your availability</h2><form method="post" action="/team/reply?t=${esc(token)}"><label>One line: <code>Your name | Mon-Fri 9-17; Sat off | max: 30</code><input name="line" required maxlength="300"></label><button>Send</button></form><p class="note">Your manager sees it and decides. Nothing changes until they merge it.</p>`;
  const mine = (p ? p.assignments.filter((a) => a.person) : []).map((a, i) => ({ a, i })).sort((x, y) => x.a.person.localeCompare(y.a.person) || x.a.slot.day - y.a.slot.day || x.a.slot.startMin - y.a.slot.startMin);
  const dl = (d) => (p.weekStart ? dayDate(p.weekStart, d) + " " : "") + DAYS[d];
  const callout = p && mine.length ? `<h2>Cannot make a shift?</h2><form method="post" action="/team/callout?t=${esc(token)}"><label>Your shift<select name="shift" required>${mine.map(({ a }) => `<option value="${esc(a.person + "|" + a.slot.day + "|" + a.slot.startMin + "|" + a.slot.endMin)}">${esc(a.person)}: ${esc(dl(a.slot.day))} ${esc(fmtClock(a.slot.startMin))}-${esc(fmtClock(a.slot.endMin))}</option>`).join("")}</select></label><label>Note (optional)<input name="note" maxlength="140"></label><button>Tell my manager</button></form><p class="note">This only asks. Your manager sees who could cover it and decides; your shift stays yours until they change it.</p>` : "";
  if (!p) return page("Team schedule", `<p>No schedule has been published yet.</p>${form}`);
  const msgs = rosterMessages({ assignments: p.assignments, people: p.people }, p.weekStart);
  const rows = msgs.map((m) => `<tr><td><strong>${esc(m.person)}</strong></td><td>${esc(m.text.split("\n").slice(1, -1).join(" · ") || "no shifts")}</td><td>${p.weekStart && m.shifts ? `<a href="/team/ics?t=${esc(token)}&person=${encodeURIComponent(m.person)}">Add to calendar</a>` : ""}</td></tr>`).join("");
  return page(`Schedule${p.weekStart ? ", week of " + p.weekStart : ""}`, `<p class="note">Published ${esc(p.at.slice(0, 16).replace("T", " "))} UTC${p.unfilled ? `. ${p.unfilled} shift(s) are still open: ask your manager.` : "."}</p><table><thead><tr><th>Person</th><th>Shifts</th><th></th></tr></thead><tbody>${rows}</tbody></table>${callout}${form}`);
}

// Who could take each reported shift without moving anyone else, cheapest first. Rebuilt from the current staff and
// shifts (the search is deterministic), so after editing either, publish again before trusting the names.
export function calloutRows(state) {
  if (!state.callouts.length) return [];
  let ctx = null;
  try {
    const st = parseStaff(state.staff, { weekStart: state.weekStart || null }), sh = parseShifts(state.shifts);
    if (!(st.errors || []).length && !(sh.errors || []).length) { const r = buildRoster(st.staff, sh.slots); if (!r.error) ctx = { st, sh, r }; }
  } catch { ctx = null; }
  return state.callouts.map((c) => {
    if (!ctx) return { c, note: "Staff or shifts no longer build; fix them, then publish again." };
    const i = ctx.sh.slots.findIndex((s, k) => ctx.r.owner[k] >= 0 && ctx.st.staff[ctx.r.owner[k]].name === c.person && s.day === c.day && s.startMin === c.startMin && s.endMin === c.endMin);
    if (i < 0) return { c, note: "That shift is not in the current roster (it changed since it was published)." };
    const o = coverOptions(ctx.st.staff, ctx.sh.slots, ctx.r, i);
    return o.error ? { c, note: o.error } : { c, fits: o.fits.slice(0, 5) };
  });
}

function adminPage(state, key, note = "") {
  const k = esc(key), p = state.published;
  const calls = calloutRows(state).map(({ c, fits, note: n }) => `<tr><td><strong>${esc(c.person)}</strong> cannot make ${esc(DAYS[c.day])} ${esc(fmtClock(c.startMin))}-${esc(fmtClock(c.endMin))}${c.note ? `<br><span class="note">"${esc(c.note)}"</span>` : ""}</td><td>${n ? esc(n) : fits.length ? fits.map((f) => `${esc(f.name)} (${f.extraCost >= 0 ? "+" : "-"}${esc(money(Math.abs(f.extraCost)))}${f.overtimeAfter > 0 ? ", overtime" : ""})`).join("; ") : "nobody free can take it without changing someone else's week"}</td></tr>`).join("");
  const callBlock = state.callouts.length ? `<h2>Call-outs (${state.callouts.length})</h2><table><thead><tr><th>Request</th><th>Could cover, cheapest first</th></tr></thead><tbody>${calls}</tbody></table><form method="post" action="/admin/clear-callouts?key=${k}"><button>Clear call-outs</button></form>` : "";
  const replies = state.replies.map((r) => esc(r.line)).join("\n");
  return page("Roster admin", `${note}
<form method="post" action="/admin/save?key=${k}"><label>Week starting (a Monday, YYYY-MM-DD)<input name="weekStart" value="${esc(state.weekStart)}" placeholder="2026-10-19"></label>
<label>Staff<textarea name="staff">${esc(state.staff || sampleStaff())}</textarea></label>
<label>Shifts to cover<textarea name="shifts">${esc(state.shifts || sampleShifts())}</textarea></label>
<button name="act" value="save">Save</button><button name="act" value="publish">Build and publish</button></form>
${callBlock}
<h2>Availability replies (${state.replies.length})</h2>
<form method="post" action="/admin/merge?key=${k}"><textarea name="replies" readonly>${replies}</textarea><button ${state.replies.length ? "" : "disabled"}>Merge into staff list</button></form>
<p class="note">${p ? `Published ${esc(p.at)}: ${p.unfilled} open shift(s).` : "Nothing published yet."} Staff link: <code>/team?t=TEAM_TOKEN</code></p>`);
}

export function handler(state, save, env = process.env, now = Date.now) {
  const adminKey = env.ADMIN_KEY || "", teamToken = env.TEAM_TOKEN || "";
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
        if (state.callouts.length > MAX_CALLOUTS) state.callouts.shift();
        save();
        return send(200, page("Thanks", `<p class="ok">Your manager has been told. Your shift stays yours until they change it.</p><p><a href="/team?t=${esc(t)}">Back to the schedule</a></p>`));
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
