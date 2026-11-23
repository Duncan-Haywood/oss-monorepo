// Bowling league schedules: a repeated round robin with every team rotated across the lane pairs.
//
// A bowling league plays every week on the same pairs of lanes: N teams use N/2 pairs, the
// round robin repeats until the season's weeks run out (a 30-week season of 10 teams is three
// and a third cycles), and the lane pair a team bowls on matters to bowlers (lane conditions,
// the approach, the end lanes by the wall). So the job beyond "who plays whom" is to give every
// team each pair as often as every other pair, and never the same pair two weeks running.
//
// Method: the circle-method rounds fix who plays whom each week; each week's matches are then
// put on pairs by an assignment problem (Hungarian method) priced on what each team has already
// had, and a season-wide swap search (two matches of one week trade pairs) polishes the result.
// A team that bowls W weeks on P pairs cannot spread its weeks closer than floor(W/P) to
// ceil(W/P); `laneReport` measures every team against that bound.
//
// Odd leagues bowl against a "Vacancy" (in USBC terms a vacancy or blind): the team still bowls
// on its pair, so an odd league of N teams uses (N+1)/2 pairs every week.
//
// Position rounds (1st v 2nd, 3rd v 4th by the standings that night) are placeholders: their
// teams are known only on the night. They take a week but do not advance the round robin and are
// left out of the lane counts.

import { roundRobin } from "./rounds.mjs";
import { dayLabel, dayIso } from "./dates.mjs";
import { csvCell } from "./outputs.mjs";
import { parseTeams } from "./names.mjs";
import { mulberry32 } from "./rng.mjs";
import { LANE_TABLE } from "./bowling-lane-table.mjs";
import { LANE_SHAPES } from "./bowling-avoid-shapes.mjs";

export const VACANCY = "Vacancy";

// Seasons where a SAT solver proved the floor/ceil lane bound out of reach (bowling-proofs.mjs,
// from eval/bowling-bound-proof.py): "teams,round-robin weeks" for roundRobin(teams) played in
// order from round 1, as bowlingSchedule() plays it. Only even leagues: an odd league's proof would
// include the Vacancy's row, which says nothing about the real teams.
import { OUT_OF_REACH } from "./bowling-proofs.mjs";
const outOfReach = new Set(OUT_OF_REACH);
export function boundOutOfReach(nTeams, rrWeeks) {
  return outOfReach.has(`${nTeams},${rrWeeks}`);
}

/** Minimum-cost perfect assignment of rows to columns of a square matrix (Hungarian, O(n^3)). */
export function hungarian(cost) {
  const n = cost.length;
  const INF = Infinity;
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(INF);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0], row = cost[i0 - 1], ui = u[i0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = row[j - 1] - ui - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const rowToCol = new Array(n);
  for (let j = 1; j <= n; j++) rowToCol[p[j] - 1] = j - 1;
  return rowToCol;
}

/** "Lanes 1-2", "Lanes 3-4", ... starting from `firstLane`. */
export function pairLabels(count, firstLane = 1) {
  return Array.from({ length: count }, (_, i) => `Lanes ${firstLane + 2 * i}-${firstLane + 2 * i + 1}`);
}

/** "8, 16, 32" or "8 16 32" -> sorted unique week numbers within 1..weeks. */
export function parseWeekList(text, weeks) {
  const out = new Set();
  const errors = [];
  for (const tok of String(text ?? "").split(/[\s,;]+/)) {
    if (!tok) continue;
    const w = Number(tok);
    if (!Number.isInteger(w) || w < 1 || w > weeks) errors.push(`"${tok}" is not a week between 1 and ${weeks}.`);
    else out.add(w);
  }
  return { weeks: [...out].sort((a, b) => a - b), errors };
}

// The greedy week-by-week assignment prices a team's next week on a pair at BALANCE * (2c + 1)
// (the rise in its squared count) plus one for a back-to-back repeat: balance first.
const BALANCE = 8;

/**
 * Put each week's matches on lane pairs. `rounds` is a list of weeks, each a list of [a, b]
 * team-index pairs with exactly nPairs matches. Returns plan: weeks of [a, b, pair].
 * mode: "naive" (match k on pair k, a straight copy of the circle method),
 *       "rotate" (match k on pair (k + week) mod P, the usual hand rotation),
 *       "greedy" (week-by-week assignment priced on counts so far),
 *       "polished" (greedy, then the iterated local search below; the default).
 */
export function assignLanes(rounds, nTeams, nPairs, { mode = "polished", seed = 1, iterations = null, avoid = null, shapes = true, anneal = true } = {}) {
  const ban = banMatrix(nTeams, nPairs, avoid);
  if (mode === "naive") return rounds.map((wk) => wk.map(([a, b], k) => [a, b, k]));
  if (mode === "rotate") return rounds.map((wk, w) => wk.map(([a, b], k) => [a, b, (k + w) % nPairs]));
  const cnt = Array.from({ length: nTeams }, () => new Array(nPairs).fill(0));
  const last = new Array(nTeams).fill(-1);
  const plan = [];
  for (const wk of rounds) {
    const cost = wk.map(([a, b]) => {
      const row = [];
      for (let p = 0; p < nPairs; p++) {
        row.push(BALANCE * (2 * cnt[a][p] + 1 + 2 * cnt[b][p] + 1) + (last[a] === p) + (last[b] === p) + (ban && (ban[a][p] || ban[b][p]) ? FORBID : 0));
      }
      return row;
    });
    const col = hungarian(cost);
    const out = wk.map(([a, b], k) => [a, b, col[k]]);
    for (const [a, b, p] of out) { cnt[a][p]++; cnt[b][p]++; last[a] = p; last[b] = p; }
    plan.push(out);
  }
  if (mode === "greedy" || plan.length < 2 || nPairs < 2) return plan;
  // The Hungarian method is exact per week, so a banned cell in the greedy plan means that week has
  // no deal at all that keeps every team off its avoided pairs: return it as is for the caller to
  // report (bowlingSchedule names the week).
  if (ban && avoidViolations(plan, avoid).length) return plan;
  const lim = laneLimits(plan, nTeams, nPairs, avoid);
  const kicks = iterations ?? kicksFor(plan.length, nPairs);
  const stored = tablePlan(rounds, nTeams, nPairs, seed, avoid) ?? (ban && shapes && shapePlan(rounds, nTeams, nPairs, seed, avoid));
  const steps = anneal ? annealStepsFor(plan.length, nPairs) : 0;
  const finish = (p) => (steps > 0 ? cutRepeats(p, nTeams, nPairs, seed, steps, lim) : p);
  if (stored) return finish(polishLanes(stored, nTeams, nPairs, seed, kicks, lim));
  const polished = polishLanes(plan, nTeams, nPairs, seed, kicks, lim);
  if (offBound(polished, nTeams, nPairs, avoid) === 0) return finish(polished);
  // The week re-solves stall a few counts short of the bound on some sizes. A focused walk on the
  // out-of-bounds cells closes most of those; its result is polished again for repeats only (the
  // polish never lets an out-of-bounds count back in).
  const walked = walkLanes(polished, nTeams, nPairs, seed, walkStepsFor(plan.length, nPairs), lim);
  if (offBound(walked, nTeams, nPairs, avoid) >= offBound(polished, nTeams, nPairs, avoid)) return polished;
  return finish(polishLanes(walked, nTeams, nPairs, seed, kicks, lim));
}

