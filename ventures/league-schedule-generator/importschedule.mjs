// League schedule generator, importschedule.mjs: bring a schedule made somewhere else.
//
// Most leagues already have a season: a spreadsheet the organiser typed, an export from TeamSnap,
// LeagueApps, SportsEngine or a club website, or a calendar feed. Until 2026-11-23 the league page could
// only run on a season it built itself, so an organiser with a finished schedule had to retype it as
// teams and dates and accept a different season. This reader takes the schedule as it is (CSV, rows
// pasted from Excel or Google Sheets, which arrive tab-separated, or an .ics calendar) and turns it into
// the same schedule object the builder returns, so standings, rainout moves, calendar feeds, the
// club-site embed, availability, captains' score reports and officials all run on it unchanged.
//
// It never guesses silently: every row it skips is named with its line number and the reason, and a
// file whose dates could be read two ways (5/6/2026) is read month-first unless some date in the same
// column only makes sense day-first (25/6/2026), in which case the whole column is day-first.

import { parseDate, parseTime, dayIso, dayOfWeek } from "./dates.mjs";
import { scheduleStats } from "./schedule.mjs";

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_TEAMS = 200;

// Header names, compared with case, spaces and punctuation removed.
const COLUMNS = {
  date: ["date", "gamedate", "eventdate", "startdate", "matchdate", "fixturedate", "day", "dateofgame", "gameday", "when"],
  datetime: ["datetime", "start", "starts", "startdatetime", "begins", "dtstart", "startdateandtime"],
  time: ["time", "starttime", "gametime", "kickoff", "kickofftime", "tipoff", "faceoff", "eventtime", "matchtime", "begintime"],
  home: ["home", "hometeam", "team1", "host", "hometeamname", "homeside", "teama"],
  away: ["away", "awayteam", "visitor", "visitors", "visitingteam", "guest", "guestteam", "team2", "awayteamname", "awayside", "teamb", "opponent"],
  matchup: ["game", "match", "matchup", "fixture", "teams", "event", "title", "subject", "summary", "eventname", "shortlabel", "description"],
  venue: ["location", "venue", "field", "court", "rink", "diamond", "pitch", "arena", "facility", "park", "sheet", "lanes", "ground", "gym", "site", "place"],
  venueDetail: ["locationdetails", "sublocation", "fieldname", "courtname", "subfacility", "locationdetail", "area"],
  type: ["eventtype", "type", "kind", "category"],
  homeScore: ["homescore", "homegoals", "homepoints", "hs", "scorehome", "homeresult", "team1score"],
  awayScore: ["awayscore", "awaygoals", "awaypoints", "as", "scoreaway", "awayresult", "team2score", "visitorscore"],
};

const NOT_A_TEAM = /^(bye|tbd|tba|tbc|open|none|n\/?a|-+|\?+|rest|off)$/i;
const key = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Rows of cells for one separator: quotes, doubled quotes and line breaks inside quotes; a BOM is dropped. */
export function delimitedRows(text, sep) {
  const rows = []; let row = [], cell = "", q = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"' && cell.trim() === "") { q = true; cell = ""; }
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ""));
}

/** The separator the header line uses most: tab (pasted from a spreadsheet), semicolon (European CSV), else comma. */
export function guessSeparator(text) {
  const first = String(text ?? "").replace(/^﻿/, "").split(/\r?\n/).find((l) => l.trim()) || "";
  const count = (ch) => first.split(ch).length - 1;
  const tabs = count("\t"), semis = count(";"), commas = count(",");
  if (tabs && tabs >= commas) return "\t";
  if (semis > commas) return ";";
  return ",";
}

/** "Hawks vs Owls", "Hawks v. Owls", "Owls @ Hawks" (away at home), "Hawks - Owls" -> { home, away } or null. */
export function splitMatchup(text) {
  const s = String(text ?? "").replace(/^(game|match|week \d+|round \d+)\s*[:.-]\s*/i, "").trim();
  let m = s.match(/^(.+?)\s+(?:@|at)\s+(.+)$/i);
  if (m) return { home: m[2].trim(), away: m[1].trim() };
  m = s.match(/^(.+?)\s+(?:vs?\.?|versus|x)\s+(.+)$/i);
  if (m) return { home: m[1].trim(), away: m[2].trim() };
  m = s.match(/^(.+?)\s+[–—-]\s+(.+)$/);
  if (m && !/^\d+$/.test(m[1]) && !/^\d+$/.test(m[2])) return { home: m[1].trim(), away: m[2].trim() };
  return null;
}

const WEEKDAY_PREFIX = /^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\.?,?\s+/i;

