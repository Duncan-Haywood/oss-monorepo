// Player availability for the league page: each player says In, Maybe or Out for their
// team's next games, the page shows the count beside every fixture, and the organiser sees which teams
// are short of players before the night, not when a forfeit is already happening.
// Pure functions: server.mjs keeps the store in its state file and passes `today` in.
import { dayLabel } from "./dates.mjs";

export const STATUSES = ["in", "maybe", "out"];
export const MAX_NAMES = 60; // per team per game: more than any rec roster, small enough to bound the state file
export const MAX_NAME = 40;
export const DEFAULT_NIGHTS = 2;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// The store is keyed by fixture id and team name, and team names are typed by the organiser: a team called
// "constructor" or "__proto__" must read and write its own key, never one inherited from Object.prototype
// (which crashed the league page once anyone answered for that game). defineProperty makes "__proto__" an
// ordinary own key, which JSON.stringify writes and JSON.parse reads back the same way.
const own = (o, k) => (o && Object.hasOwn(o, k) ? o[k] : undefined);
const ownList = (o, k) => { const v = own(o, k); return Array.isArray(v) ? v : []; };
const ownOrSet = (o, k, make) => {
  if (!Object.hasOwn(o, k)) Object.defineProperty(o, k, { value: make(), enumerable: true, writable: true, configurable: true });
  return o[k];
};

/** Days since 1970-01-01 (UTC), the unit `buildSchedule` dates games in. */
export const dayNumber = (ms) => Math.floor(ms / 86400000);

/**
 * The games on the next `nights` match days from `today` on (today included), each as
 * { fixture, day, time, court, home, away, homeName, awayName }. Games without a fixture id
 * (none in a schedule built by `buildSchedule`) are left out: availability is keyed by that id,
 * which survives rainouts, so a moved game keeps its answers.
 */
export function upcomingGames(schedule, today, nights = DEFAULT_NIGHTS) {
  const games = [];
  for (const r of schedule.rounds) for (const m of r.matches) {
    if (!m.fixture || r.day < today) continue;
    games.push({ fixture: m.fixture, day: r.day, time: m.time || "", court: m.court || "", home: m.home, away: m.away, homeName: schedule.teams[m.home], awayName: schedule.teams[m.away] });
  }
  const days = [...new Set(games.map((g) => g.day))].sort((a, b) => a - b).slice(0, Math.max(1, nights));
  return games.filter((g) => days.includes(g.day)).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time) || a.court.localeCompare(b.court));
}

/** A player's name as typed, tidied: spaces collapsed, control characters refused, 1 to MAX_NAME characters. */
export function cleanName(raw) {
  const s = String(raw ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!s) return { error: "Type your name (a first name or nickname is enough)." };
  if (/[\u0000-\u001f\u007f]/.test(s)) return { error: "That name has characters the page cannot show." };
  if ([...s].length > MAX_NAME) return { error: `Keep the name to ${MAX_NAME} characters.` };
  return { name: s };
}

/**
 * A form post -> { req: { fixture, team, name, status } } or { error }. `pick` is "fixture|teamIndex"
 * and must name one of `games` and one of its two teams; nothing free-form but the name.
 */
export function parseAvailability(form, games, teams) {
  const [fixture, ti] = String(form.get("pick") ?? "").split("|");
  const team = Number(ti);
  const g = games.find((x) => x.fixture === fixture);
  if (!g || !Number.isInteger(team) || (team !== g.home && team !== g.away)) return { error: "Pick your game and team from the list (only the next games take answers)." };
  const status = String(form.get("status") ?? "");
  if (!STATUSES.includes(status)) return { error: "Choose In, Maybe or Out." };
  const n = cleanName(form.get("name"));
  if (n.error) return { error: n.error };
  return { req: { fixture, team: teams[team], name: n.name, status } };
}

/**
 * Store an answer: the same name (case-insensitive) for the same team and game replaces its earlier
 * answer, so a player who changes their mind just answers again. Answers for games that are no longer
 * upcoming (played, renamed teams, removed fixtures) are pruned on every write, so the store stays as
 * small as the next few nights. Returns { ok, replaced } or { error }.
 */
export function recordAvailability(store, req, games, now = Date.now()) {
  const keep = new Set(games.map((g) => g.fixture));
  for (const f of Object.keys(store)) if (!keep.has(f)) delete store[f];
  const byTeam = ownOrSet(store, req.fixture, () => ({}));
  const list = ownOrSet(byTeam, req.team, () => []);
  const key = req.name.toLocaleLowerCase();
  const at = list.findIndex((e) => e.name.toLocaleLowerCase() === key);
  const entry = { name: req.name, status: req.status, at: now, ...(req.sub ? { sub: true } : {}) };
  if (at >= 0) { list[at] = entry; return { ok: true, replaced: true }; }
  if (list.length >= MAX_NAMES) return { error: `This team already has ${MAX_NAMES} answers for that game; ask the organiser.` };
  list.push(entry);
  return { ok: true, replaced: false };
}

