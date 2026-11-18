// Lane-pair limits (a team that must never bowl on a pair) as a hard constraint, measured.
// node eval/bowling-lane-avoid.mjs > eval/bowling-lane-avoid.txt
// For 9 league sizes x 4 season lengths x 4 kinds of limit (144 seasons), two ways to honour
// the limits on the same round robin:
//   hand: the page's unconstrained season, then every week an avoiding team lands on its pair,
//         its match swaps pairs with the nearest match that may use that pair (an organiser's fix);
//   page: assignLanes(..., { avoid }), the limits inside the search.
// "in target" = every team-pair count inside laneTargets() (the fair share once the avoided pairs
// are taken out, floor..ceil); "off" = the summed distance outside it; violations must be 0.
import { assignLanes, avoidViolations, laneTargets } from "../bowling.mjs";
import { roundRobin, mulberry32 } from "../calc.mjs";

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

function handFix(plan, avoid) {
  const out = plan.map((wk) => wk.map((m) => m.slice()));
  const bans = (m, p) => (avoid[m[0]] ?? []).includes(p) || (avoid[m[1]] ?? []).includes(p);
  for (const wk of out) {
    for (const m of wk) {
      if (!bans(m, m[2])) continue;
      const others = wk.filter((x) => x !== m && !bans(x, m[2]) && !bans(m, x[2])).sort((x, y) => Math.abs(x[2] - m[2]) - Math.abs(y[2] - m[2]));
      if (others.length) { const o = others[0]; [o[2], m[2]] = [m[2], o[2]]; }
    }
  }
  return out;
}

const sizes = [6, 8, 10, 12, 14, 16, 18, 20, 24];
const seasons = [26, 30, 32, 34];
const kinds = {
  "one team, last pair": (n, P) => [[0, [P - 1]]],
  "two teams, last pair": (n, P) => [[0, [P - 1]], [1, [P - 1]]],
  "one team, both ends": (n, P) => [[0, [0, P - 1]]],
  "three teams, a random pair each": (n, P, rnd) => [0, 1, 2].map(() => [Math.floor(rnd() * n), [Math.floor(rnd() * P)]]),
};
const tot = {};
let ms = 0, seasonsRun = 0;
console.log("kind | teams weeks | hand: in-target off repeats violations | page: in-target off repeats violations ms");
for (const [kind, make] of Object.entries(kinds)) {
  tot[kind] = { hand: { all: 0, off: 0, viol: 0, rep: 0 }, page: { all: 0, off: 0, viol: 0, rep: 0 }, n: 0, none: 0 };
  const rnd = mulberry32(20261118);
  for (const n of sizes) for (const W of seasons) {
    const P = n / 2;
    const avoid = Array.from({ length: n }, () => []);
    for (const [t, ps] of make(n, P, rnd)) for (const p of ps) if (!avoid[t].includes(p)) avoid[t].push(p);
    const cyc = roundRobin(n);
    const rounds = Array.from({ length: W }, (_, k) => cyc[k % cyc.length].matches);
    const hand = measure(handFix(assignLanes(rounds, n, P), avoid), n, P, avoid);
    const t0 = Date.now();
    const page = measure(assignLanes(rounds, n, P, { avoid }), n, P, avoid);
    const dt = Date.now() - t0; ms += dt; seasonsRun++;
    // A violation in the page's plan means some week has no deal at all (the per-week Hungarian
    // step is exact); bowlingSchedule() refuses such a season and names the week, so it is
    // counted apart and left out of the totals.
    if (page.viol) { tot[kind].none++; console.log(`${kind} | ${String(n).padStart(2)} ${String(W).padStart(2)} | no deal: a week where these limits cannot all hold (the page names it)`); continue; }
    for (const [k, r] of [["hand", hand], ["page", page]]) { const x = tot[kind][k]; x.all += r.at === n; x.off += r.off; x.viol += r.viol; x.rep += r.rep; }
    tot[kind].n++;
    console.log(`${kind} | ${String(n).padStart(2)} ${String(W).padStart(2)} | ${hand.at}/${n} ${hand.off} ${hand.rep} ${hand.viol} | ${page.at}/${n} ${page.off} ${page.rep} ${page.viol} ${dt}`);
  }
}
console.log("");
for (const [kind, x] of Object.entries(tot)) {
  console.log(`${kind}${x.none ? ` (${x.none} with no deal, left out)` : ""}: every team in target, hand ${x.hand.all} of ${x.n}, page ${x.page.all} of ${x.n}; off-target counts hand ${x.hand.off}, page ${x.page.off}; repeats hand ${x.hand.rep}, page ${x.page.rep}; violations hand ${x.hand.viol}, page ${x.page.viol}`);
}
console.log(`page: ${(ms / seasonsRun).toFixed(0)} ms per season on average on this machine`);
