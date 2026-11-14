// Runs the formula, the fixed-load trip sample and the random-arrival
// simulation over a grid of buildings, and prints a Markdown table.
// node bench/grid.mjs > bench/grid.md
import { upPeak } from '../engine.mjs';
import { tripSample, simulate } from '../sim.mjs';

const rows = [];
for (const floors of [6, 12, 20]) {
  for (const [lifts, load] of [[2, 1000], [4, 1275], [6, 1600]]) {
    for (const speed of [1.6, 2.5, 4.0]) {
      const b = {
        lifts, ratedLoad: load, capacityFactor: 80, speed, acceleration: 1.0, jerk: 1.5, startDelay: 0.5,
        doorOpen: 2.0, doorClose: 3.0, advanceOpening: 0, loadTime: 1.2, unloadTime: 1.2, expressRise: 0, lossesPct: 0,
        floors: Array.from({ length: floors }, () => ({ rise: 3.6, population: 80 })),
      };
      const f = upPeak(b);
      const c = tripSample(b, { trips: 20000, seed: 1 });
      const seeds = [11, 23, 37, 41, 53];
      const at = seeds.map((seed) => simulate(b, { demandPct: f.pctPop, seed, duration: 4200, warmup: 600 }));
      const avg = (k) => at.reduce((s, r) => s + r[k], 0) / at.length;
      // Highest demand (in 0.25% steps) the simulated hour still carries with a mean wait under one interval.
      rows.push({ floors, lifts, load, speed, rtt: f.rtt, gap: c.gapPct, interval: f.interval, pct: f.pctPop, wait: avg('meanWait'), load80: avg('meanLoad'), carried: avg('carriedPctPer5min') });
    }
  }
}
console.log('| floors | lifts x kg | m/s | RTT s | formula vs trips | interval s | %POP | sim mean wait at %POP | wait / interval | mean car load (of rated) | carried %/5 min |');
console.log('|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const r of rows) {
  const cap = Math.floor(r.load / 75);
  console.log(`| ${r.floors} | ${r.lifts} x ${r.load} | ${r.speed} | ${r.rtt.toFixed(1)} | ${r.gap >= 0 ? '+' : ''}${r.gap.toFixed(2)}% | ${r.interval.toFixed(1)} | ${r.pct.toFixed(1)} | ${r.wait.toFixed(1)} | ${(r.wait / r.interval).toFixed(2)} | ${r.load80.toFixed(1)} (${cap}) | ${r.carried.toFixed(1)} |`);
}
const ratios = rows.map((r) => r.wait / r.interval).sort((a, b) => a - b);
const gaps = rows.map((r) => r.gap).sort((a, b) => a - b);
console.log(`\n${rows.length} buildings. Formula minus sampled-trip mean: ${gaps[0].toFixed(2)}% to ${gaps[gaps.length - 1].toFixed(2)}%. Wait / interval at the formula's own handling capacity: median ${ratios[Math.floor(ratios.length / 2)].toFixed(2)}, range ${ratios[0].toFixed(2)} to ${ratios[ratios.length - 1].toFixed(2)}.`);

// Sensitivity to the dispatcher's one free parameter, the lobby dwell time,
// and to how hard the building is pushed (demand as a share of the formula's %POP).
console.log('\n| lobby dwell s | demand / %POP | median wait / interval | buildings with mean car load > 95% of rated |');
console.log('|---:|---:|---:|---:|');
for (const dwell of [4, 8, 15]) {
  for (const share of [0.5, 0.8, 1.0]) {
    const rs = [];
    let full = 0;
    for (const floors of [6, 12, 20]) for (const [lifts, load] of [[2, 1000], [4, 1275], [6, 1600]]) for (const speed of [1.6, 2.5, 4.0]) {
      const b = { lifts, ratedLoad: load, capacityFactor: 80, speed, acceleration: 1.0, jerk: 1.5, startDelay: 0.5, doorOpen: 2.0, doorClose: 3.0, loadTime: 1.2, unloadTime: 1.2, floors: Array.from({ length: floors }, () => ({ rise: 3.6, population: 80 })) };
      const f = upPeak(b);
      const runs = [11, 23, 37].map((seed) => simulate(b, { demandPct: f.pctPop * share, seed, dwell, duration: 4200 }));
      const w = runs.reduce((s, r) => s + r.meanWait, 0) / runs.length;
      const ld = runs.reduce((s, r) => s + r.meanLoad, 0) / runs.length;
      if (ld > 0.95 * Math.floor(load / 75)) full++;
      rs.push(w / f.interval);
    }
    rs.sort((a, b) => a - b);
    console.log(`| ${dwell} | ${share} | ${rs[Math.floor(rs.length / 2)].toFixed(2)} | ${full} of ${rs.length} |`);
  }
}
