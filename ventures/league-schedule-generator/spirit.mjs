// Sportsmanship (spirit) ratings for the self-hosted league page (server.mjs). After a game each captain
// rates the OTHER team's sportsmanship from their captain link: either five categories scored 0 to 4
// (the shape of the WFDF Spirit of the Game score sheet used in ultimate, total 0 to 20, where 10 means
// "good, nothing to note"), or one score from 1 to 5. The organiser sees every team's average received,
// the ratings each team gives, low ratings with the comment that came with them, and which captains have
// not rated yet; the league page shows the spirit table only if the organiser ticks it. Comments are
// never shown to players. Ratings are keyed by fixture id (a game keeps it through rainouts) and by the
// rating side, so a captain can change their own rating while the game is still in the report window.
// Zero dependencies.
import { dayLabel } from "./calc.mjs";
import { reportableGames, REPORT_DAYS } from "./confirm.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The two scales. `low(scores)` marks a rating the organiser should read (a judgment default, not a rule). */
export const SPIRIT_MODES = {
  categories: {
    label: "Five categories, 0 to 4 each (total 0 to 20; 10 is a normal good game)",
    names: ["Rules knowledge and use", "Fouls and body contact", "Fair-mindedness", "Positive attitude and self-control", "Communication"],
    min: 0, max: 4, total: 20, normal: 2,
    low: (s) => s.some((x) => x === 0) || s.reduce((a, b) => a + b, 0) <= 6,
  },
  single: {
    label: "One score, 1 to 5 (3 is a normal good game)",
    names: ["Sportsmanship"],
    min: 1, max: 5, total: 5, normal: 3,
    low: (s) => s[0] <= 2,
  },
};
export const MAX_COMMENT = 300;

/** The organiser's settings from the saved fields: { mode: null | "categories" | "single", show: bool }. */
export function spiritSettings(fields) {
  const mode = SPIRIT_MODES[fields?.spiritMode] ? fields.spiritMode : null;
  return { mode, show: !!(mode && fields?.spiritShow) };
}

/**
 * A captain's rating form -> { req: { fixture, side, rated, scores, comment } } or { error }. `side` is the
 * rating team's side of the game, `rated` the other team's index. Only the captain's own recent games.
 */