/** One team's answers for one game: { in: [names], maybe: [...], out: [...] }, each in the order answered. */
export function teamAnswers(store, fixture, teamName) {
  const out = { in: [], maybe: [], out: [] };
  const list = own(own(store, fixture), teamName);
  for (const e of Array.isArray(list) ? list : []) if (STATUSES.includes(e?.status)) out[e.status].push(e.sub ? `${e.name} (sub)` : e.name);
  return out;
}

/**
 * Who is short: every team in `games` whose In count is below `minPlayers`, with how many it needs and
 * how many Maybes could close the gap. minPlayers 0 or unset: nothing is flagged. Sorted by the date,
 * then the biggest gap.
 */
export function shortTeams(store, games, minPlayers) {
  const need = Math.trunc(Number(minPlayers) || 0);
  if (need <= 0) return [];
  const rows = [];
  for (const g of games) for (const [idx, name, opp] of [[g.home, g.homeName, g.awayName], [g.away, g.awayName, g.homeName]]) {
    const a = teamAnswers(store, g.fixture, name);
    if (a.in.length < need) rows.push({ fixture: g.fixture, day: g.day, time: g.time, court: g.court, team: name, teamIndex: idx, opponent: opp, in: a.in.length, maybe: a.maybe.length, out: a.out.length, short: need - a.in.length });
  }
  return rows.sort((a, b) => a.day - b.day || b.short - a.short || a.team.localeCompare(b.team));
}

function countLine(a, need, quiet = []) {
  const n = a.in.length;
  const flag = need > 0 && n < need ? ` <strong class="err">short ${need - n}</strong>` : need > 0 ? ` <span class="ok">enough</span>` : "";
  const names = (k, label) => (a[k].length ? ` · ${label}: ${a[k].map(esc).join(", ")}` : "");
  return `${n} in${need > 0 ? ` of ${need}` : ""}, ${a.maybe.length} maybe, ${a.out.length} out${flag}${names("in", "In")}${names("maybe", "Maybe")}${names("out", "Out")}${quiet.length ? ` · No answer yet: ${quiet.map(esc).join(", ")}` : ""}`;
}

/** The player-page section: each upcoming game with both teams' counts, and the one form to answer. */
export function availabilityHtml(store, games, { token = "", minPlayers = 0, rosters = {} } = {}) {
  if (!games.length) return `<h2>Who's playing</h2><p class="note">No games coming up.</p>`;
  const need = Math.trunc(Number(minPlayers) || 0);
  const rows = games.map((g) => {
    const when = `${dayLabel(g.day)}${g.time ? " " + esc(g.time) : ""}${g.court ? ", " + esc(g.court) : ""}`;
    return `<li><strong>${when}</strong>: ${esc(g.homeName)} v ${esc(g.awayName)}<ul>${[g.homeName, g.awayName].map((t) => `<li>${esc(t)}: ${countLine(teamAnswers(store, g.fixture, t), need, notAnswered(store, g.fixture, t, rosters))}</li>`).join("")}</ul></li>`;
  }).join("");
  const opts = games.flatMap((g) => [[g.home, g.homeName, g.awayName], [g.away, g.awayName, g.homeName]].map(([i, n, o]) => `<option value="${esc(g.fixture)}|${i}">${dayLabel(g.day)}${g.time ? " " + esc(g.time) : ""}: ${esc(n)} (v ${esc(o)})</option>`)).join("");
  const form = `<form method="post" action="/league/available?t=${esc(token)}"><label>Game and team <select name="pick">${opts}</select></label> <label>Your name <input name="name" maxlength="${MAX_NAME}" required autocomplete="nickname" style="width:auto"></label> <label><input type="radio" name="status" value="in" required style="width:auto"> In</label> <label><input type="radio" name="status" value="maybe" style="width:auto"> Maybe</label> <label><input type="radio" name="status" value="out" style="width:auto"> Out</label> <button>Send</button>${rosterPickerHtml(games, rosters)}</form>`;
  const note = `<p class="note">Answer again with the same name to change it. Everyone with this link sees the names, so a first name or nickname is enough.${need > 0 ? ` The organiser needs ${need} players a team.` : ""}</p>`;
  return `<h2>Who's playing</h2><ul>${rows}</ul>${form}${note}`;
}