// A team that must never bowl on a pair (the end pair by the wall, a pair whose approach a bowler
// with a wheelchair or a walker cannot use) has that cell banned: the search treats it as a hard
// constraint, priced FORBID, far above any balance cost, and the walk never makes such a move.
const FORBID = 1 << 26;

/** avoid: per team index, a list of pair indices it must not bowl on (null, or empty lists, for none). */
function banMatrix(nTeams, nPairs, avoid) {
  if (!avoid || !avoid.some((l) => l && l.length)) return null;
  const ban = Array.from({ length: nTeams }, () => new Array(nPairs).fill(false));
  avoid.forEach((list, t) => { if (t < nTeams) for (const p of list ?? []) if (p >= 0 && p < nPairs) ban[t][p] = true; });
  return ban;
}

/** Matches placed on a pair one of their teams avoids: [{ week (0-based), team, pair }]. */
export function avoidViolations(plan, avoid) {
  const out = [];
  if (!avoid) return out;
  plan.forEach((wk, w) => wk.forEach(([a, b, p]) => {
    for (const t of [a, b]) if ((avoid[t] ?? []).includes(p)) out.push({ week: w, team: t, pair: p });
  }));
  return out;
}

/**
 * The most even counts a season allows, per team and pair: lo[t][p]..hi[t][p].
 * With no avoided pairs this is the old bound, floor..ceil(W_t / P) on every pair. With some, the
 * avoided pairs still host a match every week, so the other teams must bowl there more often. The
 * fair share x[t][p] is the matrix scaling (Sinkhorn) of the allowed cells to row sums W_t (a team's
 * weeks) and column sums sum(W) / P (two teams per pair per week); every non-avoiding team then
 * bowls on each pair in proportion to how much that pair is shunned. The target is
 * floor(x)..ceil(x), and banned cells are 0..0. Such a rounding with every row and column sum
 * kept always exists (matrix rounding); the weekly one-match-per-pair rule can still put it out of
 * reach, which the report then shows as a team off its target.
 */
export function laneTargets(games, nPairs, avoid = null) {
  const n = games.length;
  const ban = banMatrix(n, nPairs, avoid);
  if (!ban) {
    const lo = games.map((g) => new Array(nPairs).fill(Math.floor(g / nPairs)));
    const hi = games.map((g) => new Array(nPairs).fill(Math.ceil(g / nPairs)));
    return { lo, hi, ban: null };
  }
  const total = games.reduce((s, g) => s + g, 0);
  const col = total / nPairs;
  const x = ban.map((row) => row.map((b) => (b ? 0 : 1)));
  for (let it = 0; it < 5000; it++) {
    let err = 0;
    for (let t = 0; t < n; t++) {
      const s = x[t].reduce((a, v) => a + v, 0);
      if (s > 0) for (let p = 0; p < nPairs; p++) x[t][p] *= games[t] / s;
    }
    for (let p = 0; p < nPairs; p++) {
      let s = 0;
      for (let t = 0; t < n; t++) s += x[t][p];
      err = Math.max(err, Math.abs(s - col));
      if (s > 0) for (let t = 0; t < n; t++) x[t][p] *= col / s;
    }
    if (err < 1e-10) break;
  }
  const eps = 1e-6;
  const lo = x.map((row, t) => row.map((v, p) => (ban[t][p] ? 0 : Math.floor(v + eps))));
  const hi = x.map((row, t) => row.map((v, p) => (ban[t][p] ? 0 : Math.ceil(v - eps))));
  return { lo, hi, ban, share: x };
}

export function laneLimits(plan, nTeams, nPairs, avoid) {
  const games = new Array(nTeams).fill(0);
  for (const wk of plan) for (const [a, b] of wk) { games[a]++; games[b]++; }
  return laneTargets(games, nPairs, avoid);
}

