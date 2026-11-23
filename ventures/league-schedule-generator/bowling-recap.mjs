// The league secretary's weekly job for a bowling league, on top of the schedule bowling.mjs builds:
// typed score sheets in, bowler averages, handicaps, points per game and series, standings and a
// recap out. Position-round weeks are paired from the standings before that night.
//
// Rules, all set by the league (the defaults are a common handicap league, not a sanctioning
// body's rule; a league's own rules and its USBC or other association rules decide):
// - Average: total scratch pins over games bowled, fractions dropped, through the week before.
//   A bowler with no games yet uses their entering average if one is typed; with neither, the
//   night's own games set the average, and so the handicap, for that night (retroactive).
// - Handicap per game: handicapPct% of (basis - average), fractions dropped, never below 0, capped
//   at maxHandicap when set. handicapPct 0 is a scratch league.
// - An absent bowler (typed "absent") scores average - absentPenalty each game, plus handicap; the
//   games do not count toward their average. Absent with no average, or a lineup short of
//   teamSize, counts as a blind: blindScore pins a game, no handicap.
// - Points: pointsPerGame to the higher handicap total each game, pointsSeries for the higher
//   series; a tie splits them. Against the Vacancy (an odd league) a team bowls against its own
//   par: the sum, over its lineup, of each spot's average plus handicap (blind spots: blindScore).
import { VACANCY } from "./bowling.mjs";
import { csvCell } from "./outputs.mjs";
import { dayLabel } from "./dates.mjs";

export const RECAP_DEFAULTS = Object.freeze({
  gamesPerNight: 3, teamSize: 4, handicapPct: 90, basis: 220, maxHandicap: null,
  pointsPerGame: 2, pointsSeries: 2, absentPenalty: 10, blindScore: 150,
});

const MAX_SCORE = 300;

function intIn(v, lo, hi) { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; }

/** Checks and fills a rules object; returns { rules, errors }. */
export function readRules(input = {}) {
  const r = { ...RECAP_DEFAULTS };
  const errors = [];
  const set = (key, lo, hi, label) => {
    if (input[key] === undefined || input[key] === "" || input[key] === null) return;
    const n = intIn(input[key], lo, hi);
    if (n === null) errors.push(`${label} must be a whole number from ${lo} to ${hi}.`);
    else r[key] = n;
  };
  set("gamesPerNight", 1, 5, "Games a night");
  set("teamSize", 1, 8, "Bowlers a team");
  set("handicapPct", 0, 100, "Handicap percentage");
  set("basis", 100, 300, "Handicap basis");
  set("maxHandicap", 0, 300, "Highest handicap");
  set("pointsPerGame", 0, 10, "Points a game");
  set("pointsSeries", 0, 10, "Points for the series");
  set("absentPenalty", 0, 100, "Absent penalty");
  set("blindScore", 0, 300, "Blind score");
  return { rules: r, errors };
}

export function handicapFor(average, rules) {
  if (average === null || average === undefined || !rules.handicapPct) return 0;
  let h = Math.floor((rules.handicapPct * (rules.basis - average)) / 100);
  if (h < 0) h = 0;
  if (rules.maxHandicap !== null && rules.maxHandicap !== undefined && h > rules.maxHandicap) h = rules.maxHandicap;
  return h;
}

