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
// Captain links (confirm.mjs): /league?t=LEAGUE_TOKEN&c=KEY, one key per team (an HMAC of its name under
// ADMIN_KEY). Two captains who report the same score put the result in the table without the organiser.
// Move requests (reschedule.mjs): a captain asks to move a game later, the other captain agrees, the
// organiser approves and the Rainouts line is written for them.
// Notices (announcements.mjs): the organiser posts a dated notice for the league page or one team's
// captain page, optionally emailed to the team contacts.
// Free agents (freeagents.mjs): /join is public while the organiser takes free agents; /admin places them on teams.
// Team sign-ups (registration.mjs): /register is public while the organiser has sign-ups open in /admin.
// Waivers (waivers.mjs): the organiser's own text, versioned by its hash; players sign at /league/waiver,
// captains on the sign-up form, and /admin shows who on each roster has not signed.
// Sportsmanship ratings (spirit.mjs): off by default; each captain rates the other team after a game from
// their captain link, the organiser sees averages, low ratings with comments and who has not rated.
import http from "node:http";
import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { readSpec, buildSchedule, applyRainouts, applyWithdrawals, applyLateTeams, parseResults, parsePointSystem, standings, playoffBracket, playBracket, leaguePageHtml, scheduleIcs, sampleFields, WEEKDAYS, dayLabel } from "./calc.mjs";
import { pathToFileURL } from "node:url";
import { parseScheduleImport, importedSchedule, importSummary } from "./importschedule.mjs";
import { parseDateList } from "./dates.mjs";
import { embedKeyOk, parseEmbedOptions, embedHtml, EMBED_HEADERS, adminEmbedHtml } from "./embed.mjs";
import { iconPng, manifestJson, SW_JS, pwaHeadHtml, pwaBodyHtml } from "./pwa.mjs";
import { upcomingGames, parseAvailability, recordAvailability, availabilityHtml, shortTeamsHtml, dayNumber, parseRosters, parseContacts, availabilityCsv, remindersDue, EMAIL, REMINDER_DAYS } from "./availability.mjs";
import { smtpConfig, sendMail } from "./mailer.mjs";
import { parseSubOffer, recordSub, placeSub, subsHtml, placeButtonsHtml, freeSubsLine } from "./subs.mjs";
import { scheduleChanges, changeEmails, changeSummary } from "./changes.mjs";
import { captainKey, captainTeam, reportableGames, parseReport, recordReport, reportLine, settle, openReports, adminReportsHtml, captainLinksHtml, captainHtml, captainLinkEmail } from "./confirm.mjs";
import { movableGames, tryMove, parseMoveRequest, recordMove, pruneMoves, openMoves, adminMovesHtml, captainMovesHtml, moveAskedEmail } from "./reschedule.mjs";
import { parseNotice, addNotice, removeNotice, noticesHtml, adminNoticesHtml, noticeEmails } from "./announcements.mjs";
import { spiritSettings, parseSpirit, recordSpirit, pruneSpirit, spiritTable, captainSpiritHtml, leagueSpiritHtml, adminSpiritHtml, spiritCsv, SPIRIT_MODES } from "./spirit.mjs";
import { disciplineSettings, parseDiscipline, disciplineState, leagueDisciplineHtml, captainDisciplineHtml, adminDisciplineHtml, disciplineCsv } from "./discipline.mjs";
import { cleanWaiverText, currentVersion, rememberVersion, parseSignature, parseWaiverForm, recordSignature, removeSignature, waiverFormHtml, registerWaiverHtml, waiverLinkHtml, adminWaiversHtml, waiversCsv, versionText } from "./waivers.mjs";
import { MAX_TAG_QUESTIONS, MAX_SHEET, faSettings, faClosedReason, parseFreeAgent, allowJoin, addFreeAgent, suggestPlacements, placeFreeAgent, removeFreeAgent, placedEmails, freeAgentsCsv, joinFormHtml, joinedHtml, adminFreeAgentsHtml } from "./freeagents.mjs";
import { readOfficials, settleOfficials, officialByKey, officialKey, parseOfficialRequest, officialAction, adminAssign, fillOpen, pinDealt, clearUpcoming, withOfficials, officialHtml, leagueOfficialsHtml, adminOfficialsHtml, droppedEmail } from "./officiating.mjs";
import { regSettings, closedReason, parseRegistration, namesInUse, addRegistration, allowSignup, approveRegistration, declineRegistration, togglePaid, registrationsCsv, registerFormHtml, registeredHtml, adminRegistrationsHtml, signupEmail } from "./registration.mjs";

const MAX_BODY = 64 * 1024;
const TEXT_FIELDS = ["imported", "teams", "start", "skip", "blackouts", "courts", "times", "timeLimits", "courtLimits", "results", "rainouts", "withdrawals", "lateTeams", "scoring", "rosters", "contacts", "playoffResults", "officials", "discipline"];

/** Cards log -> { state, errors } against the built schedule (cards and suspensions, discipline.mjs). */
function leagueDiscipline(fields, schedule, today) {
  if (!String(fields.discipline || "").trim()) return null;
  const p = parseDiscipline(fields.discipline, schedule.teams);
  return { state: disciplineState(p.events, schedule, disciplineSettings(fields), today), errors: p.errors };
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

const CSS = `body{font:16px/1.5 system-ui,sans-serif;max-width:60rem;margin:0 auto;padding:1rem;color:#1a1a1a}textarea,input{width:100%;font:inherit;box-sizing:border-box}textarea{font-family:ui-monospace,monospace;min-height:6rem}button{font:inherit;padding:.5rem 1rem;margin:.5rem .5rem .5rem 0}.note{color:#555;font-size:.9rem}.err{color:#b00020}.ok{color:#176f2c}`;
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body><h1>${esc(title)}</h1>${body}<p class="note">Self-hosted with <a href="https://marisstella.app/league-schedule-generator/">League Schedule Generator</a> (MIT). Check dates and venues with your organiser.</p></body></html>`;

export function emptyState() { return { fields: { ...sampleFields(), results: "" }, published: false, pending: [], reports: {}, moves: {}, availability: {}, subs: {}, remindersSent: {}, notices: [], noticeSeq: 0, registrations: [], approvedSignups: [], regSeq: 0, freeAgents: [], placedAgents: [], faSeq: 0, waivers: [], waiverVersions: {}, waiverSeq: 0, spirit: {}, refPicks: {} }; }

/** The league's officials and who officiates each game (officiating.mjs), or null when no officials are listed. */
export function leagueOfficials(state, schedule) {
  if (!schedule || !String(state.fields.officials || "").trim()) return null;
  const { officials, errors } = readOfficials(state.fields, schedule.teams);
  if (!officials.length) return null;
  return { officials, errors, settled: settleOfficials(schedule, officials, state.refPicks || {}) };
}

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
  let s;
  const warnings = [];
  let importedResults = "";
  if (String(f.imported || "").trim()) {
    // A season made elsewhere (spreadsheet, platform export, calendar): run the league on it as it is.
    const parsed = parseScheduleImport(f.imported);
    if (!parsed.games.length) return { error: parsed.errors[0] || "No games were found in the imported schedule." };
    if (parsed.teams.length < 2) return { error: "The imported schedule needs at least two teams." };
    warnings.push(...parsed.errors, ...parsed.warnings);
    const minutes = Math.min(600, Math.max(5, Math.trunc(Number(f.minutes)) || 60));
    s = importedSchedule(parsed, { minutes, skipDays: parseDateList(f.skip || "").days });
    importedResults = parsed.results.join("\n");
  } else {
    const { spec, errors } = readSpec(f);
    if (errors.length) return { error: errors[0] };
    try { s = buildSchedule(spec); } catch (e) { return { error: e.message }; }
  }
  for (const [key, fn] of [["rainouts", applyRainouts], ["withdrawals", applyWithdrawals], ["lateTeams", applyLateTeams]]) {
    if (String(f[key] || "").trim()) { const r = fn(s, f[key]); s = r.schedule; warnings.push(...r.errors); }
  }
  let table = null, bracket = null, seeds = s.teams;
  const ps = parsePointSystem(f.scoring || "");
  if (ps.error) warnings.push(ps.error);
  const resultsText = [importedResults, String(f.results || "")].filter((x) => x.trim()).join("\n");
  if (resultsText.trim()) {
    const pr = parseResults(resultsText, s.teams);
    warnings.push(...pr.errors);
    table = standings(s.teams, pr.results, { win: ps.win, draw: ps.draw, loss: ps.loss, adjustments: pr.adjustments });
    seeds = table.map((r) => r.name);
  }
  const want = Math.trunc(Number(f.playoff) || 0);
  if (want >= 2 && want <= s.teams.length) {
    bracket = playoffBracket(seeds.slice(0, want), { afterDay: s.stats.lastDay, weekdays: s.config.weekdays, skipDays: s.config.skipDays });
    if (String(f.playoffResults || "").trim()) { bracket = playBracket(bracket, f.playoffResults); warnings.push(...bracket.errors); }
  }
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

/** The admin form's "Already have a schedule?" box, with what the last saved import read. */
export function importFieldset(f) {
  const text = String(f.imported || "");
  let status = "";
  if (text.trim()) {
    const p = parseScheduleImport(text);
    const sum = importSummary(p);
    status = (sum ? `<p class="ok">Imported: ${esc(sum)} The season below is ignored while this box has games in it; empty it to build one instead.</p>` : "")
      + (p.errors.length ? `<ul class="err">${p.errors.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join("")}${p.errors.length > 8 ? `<li>and ${p.errors.length - 8} more</li>` : ""}</ul>` : "")
      + (p.warnings.length ? `<ul class="note">${p.warnings.slice(0, 5).map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : "");
  }
  return `<fieldset><legend>Already have a schedule?</legend>
<p class="note">Paste the season you already have and the league page runs on it as it is: standings, rainout moves, calendar feeds, the website embed, availability, captains' score reports and officials. Copy the rows straight from Excel or Google Sheets (header row included), or paste a CSV export from TeamSnap, LeagueApps, SportsEngine or a club website, or the text of an .ics calendar. It needs a date column and either Home and Away columns or one column like "Hawks vs Owls" ("Owls @ Hawks" means Owls are away); time, location and Home Score / Away Score columns are read when present. Game length comes from the Minutes box; Skip dates are kept clear when a rained-out game is moved.</p>
<label>Schedule to import (optional)<textarea name="imported" style="min-height:5rem" placeholder="Date	Time	Home	Away	Field">${esc(text)}</textarea></label>
<label>Game length in minutes<input name="minutes" inputmode="numeric" value="${esc(f.minutes ?? 60)}" style="width:6rem"></label>
${status}</fieldset>`;
}

