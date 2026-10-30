#!/usr/bin/env node
// Self-hosted league page: you build the season and post results, your players open one link to see
// fixtures, the table and a calendar feed for their team. Zero dependencies; run it on a box you own.
//   ADMIN_KEY=... LEAGUE_TOKEN=... STATE=/data/state.json PORT=8080 node server.mjs
// ADMIN_KEY unlocks /admin. LEAGUE_TOKEN is the secret in the link you share (/league?t=...).
// State is one JSON file: put STATE on a persistent disk.
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { readSpec, buildSchedule, applyRainouts, applyWithdrawals, applyLateTeams, parseResults, parsePointSystem, standings, playoffBracket, leaguePageHtml, scheduleIcs, sampleFields, WEEKDAYS } from "./calc.mjs";

const MAX_BODY = 64 * 1024;
const TEXT_FIELDS = ["teams", "start", "skip", "blackouts", "courts", "times", "timeLimits", "courtLimits", "results", "rainouts", "withdrawals", "lateTeams", "scoring"];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

const CSS = `body{font:16px/1.5 system-ui,sans-serif;max-width:60rem;margin:0 auto;padding:1rem;color:#1a1a1a}textarea,input{width:100%;font:inherit;box-sizing:border-box}textarea{font-family:ui-monospace,monospace;min-height:6rem}button{font:inherit;padding:.5rem 1rem;margin:.5rem .5rem .5rem 0}.note{color:#555;font-size:.9rem}.err{color:#b00020}.ok{color:#176f2c}`;
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body><h1>${esc(title)}</h1>${body}<p class="note">Self-hosted with <a href="https://duncan-haywood.github.io/monorepo-projects/league-schedule-generator/">League Schedule Generator</a> (MIT). Check dates and venues with your organiser.</p></body></html>`;

export function emptyState() { return { fields: { ...sampleFields(), results: "" }, published: false, pending: [] }; }

const MAX_PENDING = 100;
/** A score a team captain sends from the league page, as a pending request: team indexes and goals, nothing free-form. */
export function parseScoreRequest(form, teams) {
  const a = Number(form.get("home")), b = Number(form.get("away")), ga = Number(form.get("hs")), gb = Number(form.get("as"));
  if (![a, b].every((i) => Number.isInteger(i) && i >= 0 && i < teams.length)) return { error: "Pick two teams from the list." };
  if (a === b) return { error: "A team cannot play itself." };
  if (![ga, gb].every((g) => Number.isInteger(g) && g >= 0 && g <= 999)) return { error: "Scores are whole numbers from 0 to 999." };
  return { req: { a, b, ga, gb, at: Date.now() } };
}
const resultLine = (teams, r) => `${teams[r.a]} ${r.ga} - ${r.gb} ${teams[r.b]}`;

/** Fields -> the same schedule, table and bracket the browser page shows. */
export function buildLeague(f) {
  const { spec, errors } = readSpec(f);
  if (errors.length) return { error: errors[0] };
  let s;
  try { s = buildSchedule(spec); } catch (e) { return { error: e.message }; }
  const warnings = [];
  for (const [key, fn] of [["rainouts", applyRainouts], ["withdrawals", applyWithdrawals], ["lateTeams", applyLateTeams]]) {
    if (String(f[key] || "").trim()) { const r = fn(s, f[key]); s = r.schedule; warnings.push(...r.errors); }
  }
  let table = null, bracket = null, seeds = s.teams;
  const ps = parsePointSystem(f.scoring || "");
  if (ps.error) warnings.push(ps.error);
  if (String(f.results || "").trim()) {
    const pr = parseResults(f.results, s.teams);
    warnings.push(...pr.errors);
    table = standings(s.teams, pr.results, { win: ps.win, draw: ps.draw, loss: ps.loss, adjustments: pr.adjustments });
    seeds = table.map((r) => r.name);
  }
  const want = Math.trunc(Number(f.playoff) || 0);
  if (want >= 2 && want <= s.teams.length) bracket = playoffBracket(seeds.slice(0, want), { afterDay: s.stats.lastDay, weekdays: s.config.weekdays, skipDays: s.config.skipDays });
  return { schedule: s, table, bracket, warnings };
}

function leaguePage(state, token) {
  const out = buildLeague(state.fields);
  if (out.error) return page("League", `<p>The organiser has not published a valid league yet.</p>`);
  const html = leaguePageHtml(out.schedule, { title: "League schedule", table: out.table, bracket: out.bracket });
  const cal = out.schedule.teams.map((n, i) => `<li><a href="/league/ics?t=${esc(token)}&amp;team=${i}">${esc(n)}</a></li>`).join("");
  const opts = out.schedule.teams.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join("");
  const form = `<h2>Report a score</h2><form method="post" action="/league/result?t=${esc(token)}"><label>Home <select name="home">${opts}</select></label> <input name="hs" type="number" min="0" max="999" required style="width:5rem" aria-label="Home score"> - <input name="as" type="number" min="0" max="999" required style="width:5rem" aria-label="Away score"> <label>Away <select name="away">${opts}</select></label> <button>Send to organiser</button></form><p class="note">The organiser checks every score before it reaches the table.</p>`;
  return html.replace("<head>", '<head><meta name="robots" content="noindex">').replace("<footer>", `<h2>Add your team to your calendar</h2><ul>${cal}</ul>${form}<footer>`);
}

function adminPage(state, key, note = "") {
  const f = state.fields, k = esc(key);
  const names = buildLeague(f).schedule?.teams ?? [];
  const pending = (state.pending || []).map((r, i) => names[r.a] === undefined || names[r.b] === undefined ? "" : `<li>${esc(resultLine(names, r))} <form method="post" action="/admin/result?key=${k}" style="display:inline"><input type="hidden" name="i" value="${i}"><button name="act" value="approve">Approve</button><button name="act" value="decline">Decline</button></form></li>`).join("");
  const waiting = pending ? `<h2>Scores waiting for you</h2><ul>${pending}</ul>` : "";
  const area = (name, label) => `<label>${label}<textarea name="${name}">${esc(f[name] ?? "")}</textarea></label>`;
  return page("League admin", `${note}${waiting}
