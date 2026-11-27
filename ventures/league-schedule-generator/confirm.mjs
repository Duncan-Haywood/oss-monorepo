// Captain score confirmation for the league page (server.mjs). Every team gets its own
// captain link (the league link plus a per-team key). A captain reports the score of a game their team
// has played; when the other captain reports the same score, the result goes straight into the table
// and the organiser does nothing. Different scores wait for the organiser with both side by side; a
// game only one captain reported waits too, so the organiser can accept it or chase the other team.
// Reports are keyed by fixture id, which a game keeps across rainouts, withdrawals and late teams, so a
// confirmed game cannot be added twice. Zero dependencies.
import { createHmac, timingSafeEqual } from "node:crypto";
import { dayLabel } from "./dates.mjs";

export const REPORT_DAYS = 21; // how far back a captain can still report a game
export const MAX_SCORE = 999;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * A team's captain key: an HMAC of the team's name under the server's secret (ADMIN_KEY), so it needs no
 * storage, survives reordering the team list, and changes for every team when the secret changes.
 * 22 base64url characters (132 bits): not guessable, short enough to text.
 */
export function captainKey(secret, teamName) {
  return createHmac("sha256", String(secret)).update(`captain\n${String(teamName).trim().toLowerCase()}`).digest("base64url").slice(0, 22);
}

/** The team index a captain key belongs to, or -1. Every team is compared in constant time. */
export function captainTeam(secret, teams, key) {
  const k = Buffer.from(String(key ?? ""));
  let found = -1;
  teams.forEach((name, i) => {
    const want = Buffer.from(captainKey(secret, name));
    if (want.length === k.length && timingSafeEqual(want, k)) found = i;
  });
  return found;
}

/** Games a captain may report: fixture-tagged, played on or before `today`, at most REPORT_DAYS ago. */
export function reportableGames(schedule, today, days = REPORT_DAYS) {
  const out = [];
  for (const r of schedule?.rounds || []) for (const m of r.matches || []) {
    if (!m.fixture || r.day > today || r.day < today - days) continue;
    out.push({ fixture: m.fixture, day: r.day, time: m.time || "", court: m.court || "", home: m.home, away: m.away, homeName: schedule.teams[m.home], awayName: schedule.teams[m.away] });
  }
  return out.sort((a, b) => b.day - a.day || a.time.localeCompare(b.time) || a.fixture.localeCompare(b.fixture));
}

/** A captain's form post -> { req: { fixture, side, hs, as } } or { error }. Only their own team's games. */
export function parseReport(form, games, team) {
  const g = games.find((x) => x.fixture === String(form.get("fixture") ?? ""));
  if (!g || (g.home !== team && g.away !== team)) return { error: "Pick one of your team's games from the list (games from the last three weeks)." };
  const hs = Number(form.get("hs")), as = Number(form.get("as"));
  if (![hs, as].every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_SCORE) || String(form.get("hs") ?? "").trim() === "" || String(form.get("as") ?? "").trim() === "") return { error: `Scores are whole numbers from 0 to ${MAX_SCORE}.` };
  return { req: { fixture: g.fixture, side: g.home === team ? "home" : "away", hs, as } };
}

/**
 * Record one captain's report in `reports` (fixture id -> { home?, away?, done? }). A captain can change
 * their own report until the game is confirmed. Returns { status: "confirmed" | "disputed" | "waiting" }
 * or { error } when the game is already in the table. `confirmed` means both captains sent the same
 * score: the caller adds the result line and the entry keeps `done` so it is never added again.
 */
export function recordReport(reports, req, now = Date.now()) {
  const e = reports[req.fixture] || (reports[req.fixture] = {});
  if (e.done) return { error: `This game is already in the table (${e.done}). Ask the organiser if it is wrong.` };
  e[req.side] = { hs: req.hs, as: req.as, at: now };
  const other = e[req.side === "home" ? "away" : "home"];
  if (!other) return { status: "waiting" };
  return other.hs === req.hs && other.as === req.as ? { status: "confirmed" } : { status: "disputed" };
}

/** The table line for a game and a score, home first, in the form parseResults reads. */
export const reportLine = (g, s) => `${g.homeName} ${s.hs} - ${s.as} ${g.awayName}`;

/** Mark a fixture settled with the line that went into the results. */
export function settle(reports, fixture, line) {
  reports[fixture] = { ...(reports[fixture] || {}), done: line };
}

/** Open reports (not done) for games still in the schedule, for the organiser: disputed first, then oldest. */
export function openReports(reports, schedule) {
  const games = new Map();
  for (const r of schedule?.rounds || []) for (const m of r.matches || []) if (m.fixture) games.set(m.fixture, { fixture: m.fixture, day: r.day, time: m.time || "", home: m.home, away: m.away, homeName: schedule.teams[m.home], awayName: schedule.teams[m.away] });
  const out = [];
  for (const [fixture, e] of Object.entries(reports || {})) {
    const g = games.get(fixture);
    if (!g || e.done || (!e.home && !e.away)) continue;
    const disputed = !!(e.home && e.away);
    out.push({ game: g, home: e.home || null, away: e.away || null, disputed });
  }
  return out.sort((a, b) => Number(b.disputed) - Number(a.disputed) || a.game.day - b.game.day || a.game.fixture.localeCompare(b.game.fixture));
}

