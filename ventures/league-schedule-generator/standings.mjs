// League schedule generator, standings.mjs: Results, standings, tie-breaks and the play-off race (clinched, eliminated, odds).
// Split out of calc.mjs on 2026-11-23 (quality audit round 87); calc.mjs re-exports every public name.

import { dayLabel } from "./dates.mjs";
import { teamIndex } from "./names.mjs";
import { mulberry32 } from "./rng.mjs";

// ---------------------------------------------------------------- results, standings, play-offs

/**
 * Lines like "Hawks 3 - 2 Owls". Names are matched against the team list.
 * A forfeit is written "Hawks w/o Owls" (also "wo" or "walkover"): Hawks are awarded the win and
 * the score `walkover` (default 3-0, so goal difference reflects it); the result carries `walkover: true`.
 * A points adjustment is "Hawks -3 pts" (also "+1", "-2 points", an optional "(reason)" after it): the
 * signed number is added to that team's table points and returned in `adjustments` as { teamIndex: delta }.
 */
export function parseResults(text, teams, { walkover = [3, 0] } = {}) {
  const results = [];
  const errors = [];
  const adjustments = {};
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) for (const piece of raw.split(/;/)) {
    const line = piece.trim();
    if (!line) continue;
    const adj = line.match(/^(.*?)\s+([+-]\d+)\s*(?:pts?|points?)?\s*(?:\(.*\))?$/i);
    if (adj) {
      const t = teamIndex(teams, adj[1]);
      if (t < 0) { errors.push(`Result line ${i + 1}: "${adj[1]}" is not one of the teams.`); continue; }
      adjustments[t] = (adjustments[t] ?? 0) + Number(adj[2]);
      continue;
    }
    const w = line.match(/^(.*?)\s+(?:w\/o|wo|walkover)\s+(.*)$/i);
    if (w) {
      const a = teamIndex(teams, w[1]);
      const b = teamIndex(teams, w[2]);
      if (a < 0 || b < 0) { errors.push(`Result line ${i + 1}: "${a < 0 ? w[1] : w[2]}" is not one of the teams.`); continue; }
      if (a === b) { errors.push(`Result line ${i + 1}: a team cannot play itself.`); continue; }
      results.push({ a, b, ga: walkover[0], gb: walkover[1], walkover: true });
      continue;
    }
    // Tolerate how people really type: a note in brackets ("(OT)", "(forfeit)"), a full stop, a minus sign
    // for the dash, "v"/"vs", "Hawks vs Owls 3-2", "Hawks beat Owls 3-2", "Owls lost to Hawks 2-3", "Hawks 3 Owls 2".
    let body = line.replace(/[\u2212\u2012\u2013\u2014]/g, "-").replace(/[.\s]+$/, "");
    let forfeitNote = false;
    // A bracket at the end is a note ("(OT)") unless it is part of a name: "Alex (12)" is how two
    // players called Alex are told apart (trfNames), and "Hawks (U12)" is a team. The line is read
    // with the bracket kept first; only if a name then fails to match is the bracket taken as a note.
    const splitScore = (text) => {
      let m = text.match(/^(.*?)\s+(\d+)\s*(?:-|:|\s(?:v|vs|vs\.)\s)\s*(\d+)\s+(.*)$/i);
      if (m) return [m[1], m[2], m[3], m[4]];
      if ((m = text.match(/^(.*?)\s+(?:vs\.?|v|beat|beats|defeated|lost to|lose to|drew with|drew|tied)\s+(.*?)\s+(\d+)\s*[-:]\s*(\d+)$/i))) return [m[1], m[3], m[4], m[2]];
      if ((m = text.match(/^(.*?)\s+(\d+)\s+(.*?)\s+(\d+)$/)) && teamIndex(teams, m[1]) >= 0 && teamIndex(teams, m[3]) >= 0) return [m[1], m[2], m[4], m[3]];
      return null;
    };
    let parts = null;
    const note = body.match(/^(.*?)\s*\(([^()]*)\)$/);
    if (note) {
      const kept = splitScore(body);
      if (kept && teamIndex(teams, kept[0]) >= 0 && teamIndex(teams, kept[3]) >= 0) parts = kept;
      else { forfeitNote = /forfeit|walkover|w\/o/i.test(note[2]); body = note[1]; }
    }
    parts ??= splitScore(body);
    if (!parts) { errors.push(`Result line ${i + 1}: write it like "Hawks 3 - 2 Owls" (or "Hawks w/o Owls" for a forfeit win).`); continue; }
    const [nameA, ga, gb, nameB] = parts;
    const a = teamIndex(teams, nameA);
    const b = teamIndex(teams, nameB);
    if (a < 0 || b < 0) { errors.push(`Result line ${i + 1}: "${a < 0 ? nameA : nameB}" is not one of the teams.`); continue; }
    if (a === b) { errors.push(`Result line ${i + 1}: a team cannot play itself.`); continue; }
    results.push(forfeitNote ? { a, b, ga: Number(ga), gb: Number(gb), walkover: true } : { a, b, ga: Number(ga), gb: Number(gb) });
    continue;
  }
  return { results, errors, adjustments };
}

