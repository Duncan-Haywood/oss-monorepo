// Random part-played leagues through standings, playoffRace and playoffOdds.
// Checks: the exact race agrees with an independent brute force over every outcome (best and worst rank by
// points, tie counted against the team); the safe-bounds route (exactLimit 0) never contradicts the exact one
// ("clinched" or "eliminated" under bounds must hold under exact); magic is only set for "alive" teams and
// lies within the points still available; playoffOdds gives a clinched team 1, an eliminated team 0, chances
// summing to the number of spots, and the same answer twice; standings rank 1..n with points matching a recount.
// Usage: node eval/fuzz-race.mjs [count] [seed]
import { roundRobin, playoffRace, playoffOdds, standings, mulberry32 } from "../calc.mjs";

const count = Number(process.argv[2] || 300);
const rnd = mulberry32(Number(process.argv[3] || 5));
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const stats = { leagues: 0, exact: 0, clinched: 0, eliminated: 0, alive: 0, odds: 0 };
const bad = [];
const fail = (kind, extra) => bad.push({ kind, ...extra });

for (let i = 0; i < count; i++) {
  const n = int(3, 7);
  const teams = Array.from({ length: n }, (_, k) => `T${k + 1}`);
  const fixtures = roundRobin(n, { double: rnd() < 0.3 }).flatMap((r) => r.matches);
  const nLeft = int(0, Math.min(8, fixtures.length));
  const order = fixtures.map((f) => [rnd(), f]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const remaining = order.slice(0, nLeft);
  const results = order.slice(nLeft).map(([a, b]) => ({ a, b, ga: int(0, 3), gb: int(0, 3) }));
  const scoring = rnd() < 0.7 ? { win: 3, draw: 1, loss: 0 } : { win: 2, draw: 1, loss: 0 };
  const spots = int(1, n);
  const adjustments = rnd() < 0.2 ? { [int(0, n - 1)]: int(-3, 3) } : {};
  const opts = { ...scoring, adjustments };
  stats.leagues++;

  // independent brute force
  const base = Array.from({ length: n }, (_, k) => adjustments[k] ?? 0);
  for (const r of results) {
    if (r.ga > r.gb) { base[r.a] += scoring.win; base[r.b] += scoring.loss; }
    else if (r.ga < r.gb) { base[r.b] += scoring.win; base[r.a] += scoring.loss; }
    else { base[r.a] += scoring.draw; base[r.b] += scoring.draw; }
  }
  const best = Array(n).fill(n), worst = Array(n).fill(1);
  const total = 3 ** remaining.length;
  for (let code = 0; code < total; code++) {
    const p = base.slice();
    let c = code;
    for (const [a, b] of remaining) {
      const o = c % 3; c = Math.floor(c / 3);
      if (o === 0) { p[a] += scoring.win; p[b] += scoring.loss; }
      else if (o === 1) { p[a] += scoring.draw; p[b] += scoring.draw; }
      else { p[b] += scoring.win; p[a] += scoring.loss; }
    }
    for (let t = 0; t < n; t++) {
      let above = 0, level = 0;
      for (let j = 0; j < n; j++) if (j !== t) { if (p[j] > p[t]) above++; else if (p[j] === p[t]) level++; }
      best[t] = Math.min(best[t], above + 1);
      worst[t] = Math.max(worst[t], above + level + 1);
    }
  }
  const k = Math.max(1, Math.min(spots, n));
  const exact = playoffRace(teams, results, remaining, spots, opts);
  const safe = playoffRace(teams, results, remaining, spots, { ...opts, exactLimit: -1 });
  if (!exact.exact || safe.exact) fail("exact-flag", { n, nLeft });
  const left = Array(n).fill(0);
  for (const [a, b] of remaining) { left[a]++; left[b]++; }
  for (const row of exact) {
    stats.exact++; stats[row.status]++;
    const t = row.index;
    if (row.points !== base[t]) fail("points", { n, row });
    if (row.bestRank !== best[t] || row.worstRank !== worst[t]) fail("ranks-vs-brute-force", { n, row, best: best[t], worst: worst[t] });
    const status = worst[t] <= k ? "clinched" : best[t] > k ? "eliminated" : "alive";
    if (row.status !== status) fail("status", { n, row, status });
    if (row.magic !== null && (row.status !== "alive" || row.magic < 1 || row.magic > left[t] * scoring.win)) fail("magic", { n, row });
    const s = safe.find((x) => x.index === t);
    if (s.status === "clinched" && row.status !== "clinched") fail("bounds-clinched-wrong", { n, s, row });
    if (s.status === "eliminated" && row.status !== "eliminated") fail("bounds-eliminated-wrong", { n, s, row });
    if (s.bestRank > row.bestRank || s.worstRank < row.worstRank) fail("bounds-not-safe", { n, s, row });
  }

  const o1 = playoffOdds(teams, results, remaining, spots, { ...opts, runs: 400, seed: 3 });
  const o2 = playoffOdds(teams, results, remaining, spots, { ...opts, runs: 400, seed: 3 });
  stats.odds++;
  if (JSON.stringify(o1) !== JSON.stringify(o2)) fail("odds-not-deterministic", { n });
  const sum = o1.reduce((a, r) => a + r.chance, 0);
  if (Math.abs(sum - k) > 1e-9) fail("odds-sum", { n, sum, k });
  for (const row of exact) {
    const c = o1[row.index].chance;
    if (row.status === "clinched" && c !== 1) fail("odds-clinched", { n, row, c });
    if (row.status === "eliminated" && c !== 0) fail("odds-eliminated", { n, row, c });
  }

  const table = standings(teams, results, { ...scoring, adjustments });
  if (table.some((r, idx) => r.rank !== idx + 1) || new Set(table.map((r) => r.index)).size !== n) fail("standings-rank", { n });
  for (const r of table) if (r.points !== base[r.index]) fail("standings-points", { n, r });
  for (let q = 1; q < table.length; q++) if (table[q].points > table[q - 1].points) fail("standings-order", { n });
}

console.log(JSON.stringify(stats));
console.log(`invalid ${bad.length}`);
for (const b of bad.slice(0, 3)) console.log(JSON.stringify(b, null, 1).slice(0, 1500));
process.exit(bad.length ? 1 : 0);