// A season the search misses but a SAT solver solved ahead of time (bowling-lane-table.mjs, from
// eval/bowling-lane-table.py). The entry is used only if it is a permutation every week and puts
// every team at the bound for these rounds, so a stale table can cost speed, never balance. The
// pairs are relabelled by a permutation drawn from the seed (seed 1 keeps them), which keeps the
// balance and gives "Try another lane deal" a different season; the polish then cuts repeats.
function tablePlan(rounds, nTeams, nPairs, seed, avoid = null) {
  const code = LANE_TABLE[`${nTeams},${rounds.length}`];
  if (!code || code.length !== rounds.length * nPairs) return null;
  const perm = Array.from({ length: nPairs }, (_, i) => i);
  if (seed !== 1) {
    const rnd = mulberry32(seed * 104729 + 3);
    for (let i = nPairs - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  }
  const plan = [];
  for (let w = 0; w < rounds.length; w++) {
    if (rounds[w].length !== nPairs) return null;
    const seen = new Set();
    const wk = rounds[w].map(([a, b], m) => {
      const p = parseInt(code[w * nPairs + m], 36);
      seen.add(p);
      return [a, b, perm[p] ?? -1];
    });
    if (seen.size !== nPairs || wk.some((m) => !(m[2] >= 0))) return null;
    plan.push(wk);
  }
  return offBound(plan, nTeams, nPairs, avoid) === 0 ? plan : null;
}

// Lane limits on a season the search misses (bowling-avoid-shapes.mjs, from
// eval/bowling-avoid-shapes.py): one SAT answer per limit *shape*, which teams avoid which pairs up
// to renaming both. Balance does not see names, so the answer for slots 0 and 1 of the circle
// method avoiding pair 0 serves any two teams avoiding any one pair, once bowlingSchedule deals
// those teams the shape's slots (avoidShapeSlots) and the pairs are renamed to match.
const SHAPE_MAX_TEAMS = 4, SHAPE_MAX_PAIRS = 5;

function permutations(xs) {
  if (xs.length <= 1) return [xs.slice()];
  const out = [];
  xs.forEach((x, i) => { for (const rest of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) out.push([x, ...rest]); });
  return out;
}

function parseShape(shape) {
  return shape.split(";").map((part) => { const [t, ps] = part.split(":"); return [Number(t), ps.split(",").map(Number)]; });
}

/**
 * Match the organiser's limits against a shape: returns { slotTeam, pairOf, slots } (slotTeam[i]
 * is the team dealt the shape's i-th slot, slots[i] that circle-method slot, pairOf[j] the real
 * pair standing for shape pair j) or null. Shape pairs are 0..m-1. Slots are usually 0..k-1; a
 * dealing that is UNSAT or too slow there is stored on other slots (`0:0;5:0`,
 * eval/bowling-avoid-slots.py), since which slots meet in the first weeks depends on them.
 */
export function matchShape(avoid, shape, nPairs) {
  const limited = [];
  avoid.forEach((l, t) => { if (l && l.length) limited.push(t); });
  const spec = parseShape(shape);
  if (limited.length !== spec.length || limited.length > SHAPE_MAX_TEAMS) return null;
  const slots = spec.map(([t]) => t);
  if (new Set(slots).size !== slots.length || slots.some((t) => !(t >= 0 && t < avoid.length))) return null;
  const used = [...new Set(limited.flatMap((t) => avoid[t]))].sort((a, b) => a - b);
  const shapePairs = new Set(spec.flatMap(([, ps]) => ps));
  if (used.length !== shapePairs.size || used.length > SHAPE_MAX_PAIRS || used.some((p) => p >= nPairs)) return null;
  if ([...shapePairs].some((j) => j >= used.length)) return null;
  const key = (ps) => [...ps].sort((a, b) => a - b).join(",");
  for (const order of permutations(limited)) {
    if (order.some((t, i) => avoid[t].length !== spec[i][1].length)) continue;
    for (const pairOf of permutations(used)) {
      if (spec.every(([, ps], i) => key(ps.map((j) => pairOf[j])) === key(avoid[order[i]]))) return { slotTeam: order, pairOf, slots };
    }
  }
  return null;
}

function shapeEntry(nTeams, weeks, avoid, nPairs) {
  if (!avoid || !avoid.some((l) => l && l.length)) return null;
  const prefix = `${nTeams},${weeks}|`;
  for (const [k, code] of Object.entries(LANE_SHAPES)) {
    if (!k.startsWith(prefix)) continue;
    const m = matchShape(avoid, k.slice(prefix.length), nPairs);
    if (m) return { ...m, code };
  }
  return null;
}

/**
 * The team dealt each circle-method slot, for a season whose limits have a stored shape answer
 * (the limited teams take the shape's slots, the rest fill the other slots in order), or null.
 */
export function avoidShapeSlots(nTeams, weeks, avoid, nPairs) {
  const e = shapeEntry(nTeams, weeks, avoid, nPairs);
  if (!e) return null;
  const rest = Array.from({ length: nTeams }, (_, t) => t).filter((t) => !e.slotTeam.includes(t));
  const out = new Array(nTeams).fill(-1);
  e.slots.forEach((slot, i) => { out[slot] = e.slotTeam[i]; });
  for (let slot = 0, r = 0; slot < nTeams; slot++) if (out[slot] < 0) out[slot] = rest[r++];
  return out;
}

// The stored shape answer laid onto these rounds: used only if the rounds are the circle method
// dealt by avoidShapeSlots (every week the same matches, any order), every match lands on a pair
// its teams may use, and every count is inside its target; else null and the search runs. The pairs
// no limit names are relabelled by the seed, as tablePlan does.
function shapePlan(rounds, nTeams, nPairs, seed, avoid) {
  const e = shapeEntry(nTeams, rounds.length, avoid, nPairs);
  if (!e || e.code.length !== rounds.length * nPairs) return null;
  const slotTeam = avoidShapeSlots(nTeams, rounds.length, avoid, nPairs);
  const free = Array.from({ length: nPairs }, (_, p) => p).filter((p) => !e.pairOf.includes(p));
  if (seed !== 1) {
    const rnd = mulberry32(seed * 104729 + 3);
    for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
  }
  const pairOf = [...e.pairOf, ...free];
  const cycle = roundRobin(nTeams);
  const plan = [];
  for (let w = 0; w < rounds.length; w++) {
    if (rounds[w].length !== nPairs) return null;
    const where = new Map();
    cycle[w % cycle.length].matches.forEach(([a, b], m) => {
      const ta = slotTeam[a], tb = slotTeam[b];
      where.set(Math.min(ta, tb) * nTeams + Math.max(ta, tb), pairOf[parseInt(e.code[w * nPairs + m], 36)]);
    });
    const seen = new Set();
    const wk = rounds[w].map(([a, b]) => [a, b, where.get(Math.min(a, b) * nTeams + Math.max(a, b))]);
    for (const m of wk) { if (!(m[2] >= 0)) return null; seen.add(m[2]); }
    if (seen.size !== nPairs) return null;
    plan.push(wk);
  }
  if (avoidViolations(plan, avoid).length) return null;
  return offBound(plan, nTeams, nPairs, avoid) === 0 ? plan : null;
}

/** Out-of-bounds counts of a plan: how far each team-pair count is outside its target (laneTargets; floor..ceil(W_t/P) with no avoided pairs, 0 on an avoided pair). */
export function offBound(plan, nTeams, nPairs, avoid = null) {
  const cnt = Array.from({ length: nTeams }, () => new Array(nPairs).fill(0));
  for (const wk of plan) for (const [a, b, p] of wk) { cnt[a][p]++; cnt[b][p]++; }
  const { lo, hi } = laneLimits(plan, nTeams, nPairs, avoid);
  let o = 0;
  for (let t = 0; t < nTeams; t++) for (let p = 0; p < nPairs; p++) {
    const c = cnt[t][p];
    o += Math.max(0, c - hi[t][p]) + Math.max(0, lo[t][p] - c);
  }
  return o;
}

function walkStepsFor(weeks, nPairs) {
  return Math.max(2000, Math.min(200000, Math.floor(2e8 / (weeks * nPairs * nPairs))));
}

// A focused random walk (the WalkSAT idea) on the season's out-of-bounds cells. Each step picks one
// team-pair cell outside the bound at random. If the team has too many weeks on that pair, the
// moves are swaps that take one of its matches off the pair (with any other match that week); if
// too few, swaps that bring one of its matches onto the pair. The step takes the move that leaves
// the fewest out-of-bounds counts (ties at random), or with probability NOISE any of those moves,
// which is what gets it out of the local minima the week re-solves stop in. Deterministic per seed;
// the best plan seen is returned.
const NOISE = 0.2;
function walkLanes(source, nTeams, nPairs, seed, steps, lim) {
  // Flat typed arrays and reused move buffers (perf, 2026-11-19): the same moves, ties and random
  // draws in the same order as the nested-array version, so the same walk.
  const plan = source.map((wk) => wk.map((m) => m.slice()));
  const W = plan.length, P = nPairs, T = nTeams, rnd = mulberry32(seed * 7919 + 17);
  const cnt = new Int32Array(T * P);
  const at = new Int32Array(T * W).fill(-1); // team * W + week -> match index
  plan.forEach((wk, w) => wk.forEach(([a, b, p], i) => { cnt[a * P + p]++; cnt[b * P + p]++; at[a * W + w] = i; at[b * W + w] = i; }));
  const lo = new Int32Array(T * P), hi = new Int32Array(T * P);
  const ban = lim.ban === null ? null : new Uint8Array(T * P);
  for (let t = 0; t < T; t++) for (let p = 0; p < P; p++) {
    lo[t * P + p] = lim.lo[t][p]; hi[t * P + p] = lim.hi[t][p];
    if (ban !== null && lim.ban[t][p]) ban[t * P + p] = 1;
  }
  const off = (i, c) => Math.max(0, c - hi[i]) + Math.max(0, lo[i] - c);
  const move = (t, p, q) => { const i = t * P + p, k = t * P + q; return off(i, cnt[i] - 1) - off(i, cnt[i]) + off(k, cnt[k] + 1) - off(k, cnt[k]); };
  const banned = (t, p) => ban !== null && ban[t * P + p] === 1;
  let f = 0;
  for (let i = 0; i < T * P; i++) f += off(i, cnt[i]);
  let best = f, bestPlan = plan.map((wk) => wk.map((m) => m.slice()));
  // the plan mirrored flat for the step loop: match m of week w is entry w * P + m
  const ta = new Int32Array(W * P), tb = new Int32Array(W * P), pr = new Int32Array(W * P);
  plan.forEach((wk, w) => wk.forEach(([a, b, p], m) => { ta[w * P + m] = a; tb[w * P + m] = b; pr[w * P + m] = p; }));
  const cells = new Int32Array(T * P);
  const moves = new Int32Array(3 * W * P), bestMoves = new Int32Array(3 * W * P);
  const swap = (u, q, r) => {
    const iq = u * P + q, ir = u * P + r;
    f -= off(iq, cnt[iq]) + off(ir, cnt[ir]); cnt[iq]--; cnt[ir]++; f += off(iq, cnt[iq]) + off(ir, cnt[ir]);
  };
  for (let step = 0; step < steps && f > 0; step++) {
    let nCells = 0;
    for (let i = 0; i < T * P; i++) if (off(i, cnt[i])) cells[nCells++] = i;
    const cell = cells[Math.floor(rnd() * nCells)];
    const t = Math.floor(cell / P), p = cell % P, over = cnt[cell] > hi[cell];
    let nMoves = 0, nBest = 0, bestDelta = Infinity;
    for (let w = 0; w < W; w++) {
      const i = at[t * W + w];
      if (i < 0) continue;
      const ai = w * P + i, q = pr[ai];
      if (over ? q !== p : q === p) continue;
      const a0 = ta[ai], a1 = tb[ai];
      for (let j = 0; j < P; j++) {
        if (j === i) continue;
        const bj = w * P + j, r = pr[bj];
        if (!over && r !== p) continue;
        const b0 = ta[bj], b1 = tb[bj];
        if (banned(a0, r) || banned(a1, r) || banned(b0, q) || banned(b1, q)) continue;
        const d = move(a0, q, r) + move(a1, q, r) + move(b0, r, q) + move(b1, r, q);
        moves[nMoves++] = w; moves[nMoves++] = i; moves[nMoves++] = j;
        if (d < bestDelta) { bestDelta = d; nBest = 0; }
        if (d === bestDelta) { bestMoves[nBest++] = w; bestMoves[nBest++] = i; bestMoves[nBest++] = j; }
      }
    }
    if (!nMoves) continue;
    const noisy = rnd() < NOISE;
    const pool = noisy ? moves : bestMoves, len = noisy ? nMoves : nBest;
    const k = 3 * Math.floor(rnd() * (len / 3));
    const w = pool[k], i = pool[k + 1], j = pool[k + 2];
    const A = plan[w][i], B = plan[w][j], q = A[2], r = B[2];
    swap(A[0], q, r); swap(A[1], q, r);
    swap(B[0], r, q); swap(B[1], r, q);
    A[2] = r; B[2] = q; pr[w * P + i] = r; pr[w * P + j] = q;
    if (f < best) { best = f; bestPlan = plan.map((wk) => wk.map((m) => m.slice())); }
  }
  return bestPlan;
}

// Back-to-back repeats on a balanced season (2026-11-18). The polish never lets a count leave its
// target, so on a season where every count is pinned (P divides W: every team on every pair exactly
// W/P times, the stored SAT answers) it can only trade repeats inside moves that keep every count,
// and there are almost none: one swap of two matches in a week moves four teams' counts. This
// anneal lets counts leave the target for a while. A move is the same swap; its price is
// OFF_WEIGHT per out-of-bounds count plus one per repeat, accepted by the Metropolis rule at a
// temperature falling linearly to near zero. Only seasons with every count in target are kept, so
// the result is never less balanced than the input (with no out-of-bounds count, every team's
// squared spread is fixed too: its counts are floor or ceil and sum to its weeks). Deterministic
// per seed; a step budget, not a clock.
const OFF_WEIGHT = 1;
// Anneal steps: a fixed budget (each step is a constant amount of work), none for a season too
// short to have repeats worth cutting. ANNEAL_STEPS is exported for the tests and eval scripts.
export const ANNEAL_STEPS = 600000;
function annealStepsFor(weeks, nPairs) {
  return weeks < 3 || nPairs < 2 ? 0 : ANNEAL_STEPS;
}
export function cutRepeats(source, nTeams, nPairs, seed, steps, lim, { t0 = 0.6, t1 = 0.05, runs = 1 } = {}) {
  let cur = source;
  for (let k = 0; k < runs; k++) cur = annealRepeats(cur, nTeams, nPairs, seed + 7 * k, Math.floor(steps / runs), lim, t0, t1);
  return cur;
}
function annealRepeats(source, nTeams, nPairs, seed, steps, lim, t0, t1) {
  const plan = source.map((wk) => wk.map((m) => m.slice()));
  const W = plan.length;
  if (W < 2 || nPairs < 2) return plan;
  const rnd = mulberry32(seed * 6151 + 29);
  const cnt = Array.from({ length: nTeams }, () => new Array(nPairs).fill(0));
  const pos = Array.from({ length: W }, () => new Array(nTeams).fill(-1));
  plan.forEach((wk, w) => wk.forEach(([a, b, p]) => { cnt[a][p]++; cnt[b][p]++; pos[w][a] = p; pos[w][b] = p; }));
  const { lo, hi, ban } = lim;
  const off = (t, p, c) => Math.max(0, c - hi[t][p]) + Math.max(0, lo[t][p] - c);
  let o = 0, r = 0;
  for (let t = 0; t < nTeams; t++) for (let p = 0; p < nPairs; p++) o += off(t, p, cnt[t][p]);
  for (let w = 1; w < W; w++) for (let t = 0; t < nTeams; t++) if (pos[w][t] >= 0 && pos[w][t] === pos[w - 1][t]) r++;
  if (o > 0) return plan; // only balanced seasons are annealed
  let best = r, bestPlan = plan.map((wk) => wk.map((m) => m.slice()));
  const rep = (w, t, p) => (w > 0 && pos[w - 1][t] === p ? 1 : 0) + (w < W - 1 && pos[w + 1][t] === p ? 1 : 0);
  // change of (off, repeats) when team t moves from pair p to pair q in week w
  // With lo <= hi: off(c - 1) - off(c) is -1 above hi, +1 at or below lo, else 0; off(c + 1) - off(c)
  // is +1 at or above hi, -1 below lo, else 0 (the same values off() gives, without four calls).
  const dOff = (t, p, q) => {
    const ct = cnt[t], c = ct[p], d = ct[q];
    return (c > hi[t][p] ? -1 : c <= lo[t][p] ? 1 : 0) + (d >= hi[t][q] ? 1 : d < lo[t][q] ? -1 : 0);
  };
  const dRep = (w, t, p, q) => rep(w, t, q) - rep(w, t, p);
  for (let step = 0; step < steps && best > 0; step++) {
    const w = Math.floor(rnd() * W);
    const i = Math.floor(rnd() * nPairs);
    let j = Math.floor(rnd() * (nPairs - 1)); if (j >= i) j++;
    const A = plan[w][i], B = plan[w][j], q = A[2], s = B[2];
    if (ban !== null && (ban[A[0]][s] || ban[A[1]][s] || ban[B[0]][q] || ban[B[1]][q])) continue;
    const dO = dOff(A[0], q, s) + dOff(A[1], q, s) + dOff(B[0], s, q) + dOff(B[1], s, q);
    const dR = dRep(w, A[0], q, s) + dRep(w, A[1], q, s) + dRep(w, B[0], s, q) + dRep(w, B[1], s, q);
    const d = OFF_WEIGHT * dO + dR;
    const T = t0 + (t1 - t0) * step / steps;
    if (d > 0 && rnd() >= Math.exp(-d / T)) continue;
    for (const u of [A[0], A[1]]) { cnt[u][q]--; cnt[u][s]++; pos[w][u] = s; }
    for (const u of [B[0], B[1]]) { cnt[u][s]--; cnt[u][q]++; pos[w][u] = q; }
    A[2] = s; B[2] = q;
    o += dO; r += dR;
    if (o === 0 && r < best) { best = r; bestPlan = plan.map((wk) => wk.map((m) => m.slice())); }
  }
  return bestPlan;
}

function kicksFor(weeks, nPairs) {
  return Math.max(30, Math.min(600, Math.floor(4e6 / (weeks * nPairs * nPairs))));
}

// Iterated local search on week re-solves. With every other week fixed, the price of putting one
// week's match on a pair is a sum over its two teams of what that adds to their lane cost (their
// count on that pair goes up by one; their repeats depend only on the weeks either side), so the
// Hungarian method finds that week's exact best assignment. A team-pair cell is "out of bounds"
// when its count leaves floor(W_t/P)..ceil(W_t/P), the least spread a team of W_t weeks can have.
// The price is lexicographic in effect: out-of-bounds counts first, then the squared distance
// from the even share, then back-to-back repeats. Sweeps re-solve every week until none improves;
// a kick re-deals a few random weeks and the sweeps run again from there; a kick that ends worse
// is undone. The best season (fewest out-of-bounds, then fewest repeats) is kept. Deterministic
// for a seed.
function polishLanes(plan, nTeams, nPairs, seed, kicks, lim) {
  const W = plan.length;
  const cnt = Array.from({ length: nTeams }, () => new Array(nPairs).fill(0));
  const pos = Array.from({ length: W }, () => new Array(nTeams).fill(-1));
  const { lo, hi, ban } = lim;
  const put = (w, sign) => { for (const [a, b, p] of plan[w]) { cnt[a][p] += sign; cnt[b][p] += sign; pos[w][a] = sign > 0 ? p : -1; pos[w][b] = sign > 0 ? p : -1; } };
  for (let w = 0; w < W; w++) put(w, 1);
  const off = (t, p, c) => Math.max(0, c - hi[t][p]) + Math.max(0, lo[t][p] - c);
  const OFF = 4096, SQ = 16;
  // The price of a match on pair p is, for each of its two teams t with count c there:
  //   FORBID if banned + OFF * (off(c + 1) - off(c)) + SQ * (2c + 1) + 1 per neighbouring week on p.
  // With lo <= hi, off(c + 1) - off(c) is +1 when c >= hi, -1 when c < lo and 0 between, so the
  // loop below prices it without calling off(), with each team's rows looked up once per match
  // instead of once per pair (the per-cell closure was 57% of a stored season's time). Same
  // integers, so the Hungarian step sees the same matrix.
  const resolve = (w) => {
    put(w, -1);
    const wk = plan[w], prev = w > 0 ? pos[w - 1] : null, next = w < W - 1 ? pos[w + 1] : null;
    const cost = new Array(wk.length);
    for (let k = 0; k < wk.length; k++) {
      const a = wk[k][0], b = wk[k][1];
      const ca = cnt[a], cb = cnt[b], la = lo[a], lb = lo[b], ha = hi[a], hb = hi[b];
      const ba = ban !== null ? ban[a] : null, bb = ban !== null ? ban[b] : null;
      const pa = prev !== null ? prev[a] : -1, pb = prev !== null ? prev[b] : -1;
      const na = next !== null ? next[a] : -1, nb = next !== null ? next[b] : -1;
      const row = new Array(nPairs);
      for (let p = 0; p < nPairs; p++) {
        const x = ca[p], y = cb[p];
        let v = OFF * ((x >= ha[p] ? 1 : x < la[p] ? -1 : 0) + (y >= hb[p] ? 1 : y < lb[p] ? -1 : 0)) + SQ * (2 * x + 2 * y + 2);
        if (pa === p) v++;
        if (na === p) v++;
        if (pb === p) v++;
        if (nb === p) v++;
        if (ba !== null) { if (ba[p]) v += FORBID; if (bb[p]) v += FORBID; }
        row[p] = v;
      }
      cost[k] = row;
    }
    const col = hungarian(cost);
    plan[w].forEach((m, k) => { m[2] = col[k]; });
    put(w, 1);
  };
  const full = () => {
    let o = 0, q = 0, r = 0, bad = 0;
    for (let t = 0; t < nTeams; t++) for (let p = 0; p < nPairs; p++) { const c = cnt[t][p]; o += off(t, p, c); q += c * c; if (ban !== null && ban[t][p]) bad += c; }
    for (let w = 1; w < W; w++) for (let t = 0; t < nTeams; t++) if (pos[w][t] === pos[w - 1][t]) r++;
    return { cost: FORBID * bad + OFF * o + SQ * q + r, off: o + bad * 1e6, repeats: r };
  };
  const sweep = () => {
    let cur = full();
    for (let guard = 0; guard < 40; guard++) {
      for (let w = 0; w < W; w++) resolve(w);
      const next = full();
      if (next.cost >= cur.cost) return next;
      cur = next;
    }
    return cur;
  };
  const rnd = mulberry32(seed);
  const key = (x) => [x.off, x.repeats, x.cost];
  const better = (x, y) => { const a = key(x), b = key(y); for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
  let cur = sweep(), best = cur;
  let curPlan = plan.map((wk) => wk.map((m) => m.slice())), bestPlan = curPlan;
  const restore = (from) => { for (let w = 0; w < W; w++) { put(w, -1); plan[w].forEach((m, idx) => { m[2] = from[w][idx][2]; }); put(w, 1); } };
  for (let k = 0; k < kicks && (best.off > 0 || best.repeats > 0); k++) {
    const many = 1 + Math.floor(rnd() * Math.min(3, W));
    for (let i = 0; i < many; i++) {
      const w = Math.floor(rnd() * W);
      put(w, -1);
      const perm = Array.from({ length: nPairs }, (_, i2) => i2);
      for (let i2 = nPairs - 1; i2 > 0; i2--) { const j = Math.floor(rnd() * (i2 + 1)); [perm[i2], perm[j]] = [perm[j], perm[i2]]; }
      plan[w].forEach((m, idx) => { m[2] = perm[idx]; });
      put(w, 1);
    }
    const c = sweep();
    if (c.cost <= cur.cost) {
      cur = c; curPlan = plan.map((wk) => wk.map((m) => m.slice()));
      if (better(c, best)) { best = c; bestPlan = curPlan; }
    } else restore(curPlan);
  }
  return bestPlan;
}

/**
 * Lane limits typed by the organiser, one team per line: "Pin Pals: 13-14" (a pair by its lanes),
 * "Strike Force: 15" (the pair that holds lane 15), "Gutter Gang: last" ("first", "last", or "ends"
 * for both end pairs), several separated by commas. Returns { avoid, errors } with avoid[t] the
 * pair indices team t must not bowl on.
 */
export function parseLaneAvoid(text, teams, nPairs, firstLane = 1) {
  const avoid = teams.map(() => []);
  const errors = [];
  const byName = new Map(teams.map((t, i) => [String(t).trim().toLowerCase(), i]));
  const lastLane = firstLane + 2 * nPairs - 1;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cut = line.lastIndexOf(":");
    if (cut < 0) { errors.push(`"${line}": write the team, a colon, then the lanes it must avoid (e.g. "Pin Pals: ${firstLane}-${firstLane + 1}").`); continue; }
    const name = line.slice(0, cut).trim();
    const t = byName.get(name.toLowerCase());
    if (t === undefined || teams[t] === VACANCY) { errors.push(`"${name}" is not one of the teams.`); continue; }
    const set = new Set(avoid[t]);
    for (const tokRaw of line.slice(cut + 1).split(/[,;]+/)) {
      const tok = tokRaw.trim().toLowerCase().replace(/^lanes?\s*/, "");
      if (!tok) continue;
      if (tok === "first") { set.add(0); continue; }
      if (tok === "last") { set.add(nPairs - 1); continue; }
      if (tok === "ends" || tok === "end" || tok === "end pairs") { set.add(0); set.add(nPairs - 1); continue; }
      const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(tok);
      const a = m ? Number(m[1]) : NaN, b = m && m[2] ? Number(m[2]) : null;
      if (!m || a < firstLane || a > lastLane || (b !== null && (b !== a + 1 || (a - firstLane) % 2 !== 0))) {
        errors.push(`${teams[t]}: "${tokRaw.trim()}" is not a lane pair here (pairs run Lanes ${firstLane}-${firstLane + 1} to ${lastLane - 1}-${lastLane}).`);
        continue;
      }
      set.add(Math.floor((a - firstLane) / 2));
    }
    avoid[t] = [...set].sort((x, y) => x - y);
    if (avoid[t].length >= nPairs) errors.push(`${teams[t]} cannot avoid every lane pair.`);
  }
  return { avoid, errors };
}

/**
 * Build a bowling season.
 * spec: { teams: string[] | text, weeks, start (day number), skipDays: day[], positionWeeks: number[],
 *         firstLane = 1, mode = "polished", seed = 1,
 *         laneAvoid: text for parseLaneAvoid, or an array of pair-index lists per team }
 */
const modeOf = (spec) => spec.mode ?? "polished";

// How many of a week's matches cannot be given a pair their teams may use: nPairs minus a maximum
// bipartite matching of matches to allowed pairs (Kuhn's augmenting paths). 0 means the week has a
// legal deal; the Hungarian step in assignLanes then finds it.
function weekShortfall(matches, ban, nPairs) {
  const pairOwner = new Array(nPairs).fill(-1);
  const ok = matches.map(([a, b]) => { const r = []; for (let p = 0; p < nPairs; p++) if (!ban[a][p] && !ban[b][p]) r.push(p); return r; });
  const tryMatch = (m, seen) => {
    for (const p of ok[m]) {
      if (seen[p]) continue;
      seen[p] = true;
      if (pairOwner[p] < 0 || tryMatch(pairOwner[p], seen)) { pairOwner[p] = m; return true; }
    }
    return false;
  };
  let got = 0;
  for (let m = 0; m < matches.length; m++) if (tryMatch(m, new Array(nPairs).fill(false))) got++;
  return matches.length - got;
}

/**
 * A dealing of teams to circle-method slots (slotTeam[slot] = team) under which every round the
 * season plays has a legal lane deal, or null if none was found. Lane limits make some weeks
 * impossible only because of who meets whom that week: five teams off one pair in a 10-team league
 * leave the pair one match of two unlimited teams, and slot t = team t can put all five in five
 * different matches. The round robin may deal any team any slot (every team still meets every other
 * as often), so a hill climb swaps a limited team's slot with another slot, keeping a swap that does
 * not raise the summed shortfall, with seeded restarts. Identity first, so a season that already
 * has a deal every week is unchanged.
 */
export function feasibleDealing(nTeams, rrWeeks, avoid, nPairs, { tries = null, seed = 1, shuffle = false } = {}) {
  const ban = banMatrix(nTeams, nPairs, avoid);
  if (!ban) return null;
  const cycle = roundRobin(nTeams);
  const used = cycle.slice(0, Math.min(rrWeeks, cycle.length)).map((r) => r.matches);
  const cost = (deal) => used.reduce((s, ms) => s + weekShortfall(ms.map(([a, b]) => [deal[a], deal[b]]), ban, nPairs), 0);
  let deal = Array.from({ length: nTeams }, (_, t) => t);
  const limited = new Set(deal.filter((t) => ban[t].some(Boolean)));
  const rnd = mulberry32(seed * 7919 + nTeams * 131 + rrWeeks);
  // shuffle: start from a seeded random dealing, so seeds 2, 3, ... give other legal dealings for
  // evenDealing to compare; without it identity comes first and a feasible season is unchanged.
  const reshuffle = () => { for (let j = nTeams - 1; j > 0; j--) { const k = Math.floor(rnd() * (j + 1)); [deal[j], deal[k]] = [deal[k], deal[j]]; } };
  if (shuffle && limited.size) reshuffle();
  let c = cost(deal);
  if (c === 0) return deal;
  if (limited.size === 0) return null;
  // A work budget, not a clock, so the same input gives the same season on any machine: about
  // 3e7 matching steps (well under a second), capped at 4,000 swaps.
  if (tries === null) tries = Math.max(50, Math.min(4000, Math.floor(3e7 / (used.length * nPairs * nPairs))));
  const restartEvery = Math.max(200, 20 * nTeams);
  for (let i = 0; i < tries; i++) {
    if (i > 0 && i % restartEvery === 0) {
      reshuffle();
      c = cost(deal);
      if (c === 0) return deal;
    }
    // a slot holding a limited team, swapped with any other slot
    let x;
    do x = Math.floor(rnd() * nTeams); while (!limited.has(deal[x]));
    let y = Math.floor(rnd() * (nTeams - 1)); if (y >= x) y++;
    [deal[x], deal[y]] = [deal[y], deal[x]];
    const c2 = cost(deal);
    if (c2 <= c) { c = c2; if (c === 0) return deal; } else [deal[x], deal[y]] = [deal[y], deal[x]];
  }
  return null;
}

// How many legal dealings bowlingSchedule compares at most when a lane-limited season with no stored
// shape answer leaves a team off its target: the first plus seeded others. Each is a full lane
// search, so dealingsFor caps it by the season's size (weeks x pairs^2, the search's work): six on a
// 10-team league, two on 24 teams x 26 weeks, where one search takes about 2 s.
export const DEALINGS = 6;
export function dealingsFor(weeks, nPairs) {
  return Math.min(DEALINGS, Math.max(2, Math.floor(8000 / (weeks * nPairs * nPairs))));
}

/** A season's evenness, smaller is better: [teams off their lane target, summed off-target counts, back-to-back repeats]. */
export function dealingScore(plan, nTeams, nPairs, avoid) {
  const c = Array.from({ length: nTeams }, () => new Array(nPairs).fill(0));
  const games = new Array(nTeams).fill(0), last = new Array(nTeams).fill(-1);
  let rep = 0;
  for (const wk of plan) for (const [a, b, p] of wk) for (const t of [a, b]) { c[t][p]++; games[t]++; if (last[t] === p) rep++; last[t] = p; }
  const { lo, hi } = laneTargets(games, nPairs, avoid);
  let teamsOff = 0, off = 0;
  for (let t = 0; t < nTeams; t++) {
    let o = 0;
    for (let p = 0; p < nPairs; p++) o += Math.max(0, c[t][p] - hi[t][p]) + Math.max(0, lo[t][p] - c[t][p]);
    off += o; if (o) teamsOff++;
  }
  return [teamsOff, off, rep];
}

const better = (x, y) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };

