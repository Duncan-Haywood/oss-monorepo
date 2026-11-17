// What closes the rest of the gap the day sweeps leave? (README "Past the day sweeps: the gap is one big trade", 2026-11-14.)
// On a cg-scale-bench week (same generator and seed rule as eval/end-to-end.mjs) this takes the roster buildRoster posts with the
// day sweeps off, runs the day sweeps (calc.mjs dayReassign), and then three wider moves tried here and not shipped:
//   pairs:  two people's shifts pooled and every split between them tried (depth first, each step checked by validWith);
//   cycles: cyclic exchanges across days on the improvement graph (Thompson and Orlin), up to LEN arcs, open as a holder;
//   dive:   the priced clique LP (calc.mjs cliqueLP) solved, every copy at 1 fixed, the largest fractional pair fixed, solved
//           again from the last basis (only costs change, so the basis stays feasible), one level of backtracking on a clash;
//           then the day sweeps.
// With a HiGHS roster (eval/score-floor-milp.py's OWNER_OUT) it also splits the difference between the day-swept roster and that
// one into connected trades: copies whose holder differs, joined when they share a person (an open copy joins nobody).
//   node eval/beyond-day-sweeps.mjs [P=60] [S=168] [week=0] [highs-owner.json]
// MOVES=day,pairs,cycles,dive picks the passes (default all); LEN=2 sets the cycle length.
import { readFileSync } from "node:fs";
import { parseStaff, parseShifts, buildRoster, _internals } from "../calc.mjs";
import { solveLP } from "../bnp.mjs";
const { buildContext, scoreOwner, ownerValid, dayReassign, cliqueLP, cliqueScoreFloor, personScore, validWith, insertSorted, BIG } = _internals;

const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const P = Number(process.argv[2] || 60), S = Number(process.argv[3] || 168), week = Number(process.argv[4] || 0);
const highsFile = process.argv[5] || null;
const moves = new Set((process.env.MOVES || "day,pairs,cycles,dive").split(","));
let seed = Number(process.env.SEED || 20261022) + P * 100 + S;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
let staff, slots;
for (let c = 0; c <= week; c++) {
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${12 + rnd(5) * 6},0,${days[rnd(3)]}-Fri ${6 + rnd(4)}-${16 + rnd(8)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const a = 6 + rnd(9); return `${days[rnd(5)]},${a},${a + 4 + rnd(6)},${1 + rnd(2)}`; }).join("\n");
  staff = parseStaff(st).staff; slots = parseShifts(sh).slots;
}
const ctx = buildContext(staff, slots, { exact: true });
const byStart = (a, b) => ctx.slots[a].start - ctx.slots[b].start || a - b;
const score = (o) => scoreOwner(ctx, o).total;

let t = Date.now();
const floor = cliqueScoreFloor(ctx).bound;
console.log(`${P} x ${S} week ${week}: ${ctx.S} copies; pay floor ${floor.toFixed(2)} (${Date.now() - t} ms)`);
const posted = Array.from(buildRoster(staff, slots, { exact: true, timeBudgetMs: 20000, dayLNS: false }).owner);
const line = (name, o, ms) => console.log(`  ${name}: ${(score(o) - floor).toFixed(2)} above the floor, valid ${ownerValid(ctx, o)}${ms !== undefined ? `, ${ms} ms` : ""}`);
line("posted (day sweeps off)", posted);
t = Date.now();
const swept = dayReassign(ctx, posted, { rounds: 30 });
line("day sweeps", swept, Date.now() - t);

// Pairs: pool two people's shifts, try every split.
function pairSweep(owner0, rounds = 4) {
  const owner = Array.from(owner0), { elig } = ctx;
  for (let round = 0; round < rounds; round++) {
    let moved = false;
    const lists = Array.from({ length: ctx.P }, () => []);
    owner.forEach((p, i) => { if (p >= 0) lists[p].push(i); });
    lists.forEach((l) => l.sort(byStart));
    for (let p = 0; p < ctx.P; p++) for (let q = p + 1; q < ctx.P; q++) {
      const A = lists[p], B = lists[q];
      if (!A.some((i) => elig[q][i]) && !B.some((i) => elig[p][i])) continue;
      const pool = A.concat(B).sort(byStart);
      if (pool.length > 14) continue;
      let best = personScore(ctx, p, A) + personScore(ctx, q, B) - 1e-6, bA = null, bB = null;
      const la = [], lb = [];
      const rec = (k) => {
        if (k === pool.length) { const v = personScore(ctx, p, la) + personScore(ctx, q, lb); if (v < best) { best = v; bA = la.slice(); bB = lb.slice(); } return; }
        const i = pool[k];
        if (elig[p][i] && validWith(ctx, p, la, i)) { la.push(i); rec(k + 1); la.pop(); }
        if (elig[q][i] && validWith(ctx, q, lb, i)) { lb.push(i); rec(k + 1); lb.pop(); }
      };
      rec(0);
      if (!bA) continue;
      for (const i of bA) owner[i] = p;
      for (const i of bB) owner[i] = q;
      lists[p] = bA; lists[q] = bB; moved = true;
    }
    if (!moved) break;
  }
  return owner;
}

