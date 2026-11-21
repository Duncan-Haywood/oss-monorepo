// Box league: the state behind box-league.html.
//
// Squash, badminton, tennis, table tennis and racketball clubs run "box leagues": the members are
// ranked, split into small boxes (groups of 4 to 6), and each box plays a round robin over a few
// weeks that the players arrange themselves. When the round closes, the top of each box goes up a
// box and the bottom goes down, and the next round starts. The arithmetic is simple but fiddly for
// a volunteer: box sizes that do not divide evenly, tie-breaks on the promotion line, walkovers,
// players who never played, people joining and leaving between rounds. This module is that
// bookkeeping, kept as plain JSON so the page can store it in localStorage and put a read-only copy
// in a link.
//
// Nothing here touches the DOM, storage or the network.

import { parseTeams, csvCell } from "./calc.mjs";

export const MAX_PLAYERS = 200;
export const MIN_BOX = 3;
export const MAX_BOX = 8;
export const MAX_GAMES = 99;
export const SCORINGS = ["games", "points"];

const clampInt = (v, lo, hi, dflt) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const isoDay = /^\d{4}-\d{2}-\d{2}$/;

/** Player names from a pasted list in ranked order (one per line or comma-separated), duplicates refused. */
export function parsePlayersList(text) {
  const { teams, errors: dup } = parseTeams(text);
  const errors = dup.filter((e) => /listed twice/.test(e)).map((e) => e.replace("listed twice.", "listed twice; add an initial to tell them apart."));
  const players = teams.map((t) => t.slice(0, 80));
  if (players.length < MIN_BOX) errors.push(`A box league needs at least ${MIN_BOX} players.`);
  if (players.length > MAX_PLAYERS) errors.push(`Up to ${MAX_PLAYERS} players.`);
  return { players, errors };
}

/**
 * Box sizes for n ranked players with a target size. The number of boxes is the fewest that keeps
 * every box at or under the target; sizes then differ by at most one, with the larger boxes at the
 * top. With fewer than MIN_BOX players left over this never makes a box below MIN_BOX (unless the
 * whole league is smaller than that).
 */
