// Carry-over effect on real published league fixture lists, against the circle method and the
// low-carry-over search, for the same number of teams and the same double round robin shape.
//
//   node eval/carryover-real.mjs            # table to stdout
//   node eval/carryover-real.mjs --json     # rows as JSON
//
// Data: eval/data/openfootball-fixtures.json, 20 top-flight seasons (England, Germany, Spain,
// France, Italy; 2021-22 to 2024-25) from openfootball/football.json, public domain (CC0).
// "Planned" orders each team's games by matchday (the published fixture list); "played" orders
// them by match date (postponed games move). COE is Russell's carry-over value, non-cyclic (a
// season does not wrap): sum over (i, j) of c[i][j]^2, c[i][j] = how many teams play i and then j.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { carryOverFromOpponents, lowCarryOverRounds } from "../carryover.mjs";
import { roundRobin } from "../calc.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, "data", "openfootball-fixtures.json"), "utf8"));

function opponents(n, matches, key) {
  const per = Array.from({ length: n }, () => []);
  for (const m of matches) { per[m[2]].push([key(m), m[3]]); per[m[3]].push([key(m), m[2]]); }
  return per.map((l) => l.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map((x) => x[1]));
}

function breaksByMatchday(n, matches) {
  const per = Array.from({ length: n }, () => []);
  for (const m of matches) { per[m[2]].push([m[0], 1]); per[m[3]].push([m[0], 0]); }
  let b = 0;
  for (const l of per) { l.sort((x, y) => x[0] - y[0]); for (let i = 1; i < l.length; i++) if (l[i][1] === l[i - 1][1]) b++; }
  return b;
}

function doubleOpponents(n, rounds) {
  const opp = Array.from({ length: n }, () => []);
  for (const r of rounds) for (const [h, a] of r.matches) { opp[h].push(a); opp[a].push(h); }
  return opp;
}

function breaksOf(n, rounds) {
  const last = Array(n).fill(null);
  let b = 0;
  for (const r of rounds) {
    const seen = new Set();
    for (const [h, a] of r.matches) {
      if (last[h] === "H") b++;
      if (last[a] === "A") b++;
      last[h] = "H"; last[a] = "A"; seen.add(h); seen.add(a);
    }
    for (let t = 0; t < n; t++) if (!seen.has(t)) last[t] = null;
  }
  return b;
}

const mirror = (first) => [...first, ...first.map((r) => ({ ...r, matches: r.matches.map(([h, a]) => [a, h]) }))];

export function run({ seed = 1, effort = 1 } = {}) {
  const rows = [];
  const cache = new Map();
  for (const [key, lg] of Object.entries(data.leagues)) {
    const n = lg.teams.length;
    const planned = carryOverFromOpponents(opponents(n, lg.matches, (m) => m[0]));
    const played = carryOverFromOpponents(opponents(n, lg.matches, (m) => `${m[1]}#${String(m[0]).padStart(3, "0")}`));
    const firstHalf = lg.matches.filter((m) => m[0] <= n - 1);
    const plannedHalf = carryOverFromOpponents(opponents(n, firstHalf, (m) => m[0]));
    if (!cache.has(n)) {
      const circ = roundRobin(n, { double: true });
      const low = lowCarryOverRounds(n, { seed, effort });
      const lowD = mirror(low.rounds);
      const bal = lowCarryOverRounds(n, { seed, effort, breakWeight: 10 }); // what buildSchedule uses
      const balD = mirror(bal.rounds);
      const lowC = carryOverFromOpponents(doubleOpponents(n, lowD));
      const balC = carryOverFromOpponents(doubleOpponents(n, balD));
      cache.set(n, {
        circle: carryOverFromOpponents(doubleOpponents(n, circ)).value,
        circleHalf: carryOverFromOpponents(doubleOpponents(n, roundRobin(n))).value,
        circleBreaks: breaksOf(n, circ),
        low: lowC.value, lowMax: lowC.max,
        balanced: balC.value, balancedMax: balC.max, balancedBreaks: breaksOf(n, balD),
        lowHalf: low.coe,
        lowBreaks: breaksOf(n, lowD),
        halfLowerBound: low.lowerBound,
      });
    }
    const ref = cache.get(n);
    rows.push({
      key, name: lg.name, teams: n,
      plannedCoe: planned.value, plannedMax: planned.max, plannedHalfCoe: plannedHalf.value, playedCoe: played.value,
      plannedBreaks: breaksByMatchday(n, lg.matches), plannedLowerBound: planned.lowerBound,
      ...ref,
    });
  }
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rows = run();
  if (process.argv.includes("--json")) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }
  const pad = (s, w) => String(s).padStart(w);
  console.log(`${"season".padEnd(14)}${pad("teams", 6)}${pad("planned", 9)}${pad("played", 8)}${pad("1st half", 9)}${pad("max c", 6)}${pad("breaks", 7)} | ${pad("circle", 7)}${pad("half", 6)}${pad("brk", 5)} | ${pad("search", 7)}${pad("half", 6)}${pad("brk", 5)}${pad("half LB", 8)} | ${pad("w=10", 6)}${pad("brk", 5)}`);
  for (const r of rows) {
    console.log(`${r.key.padEnd(14)}${pad(r.teams, 6)}${pad(r.plannedCoe, 9)}${pad(r.playedCoe, 8)}${pad(r.plannedHalfCoe, 9)}${pad(r.plannedMax, 6)}${pad(r.plannedBreaks, 7)} | ${pad(r.circle, 7)}${pad(r.circleHalf, 6)}${pad(r.circleBreaks, 5)} | ${pad(r.low, 7)}${pad(r.lowHalf, 6)}${pad(r.lowBreaks, 5)}${pad(r.halfLowerBound, 8)} | ${pad(r.balanced, 6)}${pad(r.balancedBreaks, 5)}`);
  }
}