/**
 * The most even of several legal dealings. The first dealing (identity, or feasibleDealing's first
 * find) is kept unless another legal one, from feasibleDealing with seeds 2, 3, ... started from a
 * shuffle, scores better on dealingScore. Stops at a season with every team in target. build(deal)
 * runs the lane search for a dealing. Deterministic: the same input gives the same season.
 */
export function evenDealing(firstPlan, firstDeal, build, nTeams, rrWeeks, avoid, nPairs, count = DEALINGS) {
  let best = { plan: firstPlan, deal: firstDeal, score: dealingScore(firstPlan, nTeams, nPairs, avoid), tried: 1 };
  const seen = new Set([String(firstDeal ?? Array.from({ length: nTeams }, (_, t) => t))]);
  for (let seed = 2; best.score[0] > 0 && best.tried < count && seed < count + 8; seed++) {
    const deal = feasibleDealing(nTeams, rrWeeks, avoid, nPairs, { seed, shuffle: true });
    if (!deal || seen.has(String(deal))) continue;
    seen.add(String(deal));
    const plan = build(deal);
    best.tried++;
    if (avoidViolations(plan, avoid).length) continue;
    const score = dealingScore(plan, nTeams, nPairs, avoid);
    if (better(score, best.score)) best = { plan, deal, score, tried: best.tried };
  }
  return best;
}

