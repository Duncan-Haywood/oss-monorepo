// Cards, suspensions and top scorers for the self-hosted league page (server.mjs).
//
// The organiser keeps one plain-text log in /admin, a line per event, the same way results are kept:
//
//   2026-10-14 Hawks: Ana Lopez yellow
//   2026-10-14 Hawks: Ana Lopez second yellow      (sent off for two yellows: the red ban, not two yellows)
//   2026-10-21 Owls: Cara Diaz red 3               (a red with a ban the league's panel set: 3 games)
//   2026-10-21 Owls: Cara Diaz goal 2              (two goals, for the scorers table)
//   2026-10-28 Owls: Dan Ruiz ban 2                (a ban with no card: a panel decision, a fight after the game)
//
// From the log and the league's rules (a ban after every N yellows, of M games, escalating or not; a red's
// standard ban) it works out each player's bans and serves them against the player's own TEAM's fixtures
// after the game the card came in, in order. Only games already played count as served: a game on or after
// today has not been played yet, and a rained-out game moves to its new date (fixture ids follow it), so a
// ban is never "served" by a game that did not happen. The output is who is suspended for which upcoming
// fixtures, who is one yellow from a ban, and a scorers table. Nothing here is a disciplinary process: the
// organiser's panel decides; this keeps the count. Zero dependencies.
import { parseDate, dayLabel } from "./dates.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const MAX_LINES = 2000;

/** The organiser's rules from the saved fields, cleaned, with defaults (5 yellows -> 1 game, red -> 1 game). */
export function disciplineSettings(f = {}) {
  const int = (v, d, lo, hi) => { const n = Number(String(v ?? "").trim()); return String(v ?? "").trim() !== "" && Number.isInteger(n) && n >= lo && n <= hi ? n : d; };
  return {
    yellowsPerBan: int(f.yellowsPerBan, 5, 0, 20), // 0 = yellows never add up to a ban
    yellowBanGames: int(f.yellowBanGames, 1, 1, 10),
    escalate: !!f.yellowEscalate, // 5 -> 1 game, 10 -> 2, 15 -> 3 (yellowBanGames x the step), as many county FAs do
    redBanGames: int(f.redBanGames, 1, 0, 20),
    secondYellowBanGames: int(f.secondYellowBanGames, 1, 0, 20),
    show: !!f.disciplineShow,
  };
}

const KINDS = [
  [/^second\s+yellow$|^2nd\s+yellow$|^yellow\s*-?\s*red$/i, "second"],
  [/^yellow$|^y$|^booking$|^caution$/i, "yellow"],
  [/^red$|^r$|^sending\s+off$|^sent\s+off$/i, "red"],
  [/^ban$|^suspension$|^suspended$/i, "ban"],
  [/^goals?$/i, "goal"],
];

/**
 * Parse the log against the schedule's team names -> { events, errors }. Each event:
 * { line, day, team (index), player, kind: yellow|second|red|ban|goal, n (ban games or goals; null = default) }.
 */
export function parseDiscipline(text, teams) {
  const events = [], errors = [];
  const byName = new Map(teams.map((t, i) => [t.trim().toLowerCase(), i]));
  const lines = String(text ?? "").split(/\r?\n/);
  if (lines.length > MAX_LINES) errors.push(`Only the first ${MAX_LINES} lines of the cards log are read.`);
  lines.slice(0, MAX_LINES).forEach((raw, i) => {
    const s = raw.trim();
    if (!s || s.startsWith("#")) return;
    const m = s.match(/^(\S+)\s+(.+?):\s*(.+?)\s+((?:second|2nd)\s+yellow|yellow\s*-?\s*red|sending\s+off|sent\s+off|[a-z]+)(?:\s+(\d{1,2}))?$/i);
    if (!m) { errors.push(`Cards line ${i + 1} ("${s.slice(0, 60)}"): write it as "2026-10-14 Hawks: Ana Lopez yellow" (or red, second yellow, ban 2, goal).`); return; }
    const day = parseDate(m[1]);
    if (day === null) { errors.push(`Cards line ${i + 1}: "${m[1]}" is not a date (use 2026-10-14).`); return; }
    const team = byName.get(m[2].trim().toLowerCase());
    if (team === undefined) { errors.push(`Cards line ${i + 1}: no team called "${m[2].trim()}".`); return; }
    const kind = KINDS.find(([re]) => re.test(m[4].trim()))?.[1];
    if (!kind) { errors.push(`Cards line ${i + 1}: "${m[4]}" is not one of yellow, second yellow, red, ban or goal.`); return; }
    const n = m[5] === undefined ? null : Number(m[5]);
    if (kind === "yellow" && n !== null) { errors.push(`Cards line ${i + 1}: a yellow takes no number (write one line per yellow).`); return; }
    if (kind === "ban" && !n) { errors.push(`Cards line ${i + 1}: say how many games, e.g. "ban 2".`); return; }
    const player = m[3].replace(/\s+/g, " ").trim().slice(0, 80);
    events.push({ line: i + 1, day, team, player, kind, n });
  });
  return { events, errors };
}

