// Sub pool for the self-hosted league page (2026-11-18): players who are free on a match night say so
// once ("I can sub on Tue 25 Nov"), and the organiser sees, beside every team that is short for that
// night, the subs who are free, and places one with a click. Placing a sub writes an In answer for that
// team's game (marked as a sub), so the counts, the short-team list and the reminder emails all see it.
//
// Why: a short team on game night is the most common way a rec league loses a game to a forfeit, and the
// fix today is a group-chat scramble. TeamSnap and SportsEngine track RSVPs per team; a sub list across
// the whole league, matched to the short teams by night, is what organisers keep in a spreadsheet.
//
// Pure functions: server.mjs keeps the pool in its state file (state.subs) and passes `games` (from
// upcomingGames) in. The pool is keyed by match day (days since 1970-01-01, UTC), and days that are no
// longer upcoming are pruned on every write, so the state file stays as small as the next few nights.
import { dayLabel } from "./calc.mjs";
import { cleanName, recordAvailability, teamAnswers, MAX_NAME } from "./availability.mjs";

export const MAX_SUBS = 40; // per night: more than any rec league's sub list, small enough to bound the state file

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const lower = (s) => String(s).toLocaleLowerCase();
const nightsOf = (games) => [...new Set(games.map((g) => g.day))].sort((a, b) => a - b);
const listFor = (pool, day) => (pool && Object.hasOwn(pool, String(day)) && Array.isArray(pool[String(day)]) ? pool[String(day)] : []);

/** A sub's form post -> { req: { day, name, act } } or { error }. Only an upcoming match night is taken. */
export function parseSubOffer(form, games) {
  const day = Number(form.get("day"));
  if (!Number.isInteger(day) || !nightsOf(games).includes(day)) return { error: "Pick one of the coming match nights from the list." };
  const act = String(form.get("act") ?? "offer");
  if (act !== "offer" && act !== "withdraw") return { error: "Choose whether you can sub or want to come off the list." };
  const n = cleanName(form.get("name"));
  if (n.error) return { error: n.error };
  return { req: { day, name: n.name, act } };
}

/** Drop the nights that are no longer upcoming. */
export function pruneSubs(pool, games) {
  const keep = new Set(nightsOf(games).map(String));
  for (const d of Object.keys(pool)) if (!keep.has(d)) delete pool[d];
}

/**
 * Offer or withdraw. The same name (any case) on the same night is one entry. Withdrawing a sub who is
 * already placed also takes their In answer off that team, so the team shows short again and the
 * organiser sees it. Returns { ok, already?, placed? } or { error }.
 */
export function recordSub(pool, availability, req, games, now = Date.now()) {
  pruneSubs(pool, games);
  const key = String(req.day);
  const list = listFor(pool, req.day);
  const at = list.findIndex((e) => lower(e.name) === lower(req.name));
  if (req.act === "withdraw") {
    if (at < 0) return { error: `${req.name} is not on the sub list for ${dayLabel(req.day)}.` };
    const [gone] = list.splice(at, 1);
    if (gone.placed) unplace(availability, gone);
    if (!list.length) delete pool[key];
    return { ok: true, placed: gone.placed || null };
  }
  if (at >= 0) return { ok: true, already: true, placed: list[at].placed || null };
  if (list.length >= MAX_SUBS) return { error: `The sub list for ${dayLabel(req.day)} is full (${MAX_SUBS}); ask the organiser.` };
  if (!Object.hasOwn(pool, key)) pool[key] = list;
  list.push({ name: req.name, at: now });
  return { ok: true, already: false };
}

function unplace(availability, sub) {
  const byTeam = availability && Object.hasOwn(availability, sub.placed.fixture) ? availability[sub.placed.fixture] : null;
  const list = byTeam && Object.hasOwn(byTeam, sub.placed.team) ? byTeam[sub.placed.team] : null;
  if (!Array.isArray(list)) return;
  const i = list.findIndex((e) => e.sub && lower(e.name) === lower(sub.name));
  if (i >= 0) list.splice(i, 1);
}