export function bowlingSchedule(spec) {
  const errors = [];
  let teams;
  if (Array.isArray(spec.teams)) {
    teams = spec.teams.slice();
    if (teams.length < 2) errors.push("Enter at least two teams.");
    if (teams.length > 64) errors.push("Up to 64 teams are supported.");
  } else {
    // parseTeams already says "at least two" and "up to 64"; repeating them printed each twice.
    const parsed = parseTeams(spec.teams);
    teams = parsed.teams;
    errors.push(...parsed.errors);
  }
  // An odd league adds a team called "Vacancy"; a real team of that name would be two teams
  // the schedule, the CSV and the lane report could not tell apart.
  if (teams.length % 2 === 1 && teams.some((t) => String(t).trim().toLowerCase() === VACANCY.toLowerCase())) {
    errors.push(`An odd league bowls against a "${VACANCY}", so a team cannot use that name: rename it (or add a team).`);
  }
  const weeks = Number(spec.weeks);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 60) errors.push("Weeks must be a whole number from 1 to 60.");
  if (!Number.isInteger(spec.start)) errors.push("Pick the first league night.");
  const firstLane = Number(spec.firstLane ?? 1);
  if (!Number.isInteger(firstLane) || firstLane < 1 || firstLane > 199) errors.push("The first lane must be a whole number from 1 to 199.");
  if (errors.length) return { errors };
  const odd = teams.length % 2 === 1;
  if (odd) teams = [...teams, VACANCY];
  const n = teams.length;
  const nPairs = n / 2;
  const positionSet = new Set((spec.positionWeeks ?? []).filter((w) => w >= 1 && w <= weeks));
  const skipSet = new Set(spec.skipDays ?? []);
  // Dates: the same weekday every week from the start, stepping over skip dates.
  const days = [];
  for (let d = spec.start; days.length < weeks; d += 7) if (!skipSet.has(d)) days.push(d);
  const skipped = [...skipSet].filter((d) => d >= spec.start && d <= days[days.length - 1] && (d - spec.start) % 7 === 0).sort((a, b) => a - b);
  let avoid = null;
  if (Array.isArray(spec.laneAvoid)) avoid = teams.map((_, t) => (spec.laneAvoid[t] ?? []).slice());
  else if (spec.laneAvoid) {
    const parsed = parseLaneAvoid(spec.laneAvoid, teams, nPairs, firstLane);
    if (parsed.errors.length) return { errors: parsed.errors };
    avoid = parsed.avoid;
  }
  if (avoid && !avoid.some((l) => l.length)) avoid = null;
  const cycle = roundRobin(n); // n even here, so every round has n/2 matches and no bye
  const rrWeeks = Array.from({ length: weeks }, (_, i) => i + 1).filter((w) => !positionSet.has(w)).length;
  // With lane limits on a season that has a stored shape answer, the limited teams are dealt the
  // shape's slots of the circle method (still a plain round robin, every team meeting every other
  // as often); with none, slot t is team t as before.
  // Failing that, if slot t = team t leaves a week with no legal deal, the limited teams are dealt
  // slots where every week has one (feasibleDealing); a season that already has one is unchanged.
  const shapeSlots = avoid && modeOf(spec) === "polished" && avoidShapeSlots(n, rrWeeks, avoid, nPairs);
  let slotTeam = shapeSlots || (avoid && feasibleDealing(n, rrWeeks, avoid, nPairs)) || null;
  const roundOf = [];
  let k = 0;
  for (let w = 1; w <= weeks; w++) {
    if (positionSet.has(w)) continue;
    roundOf.push({ week: w, cycle: Math.floor(k / cycle.length) + 1, round: (k % cycle.length) + 1 });
    k++;
  }
  const roundsFor = (deal) => roundOf.map((_, i) => {
    const r = cycle[i % cycle.length];
    return deal ? r.matches.map(([a, b]) => [deal[a], deal[b]]) : r.matches;
  });
  const labels = pairLabels(nPairs, firstLane);
  const laneSeed = spec.seed ?? 1;
  let plan = assignLanes(roundsFor(slotTeam), n, nPairs, { mode: modeOf(spec), seed: laneSeed, avoid });
  // No stored shape answer (five or more limited teams, or a shape not stored) and some team off its
  // target: the dealing decides which teams meet in the weeks the limits squeeze, so other legal
  // dealings are built too and the most even season kept (evenDealing below). A season already at
  // its target, or with a stored answer, is unchanged.
  let dealingsTried = 1;
  if (avoid && !shapeSlots && modeOf(spec) === "polished" && !avoidViolations(plan, avoid).length) {
    const best = evenDealing(plan, slotTeam, (deal) => assignLanes(roundsFor(deal), n, nPairs, { mode: "polished", seed: laneSeed, avoid }), n, rrWeeks, avoid, nPairs, spec.dealings ?? dealingsFor(rrWeeks, nPairs));
    plan = best.plan; slotTeam = best.deal; dealingsTried = best.tried;
  }
  const redealt = slotTeam !== null && slotTeam.some((t, i) => t !== i);
  if (avoid) {
    const bad = avoidViolations(plan, avoid);
    if (bad.length) {
      const w = roundOf[bad[0].week].week;
      const who = [...new Set(bad.filter((b) => b.week === bad[0].week).map((b) => teams[b.team]))].join(", ");
      return { errors: [`Week ${w}: the lane limits leave no way to put every match on a pair its teams may use (${who}). Too many of that week's matches avoid the same pairs, and no dealing of the teams to round-robin slots tried gives every week a legal deal; loosen a limit.`] };
    }
  }
  const out = [];
  let ri = 0;
  for (let w = 1; w <= weeks; w++) {
    const day = days[w - 1];
    if (positionSet.has(w)) {
      // An odd league of N teams has no (N+1)th place: the last-placed team bowls the Vacancy.
      const real = odd ? n - 1 : n;
      out.push({ week: w, day, kind: "position", matches: labels.map((_, p) => ({ pair: p, a: `${ordinal(2 * p + 1)} place`, b: 2 * p + 2 > real ? VACANCY : `${ordinal(2 * p + 2)} place` })) });
      continue;
    }
    const info = roundOf[ri];
    const matches = plan[ri].map(([a, b, p]) => ({ pair: p, a, b })).sort((x, y) => x.pair - y.pair);
    out.push({ week: w, day, kind: "round", cycle: info.cycle, round: info.round, matches });
    ri++;
  }
  const boundProvedOutOfReach = !odd && boundOutOfReach(n, roundOf.length);
  return { errors: [], teams, odd, nPairs, labels, weeks: out, skipped, cycleLength: cycle.length, boundProvedOutOfReach: boundProvedOutOfReach && !avoid, avoid, redealt, dealingsTried };
}

