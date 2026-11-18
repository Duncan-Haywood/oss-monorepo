#!/usr/bin/env node
// Self-hosted league page: you build the season and post results, your players open one link to see
// fixtures, the table and a calendar feed for their team. Zero dependencies; run it on a box you own.
//   ADMIN_KEY=... LEAGUE_TOKEN=... STATE=/data/state.json PORT=8080 node server.mjs
// ADMIN_KEY unlocks /admin. LEAGUE_TOKEN is the secret in the link you share (/league?t=...).
// State is one JSON file: put STATE on a persistent disk.
// Optional reminders on your own mail account (off unless SMTP_HOST is set): SMTP_HOST, SMTP_PORT,
// SMTP_USER, SMTP_PASS, SMTP_FROM, and REMINDER_TO (the organiser's address, copied on every reminder).
// Two days before a game, a team still short of players gets one email (mailer.mjs).
// Schedule-change emails (changes.mjs): saving a published league with "Email teams" ticked sends each
// team whose upcoming games moved, were cancelled or were added one email listing only those games.
// Team sign-ups (registration.mjs): /register is public while the organiser has sign-ups open in /admin.
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { readSpec, buildSchedule, applyRainouts, applyWithdrawals, applyLateTeams, parseResults, parsePointSystem, standings, playoffBracket, leaguePageHtml, scheduleIcs, sampleFields, WEEKDAYS } from "./calc.mjs";
import { pathToFileURL } from "node:url";
import { upcomingGames, parseAvailability, recordAvailability, availabilityHtml, shortTeamsHtml, dayNumber, parseRosters, parseContacts, availabilityCsv, remindersDue, EMAIL, REMINDER_DAYS } from "./availability.mjs";
import { smtpConfig, sendMail } from "./mailer.mjs";
import { scheduleChanges, changeEmails, changeSummary } from "./changes.mjs";
import { regSettings, closedReason, parseRegistration, namesInUse, addRegistration, allowSignup, approveRegistration, declineRegistration, togglePaid, registrationsCsv, registerFormHtml, registeredHtml, adminRegistrationsHtml, signupEmail } from "./registration.mjs";

const MAX_BODY = 64 * 1024;
const TEXT_FIELDS = ["teams", "start", "skip", "blackouts", "courts", "times", "timeLimits", "courtLimits", "results", "rainouts", "withdrawals", "lateTeams", "scoring", "rosters", "contacts"];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

const CSS = `body{font:16px/1.5 system-ui,sans-serif;max-width:60rem;margin:0 auto;padding:1rem;color:#1a1a1a}textarea,input{width:100%;font:inherit;box-sizing:border-box}textarea{font-family:ui-monospace,monospace;min-height:6rem}button{font:inherit;padding:.5rem 1rem;margin:.5rem .5rem .5rem 0}.note{color:#555;font-size:.9rem}.err{color:#b00020}.ok{color:#176f2c}`;
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body><h1>${esc(title)}</h1>${body}<p class="note">Self-hosted with <a href="https://marisstella.app/league-schedule-generator/">League Schedule Generator</a> (MIT). Check dates and venues with your organiser.</p></body></html>`;

export function emptyState() { return { fields: { ...sampleFields(), results: "" }, published: false, pending: [], availability: {}, remindersSent: {}, registrations: [], approvedSignups: [], regSeq: 0 }; }

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

/**
 * The address calendars poll: PUBLIC_URL when set (https://league.example.org), else the request's
 * own host over x-forwarded-proto (Fly and Render set it). A host that is not a plain name[:port]
 * gives null, and the page then offers downloads only.
 */
export function publicBase(req, env = process.env) {
  if (env.PUBLIC_URL && /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?\/?$/.test(env.PUBLIC_URL)) return env.PUBLIC_URL.replace(/\/$/, "");
  const host = String(req.headers.host || "");
  if (!/^[A-Za-z0-9.-]+(:\d+)?$/.test(host)) return null;
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https" ? "https" : "http";
  return `${proto}://${host}`;
}

/** Subscribe and download links for one team's feed (team = null: the whole league). */
export function calendarLinks(base, token, team) {
  const q = `t=${encodeURIComponent(token)}&team=${team === null ? "all" : team}`;
  const dl = `<a href="/league/ics?${esc(q)}">download</a>`;
  if (!base) return dl;
  const feed = `${base}/league/ics?${q}`;
  const webcal = feed.replace(/^https?:/, "webcal:");
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  return `<a href="${esc(webcal)}">subscribe</a> · <a href="${esc(google)}" rel="noopener">Google Calendar</a> · ${dl} · <input readonly value="${esc(feed)}" aria-label="Calendar address" style="width:auto;min-width:16rem;font-size:.8rem" onfocus="this.select()">`;
}

