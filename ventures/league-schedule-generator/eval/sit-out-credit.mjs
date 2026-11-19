// How much does the sit-out rule decide who wins an Americano night?
//
// Simulated nights, not real ones: each player gets a hidden skill ~ N(0, 1); a game is played to a
// total of 24 points, each point won by side A with probability logistic(skillA - skillB) where a
// side's skill is the sum of its two players. For every size 5-15 that is not a multiple of four
// (so someone sits out each round) on floor(n/4) courts, and a 6-round night (about 90 minutes of
// 15-minute games), 2,000 nights are dealt with night.mjs (the page's own rotation) and scored under
// each sit-out rule. Reported: how often the winner is the most skilled player, how often the rule
// changes the winner versus "none", and how often the winner sat out fewer rounds than someone else.
//
// Run: node eval/sit-out-credit.mjs > eval/sit-out-credit.txt   (about 1 minute)

import { newNight, setScore, leaderboard } from "../night.mjs";

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

const NIGHTS = Number(process.env.NIGHTS || 2000);
const ROUNDS = 6;
const TARGET = 24;
const rules = ["none", "average", "half"];
console.log(`Sit-out rule vs who wins: ${NIGHTS} simulated nights per size, ${ROUNDS} rounds, games to ${TARGET}`);
console.log("size courts | best-skill wins: none / average / half | winner differs from none: average / half | none's winner sat out less than the most-rested");
const totals = { best: [0, 0, 0], diff: [0, 0], fewer: 0, n: 0 };
for (let n = 5; n <= 15; n++) {
  if (n % 4 === 0) continue;
  const courts = Math.floor(n / 4);
  const best = [0, 0, 0], diff = [0, 0];
  let fewer = 0;
  const r = rng(1000 + n);
  for (let t = 0; t < NIGHTS; t++) {
    const players = Array.from({ length: n }, (_, i) => `P${i}`);
    const skill = players.map(() => gauss(r));
    const top = skill.indexOf(Math.max(...skill));
    let night = newNight({ players, courts, rounds: ROUNDS, target: TARGET, sitOut: "none", seed: 1 + t });
    night.rounds.forEach((round, k) => {
      for (const m of round.matches) {
        const p = 1 / (1 + Math.exp(-((skill[m.a[0]] + skill[m.a[1]]) - (skill[m.b[0]] + skill[m.b[1]])) * 0.5));
        let a = 0;
        for (let i = 0; i < TARGET; i++) if (r() < p) a++;
        night = setScore(night, k, m.court, a, TARGET - a).night;
      }
    });
    const winners = rules.map((rule) => leaderboard({ ...night, sitOut: rule })[0]);
    winners.forEach((w, k) => { if (w.i === top) best[k]++; });
    if (winners[1].i !== winners[0].i) diff[0]++;
    if (winners[2].i !== winners[0].i) diff[1]++;
    const table = leaderboard(night);
    if (winners[0].satOut < Math.max(...table.map((x) => x.satOut))) fewer++;
  }
  const pc = (x) => `${((100 * x) / NIGHTS).toFixed(1)}%`.padStart(6);
  console.log(`${String(n).padStart(4)} ${String(courts).padStart(6)} | ${best.map(pc).join(" / ")} | ${diff.map(pc).join(" / ")} | ${pc(fewer)}`);
  best.forEach((x, k) => { totals.best[k] += x; });
  diff.forEach((x, k) => { totals.diff[k] += x; });
  totals.fewer += fewer; totals.n += NIGHTS;
}
const pt = (x) => `${((100 * x) / totals.n).toFixed(1)}%`;
console.log(`all sizes: best-skill wins ${totals.best.map(pt).join(" / ")}; winner changed ${totals.diff.map(pt).join(" / ")}; none's winner rested less than someone ${pt(totals.fewer)}`);