export function parseSpirit(form, games, team, mode) {
  const m = SPIRIT_MODES[mode];
  if (!m) return { error: "Sportsmanship ratings are off for this league." };
  const g = games.find((x) => x.fixture === String(form.get("fixture") ?? ""));
  if (!g || (g.home !== team && g.away !== team)) return { error: `Pick one of your team's games from the list (games from the last ${REPORT_DAYS} days).` };
  const scores = [];
  for (let i = 0; i < m.names.length; i++) {
    const raw = String(form.get(`s${i}`) ?? "").trim(), n = Number(raw);
    if (raw === "" || !Number.isInteger(n) || n < m.min || n > m.max) return { error: `${m.names[i]}: pick a whole number from ${m.min} to ${m.max}.` };
    scores.push(n);
  }
  const comment = String(form.get("comment") ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  if (comment.length > MAX_COMMENT) return { error: `Keep the comment to ${MAX_COMMENT} characters.` };
  const side = g.home === team ? "home" : "away";
  return { req: { fixture: g.fixture, side, rated: side === "home" ? g.away : g.home, scores, comment } };
}

/** Store (or replace) one side's rating. `spirit` is fixture id -> { home?, away? }, each { mode, scores, comment, at }. */
export function recordSpirit(spirit, req, mode, now = Date.now()) {
  const e = spirit[req.fixture] || (spirit[req.fixture] = {});
  const replaced = !!e[req.side];
  e[req.side] = { mode, scores: [...req.scores], comment: req.comment, at: now };
  return { replaced };
}

/** Drop ratings for fixtures no longer in the schedule (a withdrawn team's games), so the state stays small. */
export function pruneSpirit(spirit, schedule) {
  const ids = new Set();
  for (const r of schedule?.rounds || []) for (const m of r.matches || []) if (m.fixture) ids.add(m.fixture);
  for (const f of Object.keys(spirit || {})) if (!ids.has(f)) delete spirit[f];
}

/** Every rating in the current mode for games still in the schedule, oldest game first. */
export function spiritRatings(spirit, schedule, mode) {
  const out = [];
  for (const r of schedule?.rounds || []) for (const m of r.matches || []) {
    const e = m.fixture && spirit?.[m.fixture];
    if (!e) continue;
    for (const side of ["home", "away"]) {
      const v = e[side];
      if (!v || v.mode !== mode) continue;
      const by = side === "home" ? m.home : m.away, rated = side === "home" ? m.away : m.home;
      out.push({ fixture: m.fixture, day: r.day, time: m.time || "", by, rated, byName: schedule.teams[by], ratedName: schedule.teams[rated], scores: v.scores, total: v.scores.reduce((a, b) => a + b, 0), comment: v.comment || "", at: v.at });
    }
  }
  return out.sort((a, b) => a.day - b.day || a.fixture.localeCompare(b.fixture) || a.by - b.by);
}

/** Games in the report window that `team` played and has not rated yet. */
export function unratedGames(spirit, schedule, today, mode) {
  const games = reportableGames(schedule, today);
  return games.flatMap((g) => ["home", "away"].filter((side) => spirit?.[g.fixture]?.[side]?.mode !== mode).map((side) => ({ game: g, team: side === "home" ? g.home : g.away })));
}

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * The spirit table: one row per team that is still in the schedule, ranked by average total received
 * (teams with no ratings last, by name). Each row: received count, average total, per-category averages,
 * given count and the average it gives, low ratings received.
 */
export function spiritTable(spirit, schedule, mode) {
  const m = SPIRIT_MODES[mode];
  if (!m) return [];
  const ratings = spiritRatings(spirit, schedule, mode);
  const rows = schedule.teams.map((name, i) => ({ team: i, name, received: 0, avg: null, cats: m.names.map(() => null), given: 0, avgGiven: null, low: 0, _sum: 0, _cat: m.names.map(() => 0), _gsum: 0 }));
  for (const x of ratings) {
    const r = rows[x.rated], g = rows[x.by];
    r.received++; r._sum += x.total; x.scores.forEach((s, i) => { r._cat[i] += s; });
    if (m.low(x.scores)) r.low++;
    g.given++; g._gsum += x.total;
  }
  for (const r of rows) {
    if (r.received) { r.avg = round2(r._sum / r.received); r.cats = r._cat.map((s) => round2(s / r.received)); }
    if (r.given) r.avgGiven = round2(r._gsum / r.given);
    delete r._sum; delete r._cat; delete r._gsum;
  }
  // A withdrawn team keeps its name in `teams` but has no fixtures: leave it out unless it was rated.
  const playing = new Set();
  for (const rd of schedule.rounds || []) for (const mt of rd.matches || []) { playing.add(mt.home); playing.add(mt.away); }
  return rows.filter((r) => playing.has(r.team) || r.received || r.given)
    .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || b.received - a.received || a.name.localeCompare(b.name));
}

const fmt = (x) => (x === null ? "-" : Number.isInteger(x) ? String(x) : x.toFixed(2));

/** The captain's rating section: their recent games, each with the rating they gave (if any) and a form. */
export function captainSpiritHtml(spirit, games, team, mode, { token, cap }) {
  const m = SPIRIT_MODES[mode];
  if (!m) return "";
  const q = `t=${encodeURIComponent(token)}&c=${encodeURIComponent(cap)}`;
  const mine = games.filter((g) => g.home === team || g.away === team);
  const rows = mine.map((g) => {
    const side = g.home === team ? "home" : "away", other = side === "home" ? g.awayName : g.homeName;
    const had = spirit?.[g.fixture]?.[side];
    const prev = had && had.mode === mode ? had : null;
    const sel = (i) => {
      const opts = [];
      for (let v = m.min; v <= m.max; v++) opts.push(`<option value="${v}"${(prev ? prev.scores[i] : m.normal) === v ? " selected" : ""}>${v}</option>`);
      return `<label style="display:inline-block;margin-right:.6rem">${esc(m.names[i])} <select name="s${i}" style="width:auto">${opts.join("")}</select></label>`;
    };
    const state = prev ? `You rated them ${prev.scores.reduce((a, b) => a + b, 0)} of ${m.total}.` : "Not rated yet.";
    return `<li><strong>${dayLabel(g.day)}${g.time ? " " + esc(g.time) : ""}</strong> v ${esc(other)}: ${state}<form method="post" action="/league/spirit?${esc(q)}"><input type="hidden" name="fixture" value="${esc(g.fixture)}">${m.names.map((_, i) => sel(i)).join("")}<label>Comment for the organiser only (optional)<input name="comment" maxlength="${MAX_COMMENT}" value="${esc(prev?.comment ?? "")}"></label><button>${prev ? "Change rating" : "Send rating"}</button></form></li>`;
  }).join("");
  const body = rows ? `<ul>${rows}</ul>` : `<p>No games in the last ${REPORT_DAYS} days to rate.</p>`;
  return `<section id="spirit"><h2>Rate your opponents' sportsmanship</h2><p class="note">Rate the other team, not the result. ${m.names.length > 1 ? `Each category starts at ${m.normal}, a normal good game; go up for a standout, down for a problem.` : `${m.normal} is a normal good game.`} The other team does not see your rating or comment; the organiser does.</p>${body}</section>`;
}