export function boxSizes(n, size) {
  size = clampInt(size, MIN_BOX, MAX_BOX, 5);
  if (n <= 0) return [];
  let boxes = Math.ceil(n / size);
  while (boxes > 1 && Math.floor(n / boxes) < MIN_BOX) boxes--;
  const base = Math.floor(n / boxes), extra = n % boxes;
  return Array.from({ length: boxes }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Split a ranked list into boxes (top players in box 1). */
export function splitIntoBoxes(players, size) {
  const sizes = boxSizes(players.length, size);
  const out = [];
  let at = 0;
  for (const s of sizes) { out.push(players.slice(at, at + s)); at += s; }
  return out;
}

/** Add `days` to an ISO date (UTC arithmetic, no time zone drift). */
export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Start a league. Scoring: "games" (e.g. squash or badminton, best of 5 or 3: type games won) or
 * "points" (a single game or a pro set: type the two scores). Points table: win, loss (played), and
 * an optional bonus per game won; a walkover gives the winner `win` and the other `woLoss`.
 * up / down: how many players move at each box boundary. weeks: length of a round.
 */
export function newLeague({ players, size = 5, up = 1, down = null, scoring = "games", bestOf = 5, win = 3, loss = 1, perGame = 0, woLoss = 0, weeks = 4, start = null, name = "" } = {}) {
  if (!Array.isArray(players) || players.length < MIN_BOX) throw new Error(`A box league needs at least ${MIN_BOX} players.`);
  if (players.length > MAX_PLAYERS) throw new Error(`Up to ${MAX_PLAYERS} players.`);
  if (new Set(players.map((p) => p.toLowerCase())).size !== players.length) throw new Error("Every player once.");
  size = clampInt(size, MIN_BOX, MAX_BOX, 5);
  up = clampInt(up, 0, 3, 1);
  down = down == null || down === "" ? up : clampInt(down, 0, 3, up);
  if (!SCORINGS.includes(scoring)) scoring = "games";
  bestOf = scoring === "games" ? [1, 3, 5, 7].includes(Number(bestOf)) ? Number(bestOf) : 5 : 0;
  const rules = {
    size, up, down, scoring, bestOf,
    win: clampInt(win, 0, 99, 3), loss: clampInt(loss, 0, 99, 1), perGame: clampInt(perGame, 0, 9, 0), woLoss: clampInt(woLoss, 0, 99, 0),
    weeks: clampInt(weeks, 1, 26, 4),
  };
  const first = start && isoDay.test(start) ? start : null;
  return {
    v: 1, name: String(name || "").slice(0, 80), rules,
    rounds: [{ start: first, end: first ? addDays(first, rules.weeks * 7 - 1) : null, boxes: splitIntoBoxes(players.slice(), size), results: {} }],
  };
}

/** Every pair in a box, in round-robin order (circle method) so the list reads as "week by week" if wanted. */
export function boxFixtures(box) {
  const n = box.length;
  const ids = box.map((_, i) => i);
  if (n % 2) ids.push(-1);
  const m = ids.length, out = [];
  for (let r = 0; r < m - 1; r++) {
    for (let i = 0; i < m / 2; i++) {
      const a = ids[i], b = ids[m - 1 - i];
      if (a >= 0 && b >= 0) out.push([box[Math.min(a, b)], box[Math.max(a, b)]]);
    }
    ids.splice(1, 0, ids.pop());
  }
  return out;
}

/** Where a player sits in a round: [box index, place in box] or null. */
export function findPlayer(round, name) {
  for (const [b, box] of round.boxes.entries()) { const i = box.indexOf(name); if (i >= 0) return [b, i]; }
  return null;
}

/**
 * Check a score against the rules. Returns an error string or "".
 * games scoring: the winner has ceil(bestOf/2) games and the loser fewer (a retirement can be typed as
 * a walkover instead). points scoring: any two different non-negative scores.
 */
export function scoreProblem(rules, a, b) {
  if (![a, b].every((x) => Number.isInteger(x) && x >= 0 && x <= (rules.scoring === "games" ? MAX_GAMES : 999))) return "Scores are whole numbers.";
  if (a === b) return "A box match needs a winner.";
  if (rules.scoring === "games") {
    const need = Math.ceil(rules.bestOf / 2);
    if (Math.max(a, b) !== need || Math.min(a, b) >= need) return `Best of ${rules.bestOf}: the winner has ${need} game${need > 1 ? "s" : ""}.`;
  }
  return "";
}

/** Record a result in round r: scores (a, b) for players pa and pb, or { wo: winner } for a walkover, or null to clear. */
export function setResult(league, r, pa, pb, result) {
  const round = league.rounds[r];
  if (!round) return { error: "No such round." };
  const fa = findPlayer(round, pa), fb = findPlayer(round, pb);
  if (!fa || !fb || fa[0] !== fb[0] || pa === pb) return { error: `${pa} and ${pb} are not in the same box this round.` };
  const k = key(pa, pb);
  const next = structuredClone(league);
  const results = next.rounds[r].results;
  if (result == null) { delete results[k]; return { league: next }; }
  if (result.wo != null) {
    if (result.wo !== pa && result.wo !== pb) return { error: "A walkover names the player who wins it." };
    results[k] = { wo: result.wo };
    return { league: next };
  }
  const [a, b] = result;
  const p = scoreProblem(league.rules, a, b);
  if (p) return { error: p };
  results[k] = pa < pb ? [a, b] : [b, a];
  return { league: next };
}

/** The result between pa and pb, oriented to pa first: [a, b], { wo }, or null. */
export function getResult(round, pa, pb) {
  const v = round.results[key(pa, pb)];
  if (v == null) return null;
  if (!Array.isArray(v)) return { wo: v.wo };
  return pa < pb ? v.slice() : [v[1], v[0]];
}

/**
 * Results pasted as text, one per line: "Ana 3-1 Ben", "Ana beat Ben 3-1", "Ana w/o Ben" (Ana wins a
 * walkover) or "Ana walkover Ben". Names must match players in the round (case-insensitive).
 */
export function parseResults(league, r, text) {
  const round = league.rounds[r];
  const names = round.boxes.flat();
  const byLower = new Map(names.map((n) => [n.toLowerCase(), n]));
  const sorted = names.slice().sort((x, y) => y.length - x.length);
  const errors = [];
  let out = league;
  let count = 0;
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const at = `Line ${i + 1}`;
    let m = line.match(/^(.+?)\s+(?:w\/o|wo|walkover|walked over)\s+(.+)$/i);
    let pa, pb, result;
    if (m) {
      pa = byLower.get(m[1].trim().toLowerCase()); pb = byLower.get(m[2].trim().toLowerCase());
      result = pa ? { wo: pa } : null;
    } else if ((m = line.match(/^(.+?)\s+(?:beat|bt|def\.?|defeated)\s+(.+?)\s+(\d+)\s*[-–:]\s*(\d+)$/i))) {
      pa = byLower.get(m[1].trim().toLowerCase()); pb = byLower.get(m[2].trim().toLowerCase());
      const x = Number(m[3]), y = Number(m[4]);
      result = [Math.max(x, y), Math.min(x, y)];
    } else if ((m = line.match(/^(.+?)\s+(\d+)\s*[-–:]\s*(\d+)\s+(.+)$/))) {
      pa = byLower.get(m[1].trim().toLowerCase()); pb = byLower.get(m[4].trim().toLowerCase());
      result = [Number(m[2]), Number(m[3])];
    } else {
      // A name may itself contain spaces; fall back to the longest-name match at the start and end.
      errors.push(`${at}: write "Ana 3-1 Ben", "Ana beat Ben 3-1" or "Ana w/o Ben".`);
      continue;
    }
    if (!pa || !pb) {
      const unknown = [m[1], m[m.length - 1]].map((s) => s.trim()).filter((s) => !byLower.has(s.toLowerCase()));
      const hint = unknown.length ? sorted.find((n) => unknown[0].toLowerCase().startsWith(n.toLowerCase().split(" ")[0])) : null;
      errors.push(`${at}: no player called "${unknown[0] ?? line}" this round${hint ? ` (did you mean ${hint}?)` : ""}.`);
      continue;
    }
    const res = setResult(out, r, pa, pb, result);
    if (res.error) { errors.push(`${at}: ${res.error}`); continue; }
    out = res.league; count++;
  }
  return { league: out, count, errors };
}

/**
 * Standings for one box: points, then the head-to-head result between exactly two level players,
 * then game (or point) difference, then games won, then the seeded order in the box.
 */
export function boxStandings(league, r, b) {
  const { rules } = league;
  const round = league.rounds[r];
  const box = round.boxes[b];
  const rows = box.map((p, seed) => ({ player: p, seed, played: 0, won: 0, lost: 0, wo: 0, gf: 0, ga: 0, pts: 0, unplayed: 0 }));
  const row = new Map(rows.map((x) => [x.player, x]));
  for (const [pa, pb] of boxFixtures(box)) {
    const res = getResult(round, pa, pb);
    const A = row.get(pa), B = row.get(pb);
    if (!res) { A.unplayed++; B.unplayed++; continue; }
    if (!Array.isArray(res)) {
      const [W, L] = res.wo === pa ? [A, B] : [B, A];
      W.won++; W.pts += rules.win; W.wo++;
      L.lost++; L.pts += rules.woLoss; L.wo++;
      continue;
    }
    const [a, b2] = res;
    A.played++; B.played++;
    A.gf += a; A.ga += b2; B.gf += b2; B.ga += a;
    const [W, L] = a > b2 ? [A, B] : [B, A];
    W.won++; L.lost++;
    W.pts += rules.win; L.pts += rules.loss;
    if (rules.perGame) { A.pts += rules.perGame * a; B.pts += rules.perGame * b2; }
  }
  const h2h = (x, y) => {
    const res = getResult(round, x.player, y.player);
    if (!res) return 0;
    if (!Array.isArray(res)) return res.wo === x.player ? -1 : 1;
    return res[0] > res[1] ? -1 : 1;
  };
  const cmp = (x, y) => y.pts - x.pts;
  const level = (x, y) => cmp(x, y) === 0;
  rows.sort((x, y) => cmp(x, y) || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.seed - y.seed);
  // Head-to-head decides between exactly two players level on points.
  for (let i = 0; i < rows.length; i++) {
    let j = i;
    while (j + 1 < rows.length && level(rows[i], rows[j + 1])) j++;
    if (j === i + 1 && h2h(rows[i], rows[j]) > 0) [rows[i], rows[j]] = [rows[j], rows[i]];
    for (let k = i; k <= j; k++) { rows[k].tiedOnPoints = j > i; rows[k].tieSize = j - i + 1; }
    i = j;
  }
  rows.forEach((x, i) => { x.place = i + 1; });
  const total = boxFixtures(box).length;
  const done = Object.keys(round.results).filter((k) => { const [x, y] = k.split("|"); return box.includes(x) && box.includes(y); }).length;
  return { box: b, rows, done, total };
}

/** Matches done and total across the round. */
export function roundProgress(league, r) {
  let done = 0, total = 0;
  for (let b = 0; b < league.rounds[r].boxes.length; b++) { const s = boxStandings(league, r, b); done += s.done; total += s.total; }
  return { done, total };
}

/**
 * Close round r and work out the next round's boxes. Options:
 *   leaving: names who leave (dropped before the move);
 *   joining: lines "Name" (bottom box) or "Name: 2" (into box 2, at its foot);
 *   inactive: "down" (a player with no match played or won, walkovers aside, goes down like a
 *     relegated player, the default), or "stay".
 * The top `up` of each box go up one box and the bottom `down` go down one; within each new box
 * the order is: those coming down, those staying, those coming up. The new ranked list is then
 * re-split into boxes of the target size, so a league that gains or loses players keeps even boxes.
 * Returns { boxes, moves: [{ player, from, to, why }], warnings, text }.
 */
export function nextBoxes(league, r, { leaving = [], joining = "", inactive = "down" } = {}) {
  const { rules } = league;
  const round = league.rounds[r];
  const nBoxes = round.boxes.length;
  const warnings = [];
  const leave = new Set(leaving.map((s) => s.toLowerCase()));
  const tables = round.boxes.map((_, b) => boxStandings(league, r, b));
  const goingUp = tables.map(() => []), goingDown = tables.map(() => []), noShows = tables.map(() => []), staying = tables.map(() => []);
  const moves = [];
  for (const [b, t] of tables.entries()) {
    const rows = t.rows.filter((x) => !leave.has(x.player.toLowerCase()));
    const n = rows.length;
    const up = b > 0 ? Math.min(rules.up, n) : 0;
    const downCount = b < nBoxes - 1 ? Math.min(rules.down, n - up) : 0;
    const isInactive = (x) => inactive === "down" && x.played === 0 && x.won === 0 && t.total > 0;
    const ups = rows.slice(0, up).filter((x) => !isInactive(x));
    const lowest = rows.slice(n - downCount);
    for (const x of rows) {
      if (ups.includes(x)) { goingUp[b].push(x.player); moves.push({ player: x.player, from: b + 1, to: b, why: `place ${x.place} of ${t.rows.length}, up` }); }
      else if (isInactive(x) && b < nBoxes - 1) { noShows[b].push(x.player); moves.push({ player: x.player, from: b + 1, to: b + 2, why: lowest.includes(x) ? `place ${x.place} of ${t.rows.length}, no match played, down` : "no match played, down" }); }
      else if (lowest.includes(x)) { goingDown[b].push(x.player); moves.push({ player: x.player, from: b + 1, to: b + 2, why: `place ${x.place} of ${t.rows.length}, down${isInactive(x) ? ", no match played" : ""}` }); }
      else staying[b].push(x.player);
    }
    // A tie on points across a movement line, decided only by game difference or seeding: say so.
    for (const line of [up, n - downCount]) {
      if (line <= 0 || line >= n) continue;
      const above = rows[line - 1], below = rows[line];
      if (above.pts === below.pts && above.tiedOnPoints) warnings.push(`Box ${b + 1}: ${above.player} and ${below.player} are level on ${above.pts} points across a movement line; decided on ${above.tieSize === 2 && getResult(round, above.player, below.player) ? "their head-to-head result" : above.gf - above.ga !== below.gf - below.ga ? "game difference" : above.gf !== below.gf ? "games won" : "seeding (the order they started the box in)"}.`);
    }
    if (t.done < t.total) warnings.push(`Box ${b + 1}: ${t.total - t.done} of ${t.total} matches not played; standings use what was played.`);
  }
  // Each no-show who drops leaves a place: the next best player of the box below goes up to fill it.
  for (let b = 0; b < nBoxes - 1; b++) {
    const t = tables[b + 1];
    for (let k = 0; k < noShows[b].length && staying[b + 1].length; k++) {
      const p = staying[b + 1].shift();
      goingUp[b + 1].push(p);
      moves.push({ player: p, from: b + 2, to: b + 1, why: `place ${t.rows.find((x) => x.player === p).place} of ${t.rows.length}, up to fill a no-show's place` });
    }
  }
  const pre = [];
  // Players who played nothing rank below everyone else in the box they drop to, so the re-split
  // fills the gap they leave with the next best of the box below rather than pulling them back up.
  for (let b = 0; b < nBoxes; b++) pre.push([...(b > 0 ? goingDown[b - 1] : []), ...staying[b], ...(b < nBoxes - 1 ? goingUp[b + 1] : []), ...(b > 0 ? noShows[b - 1] : [])]);
  const inRound = new Map(round.boxes.flat().map((p) => [p.toLowerCase(), p]));
  for (const l of leaving) if (!inRound.has(l.toLowerCase())) warnings.push(`"${l}" is leaving but was not in this round.`);
  // Joiners: "Name" goes to the foot of the bottom box, "Name: 2" to the foot of box 2 (before the re-split).
  const errors = [];
  const taken = new Set(pre.flat().map((p) => p.toLowerCase()));
  for (const raw of String(joining ?? "").split(/\r?\n|,/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.+?)\s*:\s*(?:box\s*)?(\d+)\s*$/i);
    const nm = (m ? m[1] : line).trim().slice(0, 80);
    if (taken.has(nm.toLowerCase())) { errors.push(`"${nm}" is already in the league.`); continue; }
    taken.add(nm.toLowerCase());
    const bi = m ? Math.min(clampInt(m[2], 1, 99, nBoxes), nBoxes) - 1 : nBoxes - 1;
    pre[bi].push(nm);
    moves.push({ player: nm, from: null, to: null, why: m ? `joins at the foot of box ${bi + 1}` : "joins the bottom box" });
  }
  const order = pre.flat();
  if (order.length < MIN_BOX) errors.push(`A box league needs at least ${MIN_BOX} players.`);
  const boxes = splitIntoBoxes(order, rules.size);
  // Final box for each move, from the re-split.
  for (const mv of moves) { const f = boxes.findIndex((bx) => bx.includes(mv.player)); mv.to = f + 1; }
  for (const l of leaving) {
    const p = inRound.get(l.toLowerCase());
    if (p) moves.push({ player: p, from: findPlayer(round, p)[0] + 1, to: null, why: "leaves" });
  }
  // A re-split can carry a staying player across a boundary when the league grows or shrinks.
  for (const [b, bx] of boxes.entries()) for (const p of bx) {
    if (moves.some((m) => m.player === p)) continue;
    const was = findPlayer(round, p);
    if (was && was[0] !== b) moves.push({ player: p, from: was[0] + 1, to: b + 1, why: "moved to keep the boxes even" });
  }
  const text = moves.length ? moves.map((m) => m.to == null ? `${m.player}: leaves (was box ${m.from})` : m.from == null ? `${m.player}: new, box ${m.to}` : m.from === m.to ? `${m.player}: stays in box ${m.to} (${m.why}, but kept to keep the boxes even)` : `${m.player}: box ${m.from} -> box ${m.to} (${m.why})`).join("\n") : "No moves.";
  return { boxes, moves, warnings, errors, text };
}

