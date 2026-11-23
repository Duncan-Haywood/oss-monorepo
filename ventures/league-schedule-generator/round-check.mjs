// Check a round an arbiter already paired: re-pair it from the rounds before it (FIDE Dutch, swiss.mjs)
// and compare board by board. When the two differ, look for the one earlier result that, read
// differently, gives the arbiter's round exactly: a result entered late or corrected after the round
// was paired leaves exactly this mark (the file is right now, the pairing was right on the scores the
// arbiter had then, and only a replay looks wrong). Found on Graz 2026 round 4, where one game entered
// as a draw at pairing time and as a win later explains all 137 boards (README "A result entered after
// the round was paired").
//
// Pure functions over a parsed TRF (trf.mjs parseTrf); no DOM, so the page, a worker and the eval
// scripts share them.
import { trfToResults, trfInitialColour } from "./trf.mjs";
import { parseSwissResults, swissPairings } from "./calc.mjs";
import { swissStandings } from "./swiss.mjs";

/**
 * Pair round k (1-based) of a parsed TRF, using only rounds before k; `absentIds` (TRF start ranks)
 * sit out round k. A requested bye already entered for round k (F, H or Z with no opponent) stays.
 * Returns { boards: [[whiteId, blackId]], bye, method, scores? } with TRF start ranks.
 */
export function replayRound(trf, k, absentIds = [], opts = {}) {
  const absent = new Set(absentIds);
  const t = {
    ...trf,
    players: trf.players.map((p) => {
      const rounds = p.rounds.slice(0, k - 1).map((b) => (b ? { ...b } : null));
      while (rounds.length < k - 1) rounds.push(null);
      if (absent.has(p.id)) rounds[k - 1] = { opponent: null, colour: null, result: "Z" };
      else if (p.rounds[k - 1] && p.rounds[k - 1].opponent == null && /[FHZ]/.test(p.rounds[k - 1].result)) rounds[k - 1] = { ...p.rounds[k - 1] };
      while (rounds.length && rounds[rounds.length - 1] === null) rounds.pop();
      return { ...p, rounds };
    }),
  };
  const box = trfToResults(t);
  if (box.errors.length) throw new Error(box.errors.join("; "));
  const p = parseSwissResults(box.results, box.players);
  if (p.errors.length) throw new Error(p.errors.slice(0, 3).join("; "));
  const { withScores, ...pairOpts } = opts;
  // The initial colour from the file's XXC line, else from round 1 as played (only when re-pairing a
  // later round: read for round 1 itself it would be the answer); White when neither says.
  const initialColour = (trf.initialColour ?? (k > 1 ? trfInitialColour(trf) : null)) ?? "W";
  const round = swissPairings(box.players, p.games, p.byes, p.withdrawn, { ...p, groupOrder: "seed", initialColour, ...pairOpts });
  const id = (i) => trf.players[i].id;
  const out = { boards: round.pairs.map((b) => [id(b.white), id(b.black)]), bye: round.bye == null ? null : id(round.bye), method: round.method };
  if (withScores) {
    const table = swissStandings(box.players, p.games, p.byes, { extra: p.extra ?? null });
    out.scores = new Map(table.map((r) => [id(r.index), r.score]));
  }
  return out;
}

/** The boards round k of a TRF records: [[whiteId, blackId]], the pairing-allocated bye, and who sat out. */
export function recordedRound(trf, k) {
  const boards = [];
  let bye = null;
  const absent = [];
  for (const p of trf.players) {
    const b = p.rounds[k - 1];
    if (b && b.opponent != null) {
      const q = trf.players[b.opponent];
      // Each game once, white first (a colourless forfeit keeps the lower start rank first).
      if (b.colour === "W" || (b.colour !== "B" && p.id < q.id)) boards.push([p.id, q.id]);
    } else if (b && b.result === "U") bye = p.id;
    else if (!b || !/[FHZ]/.test(b.result)) absent.push(p.id);
  }
  boards.sort((x, y) => Math.min(...x) - Math.min(...y));
  return { boards, bye, absent };
}

const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const FLIP = { 1: ["=", "0"], "=": ["1", "0"], 0: ["1", "="], W: ["D", "L"], D: ["W", "L"], L: ["W", "D"] };
const MIRROR = { 1: "0", 0: "1", "=": "=", W: "L", L: "W", D: "D" };
const SHOW = { 1: "1-0", 0: "0-1", "=": "½-½", W: "1-0", L: "0-1", D: "½-½" };
const flips = (r) => (Object.hasOwn(FLIP, r) ? FLIP[r] : null);
const show = (r) => (Object.hasOwn(SHOW, r) ? SHOW[r] : r);

