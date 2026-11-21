// Side-by-side of the two Swiss pairers on simulated events: node eval/swiss-matching.mjs
// Each event: n players seeded by an Elo-like rating (2400 down in steps, plus noise), results drawn
// from the Elo expectation with a draw band, the same seeds for both pairers. Writes the table to
// stdout; eval/swiss-matching.txt keeps the run.
import { swissPairings, swissPairingsGreedy, swissStandings, colourClaim } from "../swiss.mjs";

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

function play(pairer, n, rounds, seed) {
  const r = rng(seed);
  const players = Array.from({ length: n }, (_, i) => `P${i + 1}`);
  const rating = players.map((_, i) => 2400 - i * (800 / n) + (r() - 0.5) * 120);
  const games = [];
  const byes = [];
  const m = { rounds: 0, failed: false, floaters: 0, scoreGap: 0, absClash: 0, strongClash: 0, threeRun: 0, cdOver2: 0, ms: 0, boards: 0 };
  for (let k = 0; k < rounds; k++) {
    const table = new Map(swissStandings(players, games, byes).map((x) => [x.index, x]));
    let round;
    const t0 = performance.now();
    try { round = pairer(players, games, byes); } catch { m.failed = true; break; }
    m.ms += performance.now() - t0;
    m.rounds++;
    for (const p of round.pairs) {
      const A = table.get(p.white);
      const B = table.get(p.black);
      m.boards++;
      const gap = Math.abs(A.score - B.score);
      if (gap > 0) m.floaters++;
      m.scoreGap += gap;
      const ca = colourClaim(A);
      const cb = colourClaim(B);
      if (ca.colour && ca.colour === cb.colour) {
        const s = Math.min(ca.strength, cb.strength);
        if (s === 3) m.absClash++; else if (s === 2) m.strongClash++;
      }
      const e = 1 / (1 + 10 ** ((rating[p.black] - rating[p.white] - 35) / 400));
      const u = r();
      const drawBand = 0.25;
      const res = u < e - drawBand / 2 ? [1, 0] : u < e + drawBand / 2 ? [1, 1] : [0, 1];
      games.push({ a: p.white, b: p.black, ga: res[0], gb: res[1] });
    }
    if (round.bye !== null) byes.push(round.bye);
  }
  const end = swissStandings(players, games, byes);
  for (const row of end) {
    if (Math.abs(row.whites - row.blacks) > 2) m.cdOver2++;
    for (let i = 2; i < row.last.length; i++) if (row.last[i] === row.last[i - 1] && row.last[i] === row.last[i - 2]) { m.threeRun++; break; }
  }
  return m;
}

const SIZES = [[8, 5], [9, 5], [12, 7], [16, 7], [17, 7], [24, 9], [33, 9], [50, 9], [64, 11], [101, 9], [151, 11]];
const SEEDS = Number(process.argv[2] ?? 40);
const fmt = (x, d = 2) => x.toFixed(d).padStart(7);
console.log(`Swiss pairers on simulated events, ${SEEDS} seeds per size (same seeds for both).`);
console.log("floats/rd = boards with unequal scores per round; gap = summed score gap per round;");
console.log("abs = boards where both players had an absolute claim on one colour (FIDE forbids);");
console.log("strong = both had a strong claim; 3-run / |cd|>2 = players per event ending with three of one colour running / colour gap past 2;");
console.log("failed = events where the pairer stopped before the last round; ms = pairing time per round.\n");
console.log("players rounds  pairer    failed floats/rd  gap/rd    abs/ev strong/ev 3-run/ev |cd|>2/ev  ms/rd");
const totals = { greedy: {}, matching: {} };
for (const [n, rounds] of SIZES) {
  for (const [name, fn] of [["greedy", swissPairingsGreedy], ["matching", swissPairings]]) {
    const acc = { failed: 0, floaters: 0, scoreGap: 0, absClash: 0, strongClash: 0, threeRun: 0, cdOver2: 0, ms: 0, rounds: 0 };
    for (let s = 0; s < SEEDS; s++) {
      const m = play(fn, n, rounds, 1000 * n + s);
      acc.failed += m.failed ? 1 : 0;
      for (const k of ["floaters", "scoreGap", "absClash", "strongClash", "threeRun", "cdOver2", "ms", "rounds"]) acc[k] += m[k];
    }
    for (const k of Object.keys(acc)) totals[name][k] = (totals[name][k] ?? 0) + acc[k];
    console.log(`${String(n).padStart(7)} ${String(rounds).padStart(6)}  ${name.padEnd(8)} ${String(acc.failed).padStart(6)} ${fmt(acc.floaters / acc.rounds)}   ${fmt(acc.scoreGap / acc.rounds)} ${fmt(acc.absClash / SEEDS)} ${fmt(acc.strongClash / SEEDS)} ${fmt(acc.threeRun / SEEDS)}  ${fmt(acc.cdOver2 / SEEDS)}  ${fmt(acc.ms / acc.rounds, 1)}`);
  }
}
console.log("\nAll sizes, totals:");
for (const name of ["greedy", "matching"]) {
  const t = totals[name];
  console.log(`  ${name.padEnd(8)} rounds paired ${t.rounds}, events failed ${t.failed}, floats ${t.floaters}, score gap ${t.scoreGap}, absolute clashes ${t.absClash}, strong clashes ${t.strongClash}, three-in-a-row players ${t.threeRun}, |cd|>2 players ${t.cdOver2}`);
}

// Deep events: keep pairing until the pairer says no rematch-free round exists (at most n-1 rounds
// for even n, n rounds for odd). A whole-round matching finds a round whenever one exists given
// the games so far, but earlier rounds differ between the pairers, so neither is ahead here.
console.log("\nDeep events: rounds paired before the pairer stopped (max = n-1 even, n odd), mean over seeds.");
console.log("players  max  greedy  matching  greedy-stopped-first  matching-stopped-first");
for (const n of [6, 7, 8, 10, 12, 14, 16, 20]) {
  const max = n % 2 ? n : n - 1;
  let g = 0, mt = 0, short = 0, long = 0;
  for (let s = 0; s < SEEDS; s++) {
    const a = play(swissPairingsGreedy, n, max, 7000 * n + s).rounds;
    const b = play(swissPairings, n, max, 7000 * n + s).rounds;
    g += a; mt += b; if (a < b) short++; if (b < a) long++;
  }
  console.log(`${String(n).padStart(7)} ${String(max).padStart(4)} ${fmt(g / SEEDS)} ${fmt(mt / SEEDS)}   ${String(short).padStart(10)} of ${SEEDS} ${String(long).padStart(14)} of ${SEEDS}`);
}
