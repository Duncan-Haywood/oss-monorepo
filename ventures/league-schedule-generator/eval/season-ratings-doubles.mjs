// Doubles ratings on synthetic rotating-partner nights (Americano-style), where the true levels
// are known. No public club doubles results were found for this check, so it is synthetic only:
// it says whether the composite-opponent rating recovers a known order better than the
// leaderboards clubs use today (win percentage, points difference), not how real players behave.
//
//   node eval/season-ratings-doubles.mjs > eval/season-ratings-doubles.txt
//
// Model: 16 players, true levels spread evenly over 1250..1750 (Elo scale). Each night 4 rounds
// of 4 courts, partners and opponents drawn at random. A game to 11: each rally is won by side A
// with p = 1 / (1 + 10^(-(meanA - meanB) / 400 / k)), k = 6 (so a 100-point gap is a ~54% rally,
// ~66% game); scores played out rally by rally (win by 1, to 11). Spearman rho to the true order
// after 2, 4, 8 and 12 nights; 200 seasons per cell, seeds 1..200.

import { rateSeason, fitSeason } from "../season-ratings.mjs";

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const N = 16, COURTS = 4, ROUNDS = 4, K = 6;
const truth = Array.from({ length: N }, (_, i) => 1250 + (500 * i) / (N - 1));
const name = (i) => `P${i}`;

function season(seed, nights, draw) {
  const rnd = rng(seed);
  const games = [];
  const pd = new Array(N).fill(0); // season points difference, for the Mexicano draw
  for (let n = 0; n < nights; n++) {
    const date = new Date(Date.UTC(2026, 0, 5 + 7 * n)).toISOString().slice(0, 10);
    for (let r = 0; r < ROUNDS; r++) {
      let idx = Array.from({ length: N }, (_, i) => i);
      for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      // Mexicano: after the first round of the season, courts by the table (1-4, 5-8, ...), 1 & 4 v 2 & 3.
      if (draw === "mexicano" && (n > 0 || r > 0)) {
        idx = idx.sort((x, y) => pd[y] - pd[x]);
        idx = idx.flatMap((_, k) => (k % 4 ? [] : [idx[k], idx[k + 3], idx[k + 1], idx[k + 2]]));
      }
      for (let c = 0; c < COURTS; c++) {
        const [a1, a2, b1, b2] = idx.slice(c * 4, c * 4 + 4);
        const p = 1 / (1 + 10 ** (-((truth[a1] + truth[a2]) / 2 - (truth[b1] + truth[b2]) / 2) / 400 / K));
        let sa = 0, sb = 0;
        while (sa < 11 && sb < 11) { if (rnd() < p) sa++; else sb++; }
        games.push({ date, a: [name(a1), name(a2)], b: [name(b1), name(b2)], sa, sb });
        pd[a1] += sa - sb; pd[a2] += sa - sb; pd[b1] += sb - sa; pd[b2] += sb - sa;
      }
    }
  }
  return games;
}

function spearman(order) {
  // order: names strongest first; truth rank of P i is N-1-i (P15 strongest).
  let d2 = 0;
  order.forEach((nm, rank) => { const i = +nm.slice(1); d2 += (rank - (N - 1 - i)) ** 2; });
  return 1 - (6 * d2) / (N * (N * N - 1));
}

function leaderboard(games, key) {
  const s = new Map();
  const add = (n, w, pd) => { const r = s.get(n) ?? { w: 0, g: 0, pd: 0 }; r.w += w; r.g++; r.pd += pd; s.set(n, r); };
  for (const g of games) {
    for (const n of g.a) add(n, g.sa > g.sb ? 1 : 0, g.sa - g.sb);
    for (const n of g.b) add(n, g.sb > g.sa ? 1 : 0, g.sb - g.sa);
  }
  return [...s.entries()].sort((x, y) => key(y[1]) - key(x[1]) || x[0].localeCompare(y[0])).map(([n]) => n);
}

const methods = {
  "win percentage": (g) => leaderboard(g, (r) => r.w / r.g + r.pd * 1e-6),
  "points difference (Americano table)": (g) => leaderboard(g, (r) => r.pd),
  "Glicko-2, wins only": (g) => rateSeason(g, { period: "date", margin: 0 }).table.map((r) => r.name),
  "Glicko-2, margin 0.5": (g) => rateSeason(g, { period: "date", margin: 0.5 }).table.map((r) => r.name),
  "Glicko-2, margin 1": (g) => rateSeason(g, { period: "date", margin: 1 }).table.map((r) => r.name),
  "Whole-season fit, wins only": (g) => fitSeason(g, { margin: 0 }).map((r) => r.name),
  "Whole-season fit, margin 0.5": (g) => fitSeason(g, { margin: 0.5 }).map((r) => r.name),
  "Whole-season fit, margin 1 (points share)": (g) => fitSeason(g, { margin: 1 }).map((r) => r.name),
};

