// Lane-pair balance of bowlingSchedule() against hand rotations and the floor/ceil bound.
// node eval/bowling-lanes.mjs > eval/bowling-lanes.txt
// For each league size and season length: how many teams bowl every pair floor(W/P) or
// ceil(W/P) times (the least spread possible), the worst team's spread (most - fewest weeks on a
// pair), and back-to-back weeks on the same pair, for four assignments of the same round robin.
import { assignLanes } from "../bowling.mjs";
import { roundRobin } from "../calc.mjs";

function measure(plan, n, P) {
  const c = Array.from({ length: n }, () => new Array(P).fill(0));
  const last = new Array(n).fill(-1);
  let rep = 0;
  for (const wk of plan) for (const [a, b, p] of wk) for (const t of [a, b]) { c[t][p]++; if (last[t] === p) rep++; last[t] = p; }
  let worst = 0, at = 0;
  for (let t = 0; t < n; t++) {
    const s = Math.max(...c[t]) - Math.min(...c[t]);
    const W = c[t].reduce((x, y) => x + y, 0);
    worst = Math.max(worst, s);
    if (s === (W % P ? 1 : 0)) at++;
  }
  return { worst, at, rep };
}

const sizes = [6, 8, 10, 12, 14, 16, 18, 20, 24];
const seasons = [26, 30, 32, 34];
const modes = ["naive", "rotate", "greedy", "polished"];
const tot = Object.fromEntries(modes.map((m) => [m, { all: 0, rep: 0, worst: 0 }]));
let ms = 0;
console.log("teams weeks | " + modes.map((m) => `${m}: at-bound worst repeats`).join(" | "));
for (const n of sizes) for (const W of seasons) {
  const cyc = roundRobin(n);
  const rounds = [];
  for (let k = 0; k < W; k++) rounds.push(cyc[k % cyc.length].matches);
  const cells = [];
  for (const mode of modes) {
    const t0 = Date.now();
    const r = measure(assignLanes(rounds, n, n / 2, { mode }), n, n / 2);
    if (mode === "polished") ms += Date.now() - t0;
    tot[mode].all += r.at === n; tot[mode].rep += r.rep; tot[mode].worst = Math.max(tot[mode].worst, r.worst);
    cells.push(`${r.at}/${n} ${r.worst} ${r.rep}`);
  }
  console.log(`${String(n).padStart(5)} ${String(W).padStart(5)} | ${cells.join(" | ")}`);
}
const cases = sizes.length * seasons.length;
console.log("");
for (const m of modes) console.log(`${m}: every team at the bound in ${tot[m].all} of ${cases} seasons; worst spread ${tot[m].worst}; repeats ${tot[m].rep} in total`);
console.log(`polished: ${(ms / cases).toFixed(0)} ms per season on average on this machine`);
