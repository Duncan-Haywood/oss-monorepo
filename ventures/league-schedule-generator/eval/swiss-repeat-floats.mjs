// Repeat floats (FIDE Dutch C.14-C.17) with and without the rule: node eval/swiss-repeat-floats.mjs [seeds]
// Same simulated events as eval/swiss-matching.mjs (Elo-style results with draws, the same seeds for
// both settings). A repeat float is a player floating down (or taking the bye) right after floating
// down, or up right after floating up; "2 back" is the same two rounds apart. eval/swiss-repeat-floats.txt
// keeps the run.
import { swissPairings, swissStandings, colourClaim, floatHistory } from "../swiss.mjs";

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

function play(opts, n, rounds, seed) {
  const r = rng(seed);
  const players = Array.from({ length: n }, (_, i) => `P${i + 1}`);
  const rating = players.map((_, i) => 2400 - i * (800 / n) + (r() - 0.5) * 120);
  const games = [];
  const byes = [];
  const m = { rounds: 0, failed: false, floaters: 0, scoreGap: 0, strongClash: 0, mildClash: 0, absClash: 0, ms: 0 };
  for (let k = 0; k < rounds; k++) {
    const table = new Map(swissStandings(players, games, byes).map((x) => [x.index, x]));
    let round;
    const t0 = performance.now();
    try { round = swissPairings(players, games, byes, [], opts); } catch { m.failed = true; break; }
    m.ms += performance.now() - t0;
    m.rounds++;
    for (const p of round.pairs) {
      const A = table.get(p.white);
      const B = table.get(p.black);
      const gap = Math.abs(A.score - B.score);
      if (gap > 0) m.floaters++;
      m.scoreGap += gap;
      const ca = colourClaim(A);
      const cb = colourClaim(B);
      if (ca.colour && ca.colour === cb.colour) {
        const s = Math.min(ca.strength, cb.strength);
        if (s === 3) m.absClash++; else if (s === 2) m.strongClash++; else m.mildClash++;
      }
      const e = 1 / (1 + 10 ** ((rating[p.black] - rating[p.white] - 35) / 400));
      const u = r();
      const res = u < e - 0.125 ? [1, 0] : u < e + 0.125 ? [1, 1] : [0, 1];
      games.push({ a: p.white, b: p.black, ga: res[0], gb: res[1] });
    }
    if (round.bye !== null) byes.push(round.bye);
  }
  // Count repeats from the finished event's float history (independent of the pairer's own count).
  const { history } = floatHistory(players, games, byes);
  m.rd1 = 0; m.ru1 = 0; m.rd2 = 0; m.ru2 = 0;
  for (const h of history.values()) {
    for (let t = 1; t < h.length; t++) {
      if (h[t] === "down" && h[t - 1] === "down") m.rd1++;
      if (h[t] === "up" && h[t - 1] === "up") m.ru1++;
      if (t >= 2 && h[t] === "down" && h[t - 2] === "down") m.rd2++;
      if (t >= 2 && h[t] === "up" && h[t - 2] === "up") m.ru2++;
    }
  }
  return m;
}

const SIZES = [[8, 5], [9, 5], [12, 7], [16, 7], [17, 7], [24, 9], [33, 9], [50, 9], [64, 11], [101, 9], [151, 11]];
const SEEDS = Number(process.argv[2] ?? 40);
// Optional third argument: the Dutch-order cost to use in both arms (swissPairings `dutchOrder`).
// Optional fourth: the pairing method, "matching" (default) or "bracket" (eval/swiss-bracket-dutch.md).
const ORDER = { ...(process.argv[3] && process.argv[3] !== "-" ? { dutchOrder: process.argv[3] } : {}), ...(process.argv[4] ? { pairing: process.argv[4] } : {}) };
const KEYS = ["rd1", "ru1", "rd2", "ru2", "floaters", "scoreGap", "absClash", "strongClash", "mildClash", "ms", "rounds", "failed"];
const fmt = (x, d = 2) => x.toFixed(d).padStart(7);
console.log(`Repeat floats per event, ${SEEDS} seeds per size, the same events with the rule off and on.`);
console.log("down1/up1 = players floating the same way as the round before (a bye counts as down); down2/up2 = as two rounds before;");
console.log("floats/rd and gap/rd as in eval/swiss-matching.txt; strong/mild = boards where both players claimed one colour; ms = per round.\n");
console.log("players rounds  rule  failed  down1/ev  up1/ev down2/ev  up2/ev floats/rd  gap/rd strong/ev mild/ev  ms/rd");
const totals = { off: {}, on: {} };
for (const [n, rounds] of SIZES) {
  for (const [name, opts] of [["off", { repeatFloats: false, ...ORDER }], ["on", { repeatFloats: true, ...ORDER }]]) {
    const acc = Object.fromEntries(KEYS.map((k) => [k, 0]));
    for (let s = 0; s < SEEDS; s++) {
      const m = play(opts, n, rounds, 1000 * n + s);
      for (const k of KEYS) acc[k] += k === "failed" ? (m.failed ? 1 : 0) : m[k];
    }
    for (const k of KEYS) totals[name][k] = (totals[name][k] ?? 0) + acc[k];
    console.log(`${String(n).padStart(7)} ${String(rounds).padStart(6)}  ${name.padEnd(4)} ${String(acc.failed).padStart(6)} ${fmt(acc.rd1 / SEEDS)} ${fmt(acc.ru1 / SEEDS)} ${fmt(acc.rd2 / SEEDS)} ${fmt(acc.ru2 / SEEDS)}   ${fmt(acc.floaters / acc.rounds)} ${fmt(acc.scoreGap / acc.rounds)}   ${fmt(acc.strongClash / SEEDS)} ${fmt(acc.mildClash / SEEDS)} ${fmt(acc.ms / acc.rounds, 1)}`);
  }
}
console.log("\nAll sizes, totals:");
for (const name of ["off", "on"]) {
  const t = totals[name];
  console.log(`  rule ${name.padEnd(3)}: rounds ${t.rounds}, failed ${t.failed}, repeat down ${t.rd1}, repeat up ${t.ru1}, down 2 back ${t.rd2}, up 2 back ${t.ru2}, floats ${t.floaters}, score gap ${t.scoreGap}, absolute ${t.absClash}, strong ${t.strongClash}, mild ${t.mildClash}`);
}