function leaguePage(state, token, base = null, today = dayNumber(Date.now())) {
  const out = buildLeague(state.fields);
  if (out.error) return page("League", `<p>The organiser has not published a valid league yet.</p>`);
  const html = leaguePageHtml(out.schedule, { title: "League schedule", table: out.table, bracket: out.bracket });
  const cal = `<li><strong>Whole league</strong>: ${calendarLinks(base, token, null)}</li>` + out.schedule.teams.map((n, i) => `<li>${esc(n)}: ${calendarLinks(base, token, i)}</li>`).join("");
  const calNote = `<p class="note">Subscribe once and your calendar app re-reads this feed on its own schedule (each app decides how often), so a rained-out game moves without anyone re-sending anything. A downloaded file is a copy: after a change, download it again and re-import it. Every game keeps the same event id all season, so an app that matches events by id, as the iCalendar standard expects, updates the moved games instead of adding copies. Anyone with the calendar address can read the schedule, the same as this page.</p>`;
  const opts = out.schedule.teams.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join("");
  const form = `<h2>Report a score</h2><form method="post" action="/league/result?t=${esc(token)}"><label>Home <select name="home">${opts}</select></label> <input name="hs" type="number" min="0" max="999" required style="width:5rem" aria-label="Home score"> - <input name="as" type="number" min="0" max="999" required style="width:5rem" aria-label="Away score"> <label>Away <select name="away">${opts}</select></label> <button>Send to organiser</button></form><p class="note">The organiser checks every score before it reaches the table.</p>`;
  const rosters = parseRosters(state.fields.rosters, out.schedule.teams).rosters;
  const avail = availabilityHtml(state.availability || {}, upcomingGames(out.schedule, today), { token, minPlayers: state.fields.minPlayers, rosters });
  return html.replace("<head>", '<head><meta name="robots" content="noindex">').replace("<footer>", `${avail}<h2>Add your team to your calendar</h2><ul>${cal}</ul>${calNote}${form}<footer>`);
}

