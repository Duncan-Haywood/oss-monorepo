// Tee-time balance on a grid of golf league seasons: the page's search (golf.mjs) against a hand
// rotation (each group moves one tee time later every week), and the plans as JSON for the SAT
// check (eval/golf-tee-sat.py). Run: node eval/golf-tee-grid.mjs > eval/golf-tee-grid.json
import { golfSchedule, teeReport } from "../golf.mjs";
import { roundRobin } from "../calc.mjs";
const TEAMS = [4, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20];
const WEEKS = [10, 12, 14, 16, 18, 20, 22];
const rows = [];
for (const n of TEAMS) for (const w of WEEKS) {
  const t0 = Date.now();
  const s = golfSchedule({ teams: Array.from({ length: n }, (_, i) => `T${i + 1}`), weeks: w, start: 20600 });
  const ms = Date.now() - t0;
  const r = teeReport(s);
  // Hand rotation on the same round robin: group g of week k tees off in slot (g + k) mod slots.
  const rounds = roundRobin(n), S = Math.ceil(n / 2);
  const counts = Array.from({ length: n }, () => new Array(S).fill(0));
  const plan = [];
  for (let k = 0; k < w; k++) {
    const r0 = rounds[k % rounds.length];
    const pairs = r0.matches.map(([a, b]) => [a, b]);
    if (r0.bye !== null && r0.bye !== undefined) pairs.push([r0.bye]);
    plan.push(pairs);
    pairs.forEach((p, g) => { for (const t of p) counts[t][(g + k) % S]++; });
  }
  let handAt = 0;
  for (const c of counts) { const total = c.reduce((a, b) => a + b, 0); if (Math.max(...c) - Math.min(...c) <= (total % S ? 1 : 0)) handAt++; }
  rows.push({ n, w, slots: S, searchAtBound: r.atBound, handAtBound: handAt, worstSpread: r.worstSpread, repeats: r.repeats, ms, plan });
}
console.log(JSON.stringify(rows));