function leaguePage(state, token, base = null, today = dayNumber(Date.now()), captain = null, now = Date.now(), official = null) {
  const out = buildLeague(state.fields);
  if (out.error) return page("League", `<p>The organiser has not published a valid league yet.</p>`);
  const html = leaguePageHtml(out.schedule, { title: "League schedule", table: out.table, bracket: out.bracket });
  const cal = `<li><strong>Whole league</strong>: ${calendarLinks(base, token, null)}</li>` + out.schedule.teams.map((n, i) => `<li>${esc(n)}: ${calendarLinks(base, token, i)}</li>`).join("");
  const calNote = `<p class="note">Subscribe once and your calendar app re-reads this feed on its own schedule (each app decides how often), so a rained-out game moves without anyone re-sending anything. A downloaded file is a copy: after a change, download it again and re-import it. Every game keeps the same event id all season, so an app that matches events by id, as the iCalendar standard expects, updates the moved games instead of adding copies. Anyone with the calendar address can read the schedule, the same as this page.</p>`;
  const opts = out.schedule.teams.map((n, i) => `<option value="${i}">${esc(n)}</option>`).join("");
  const form = `<h2>Report a score</h2><form method="post" action="/league/result?t=${esc(token)}"><label>Home <select name="home">${opts}</select></label> <input name="hs" type="number" min="0" max="999" required style="width:5rem" aria-label="Home score"> - <input name="as" type="number" min="0" max="999" required style="width:5rem" aria-label="Away score"> <label>Away <select name="away">${opts}</select></label> <button>Send to organiser</button></form><p class="note">The organiser checks every score sent here before it reaches the table. Captains with their team's captain link report there instead: two matching captain reports go in by themselves.</p>`;
  const rosters = parseRosters(state.fields.rosters, out.schedule.teams).rosters;
  const games = upcomingGames(out.schedule, today);
  const avail = availabilityHtml(state.availability || {}, games, { token, minPlayers: state.fields.minPlayers, rosters });
  const subs = subsHtml(state.subs || {}, games, { token });
  const cap = captain ? captainHtml(state.reports || {}, reportableGames(out.schedule, today), captain.team, out.schedule.teams, { token, cap: captain.key }) + captainMovesHtml(state.moves || {}, movableGames(out.schedule, today), captain.team, { token, cap: captain.key }) : "";
  const news = noticesHtml(state.notices, today, captain ? out.schedule.teams[captain.team] : null);
  const waiver = waiverLinkHtml(state, token, captain ? { team: out.schedule.teams[captain.team], rosters } : {});
  const sp = spiritSettings(state.fields);
  const spirit = (captain && sp.mode ? captainSpiritHtml(state.spirit || {}, reportableGames(out.schedule, today), captain.team, sp.mode, { token, cap: captain.key }) : "") + (sp.show ? leagueSpiritHtml(spiritTable(state.spirit || {}, out.schedule, sp.mode), sp.mode) : "");
  const lo = leagueOfficials(state, out.schedule);
  let refs = "";
  if (lo) {
    const q = `t=${encodeURIComponent(token)}&o=${official ? encodeURIComponent(official.key) : ""}`;
    const feed = base ? `${base}/league/ics?${q}` : null;
    const calendar = official ? (feed ? `<a href="${esc(feed.replace(/^https?:/, "webcal:"))}">subscribe</a> · ` : "") + `<a href="/league/ics?${esc(q)}">download</a>` : "";
    refs = (official ? officialHtml(lo.settled, lo.officials, official.index, { token, key: official.key, today, calendar }) : "") + leagueOfficialsHtml(lo.settled, today);
  }
  const dq = leagueDiscipline(state.fields, out.schedule, today), dsets = disciplineSettings(state.fields);
  const disc = dq ? (captain ? captainDisciplineHtml(dq.state, captain.team, out.schedule.teams) : "") + (dsets.show ? leagueDisciplineHtml(dq.state, out.schedule.teams) : "") : "";
  const pwaHead = pwaHeadHtml(token, captain ? captain.key : null), pwaBody = pwaBodyHtml(now, { team: captain ? captain.team : null });
  return html.replace("<head>", `<head><meta name="robots" content="noindex">${pwaHead}`).replace("</h1>", `</h1>${pwaBody}${news}`).replace("<footer>", `${refs}${cap}${disc}${spirit}${waiver}${avail}${subs}<h2>Add your team to your calendar</h2><ul>${cal}</ul>${calNote}${form}<footer>`);
}