/** Every fixture of `team` in the schedule (after rainouts and withdrawals), by day then time. */
function teamFixtures(schedule, team) {
  const out = [];
  for (const r of schedule?.rounds || []) for (const m of r.matches || []) {
    if (m.home !== team && m.away !== team) continue;
    out.push({ fixture: m.fixture, day: r.day, time: m.time || "", court: m.court || "", opponent: m.home === team ? m.away : m.home });
  }
  return out.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
}

const key = (team, player) => `${team}\u0000${player.toLowerCase()}`;

/**
 * Work out every ban and serve it. Returns:
 *  bans:      [{ team, player, from (card day), games, reason, served: [fixture], missing: [fixture], left }]
 *  suspended: bans with games left, with the upcoming fixtures they cover
 *  nearYellow: players one yellow short of a ban [{ team, player, yellows, next }]
 *  players:   per player tallies { team, player, yellows, reds, goals }
 *  warnings:  cards dated on a day the team had no game
 */
export function disciplineState(events, schedule, rules, today) {
  const fixturesOf = new Map();
  const fx = (t) => fixturesOf.get(t) || (fixturesOf.set(t, teamFixtures(schedule, t)), fixturesOf.get(t));
  const ev = [...events].sort((a, b) => a.day - b.day || a.line - b.line);
  const players = new Map(), bans = [], warnings = [];
  for (const e of ev) {
    const k = key(e.team, e.player);
    const p = players.get(k) || (players.set(k, { team: e.team, player: e.player, yellows: 0, reds: 0, goals: 0, bans: 0 }), players.get(k));
    const onDay = fx(e.team).some((g) => g.day === e.day);
    if (!onDay && e.kind !== "ban") warnings.push(`Cards line ${e.line}: ${schedule.teams[e.team]} had no game on ${dayLabel(e.day)}; the ban (if any) is served from its next game.`);
    let games = 0, reason = "";
    if (e.kind === "goal") { p.goals += e.n ?? 1; continue; }
    if (e.kind === "yellow") {
      p.yellows++;
      if (rules.yellowsPerBan && p.yellows % rules.yellowsPerBan === 0) {
        const step = p.yellows / rules.yellowsPerBan;
        games = rules.yellowBanGames * (rules.escalate ? step : 1);
        reason = `${p.yellows} yellow cards`;
      }
    } else if (e.kind === "second") {
      p.reds++; games = e.n ?? rules.secondYellowBanGames; reason = "sent off (two yellows)";
    } else if (e.kind === "red") {
      p.reds++; games = e.n ?? rules.redBanGames; reason = e.n !== null ? `red card, ${e.n}-game ban` : "red card";
    } else if (e.kind === "ban") {
      games = e.n; reason = `ban of ${e.n} game${e.n === 1 ? "" : "s"}`;
    }
    if (games > 0) { p.bans++; bans.push({ team: e.team, player: e.player, from: e.day, line: e.line, games, reason }); }
  }
  // Serve bans per player in order: each later fixture of the team serves one game of the earliest
  // unfinished ban. A card on a day counts only from that day's game on, so the game it came in never serves it.
  const queue = new Map();
  for (const b of bans) { const k = key(b.team, b.player); (queue.get(k) || (queue.set(k, []), queue.get(k))).push(b); }
  for (const list of queue.values()) {
    const games = fx(list[0].team);
    let gi = 0;
    for (const b of list) {
      b.served = []; b.missing = [];
      while (gi < games.length && games[gi].day <= b.from) gi++;
      while (b.served.length + b.missing.length < b.games && gi < games.length) {
        const g = games[gi++];
        (g.day < today ? b.served : b.missing).push(g);
      }
      b.left = b.games - b.served.length;
      // More games banned than the team has left: the rest carry to next season (said, not guessed at).
      b.carry = b.games - b.served.length - b.missing.length;
    }
  }
  const suspended = bans.filter((b) => b.left > 0).sort((a, b) => (a.missing[0]?.day ?? 1e9) - (b.missing[0]?.day ?? 1e9) || a.player.localeCompare(b.player));
  const nearYellow = [];
  if (rules.yellowsPerBan > 1) for (const p of players.values()) {
    if (p.yellows % rules.yellowsPerBan === rules.yellowsPerBan - 1) {
      const step = Math.ceil(p.yellows / rules.yellowsPerBan) || 1;
      nearYellow.push({ team: p.team, player: p.player, yellows: p.yellows, next: rules.yellowBanGames * (rules.escalate ? step : 1) });
    }
  }
  return { bans, suspended, nearYellow, players: [...players.values()], warnings };
}

