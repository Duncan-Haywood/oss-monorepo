// Is the 60 x 168 week 0's last $30.11 the priced clique LP's looseness, or a cheaper roster the search misses? This dumps the
// priced clique model (calc.mjs cliqueLP with modelOnly) and the roster buildRoster posts, for eval/score-floor-milp.py to solve
// as an integer program with HiGHS and to price the posted roster term by term. Same generator and seed rule as
// eval/end-to-end.mjs and eval/score-floor.mjs.
//   node eval/score-floor-milp.mjs [P=60] [S=168] [week=0] > m.json && python3 eval/score-floor-milp.py m.json
// OPTS='{"...":...}' merges buildRoster options (default {"timeBudgetMs":20000}).
import { parseStaff, parseShifts, buildRoster, _internals } from "../calc.mjs";
const { buildContext, cliqueLP } = _internals;
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 60), S = Number(process.argv[3] || 168), week = Number(process.argv[4] || 0);
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
const extra = process.env.OPTS ? JSON.parse(process.env.OPTS) : { timeBudgetMs: 20000 };
for (let c = 0; c <= week; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  if (c < week) continue;
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const ctx = buildContext(staff, slots, { exact: true });
  const model = cliqueLP(ctx, { priced: true, modelOnly: true });
  const t0 = Date.now();
  const r = buildRoster(staff, slots, { exact: true, ...extra });
  const o = r.optimality || {};
  process.stderr.write(`week ${c}: score ${r.score.toFixed(2)}, lower bound ${o.lowerBound?.toFixed?.(2)}, gap ${(o.gap ?? 0).toFixed(2)}, status ${o.status}, ${Date.now() - t0} ms\n`);
  // The posted roster's score split per person (calc's people rows carry pay; the rest is the score minus BIG x open).
  console.log(JSON.stringify({ P, S, week, score: r.score, lowerBound: o.lowerBound, status: o.status, owner: Array.from(r.owner), model }));
}