function ordinal(i) {
  const s = i % 100 >= 11 && i % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][i % 10] || "th";
  return `${i}${s}`;
}

/** Per team: weeks bowled on each pair, the spread (max - min), the bound, and back-to-back repeats. */
export function laneReport(season) {
  const n = season.teams.length, P = season.nPairs;
  const rows = season.teams.map((name) => ({ name, counts: new Array(P).fill(0), weeks: 0, repeats: 0, last: -1, lastWeek: -9 }));
  for (const wk of season.weeks) {
    if (wk.kind !== "round") continue;
    for (const m of wk.matches) {
      for (const t of [m.a, m.b]) {
        const r = rows[t];
        r.counts[m.pair]++; r.weeks++;
        if (r.last === m.pair) r.repeats++;
        r.last = m.pair;
      }
    }
  }
  let worstSpread = 0, atBound = 0, repeats = 0;
  // Targets per team and pair (laneTargets): floor..ceil(W/P) with no avoided pairs; with some, the
  // fair share of the pairs a team may use, and 0 on the ones it avoids. Spread and bound are over
  // the pairs a team may use.
  const { lo, hi } = laneTargets(rows.map((r) => r.weeks), P, season.avoid ?? null);
  const out = rows.map((r, t) => {
    const avoided = (season.avoid?.[t] ?? []).slice();
    const used = r.counts.filter((_, p) => !avoided.includes(p));
    const spread = Math.max(...used) - Math.min(...used);
    const allowed = [...Array(P).keys()].filter((p) => !avoided.includes(p));
    const bound = Math.max(...allowed.map((p) => hi[t][p])) - Math.min(...allowed.map((p) => lo[t][p]));
    const inTarget = r.counts.every((c, p) => c >= lo[t][p] && c <= hi[t][p]);
    worstSpread = Math.max(worstSpread, spread);
    if (inTarget) atBound++;
    repeats += r.repeats;
    return { name: r.name, counts: r.counts, weeks: r.weeks, spread, bound, repeats: r.repeats, avoided, inTarget, target: { lo: lo[t], hi: hi[t] } };
  });
  const real = out.filter((r, i) => !(season.odd && i === n - 1));
  // boundProvedOutOfReach: no lane deal of this season's round-robin weeks puts every team at the
  // bound (proved by a SAT solver), so a team off it is the season's limit, not a missed deal.
  return { rows: out, worstSpread, atBound, teams: n, repeats, realRows: real, boundProvedOutOfReach: Boolean(season.boundProvedOutOfReach) };
}

