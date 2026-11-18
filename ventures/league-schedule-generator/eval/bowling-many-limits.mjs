// Five or more limited teams: the shapes store answers for up to 4 limited teams
// (SHAPE_MAX_TEAMS), so a league with 5+ teams under lane limits always runs the search.
// node eval/bowling-many-limits.mjs > eval/bowling-many-limits.txt
// Sizes 10-24 x lengths 26-34 (the 142-season grid's lengths) x four kinds of 5+ limit. Counts as
// eval/bowling-lane-avoid.mjs: teams with every pair inside laneTargets(), summed distance outside,
// back-to-back repeats, limits broken (must be 0); a season with a week that has no legal deal is
// refused by the page and left out.
import { avoidViolations, bowlingSchedule, laneTargets } from "../bowling.mjs";
import { mulberry32 } from "../calc.mjs";

function measure(plan, n, P, avoid) {
  const c = Array.from({ length: n }, () => new Array(P).fill(0));
  const games = new Array(n).fill(0), last = new Array(n).fill(-1);
  let rep = 0;
  for (const wk of plan) for (const [a, b, p] of wk) for (const t of [a, b]) { c[t][p]++; games[t]++; if (last[t] === p) rep++; last[t] = p; }
  const { lo, hi } = laneTargets(games, P, avoid);
  let at = 0, off = 0;
  for (let t = 0; t < n; t++) {
    let o = 0;
    for (let p = 0; p < P; p++) o += Math.max(0, c[t][p] - hi[t][p]) + Math.max(0, lo[t][p] - c[t][p]);
    off += o; if (!o) at++;
  }
  return { at, off, rep, viol: avoidViolations(plan, avoid).length };
}

const sizes = (process.env.SIZES ?? "10,12,14,16,18,20,24").split(",").map(Number);
const seasons = (process.env.WEEKS ?? "26,30,32,34").split(",").map(Number);
const kinds = {
  "five teams, last pair": (n, P) => [0, 1, 2, 3, 4].map((t) => [t, [P - 1]]),
  "five teams, a random pair each": (n, P, rnd) => [0, 1, 2, 3, 4].map((t) => [t, [Math.floor(rnd() * P)]]),
  "six teams, both ends": (n, P) => [0, 1, 2, 3, 4, 5].map((t) => [t, [0, P - 1]]),
  "eight teams, a random pair each": (n, P, rnd) => [0, 1, 2, 3, 4, 5, 6, 7].map((t) => [t, [Math.floor(rnd() * P)]]),
};
const only = process.env.KINDS ? process.env.KINDS.split("|") : Object.keys(kinds);
const tot = {};
let ms = 0, run = 0;
console.log("kind | teams weeks | page: in-target off repeats violations ms");
for (const kind of only) {
  const make = kinds[kind];
  tot[kind] = { all: 0, off: 0, viol: 0, rep: 0, n: 0, none: 0 };
  const rnd = mulberry32(20261118);
  for (const n of sizes) for (const W of seasons) {
    const P = n / 2;
    const avoid = Array.from({ length: n }, () => []);
    // spread the limited teams over the league, as eval/bowling-avoid-shapes-grid.mjs does
    for (const [t0, ps] of make(n, P, rnd)) { const t = (t0 * 7 + 3) % n; for (const p of ps) if (!avoid[t].includes(p)) avoid[t].push(p); }
    const t0 = Date.now();
    const s = bowlingSchedule({ teams: Array.from({ length: n }, (_, i) => `T${i + 1}`), weeks: W, start: 20000, laneAvoid: avoid });
    const dt = Date.now() - t0; ms += dt; run++;
    const page = s.errors.length ? { viol: 1 } : measure(s.weeks.map((wk) => wk.matches.map((m) => [m.a, m.b, m.pair])), n, P, avoid);
    if (page.viol) { tot[kind].none++; console.log(`${kind} | ${String(n).padStart(2)} ${String(W).padStart(2)} | no deal: ${s.errors[0] ?? "limits broken"}`); continue; }
    const x = tot[kind]; x.all += page.at === n; x.off += page.off; x.rep += page.rep; x.n++;
    console.log(`${kind} | ${String(n).padStart(2)} ${String(W).padStart(2)} | ${page.at}/${n} ${page.off} ${page.rep} ${page.viol} ${dt}`);
  }
}
console.log("");
for (const [kind, x] of Object.entries(tot)) console.log(`${kind}${x.none ? ` (${x.none} with no deal, left out)` : ""}: every team in target ${x.all} of ${x.n}; off-target counts ${x.off}; repeats ${x.rep}`);
console.log(`${(ms / run).toFixed(0)} ms per season on average on this machine`);
