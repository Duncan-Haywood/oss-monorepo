// Lane limits on the seasons with a stored lane answer (bowling-lane-table.mjs, where the search
// alone already misses the bound with no limits): the search alone against the page with stored
// shape answers (bowling-avoid-shapes.mjs). node eval/bowling-avoid-shapes-grid.mjs [teams,weeks ...]
// > eval/bowling-avoid-shapes.txt
// Each season: n teams, W round-robin weeks, the four kinds of limit of eval/bowling-lane-avoid.mjs
// (the random one drawn per season from a fixed seed, so a rerun gives the same limits). "search"
// is assignLanes(circle rounds, { avoid, shapes: false }); "page" is bowlingSchedule() as the page
// runs it, which deals the limited teams a shape's slots when a stored answer fits. Counts: teams
// with every pair inside laneTargets(), summed distance outside, limits broken (must be 0).
import { assignLanes, avoidViolations, bowlingSchedule, laneTargets } from "../bowling.mjs";
import { LANE_TABLE } from "../bowling-lane-table.mjs";
import { roundRobin, mulberry32 } from "../calc.mjs";

function measure(plan, n, P, avoid) {
  const c = Array.from({ length: n }, () => new Array(P).fill(0)), games = new Array(n).fill(0);
  for (const wk of plan) for (const [a, b, p] of wk) for (const t of [a, b]) { c[t][p]++; games[t]++; }
  const { lo, hi } = laneTargets(games, P, avoid);
  let at = 0, off = 0;
  for (let t = 0; t < n; t++) {
    let o = 0;
    for (let p = 0; p < P; p++) o += Math.max(0, c[t][p] - hi[t][p]) + Math.max(0, lo[t][p] - c[t][p]);
    off += o; if (!o) at++;
  }
  return { at, off, viol: avoidViolations(plan, avoid).length };
}

const kinds = {
  "one team, last pair": (n, P) => [[0, [P - 1]]],
  "two teams, last pair": (n, P) => [[0, [P - 1]], [1, [P - 1]]],
  "one team, both ends": (n, P) => [[0, [0, P - 1]]],
  "three teams, a random pair each": (n, P, rnd) => [0, 1, 2].map(() => [Math.floor(rnd() * n), [Math.floor(rnd() * P)]]),
};
const keys = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(LANE_TABLE);
const tot = { search: { all: 0, off: 0, viol: 0 }, page: { all: 0, off: 0, viol: 0 }, n: 0, none: 0, ms: { search: 0, page: 0 } };
console.log("teams weeks | kind | search: in-target off violations ms | page: in-target off violations ms");
for (const key of keys) {
  const [n, W] = key.split(",").map(Number);
  const P = n / 2, rnd = mulberry32(n * 1000 + W);
  const cyc = roundRobin(n);
  const rounds = Array.from({ length: W }, (_, k) => cyc[k % cyc.length].matches);
  const teams = Array.from({ length: n }, (_, i) => `T${i + 1}`);
  for (const [kind, make] of Object.entries(kinds)) {
    // The limited teams are spread over the league (not the first slots, which are where the shape
    // answers live), so the page's dealing is exercised.
    const avoid = Array.from({ length: n }, () => []);
    for (const [t0, ps] of make(n, P, rnd)) { const t = (t0 * 7 + 3) % n; for (const p of ps) if (!avoid[t].includes(p)) avoid[t].push(p); }
    let t1 = Date.now();
    const search = measure(assignLanes(rounds, n, P, { avoid, shapes: false }), n, P, avoid);
    const ds = Date.now() - t1;
    t1 = Date.now();
    const s = bowlingSchedule({ teams, weeks: W, start: 20000, laneAvoid: avoid });
    const dp = Date.now() - t1;
    if (s.errors.length || search.viol) { tot.none++; console.log(`${n} ${W} | ${kind} | no deal: a week where these limits cannot all hold`); continue; }
    const plan = s.weeks.map((wk) => wk.matches.map((m) => [m.a, m.b, m.pair]));
    const page = measure(plan, n, P, avoid);
    for (const [k, r] of [["search", search], ["page", page]]) { tot[k].all += r.at === n; tot[k].off += r.off; tot[k].viol += r.viol; }
    tot.ms.search += ds; tot.ms.page += dp; tot.n++;
    console.log(`${n} ${W} | ${kind} | ${search.at}/${n} ${search.off} ${search.viol} ${ds} | ${page.at}/${n} ${page.off} ${page.viol} ${dp}`);
  }
}
console.log("");
console.log(`${tot.n} seasons (${tot.none} with no deal left out): every team in target, search ${tot.search.all}, page ${tot.page.all}; off-target counts search ${tot.search.off}, page ${tot.page.off}; limits broken search ${tot.search.viol}, page ${tot.page.viol}`);
console.log(`ms per season: search ${(tot.ms.search / tot.n).toFixed(0)}, page ${(tot.ms.page / tot.n).toFixed(0)}`);