/** Close round r and append the next round. Returns { league, moves, warnings, errors }. */
export function advance(league, r, opts = {}) {
  if (r !== league.rounds.length - 1) return { errors: ["Only the latest round can be closed."] };
  const nb = nextBoxes(league, r, opts);
  if (nb.errors.length) return { errors: nb.errors, warnings: nb.warnings };
  const next = structuredClone(league);
  const prev = next.rounds[r];
  prev.closed = true;
  prev.moves = nb.moves;
  const start = prev.end ? addDays(prev.end, 1) : null;
  next.rounds.push({ start, end: start ? addDays(start, next.rules.weeks * 7 - 1) : null, boxes: nb.boxes, results: {} });
  return { league: next, moves: nb.moves, warnings: nb.warnings, errors: [] };
}

/** Group-chat text for a round: each box, its players and its fixtures (with results where typed). */
export function roundText(league, r, { results = true } = {}) {
  const round = league.rounds[r];
  const lines = [];
  lines.push(`${league.name ? `${league.name}: ` : ""}Round ${r + 1}${round.start ? ` (${round.start} to ${round.end})` : ""}`);
  for (const [b, box] of round.boxes.entries()) {
    lines.push("", `Box ${b + 1}: ${box.join(", ")}`);
    for (const [pa, pb] of boxFixtures(box)) {
      const res = results ? getResult(round, pa, pb) : null;
      lines.push(res == null ? `  ${pa} v ${pb}` : Array.isArray(res) ? `  ${pa} ${res[0]}-${res[1]} ${pb}` : `  ${res.wo} wins by walkover (${pa} v ${pb})`);
    }
  }
  return lines.join("\n");
}