/**
 * League points per win, draw and loss, written "3-1-0" (also "2/1/0" or "3 1 0"). Blank means 3-1-0.
 * Returns { win, draw, loss, error }; a bad entry gives the default plus an `error` to show. A win must
 * be worth more than a draw and a draw more than a loss, or the table would reward losing.
 */
export function parsePointSystem(text) {
  const def = { win: 3, draw: 1, loss: 0, error: null };
  const t = String(text ?? "").trim();
  if (!t) return def;
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*[-\/,\s]\s*(-?\d+(?:\.\d+)?)\s*[-\/,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return { ...def, error: `Points system "${t}": write wins, draws and losses like "3-1-0" or "2-1-0". Using 3-1-0.` };
  const [win, draw, loss] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!(win > draw && draw > loss)) return { ...def, error: `Points system "${t}": a win must be worth more than a draw, and a draw more than a loss. Using 3-1-0.` };
  return { win, draw, loss, error: null };
}

/**
 * Points, then goal difference, then goals for, then the order the teams were entered.
 * With `headToHead: true`, teams level on points are first split by a mini-table of only the
 * matches among them (points, goal difference, goals for), then by the overall tiebreaks.
 * `adjustments` ({ teamIndex: points }, from `parseResults`) adds or deducts table points, e.g. a
 * league penalty; the row shows it as `adj` and it counts before every tiebreak.
 */
/** A team's last `n` results in the order they were typed, oldest first, as "WDLWW" (W win, D draw, L loss). */
export function formString(teamIdx, results, n = 5) {
  const out = [];
  for (const r of results) {
    if (r.a !== teamIdx && r.b !== teamIdx) continue;
    const mine = r.a === teamIdx ? r.ga - r.gb : r.gb - r.ga;
    out.push(mine > 0 ? "W" : mine < 0 ? "L" : "D");
  }
  return out.slice(-n).join("");
}

/** A team's current run from the form string, e.g. "WDLWW" is "W2", "" (no games) is "". */
export function streakOf(form) {
  if (!form) return "";
  const last = form[form.length - 1];
  let n = 0;
  for (let i = form.length - 1; i >= 0 && form[i] === last; i--) n++;
  return last + n;
}

/**
 * Season highlights from typed results: the biggest win, the highest-scoring match, the best attack and the
 * best defence (goals per game, teams with at least one game). Walkovers are left out of the match records
 * because their score is a rule, not a game. Returns null when no game has been played.
 */