/**
 * One date cell -> a day number, or null. Adds to what parseDate reads: a leading weekday ("Tue 10/6/2026",
 * "Tuesday, October 6, 2026"), two-digit years (10/6/26), ISO with a time tail, and `dayFirst` for a column
 * whose slash dates are day/month.
 */
export function readDate(text, { dayFirst = false } = {}) {
  let s = String(text ?? "").trim().replace(WEEKDAY_PREFIX, "");
  const iso = s.match(/^(\d{4}-\d{1,2}-\d{1,2})(?:[T\s].*)?$/);
  if (iso) return parseDate(iso[1]);
  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (slash) {
    let [a, b, y] = [Number(slash[1]), Number(slash[2]), Number(slash[3])];
    if (slash[3].length === 2) y += 2000;
    const [mo, d] = dayFirst || a > 12 ? [b, a] : [a, b];
    return parseDate(`${y}-${mo}-${d}`);
  }
  return parseDate(s);
}

/** One time cell -> "HH:MM", "" for none/TBD, or null when it is not a time. */
export function readTime(text) {
  let s = String(text ?? "").trim().toLowerCase();
  if (!s || /^(tbd|tba|tbc|-+|\?+)$/.test(s)) return "";
  s = s.replace(/\b([ap])\.?m\.?/, "$1m").replace(/^(\d{1,2})\.(\d{2})/, "$1:$2").replace(/^(\d{1,2}:\d{2}):\d{2}/, "$1").replace(/\s+/g, " ");
  if (/^noon$/.test(s)) return "12:00";
  const h = s.match(/^(\d{1,2})h(\d{2})?$/);
  if (h) s = `${h[1]}:${h[2] || "00"}`;
  return parseTime(s);
}

/** A date-and-time cell ("10/6/2026 6:30 PM", "2026-10-06T18:30") -> { day, time } or null. */
function readDateTime(text, opts) {
  const s = String(text ?? "").trim();
  const t = s.match(/^(\d{4}-\d{1,2}-\d{1,2})[T\s]+(\d{1,2}:\d{2})/);
  if (t) return { day: parseDate(t[1]), time: readTime(t[2]) };
  const parts = s.split(/\s+/);
  for (let k = parts.length - 1; k >= 1; k--) {
    const day = readDate(parts.slice(0, k).join(" ").replace(/,$/, ""), opts);
    if (day !== null) { const time = readTime(parts.slice(k).join(" ").replace(/^at\s+/i, "")); if (time !== null) return { day, time }; }
  }
  const day = readDate(s, opts);
  return day === null ? null : { day, time: "" };
}

/** True when a slash-date column only makes sense day-first (some first number above 12, no second one). */
function columnIsDayFirst(cells) {
  let first = false, second = false;
  for (const c of cells) {
    const m = String(c ?? "").trim().replace(WEEKDAY_PREFIX, "").match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
    if (!m) continue;
    if (Number(m[1]) > 12) first = true;
    if (Number(m[2]) > 12) second = true;
  }
  return first && !second;
}

function findColumns(header) {
  const keys = header.map(key);
  const out = {};
  for (const [field, names] of Object.entries(COLUMNS)) {
    // exact names first, in the order listed, so "Home Team" beats a later "Team 1"
    for (const n of names) { const i = keys.indexOf(n); if (i >= 0 && !Object.values(out).includes(i)) { out[field] = i; break; } }
  }
  return out;
}

/** Calendar text (BEGIN:VCALENDAR) -> rows shaped like a CSV with Date, Time, Game, Location. */
function icsRows(text) {
  const unfolded = String(text).replace(/\r?\n[ \t]/g, "");
  const rows = [["Date", "Time", "Game", "Location"]];
  for (const block of unfolded.split(/BEGIN:VEVENT/).slice(1)) {
    const body = block.split(/END:VEVENT/)[0];
    const prop = (name) => { const m = body.match(new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, "mi")); return m ? m[1].replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/gi, " ").replace(/\\\\/g, "\\").trim() : ""; };
    const dt = prop("DTSTART").match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
    const date = dt ? `${dt[1]}-${dt[2]}-${dt[3]}` : "";
    const time = dt && dt[4] ? `${dt[4]}:${dt[5]}` : "";
    rows.push([date, time, prop("SUMMARY"), prop("LOCATION")]);
  }
  return rows;
}

/**
 * Reads a schedule made elsewhere. Returns { teams, games, results, errors, warnings, columns } where each
 * game is { day, time, court, home, away, line } with team indexes, `results` are "Hawks 3 - 2 Owls"
 * lines for rows that carry both scores, and `errors` name rows that could not be read (the rest import).
 * Options: `teams` (names to keep in this order; others are added after them in first-seen order).
 */