/** The organiser's list of open reports with Use / Clear buttons (POST /admin/report). */
export function adminReportsHtml(list, key) {
  if (!list.length) return "";
  const k = esc(key);
  const btn = (fixture, act, label) => `<form method="post" action="/admin/report?key=${k}" style="display:inline"><input type="hidden" name="fixture" value="${esc(fixture)}"><button name="act" value="${act}">${esc(label)}</button></form>`;
  const items = list.map(({ game: g, home, away, disputed }) => {
    const when = `${dayLabel(g.day)}${g.time ? " " + esc(g.time) : ""}`;
    const said = (side, s) => s ? `${esc(side === "home" ? g.homeName : g.awayName)}'s captain: ${esc(reportLine(g, s))}` : `${esc(side === "home" ? g.homeName : g.awayName)}'s captain has not reported`;
    const head = `${when}, ${esc(g.homeName)} v ${esc(g.awayName)}${disputed ? " <strong>(scores differ)</strong>" : ""}`;
    const uses = [home && btn(g.fixture, "home", `Use ${g.homeName}'s`), away && btn(g.fixture, "away", `Use ${g.awayName}'s`)].filter(Boolean).join("");
    return `<li>${head}: ${said("home", home)}; ${said("away", away)}. ${uses}${btn(g.fixture, "clear", "Clear reports")}</li>`;
  }).join("");
  return `<h2>Captain reports</h2><p class="note">A game both captains report with the same score goes into the table by itself. These are the ones that need you: scores that differ, and games only one captain has reported.</p><ul>${items}</ul>`;
}

/** Captain links for the admin page: one per team, ready to copy. `base` may be null (path only). */
export function captainLinksHtml(teams, secret, token, base) {
  if (!teams.length) return "";
  const rows = teams.map((name) => {
    const href = `${base || ""}/league?t=${encodeURIComponent(token)}&c=${captainKey(secret, name)}`;
    return `<li>${esc(name)}: <input readonly value="${esc(href)}" aria-label="Captain link for ${esc(name)}" style="width:auto;min-width:20rem;font-size:.8rem" onfocus="this.select()"></li>`;
  }).join("");
  return `<details><summary>Captain links (one per team, for reporting scores)</summary><p class="note">Give each captain only their own team's link. With it they report their games' scores; when both captains of a game send the same score it goes into the table without you. Renaming a team or changing ADMIN_KEY gives it a new link.</p><ul>${rows}</ul></details>`;
}

/** The captain's own section on the league page: their recent games, each with its state and a form. */
export function captainHtml(reports, games, team, teams, { token, cap }) {
  const mine = games.filter((g) => g.home === team || g.away === team);
  const q = `t=${encodeURIComponent(token)}&c=${encodeURIComponent(cap)}`;
  const rows = mine.map((g) => {
    const e = reports[g.fixture] || {}, side = g.home === team ? "home" : "away", other = side === "home" ? "away" : "home";
    const otherName = side === "home" ? g.awayName : g.homeName;
    const when = `${dayLabel(g.day)}${g.time ? " " + esc(g.time) : ""}`;
    let state;
    if (e.done) state = `<span class="ok">In the table: ${esc(e.done)}</span>`;
    else if (e[side] && e[other]) state = e[side].hs === e[other].hs && e[side].as === e[other].as ? "Confirmed." : `<span class="err">${esc(otherName)}'s captain sent ${esc(reportLine(g, e[other]))}; you sent ${esc(reportLine(g, e[side]))}. The organiser decides, or send the score again if yours was a typo.</span>`;
    else if (e[side]) state = `You sent ${esc(reportLine(g, e[side]))}; waiting for ${esc(otherName)}'s captain.`;
    else if (e[other]) state = `${esc(otherName)}'s captain has reported. Send yours: the same score puts it in the table.`;
    else state = "Not reported yet.";
    const mineNow = e[side];
    const form = e.done ? "" : ` <form method="post" action="/league/report?${esc(q)}" style="display:inline"><input type="hidden" name="fixture" value="${esc(g.fixture)}">${esc(g.homeName)} <input name="hs" type="number" min="0" max="${MAX_SCORE}" required style="width:4.5rem" aria-label="${esc(g.homeName)} score" value="${mineNow ? mineNow.hs : ""}"> - <input name="as" type="number" min="0" max="${MAX_SCORE}" required style="width:4.5rem" aria-label="${esc(g.awayName)} score" value="${mineNow ? mineNow.as : ""}"> ${esc(g.awayName)} <button>${mineNow ? "Change" : "Send"}</button></form>`;
    return `<li><strong>${when}</strong> ${esc(g.homeName)} v ${esc(g.awayName)}: ${state}${form}</li>`;
  }).join("");
  const body = rows ? `<ul>${rows}</ul>` : `<p>No games in the last ${REPORT_DAYS} days to report.</p>`;
  return `<section id="captain"><h2>Captain: ${esc(teams[team])}</h2><p class="note">This link is for ${esc(teams[team])}'s captain only. Report each game's score (home team first, as listed). When the other captain sends the same score it goes into the table straight away.</p>${body}</section>`;
}

/** Plain-text email giving one team its captain link (sent on the organiser's own SMTP). */
export function captainLinkEmail(team, link, to) {
  return {
    team, to: [...to],
    subject: `Your captain link for ${team}`,
    text: [`Hi ${team},`, "", "This is your team's captain link for the league page. Use it to report each game's score:", link, "", "When the other captain reports the same score, the result goes into the table straight away; if the scores differ, the organiser decides.", "Keep this link to your team: anyone with it can report scores for you.", "", "Check dates and venues with your organiser."].join("\n"),
  };
}