export function seasonRecords(teams, results) {
  const games = results.filter((r) => !r.walkover);
  if (!games.length) return null;
  const biggest = games.reduce((m, r) => (Math.abs(r.ga - r.gb) > Math.abs(m.ga - m.gb) ? r : m));
  const highest = games.reduce((m, r) => (r.ga + r.gb > m.ga + m.gb ? r : m));
  const tally = teams.map(() => ({ gf: 0, ga: 0, n: 0 }));
  for (const r of results) {
    tally[r.a].gf += r.ga; tally[r.a].ga += r.gb; tally[r.a].n++;
    tally[r.b].gf += r.gb; tally[r.b].ga += r.ga; tally[r.b].n++;
  }
  const pick = (key, dir) => {
    let best = -1;
    tally.forEach((t, i) => {
      if (!t.n) return;
      if (best < 0 || dir * (t[key] / t.n - tally[best][key] / tally[best].n) < 0) best = i;
    });
    return best < 0 ? null : { team: teams[best], perGame: tally[best][key] / tally[best].n };
  };
  const line = (r) => `${teams[r.a]} ${r.ga}-${r.gb} ${teams[r.b]}`;
  return {
    biggestWin: biggest.ga === biggest.gb ? null : line(biggest),
    highestScoring: line(highest),
    bestAttack: pick("gf", -1),
    bestDefence: pick("ga", 1),
  };
}

/**
 * Results grid in table order: one row per team, one column per opponent, each cell the score from the row
 * team's side ("3-2"), several meetings joined with ", ", "" where the pair has not met and "·" on the diagonal.
 * `order` is a list of team indexes (default: entry order), e.g. the standings order.
 */
export function crossTable(teams, results, order = teams.map((_, i) => i)) {
  const cell = new Map();
  for (const r of results) {
    for (const [x, y, gx, gy] of [[r.a, r.b, r.ga, r.gb], [r.b, r.a, r.gb, r.ga]]) {
      const k = `${x}:${y}`;
      cell.set(k, [...(cell.get(k) ?? []), `${gx}-${gy}`]);
    }
  }
  return {
    heads: order.map((i) => teams[i]),
    rows: order.map((i) => ({ name: teams[i], cells: order.map((j) => (i === j ? "·" : (cell.get(`${i}:${j}`) ?? []).join(", "))) })),
  };
}

/**
 * Table points for one result, as [points to side a, points to side b]. A level score is a draw. With
 * `setScoring` (volleyball, FIVB style; scores are sets won) a one-set win such as 3-2 earns `win - 1`
 * and the loser 1, and a wider win the full `win` and `loss`. Every table, race, odds and weekly post
 * counts points through this, so they cannot disagree.
 */
export function matchPoints(ga, gb, { win = 3, draw = 1, loss = 0, setScoring = false } = {}) {
  if (ga === gb) return [draw, draw];
  const close = setScoring && Math.abs(ga - gb) === 1;
  const w = close ? win - 1 : win;
  const l = close ? 1 : loss;
  return ga > gb ? [w, l] : [l, w];
}

/**
 * Every point split one unplayed match can end in: win, draw, loss, and with `setScoring` the two
 * one-set wins too. A draw stays in under set scoring even though volleyball has none: a wider set of
 * outcomes only makes "clinched" and "eliminated" more cautious, never wrong.
 */
export function matchOutcomes({ win = 3, draw = 1, loss = 0, setScoring = false } = {}) {
  const out = [[win, loss], [draw, draw], [loss, win]];
  if (setScoring) out.push([win - 1, 1], [1, win - 1]);
  return out;
}