/** Is `player` of `team` banned from `fixture`? (For the captain's team sheet.) */
export function bannedFrom(state, team, fixture) {
  return state.suspended.filter((b) => b.team === team && b.missing.some((g) => g.fixture === fixture)).map((b) => b.player);
}

/** Top scorers: players with goals, most first, ties by name. */
export function scorers(state, limit = 20) {
  return state.players.filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals || a.player.localeCompare(b.player)).slice(0, limit);
}

const gameText = (g, teams) => `${dayLabel(g.day)}${g.time ? " " + esc(g.time) : ""} v ${esc(teams[g.opponent])}`;

function suspendedList(list, teams, withTeam = true) {
  return `<ul>${list.map((b) => {
    const next = b.missing.length ? `misses ${b.missing.map((g) => gameText(g, teams)).join("; ")}` : "";
    const carry = b.carry > 0 ? `${next ? "; " : ""}${b.carry} game${b.carry === 1 ? "" : "s"} carried past this season's fixtures` : "";
    return `<li><strong>${esc(b.player)}</strong>${withTeam ? ` (${esc(teams[b.team])})` : ""}: ${esc(b.reason)} on ${dayLabel(b.from)}, ${b.left} of ${b.games} game${b.games === 1 ? "" : "s"} left. ${next}${carry}</li>`;
  }).join("")}</ul>`;
}

/** Public block on the league page: suspensions and the scorers table, only when the organiser ticks Show. */
export function leagueDisciplineHtml(state, teams) {
  const top = scorers(state, 10);
  if (!state.suspended.length && !top.length) return "";
  const sus = state.suspended.length ? `<h3>Suspended</h3>${suspendedList(state.suspended, teams)}` : "";
  const sc = top.length ? `<h3>Top scorers</h3><table><thead><tr><th>Player</th><th>Team</th><th>Goals</th></tr></thead><tbody>${top.map((p) => `<tr><td>${esc(p.player)}</td><td>${esc(teams[p.team])}</td><td>${p.goals}</td></tr>`).join("")}</tbody></table>` : "";
  return `<section id="discipline"><h2>Discipline and scorers</h2>${sus}${sc}</section>`;
}

/** The captain's own team: who may not play in its next games, and who is one yellow from a ban. */
export function captainDisciplineHtml(state, team, teams) {
  const mine = state.suspended.filter((b) => b.team === team);
  const near = state.nearYellow.filter((p) => p.team === team);
  if (!mine.length && !near.length) return "";
  return `<section id="discipline"><h2>Your team's suspensions</h2>${mine.length ? suspendedList(mine, teams, false) : "<p>No one is suspended.</p>"}${near.length ? `<p>One more yellow and a ban: ${near.map((p) => `<strong>${esc(p.player)}</strong> (${p.yellows} yellows, next ban ${p.next} game${p.next === 1 ? "" : "s"})`).join(", ")}.</p>` : ""}<p class="note">From the organiser's cards log. A ban is served in your team's own games after the one the card came in; a rained-out game does not count until it is played.</p></section>`;
}

/** The organiser's view: every live ban, the near-ban list, warnings and the per-player tally count. */
export function adminDisciplineHtml(state, teams, errors = []) {
  const warn = [...errors, ...state.warnings];
  const parts = [`<h2 id="discipline">Cards and suspensions</h2>`];
  if (warn.length) parts.push(`<ul class="warn">${warn.slice(0, 30).map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`);
  parts.push(state.suspended.length ? `<h3>Suspended now (${state.suspended.length})</h3>${suspendedList(state.suspended, teams)}` : "<p>No one is suspended.</p>");
  if (state.nearYellow.length) parts.push(`<p>One yellow from a ban: ${state.nearYellow.map((p) => `${esc(p.player)} (${esc(teams[p.team])}, ${p.yellows})`).join(", ")}.</p>`);
  const done = state.bans.filter((b) => b.left === 0).length;
  if (done) parts.push(`<p class="note">${done} ban${done === 1 ? "" : "s"} already served.</p>`);
  return parts.join("");
}

const csvCell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Every ban, served or not, for the league's records. */
export function disciplineCsv(state, teams) {
  const rows = [["player", "team", "reason", "card date", "games", "served", "left", "games still to miss"]];
  for (const b of state.bans) rows.push([b.player, teams[b.team], b.reason, new Date(b.from * 86400000).toISOString().slice(0, 10), b.games, b.served.length, b.left, b.missing.map((g) => new Date(g.day * 86400000).toISOString().slice(0, 10) + " v " + teams[g.opponent]).join("; ")]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