/** A copy of the TRF with one game's result changed (round r, 1-based; `res` is white's new result). */
export function withResult(trf, r, whiteId, blackId, res) {
  return {
    ...trf,
    players: trf.players.map((x) => {
      if (x.id !== whiteId && x.id !== blackId) return x;
      return { ...x, rounds: x.rounds.map((b, i) => (i === r - 1 ? { ...b, result: x.id === whiteId ? res : MIRROR[res] } : b)) };
    }),
  };
}

/**
 * Check round k of a parsed TRF against a Dutch re-pairing of it. Returns
 * { round, total, matched, sameColours, byeMatches, missed: [{ ours, theirs }], firstMiss, explanations,
 *   tried, error? }. `matched` counts recorded boards the re-pairing also makes (either colour);
 * `firstMiss` is the highest score with a differing board. With `explain` (default true) and a miss,
 * single earlier results are changed one at a time, only on games touching a player within `radius`
 * (default 0.5) of firstMiss (games of players on a differing board first, then latest round first),
 * and each re-paired; `explanations` lists the
 * changes that give every recorded board ([{ round, white, black, was, now, matched }]), stopping
 * after `stopAfter` (default 1). `onProgress(done, of)` is called after each try.
 */
export function checkRound(trf, k, { explain = true, radius = 0.5, stopAfter = 1, maxTries = Infinity, onProgress = null } = {}) {
  const rec = recordedRound(trf, k);
  const total = rec.boards.length;
  if (!total) return { round: k, total: 0, error: `Round ${k} has no games in this file.` };
  const theirs = new Set(rec.boards.map(([a, b]) => key(a, b)));
  let ours;
  try {
    ours = replayRound(trf, k, rec.absent, { withScores: true });
  } catch (e) {
    return { round: k, total, error: e.message };
  }
  const oursK = new Set(ours.boards.map(([a, b]) => key(a, b)));
  const matched = ours.boards.filter(([a, b]) => theirs.has(key(a, b))).length;
  const colourOf = new Map(rec.boards.map(([w, b]) => [key(w, b), w]));
  const sameColours = ours.boards.filter(([w, b]) => colourOf.get(key(w, b)) === w).length;
  const sc = ours.scores;
  const top = ([a, b]) => Math.max(sc.get(a) ?? 0, sc.get(b) ?? 0);
  const missed = {
    ours: ours.boards.filter(([a, b]) => !theirs.has(key(a, b))),
    theirs: rec.boards.filter(([a, b]) => !oursK.has(key(a, b))),
  };
  // Highest score group first, so the first row is where the two pairings part.
  for (const list of Object.values(missed)) list.sort((x, y) => top(y) - top(x) || Math.min(...x) - Math.min(...y));
  const out = { round: k, total, matched, sameColours, byeMatches: ours.bye === rec.bye, ours: ours.boards, bye: ours.bye, recordedBye: rec.bye, missed, scores: sc, firstMiss: null, explanations: [], tried: 0, triable: 0 };
  if (matched === total && out.byeMatches) return out;
  out.firstMiss = Math.max(...missed.ours.concat(missed.theirs).map(top), -Infinity);
  if (!explain || !Number.isFinite(out.firstMiss)) return out;

  const near = (id) => Math.abs((sc.get(id) ?? 0) - out.firstMiss) <= radius + 1e-9;
  const cands = [];
  for (let r = k - 1; r >= 1; r--) {
    for (const p of trf.players) {
      const g = p.rounds[r - 1];
      if (!g || g.opponent == null || g.colour !== "W" || !flips(g.result)) continue;
      const q = trf.players[g.opponent];
      if (!flips(q.rounds[r - 1]?.result)) continue;
      if (!near(p.id) && !near(q.id)) continue;
      for (const res of flips(g.result)) cands.push({ r, white: p.id, black: q.id, was: g.result, now: res });
    }
  }
  // Games touching a player on a differing board first (the result that moved them is likely theirs),
  // then by round, latest first; the sort is stable, so the round order holds inside each group.
  const onMiss = new Set(missed.ours.concat(missed.theirs).flat());
  cands.sort((a, b) => (onMiss.has(b.white) || onMiss.has(b.black)) - (onMiss.has(a.white) || onMiss.has(a.black)));
  out.triable = cands.length;
  for (const c of cands) {
    if (out.tried >= maxTries || out.explanations.length >= stopAfter) break;
    out.tried++;
    let alt;
    try {
      alt = replayRound(withResult(trf, c.r, c.white, c.black, c.now), k, rec.absent);
    } catch {
      continue;
    }
    const m = alt.boards.filter(([a, b]) => theirs.has(key(a, b))).length;
    if (m === total && alt.bye === rec.bye) out.explanations.push({ round: c.r, white: c.white, black: c.black, was: show(c.was), now: show(c.now), matched: m });
    onProgress?.(out.tried, cands.length);
  }
  return out;
}