/** Independent check: every week, each team once and each pair once; every pair of teams meets as often as the cycles say. */
export function validateBowling(season) {
  const problems = [];
  const n = season.teams.length, P = season.nPairs;
  const meet = new Map();
  let rr = 0;
  for (const wk of season.weeks) {
    if (wk.matches.length !== P) problems.push(`Week ${wk.week} has ${wk.matches.length} matches on ${P} pairs.`);
    const pairs = new Set(wk.matches.map((m) => m.pair));
    if (pairs.size !== wk.matches.length) problems.push(`Week ${wk.week} uses a lane pair twice.`);
    if (wk.kind !== "round") continue;
    rr++;
    const seen = new Set();
    for (const m of wk.matches) {
      for (const t of [m.a, m.b]) {
        if (seen.has(t)) problems.push(`Week ${wk.week}: ${season.teams[t]} bowls twice.`);
        seen.add(t);
      }
      const key = m.a < m.b ? `${m.a},${m.b}` : `${m.b},${m.a}`;
      meet.set(key, (meet.get(key) || 0) + 1);
    }
    if (seen.size !== n) problems.push(`Week ${wk.week}: not every team bowls.`);
  }
  const full = Math.floor(rr / (n - 1));
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const c = meet.get(`${a},${b}`) || 0;
    if (c < full || c > full + 1) problems.push(`${season.teams[a]} and ${season.teams[b]} meet ${c} times; ${rr} round-robin weeks give ${full} or ${full + 1}.`);
  }
  for (let i = 1; i < season.weeks.length; i++) {
    if (season.weeks[i].day - season.weeks[i - 1].day < 7) problems.push(`Weeks ${i} and ${i + 1} are less than a week apart.`);
  }
  return problems;
}

