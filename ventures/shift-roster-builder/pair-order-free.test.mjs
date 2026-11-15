// An order-free pair check (2026-11-15, README "An order-free pair check", eval/pair-order-free.mjs): coverGroupsFree answers
// a question about the covered roster, so its verdict cannot depend on the order the shifts are handed out, and its pruning
// only cuts branches that hold no cover (checked here against an oracle that asks the same question another way).
import test from "node:test";
import assert from "node:assert/strict";
import { parseStaff, parseShifts, buildContext, buildRoster, coverRisk, coverPairRisk, coverSlackPass, _internals } from "./calc.mjs";
import { seededWeeks } from "./eval/reissue-scale.mjs";

const O = { minRestHours: 10 };
const { coverGroupsFree, validList, insertSorted } = _internals;

function week(P, S, wk) {
  const { staff: st, shifts: sh } = seededWeeks(P, S, wk + 1)[wk];
  const staff = parseStaff(st).staff, slots = parseShifts(sh).slots;
  const ctx = buildContext(staff, slots, O);
  return { staff, slots, ctx, owner: buildRoster(staff, slots, { ...O, seed: 1 }).owner };
}

function rng(seed) { let x = seed >>> 0 || 1; return () => ((x = (x * 1103515245 + 12345) >>> 0) / 2 ** 32); }
function shuffler(seed) {
  const r = rng(seed);
  return (w) => { const a = w.slice(); for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; };
}

// The pair's safe person-days and lists, as coverPairRisk builds them.
function pairsOf(ctx, owner) {
  const lists = Array.from({ length: ctx.P }, () => []);
  owner.forEach((p, i) => { if (p >= 0) lists[p].push(i); });
  lists.forEach((l) => l.sort((a, b) => ctx.slots[a].start - ctx.slots[b].start || a - b));
  const one = coverRisk(ctx, owner);
  const risky = new Set(one.cases.map((c) => c.person + "|" + c.day));
  const days = [];
  for (let p = 0; p < ctx.P; p++) {
    const byDay = new Map();
    for (const i of lists[p]) { const d = ctx.slots[i].day; if (d < 1) continue; if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(i); }
    for (const [day, mine] of byDay) if (!risky.has(p + "|" + day)) days.push({ person: p, day, mine });
  }
  const pairs = [];
  for (let a = 0; a < days.length; a++) for (let b = a + 1; b < days.length; b++) pairs.push([days[a], days[b]]);
  return { lists, pairs };
}

// The same question asked another way, as the oracle: first choose which of their own shifts (on or after the earlier call-out
// day) each person gives up, at most two each and `passes` in all; then hand every open shift (the callers' and the given-up
// ones) to someone eligible, checking each list as orig - given up + taken so far (part of the final list, so exact); a
// person who gives shifts up must take at least one. Nothing here is shared with coverGroupsFree's search.
function oracle(ctx, lists0, groups, passes, callerTakes = true) {
  const lists = lists0.slice();
  for (const g of groups) lists[g.person] = lists[g.person].filter((x) => !g.mine.includes(x));
  const off = new Map();
  for (const g of groups) { if (!off.has(g.person)) off.set(g.person, []); off.get(g.person).push(g.day); }
  const ok = (q, i) => { const o = off.get(q); if (!o) return true; if (!callerTakes) return false; const d = ctx.slots[i].day; return d > Math.min(...o) && !o.includes(d); };
  const minDay = Math.min(...groups.map((g) => g.day));
  const own = [];
  for (let q = 0; q < ctx.P; q++) for (const j of lists[q]) if (ctx.slots[j].day >= minDay) own.push([q, j]);
  const callerShifts = groups.flatMap((g) => g.mine);
  const tryGiveUp = (gone) => {
    const L = lists.map((l, q) => l.filter((j) => !gone.some(([p, x]) => p === q && x === j)));
    const open = callerShifts.concat(gone.map(([, j]) => j));
    const takes = new Int32Array(ctx.P);
    const go = (k) => {
      if (k === open.length) return gone.every(([p]) => takes[p] > 0);
      const i = open[k];
      for (let q = 0; q < ctx.P; q++) {
        if (!ctx.elig[q][i] || !ok(q, i)) continue;
        const Lq = L[q], next = insertSorted(ctx, Lq, i);
        if (!validList(ctx, q, next)) continue;
        L[q] = next; takes[q]++;
        const r = go(k + 1);
        L[q] = Lq; takes[q]--;
        if (r) return true;
      }
      return false;
    };
    return go(0);
  };
  const pick = (start, gone) => {
    if (tryGiveUp(gone)) return true;
    if (gone.length >= passes) return false;
    for (let t = start; t < own.length; t++) {
      const [q] = own[t];
      if (gone.filter(([p]) => p === q).length >= 2) continue;
      if (pick(t + 1, gone.concat([own[t]]))) return true;
    }
    return false;
  };
  return pick(0, []);
}

