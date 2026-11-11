// Best of k searches against one search, for the whole-season double round robin, next to the real
// top-flight seasons (eval/carryover-real.mjs). Questions: at the same total work, do k short
// searches beat one long one? And what does k times the work buy?
//
//   node eval/best-of-k.mjs            # table to stdout (several minutes)
//   node eval/best-of-k.mjs --json
//   node eval/best-of-k.mjs --picks    # what "fair", "balanced" and "breaks" keep (eval/best-of-k-picks.txt)
//
// Each row is one base seed; "pick" is the trade used to choose among the tries (carry-over +
// pick x breaks). The same base seeds are used in every setting.

import { fileURLToPath } from "node:url";
import { bestCarryOverRounds, carryOver } from "../carryover.mjs";
import { run as realRun } from "./carryover-real.mjs";

export const SETTINGS = [
  { label: "1 x effort 1 (today)", tries: 1, effort: 1 },
  { label: "4 x effort 0.25", tries: 4, effort: 0.25 },
  { label: "4 x effort 1", tries: 4, effort: 1 },
  { label: "8 x effort 0.5", tries: 8, effort: 0.5 },
];

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

export function compare({ sizes = [18, 20], seeds = [1, 2, 3], settings = SETTINGS, pick = 10 } = {}) {
  const pro = realRun().map((r) => ({ key: r.key, teams: r.teams, coe: r.plannedCoe, breaks: r.plannedBreaks }));
  const rows = [];
  for (const n of sizes) {
    const same = pro.filter((p) => p.teams === n);
    for (const st of settings) for (const seed of seeds) {
      const t0 = Date.now();
      const d = bestCarryOverRounds(n, { double: true, seed, tries: st.tries, effort: st.effort, pick });
      const ms = Date.now() - t0;
      // recount from the rounds, not the search's own figures
      const coe = carryOver({ teams: Array.from({ length: n }, (_, i) => i), rounds: d.rounds }).value;
      const breaks = breaksOf(n, d.rounds);
      const dominated = same.filter((p) => coe <= p.coe && breaks <= p.breaks && (coe < p.coe || breaks < p.breaks)).length;
      rows.push({ teams: n, setting: st.label, seed, coe, breaks, score: coe + pick * breaks, dominates: dominated, of: same.length, ms, chosenWeight: d.tries[d.chosen].breakWeight });
    }
  }
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && !process.argv.includes("--picks")) {
  const rows = compare();
  if (process.argv.includes("--json")) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }
  const pad = (s, w) => String(s).padStart(w);
  console.log(`${pad("teams", 5)}  ${"setting".padEnd(22)}${pad("seed", 5)}${pad("carry-over", 11)}${pad("breaks", 7)}${pad("score", 7)}${pad("w", 4)}${pad("dominates", 10)}${pad("s", 6)}`);
  for (const r of rows) console.log(`${pad(r.teams, 5)}  ${r.setting.padEnd(22)}${pad(r.seed, 5)}${pad(r.coe, 11)}${pad(r.breaks, 7)}${pad(r.score, 7)}${pad(r.chosenWeight, 4)}${pad(`${r.dominates}/${r.of}`, 10)}${pad((r.ms / 1000).toFixed(1), 6)}`);
  const groups = new Map();
  for (const r of rows) { const k = `${r.teams} ${r.setting}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  console.log("\nmeans over the seeds");
  for (const [k, g] of groups) {
    const m = (f) => (g.reduce((s, r) => s + f(r), 0) / g.length).toFixed(1);
    console.log(`${k.padEnd(28)} carry-over ${m((r) => r.coe)}  breaks ${m((r) => r.breaks)}  score ${m((r) => r.score)}  dominates ${m((r) => r.dominates)}  ${m((r) => r.ms / 1000)} s`);
  }
}

// What each of the page's three choices keeps from the same four searches (effort 1): the trade
// only re-ranks the tries, so one run per seed serves all three. Figures are the search's own.
export function picks({ sizes = [18, 20], seeds = [1, 2, 3], picks: P = { fair: 0, balanced: 10, breaks: 40 } } = {}) {
  const pro = realRun().map((r) => ({ teams: r.teams, coe: r.plannedCoe, breaks: r.plannedBreaks }));
  const rows = [];
  for (const n of sizes) for (const seed of seeds) {
    const d = bestCarryOverRounds(n, { double: true, seed, tries: 4, pick: 0 });
    for (const [name, p] of Object.entries(P)) {
      const c = d.tries.reduce((a, b) => (b.coe + p * b.breaks < a.coe + p * a.breaks ? b : a));
      const dom = pro.filter((q) => q.teams === n && c.coe <= q.coe && c.breaks <= q.breaks && (c.coe < q.coe || c.breaks < q.breaks)).length;
      rows.push({ teams: n, seed, pick: name, coe: c.coe, breaks: c.breaks, dominates: dom, of: pro.filter((q) => q.teams === n).length });
    }
  }
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.includes("--picks")) {
  for (const r of picks()) console.log(`${r.teams} teams seed ${r.seed} ${r.pick.padEnd(9)} carry-over ${r.coe}  breaks ${r.breaks}  dominates ${r.dominates}/${r.of}`);
}