/** Standings text for a round, every box. */
export function standingsText(league, r) {
  const unit = league.rules.scoring === "games" ? "games" : "points";
  const lines = [`${league.name ? `${league.name}: ` : ""}Round ${r + 1} standings`];
  for (let b = 0; b < league.rounds[r].boxes.length; b++) {
    const t = boxStandings(league, r, b);
    lines.push("", `Box ${b + 1} (${t.done} of ${t.total} played)`);
    for (const x of t.rows) lines.push(`  ${x.place}. ${x.player}  ${x.pts} pts  W${x.won} L${x.lost}  ${unit} ${x.gf}-${x.ga}`);
  }
  return lines.join("\n");
}


/** CSV of every result in every round. Cells go through calc.mjs csvCell, which defuses CSV formula injection. */
export function leagueCsv(league) {
  const rows = [["round", "box", "player_a", "player_b", "score_a", "score_b", "walkover_winner"]];
  for (const [r, round] of league.rounds.entries()) for (const [b, box] of round.boxes.entries()) for (const [pa, pb] of boxFixtures(box)) {
    const res = getResult(round, pa, pb);
    rows.push([r + 1, b + 1, pa, pb, Array.isArray(res) ? res[0] : "", Array.isArray(res) ? res[1] : "", res && !Array.isArray(res) ? res.wo : ""]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

/** Problems with a stored or linked league (empty when it is sound). */
export function checkLeague(league) {
  const p = [];
  if (!league || typeof league !== "object" || league.v !== 1) return ["Not a box league."];
  const R = league.rules;
  if (!R || !SCORINGS.includes(R.scoring) || !(R.size >= MIN_BOX && R.size <= MAX_BOX)) p.push("Rules are damaged.");
  if (!Array.isArray(league.rounds) || league.rounds.length < 1) return [...p, "No rounds."];
  for (const [r, round] of league.rounds.entries()) {
    if (!Array.isArray(round.boxes) || !round.boxes.every((b) => Array.isArray(b) && b.every((x) => typeof x === "string"))) { p.push(`Round ${r + 1}: boxes are damaged.`); continue; }
    const all = round.boxes.flat();
    if (new Set(all).size !== all.length) p.push(`Round ${r + 1}: a player is in two boxes.`);
    if (all.length > MAX_PLAYERS) p.push(`Round ${r + 1}: too many players.`);
    for (const [k, v] of Object.entries(round.results || {})) {
      const [a, b] = k.split("|");
      const fa = findPlayer(round, a), fb = findPlayer(round, b);
      if (!fa || !fb || fa[0] !== fb[0] || !(a < b)) { p.push(`Round ${r + 1}: result ${k} is not a pair in one box.`); continue; }
      if (Array.isArray(v)) { const e = R && scoreProblem(R, v[0], v[1]); if (e) p.push(`Round ${r + 1}: ${a} v ${b}: ${e}`); }
      else if (!v || (v.wo !== a && v.wo !== b)) p.push(`Round ${r + 1}: ${a} v ${b}: walkover is damaged.`);
    }
  }
  return p;
}

export function encodeLeague(league) {
  const bytes = new TextEncoder().encode(JSON.stringify(league));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeLeague(text) {
  try {
    const b64 = String(text).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const league = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    const problems = checkLeague(league);
    return problems.length ? { error: problems[0] } : { league };
  } catch {
    return { error: "This link is damaged or cut short." };
  }
}
