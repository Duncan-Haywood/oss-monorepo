// Carry-over at a cap on home/away breaks (lowCarryOverCappedRounds and the capped whole-season
// double), next to the 20 real top-flight seasons (eval/carryover-real.mjs) and the page's eight
// weighted tries. Questions: how low can carry-over go when breaks are held near the minimum, and
// does adding capped tries change what the page keeps for each of its three choices?
//
//   node eval/capped-breaks.mjs           # both tables (several minutes; output in eval/capped-breaks.txt)
//   node eval/capped-breaks.mjs --json
//
// Every figure is recounted from the rounds, not taken from the search's own report.

import { fileURLToPath } from "node:url";
import { bestCarryOverRounds, carryOverTry, cappedTryBreaks, carryOver, CARRY_OVER_PICK } from "../carryover.mjs";
import { run as realRun } from "./carryover-real.mjs";

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

const coeOfRounds = (n, rounds) => carryOver({ teams: Array.from({ length: n }, (_, i) => i), rounds }).value;
const beats = (a, b) => a.coe <= b.coe && a.breaks <= b.breaks && (a.coe < b.coe || a.breaks < b.breaks);

/** The capped curve: capped tries 0..3 (cappedTryBreaks) per size and seed. */
export function curve({ sizes = [12, 16, 18, 20], seeds = [1, 2, 3], steps = 4 } = {}) {
  const pro = realRun().map((r) => ({ key: r.key, teams: r.teams, coe: r.plannedCoe, breaks: r.plannedBreaks }));
  const rows = [];
  for (const n of sizes) {
    const same = pro.filter((p) => p.teams === n);
    for (let j = 0; j < steps; j++) for (const seed of seeds) {
      const t0 = Date.now();
      // try index 0 + j with weighted 0 is capped try j at that seed's own stream
      const t = carryOverTry(n, j, { double: true, seed, weighted: 0 });
      const ms = Date.now() - t0;
      const coe = coeOfRounds(n, t.rounds), breaks = breaksOf(n, t.rounds);
      const caps = cappedTryBreaks(n, j, true);
      rows.push({ teams: n, step: j, legCap: caps.leg, seasonCap: caps.season, seed, coe, breaks, lowerBound: t.lowerBound, dominates: same.filter((p) => beats({ coe, breaks }, p)).map((p) => p.key), of: same.length, ms });
    }
  }
  return rows;
}

/** What the page keeps for each choice with its eight weighted tries, and with two capped tries added. */
export function picks({ sizes = [18, 20], seeds = [1, 2, 3] } = {}) {
  const pro = realRun().map((r) => ({ teams: r.teams, coe: r.plannedCoe, breaks: r.plannedBreaks }));
  const rows = [];
  for (const n of sizes) for (const seed of seeds) {
    const t0 = Date.now();
    const all = bestCarryOverRounds(n, { double: true, seed, tries: 8, capped: 2, pick: 0 });
    const ms = Date.now() - t0;
    const same = pro.filter((p) => p.teams === n);
    for (const [name, p] of Object.entries(CARRY_OVER_PICK)) for (const k of [8, 10]) {
      const c = all.tries.slice(0, k).reduce((a, b) => (b.coe + p * b.breaks < a.coe + p * a.breaks ? b : a));
      rows.push({ teams: n, seed, choice: name, tries: k, coe: c.coe, breaks: c.breaks, capped: c.maxBreaks != null, dominates: same.filter((q) => beats(c, q)).length, of: same.length, ms });
    }
  }
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = curve(), b = picks();
  if (process.argv.includes("--json")) { console.log(JSON.stringify({ curve: a, picks: b }, null, 1)); process.exit(0); }
  const pad = (s, w) => String(s).padStart(w);
  console.log("Capped whole-season double round robin (leg cap / season cap), seeds 1-3");
  console.log(`${pad("teams", 5)}${pad("leg", 5)}${pad("season", 7)}${pad("seed", 5)}${pad("carry-over", 11)}${pad("breaks", 7)}${pad("floor", 7)}${pad("s", 6)}  dominates`);
  for (const r of a) console.log(`${pad(r.teams, 5)}${pad(r.legCap, 5)}${pad(r.seasonCap, 7)}${pad(r.seed, 5)}${pad(r.coe, 11)}${pad(r.breaks, 7)}${pad(r.lowerBound, 7)}${pad((r.ms / 1000).toFixed(1), 6)}  ${r.dominates.length}/${r.of} ${r.dominates.join(" ")}`);
  console.log("\nWhat each choice keeps: 8 weighted tries vs 8 + 2 capped (search figures)");
  console.log(`${pad("teams", 5)}${pad("seed", 5)}  ${"choice".padEnd(9)}${pad("tries", 6)}${pad("carry-over", 11)}${pad("breaks", 7)}${pad("capped", 7)}${pad("dominates", 10)}`);
  for (const r of b) console.log(`${pad(r.teams, 5)}${pad(r.seed, 5)}  ${r.choice.padEnd(9)}${pad(r.tries, 6)}${pad(r.coe, 11)}${pad(r.breaks, 7)}${pad(r.capped ? "yes" : "", 7)}${pad(`${r.dominates}/${r.of}`, 10)}`);
  const s10 = b.filter((r) => r.tries === 10);
  console.log(`\n10-try runs, seconds per search set (one thread): ${[...new Set(s10.map((r) => `${r.teams}/${r.seed} ${(r.ms / 1000).toFixed(1)}`))].join(", ")}`);
}