export function parseScheduleImport(text, opts = {}) {
  const src = String(text ?? "");
  const errors = [], warnings = [];
  const empty = (msg) => ({ teams: [], games: [], results: [], errors: msg ? [msg] : [], warnings, columns: {} });
  if (!src.trim()) return empty("Paste or upload a schedule first.");
  const isIcs = /BEGIN:VCALENDAR/i.test(src);
  const rows = isIcs ? icsRows(src) : delimitedRows(src, guessSeparator(src));
  if (rows.length < 2) return empty("The schedule needs a header row and at least one game.");
  if (rows.length - 1 > MAX_IMPORT_ROWS) return empty(`Up to ${MAX_IMPORT_ROWS} games can be imported at once; this has ${rows.length - 1}.`);
  const header = rows[0];
  const col = findColumns(header);
  const hasTeams = (col.home !== undefined && col.away !== undefined) || col.matchup !== undefined;
  if ((col.date === undefined && col.datetime === undefined) || !hasTeams) {
    return empty(`The header row needs a date column and either Home and Away columns or one column like "Hawks vs Owls". Found: ${header.slice(0, 12).join(", ") || "nothing"}.`);
  }
  const dateCol = col.date ?? col.datetime;
  const dayFirst = columnIsDayFirst(rows.slice(1).map((r) => r[dateCol]));
  if (dayFirst) warnings.push("Dates were read day first (25/12/2026), because some dates in the file only make sense that way.");

  const order = [], byKey = new Map();
  const teamIndex = (name) => {
    const k = name.toLowerCase().replace(/\s+/g, " ");
    if (!byKey.has(k)) { byKey.set(k, order.length); order.push(name.replace(/\s+/g, " ")); }
    return byKey.get(k);
  };
  for (const t of opts.teams || []) if (String(t).trim()) teamIndex(String(t).trim());

  const games = [], results = [];
  let skippedNonGames = 0, byes = 0;
  const seenSlot = new Map();
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const cell = (c) => (c === undefined ? "" : String(r[c] ?? "").trim());
    const type = cell(col.type);
    if (type && !/^(game|match|fixture|league|regular|playoff|play-off|tournament|scrimmage)/i.test(type)) { skippedNonGames++; return; }
    let home = cell(col.home), away = cell(col.away);
    if ((!home || !away) && col.matchup !== undefined) {
      const sm = splitMatchup(cell(col.matchup));
      if (sm) ({ home, away } = sm);
      else if (!home && !away) {
        if (isIcs || col.type === undefined) { skippedNonGames++; return; }
        errors.push(`Line ${line}: "${cell(col.matchup)}" does not name two teams (write it as "Hawks vs Owls" or "Owls @ Hawks").`); return;
      }
    }
    if (!home && !away) return;
    if (NOT_A_TEAM.test(home) || NOT_A_TEAM.test(away) || !home || !away) { byes++; return; }
    if (home.toLowerCase() === away.toLowerCase()) { errors.push(`Line ${line}: ${home} cannot play itself.`); return; }
    let day = null, time = "";
    if (col.date !== undefined) {
      day = readDate(cell(col.date), { dayFirst });
      if (day === null) { const dt = readDateTime(cell(col.date), { dayFirst }); if (dt) ({ day, time } = dt); }
    } else {
      const dt = readDateTime(cell(col.datetime), { dayFirst });
      if (dt) ({ day, time } = dt);
    }
    if (day === null) { errors.push(`Line ${line}: "${cell(dateCol)}" is not a date (use 2026-10-06, 10/6/2026 or Oct 6, 2026).`); return; }
    if (col.time !== undefined) {
      const t = readTime(cell(col.time));
      if (t === null) { errors.push(`Line ${line}: "${cell(col.time)}" is not a time (use 18:30 or 6:30 PM).`); return; }
      if (t) time = t;
    }
    const place = cell(col.venue), detail = cell(col.venueDetail);
    const court = place && detail && detail.toLowerCase() !== place.toLowerCase() ? `${place} - ${detail}` : place || detail;
    const h = teamIndex(home), a = teamIndex(away);
    if (order.length > MAX_IMPORT_TEAMS) { errors.push(`Up to ${MAX_IMPORT_TEAMS} teams can be imported.`); return; }
    if (court && time) {
      const sk = `${day}|${time}|${court.toLowerCase()}`;
      if (seenSlot.has(sk)) warnings.push(`Line ${line}: ${court} at ${time} on ${dayIso(day)} is also used by line ${seenSlot.get(sk)}.`);
      else seenSlot.set(sk, line);
    }
    games.push({ day, time, court, home: h, away: a, line });
    const hs = cell(col.homeScore), as = cell(col.awayScore);
    if (/^\d{1,3}$/.test(hs) && /^\d{1,3}$/.test(as)) results.push(`${order[h]} ${hs} - ${as} ${order[a]}`);
  });
  if (skippedNonGames) warnings.push(`${skippedNonGames} row(s) that are not games (practices, events, blank matchups) were left out.`);
  if (byes) warnings.push(`${byes} row(s) with a bye or a team still to be named (BYE, TBD) were left out.`);
  const clash = new Map();
  for (const g of games) for (const t of [g.home, g.away]) {
    const k = `${t}|${g.day}|${g.time}`;
    if (g.time && clash.has(k)) warnings.push(`${order[t]} is down for two games at ${g.time} on ${dayIso(g.day)} (lines ${clash.get(k)} and ${g.line}).`);
    else clash.set(k, g.line);
  }
  if (!games.length && !errors.length) errors.push("No games were found in the schedule.");
  if (!games.length && col.matchup !== undefined && col.home === undefined && header.map(key).some((h) => /^team[12]id$/.test(h))) {
    errors.unshift("This file names teams only by ID (Team1_ID, Team2_ID), as SportsEngine's upload template does: export the schedule with team names instead.");
  }
  if (errors.length > 20) errors.splice(20, errors.length - 20, `and ${errors.length - 20} more rows like these.`);
  if (games.length && order.length < 2) errors.push("A schedule needs at least two teams.");
  return { teams: order, games, results, errors, warnings: warnings.slice(0, 50), columns: col };
}