<form method="post" action="/admin/save?key=${k}">
<label>Season start (YYYY-MM-DD)<input name="start" value="${esc(f.start)}"></label>
<label>Weekdays, comma separated (${WEEKDAYS.join(" ")})<input name="weekdays" value="${esc((f.weekdays || []).join(", "))}"></label>
<label>Play-off spots (0 for none)<input name="playoff" value="${esc(f.playoff ?? 0)}"></label>
<label><input type="checkbox" name="double" value="1" style="width:auto" ${f.double ? "checked" : ""}> Double round robin</label>
${area("teams", "Teams, one per line")}${area("courts", "Courts, one per line")}${area("times", "Time slots, e.g. 18:00, 19:00")}${area("skip", "Skip dates")}${area("blackouts", "Blackouts, e.g. Team: 2026-10-20")}${area("rainouts", "Rainouts")}${area("withdrawals", "Withdrawals")}${area("lateTeams", "Late teams")}${area("results", "Results, e.g. Hawks 3 - 2 Owls")}
<button name="act" value="save">Save</button><button name="act" value="publish">Save and publish</button></form>
<p class="note">${state.published ? "Published." : "Not published: players see nothing yet."} Player link: <code>/league?t=LEAGUE_TOKEN</code></p>`);
}

async function readForm(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > MAX_BODY) return null; chunks.push(c); }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

export function handler(state, save, env = process.env) {
  const adminKey = env.ADMIN_KEY || "", token = env.LEAGUE_TOKEN || "";
  // Throttle guessing of the two URL secrets: MAX_FAILS wrong links from one address in WINDOW_MS locks it out for the rest of the window.
  const MAX_FAILS = 10, WINDOW_MS = 15 * 60 * 1000, fails = new Map();
  return async (req, res) => {
    const send = (code, body, type = "text/html; charset=utf-8", extra = {}) => { res.writeHead(code, { "content-type": type, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...extra }); res.end(body); };
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");
    if (!adminKey || !token) return send(503, "Set ADMIN_KEY and LEAGUE_TOKEN.\n", "text/plain");
    const isAdmin = url.pathname.startsWith("/admin"), isLeague = url.pathname.startsWith("/league");
    if (!isAdmin && !isLeague) return send(404, "not found\n", "text/plain");
    const hops = String(req.headers["x-forwarded-for"] || "").split(",").map((h) => h.trim()).filter(Boolean);
    const who = hops.length ? hops[hops.length - 1] : req.socket.remoteAddress, now = Date.now();
    let rec = fails.get(who);
    if (rec && now > rec.until) { fails.delete(who); rec = undefined; }
    if (rec && rec.n >= MAX_FAILS) return send(429, "too many wrong links; try again later\n", "text/plain", { "retry-after": String(Math.ceil((rec.until - now) / 1000)) });
    if (isAdmin ? !same(url.searchParams.get("key") ?? "", adminKey) : !same(url.searchParams.get("t") ?? "", token)) {
      if (fails.size >= 5000) fails.clear();
      if (!rec) fails.set(who, rec = { n: 0, until: now + WINDOW_MS });
      rec.n++;
      return send(401, "link required\n", "text/plain");
    }
    const t = url.searchParams.get("t");
    if (isLeague) {
      if (req.method === "GET" && url.pathname === "/league") return send(200, state.published ? leaguePage(state, t) : page("League", "<p>No schedule has been published yet.</p>"));
      if (req.method === "GET" && url.pathname === "/league/ics") {
        const out = state.published ? buildLeague(state.fields) : { error: "unpublished" };
        const i = Number(url.searchParams.get("team"));
        if (out.error || !Number.isInteger(i) || i < 0 || i >= out.schedule.teams.length) return send(404, "no such team\n", "text/plain");
        return send(200, scheduleIcs(out.schedule, i, null, null, Number(url.searchParams.get("alarm")) || null), "text/calendar; charset=utf-8", { "content-disposition": 'attachment; filename="schedule.ics"' });
      }
      if (req.method === "POST" && url.pathname === "/league/result") {
        const out = state.published ? buildLeague(state.fields) : { error: "unpublished" };
        if (out.error) return send(404, "not found\n", "text/plain");
        const body = await readForm(req);
        if (!body) return send(413, "too large\n", "text/plain");
        const r = parseScoreRequest(body, out.schedule.teams);
        if (r.error) return send(400, page("Score not sent", `<p class="err">${esc(r.error)}</p><p><a href="/league?t=${esc(t)}">Back</a></p>`));
        state.pending = state.pending || [];
        if (state.pending.length >= MAX_PENDING) return send(429, page("Score not sent", `<p class="err">The organiser has too many scores waiting. Try again later.</p>`), "text/html; charset=utf-8");
        state.pending.push(r.req);
        save();
        return send(200, page("Score sent", `<p class="ok">Sent: ${esc(resultLine(out.schedule.teams, r.req))}. It shows in the table once the organiser approves it.</p><p><a href="/league?t=${esc(t)}">Back to the league</a></p>`));
      }
      return send(404, "not found\n", "text/plain");
    }
    let form = new URLSearchParams();
    if (req.method === "POST") {
      form = await readForm(req);
      if (!form) return send(413, "too large\n", "text/plain");
    }
    const here = `/admin?key=${encodeURIComponent(adminKey)}`;
    if (req.method === "GET" && url.pathname === "/admin") {
      const note = url.searchParams.get("note");
      return send(200, adminPage(state, adminKey, note ? `<p class="ok">${esc(note)}</p>` : ""));
    }
    if (req.method === "POST" && url.pathname === "/admin/save") {
      const f = { ...state.fields };
      for (const k of TEXT_FIELDS) f[k] = String(form.get(k) ?? "");
      f.weekdays = String(form.get("weekdays") || "").split(/[\s,]+/).filter((d) => WEEKDAYS.includes(d));
      f.double = form.get("double") === "1";
      f.playoff = Math.trunc(Number(form.get("playoff")) || 0);
      state.fields = f;
      const out = buildLeague(f);
      if (form.get("act") === "publish") {
        if (out.error) { save(); return send(400, adminPage(state, adminKey, `<p class="err">${esc(out.error)}</p>`)); }
        state.published = true;
      }
      save();
      return send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent(out.error ? "Saved, but: " + out.error : "Saved." + (out.warnings.length ? " " + out.warnings.length + " warning(s): " + out.warnings[0] : ""))}` });
    }
    if (req.method === "POST" && url.pathname === "/admin/result") {
      const i = Number(form.get("i")), r = (state.pending || [])[i];
      if (!Number.isInteger(i) || !r) return send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent("That score is no longer waiting.")}` });
      let note = "Declined.";
      if (form.get("act") === "approve") {
        const teams = buildLeague(state.fields).schedule?.teams;
        if (!teams) return send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent("Fix the league first, then approve.")}` });
        const f = state.fields, prev = String(f.results || "").replace(/\s+$/, "");
        f.results = (prev ? prev + "\n" : "") + resultLine(teams, r);
        note = `Added to results: ${resultLine(teams, r)}`;
      }
      state.pending.splice(i, 1);
      save();
      return send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent(note)}` });
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
  http.createServer(handler(state, save)).listen(port, () => console.log(`league hub on :${port}${process.env.ADMIN_KEY && process.env.LEAGUE_TOKEN ? "" : " (set ADMIN_KEY and LEAGUE_TOKEN)"}`));
}