const keyOf = (name) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** "Ana 165, Ben Ortiz 142": entering averages (last season's book average) by bowler name. */
export function parseEntering(text) {
  const map = new Map(), errors = [];
  for (const part of String(text ?? "").split(/[\n,;]+/)) {
    const s = part.trim();
    if (!s) continue;
    const m = s.match(/^(.*\S)\s+(\d{1,3})$/);
    if (!m || Number(m[2]) > MAX_SCORE) { errors.push(`Entering average "${s}": write a name and a number, like "Ana 165".`); continue; }
    map.set(keyOf(m[1]), { name: m[1].trim(), average: Number(m[2]) });
  }
  return { map, errors };
}

/**
 * Score sheets, one block per week:
 *   Week 1
 *   Pin Pals: Ana 180 165 201, Ben 140 152 133, Cy absent, Dee 150 160 170
 * Bowlers are separated by commas or semicolons; a bowler's games follow their name.
 */
export function parseScores(text, teams, rules) {
  const errors = [], weeks = new Map();
  const real = teams.filter((t) => t !== VACANCY);
  // Longest names first, so "Pin Pals B" is not read as "Pin Pals" with a stray "B".
  const byLength = [...real].sort((a, b) => b.length - a.length);
  let week = null;
  const lines = String(text ?? "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const wm = line.match(/^week\s+(\d{1,2})\s*:?\s*$/i);
    if (wm) {
      week = Number(wm[1]);
      if (weeks.has(week)) errors.push(`Line ${i + 1}: week ${week} is typed twice; put all its teams under one "Week ${week}" line.`);
      else weeks.set(week, new Map());
      continue;
    }
    if (week === null) { errors.push(`Line ${i + 1}: start with a "Week 1" line before the scores.`); continue; }
    const team = byLength.find((t) => line.toLowerCase().startsWith(t.toLowerCase()) && /^\s*:/.test(line.slice(t.length)));
    if (!team) { errors.push(`Line ${i + 1}: "${line.slice(0, 40)}" does not start with a team name and a colon (teams: ${real.join(", ")}).`); continue; }
    const sheet = weeks.get(week);
    if (sheet.has(team)) { errors.push(`Line ${i + 1}: ${team} has two lines in week ${week}.`); continue; }
    const entries = [];
    const seen = new Set();
    for (const raw of line.slice(line.indexOf(":", team.length) + 1).split(/[,;]+/)) {
      const s = raw.trim();
      if (!s) continue;
      const absent = s.match(/^(.*\S)\s+(absent|abs)$/i);
      let entry;
      if (absent) entry = { name: absent[1].trim().replace(/\s+/g, " "), absent: true, scores: [] };
      else {
        const toks = s.split(/\s+/);
        let k = toks.length;
        while (k > 0 && /^\d+$/.test(toks[k - 1])) k--;
        const name = toks.slice(0, k).join(" ");
        const scores = toks.slice(k).map(Number);
        if (!name) { errors.push(`Week ${week}, ${team}: "${s}" has scores but no bowler name.`); continue; }
        if (scores.length !== rules.gamesPerNight) { errors.push(`Week ${week}, ${team}: ${name} has ${scores.length} game${scores.length === 1 ? "" : "s"}; the league bowls ${rules.gamesPerNight} a night (type "${name} absent" for a bowler who missed the night).`); continue; }
        const bad = scores.find((x) => x > MAX_SCORE);
        if (bad !== undefined) { errors.push(`Week ${week}, ${team}: ${name}'s ${bad} is over ${MAX_SCORE}.`); continue; }
        entry = { name, absent: false, scores };
      }
      if (seen.has(keyOf(entry.name))) { errors.push(`Week ${week}, ${team}: ${entry.name} is listed twice.`); continue; }
      seen.add(keyOf(entry.name));
      entries.push(entry);
    }
    if (entries.length > rules.teamSize) { errors.push(`Week ${week}, ${team}: ${entries.length} bowlers, but a team bowls ${rules.teamSize}; take a name off or change "Bowlers a team".`); continue; }
    sheet.set(team, entries);
  }
  // A bowler on two teams in one night is a typing slip.
  for (const [w, sheet] of weeks) {
    const where = new Map();
    for (const [team, entries] of sheet) for (const e of entries) {
      const k = keyOf(e.name);
      if (where.has(k) && where.get(k) !== team) errors.push(`Week ${w}: ${e.name} is on both ${where.get(k)} and ${team}.`);
      where.set(k, team);
    }
  }
  return { weeks, errors };
}

function ordinalPlace(label) { const m = String(label).match(/^(\d+)/); return m ? Number(m[1]) : null; }

/** Standings rows from team totals, best first: points won, then handicap pins, then name. */
function rankTeams(stats, real) {
  return real.map((t) => stats.get(t)).sort((a, b) => b.won - a.won || b.hdcpPins - a.hdcpPins || a.team.localeCompare(b.team));
}

/**
 * The whole recap. season: from bowlingSchedule. Returns { errors, nights, standings, bowlers }.
 * nights[]: per week typed, each match with both sides' lines, game totals and points.
 */
export function bowlingRecap(season, { scores = "", entering = "", rules: ruleInput = {} } = {}) {
  const { rules, errors } = readRules(ruleInput);
  if (errors.length) return { errors, nights: [], standings: [], bowlers: [], rules };
  const real = season.teams.filter((t) => t !== VACANCY);
  const ent = parseEntering(entering);
  const parsed = parseScores(scores, season.teams, rules);
  errors.push(...ent.errors, ...parsed.errors);
  if (errors.length) return { errors, nights: [], standings: [], bowlers: [], rules };

  const bowlers = new Map(); // key -> record
  const recordOf = (name) => {
    const k = keyOf(name);
    if (!bowlers.has(k)) bowlers.set(k, { name, team: null, games: 0, pins: 0, highGame: 0, highSeries: 0, highGameHdcp: 0, highSeriesHdcp: 0, absences: 0 });
    return bowlers.get(k);
  };
  const averageBefore = (name) => {
    const b = bowlers.get(keyOf(name));
    if (b && b.games) return Math.floor(b.pins / b.games);
    const e = ent.map.get(keyOf(name));
    return e ? e.average : null;
  };
  const stats = new Map(real.map((t) => [t, { team: t, won: 0, lost: 0, games: 0, scratchPins: 0, hdcpPins: 0, highGame: 0, highSeries: 0, nights: 0 }]));
  const G = rules.gamesPerNight;
  const nights = [];
  const weekNos = [...parsed.weeks.keys()].sort((a, b) => a - b);

  // One side of a match: per-spot lines, game totals with handicap, and par (for a Vacancy match).
  const sideOf = (team, entries) => {
    const lines = [];
    for (const e of entries) {
      const before = averageBefore(e.name);
      if (e.absent) {
        if (before === null) { lines.push({ name: e.name, kind: "blind", note: "absent, no average", average: null, handicap: 0, scores: Array(G).fill(rules.blindScore) }); continue; }
        const h = handicapFor(before, rules);
        lines.push({ name: e.name, kind: "absent", average: before, handicap: h, scores: Array(G).fill(Math.max(0, before - rules.absentPenalty)) });
        continue;
      }
      const night = Math.floor(e.scores.reduce((s, x) => s + x, 0) / G);
      const avg = before ?? night;
      lines.push({ name: e.name, kind: "bowled", average: avg, retro: before === null, handicap: handicapFor(avg, rules), scores: e.scores });
    }
    for (let i = entries.length; i < rules.teamSize; i++) lines.push({ name: "Blind", kind: "blind", filler: true, average: null, handicap: 0, scores: Array(G).fill(rules.blindScore) });
    const scratch = Array.from({ length: G }, (_, g) => lines.reduce((s, l) => s + l.scores[g], 0));
    const hdcp = lines.reduce((s, l) => s + l.handicap, 0);
    const games = scratch.map((x) => x + hdcp);
    const par = lines.reduce((s, l) => s + (l.kind === "blind" ? rules.blindScore : l.average + l.handicap), 0);
    return { team, lines, scratch, handicap: hdcp, games, series: games.reduce((s, x) => s + x, 0), par };
  };
  const award = (x, y, pts) => (x > y ? [pts, 0] : x < y ? [0, pts] : [pts / 2, pts / 2]);

  for (const w of weekNos) {
    const wk = season.weeks.find((x) => x.week === w);
    if (!wk) { errors.push(`Week ${w}: the season has ${season.weeks.length} weeks.`); continue; }
    const sheet = parsed.weeks.get(w);
    // Who bowls whom this week: the schedule, or the standings before tonight on a position round.
    let pairs;
    if (wk.kind === "round") pairs = wk.matches.map((m) => ({ pair: m.pair, a: season.teams[m.a], b: season.teams[m.b] }));
    else {
      const order = rankTeams(stats, real).map((r) => r.team);
      pairs = wk.matches.map((m) => ({ pair: m.pair, a: order[ordinalPlace(m.a) - 1], b: m.b === VACANCY ? VACANCY : order[ordinalPlace(m.b) - 1] }));
    }
    const matches = [];
    for (const p of pairs) {
      const haveA = sheet.has(p.a), haveB = p.b === VACANCY || sheet.has(p.b);
      if (!haveA && (p.b === VACANCY || !sheet.has(p.b))) continue; // nothing typed for this match yet
      if (!haveA || !haveB) {
        const missing = haveA ? p.b : p.a, present = haveA ? p.a : p.b;
        errors.push(`Week ${w}: ${present} has scores but its opponent ${missing} does not${wk.kind === "position" ? " (position round, paired from the standings before this week)" : ""}.`);
        continue;
      }
      const A = sideOf(p.a, sheet.get(p.a));
      const B = p.b === VACANCY ? null : sideOf(p.b, sheet.get(p.b));
      const oppGames = B ? B.games : Array(G).fill(A.par);
      const oppSeries = B ? B.series : A.par * G;
      const ptsA = [0, 0], perGame = [];
      for (let g = 0; g < G; g++) {
        const [x, y] = award(A.games[g], oppGames[g], rules.pointsPerGame);
        perGame.push([x, y]); ptsA[0] += x; ptsA[1] += y;
      }
      const [sx, sy] = award(A.series, oppSeries, rules.pointsSeries);
      ptsA[0] += sx; ptsA[1] += sy;
      matches.push({ pair: p.pair, lanes: season.labels[p.pair], a: A, b: B, vacancy: !B, perGame, series: [sx, sy], points: ptsA });
    }
    // Typed teams that are not in any match tonight (a position round with gaps, say).
    for (const team of sheet.keys()) if (!pairs.some((p) => p.a === team || p.b === team)) errors.push(`Week ${w}: ${team} is not on the schedule that week.`);
    if (errors.length) break;
    // Book tonight after every match is scored, so averages and standings move a night at a time.
    for (const m of matches) {
      for (const [side, pts] of [[m.a, m.points[0]], [m.b, m.points[1]]]) {
        if (!side) continue;
        const st = stats.get(side.team);
        st.won += pts; st.lost += m.points[side === m.a ? 1 : 0]; st.nights++;
        st.games += G;
        st.scratchPins += side.scratch.reduce((s, x) => s + x, 0);
        st.hdcpPins += side.series;
        st.highGame = Math.max(st.highGame, ...side.games);
        st.highSeries = Math.max(st.highSeries, side.series);
        for (const l of side.lines) {
          if (l.filler) continue;
          const b = recordOf(l.name);
          b.team = side.team;
          if (l.kind !== "bowled") { b.absences++; continue; }
          const series = l.scores.reduce((s, x) => s + x, 0);
          b.games += G; b.pins += series;
          b.highGame = Math.max(b.highGame, ...l.scores);
          b.highSeries = Math.max(b.highSeries, series);
          b.highGameHdcp = Math.max(b.highGameHdcp, ...l.scores.map((x) => x + l.handicap));
          b.highSeriesHdcp = Math.max(b.highSeriesHdcp, series + G * l.handicap);
        }
      }
    }
    nights.push({ week: w, day: wk.day, kind: wk.kind, matches });
  }
  if (errors.length) return { errors, nights: [], standings: [], bowlers: [], rules };

  const standings = rankTeams(stats, real).map((r, i) => ({ place: i + 1, ...r }));
  const list = [...bowlers.values()].map((b) => {
    const average = b.games ? Math.floor(b.pins / b.games) : (ent.map.get(keyOf(b.name))?.average ?? null);
    return { ...b, average, handicap: handicapFor(average, rules) };
  }).sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || a.name.localeCompare(b.name));
  return { errors: [], nights, standings, bowlers: list, rules };
}