export function standings(teams, results, { win = 3, draw = 1, loss = 0, headToHead = false, adjustments = {}, setScoring = false } = {}) {
  const rows = teams.map((name, i) => ({ index: i, name, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 }));
  for (const r of results) {
    const A = rows[r.a];
    const B = rows[r.b];
    A.played++; B.played++;
    A.gf += r.ga; A.ga += r.gb; B.gf += r.gb; B.ga += r.ga;
    const [pa, pb] = matchPoints(r.ga, r.gb, { win, draw, loss, setScoring });
    A.points += pa; B.points += pb;
    if (r.ga > r.gb) { A.won++; B.lost++; }
    else if (r.ga < r.gb) { B.won++; A.lost++; }
    else { A.drawn++; B.drawn++; }
  }
  for (const r of rows) { r.form = formString(r.index, results, 5); r.streak = streakOf(formString(r.index, results, Infinity)); r.gd = r.gf - r.ga; r.adj = adjustments[r.index] ?? 0; r.points += r.adj; }
  if (headToHead) {
    // Mini-table of only the matches inside a tied group; a subset still level after it is split again by
    // the matches among just those teams (the UEFA/FIFA method), then the overall tiebreaks.
    for (const r of rows) r.h2hLevels = [];
    const resolve = (group) => {
      const set = new Set(group);
      const mini = new Map(group.map((i) => [i, { pts: 0, gf: 0, ga: 0 }]));
      for (const r of results) {
        if (!set.has(r.a) || !set.has(r.b)) continue;
        const A = mini.get(r.a);
        const B = mini.get(r.b);
        A.gf += r.ga; A.ga += r.gb; B.gf += r.gb; B.ga += r.ga;
        // the same points the main table gives, so a 3-2 volleyball win is not a full win here
        const [pa, pb] = matchPoints(r.ga, r.gb, { win, draw, loss, setScoring });
        A.pts += pa; B.pts += pb;
      }
      const parts = new Map();
      for (const i of group) {
        const m = mini.get(i);
        const lv = [m.pts, m.gf - m.ga, m.gf];
        rows[i].h2hLevels.push(lv);
        const k = lv.join("|");
        parts.set(k, [...(parts.get(k) ?? []), i]);
      }
      if (parts.size > 1) for (const sub of parts.values()) if (sub.length > 1) resolve(sub);
    };
    const level = new Map();
    for (const r of rows) level.set(r.points, [...(level.get(r.points) ?? []), r.index]);
    for (const group of level.values()) {
      if (group.length < 2) continue;
      resolve(group);
      for (const i of group) { const [p, d, f] = rows[i].h2hLevels[0]; rows[i].h2h = { points: p, gd: d, gf: f }; }
    }
  }
  const h2hCmp = (x, y) => {
    const lx = x.h2hLevels ?? [], ly = y.h2hLevels ?? [];
    for (let k = 0; k < Math.max(lx.length, ly.length); k++) {
      const p = lx[k] ?? [0, 0, 0], q = ly[k] ?? [0, 0, 0];
      const d = q[0] - p[0] || q[1] - p[1] || q[2] - p[2];
      if (d) return d;
    }
    return 0;
  };
  rows.sort((x, y) => y.points - x.points || h2hCmp(x, y)
    || y.gd - x.gd || y.gf - x.gf || x.index - y.index);
  for (const r of rows) { if (r.h2hLevels) Object.defineProperty(r, "h2hKey", { value: JSON.stringify(r.h2hLevels), enumerable: false }); delete r.h2hLevels; }
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

/**
 * Why each team sits above the next one, from `standings(...)` rows. One note per adjacent pair that is
 * level on points, naming the first tie-break that separated them (head to head when the table was built
 * with it, then goal difference, then goals for); pairs level on all of those are listed in entry order and
 * flagged `unresolved` so an organiser knows a coin toss or a play-off is still needed.
 * Returns [{ above, below, rank, by, unresolved, text }].
 */
export function tieBreakNotes(rows) {
  const out = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i], b = rows[i + 1];
    if (a.points !== b.points) continue;
    let by, detail;
    if (a.h2h && b.h2h && (a.h2h.points !== b.h2h.points || a.h2h.gd !== b.h2h.gd || a.h2h.gf !== b.h2h.gf)) {
      by = "head to head";
      detail = `${a.h2h.points} v ${b.h2h.points} points, goal difference ${a.h2h.gd} v ${b.h2h.gd}, goals ${a.h2h.gf} v ${b.h2h.gf} among the tied teams`;
    } else if (a.gd !== b.gd) { by = "goal difference"; detail = `${a.gd} v ${b.gd}`; }
    else if (a.gf !== b.gf) { by = "goals for"; detail = `${a.gf} v ${b.gf}`; }
    else if (a.h2h && b.h2h && a.h2hKey !== b.h2hKey) { by = "head to head"; detail = "a deeper head-to-head mini-table among the tied teams"; }
    else { by = "entry order"; detail = "level on every tie-break"; }
    const unresolved = by === "entry order";
    out.push({ above: a.name, below: b.name, rank: a.rank, by, unresolved, text: `${a.name} is above ${b.name} on ${by} (${detail}).${unresolved ? " Still level: decide it by a play-off or a draw." : ""}` });
  }
  return out;
}