// Cycles: nodes are copies and each person's "nothing"; arc u -> v moves u to v's holder, who gives v up.
function cycleSweep(owner0, maxLen) {
  const owner = Array.from(owner0), { elig } = ctx, N = ctx.S + ctx.P;
  const hrs = ctx.slots.map((s) => (s.end - s.start) / 60);
  const lists = Array.from({ length: ctx.P }, () => []);
  owner.forEach((p, i) => { if (p >= 0) lists[p].push(i); });
  lists.forEach((l) => l.sort(byStart));
  const base = lists.map((l, p) => personScore(ctx, p, l));
  const holder = (v) => (v < ctx.S ? owner[v] : v - ctx.S);
  const arc = (u, v) => {
    const q = holder(v);
    if (q < 0) return u >= ctx.S ? -BIG * hrs[v] : BIG * (hrs[u] - hrs[v]);
    if (u < ctx.S && (owner[u] === q || !elig[q][u])) return Infinity;
    const L = lists[q];
    if (u >= ctx.S) return v >= ctx.S ? Infinity : personScore(ctx, q, L.filter((x) => x !== v)) - base[q];
    if (v >= ctx.S) return validWith(ctx, q, L, u) ? personScore(ctx, q, insertSorted(ctx, L, u)) - base[q] : Infinity;
    return validWith(ctx, q, L, u, v) ? personScore(ctx, q, insertSorted(ctx, L.filter((x) => x !== v), u)) - base[q] : Infinity;
  };
  const succ = (u) => {
    const out = [];
    if (u < ctx.S) {
      for (let v = 0; v < ctx.S; v++) { if (v === u) continue; const q = owner[v]; if (q < 0 ? owner[u] >= 0 : elig[q][u] && q !== owner[u]) out.push(v); }
      for (let q = 0; q < ctx.P; q++) if (elig[q][u] && owner[u] !== q) out.push(ctx.S + q);
    } else for (let v = 0; v < ctx.S; v++) if (owner[v] >= 0) out.push(v);
    return out;
  };
  for (;;) {
    let found = null;
    const path = [], used = new Set();
    const dfs = (start, u, cost) => {
      for (const v of succ(u)) {
        if (found) return;
        const c = arc(u, v);
        if (!(c < Infinity)) continue;
        const q = holder(v);
        if (v === start) { if (path.length >= 2 && cost + c < -1e-6) found = path.slice(); continue; }
        if (path.length >= maxLen || (q >= 0 && used.has(q)) || !(cost + c < -1e-6) || (v >= ctx.S && u >= ctx.S)) continue;
        path.push(v); if (q >= 0) used.add(q);
        dfs(start, v, cost + c);
        path.pop(); if (q >= 0) used.delete(q);
      }
    };
    for (let s = 0; s < N && !found; s++) {
      const q = holder(s);
      if (s >= ctx.S && !lists[q].length) continue;
      path.length = 0; used.clear(); path.push(s); if (q >= 0) used.add(q);
      dfs(s, s, 0);
    }
    if (!found) return owner;
    const hs = found.map(holder);
    found.forEach((u, k) => { if (u < ctx.S) owner[u] = hs[(k + 1) % found.length]; });
    for (const q of new Set(hs)) if (q >= 0) { lists[q] = []; owner.forEach((p, i) => { if (p === q) lists[q].push(i); }); lists[q].sort(byStart); base[q] = personScore(ctx, q, lists[q]); }
  }
}

// Dive on the priced clique LP, one level of backtracking.
function dive(maxSolves = 400) {
  const M = cliqueLP(ctx, { priced: true, modelOnly: true });
  const { m, cols, vals, xcol, nx, nLam } = M;
  const cost = Float64Array.from(M.cost), PEN = 1e9;
  const onRow = Array.from({ length: ctx.S }, (_, s) => [nx + nLam + s]);
  for (let j = 0; j < nx; j++) onRow[xcol[j][1]].push(j);
  const fixed = new Int32Array(ctx.S).fill(-2);
  const fix = (s, j, sign = 1) => { fixed[s] = sign > 0 ? j : -2; for (const k of onRow[s]) if (k !== j) cost[k] += sign * PEN; };
  let warm = null, solves = 0, backtracks = 0, last = null;
  for (;;) {
    if (solves >= maxSolves) return null;
    const res = solveLP(m, cols, cost, M.init, { maxPivots: 400000, vals, bigM: 10 * PEN, warm });
    solves++; warm = res.basis;
    const x = res.x;
    if (fixed.some((j, s) => j !== -2 && !(x[j] >= 1 - 1e-7))) {
      if (!last) return null;
      fix(last[0], last[1], -1); cost[last[1]] += PEN; last = null; backtracks++;
      continue;
    }
    let pick = null, pv = -1;
    for (let s = 0; s < ctx.S; s++) {
      if (fixed[s] !== -2) continue;
      let bj = -1, bv = -1;
      for (const j of onRow[s]) if (x[j] > bv) { bv = x[j]; bj = j; }
      if (bv >= 1 - 1e-7) fix(s, bj);
      else if (bv > pv) { pv = bv; pick = [s, bj]; }
    }
    if (!pick) break;
    fix(pick[0], pick[1]); last = pick;
  }
  const owner = new Int32Array(ctx.S).fill(-1);
  for (let s = 0; s < ctx.S; s++) owner[s] = fixed[s] < nx ? xcol[fixed[s]][0] : -1;
  return { owner, solves, backtracks };
}