function adminPage(state, key, note = "", today = dayNumber(Date.now()), env = process.env) {
  const f = state.fields, k = esc(key);
  const built = buildLeague(f), names = built.schedule?.teams ?? [];
  const rp = parseRosters(f.rosters, names), cp = parseContacts(f.contacts, names);
  const games = built.schedule && state.published ? upcomingGames(built.schedule, today) : [];
  const short = games.length ? shortTeamsHtml(state.availability || {}, games, f.minPlayers, rp.rosters) : "";
  const csv = games.length ? `<p><a href="/admin/availability.csv?key=${k}">Download everyone's answers (CSV)</a> for the next games, with roster players who have not answered.</p>` : "";
  const smtp = smtpConfig(env);
  const mailNote = !smtp ? "Reminder emails are off: set SMTP_HOST, SMTP_FROM (and SMTP_USER, SMTP_PASS) on the server to send them from your own mail account." : smtp.error ? `Reminder emails are off: ${smtp.error}.` : `Reminder emails are on: a team still short ${REMINDER_DAYS} days out gets one email at these addresses${EMAIL.test(env.REMINDER_TO || "") ? ", copied to " + env.REMINDER_TO : ""}. ${Object.keys(state.remindersSent || {}).length} sent for the next games.`;
  const parseNotes = [...rp.errors, ...cp.errors].slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join("");
  const pending = (state.pending || []).map((r, i) => names[r.a] === undefined || names[r.b] === undefined ? "" : `<li>${esc(resultLine(names, r))} <form method="post" action="/admin/result?key=${k}" style="display:inline"><input type="hidden" name="i" value="${i}"><button name="act" value="approve">Approve</button><button name="act" value="decline">Decline</button></form></li>`).join("");
  const waiting = pending ? `<h2>Scores waiting for you</h2><ul>${pending}</ul>` : "";
  const area = (name, label) => `<label>${label}<textarea name="${name}">${esc(f[name] ?? "")}</textarea></label>`;
  const rs = regSettings(f), signups = adminRegistrationsHtml(state, key);
  return page("League admin", `${note}${signups}${waiting}${short}${csv}${parseNotes ? `<ul class="err">${parseNotes}</ul>` : ""}
<form method="post" action="/admin/save?key=${k}">
<label>Season start (YYYY-MM-DD)<input name="start" value="${esc(f.start)}"></label>
<label>Weekdays, comma separated (${WEEKDAYS.join(" ")})<input name="weekdays" value="${esc((f.weekdays || []).join(", "))}"></label>
<label>Play-off spots (0 for none)<input name="playoff" value="${esc(f.playoff ?? 0)}"></label>
<label>Players a team needs on the night (0 = do not flag short teams)<input name="minPlayers" inputmode="numeric" value="${esc(f.minPlayers ?? 0)}"></label>
<label><input type="checkbox" name="double" value="1" style="width:auto" ${f.double ? "checked" : ""}> Double round robin</label>
${area("teams", "Teams, one per line")}${area("courts", "Courts, one per line")}${area("times", "Time slots, e.g. 18:00, 19:00")}${area("skip", "Skip dates")}${area("blackouts", "Blackouts, e.g. Team: 2026-10-20")}${area("rainouts", "Rainouts")}${area("withdrawals", "Withdrawals")}${area("lateTeams", "Late teams")}${area("results", "Results, e.g. Hawks 3 - 2 Owls")}${area("rosters", "Rosters (optional), e.g. Hawks: Ana, Ben, Cara. Players pick their name from the list, and you see who has not answered")}${area("contacts", "Team contacts for reminder emails (optional), e.g. Hawks: captain@example.org")}
<fieldset><legend>Team sign-ups</legend>
<label><input type="checkbox" name="regOpen" value="1" style="width:auto" ${rs.open ? "checked" : ""}> Open sign-ups at <code>/register</code> (a public page: share it anywhere)</label>
<label>Fee per team, as you want it shown (optional), e.g. $450<input name="regFee" maxlength="60" value="${esc(f.regFee ?? "")}"></label>
<label>Your payment page (optional, https), e.g. a Stripe, Square or PayPal payment link you made<input name="regPayUrl" value="${esc(f.regPayUrl ?? "")}"></label>
<label>Most teams (0 = no cap; past it, sign-ups go on a waitlist)<input name="regMaxTeams" inputmode="numeric" value="${esc(f.regMaxTeams ?? 0)}"></label>
<label>Sign-ups close after (YYYY-MM-DD, optional)<input name="regCloses" value="${esc(f.regCloses ?? "")}"></label>
<p class="note">Approve adds the team to Teams, its players to Rosters and the captain's email to Contacts. Fees are paid on your own payment page; this server never sees a card, and you tick Paid by hand.${f.regPayUrl && !rs.payUrl ? " The payment page address is not a plain https link, so it is not shown." : ""}</p></fieldset><p class="note">${esc(mailNote)} Rosters and contacts stay in this server's state file; players see first names on the league page, never the email addresses.</p>
<label><input type="checkbox" name="notify" value="1" style="width:auto"${state.published ? "" : " disabled"}> Email teams whose upcoming games this save moves, cancels or adds (one email per team, to its contacts${smtp && !smtp.error ? "" : "; needs SMTP, see above"})</label>
<button name="act" value="save">Save</button><button name="act" value="publish">Save and publish</button></form>
<p class="note">${state.published ? "Published." : "Not published: players see nothing yet."} Player link: <code>/league?t=LEAGUE_TOKEN</code>. Sign-up page: <code>/register</code> (${rs.open ? "open" : "closed"}).</p>`);
}

async function readForm(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > MAX_BODY) return null; chunks.push(c); }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