/** The admin-page section: the teams short of players for the next games, with a copy-ready nudge each. */
export function shortTeamsHtml(store, games, minPlayers, rosters = {}, { extra = () => "", subsLine = () => "" } = {}) {
  const need = Math.trunc(Number(minPlayers) || 0);
  if (need <= 0) return "";
  const rows = shortTeams(store, games, need);
  if (!rows.length) return games.length ? `<h2>Players for the next games</h2><p class="ok">Every team has ${need} or more players in.</p>` : "";
  const items = rows.map((r) => `<li><strong>${esc(r.team)}</strong> (${dayLabel(r.day)}${r.time ? " " + esc(r.time) : ""} v ${esc(r.opponent)}): ${r.in} in, short ${r.short}; ${r.maybe} maybe, ${r.out} out. <input readonly onfocus="this.select()" aria-label="Message for ${esc(r.team)}" value="${esc(nudgeText(r, need, notAnswered(store, r.fixture, r.team, rosters), subsLine(r)))}">${extra(r)}</li>`).join("");
  return `<h2>Teams short of players</h2><ul>${items}</ul><p class="note">Counts only the players who answered on the league page. Copy a message into the team's chat.</p>`;
}

/** The message an organiser pastes into a short team's chat. */
export function nudgeText(r, need, quiet = [], subs = "") {
  const maybes = r.maybe ? ` ${r.maybe} said maybe: can you confirm?` : "";
  const silent = quiet.length ? ` Not heard from: ${quiet.join(", ")}.` : "";
  return `${r.team}: ${r.in} of ${need} players are in for ${dayLabel(r.day)}${r.time ? " " + r.time : ""} v ${r.opponent}.${maybes}${silent}${subs ? " " + subs : ""} Answer on the league page, or find a sub, so the game is not forfeited.`;
}

// ---- Rosters, the organiser's CSV and reminders (2026-11-18) ----

export const MAX_ROSTER = 40; // names per team in the roster box

/**
 * The organiser's roster box -> { rosters: { team: [names] }, errors }. One team per line,
 * "Hawks: Ana, Ben, Cara". A team the schedule does not have is reported, not guessed; a name
 * listed twice for one team is kept once. Teams with no line have no roster (anyone may answer).
 */
export function parseRosters(text, teams) {
  const rosters = {}, errors = [];
  const byKey = new Map(teams.map((t) => [t.toLocaleLowerCase(), t]));
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const at = line.indexOf(":");
    if (at < 0) { errors.push(`"${line.slice(0, 40)}": write it as Team: name, name`); continue; }
    const team = byKey.get(line.slice(0, at).trim().toLocaleLowerCase());
    if (!team) { errors.push(`Roster for "${line.slice(0, at).trim().slice(0, 40)}": no team of that name`); continue; }
    const list = ownOrSet(rosters, team, () => []);
    for (const part of line.slice(at + 1).split(",")) {
      if (!part.trim()) continue;
      const n = cleanName(part);
      if (n.error) { errors.push(`${team}: "${part.trim().slice(0, 40)}": ${n.error}`); continue; }
      if (list.some((x) => x.toLocaleLowerCase() === n.name.toLocaleLowerCase())) continue;
      if (list.length >= MAX_ROSTER) { errors.push(`${team}: more than ${MAX_ROSTER} names; the rest were left out`); break; }
      list.push(n.name);
    }
  }
  return { rosters, errors };
}

/** Roster names on `team` with no answer yet for `fixture`, in roster order. */
export function notAnswered(store, fixture, team, rosters) {
  const said = new Set((ownList(own(store, fixture), team)).map((e) => e.name.toLocaleLowerCase()));
  return ownList(rosters, team).filter((n) => !said.has(n.toLocaleLowerCase()));
}

/**
 * The name box's suggestions: one <datalist> per team with a roster, and a few lines of script that
 * point the name box at the picked team's list. Without script the box still takes any name.
 */
export function rosterPickerHtml(games, rosters) {
  const teams = [...new Set(games.flatMap((g) => [g.homeName, g.awayName]))].filter((t) => ownList(rosters, t).length);
  if (!teams.length) return "";
  const idx = new Map(teams.map((t, i) => [t, i]));
  const lists = teams.map((t) => `<datalist id="roster-${idx.get(t)}">${rosters[t].map((n) => `<option value="${esc(n)}">`).join("")}</datalist>`).join("");
  const map = {};
  for (const g of games) for (const [i, n] of [[g.home, g.homeName], [g.away, g.awayName]]) if (idx.has(n)) map[`${g.fixture}|${i}`] = `roster-${idx.get(n)}`;
  const js = `<script>(()=>{const m=${JSON.stringify(map).replace(/</g, "\\u003c")},f=document.currentScript.closest("form")||document.querySelector('form[action^="/league/available"]');if(!f)return;const s=f.querySelector('[name=pick]'),n=f.querySelector('[name=name]'),u=()=>{const l=m[s.value];l?n.setAttribute("list",l):n.removeAttribute("list")};s.addEventListener("change",u);u()})()</script>`;
  return lists + js;
}