function matchCells(season, wk, m) {
  if (wk.kind === "position") return [m.a, m.b];
  return [season.teams[m.a], season.teams[m.b]];
}

// Every cell goes through calc.mjs csvCell, the formula-injection guard (a cell starting =, +, -,
// @, tab or CR gets an apostrophe), so a team named "=SUM(...)" stays text in a spreadsheet.
export function bowlingCsv(season) {
  const lines = [["Week", "Date", "Lanes", "Team", "Opponent", "Note"].join(",")];
  for (const wk of season.weeks) {
    for (const m of wk.matches) {
      const [a, b] = matchCells(season, wk, m);
      const note = wk.kind === "position" ? "Position round" : `Cycle ${wk.cycle}, round ${wk.round}`;
      lines.push([wk.week, dayIso(wk.day), season.labels[m.pair], a, b, note].map(csvCell).join(","));
    }
  }
  return lines.join("\n") + "\n";
}

export function bowlingText(season) {
  const out = [];
  for (const wk of season.weeks) {
    out.push(`Week ${wk.week}, ${dayLabel(wk.day)}${wk.kind === "position" ? " (position round)" : ""}`);
    for (const m of wk.matches) {
      const [a, b] = matchCells(season, wk, m);
      out.push(`  ${season.labels[m.pair]}: ${a} v ${b}`);
    }
  }
  return out.join("\n") + "\n";
}

/** A grid with one row per team and one column per week: the lane pair it bowls on, for a printed sheet. */
export function teamLaneGrid(season) {
  return season.teams.map((name, t) => ({
    name,
    weeks: season.weeks.map((wk) => {
      if (wk.kind !== "round") return "Pos";
      const m = wk.matches.find((x) => x.a === t || x.b === t);
      return season.labels[m.pair].replace("Lanes ", "");
    }),
  }));
}