// ---------------------------------------------------------------- playoff race

/** Most remaining fixtures worked through exhaustively (3^12 = 531,441 outcomes); beyond it, safe bounds. */
export const RACE_EXACT_LIMIT = 12;

/**
 * Who has clinched a play-off place and who is out, from the results so far and the fixtures still
 * to play. `remaining` is a list of [teamIndexA, teamIndexB] (`remainingFixtures` builds it from a
 * schedule and its results). Ranking here is by points only, and a tie on points is counted
 * against the team being tested, so "clinched" and "eliminated" are never wrong; goal difference
 * can only help a team the table calls "alive" or "tied".
 * Returns one row per team: { index, name, points, left, maxPoints, bestRank, worstRank,
 * status: "clinched" | "eliminated" | "alive", magic, clinchedUnlessTied }. `clinchedUnlessTied` is true for an
 * alive team that is in a place in every outcome where it does not finish level on points at the
 * cut, so only a lost tie-break (goal difference, head to head) can cost it. `magic` is how many more points guarantee a
 * place whatever the others do (null when out of reach or already clinched). `exact` says whether
 * every outcome was worked through or the safe bounds were used.
 */
export function playoffRace(teams, results, remaining, spots, { win = 3, draw = 1, loss = 0, setScoring = false, exactLimit = RACE_EXACT_LIMIT, adjustments = {} } = {}) {
  const n = teams.length;
  const k = Math.max(1, Math.min(spots, n));
  const scoring = { win, draw, loss, setScoring };
  const pts = Array.from({ length: n }, (_, i) => adjustments[i] ?? 0);
  for (const r of results) {
    const [pa, pb] = matchPoints(r.ga, r.gb, scoring);
    pts[r.a] += pa; pts[r.b] += pb;
  }
  const left = Array(n).fill(0);
  for (const [a, b] of remaining) { left[a]++; left[b]++; }
  const outcomes = matchOutcomes(scoring);
  const top = Math.max(...outcomes.flat());
  const low = Math.min(...outcomes.flat());
  const maxPts = pts.map((p, i) => p + left[i] * top);
  const minPts = pts.map((p, i) => p + left[i] * low);
  const best = Array(n).fill(n);
  const worst = Array(n).fill(1);
  const worstWon = Array(n).fill(1);
  // the same work budget as 3^exactLimit when a match has more than three outcomes (5 under set scoring)
  const exact = remaining.length <= Math.floor((exactLimit * Math.log(3)) / Math.log(outcomes.length) + 1e-9);
  const rankAll = (p) => {
    for (let i = 0; i < n; i++) {
      let above = 0;
      let level = 0;
      for (let j = 0; j < n; j++) { if (j === i) continue; if (p[j] > p[i]) above++; else if (p[j] === p[i]) level++; }
      if (above + 1 < best[i]) best[i] = above + 1;
      if (above + level + 1 > worst[i]) worst[i] = above + level + 1;
      if (above + 1 > worstWon[i]) worstWon[i] = above + 1;
    }
  };
  if (exact) {
    const cur = pts.slice();
    const walk = (f) => {
      if (f === remaining.length) { rankAll(cur); return; }
      const [a, b] = remaining[f];
      for (const [x, y] of outcomes) { cur[a] += x; cur[b] += y; walk(f + 1); cur[a] -= x; cur[b] -= y; }
    };
    walk(0);
  } else {
    for (let i = 0; i < n; i++) {
      let level = 0;
      let surelyAbove = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        if (maxPts[j] >= minPts[i]) level++;
        if (minPts[j] > maxPts[i]) surelyAbove++;
      }
      best[i] = surelyAbove + 1;
      worst[i] = level + 1;
      let over = 0;
      for (let j = 0; j < n; j++) if (j !== i && maxPts[j] > minPts[i]) over++;
      worstWon[i] = over + 1;
    }
  }
  const rows = teams.map((name, i) => {
    const status = worst[i] <= k ? "clinched" : best[i] > k ? "eliminated" : "alive";
    let magic = null;
    if (status === "alive") {
      // the smallest total of extra points that still clinches if every rival wins out
      for (let extra = 1; extra <= left[i] * top; extra++) {
        const mine = pts[i] + extra;
        let rivals = 0;
        for (let j = 0; j < n; j++) if (j !== i && maxPts[j] >= mine) rivals++;
        if (rivals + 1 <= k) { magic = extra; break; }
      }
    }
    // alive, but in the place whatever happens unless it finishes level on points and loses the tie-break
    const clinchedUnlessTied = status === "alive" && worstWon[i] <= k;
    return { index: i, name, points: pts[i], left: left[i], maxPoints: maxPts[i], bestRank: best[i], worstRank: worst[i], status, magic, clinchedUnlessTied };
  });
  rows.sort((x, y) => y.points - x.points || x.index - y.index);
  rows.exact = exact;
  return rows;
}

