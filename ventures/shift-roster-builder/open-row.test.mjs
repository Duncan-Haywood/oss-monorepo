// The open-hours row (bnp.mjs `openFloor`, calc.mjs buildRoster's `openRow`): a knapsack row, sum of open shift hours >= F, in the
// whole-score column generation's master LP, where F is a floor on open hours already proven for every roster. It closed the two
// call-out weeks the README's "Open hours come in whole shifts" left bounded on pay (README "The open-hours row in the score LP").
import test from "node:test";
import assert from "node:assert/strict";
import { solveLP } from "./bnp.mjs";
import { parseStaff, parseShifts, scoreBoundByColumnGeneration, _internals } from "./calc.mjs";

const { buildContext, scoreOwner, ownerValid, earlyOpenFloor } = _internals;

test("solveLP with weighted columns: a row with other coefficients than 1, scaled to a right-hand side of 1", () => {
  // Shifts of 3 h and 8 h, one person who can hold either or none, open hours at least 3 (row 3: 3/3 x0 + 8/3 x1 - surplus = 1).
  // Without the row the person holds the 8 h shift and 3 h stay open (cost 3); with it the same, but a floor of 8 forces 8 h open.
  const cols = [[0, 3], [1, 3], [3], [2], [0, 2], [1, 2]];
  const cost = [3, 8, 0, 0, 0, 0];
  const init = Int32Array.from([0, 1, 2, 3]);
  for (const [F, want] of [[3, 3], [5, 5], [8, 8]]) {
    const vals = [[1, 3 / F], [1, 8 / F], [-1], null, null, null];
    const r = solveLP(4, cols, cost, init, { vals });
    assert.equal(r.infeasible, false);
    // F = 5: hold the 3 h shift fully open (3) plus 2/8 of the 8 h shift (2 h): 5. Any LP point has open hours >= F and cost = hours.
    assert.ok(Math.abs(r.obj - want) < 1e-9, `F ${F}: ${r.obj} vs ${want}`);
  }
});

// Three people on three days with caps of 8-16 h and shifts of 3, 8 and 10 h: the mix where whole shifts matter (a 3 h shift
// must stay open while the LP leaves part of an 8 h one open instead).
function seededWeek(seed, P, S) {
  const days = ["Mon", "Tue", "Wed"];
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };
  const st = Array.from({ length: P }, (_, p) => `P${p},${10 + rnd(12)},${[8, 11, 13, 16][rnd(4)]},0,Mon-Wed ${6 + rnd(3)}-${18 + rnd(6)}`).join("\n");
  const sh = Array.from({ length: S }, () => { const L = [3, 8, 10][rnd(3)]; const a = 7 + rnd(8); return `${days[rnd(3)]},${a},${Math.min(24, a + L)},1`; }).join("\n");
  return { staff: parseStaff(st).staff, slots: parseShifts(sh).slots };
}

// Every owner array (each shift to one eligible person or open): the least score and the least open hours, on a tiny week.
function brute(staff, slots, options) {
  const ctx = buildContext(staff, slots, options);
  const len = ctx.slots.map((s) => (s.end - s.start) / 60);
  const owner = new Array(ctx.S).fill(-1);
  let best = Infinity, leastOpen = Infinity;
  const rec = (i) => {
    if (i === ctx.S) {
      if (!ownerValid(ctx, owner)) return;
      best = Math.min(best, scoreOwner(ctx, owner).total);
      leastOpen = Math.min(leastOpen, owner.reduce((a, p, s) => a + (p < 0 ? len[s] : 0), 0));
      return;
    }
    for (let p = -1; p < ctx.P; p++) { if (p >= 0 && !ctx.elig[p][i]) continue; owner[i] = p; rec(i + 1); }
    owner[i] = -1;
  };
  rec(0);
  return { best, leastOpen };
}

test("with the true least open hours as the row, the score bound stays at or below the brute-force best and never drops", () => {
  let raised = 0, checked = 0;
  for (let seed = 1; seed < 400; seed++) {
    const { staff, slots } = seededWeek(seed * 7919, 3, 6);
    const { best, leastOpen } = brute(staff, slots, {});
    if (!(leastOpen > 0)) continue;
    const plain = scoreBoundByColumnGeneration(staff, slots, {}, { incumbentScore: best, rootDive: false, nodeLimit: 1 });
    const row = scoreBoundByColumnGeneration(staff, slots, {}, { incumbentScore: best, rootDive: false, nodeLimit: 1, openFloor: leastOpen });
    const tol = 1e-6 * (1 + best);
    assert.ok(row.rootLP <= best + tol && row.floor <= best + tol, `seed ${seed}: with the row ${row.rootLP} / ${row.floor} above the best ${best}`);
    assert.ok(row.rootLP >= plain.rootLP - tol, `seed ${seed}: the row lowered the root LP ${plain.rootLP} -> ${row.rootLP}`);
    checked++;
    if (row.rootLP > plain.rootLP + 1) {
      raised++;
      // Where the row matters, a full search with it still reaches the best score: the bound and a roster meet.
      const full = scoreBoundByColumnGeneration(staff, slots, {}, { openFloor: leastOpen });
      assert.ok(full.proven && Math.abs(full.best - best) < tol, `seed ${seed}: search with the row ${full.best} (proven ${full.proven}), best ${best}`);
    }
  }
  assert.ok(checked >= 150, `only ${checked} weeks with open hours`);
  assert.ok(raised >= 3, `the row raised the root LP on only ${raised} weeks`);
});

test("the early floor (lifted coverage root LP) never exceeds the brute-force least open hours, and fires where whole shifts matter", () => {
  let fired = 0, checked = 0;
  for (let seed = 1; seed < 400; seed++) {
    const { staff, slots } = seededWeek(seed * 7919, 3, 6);
    const { best, leastOpen } = brute(staff, slots, {});
    if (!(leastOpen > 0)) continue;
    checked++;
    const e = earlyOpenFloor(buildContext(staff, slots, {}), best);
    if (!e) continue;
    fired++;
    assert.ok(e.floor <= leastOpen + 1e-9, `seed ${seed}: early floor ${e.floor} above the least open hours ${leastOpen}`);
    assert.ok(e.floor > e.rootLP, `seed ${seed}: returned without lifting the LP`);
  }
  console.log(`early floor fired on ${fired} of ${checked}`);
  assert.ok(checked >= 150 && fired >= 3, `fired on ${fired} of ${checked}`);
});