// Box league (singles): boxes of 4 seeded from a noisy ranking (true level + N(0, 150)); each
// round every box plays a round robin of games to 11; then top 1 up, bottom 1 down. The box
// ladder's own order (box, then points in the box) is the competitor the ratings must beat.
function boxSeason(seed, rounds) {
  const rnd = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
  let order = Array.from({ length: N }, (_, i) => i).sort((x, y) => (truth[y] + 150 * gauss()) - (truth[x] + 150 * gauss()));
  const games = [];
  for (let r = 0; r < rounds; r++) {
    const date = new Date(Date.UTC(2026, 0, 5 + 28 * r)).toISOString().slice(0, 10);
    const next = [];
    for (let b = 0; b < N / 4; b++) {
      const box = order.slice(b * 4, b * 4 + 4);
      const pts = new Map(box.map((i) => [i, 0]));
      for (let x = 0; x < 4; x++) for (let y = x + 1; y < 4; y++) {
        const [i, j] = [box[x], box[y]];
        const p = 1 / (1 + 10 ** (-(truth[i] - truth[j]) / 400 / K));
        let si = 0, sj = 0;
        while (si < 11 && sj < 11) { if (rnd() < p) si++; else sj++; }
        games.push({ date, a: [name(i)], b: [name(j)], sa: si, sb: sj });
        pts.set(si > sj ? i : j, pts.get(si > sj ? i : j) + 3);
        pts.set(i, pts.get(i) + (si - sj) * 0.001); pts.set(j, pts.get(j) + (sj - si) * 0.001);
      }
      next.push(box.sort((x, y) => pts.get(y) - pts.get(x)));
    }
    order = next.flat();
    // Box ladder's order after the round, before moves, is `order`; apply moves for the next round.
    games.ladder = order.map(name);
    for (let b = 0; b + 1 < N / 4; b++) { const k = b * 4 + 3; [order[k], order[k + 1]] = [order[k + 1], order[k]]; }
  }
  return games;
}

const SEASONS = 200;
const nightsList = [2, 4, 8, 12];
console.log(`Synthetic doubles: ${N} players, ${COURTS} courts x ${ROUNDS} rounds a night, games to 11 played rally by rally, ${SEASONS} seasons per cell.`);
console.log("Mean Spearman rho between each table's order and the true order (1 = exact). Bracket: 2.5th-97.5th percentile over seasons.\n");
for (const draw of ["random", "mexicano"]) {
console.log(draw === "random" ? "\nRandom partners and opponents every round (Americano-style):" : "\nMexicano draw: after round 1, courts by the season table, 1 & 4 v 2 & 3 (strong meet strong):");
console.log(["method", ...nightsList.map((n) => `${n} nights`)].join(" | "));
for (const [label, fn] of Object.entries(methods)) {
  const cells = nightsList.map((nights) => {
    const rhos = [];
    for (let seed = 1; seed <= SEASONS; seed++) rhos.push(spearman(fn(season(seed, nights, draw))));
    rhos.sort((a, b) => a - b);
    const mean = rhos.reduce((a, b) => a + b, 0) / rhos.length;
    return `${mean.toFixed(3)} [${rhos[Math.floor(0.025 * SEASONS)].toFixed(2)}, ${rhos[Math.ceil(0.975 * SEASONS) - 1].toFixed(2)}]`;
  });
  console.log([label, ...cells].join(" | "));
}
}

console.log("\nBox league, singles, boxes of 4, one round = a round robin in each box, then 1 up 1 down (rounds instead of nights):");
console.log(["method", ...nightsList.map((n) => `${n} rounds`)].join(" | "));
const boxMethods = { "box ladder order (box, then points)": (g) => g.ladder, ...methods };
for (const [label, fn] of Object.entries(boxMethods)) {
  const cells = nightsList.map((rounds) => {
    const rhos = [];
    for (let seed = 1; seed <= SEASONS; seed++) rhos.push(spearman(fn(boxSeason(seed, rounds))));
    rhos.sort((a, b) => a - b);
    const mean = rhos.reduce((a, b) => a + b, 0) / rhos.length;
    return `${mean.toFixed(3)} [${rhos[Math.floor(0.025 * SEASONS)].toFixed(2)}, ${rhos[Math.ceil(0.975 * SEASONS) - 1].toFixed(2)}]`;
  });
  console.log([label, ...cells].join(" | "));
}

console.log("\nPaired, same 200 box seasons: seasons where the method's rho beats the box ladder's (ties count half).");
for (const label of ["points difference (Americano table)", "Glicko-2, margin 0.5", "Whole-season fit, margin 0.5", "Whole-season fit, margin 1 (points share)"]) {
  const cells = nightsList.map((rounds) => {
    let w = 0;
    for (let seed = 1; seed <= SEASONS; seed++) {
      const g = boxSeason(seed, rounds);
      const a = spearman(boxMethods[label](g)), b = spearman(g.ladder);
      w += a > b ? 1 : a === b ? 0.5 : 0;
    }
    return `${w} of ${SEASONS}`;
  });
  console.log([label, ...cells].join(" | "));
}