/**
 * The subs free for `day`: offered, not yet placed, and not already answering In for any game that
 * night under the same name (a rostered player who is playing for their own team is not free).
 */
export function freeSubs(pool, availability, games, day) {
  const playing = new Set();
  for (const g of games) if (g.day === day) for (const t of [g.homeName, g.awayName]) for (const n of teamAnswers(availability, g.fixture, t).in) playing.add(lower(n.replace(/ \(sub\)$/, "")));
  return listFor(pool, day).filter((e) => !e.placed && !playing.has(lower(e.name))).map((e) => e.name);
}

/**
 * Place a free sub with a team for one game: writes an In answer marked `sub` and marks the sub taken.
 * `teamIndex` must be one of the game's two teams. Returns { ok, game } or { error }.
 */
export function placeSub(pool, availability, { fixture, teamIndex, name }, games, now = Date.now()) {
  const g = games.find((x) => x.fixture === fixture);
  if (!g || (teamIndex !== g.home && teamIndex !== g.away)) return { error: "That game is no longer coming up." };
  const team = teamIndex === g.home ? g.homeName : g.awayName;
  const entry = listFor(pool, g.day).find((e) => lower(e.name) === lower(name));
  if (!entry) return { error: `${name} is not on the sub list for ${dayLabel(g.day)}.` };
  if (entry.placed) return { error: `${entry.name} is already placed for that night.` };
  if (!freeSubs(pool, availability, games, g.day).includes(entry.name)) return { error: `${entry.name} is already playing that night.` };
  const w = recordAvailability(availability, { fixture, team, name: entry.name, status: "in", sub: true }, games, now);
  if (w.error) return w;
  entry.placed = { fixture, team, at: now };
  return { ok: true, game: g, team, name: entry.name };
}

/** The player-page section: who can sub each coming night (and where the placed ones are playing), and the one form. */
export function subsHtml(pool, games, { token = "" } = {}) {
  const nights = nightsOf(games);
  if (!nights.length) return "";
  const rows = nights.map((d) => {
    const list = listFor(pool, d);
    const names = list.length ? list.map((e) => (e.placed ? `${esc(e.name)} (playing for ${esc(e.placed.team)})` : esc(e.name))).join(", ") : "nobody yet";
    return `<li><strong>${dayLabel(d)}</strong>: ${names}</li>`;
  }).join("");
  const opts = nights.map((d) => `<option value="${d}">${dayLabel(d)}</option>`).join("");
  const form = `<form method="post" action="/league/sub?t=${esc(token)}"><label>Night <select name="day">${opts}</select></label> <label>Your name <input name="name" maxlength="${MAX_NAME}" required autocomplete="nickname" style="width:auto"></label> <button name="act" value="offer">I can sub</button><button name="act" value="withdraw">Take me off</button></form>`;
  return `<h2>Subs</h2><p>Free on a match night and happy to play for any team that is short? Put your name down. The organiser sees it next to every team that needs players and places you with one; you then show as In for that team.</p><ul>${rows}</ul>${form}<p class="note">Everyone with this link sees the names, so a first name or nickname is enough. Ask the organiser how they will reach you once you are placed.</p>`;
}

/** The admin piece for one short-team row: the free subs that night, each with a Place button. */
export function placeButtonsHtml(pool, availability, games, row, key) {
  const free = freeSubs(pool, availability, games, row.day);
  if (!free.length) return "";
  const k = esc(key);
  const buttons = free.slice(0, 12).map((n) => `<form method="post" action="/admin/sub?key=${k}" style="display:inline"><input type="hidden" name="fixture" value="${esc(row.fixture)}"><input type="hidden" name="team" value="${row.teamIndex}"><input type="hidden" name="name" value="${esc(n)}"><button>Place ${esc(n)}</button></form>`).join("");
  return `<br><span class="note">Subs free that night:</span> ${buttons}`;
}

/** The free subs for a short team's night, as one sentence for the nudge text and reminder emails ("" when none). */
export function freeSubsLine(pool, availability, games, day) {
  const free = freeSubs(pool, availability, games, day);
  return free.length ? `Subs free that night: ${free.join(", ")}.` : "";
}