/** The public spirit table on the league page (only when the organiser ticks Show): averages, no comments. */
export function leagueSpiritHtml(table, mode) {
  const m = SPIRIT_MODES[mode];
  if (!m || !table.some((r) => r.received)) return "";
  const rows = table.filter((r) => r.received).map((r) => `<tr><td>${esc(r.name)}</td><td>${r.received}</td><td>${fmt(r.avg)}</td></tr>`).join("");
  return `<section id="spirit-table"><h2>Sportsmanship</h2><table><thead><tr><th>Team</th><th>Games rated</th><th>Average (of ${m.total})</th></tr></thead><tbody>${rows}</tbody></table><p class="note">Average of the ratings each team's opponents gave it after their games.</p></section>`;
}

/** The organiser's view: the table with categories and what each team gives, low ratings, and who has not rated. */
export function adminSpiritHtml(spirit, schedule, mode, today, key) {
  const m = SPIRIT_MODES[mode];
  if (!m) return "";
  const k = esc(key);
  const table = spiritTable(spirit, schedule, mode);
  const head = `<tr><th>Team</th><th>Rated</th><th>Average</th>${m.names.length > 1 ? m.names.map((n) => `<th>${esc(n)}</th>`).join("") : ""}<th>Low</th><th>Gave</th><th>Average given</th></tr>`;
  const body = table.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.received}</td><td>${fmt(r.avg)}</td>${m.names.length > 1 ? r.cats.map((c) => `<td>${fmt(c)}</td>`).join("") : ""}<td>${r.low}</td><td>${r.given}</td><td>${fmt(r.avgGiven)}</td></tr>`).join("");
  const lows = spiritRatings(spirit, schedule, mode).filter((x) => m.low(x.scores)).reverse().slice(0, 20);
  const lowHtml = lows.length ? `<h3>Low ratings to read</h3><ul>${lows.map((x) => `<li>${dayLabel(x.day)}: ${esc(x.byName)} rated ${esc(x.ratedName)} ${x.total} of ${m.total}${m.names.length > 1 ? ` (${x.scores.join(", ")})` : ""}${x.comment ? `: "${esc(x.comment)}"` : ", no comment"}</li>`).join("")}</ul>` : "";
  const missing = unratedGames(spirit, schedule, today, mode);
  const byTeam = new Map();
  for (const u of missing) byTeam.set(u.team, [...(byTeam.get(u.team) || []), u.game]);
  const missHtml = byTeam.size ? `<h3>Not rated yet (last ${REPORT_DAYS} days)</h3><ul>${[...byTeam].map(([t, gs]) => `<li>${esc(schedule.teams[t])}: ${gs.map((g) => `${dayLabel(g.day)} v ${esc(g.home === t ? g.awayName : g.homeName)}`).join("; ")}</li>`).join("")}</ul>` : "";
  return `<h2>Sportsmanship ratings</h2><p class="note">${esc(m.label)}. Each captain rates the other team from their captain link after a game; "Low" counts ratings ${m.names.length > 1 ? "with a 0 in any category or a total of 6 or less" : "of 2 or less"}. A team whose "Average given" is far below the others may be marking hard rather than meeting poor sports. Comments are shown only here.</p><table><thead>${head}</thead><tbody>${body}</tbody></table>${lowHtml}${missHtml}<p><a href="/admin/spirit.csv?key=${k}">Download every rating (CSV)</a></p>`;
}

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Every rating in the current mode, one row each, oldest game first. */
export function spiritCsv(spirit, schedule, mode) {
  const m = SPIRIT_MODES[mode];
  if (!m) return "no ratings: sportsmanship ratings are off\r\n";
  const iso = (d) => new Date(d * 86400000).toISOString().slice(0, 10);
  const rows = [["date", "time", "rated_by", "team_rated", ...m.names.map((n) => n.toLowerCase().replace(/[^a-z]+/g, "_")), "total", "of", "low", "comment", "rated_utc"]];
  for (const x of spiritRatings(spirit, schedule, mode)) rows.push([iso(x.day), x.time, x.byName, x.ratedName, ...x.scores, x.total, m.total, m.low(x.scores) ? "yes" : "no", x.comment, new Date(x.at).toISOString()]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
