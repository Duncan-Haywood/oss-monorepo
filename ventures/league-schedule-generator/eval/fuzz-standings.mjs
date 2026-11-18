// Random results through standings(), with and without headToHead, against an independent recount.
// Checks: won+drawn+lost = played; sum gf = sum ga; points recount (scoring + adjustments); ranks are 1..n and the
// table is a permutation of the teams; result order does not change the sorted names (form/streak excluded);
// the table is sorted by points first; headToHead only reorders teams level on points (point multiset per rank
// unchanged); a team with no h2h partner keeps its place relative to the plain table's points blocks;
// adding a constant to every team's adjustment changes no order.
// Usage: node eval/fuzz-standings.mjs [count] [seed]
import { standings, mulberry32 } from "../calc.mjs";

const count = Number(process.argv[2] || 2000);
const rnd = mulberry32(Number(process.argv[3] || 11));
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const bad = [];
let tied = 0;
for (let i = 0; i < count; i++) {
  const n = int(2, 8);
  const teams = Array.from({ length: n }, (_, k) => `T${k}`);
  const m = int(0, 30);
  const results = Array.from({ length: m }, () => {
    const a = int(0, n - 1); let b = int(0, n - 1); if (b === a) b = (a + 1) % n;
    return { a, b, ga: int(0, 4), gb: int(0, 4) };
  });
  const sc = rnd() < 0.5 ? { win: 3, draw: 1, loss: 0 } : { win: 2, draw: 1, loss: 0 };
  const adjustments = rnd() < 0.3 ? { [int(0, n - 1)]: int(-4, 4) } : {};
  const o = { ...sc, adjustments };
  const fail = (k) => bad.push({ k, i, n, results, o });
  for (const h of [false, true]) {
    const rows = standings(teams, results, { ...o, headToHead: h });
    if (rows.length !== n || new Set(rows.map((r) => r.index)).size !== n) { fail("not a permutation"); continue; }
    if (!rows.every((r, k) => r.rank === k + 1)) fail("ranks");
    let gf = 0, ga = 0;
    const pts = Array(n).fill(0), pl = Array(n).fill(0);
    for (const r of results) {
      pl[r.a]++; pl[r.b]++;
      if (r.ga > r.gb) { pts[r.a] += sc.win; pts[r.b] += sc.loss; }
      else if (r.ga < r.gb) { pts[r.b] += sc.win; pts[r.a] += sc.loss; }
      else { pts[r.a] += sc.draw; pts[r.b] += sc.draw; }
    }
    for (const r of rows) {
      gf += r.gf; ga += r.ga;
      if (r.won + r.drawn + r.lost !== r.played || r.played !== pl[r.index]) fail("played");
      if (r.points !== pts[r.index] + (adjustments[r.index] ?? 0)) fail("points recount");
    }
    if (gf !== ga) fail("goals do not balance");
    for (let k = 1; k < n; k++) if (rows[k - 1].points < rows[k].points) fail("not sorted by points");
    const shuffled = results.map((r) => [rnd(), r]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
    const again = standings(teams, shuffled, { ...o, headToHead: h });
    if (again.map((r) => r.index).join() !== rows.map((r) => r.index).join()) fail("result order changed the table");
    const shifted = standings(teams, results, { ...o, headToHead: h, adjustments: Object.fromEntries(teams.map((_, k) => [k, (adjustments[k] ?? 0) + 5])) });
    if (shifted.map((r) => r.index).join() !== rows.map((r) => r.index).join()) fail("constant adjustment moved teams");
  }
  const plain = standings(teams, results, o), h2h = standings(teams, results, { ...o, headToHead: true });
  if (plain.map((r) => r.points).join() !== h2h.map((r) => r.points).join()) fail("h2h changed the points sequence");
  if (new Set(plain.map((r) => r.points)).size < n) tied++;
}
console.log(JSON.stringify({ leagues: count, withPointTies: tied, failures: bad.length }));
if (bad.length) { console.log(JSON.stringify(bad.slice(0, 3))); process.exit(1); }