/** Plain text for the league sheet or a group chat: the last night typed, then standings and averages. */
export function recapText(recap, { allNights = false } = {}) {
  const out = [];
  const nights = allNights ? recap.nights : recap.nights.slice(-1);
  const pt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
  for (const n of nights) {
    out.push(`Week ${n.week}, ${dayLabel(n.day)}${n.kind === "position" ? " (position round)" : ""}`);
    for (const m of n.matches) {
      const left = `${m.a.team} ${m.a.games.join(" ")} (${m.a.series})`;
      const right = m.b ? `${m.b.team} ${m.b.games.join(" ")} (${m.b.series})` : `${VACANCY}: par ${m.a.par} a game`;
      out.push(`  ${m.lanes}: ${left} ${pt(m.points[0])}-${pt(m.points[1])} ${right}`);
    }
  }
  out.push("", "Standings (points won, lost, pins with handicap)");
  for (const s of recap.standings) out.push(`  ${s.place}. ${s.team}: ${pt(s.won)}-${pt(s.lost)}, ${s.hdcpPins}`);
  out.push("", "Averages (games, average, handicap next week)");
  for (const b of recap.bowlers) out.push(`  ${b.name} (${b.team}): ${b.games}, ${b.average ?? "-"}, ${b.handicap}`);
  return out.join("\n") + "\n";
}

// Every cell goes through calc.mjs csvCell, the formula-injection guard (a cell starting =, +, -,
// @, tab or CR gets an apostrophe), so a bowler named "=SUM(...)" stays text in a spreadsheet.
export function standingsCsv(recap) {
  const rows = [["Place", "Team", "Points won", "Points lost", "Nights", "Scratch pins", "Pins with handicap", "High game (hdcp)", "High series (hdcp)"]];
  for (const s of recap.standings) rows.push([s.place, s.team, s.won, s.lost, s.nights, s.scratchPins, s.hdcpPins, s.highGame, s.highSeries]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export function bowlersCsv(recap) {
  const rows = [["Bowler", "Team", "Games", "Pins", "Average", "Handicap", "High game", "High series", "High game (hdcp)", "High series (hdcp)", "Nights absent"]];
  for (const b of recap.bowlers) rows.push([b.name, b.team, b.games, b.pins, b.average ?? "", b.handicap, b.highGame, b.highSeries, b.highGameHdcp, b.highSeriesHdcp, b.absences]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