const csvCell = (v) => { const s = String(v ?? ""); const t = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? "'" + s : s; return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const isoDay = (day) => new Date(day * 86400000).toISOString().slice(0, 10);

/**
 * Every answer for the given games as CSV, one row per player per game, plus a "no answer" row for
 * each roster name not heard from: date, time, court, team, opponent, player, answer, answered_at (UTC).
 * Cells that a spreadsheet would run as a formula are prefixed with an apostrophe.
 */
export function availabilityCsv(store, games, rosters = {}) {
  const rows = [["date", "time", "court", "team", "opponent", "player", "answer", "answered_at"]];
  for (const g of games) for (const [team, opp] of [[g.homeName, g.awayName], [g.awayName, g.homeName]]) {
    for (const e of ownList(own(store, g.fixture), team)) rows.push([isoDay(g.day), g.time, g.court, team, opp, e.name, e.sub ? `${e.status} (sub)` : e.status, e.at ? new Date(e.at).toISOString() : ""]);
    for (const n of notAnswered(store, g.fixture, team, rosters)) rows.push([isoDay(g.day), g.time, g.court, team, opp, n, "no answer", ""]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/**
 * The team contacts box -> { contacts: { team: [emails] }, errors }: "Hawks: cap@example.org, b@example.org".
 * Only plain addresses (no display names, no line breaks) so nothing typed can add a mail header.
 */
export function parseContacts(text, teams) {
  const contacts = {}, errors = [];
  const byKey = new Map(teams.map((t) => [t.toLocaleLowerCase(), t]));
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const at = line.lastIndexOf(":", line.indexOf("@") < 0 ? line.length : line.indexOf("@"));
    const team = at < 0 ? undefined : byKey.get(line.slice(0, at).trim().toLocaleLowerCase());
    if (!team) { errors.push(`Contacts "${line.slice(0, 40)}": start the line with a team name and a colon`); continue; }
    for (const part of line.slice(at + 1).split(/[,;\s]+/)) {
      if (!part) continue;
      if (!EMAIL.test(part) || part.length > 200) { errors.push(`${team}: "${part.slice(0, 60)}" is not an email address`); continue; }
      { const list = ownOrSet(contacts, team, () => []); if (!list.includes(part)) list.push(part); }
    }
  }
  return { contacts, errors };
}
export const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export const REMINDER_DAYS = 2;

/**
 * Reminders due now: every team still short of `minPlayers` for a game `daysAhead` days from `today`
 * or sooner (today included), not already reminded for that game. Each is
 * { key, to: [team contacts..., organiser], subject, text }. `sent` is the store of keys already sent
 * ("fixture|team"); the caller adds a key once the mail is accepted. A team with no contact and no
 * organiser address gets no reminder. Pure: nothing is sent here.
 */
export function remindersDue(store, games, { minPlayers = 0, today, daysAhead = REMINDER_DAYS, sent = {}, contacts = {}, organiser = "", rosters = {}, leagueUrl = "", subsLine = () => "" } = {}) {
  const need = Math.trunc(Number(minPlayers) || 0);
  if (need <= 0) return [];
  const out = [];
  for (const r of shortTeams(store, games, need)) {
    if (r.day < today || r.day > today + daysAhead) continue;
    const key = `${r.fixture}|${r.team}`;
    if (sent[key]) continue;
    const to = [...ownList(contacts, r.team)];
    if (organiser && !to.includes(organiser)) to.push(organiser);
    if (!to.length) continue;
    const quiet = notAnswered(store, r.fixture, r.team, rosters);
    const when = `${dayLabel(r.day)}${r.time ? " " + r.time : ""}${r.court ? ", " + r.court : ""}`;
    const lines = [
      `${r.team} has ${r.in} of ${need} players in for ${when} v ${r.opponent}.`,
      r.maybe ? `${r.maybe} said maybe: can they confirm?` : "",
      quiet.length ? `Not heard from yet: ${quiet.join(", ")}.` : "",
      subsLine(r),
      `Please answer on the league page${leagueUrl ? ` (${leagueUrl})` : ""}, or find a sub, so the game is not forfeited.`,
      "",
      "Sent once by the league's own server because the team was short two days out. Reply to the organiser to stop these.",
    ].filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""));
    out.push({ key, team: r.team, to, subject: `${r.team} is short ${r.short} for ${dayLabel(r.day)}`, text: lines.join("\n") });
  }
  return out;
}