function adminPage(state, key, note = "", today = dayNumber(Date.now()), env = process.env, base = null) {
  const f = state.fields, k = esc(key);
  const built = buildLeague(f), names = built.schedule?.teams ?? [];
  const rp = parseRosters(f.rosters, names), cp = parseContacts(f.contacts, names);
  const games = built.schedule && state.published ? upcomingGames(built.schedule, today) : [];
  const av = state.availability || {}, pool = state.subs || {};
  const short = games.length ? shortTeamsHtml(av, games, f.minPlayers, rp.rosters, { extra: (r) => placeButtonsHtml(pool, av, games, r, key), subsLine: (r) => freeSubsLine(pool, av, games, r.day) }) : "";
  const csv = games.length ? `<p><a href="/admin/availability.csv?key=${k}">Download everyone's answers (CSV)</a> for the next games, with roster players who have not answered.</p>` : "";
  const smtp = smtpConfig(env);
  const mailNote = !smtp ? "Reminder emails are off: set SMTP_HOST, SMTP_FROM (and SMTP_USER, SMTP_PASS) on the server to send them from your own mail account." : smtp.error ? `Reminder emails are off: ${smtp.error}.` : `Reminder emails are on: a team still short ${REMINDER_DAYS} days out gets one email at these addresses${EMAIL.test(env.REMINDER_TO || "") ? ", copied to " + env.REMINDER_TO : ""}. ${Object.keys(state.remindersSent || {}).length} sent for the next games.`;
  const parseNotes = [...rp.errors, ...cp.errors, ...(built.bracket?.errors ?? [])];
  const pending = (state.pending || []).map((r, i) => names[r.a] === undefined || names[r.b] === undefined ? "" : `<li>${esc(resultLine(names, r))} <form method="post" action="/admin/result?key=${k}" style="display:inline"><input type="hidden" name="i" value="${i}"><button name="act" value="approve">Approve</button><button name="act" value="decline">Decline</button></form></li>`).join("");
  const waiting = (pending ? `<h2>Scores waiting for you</h2><ul>${pending}</ul>` : "") + (built.schedule && state.published ? adminReportsHtml(openReports(state.reports || {}, built.schedule), key) + adminMovesHtml(openMoves(state.moves || {}, built.schedule), key) : "");
  const token = env.LEAGUE_TOKEN || "", capBase = base;
  const capLinks = names.length && token ? captainLinksHtml(names, key, token, capBase) + (smtp && !smtp.error ? `<form method="post" action="/admin/captain-links?key=${k}"><button>Email each team its captain link</button> <span class="note">to the team's contacts below</span></form>` : "") : "";
  const area = (name, label) => `<label>${label}<textarea name="${name}">${esc(f[name] ?? "")}</textarea></label>`;
  const rs = regSettings(f), signups = adminRegistrationsHtml(state, key), fs = faSettings(f);
  const freeAgents = adminFreeAgentsHtml(state, key, names.length ? names : String(f.teams || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  const notices = adminNoticesHtml(state, key, names, today, { canEmail: !!(smtp && !smtp.error) });
  const waivers = adminWaiversHtml(state, key, rp.rosters, names);
  const sp = spiritSettings(f);
  const spiritAdmin = sp.mode && built.schedule && state.published ? adminSpiritHtml(state.spirit || {}, built.schedule, sp.mode, today, key) : "";
  const spiritOpts = [["", "Off"], ...Object.entries(SPIRIT_MODES).map(([v, m]) => [v, m.label])].map(([v, l]) => `<option value="${v}"${(sp.mode || "") === v ? " selected" : ""}>${esc(l)}</option>`).join("");
  const lo = built.schedule ? leagueOfficials(state, built.schedule) : null;
  const refAdmin = lo && state.published ? adminOfficialsHtml(lo.settled, lo.officials, { key, token, base, today, secret: key }) : "";
  if (lo) parseNotes.push(...lo.errors);
  const ds = disciplineSettings(f), dq = built.schedule ? leagueDiscipline(f, built.schedule, today) : null;
  const discAdmin = dq ? adminDisciplineHtml(dq.state, names, dq.errors) + `<p><a href="/admin/discipline.csv?key=${k}">Download every ban (CSV)</a></p>` : "";
  return page("League admin", `${note}${signups}${freeAgents}${waiting}${short}${csv}${parseNotes.length ? `<ul class="err">${parseNotes.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
<form method="post" action="/admin/save?key=${k}">
${importFieldset(f)}
<label>Season start (YYYY-MM-DD)<input name="start" value="${esc(f.start)}"></label>
<label>Weekdays, comma separated (${WEEKDAYS.join(" ")})<input name="weekdays" value="${esc((f.weekdays || []).join(", "))}"></label>
<label>Play-off spots (0 for none)<input name="playoff" value="${esc(f.playoff ?? 0)}"></label>
<label>Players a team needs on the night (0 = do not flag short teams)<input name="minPlayers" inputmode="numeric" value="${esc(f.minPlayers ?? 0)}"></label>
<label><input type="checkbox" name="double" value="1" style="width:auto" ${f.double ? "checked" : ""}> Double round robin</label>
<label><input type="checkbox" name="reverseLeg" value="1" style="width:auto" ${f.reverseLeg ? "checked" : ""}> Return leg in reverse order (fewer back-to-back home or away games)</label>
${area("teams", "Teams, one per line")}${area("courts", "Courts, one per line")}${area("times", "Time slots, e.g. 18:00, 19:00")}${area("skip", "Skip dates")}${area("blackouts", "Blackouts, e.g. Team: 2026-10-20")}${area("rainouts", "Rainouts")}${area("withdrawals", "Withdrawals")}${area("lateTeams", "Late teams")}${area("results", "Results, e.g. Hawks 3 - 2 Owls")}${area("playoffResults", "Play-off results, e.g. Hawks 2 - 1 Owls or Hawks 1 - 1 Owls (Hawks on penalties). They fill the bracket and never touch the table")}${area("rosters", "Rosters (optional), e.g. Hawks: Ana, Ben, Cara. Players pick their name from the list, and you see who has not answered")}${area("contacts", "Team contacts for reminder emails (optional), e.g. Hawks: captain@example.org")}${area("officials", "Officials (optional), one per line: a name, their own team in brackets, the weekdays they can work, a game cap, e.g. Sam Ortiz (Hawks): Tue, Thu max 8. Every game gets one, and each official gets a private link to give games back and take open ones")}
<fieldset><legend>Team sign-ups</legend>
<label><input type="checkbox" name="regOpen" value="1" style="width:auto" ${rs.open ? "checked" : ""}> Open sign-ups at <code>/register</code> (a public page: share it anywhere)</label>
<label>Fee per team, as you want it shown (optional), e.g. $450<input name="regFee" maxlength="60" value="${esc(f.regFee ?? "")}"></label>
<label>Your payment page (optional, https), e.g. a Stripe, Square or PayPal payment link you made<input name="regPayUrl" value="${esc(f.regPayUrl ?? "")}"></label>
<label>Most teams (0 = no cap; past it, sign-ups go on a waitlist)<input name="regMaxTeams" inputmode="numeric" value="${esc(f.regMaxTeams ?? 0)}"></label>
<label>Sign-ups close after (YYYY-MM-DD, optional)<input name="regCloses" value="${esc(f.regCloses ?? "")}"></label>
<p class="note">Approve adds the team to Teams, its players to Rosters and the captain's email to Contacts. Fees are paid on your own payment page; this server never sees a card, and you tick Paid by hand.${f.regPayUrl && !rs.payUrl ? " The payment page address is not a plain https link, so it is not shown." : ""}</p></fieldset>
<fieldset><legend>Free agents (players with no team)</legend>
<label><input type="checkbox" name="faOpen" value="1" style="width:auto" ${fs.open ? "checked" : ""}> Take free agents at <code>/join</code> (a public page: share it anywhere)</label>
<label>Fee per player, as you want it shown (optional), e.g. $60<input name="faFee" maxlength="60" value="${esc(f.faFee ?? "")}"></label>
<label>Roster size to fill teams up to (0 = no limit; a team at this size is not suggested)<input name="faTarget" inputmode="numeric" value="${esc(f.faTarget ?? 0)}"></label>
<label>Free-agent sign-ups close after (YYYY-MM-DD, optional)<input name="faCloses" value="${esc(f.faCloses ?? "")}"></label>
<label>Ask free agents to tick these, so they are spread evenly across teams (optional, up to ${MAX_TAG_QUESTIONS}), e.g. <code>Woman=F, Goalie=G</code><input name="faTags" maxlength="300" value="${esc(f.faTags ?? "")}"></label>
<label>Ratings sheet for rostered players (optional): paste the balanced-teams page's CSV (Team, Player, Rating, Tag). Named players count at their rating and tags; free agents' experience is mapped onto the sheet's range<textarea name="faSheet" maxlength="${MAX_SHEET}" style="min-height:4rem">${esc(f.faSheet ?? "")}</textarea></label>
<p class="note">Placing a free agent adds them to that team's Rosters line and, with email on, sends the player their team and the team's contacts the player's details.</p></fieldset>
<fieldset><legend>Waiver (optional)</legend>
<label>Your waiver, release or code-of-conduct text, as players should read it. Leave empty for none<textarea name="waiverText" maxlength="12000" style="min-height:8rem;font-family:inherit">${esc(f.waiverText ?? "")}</textarea></label>
<p class="note">Players sign at <code>/league/waiver?t=LEAGUE_TOKEN</code> (linked from the league page) and captains on the sign-up form. Each signature keeps the exact text it agreed to: changing the text starts a new version, and earlier signatures show as "signed an earlier version". This page records who agreed to text you wrote; it does not write a waiver and is not legal advice. Whether a waiver holds, and the age at which a player can sign for themselves, depend on where you play: ask a lawyer or your league's insurer.</p></fieldset>
<fieldset><legend>Sportsmanship ratings (optional)</legend>
<label>After each game, each captain rates the other team from their captain link<select name="spiritMode">${spiritOpts}</select></label>
<label><input type="checkbox" name="spiritShow" value="1" style="width:auto" ${f.spiritShow ? "checked" : ""}> Show the sportsmanship table (averages only, never comments) on the league page</label>
<p class="note">The five-category scale follows the shape of the score sheet ultimate leagues use (rules, fouls and contact, fair-mindedness, attitude, communication; 0 to 4 each, 2 for a normal game). Switching the scale starts the averages again; earlier ratings stay in the state file.</p></fieldset>
<fieldset><legend>Cards, suspensions and scorers (optional)</legend>
${area("discipline", "Cards log, one event per line: date, team, player, then yellow, second yellow, red (optionally a ban length, red 3), ban 2, or goal (optionally a count, goal 2). E.g. 2026-10-14 Hawks: Ana Lopez yellow")}
<label>A ban after every this many yellows (0 = yellows never add up)<input name="yellowsPerBan" inputmode="numeric" value="${ds.yellowsPerBan}"></label>
<label>Games banned for each yellow-card ban<input name="yellowBanGames" inputmode="numeric" value="${ds.yellowBanGames}"></label>
<label><input type="checkbox" name="yellowEscalate" value="1" style="width:auto" ${ds.escalate ? "checked" : ""}> Each further yellow ban is longer (e.g. 5 yellows 1 game, 10 yellows 2, 15 yellows 3)</label>
<label>Games banned for a straight red, unless the line gives a number<input name="redBanGames" inputmode="numeric" value="${ds.redBanGames}"></label>
<label>Games banned for a sending off for two yellows<input name="secondYellowBanGames" inputmode="numeric" value="${ds.secondYellowBanGames}"></label>
<label><input type="checkbox" name="disciplineShow" value="1" style="width:auto" ${ds.show ? "checked" : ""}> Show suspensions and top scorers on the league page</label>
<p class="note">Bans are served in the player's team's own games after the game the card came in, and only games already played count, so a rained-out game serves nothing until it is played. Each captain's page shows their own team's suspensions either way. This keeps the count; your league's panel decides.</p></fieldset><p class="note">${esc(mailNote)} Rosters and contacts stay in this server's state file; players see first names on the league page, never the email addresses.</p>
<label><input type="checkbox" name="notify" value="1" style="width:auto"${state.published ? "" : " disabled"}> Email teams whose upcoming games this save moves, cancels or adds (one email per team, to its contacts${smtp && !smtp.error ? "" : "; needs SMTP, see above"})</label>
<button name="act" value="save">Save</button><button name="act" value="publish">Save and publish</button></form>
${refAdmin}${discAdmin}${spiritAdmin}${notices}${waivers}${capLinks}${names.length && state.published ? adminEmbedHtml(key, base, names) : ""}<p class="note">${state.published ? "Published." : "Not published: players see nothing yet."} Player link: <code>/league?t=LEAGUE_TOKEN</code>. Sign-up page: <code>/register</code> (${rs.open ? "open" : "closed"}). Free agents: <code>/join</code> (${fs.open ? "open" : "closed"}).</p>`);
}

async function readForm(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > MAX_BODY) return null; chunks.push(c); }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

export function handler(state, save, env = process.env, clock = Date.now, mail = sendMail) {
  const adminKey = env.ADMIN_KEY || "", token = env.LEAGUE_TOKEN || "";
  // Throttle guessing of the two URL secrets: MAX_FAILS wrong links from one address in WINDOW_MS locks it out for the rest of the window.
  const icons = {};
  const MAX_FAILS = 10, WINDOW_MS = 15 * 60 * 1000, fails = new Map(), signups = new Map(), joins = new Map();
  const today = () => new Date(clock()).toISOString().slice(0, 10);
  // The public sign-up page: no secret in the link, so it is closed unless the organiser opened it,
  // and capped per address, per store and with a honeypot field.
  async function register(req, send, who) {
    const title = "Sign up a team";
    const why = closedReason(state.fields, today());
    const formHtml = (values = {}) => registerFormHtml(state, today(), values).replace("<button>Sign up</button>", `${registerWaiverHtml(state, values)}<button>Sign up</button>`);
    if (req.method === "GET") return send(why ? 404 : 200, page(title, formHtml() + (faClosedReason(state.fields, today()) ? "" : `<p>No team? <a href="/join">Join as a free agent</a> and the organiser places you on one.</p>`)));
    if (req.method !== "POST") return send(405, "method not allowed\n", "text/plain", { allow: "GET, POST" });
    if (why) return send(404, page(title, `<p>${esc(why)}</p>`));
    const form = await readForm(req);
    if (!form) return send(413, "too large\n", "text/plain");
    const r = parseRegistration(form, namesInUse(state.fields, state.registrations || []));
    if (r.spam) return send(200, page("Signed up", "<p class=\"ok\">Thanks.</p>"));
    const values = Object.fromEntries(["team", "captain", "email", "phone", "players", "note", "w_fullname", "w_minor", "w_guardian", "w_signature"].map((k) => [k, String(form.get(k) ?? "")]));
    if (r.error) return send(400, page(title, `<p class="err">${esc(r.error)}</p>${formHtml(values)}`));
    const sig = currentVersion(state) ? parseSignature(form, { prefix: "w_" }) : null;
    if (sig?.error) return send(400, page(title, `<p class="err">Waiver: ${esc(sig.error)}</p>${formHtml(values)}`));
    if (!allowSignup(signups, who, clock())) return send(429, page(title, `<p class="err">Too many sign-ups from this connection in the last hour. Try again later.</p>`));
    const a = addRegistration(state, r.req, clock());
    if (a.error) return send(429, page(title, `<p class="err">${esc(a.error)}</p>`));
    if (sig) recordSignature(state, { team: a.reg.team, ...sig.sig, email: sig.sig.email || a.reg.email, via: "signup" }, clock());
    save();
    const cfg = smtpConfig(env);
    if (cfg && !cfg.error) {
      const base = publicBase(req, env);
      Promise.resolve().then(() => mail(cfg, signupEmail(state, a.reg, { organiser: EMAIL.test(env.REMINDER_TO || "") ? env.REMINDER_TO : "", registerUrl: base ? `${base}/register` : "" })))
        .catch((e) => console.error(`sign-up email for ${a.reg.team} not sent: ${e.message}`));
    }
    return send(200, page(a.reg.status === "waitlist" ? "On the waitlist" : "Signed up", registeredHtml(state, a.reg)));
  }
  // The public free-agent page: same guards as /register (off until opened, per-address cap, honeypot, store cap).
  async function join(req, send, who) {
    const title = "Join as a free agent";
    const why = faClosedReason(state.fields, today());
    if (req.method === "GET") return send(why ? 404 : 200, page(title, joinFormHtml(state, today())));
    if (req.method !== "POST") return send(405, "method not allowed\n", "text/plain", { allow: "GET, POST" });
    if (why) return send(404, page(title, `<p>${esc(why)}</p>`));
    const form = await readForm(req);
    if (!form) return send(413, "too large\n", "text/plain");
    const r = parseFreeAgent(form, state.freeAgents || [], state.fields);
    if (r.spam) return send(200, page("Joined", "<p class=\"ok\">Thanks.</p>"));
    const values = { ...Object.fromEntries(["name", "email", "phone", "level", "with", "note"].map((k) => [k, String(form.get(k) ?? "")])), tags: form.getAll("tag").map(String) };
    if (r.error) return send(400, page(title, `<p class="err">${esc(r.error)}</p>${joinFormHtml(state, today(), values)}`));
    if (!allowJoin(joins, who, clock())) return send(429, page(title, `<p class="err">Too many sign-ups from this connection in the last hour. Try again later.</p>`));
    const a = addFreeAgent(state, r.req, clock());
    if (a.error) return send(429, page(title, `<p class="err">${esc(a.error)}</p>`));
    save();
    return send(200, page("On the free-agent list", joinedHtml(a.agent)));
  }
  return async (req, res) => {
    const send = (code, body, type = "text/html; charset=utf-8", extra = {}) => { res.writeHead(code, { "content-type": type, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...extra }); res.end(body); };
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/healthz") return send(200, "ok\n", "text/plain");
    if (!adminKey || !token) return send(503, "Set ADMIN_KEY and LEAGUE_TOKEN.\n", "text/plain");
    // The offline worker and the app icons carry no secret, so they are served without a link.
    if (req.method === "GET" && url.pathname === "/sw.js") return send(200, SW_JS, "text/javascript; charset=utf-8", { "cache-control": "no-cache", "service-worker-allowed": "/" });
    if (req.method === "GET" && (url.pathname === "/icon-192.png" || url.pathname === "/icon-512.png")) return send(200, icons[url.pathname] ??= iconPng(url.pathname === "/icon-192.png" ? 192 : 512), "image/png", { "cache-control": "public, max-age=86400" });
    const isAdmin = url.pathname.startsWith("/admin"), isLeague = url.pathname.startsWith("/league"), isEmbed = url.pathname === "/embed";
    const hops = String(req.headers["x-forwarded-for"] || "").split(",").map((h) => h.trim()).filter(Boolean);
    const who = hops.length ? hops[hops.length - 1] : req.socket.remoteAddress, now = Date.now();
    if (url.pathname === "/register") return register(req, send, who);
    if (url.pathname === "/join") return join(req, send, who);
    if (!isAdmin && !isLeague && !isEmbed) return send(404, "not found\n", "text/plain");
    let rec = fails.get(who);
    if (rec && now > rec.until) { fails.delete(who); rec = undefined; }
    if (rec && rec.n >= MAX_FAILS) return send(429, "too many wrong links; try again later\n", "text/plain", { "retry-after": String(Math.ceil((rec.until - now) / 1000)) });
    if (isAdmin ? !same(url.searchParams.get("key") ?? "", adminKey) : isEmbed ? !embedKeyOk(adminKey, url.searchParams.get("k")) : !same(url.searchParams.get("t") ?? "", token)) {
      if (fails.size >= 5000) fails.clear();
      if (!rec) fails.set(who, rec = { n: 0, until: now + WINDOW_MS });
      rec.n++;
      return send(401, "link required\n", "text/plain");
    }
    // The club-website embed: read-only, framable by any site, keyed apart from the player link (embed.mjs).
    if (isEmbed) {
      if (req.method !== "GET") return send(405, "method not allowed\n", "text/plain", { allow: "GET" });
      const out = state.published ? buildLeague(state.fields) : { error: "unpublished" };
      if (out.error) return send(200, `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><p style="font:15px system-ui,sans-serif">The schedule is not published yet.</p>`, "text/html; charset=utf-8", EMBED_HEADERS);
      const results = String(state.fields.results || "").trim() ? parseResults(state.fields.results, out.schedule.teams).results : [];
      return send(200, embedHtml(out, results, parseEmbedOptions(url.searchParams, out.schedule.teams), dayNumber(clock())), "text/html; charset=utf-8", EMBED_HEADERS);
    }
    const t = url.searchParams.get("t");
    if (isLeague) {
      // A captain link carries c=KEY: a wrong key counts as a wrong link, like a wrong token.
      let captain = null;
      const c = url.searchParams.get("c");
      if (c !== null && state.published) {
        const built = buildLeague(state.fields), ti = built.error ? -1 : captainTeam(adminKey, built.schedule.teams, c);
        if (ti < 0) {
          if (!rec) fails.set(who, rec = { n: 0, until: now + WINDOW_MS });
          rec.n++;
          return send(401, "this captain link is not valid (the team may have been renamed; ask the organiser for the new one)\n", "text/plain");
        }
        captain = { team: ti, key: c };
      }
      // An official's link carries o=KEY, checked the same way.
      let official = null;
      const o = url.searchParams.get("o");
      if (o !== null && o !== "" && state.published) {
        const built = buildLeague(state.fields), lo = built.error ? null : leagueOfficials(state, built.schedule);
        const oi = lo ? officialByKey(adminKey, lo.officials, o) : -1;
        if (oi < 0) {
          if (!rec) fails.set(who, rec = { n: 0, until: now + WINDOW_MS });
          rec.n++;
          return send(401, "this official's link is not valid (the name may have changed; ask the organiser for the new one)\n", "text/plain");
        }
        official = { index: oi, key: o, name: lo.officials[oi].name };
      }
      if (req.method === "GET" && url.pathname === "/league/manifest.webmanifest") {
        const teams = state.published ? buildLeague(state.fields).schedule?.teams ?? [] : [];
        return send(200, manifestJson({ name: "League schedule", token: t, cap: captain ? captain.key : null, team: captain ? teams[captain.team] : null }), "application/manifest+json", { "cache-control": "no-cache" });
      }
      if (req.method === "GET" && url.pathname === "/league") return send(200, state.published ? leaguePage(state, t, publicBase(req, env), dayNumber(clock()), captain, clock(), official) : page("League", "<p>No schedule has been published yet.</p>"));
      if (req.method === "POST" && url.pathname === "/league/report") {
        if (!captain) return send(401, "captain link required\n", "text/plain");
        const out = buildLeague(state.fields);
        const body = await readForm(req);
        if (!body) return send(413, "too large\n", "text/plain");
        const back = `<p><a href="/league?t=${esc(encodeURIComponent(t))}&amp;c=${esc(encodeURIComponent(c))}#captain">Back to your team's page</a></p>`;
        const games = reportableGames(out.schedule, dayNumber(clock()));
        const r = parseReport(body, games, captain.team);
        if (r.error) return send(400, page("Score not sent", `<p class="err">${esc(r.error)}</p>${back}`));
        state.reports = state.reports || {};
        const w = recordReport(state.reports, r.req, clock());
        if (w.error) { save(); return send(409, page("Score not sent", `<p class="err">${esc(w.error)}</p>${back}`)); }
        const g = games.find((x) => x.fixture === r.req.fixture), line = reportLine(g, r.req);
        let msg = `Sent: ${line}. Waiting for the other captain; the same score from them puts it in the table.`;
        if (w.status === "confirmed") {
          const prev = String(state.fields.results || "").replace(/\s+$/, "");
          state.fields.results = (prev ? prev + "\n" : "") + line;
          settle(state.reports, r.req.fixture, line);
          msg = `Confirmed by both captains: ${line} is in the table.`;
        } else if (w.status === "disputed") msg = `Sent: ${line}. The other captain sent a different score, so the organiser will decide. If yours was a typo, send it again.`;
        save();
        return send(200, page(w.status === "confirmed" ? "Result in the table" : "Score sent", `<p class="${w.status === "disputed" ? "err" : "ok"}">${esc(msg)}</p>${back}`));
      }
      if (req.method === "POST" && url.pathname === "/league/spirit") {
        if (!captain) return send(401, "captain link required\n", "text/plain");
        const sp = spiritSettings(state.fields), out = buildLeague(state.fields);
        const body = await readForm(req);
        if (!body) return send(413, "too large\n", "text/plain");
        const back = `<p><a href="/league?t=${esc(encodeURIComponent(t))}&amp;c=${esc(encodeURIComponent(c))}#spirit">Back to your team's page</a></p>`;
        const games = reportableGames(out.schedule, dayNumber(clock()));
        const r = parseSpirit(body, games, captain.team, sp.mode);
        if (r.error) return send(400, page("Rating not sent", `<p class="err">${esc(r.error)}</p>${back}`));
        state.spirit = state.spirit || {};
        pruneSpirit(state.spirit, out.schedule);
        const w = recordSpirit(state.spirit, r.req, sp.mode, clock());
        save();
        const total = r.req.scores.reduce((a, b) => a + b, 0);
        return send(200, page("Rating sent", `<p class="ok">${w.replaced ? "Rating changed" : "Rating sent"}: ${esc(out.schedule.teams[r.req.rated])}, ${total} of ${SPIRIT_MODES[sp.mode].total}. Only the organiser sees it.</p>${back}`));
      }
      if (req.method === "POST" && url.pathname === "/league/move") {
        if (!captain) return send(401, "captain link required\n", "text/plain");
        const out = buildLeague(state.fields), day = dayNumber(clock());
        const body = await readForm(req);
        if (!body) return send(413, "too large\n", "text/plain");
        const back = `<p><a href="/league?t=${esc(encodeURIComponent(t))}&amp;c=${esc(encodeURIComponent(c))}#moves">Back to your team's page</a></p>`;
        const games = movableGames(out.schedule, day);
        const r = parseMoveRequest(body, games, captain.team, day);
        if (r.error) return send(400, page("Not sent", `<p class="err">${esc(r.error)}</p>${back}`));
        state.moves = state.moves || {};
        pruneMoves(state.moves, out.schedule, day);
        const g = games.find((x) => x.fixture === r.req.fixture);
        let fit = null;
        if (r.req.act === "ask") {
          fit = tryMove(state.fields, buildLeague, r.req.fixture, r.req.to);
          if (fit.error) return send(409, page("Date does not fit", `<p class="err">${esc(fit.error)}</p><p>Try another date.</p>${back}`));
        }
        const w = recordMove(state.moves, r.req, clock());
        if (w.error) return send(409, page("Not sent", `<p class="err">${esc(w.error)}</p>${back}`));
        save();
        const other = r.req.side === "home" ? g.awayName : g.homeName;
        const msgs = {
          asked: `Asked: ${g.homeName} v ${g.awayName} on ${dayLabel(r.req.to ?? 0)}${fit ? ` (${fit.game.time ? fit.game.time + ", " : ""}${fit.game.court})` : ""}. ${other}'s captain answers from their link; then the organiser approves.`,
          agreed: `Agreed. The organiser approves the move, then the league page and calendars follow.`,
          declined: `Declined. The game stays where it is.`,
          withdrawn: `Withdrawn. The game stays where it is.`,
        };
        const cfg = smtpConfig(env), base = publicBase(req, env);
        if (w.status === "asked" && cfg && !cfg.error) {
          const contacts = parseContacts(state.fields.contacts, out.schedule.teams).contacts;
          const to = Object.prototype.hasOwnProperty.call(contacts, other) && Array.isArray(contacts[other]) ? contacts[other] : [];
          if (to.length) {
            const msg = moveAskedEmail(g, state.moves[g.fixture], to, base ? `${base}/league?t=${encodeURIComponent(token)}&c=${captainKey(adminKey, other)}#moves` : "");
            Promise.resolve().then(() => mail(cfg, msg)).catch((err) => console.error(`move request email for ${other} not sent: ${err.message}`));
          }
        }
        return send(200, page("Move request", `<p class="${w.status === "declined" || w.status === "withdrawn" ? "note" : "ok"}">${esc(msgs[w.status])}</p>${back}`));
      }
      if (url.pathname === "/league/waiver") {
        const out = buildLeague(state.fields), back = `<p><a href="/league?t=${esc(encodeURIComponent(t))}">Back to the league</a></p>`;
        if (out.error || !currentVersion(state)) return send(404, page("Waiver", `<p>The organiser has not set a waiver for this league.</p>${back}`));
        const teams = out.schedule.teams;
        if (req.method === "GET") return send(200, page("League waiver", waiverFormHtml(state, teams, t) + back));
        if (req.method !== "POST") return send(405, "method not allowed\n", "text/plain", { allow: "GET, POST" });
        const body = await readForm(req);
        if (!body) return send(413, "too large\n", "text/plain");
        const values = Object.fromEntries(["team", "fullname", "email", "minor", "guardian", "signature"].map((k) => [k, String(body.get(k) ?? "")]));
        const r = parseWaiverForm(body, teams);
        if (r.error) return send(400, page("League waiver", `<p class="err">${esc(r.error)}</p>${waiverFormHtml(state, teams, t, values)}${back}`));
        const w = recordSignature(state, r.req, clock());
        if (w.error) return send(429, page("League waiver", `<p class="err">${esc(w.error)}</p>${back}`));
        save();
        return send(200, page("Waiver signed", `<p class="ok">${w.replaced ? "Signed again" : "Signed"}: ${esc(w.sig.name)}${w.sig.minor ? ` (by ${esc(w.sig.guardian)}, parent or guardian)` : ""} for ${esc(w.sig.team)}, version ${esc(w.sig.version)}, ${esc(new Date(w.sig.at).toISOString().replace("T", " ").slice(0, 16))} UTC.</p><p class="note">The organiser keeps this record. Ask them if you need a copy of the text you signed.</p>${back}`));
      }
      if (req.method === "GET" && url.pathname === "/league/ics" && official) {
        const out = buildLeague(state.fields), lo = leagueOfficials(state, out.schedule);
        return send(200, scheduleIcs(withOfficials(out.schedule, lo.settled), null, null, official.name, Number(url.searchParams.get("alarm")) || null), "text/calendar; charset=utf-8", { "content-disposition": `inline; filename="officiating.ics"`, "cache-control": "no-cache" });
      }
      if (req.method === "POST" && url.pathname === "/league/official") {
        if (!official) return send(401, "official's link required\n", "text/plain");
        const body = await readForm(req);
        if (!body) return send(413, "too large\n", "text/plain");
        const back = `<p><a href="/league?t=${esc(encodeURIComponent(t))}&amp;o=${esc(encodeURIComponent(o))}#official">Back to your games</a></p>`;
        const r = parseOfficialRequest(body);
        if (r.error) return send(400, page("Not saved", `<p class="err">${esc(r.error)}</p>${back}`));
        const out = buildLeague(state.fields), lo = leagueOfficials(state, out.schedule), day = dayNumber(clock());
        state.refPicks = state.refPicks || {};
        pinDealt(state.refPicks, lo.settled, clock());
        const w = officialAction(state.refPicks, lo.settled, lo.officials, official.index, r.req, day, clock());
        if (w.error) { save(); return send(409, page("Not saved", `<p class="err">${esc(w.error)}</p>${back}`)); }
        save();
        const cfg = smtpConfig(env);
        if (r.req.act === "drop" && cfg && !cfg.error && EMAIL.test(env.REMINDER_TO || "")) {
          const base = publicBase(req, env);
          const msg = droppedEmail(w.game, official.name, w.late, env.REMINDER_TO, base ? `${base}/admin` : "");
          Promise.resolve().then(() => mail(cfg, msg)).catch((err) => console.error(`give-back email not sent: ${err.message}`));
        }
        return send(200, page(r.req.act === "drop" ? "Game given back" : "Game taken", `<p class="ok">${esc(w.message)}</p>${back}`));
      }
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
      if (req.method === "POST" && url.pathname === "/league/sub") {
        const out = state.published ? buildLeague(state.fields) : { error: "unpublished" };
        if (out.error) return send(404, "not found\n", "text/plain");
        const body = await readForm(req);
        if (!body) return send(413, "too large\n", "text/plain");
        const games = upcomingGames(out.schedule, dayNumber(clock()));
        const back = `<p><a href="/league?t=${esc(t)}">Back to the league</a></p>`;
        const r = parseSubOffer(body, games);
        if (r.error) return send(400, page("Not saved", `<p class="err">${esc(r.error)}</p>${back}`));
        state.subs = state.subs || {};
        state.availability = state.availability || {};
        const w = recordSub(state.subs, state.availability, r.req, games, clock());
        if (w.error) return send(r.req.act === "withdraw" ? 404 : 429, page("Not saved", `<p class="err">${esc(w.error)}</p>${back}`));
        save();
        const when = dayLabel(r.req.day);
        const msg = r.req.act === "withdraw"
          ? `${r.req.name} is off the sub list for ${when}.${w.placed ? ` You were placed with ${w.placed.team}: they show one fewer In now, so tell the organiser.` : ""}`
          : w.already ? `${r.req.name} is already on the sub list for ${when}${w.placed ? `, placed with ${w.placed.team}` : ""}.` : `${r.req.name} is on the sub list for ${when}. The organiser places subs with teams that are short.`;
        return send(200, page("Sub list", `<p class="ok">${esc(msg)}</p>${back}`));
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
      return send(200, adminPage(state, adminKey, note ? `<p class="ok">${esc(note)}</p>` : "", dayNumber(clock()), env, publicBase(req, env)));
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
      if (form.has("minutes")) f.minutes = Math.min(600, Math.max(5, Math.trunc(Number(form.get("minutes"))) || 60));
      f.double = form.get("double") === "1";
      f.reverseLeg = form.get("reverseLeg") === "1";
      f.playoff = Math.trunc(Number(form.get("playoff")) || 0);
      f.minPlayers = Math.min(99, Math.max(0, Math.trunc(Number(form.get("minPlayers")) || 0)));
      f.regOpen = form.get("regOpen") === "1";
      for (const k of ["regFee", "regPayUrl", "regCloses"]) f[k] = String(form.get(k) ?? "").trim().slice(0, 500);
      f.regMaxTeams = regSettings({ regMaxTeams: form.get("regMaxTeams") }).maxTeams;
      f.faOpen = form.get("faOpen") === "1";
      for (const k of ["faFee", "faCloses"]) f[k] = String(form.get(k) ?? "").trim().slice(0, 500);
      f.faTarget = faSettings({ faTarget: form.get("faTarget") }).target;
      f.faTags = String(form.get("faTags") ?? "").trim().slice(0, 300);
      f.faSheet = String(form.get("faSheet") ?? "").slice(0, MAX_SHEET);
      f.waiverText = cleanWaiverText(form.get("waiverText"));
      f.spiritMode = SPIRIT_MODES[form.get("spiritMode")] ? String(form.get("spiritMode")) : "";
      f.spiritShow = form.get("spiritShow") === "1";
      for (const k of ["yellowsPerBan", "yellowBanGames", "redBanGames", "secondYellowBanGames"]) f[k] = String(form.get(k) ?? "").trim().slice(0, 3);
      f.yellowEscalate = form.get("yellowEscalate") === "1";
      f.disciplineShow = form.get("disciplineShow") === "1";
      const wasPublished = state.published, prev = wasPublished ? buildLeague(state.fields) : null;
      state.fields = f;
      rememberVersion(state, clock());
      const out = buildLeague(f);
      if (form.get("act") === "publish") {
        if (out.error) { save(); return send(400, adminPage(state, adminKey, `<p class="err">${esc(out.error)}</p>`, dayNumber(clock()), env, publicBase(req, env))); }
        state.published = true;
      }
      // Pin the games dealt so far, so a later edit to the officials list leaves announced games alone.
      if (state.published && !out.error) { const lo = leagueOfficials(state, out.schedule); if (lo) { state.refPicks = state.refPicks || {}; pinDealt(state.refPicks, lo.settled, clock()); } }
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
    if (req.method === "POST" && (url.pathname === "/admin/official" || url.pathname === "/admin/officials")) {
      const out = buildLeague(state.fields), lo = out.error ? null : leagueOfficials(state, out.schedule);
      if (!lo) return send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent("List officials and publish first.")}` });
      state.refPicks = state.refPicks || {};
      const day = dayNumber(clock());
      let note;
      if (url.pathname === "/admin/official") {
        pinDealt(state.refPicks, lo.settled, clock());
        const w = adminAssign(state.refPicks, lo.settled, lo.officials, String(form.get("fixture") || ""), String(form.get("name") || "").trim(), clock());
        note = w.error ? w.error : `${w.game.homeName} v ${w.game.awayName}: ${String(form.get("name") || "").trim() || "open"}.`;
      } else if (form.get("act") === "redeal") {
        const n = clearUpcoming(state.refPicks, lo.settled, day);
        pinDealt(state.refPicks, leagueOfficials(state, out.schedule).settled, clock());
        note = `Dealt ${n} upcoming game${n === 1 ? "" : "s"} again.`;
      } else {
        pinDealt(state.refPicks, lo.settled, clock());
        const n = fillOpen(state.refPicks, leagueOfficials(state, out.schedule).settled, lo.officials, day, clock());
        note = `Filled ${n} open game${n === 1 ? "" : "s"}.`;
      }
      save();
      return send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent(note)}#officials` });
    }
    if (req.method === "GET" && url.pathname === "/admin/spirit.csv") {
      const out = buildLeague(state.fields);
      if (out.error) return send(404, "fix the league first\n", "text/plain");
      return send(200, "\ufeff" + spiritCsv(state.spirit || {}, out.schedule, spiritSettings(state.fields).mode), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="sportsmanship.csv"', "cache-control": "no-store" });
    }
    if (req.method === "GET" && url.pathname === "/admin/discipline.csv") {
      const out = buildLeague(state.fields);
      if (out.error) return send(404, "fix the league first\n", "text/plain");
      const dq = leagueDiscipline(state.fields, out.schedule, dayNumber(clock()));
      return send(200, "\ufeff" + (dq ? disciplineCsv(dq.state, out.schedule.teams) : "player,team\r\n"), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="suspensions.csv"', "cache-control": "no-store" });
    }
    if (req.method === "GET" && url.pathname === "/admin/waivers.csv") {
      return send(200, "\ufeff" + waiversCsv(state), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="waivers.csv"', "cache-control": "no-store" });
    }
    if (req.method === "GET" && url.pathname === "/admin/waiver.txt") {
      const txt = versionText(state, url.searchParams.get("v"));
      return txt ? send(200, txt, "text/plain; charset=utf-8", { "cache-control": "no-store" }) : send(404, "no such version\n", "text/plain");
    }
    if (req.method === "POST" && url.pathname === "/admin/waiver") {
      const r = removeSignature(state, Number(form.get("id")));
      if (!r.error) save();
      return send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent(r.error || `Removed ${r.sig.name}'s signature for ${r.sig.team}.`)}` });
    }
    if (req.method === "GET" && url.pathname === "/admin/free-agents.csv") {
      return send(200, "\ufeff" + freeAgentsCsv(state), "text/csv; charset=utf-8", { "content-disposition": 'attachment; filename="free-agents.csv"', "cache-control": "no-store" });
    }
    if (req.method === "POST" && url.pathname === "/admin/free-agent") {
      const go = (n) => send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent(n)}` });
      const out = buildLeague(state.fields);
      const teams = out.schedule?.teams ?? String(state.fields.teams || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const act = form.get("act");
      if (act === "remove") {
        const r = removeFreeAgent(state, Number(form.get("id")));
        if (r.error) return go(r.error);
        save();
        return go(`${r.agent.name} taken off the free-agent list (not emailed; tell them yourself).`);
      }
      if (act !== "place" && act !== "place-all") return go("Unknown action.");
      const plan = act === "place" ? [[Number(form.get("id")), String(form.get("team") || "")]] : [...suggestPlacements(state, teams).picks];
      const done = [], errs = [];
      for (const [id, team] of plan) { const r = placeFreeAgent(state, id, team, teams, clock()); if (r.error) errs.push(r.error); else done.push(r.agent); }
      if (done.length) save();
      let note = done.length ? `Placed ${done.map((a) => `${a.name} on ${a.team}`).slice(0, 8).join(", ")}${done.length > 8 ? ` and ${done.length - 8} more` : ""}.` : "";
      if (errs.length) note += ` ${errs.slice(0, 3).join(" ")}`;
      if (done.length) {
        const cfg = smtpConfig(env);
        if (!cfg || cfg.error) note += " Not emailed: reminder email (SMTP) is off, so tell the players and captains yourself.";
        else {
          const base = publicBase(req, env), organiser = EMAIL.test(env.REMINDER_TO || "") ? env.REMINDER_TO : "";
          const leagueUrl = base && token && state.published ? `${base}/league?t=${encodeURIComponent(token)}` : "";
          let noContact = [];
          for (const a of done) {
            const msgs = placedEmails(state, a, teams, { organiser, leagueUrl });
            if (!msgs.some((m) => m.kind === "team")) noContact.push(a.team);
            for (const m of msgs) Promise.resolve().then(() => mail(cfg, m)).catch((err) => console.error(`free-agent email for ${a.name} not sent: ${err.message}`));
          }
          noContact = [...new Set(noContact)];
          note += ` Emailing ${done.length} player${done.length === 1 ? "" : "s"} their team.${noContact.length ? ` No contact address for ${noContact.slice(0, 6).join(", ")}: tell that captain yourself.` : ""}`;
        }
      }
      return go(note.trim() || "Nothing to place.");
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
    if (req.method === "POST" && url.pathname === "/admin/sub") {
      const out = state.published ? buildLeague(state.fields) : { error: "unpublished" };
      if (out.error) return send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent("Publish the league first.")}` });
      const games = upcomingGames(out.schedule, dayNumber(clock()));
      state.subs = state.subs || {};
      state.availability = state.availability || {};
      const p = placeSub(state.subs, state.availability, { fixture: String(form.get("fixture") ?? ""), teamIndex: Number(form.get("team")), name: String(form.get("name") ?? "") }, games, clock());
      if (p.ok) save();
      const note = p.error || `${p.name} placed with ${p.team} for ${dayLabel(p.game.day)}; they now count as In (sub). Let them know.`;
      return send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent(note)}` });
    }
    if (req.method === "POST" && url.pathname === "/admin/report") {
      const fixture = String(form.get("fixture") ?? ""), act = String(form.get("act") ?? "");
      const e = (state.reports || {})[fixture], out = buildLeague(state.fields);
      const go = (n) => send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent(n)}` });
      if (!e || e.done || out.error) return go("That report is no longer open.");
      if (act === "clear") { delete state.reports[fixture]; save(); return go("Reports cleared; either captain can report again."); }
      const s = act === "home" || act === "away" ? e[act] : null;
      const g = reportableGames(out.schedule, Infinity, Infinity).find((x) => x.fixture === fixture);
      if (!s || !g) return go("That report is no longer open.");
      const line = reportLine(g, s), prev = String(state.fields.results || "").replace(/\s+$/, "");
      state.fields.results = (prev ? prev + "\n" : "") + line;
      settle(state.reports, fixture, line);
      save();
      return go(`Added to results: ${line}`);
    }
    if (req.method === "POST" && url.pathname === "/admin/move") {
      const fixture = String(form.get("fixture") ?? ""), act = String(form.get("act") ?? "");
      const go = (n) => send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent(n)}` });
      const prev = buildLeague(state.fields);
      state.moves = state.moves || {};
      if (prev.error) return go(`Fix the league first: ${prev.error}`);
      pruneMoves(state.moves, prev.schedule, dayNumber(clock()));
      const e = state.moves[fixture];
      if (!e || (e.status !== "asked" && e.status !== "agreed")) { save(); return go("That move request is no longer open."); }
      if (act === "refuse") { e.status = "refused"; save(); return go("Move refused; both captains see it on their page. The game stays where it is."); }
      if (act !== "approve" || e.status !== "agreed") return go("Only a move both captains agreed can be approved.");
      const fit = tryMove(state.fields, buildLeague, fixture, e.to);
      if (fit.error) { e.status = "refused"; save(); return go(`Not moved: ${fit.error} The request is closed; the captains can ask for another date.`); }
      state.fields = fit.fields;
      delete state.moves[fixture];
      save();
      const g = fit.game;
      let note = `Moved ${g.homeName} v ${g.awayName} to ${dayLabel(g.day)}${g.time ? " " + g.time : ""}, ${g.court}. Rainouts now ends with that line.`;
      const changes = scheduleChanges(prev.schedule, buildLeague(state.fields).schedule, dayNumber(clock()));
      const cfg = smtpConfig(env);
      if (state.published && changes.length && cfg && !cfg.error) {
        const base = publicBase(req, env);
        const emails = changeEmails(changes, { contacts: parseContacts(state.fields.contacts, prev.schedule.teams).contacts, organiser: EMAIL.test(env.REMINDER_TO || "") ? env.REMINDER_TO : "", leagueUrl: base ? `${base}/league?t=${encodeURIComponent(token)}` : "" });
        note += ` Emailing ${emails.length} team${emails.length === 1 ? "" : "s"}.`;
        for (const m of emails) Promise.resolve().then(() => mail(cfg, m)).catch((err) => console.error(`change email for ${m.team} not sent: ${err.message}`));
      }
      return go(note);
    }
    if (req.method === "POST" && url.pathname === "/admin/notice") {
      const go = (n) => send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent(n)}` });
      if (form.get("act") === "remove") {
        const ok = removeNotice(state, Number(form.get("id")));
        if (ok) save();
        return go(ok ? "Notice removed." : "That notice is already gone.");
      }
      const out = buildLeague(state.fields), teams = out.schedule?.teams ?? [];
      const p = parseNotice(form, teams, dayNumber(clock()), clock());
      if (p.error) return go(p.error);
      const n = addNotice(state, p.notice);
      let note = `Notice posted${n.team ? ` for ${n.team} (on their captain page)` : " on the league page"}${state.published ? "" : "; players see it once the league is published"}.`;
      if (form.get("email") === "1") {
        const cfg = smtpConfig(env), base = publicBase(req, env);
        if (!cfg || cfg.error) note += " Not emailed: reminder email (SMTP) is off.";
        else {
          const { emails, missing } = noticeEmails(n, parseContacts(state.fields.contacts, teams).contacts, teams, { leagueUrl: base && token ? `${base}/league?t=${encodeURIComponent(token)}` : "" });
          n.emailed = emails.length;
          note += ` Emailing ${emails.length} team${emails.length === 1 ? "" : "s"}.${missing.length ? ` No contact address for ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? " and others" : ""}: tell them yourself.` : ""}`;
          for (const m of emails) Promise.resolve().then(() => mail(cfg, m)).catch((err) => console.error(`notice email for ${m.team} not sent: ${err.message}`));
        }
      }
      save();
      return go(note);
    }
    if (req.method === "POST" && url.pathname === "/admin/captain-links") {
      const out = buildLeague(state.fields), cfg = smtpConfig(env);
      const go = (n) => send(303, "", "text/plain", { location: `${here}&note=${encodeURIComponent(n)}` });
      if (out.error) return go(`Fix the league first: ${out.error}`);
      if (!cfg || cfg.error) return go("Reminder email (SMTP) is off, so links cannot be emailed. Copy them from Captain links instead.");
      const base = publicBase(req, env);
      if (!base) return go("Set PUBLIC_URL on the server so the emailed links have an address.");
      const contacts = parseContacts(state.fields.contacts, out.schedule.teams).contacts, missing = [];
      let n = 0;
      for (const team of out.schedule.teams) {
        const to = Object.prototype.hasOwnProperty.call(contacts, team) && Array.isArray(contacts[team]) ? contacts[team] : [];
        if (!to.length) { missing.push(team); continue; }
        const msg = captainLinkEmail(team, `${base}/league?t=${encodeURIComponent(token)}&c=${captainKey(adminKey, team)}`, to);
        n++;
        Promise.resolve().then(() => mail(cfg, msg)).catch((err) => console.error(`captain link for ${team} not sent: ${err.message}`));
      }
      return go(`Emailing captain links to ${n} team${n === 1 ? "" : "s"}.${missing.length ? ` No contact address for ${missing.slice(0, 6).join(", ")}: copy their link from Captain links.` : ""}`);
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
    subsLine: (r) => freeSubsLine(state.subs || {}, state.availability || {}, games, r.day),
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
