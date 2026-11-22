// Test: lichess pairs each Swiss round on the players' live ratings, but the finished TRF it exports
// holds the ratings at export time. Backing each player's rating out game by game (an Elo-style step
// of K x (score - expected)) estimates the rating they had when round k was paired; the pairing
// numbers are then re-sorted by that estimate before the round is replayed.
//
//   node eval/lichess-live-ratings.mjs <swisspairing>/benchmarks/fixtures/lichess [K ...]
//
// K = 0 is the file as exported (the old replay). Prints board recall per K, all rounds and 2+.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseTrf } from "../trf.mjs";
import { pairRound } from "./swiss-replay.mjs";

const SCORE = { "1": 1, W: 1, "+": 1, "0": 0, L: 0, "-": 0, "=": 0.5, D: 0.5 };
const expected = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));

/** Ratings before round k (1-based), backed out from the file's ratings over rounds k..last. */
export function ratingsBefore(trf, k, K) {
  const P = trf.players;
  let r = P.map((p) => p.rating ?? 1500);
  const last = Math.max(...P.map((p) => p.rounds.length));
  for (let m = last; m >= k; m--) {
    const next = r.slice();
    for (const [i, p] of P.entries()) {
      const b = p.rounds[m - 1];
      if (!b || b.opponent == null || !(b.result in SCORE) || /[+\-]/.test(b.result)) continue;
      // One fixed-point step: expected score from the ratings before this game, approximated by after.
      let before = r[i];
      for (let it = 0; it < 3; it++) before = r[i] - K * (SCORE[b.result] - expected(before, r[b.opponent]));
      next[i] = before;
    }
    r = next;
  }
  return r;
}

/** The TRF re-numbered by `rating` (highest first, ties by old number), with a map back to old ids. */
export function reseed(trf, rating) {
  const order = trf.players.map((_, i) => i).sort((a, b) => rating[b] - rating[a] || a - b);
  const newIndex = new Map(order.map((old, n) => [old, n]));
  const players = order.map((old, n) => ({
    ...trf.players[old],
    id: n + 1,
    rating: Math.round(rating[old]),
    rounds: trf.players[old].rounds.map((b) => (b ? { ...b, opponent: b.opponent == null ? null : newIndex.get(b.opponent) } : b)),
  }));
  return { trf: { ...trf, players }, oldId: (id) => trf.players[order[id - 1]].id };
}

const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  const Ks = process.argv.slice(3).map(Number);
  for (const K of Ks.length ? Ks : [0, 10, 15, 20, 25, 30]) {
    let boards = 0, hit = 0, lb = 0, lh = 0, exact = 0, rounds = 0;
    const per = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".trf")).sort()) {
      const trf = parseTrf(readFileSync(join(dir, f), "utf8"));
      const last = Math.max(...trf.players.map((p) => p.rounds.length));
      const row = [];
      let eb = 0, eh = 0;
      for (let k = 1; k <= last; k++) {
        const games = [];
        for (const p of trf.players) {
          const b = p.rounds[k - 1];
          if (b && b.opponent != null && b.colour === "W" && !/[+\-]/.test(b.result)) games.push(key(p.id, trf.players[b.opponent].id));
        }
        if (!games.length) continue;
        const seated = new Set(games.flatMap((g) => g.split("-").map(Number)));
        const { trf: t, oldId } = reseed(trf, ratingsBefore(trf, k, K));
        const noBoard = t.players.filter((p) => !seated.has(oldId(p.id))).map((p) => p.id);
        const ours = pairRound(t, k, noBoard);
        const mine = new Set(ours.boards.map(([w, b]) => key(oldId(w), oldId(b))));
        const h = games.filter((g) => mine.has(g)).length;
        boards += games.length; hit += h; rounds++;
        if (h === games.length && ours.boards.length === games.length) exact++;
        if (k > 1) { lb += games.length; lh += h; }
        eb += games.length; eh += h;
        row.push((h / games.length).toFixed(2));
      }
      per.push(`  ${f.replace(/^lichess_swiss_|\.trf$/g, "").slice(0, 40).padEnd(40)} ${String(eh).padStart(3)}/${String(eb).padEnd(3)} ${row.join(" ")}`);
    }
    console.log(`K=${String(K).padStart(2)}  boards ${hit}/${boards} = ${(hit / boards).toFixed(3)}  rounds 2+ ${(lh / lb).toFixed(3)}  exact rounds ${exact}/${rounds}`);
    for (const l of per) console.log(l);
  }
}
