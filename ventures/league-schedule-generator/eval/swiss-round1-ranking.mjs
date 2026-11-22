// Why round 1 of two chess-results events misses (2026-11-22). Round 1 of a Dutch Swiss is fixed by the
// ranking alone: S1 (the top half) meets S2 (the bottom half) board by board. So the published round 1
// spells out the order the arbiter ranked S2 in. This script reads that order back, finds the fewest
// players who sit out of the TRF's own order (everyone not in the longest increasing run of S2 pairing
// numbers), moves each to the slot the published board gives it, and replays every round of the event
// with that ranking. If the replay matches, the miss is the ranking in the file, not the pairing rule.
//
//   sh eval/swiss-vs-published-fetch.sh /tmp/swisspairing
//   node eval/swiss-round1-ranking.mjs /tmp/swisspairing/benchmarks/fixtures
//
// Condition `played` as in eval/swiss-vs-published.mjs: players with no board are entered absent first.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseTrf } from "../trf.mjs";
import { pairRound } from "./swiss-replay.mjs";

const dir = process.argv[2];
if (!dir || !existsSync(join(dir, "chess_results"))) {
  console.error("usage: node eval/swiss-round1-ranking.mjs <swisspairing>/benchmarks/fixtures");
  process.exit(2);
}

const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** Indices (into seq) of one longest strictly increasing subsequence. */
export function longestIncreasing(seq) {
  const tails = [], prev = new Array(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i++) {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (seq[tails[m]] < seq[i]) lo = m + 1; else hi = m; }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const out = [];
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) out.push(i);
  return out.reverse();
}

/**
 * From round 1's published boards (TRF ids), the ranking the arbiter paired on: S1 is the half with the
 * lower pairing numbers, boards ordered by their S1 player; S2 players out of the TRF order are moved
 * to sit just before the S2 player of the next board. Returns { order (ids, best first), moved }.
 */
export function inferRanking(allIds, boards) {
  const seated = boards.map(([a, b]) => [Math.min(a, b), Math.max(a, b)]).sort((x, y) => x[0] - y[0]);
  const s2 = seated.map((b) => b[1]);
  const keep = new Set(longestIncreasing(s2).map((i) => s2[i]));
  const moved = [];
  let order = allIds.filter((id) => keep.has(id) || !s2.includes(id));
  // Insert from the last board up, so each moved player lands before the next board's S2 player.
  for (let i = s2.length - 1; i >= 0; i--) {
    if (keep.has(s2[i])) continue;
    const next = s2.slice(i + 1).find((id) => order.includes(id));
    const at = next == null ? order.length : order.indexOf(next);
    order.splice(at, 0, s2[i]);
    moved.push({ id: s2[i], board: i + 1, before: next ?? null, s1: seated[i][0] });
  }
  return { order, moved: moved.reverse() };
}

/** The parsed TRF with its players reordered to `order` (ids); opponents are remapped, ids kept. */
export function reorder(trf, order) {
  const at = new Map(trf.players.map((p, i) => [p.id, i]));
  const newIndex = new Map(order.map((id, j) => [at.get(id), j]));
  const players = order.map((id) => {
    const p = trf.players[at.get(id)];
    return { ...p, rounds: p.rounds.map((b) => (b && b.opponent != null ? { ...b, opponent: newIndex.get(b.opponent) } : b)) };
  });
  return { ...trf, players };
}

const cr = join(dir, "chess_results");
console.log("# node eval/swiss-round1-ranking.mjs <fixtures>, condition played, gbtami/swisspairing 193ad99\n");
const total = { file: [0, 0, 0, 0], inferred: [0, 0, 0, 0] };
for (const ev of readdirSync(cr).sort()) {
  const manifest = JSON.parse(readFileSync(join(cr, ev, "published_pairings.json"), "utf8"));
  const read = (r) => {
    const trf = parseTrf(readFileSync(join(cr, ev, r.trf), "utf8"));
    const games = r.published_pairings.filter(([, b]) => b != null).map(([w, b]) => [Number(w), Number(b)]);
    const seated = new Set(games.flat());
    return { trf, games, noBoard: trf.players.map((p) => p.id).filter((id) => !seated.has(id)) };
  };
  const r1 = read(manifest.rounds[0]);
  const { order, moved } = inferRanking(r1.trf.players.map((p) => p.id), r1.games);
  const rating = new Map(r1.trf.players.map((p) => [p.id, p.rating]));
  console.log(`${ev}: ${moved.length} player(s) out of the file's order in round 1`);
  for (const m of moved) {
    const nb = m.before == null ? "the end" : `${m.before} (rated ${rating.get(m.before)})`;
    console.log(`  ${m.id} (rated ${rating.get(m.id)}) meets ${m.s1} on board ${m.board}: ranked before ${nb}`);
  }
  const line = { file: [], inferred: [] };
  for (const r of manifest.rounds) {
    const { trf, games, noBoard } = read(r);
    const theirs = new Set(games.map(([a, b]) => key(a, b)));
    for (const [name, t] of [["file", trf], ["inferred", reorder(trf, order)]]) {
      const ours = pairRound(t, r.round_number, noBoard);
      const hit = ours.boards.filter(([a, b]) => theirs.has(key(a, b))).length;
      const exact = hit === games.length && ours.boards.length === games.length;
      line[name].push(`${exact ? "=" : "x"}${(hit / games.length).toFixed(2)}`);
      const T = total[name];
      T[0] += exact; T[1]++; T[2] += hit; T[3] += games.length;
    }
  }
  console.log(`  file order     ${line.file.join(" ")}`);
  console.log(`  inferred order ${line.inferred.join(" ")}\n`);
}
for (const [name, [e, n, h, b]] of Object.entries(total)) console.log(`ALL ${name.padEnd(9)} exact ${e} of ${n} rounds, board recall ${(h / b).toFixed(3)} (${h}/${b})`);