/**
 * The parsed games as the builder's schedule object: one round per date, courts in first-seen order, times
 * sorted, and the weekdays the file uses as the league's play days (where a rainout's make-up is looked
 * for). `skipDays` (day numbers) and `minutes` (game length) come from the organiser's other settings.
 */
export function importedSchedule(parsed, { minutes = 60, skipDays = [] } = {}) {
  const games = [...parsed.games].sort((x, y) => x.day - y.day || x.time.localeCompare(y.time) || x.line - y.line);
  const courts = [...new Set(games.map((g) => g.court))];
  const times = [...new Set(games.map((g) => g.time))].sort();
  const weekdays = [...new Set(games.map((g) => dayOfWeek(g.day)))].sort((a, b) => a - b);
  const byDay = new Map();
  for (const g of games) { if (!byDay.has(g.day)) byDay.set(g.day, []); byDay.get(g.day).push(g); }
  const perNight = new Map();
  for (const g of games) for (const t of [g.home, g.away]) perNight.set(`${t}|${g.day}`, (perNight.get(`${t}|${g.day}`) || 0) + 1);
  const most = Math.max(1, ...perNight.values());
  const seen = new Map();
  const rounds = [...byDay.entries()].map(([day, list], i) => ({
    number: i + 1, label: `Round ${i + 1}`, makeup: false, day, bye: null,
    matches: list.map((g) => {
      const pair = `${Math.min(g.home, g.away)}-${Math.max(g.home, g.away)}`;
      const k = seen.get(pair) || 0;
      seen.set(pair, k + 1);
      return { home: g.home, away: g.away, slot: times.indexOf(g.time) * courts.length + courts.indexOf(g.court), court: g.court, time: g.time, homeName: parsed.teams[g.home], awayName: parsed.teams[g.away], fixture: `${pair}-${k}` };
    }),
  }));
  const s = {
    teams: parsed.teams.slice(),
    config: { timeLimits: {}, courtLimits: {}, courtClosures: {}, double: false, partial: false, carryOver: false, imported: true, start: games.length ? games[0].day : null, weekdays, skipDays: [...skipDays], blackouts: {}, courts, times, seed: 1, minutes, ...(most > 1 ? { gamesPerNight: most } : {}) },
    rounds, notices: [], stats: null,
  };
  s.stats = scheduleStats(s);
  return s;
}

/** What the organiser sees after an import: counts and the season's span, one line. */
export function importSummary(parsed) {
  if (!parsed.games.length) return "";
  const days = parsed.games.map((g) => g.day);
  const first = Math.min(...days), last = Math.max(...days);
  return `${parsed.games.length} game${parsed.games.length === 1 ? "" : "s"}, ${parsed.teams.length} teams, ${dayIso(first)} to ${dayIso(last)}${parsed.results.length ? `, ${parsed.results.length} score${parsed.results.length === 1 ? "" : "s"}` : ""}.`;
}