if (moves.has("pairs")) {
  t = Date.now();
  let o = swept, sc = score(o), sweeps = 0;
  for (;;) { const n = dayReassign(ctx, pairSweep(o), { rounds: 30 }); const ns = score(n); if (!(ns < sc - 1e-9)) break; o = n; sc = ns; sweeps++; }
  line(`pair sweeps and day sweeps in turn (${sweeps} rounds that helped)`, o, Date.now() - t);
}
if (moves.has("cycles")) {
  const L = Number(process.env.LEN || 2);
  t = Date.now();
  let o = swept, sc = score(o);
  for (;;) { const n = dayReassign(ctx, cycleSweep(o, L), { rounds: 30 }); const ns = score(n); if (!(ns < sc - 1e-9)) break; o = n; sc = ns; }
  line(`cyclic exchanges up to ${L} arcs and day sweeps in turn`, o, Date.now() - t);
}
if (moves.has("dive")) {
  t = Date.now();
  const d = dive();
  if (!d) console.log(`  dive: no roster in 400 solves, ${Date.now() - t} ms`);
  else {
    const ms = Date.now() - t;
    const o = Array.from(d.owner);
    console.log(`  dive: ${d.solves} solves, ${d.backtracks} backtracks, open ${scoreOwner(ctx, o).unfilled} h against ${scoreOwner(ctx, swept).unfilled} h`);
    line("dive alone", o, ms);
    line("dive then day sweeps", dayReassign(ctx, o, { rounds: 30 }));
  }
}
if (highsFile) {
  const B = Array.from(JSON.parse(readFileSync(highsFile, "utf8")).owner);
  const A = swept;
  line("HiGHS roster", B);
  // Within a group of identical copies, give each holder in A the copy it holds where B also has that holder.
  const key = (i) => `${ctx.slots[i].day}|${ctx.slots[i].start}|${ctx.slots[i].end}`;
  const groups = new Map();
  for (let i = 0; i < ctx.S; i++) (groups.get(key(i)) || groups.set(key(i), []).get(key(i))).push(i);
  const Bc = B.slice();
  for (const g of groups.values()) {
    const left = g.map((i) => B[i]), out = new Map();
    for (const i of g) { const k = left.indexOf(A[i]); if (k >= 0) { out.set(i, A[i]); left.splice(k, 1); } }
    for (const i of g) if (!out.has(i)) out.set(i, left.shift());
    for (const i of g) Bc[i] = out.get(i);
  }
  const diff = [];
  for (let i = 0; i < ctx.S; i++) if (A[i] !== Bc[i]) diff.push(i);
  const par = Array.from({ length: ctx.P }, (_, k) => k);
  const f = (x) => (par[x] === x ? x : (par[x] = f(par[x])));
  for (const i of diff) if (A[i] >= 0 && Bc[i] >= 0) par[f(A[i])] = f(Bc[i]);
  const comps = new Map();
  for (const i of diff) { const r = f(A[i] >= 0 ? A[i] : Bc[i]); (comps.get(r) || comps.set(r, []).get(r)).push(i); }
  console.log(`  difference, day-swept to HiGHS (identical copies matched): ${diff.length} copies in ${comps.size} connected trades`);
  for (const list of [...comps.values()].sort((a, b) => b.length - a.length)) {
    const people = new Set(list.flatMap((i) => [A[i], Bc[i]]).filter((p) => p >= 0));
    const opens = list.filter((i) => A[i] < 0 || Bc[i] < 0).length;
    const C = A.slice(); for (const i of list) C[i] = Bc[i];
    console.log(`    ${list.length} copies, ${people.size} people, ${opens} copies opened or covered, days ${[...new Set(list.map((i) => days[ctx.slots[i].day] ?? ctx.slots[i].day))].join(" ")}, alone it changes the score by ${(score(C) - score(A)).toFixed(2)}`);
  }
}