/** The fixtures in `schedule` that no entry in `results` has used up (each result clears one meeting of that pair). */
export function remainingFixtures(schedule, results) {
  const played = new Map();
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  for (const r of results) played.set(key(r.a, r.b), (played.get(key(r.a, r.b)) ?? 0) + 1);
  const left = [];
  for (const round of schedule.rounds) {
    for (const m of round.matches) {
      const kk = key(m.home, m.away);
      if (played.get(kk) > 0) played.set(kk, played.get(kk) - 1);
      else left.push([m.home, m.away]);
    }
  }
  return left;
}

/**
 * The weekly group-chat post: last round's scores, the table, and the next round's fixtures, as plain text.
 * Typed results are matched to the schedule pair by pair in round order (the way `remainingFixtures` does),
 * so a round counts as played once every one of its matches has a result. The "next round" is the first
 * round with a match still unplayed. Returns "" when there is nothing to post (no rounds).
 */
export function weeklyUpdate(schedule, results, { adjustments = {}, points = {}, headToHead = false, setScoring = false, maxRows = 8 } = {}) {
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const pool = new Map();
  for (const r of results) { const k = key(r.a, r.b); pool.set(k, [...(pool.get(k) ?? []), r]); }
  const rounds = schedule.rounds.map((round) => ({
    round,
    matches: round.matches.map((m) => {
      const found = pool.get(key(m.home, m.away))?.shift();
      return { m, score: found ? (found.a === m.home ? [found.ga, found.gb] : [found.gb, found.ga]) : null, walkover: !!found?.walkover };
    }),
  }));
  const next = rounds.findIndex((r) => r.matches.some((x) => !x.score));
  const lastDone = (next < 0 ? rounds.length : next) - 1;
  if (!rounds.length) return "";
  const out = [];
  if (lastDone >= 0) {
    const r = rounds[lastDone];
    out.push(`${r.round.label} results (${dayLabel(r.round.day)})`);
    for (const x of r.matches) out.push(`  ${x.m.homeName} ${x.score[0]} - ${x.score[1]} ${x.m.awayName}${x.walkover ? " (walkover)" : ""}`);
    if (r.round.bye !== null && r.round.bye !== undefined) out.push(`  Bye: ${schedule.teams[r.round.bye]}`);
    out.push("");
  }
  if (results.length) {
    const rows = standings(schedule.teams, results, { ...points, headToHead, setScoring, adjustments });
    out.push("Table");
    for (const r of rows.slice(0, maxRows)) out.push(`  ${r.rank}. ${r.name} - ${r.points} pts (${r.played} played, GD ${r.gd >= 0 ? "+" : ""}${r.gd})`);
    if (rows.length > maxRows) out.push(`  ...and ${rows.length - maxRows} more`);
    out.push("");
  }
  if (next >= 0) {
    const r = rounds[next];
    out.push(`Next up: ${r.round.label} - ${dayLabel(r.round.day)}`);
    for (const x of r.matches.filter((y) => !y.score)) out.push(`  ${x.m.time ? x.m.time + " " : ""}${x.m.court}: ${x.m.homeName} (home) vs ${x.m.awayName}`);
    if (r.round.bye !== null && r.round.bye !== undefined) out.push(`  Bye: ${schedule.teams[r.round.bye]}`);
  } else {
    out.push("That was the last round of the schedule.");
  }
  return out.join("\n").trim();
}