test("coverGroupsFree agrees with an independent oracle on small seeded weeks", () => {
  let yes = 0, no = 0, viaPass = 0;
  for (const [P, S, wk] of [[6, 16, 0], [7, 18, 1], [7, 18, 2], [7, 22, 3], [8, 24, 3]]) {
    const { ctx, owner } = week(P, S, wk);
    const { lists, pairs } = pairsOf(ctx, owner);
    for (const [A, B] of pairs) {
      if (A.person === B.person && A.day === B.day) continue;
      if (A.mine.length + B.mine.length > 3) continue;
      for (const [chain, passes] of [[1, 2], [2, 2], [1, 3]]) {
        const got = coverGroupsFree(ctx, lists, [A, B], chain, Infinity, true, null, null, passes);
        const want = oracle(ctx, lists, [A, B], passes);
        assert.equal(!!got, want, `P=${P} wk ${wk} pair ${A.person}/${A.day} ${B.person}/${B.day} chain ${chain} passes ${passes}`);
        if (want) yes++; else no++;
        if (got === "chain") viaPass++;
      }
    }
  }
  assert.ok(yes > 20 && no > 5 && viaPass >= 4, `both verdicts and covers through a pass are exercised (${yes} yes, ${no} no, ${viaPass} via a pass)`);
});

test("coverGroupsFree: the verdict is the same in every hand-out order, with and without the look-ahead", () => {
  for (const [P, S, wk] of [[12, 36, 0], [20, 56, 2]]) {
    const { ctx, owner } = week(P, S, wk);
    const { lists, pairs } = pairsOf(ctx, owner);
    let differ = 0, tried = 0;
    for (const [A, B] of pairs.slice(0, 160)) {
      if (A.person === B.person && A.day === B.day) continue;
      const base = !!coverGroupsFree(ctx, lists, [A, B], 2, Infinity, true);
      for (const look of [true, false]) for (const order of [null, "reverse", "fewest", shuffler(A.person * 31 + B.day), shuffler(B.person * 17 + A.day)]) {
        tried++;
        if (!!coverGroupsFree(ctx, lists, [A, B], 2, Infinity, true, null, order, null, look) !== base) differ++;
      }
    }
    assert.equal(differ, 0, `P=${P}: ${differ} of ${tried} verdicts changed with the order`);
  }
});

test("coverPairRisk with orderFree: the whole walk's count is the same in every order; the old search's is not", () => {
  const { ctx, owner } = week(20, 56, 2);
  const single = coverRisk(ctx, owner);
  const counts = new Set(), old = new Set();
  for (const handOut of [null, "fewest", "reverse"]) {
    const r = coverPairRisk(ctx, owner, { single, budget: 200000, orderFree: true, handOut });
    assert.equal(r.capped, 0);
    counts.add(r.hours + "/" + r.clashing);
    old.add(coverPairRisk(ctx, owner, { single, budget: 200000, handOut: handOut === "reverse" ? "takers" : handOut }).hours);
  }
  assert.equal(counts.size, 1, [...counts].join(" "));
  assert.ok(old.size > 1, "the old search's count changes with the order on this week (179 h against 187 h)");
});

test("coverPairRisk with orderFree leaves the lists as it found them and stays within its budget's verdicts", () => {
  const { ctx, owner } = week(20, 56, 2);
  const single = coverRisk(ctx, owner);
  const small = coverPairRisk(ctx, owner, { single, budget: 500, orderFree: true, keep: true });
  const full = coverPairRisk(ctx, owner, { single, budget: 200000, orderFree: true, keep: true });
  assert.equal(small.pairs, full.pairs);
  for (let k = 0; k < small.checked.length; k++) {
    const s = small.checked[k].how, f = full.checked[k].how;
    if (s !== null) assert.equal(!!s, !!f, `a verdict reached within 500 checks is final (pair ${k})`);
  }
  assert.ok(small.hours >= full.hours);
});

test("coverSlackPass and buildRoster pass coverPairOrderFree through", () => {
  const { staff, slots, ctx, owner } = week(20, 56, 2);
  const on = coverSlackPass(ctx, owner, { price: 25, pairPrice: 1, rounds: 3, pairOrderFree: true });
  assert.equal(on.pairOrderFree, true);
  const full = coverPairRisk(ctx, on.owner, { budget: 200000, orderFree: true });
  assert.equal(on.pairHours, full.hours, "the reported pair hours are the order-free count's");
  const small = week(8, 24, 0);
  const r = buildRoster(small.staff, small.slots, { ...O, seed: 1, coverPrice: 25, coverPairPrice: 1, coverPairOrderFree: true });
  assert.equal(r.coverSlack.pairOrderFree, true);
  const r0 = buildRoster(small.staff, small.slots, { ...O, seed: 1, coverPrice: 25, coverPairPrice: 1 });
  assert.notEqual(r0.coverSlack.pairOrderFree, true);
  void staff; void slots;
});
