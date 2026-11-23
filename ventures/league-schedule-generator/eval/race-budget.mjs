// Slow tables, asked again in the race worker (2026-11-23). On the page thread the clinch watch's search
// gets 20,000 nodes per question, and on the 6,144 real tables of eval/race-real.txt it left 9.9% unproved,
// so a team it shows "alive" there may already have clinched or be out. race-worker.mjs takes those tables
// off the page thread and asks only the status questions of the alive teams, under growing budgets
// (RACE_WORKER_PASSES), then the magic numbers. This replays the same 18 openfootball seasons (CC0) date by
// date, three races per season (title, top four, safety = top n - 3), and for every table the page thread
// leaves unproved measures:
//   - wrong calls: a clinched team finishing outside the places on the final table, an eliminated one
//     inside, a call the page made that the worker undoes, or a magic number above the page's (must be 0)
//   - statuses the worker settles that the page left alive, and how many match dates earlier each
//     team-race is settled (worker against page thread)
//   - alive teams whose status questions all ended proved (so "alive" is the truth, not a bound)
//   - wall time per table (mean, slowest)
//
//   node eval/race-budget.mjs            # summary, as in eval/race-budget.txt
//   node eval/race-budget.mjs --seconds 5   # a tighter time box per table
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { playoffRace } from "../standings.mjs";
import { deepRace } from "../race-worker.mjs";
import { RACE_NODE_BUDGET, RACE_WORKER_PASSES, RACE_WORKER_MAGIC_BUDGET } from "../race-exact.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, "data", "openfootball-results.json"), "utf8"));
const si = process.argv.indexOf("--seconds");
const seconds = si > 0 ? Number(process.argv[si + 1]) : 30;

const examples = [];
let pageOpen = 0, magicPoints = 0;
let tables = 0, slow = 0, wrong = 0, settledCalls = 0, aliveRows = 0, aliveProved = 0, lowered = 0, ms = 0, slowest = 0, timedOut = 0;
const perRace = {};
for (const [key, L] of Object.entries(data.leagues)) {
  const n = L.teams.length;
  const matches = L.matches.slice().sort((x, y) => (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0));
  const dates = [...new Set(matches.map((m) => m[1]))];
  const fin = Array(n).fill(0);
  for (const m of matches) {
    if (m[4] > m[5]) fin[m[2]] += 3; else if (m[4] < m[5]) fin[m[3]] += 3; else { fin[m[2]]++; fin[m[3]]++; }
  }
  const above = (i, strict) => fin.filter((p, j) => j !== i && (strict ? p > fin[i] : p >= fin[i])).length;
  for (const [race, spots] of [["title", 1], ["top four", 4], ["safety", n - 3]]) {
    const pr = (perRace[race] ??= { teams: 0, dates: 0, most: 0 });
    const first = { page: Array(n).fill(null), worker: Array(n).fill(null) };
    dates.forEach((d, di) => {
      const left = matches.filter((m) => m[1] > d).map((m) => [m[2], m[3]]);
      if (!left.length) return;
      const results = matches.filter((m) => m[1] <= d).map((m) => ({ a: m[2], b: m[3], ga: m[4], gb: m[5] }));
      tables++;
      const page = playoffRace(L.teams, results, left, spots);
      let worker = page;
      if (!page.proved) {
        slow++;
        const t0 = performance.now();
        const u = deepRace({ teams: L.teams, results, remaining: left, spots, seconds });
        const dt = performance.now() - t0;
        ms += dt; slowest = Math.max(slowest, dt);
        if (u.timedOut) timedOut++;
        // the baseline: the same status questions at the page thread's own budget, one pass, no magic
        pageOpen += deepRace({ teams: L.teams, results, remaining: left, spots, passes: [RACE_NODE_BUDGET], magicBudget: 0 }).open;
        lowered += u.lowered ?? 0;
        worker = u.rows;
        const p = new Map(page.map((r) => [r.index, r]));
        for (const r of worker) {
          const o = p.get(r.index);
          if (o.status !== "alive" && r.status !== o.status) wrong++;
          if (o.magic != null && r.magic != null && r.magic > o.magic) wrong++;
          if (o.status === "alive" && r.status !== "alive") { settledCalls++; examples.push(`${key} ${race} after ${d}: ${L.teams[r.index]} ${r.status} (${left.length} games left)`); }
          if (o.magic != null && r.magic != null) magicPoints += o.magic - r.magic;
          if (r.status === "alive") aliveRows++;
        }
        aliveProved += worker.filter((r) => r.status === "alive").length - u.open;
      }
      for (const [method, rows] of [["page", page], ["worker", worker]]) {
        for (const r of rows) {
          if (r.status === "clinched" && above(r.index, false) + 1 > spots) wrong++;
          if (r.status === "eliminated" && above(r.index, true) + 1 <= spots) wrong++;
          if (r.status !== "alive" && first[method][r.index] == null) first[method][r.index] = di;
        }
      }
    });
    for (let i = 0; i < n; i++) {
      const a = first.page[i], b = first.worker[i];
      if (b != null && (a == null || b < a)) {
        const gain = (a ?? dates.length - 1) - b;
        pr.teams++; pr.dates += gain; pr.most = Math.max(pr.most, gain);
      }
    }
  }
}

const lines = [];
lines.push(`Race worker on 18 real seasons (openfootball, CC0), every match date, three races per season`);
lines.push(`Worker passes: ${RACE_WORKER_PASSES.join(", ")} nodes per status question; magic numbers ${RACE_WORKER_MAGIC_BUDGET} nodes per team; time box ${seconds} s per table`);
lines.push("");
lines.push(`Tables: ${tables}; left unproved by the page thread (20,000 nodes per question): ${slow}`);
lines.push(`Wrong calls (page or worker against the final table, the worker undoing a page call or raising a magic number): ${wrong}`);
lines.push(`Statuses the worker settled that the page showed alive: ${settledCalls}`);
lines.push(`Alive rows after the worker: ${aliveRows}; of them with every status question proved (alive is the truth): ${aliveProved}`);
lines.push(`Alive rows with a status question still open: ${pageOpen} at the page thread's budget, ${aliveRows - aliveProved} after the worker`);
lines.push(`Magic numbers lowered by the worker: ${lowered} (${magicPoints} points in all, ${(magicPoints / Math.max(1, lowered)).toFixed(1)} per number)`);
lines.push(`Worker time per slow table: ${(ms / Math.max(1, slow)).toFixed(0)} ms mean, ${slowest.toFixed(0)} ms slowest; tables that hit the time box: ${timedOut}`);
lines.push("");
lines.push("race       team-races settled earlier by the worker  match dates earlier (total, most)");
for (const [race, r] of Object.entries(perRace)) lines.push(`${race.padEnd(11)}${String(r.teams).padEnd(42)}${r.dates}, ${r.most}`);
lines.push("");
lines.push("Statuses the worker settled:");
for (const e of examples) lines.push("  " + e);
console.log(lines.join("\n"));