/**
 * Heads-ups about typed results that the schedule cannot account for: a pair entered more times than
 * they meet (a duplicated line, which counts twice in the table), or a pair that is not scheduled to
 * meet at all (a typo'd name, or a result from another pool). Returns an array of messages.
 */
export function resultsCheck(schedule, results) {
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const meets = new Map();
  for (const round of schedule.rounds) for (const m of round.matches) meets.set(key(m.home, m.away), (meets.get(key(m.home, m.away)) ?? 0) + 1);
  const seen = new Map();
  for (const r of results) seen.set(key(r.a, r.b), (seen.get(key(r.a, r.b)) ?? 0) + 1);
  const out = [];
  for (const [k, n] of seen) {
    const [a, b] = k.split("-").map(Number);
    const names = `${schedule.teams[a]} and ${schedule.teams[b]}`;
    const m = meets.get(k) ?? 0;
    if (m === 0) out.push(`${names} are not scheduled to meet, but a result is typed for them; it still counts in the table.`);
    else if (n > m) out.push(`${names} meet ${m === 1 ? "once" : m + " times"} in the schedule but ${n} results are typed; check for a duplicated line (every line counts in the table).`);
  }
  return out;
}

/**
 * Matches dated before `today` (days since 1970, as `toDay` gives) with no typed result: the games an
 * organiser still has to chase. A pair's typed results are matched to its meetings earliest first, so a
 * double round robin with one result typed reports only the second meeting. Returns
 * `[{ home, away, day }]` in date order; `schedule.teams` names them.
 */
export function overdueResults(schedule, results, today) {
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const typed = new Map();
  for (const r of results) typed.set(key(r.a, r.b), (typed.get(key(r.a, r.b)) ?? 0) + 1);
  const all = [];
  for (const round of schedule.rounds) for (const m of round.matches) all.push({ home: m.home, away: m.away, day: round.day });
  all.sort((x, y) => x.day - y.day);
  const out = [];
  for (const m of all) {
    const k = key(m.home, m.away);
    if (typed.get(k) > 0) typed.set(k, typed.get(k) - 1);
    else if (m.day < today) out.push(m);
  }
  return out;
}

/** Games each team still has to play, from `remainingFixtures`: an array indexed by team. */
export function gamesLeft(nTeams, remaining) {
  const left = new Array(nTeams).fill(0);
  for (const [a, b] of remaining) { left[a]++; left[b]++; }
  return left;
}

/**
 * Strength of the games still to play: for each team, the average points per game (from `rows`, the
 * `standings` table) of the opponents it has yet to meet, one entry per remaining fixture. Returns an
 * array indexed by team of `{ avg, games }`; `avg` is null when the team has no games left or nobody
 * has played yet. A guide to who has the easier run-in, not a forecast.
 */
export function scheduleStrength(rows, remaining) {
  const ppg = new Map(rows.map((r) => [r.index, r.played ? r.points / r.played : null]));
  const out = Array.from({ length: rows.length }, () => ({ sum: 0, n: 0, games: 0 }));
  const take = (i, j) => { out[i].games++; const v = ppg.get(j); if (v != null) { out[i].sum += v; out[i].n++; } };
  for (const [a, b] of remaining) { take(a, b); take(b, a); }
  return out.map((o) => ({ avg: o.n ? o.sum / o.n : null, games: o.games }));
}