export function handler(state, save, env = process.env, clock = Date.now, mail = sendMail) {
  const adminKey = env.ADMIN_KEY || "", token = env.LEAGUE_TOKEN || "";
  // Throttle guessing of the two URL secrets: MAX_FAILS wrong links from one address in WINDOW_MS locks it out for the rest of the window.
  const MAX_FAILS = 10, WINDOW_MS = 15 * 60 * 1000, fails = new Map(), signups = new Map();
  const today = () => new Date(clock()).toISOString().slice(0, 10);
  // The public sign-up page: no secret in the link, so it is closed unless the organiser opened it,
  // and capped per address, per store and with a honeypot field.
  async function register(req, send, who) {
    const title = "Sign up a team";
    const why = closedReason(state.fields, today());
    if (req.method === "GET") return send(why ? 404 : 200, page(title, registerFormHtml(state, today())));
    if (req.method !== "POST") return send(405, "method not allowed\n", "text/plain", { allow: "GET, POST" });
    if (why) return send(404, page(title, `<p>${esc(why)}</p>`));
    const form = await readForm(req);
    if (!form) return send(413, "too large\n", "text/plain");
    const r = parseRegistration(form, namesInUse(state.fields, state.registrations || []));
    if (r.spam) return send(200, page("Signed up", "<p class=\"ok\">Thanks.</p>"));
    const values = Object.fromEntries(["team", "captain", "email", "phone", "players", "note"].map((k) => [k, String(form.get(k) ?? "")]));
    if (r.error) return send(400, page(title, `<p class="err">${esc(r.error)}</p>${registerFormHtml(state, today(), values)}`));
    if (!allowSignup(signups, who, clock())) return send(429, page(title, `<p class="err">Too many sign-ups from this connection in the last hour. Try again later.</p>`));
    const a = addRegistration(state, r.req, clock());
    if (a.error) return send(429, page(title, `<p class="err">${esc(a.error)}</p>`));
    save();
    const cfg = smtpConfig(env);
    if (cfg && !cfg.error) {
      const base = publicBase(req, env);
      Promise.resolve().then(() => mail(cfg, signupEmail(state, a.reg, { organiser: EMAIL.test(env.REMINDER_TO || "") ? env.REMINDER_TO : "", registerUrl: base ? `${base}/register` : "" })))
        .catch((e) => console.error(`sign-up email for ${a.reg.team} not sent: ${e.message}`));
    }
    return send(200, page(a.reg.status === "waitlist" ? "On the waitlist" : "Signed up", registeredHtml(state, a.reg)));
  }
  return async (req, res) => {
    const send = (code, body, type = "text/html; charset=utf-8", extra = {}) => { res.writeHead(code, { "content-type": type, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...extra }); res.end(body); };
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");
    if (!adminKey || !token) return send(503, "Set ADMIN_KEY and LEAGUE_TOKEN.\n", "text/plain");
    const isAdmin = url.pathname.startsWith("/admin"), isLeague = url.pathname.startsWith("/league");
    const hops = String(req.headers["x-forwarded-for"] || "").split(",").map((h) => h.trim()).filter(Boolean);
    const who = hops.length ? hops[hops.length - 1] : req.socket.remoteAddress, now = Date.now();
    if (url.pathname === "/register") return register(req, send, who);
    if (!isAdmin && !isLeague) return send(404, "not found\n", "text/plain");
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
      if (req.method === "GET" && url.pathname === "/league") return send(200, state.published ? leaguePage(state, t, publicBase(req, env), dayNumber(clock())) : page("League", "<p>No schedule has been published yet.</p>"));
      if (req.method === "GET" && url.pathname === "/league/ics") {
        const out = state.published ? buildLeague(state.fields) : { error: "unpublished" };
        const raw = url.searchParams.get("team"), all = raw === "all", i = Number(raw);
        if (out.error || (!all && (raw === null || raw === "" || !Number.isInteger(i) || i < 0 || i >= out.schedule.teams.length))) return send(404, "no such team\n", "text/plain");
        // A feed calendars poll: same event ids every time (fixture ids), so a moved game updates in place.
        return send(200, scheduleIcs(out.schedule, all ? null : i, null, null, Number(url.searchParams.get("alarm")) || null), "text/calendar; charset=utf-8", { "content-disposition": `inline; filename="${all ? "league" : "team-" + i}.ics"`, "cache-control": "no-cache" });
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
      if (req.method === "POST" && url.pathname === "/league/available") {
        const out = state.published ? buildLeague(state.fields) : { error: "unpublished" };
        if (out.error) return send(404, "not found\n", "text/plain");
        const body = await readForm(req);
        if (!body) return send(413, "too large\n", "text/plain");
        const games = upcomingGames(out.schedule, dayNumber(clock()));
        const back = `<p><a href="/league?t=${esc(t)}">Back to the league</a></p>`;
        const r = parseAvailability(body, games, out.schedule.teams);
        if (r.error) return send(400, page("Answer not saved", `<p class="err">${esc(r.error)}</p>${back}`));
        state.availability = state.availability || {};
        const w = recordAvailability(state.availability, r.req, games, clock());
        if (w.error) return send(429, page("Answer not saved", `<p class="err">${esc(w.error)}</p>${back}`));
        save();
        const g = games.find((x) => x.fixture === r.req.fixture);
        return send(200, page("Answer saved", `<p class="ok">${w.replaced ? "Changed" : "Saved"}: ${esc(r.req.name)} is ${esc(r.req.status === "in" ? "in" : r.req.status === "out" ? "out" : "a maybe")} for ${esc(r.req.team)} v ${esc(r.req.team === g.homeName ? g.awayName : g.homeName)}.</p>${back}`));
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
      return send(200, adminPage(state, adminKey, note ? `<p class="ok">${esc(note)}</p>` : "", dayNumber(clock()), env));
    }
    if (req.method === "GET" && url.pathname === "/admin/availability.csv") {
      const out = buildLeague(state.fields);
      if (out.error || !state.published) return send(404, "publish the league first\n", "text/plain");
      const games = upcomingGames(out.schedule, dayNumber(clock()), Number(url.searchParams.get("nights")) || undefined);
      const csv = availabilityCsv(state.availability || {}, games, parseRosters(state.fields.rosters, out.schedule.teams).rosters);
      return send(200, "\ufeff" + csv, "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="availability.csv"', "cache-control": "no-store" });
    }
    if (req.method === "POST" && url.pathname === "/admin/save") {
      const f = { ...state.fields };
      for (const k of TEXT_FIELDS) f[k] = String(form.get(k) ?? "");
      f.weekdays = String(form.get("weekdays") || "").split(/[\s,]+/).filter((d) => WEEKDAYS.includes(d));
      f.double = form.get("double") === "1";
      f.playoff = Math.trunc(Number(form.get("playoff")) || 0);
      f.minPlayers = Math.min(99, Math.max(0, Math.trunc(Number(form.get("minPlayers")) || 0)));
      f.regOpen = form.get("regOpen") === "1";
      for (const k of ["regFee", "regPayUrl", "regCloses"]) f[k] = String(form.get(k) ?? "").trim().slice(0, 500);
      f.regMaxTeams = regSettings({ regMaxTeams: form.get("regMaxTeams") }).maxTeams;
      const wasPublished = state.published, prev = wasPublished ? buildLeague(state.fields) : null;
      state.fields = f;
      const out = buildLeague(f);
      if (form.get("act") === "publish") {
        if (out.error) { save(); return send(400, adminPage(state, adminKey, `<p class="err">${esc(out.error)}</p>`, dayNumber(clock()), env)); }
        state.published = true;
      }
      save();
      let changeNote = "";
      if (wasPublished && prev && !prev.error && !out.error) {
        const changes = scheduleChanges(prev.schedule, out.schedule, dayNumber(clock()));
        if (changes.length) {
          changeNote = ` ${changeSummary(changes)}.`;
          const cfg = smtpConfig(env);
          if (form.get("notify") !== "1") changeNote += " Teams were not emailed (tick \"Email teams\" when you save to send them).";
          else if (!cfg || cfg.error) changeNote += " Teams were not emailed: reminder email (SMTP) is off.";
          else {
            const base = env.PUBLIC_URL && /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?\/?$/.test(env.PUBLIC_URL) ? env.PUBLIC_URL.replace(/\/$/, "") : publicBase(req, env);
            const emails = changeEmails(changes, {
              contacts: parseContacts(f.contacts, out.schedule.teams).contacts,
              organiser: EMAIL.test(env.REMINDER_TO || "") ? env.REMINDER_TO : "",
              leagueUrl: base && token ? `${base}/league?t=${encodeURIComponent(token)}` : "",
            });
            const missing = new Set(changes.flatMap((c) => [c.before, c.after]).filter(Boolean).flatMap((g) => [g.home, g.away]));
            for (const e of emails) missing.delete(e.team);
            changeNote += ` Emailing ${emails.length} team${emails.length === 1 ? "" : "s"}.${missing.size ? ` No contact address for ${[...missing].slice(0, 6).join(", ")}: tell them yourself.` : ""}`;
            for (const e of emails) Promise.resolve().then(() => mail(cfg, e)).catch((err) => console.error(`change email for ${e.team} not sent: ${err.message}`));
          }
        }
      }
      return send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent((out.error ? "Saved, but: " + out.error : "Saved." + (out.warnings.length ? " " + out.warnings.length + " warning(s): " + out.warnings[0] : "")) + changeNote)}` });
    }
    if (req.method === "GET" && url.pathname === "/admin/signups.csv") {
      return send(200, "\ufeff" + registrationsCsv(state), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="signups.csv"', "cache-control": "no-store" });
    }
    if (req.method === "POST" && url.pathname === "/admin/signup") {
      const id = Number(form.get("id")), act = form.get("act");
      const r = act === "approve" ? approveRegistration(state, id) : act === "decline" ? declineRegistration(state, id) : act === "paid" ? togglePaid(state, id) : { error: "Unknown action." };
      if (r.error) return send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent(r.error)}` });
      save();
      let note = act === "approve" ? `${r.reg.team} added to Teams, Rosters and Contacts.` : act === "decline" ? `${r.reg.team} declined (the captain is not emailed; tell them yourself).` : `${r.reg.team} marked ${r.reg.paid ? "paid" : "not paid"}.`;
      if (act === "approve") {
        const out = buildLeague(state.fields);
        if (out.error) note += ` The league does not build yet: ${out.error}`;
        else if (state.published) note += " The league is published, so the schedule now includes this team. If the season has started, add a Late teams line (YYYY-MM-DD Team) so its earlier games move instead of being missed.";
      }
      return send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent(note)}` });
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

/**
 * Send the reminders due now (remindersDue) on the deployer's SMTP and remember each one sent, so a
 * team gets one email per game. Keys for games no longer upcoming are dropped. Returns
 * { sent, failed, skipped } (skipped: reminders off, league unpublished or nothing due).
 */
export async function runReminders(state, save, env = process.env, clock = Date.now, mail = sendMail) {
  const cfg = smtpConfig(env);
  if (!cfg || cfg.error || !state.published) return { sent: 0, failed: 0, skipped: true };
  const out = buildLeague(state.fields);
  if (out.error) return { sent: 0, failed: 0, skipped: true };
  const today = dayNumber(clock());
  const games = upcomingGames(out.schedule, today, 99);
  const keep = new Set(games.map((g) => g.fixture));
  state.remindersSent = Object.fromEntries(Object.entries(state.remindersSent || {}).filter(([k]) => keep.has(k.split("|")[0])));
  const base = env.PUBLIC_URL && /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?\/?$/.test(env.PUBLIC_URL) ? env.PUBLIC_URL.replace(/\/$/, "") : "";
  const due = remindersDue(state.availability || {}, games, {
    minPlayers: state.fields.minPlayers, today, sent: state.remindersSent,
    contacts: parseContacts(state.fields.contacts, out.schedule.teams).contacts,
    rosters: parseRosters(state.fields.rosters, out.schedule.teams).rosters,
    organiser: EMAIL.test(env.REMINDER_TO || "") ? env.REMINDER_TO : "",
    leagueUrl: base && env.LEAGUE_TOKEN ? `${base}/league?t=${encodeURIComponent(env.LEAGUE_TOKEN)}` : "",
  });
  let sent = 0, failed = 0;
  for (const r of due) {
    try { await mail(cfg, r); state.remindersSent[r.key] = clock(); sent++; } catch (e) { failed++; console.error(`reminder for ${r.team} not sent: ${e.message}`); }
  }
  if (sent) save();
  return { sent, failed, skipped: !due.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const statePath = process.env.STATE || "state.json";
  let state = emptyState();
  try { state = { ...state, ...JSON.parse(fs.readFileSync(statePath, "utf8")) }; } catch (e) { if (e.code !== "ENOENT") throw e; }
  const save = () => { fs.writeFileSync(`${statePath}.tmp`, JSON.stringify(state)); fs.renameSync(`${statePath}.tmp`, statePath); };
  const port = Number(process.env.PORT || 8080);
  http.createServer(handler(state, save)).listen(port, () => console.log(`league hub on :${port}${process.env.ADMIN_KEY && process.env.LEAGUE_TOKEN ? "" : " (set ADMIN_KEY and LEAGUE_TOKEN)"}`));
  const smtp = smtpConfig();
  if (smtp?.error) console.error(`reminder emails off: ${smtp.error}`);
  else if (smtp) {
    let busy = false;
    const tick = async () => { if (busy) return; busy = true; try { const r = await runReminders(state, save); if (r.sent || r.failed) console.log(`reminders: ${r.sent} sent, ${r.failed} failed`); } finally { busy = false; } };
    setTimeout(tick, 5000);
    setInterval(tick, 60 * 60 * 1000).unref?.();
  }
}