/** One plain sentence per team that has a decided or live position. */
/**
 * Chance of finishing in the top `spots`, by playing the remaining fixtures out many times. Each
 * team's strength is its smoothed share of the available results so far (a win counts 1, a draw
 * half, plus one imaginary draw-less game each way so nobody is 0 or 1), a game's win chances come
 * from the log5 rule on the two strengths, and the draw chance is the league's own draw rate so
 * far (smoothed toward one in five). Ranked on points; a tie at the cut is split by a coin flip, so
 * the figure is an estimate and not a promise. Seeded, so the same table gives the same numbers.
 * Returns [{ index, name, points, chance, expected }] where `chance` is 0..1. With no games
 * left the chances are exactly 1 or 0 and a team the race table calls clinched is always 1; one it calls out can
 * still show a small chance, because the race table counts a tie at the cut against the team and
 * here it is a coin flip.
 */
export function playoffOdds(teams, results, remaining, spots, { win = 3, draw = 1, loss = 0, setScoring = false, adjustments = {}, runs = 4000, seed = 1 } = {}) {
  const n = teams.length;
  const k = Math.max(1, Math.min(spots, n));
  const base = Array.from({ length: n }, (_, i) => adjustments[i] ?? 0);
  const score = Array(n).fill(1);
  const played = Array(n).fill(2);
  let draws = 0;
  let close = 0;
  for (const r of results) {
    const [pa, pb] = matchPoints(r.ga, r.gb, { win, draw, loss, setScoring });
    base[r.a] += pa; base[r.b] += pb;
    if (r.ga > r.gb) score[r.a] += 1;
    else if (r.ga < r.gb) score[r.b] += 1;
    else { score[r.a] += 0.5; score[r.b] += 0.5; draws++; }
    if (Math.abs(r.ga - r.gb) === 1) close++;
    played[r.a]++; played[r.b]++;
  }
  // Under set scoring a simulated win is a one-set win (win - 1 and 1) as often as the typed ones were.
  const pClose = setScoring ? (close + 1) / (results.length - draws + 2) : 0;
  const [cw, cl] = matchPoints(1, 0, { win, draw, loss, setScoring });
  const strength = score.map((x, i) => x / played[i]);
  const pDraw = (draws + 1) / (results.length + 5);
  const odds = remaining.map(([a, b]) => {
    const sa = strength[a];
    const sb = strength[b];
    const pa = (sa * (1 - sb)) / (sa * (1 - sb) + sb * (1 - sa));
    return { a, b, winA: (1 - pDraw) * pa, drawEnd: (1 - pDraw) * pa + pDraw };
  });
  const rand = mulberry32(seed);
  const hits = Array(n).fill(0);
  const total = Array(n).fill(0);
  const pts = Array(n);
  const order = Array.from({ length: n }, (_, i) => i);
  const tie = Array(n);
  for (let run = 0; run < runs; run++) {
    for (let i = 0; i < n; i++) pts[i] = base[i];
    for (const m of odds) {
      const u = rand();
      if (u >= m.winA && u < m.drawEnd) { pts[m.a] += draw; pts[m.b] += draw; continue; }
      const [w, l] = u < m.winA ? [m.a, m.b] : [m.b, m.a];
      if (setScoring && rand() < pClose) { pts[w] += cw; pts[l] += cl; }
      else { pts[w] += win; pts[l] += loss; }
    }
    for (let i = 0; i < n; i++) { tie[i] = rand(); total[i] += pts[i]; }
    order.sort((x, y) => pts[y] - pts[x] || tie[y] - tie[x]);
    for (let r = 0; r < k; r++) hits[order[r]]++;
  }
  return teams.map((name, i) => ({ index: i, name, points: base[i], chance: hits[i] / runs, expected: total[i] / runs }));
}

export function raceText(rows, spots) {
  const lines = [];
  for (const r of rows) {
    if (r.status === "clinched") lines.push(`${r.name}: clinched a top-${spots} place.`);
    else if (r.status === "eliminated") lines.push(`${r.name}: out of the top ${spots} (best case ${r.maxPoints} pts).`);
    else lines.push(`${r.name}: alive${r.magic != null ? `, ${r.magic} more point${r.magic === 1 ? "" : "s"} clinch it` : ""}${r.left ? ` (${r.left} to play)` : ""}${r.clinchedUnlessTied ? "; in a place unless level on points at the cut and behind on the tie-break" : ""}.`);
  }
  return lines.join("\n");
}
