import test from "node:test";
import assert from "node:assert/strict";
import { parseCards, parseTiers, parseProb, normalizeOptions, chooseTier, evaluateCard, breakEvenP10, selectBest, plan, summarize, money, pct, DEFAULT_TIERS, CONDITION_DEFAULTS, MAX_CARDS } from "./engine.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("probabilities: fractions, percents, bad values", () => {
  assert.equal(parseProb("0.35"), 0.35);
  assert.equal(parseProb("35%"), 0.35);
  assert.equal(parseProb("35"), 0.35);
  assert.equal(parseProb("1"), 1);
  assert.equal(parseProb(""), null);
  assert.ok(Number.isNaN(parseProb("abc")));
  assert.ok(Number.isNaN(parseProb("150%")));
  assert.ok(Number.isNaN(parseProb("-0.1")));
});

test("parse reports line numbers and never throws", () => {
  const r = parseCards("name,raw,v10,v9,v8,v7,p10,p9,p8\nA,abc,1,1,1,1\nB,10,50,30,20,10,0.5,0.4,0.2\nShort,10\nC,10,50,30,20,10,0.2,0.2\nD,10,50,30,20,10,sharp,,,tag, with comma\nE,10,50,30,20,10,bogus,,\nF,$1,200,50,30,10,20%,40%,20%,note\n,1,1,1,1,1\nG,10,50,30,20,10");
  assert.deepEqual(r.cards.map((c) => c.name), ["D", "F", "G"]);
  assert.equal(r.cards[0].condition, "sharp");
  assert.equal(r.cards[0].note, "tag,with comma");
  assert.equal(r.cards[1].raw, 1);
  assert.deepEqual(r.cards[1].probs, { p10: 0.2, p9: 0.4, p8: 0.2 });
  assert.equal(r.cards[2].probs, null);
  assert.match(r.errors[0], /^line 2: raw value must be a number/);
  assert.ok(r.errors.some((e) => /^line 3: p10 \+ p9 \+ p8 is 110%/.test(e)));
  assert.ok(r.errors.some((e) => /^line 4: expected name/.test(e)));
  assert.ok(r.errors.some((e) => /^line 5: p10, p9 and p8 must each be/.test(e)));
  assert.ok(r.errors.some((e) => /^line 7: condition must be one of/.test(e)));
  assert.ok(r.errors.some((e) => /^line 9: name is empty/.test(e)));
  assert.equal(parseCards("").cards.length, 0);
  assert.ok(parseCards(Array.from({ length: MAX_CARDS + 1 }, (_, i) => `c${i},1,2,2,2,2`).join("\n")).errors.some((e) => /at most/.test(e)));
});

test("tier parsing and defaults", () => {
  const t = parseTiers("name,fee,max,days\nA,20,500,60\nB,100,none,5\nbad,x,1,1\nC,5,0,1\nD,5,10\nE,5,10,-1");
  assert.deepEqual(t.tiers.map((x) => x.name), ["A", "B"]);
  assert.equal(t.tiers[1].maxValue, Infinity);
  assert.equal(t.errors.length, 4);
  assert.equal(parseTiers("# nothing").errors[0], "no fee tiers found");
  assert.ok(DEFAULT_TIERS.length >= 4);
});

test("cheapest covering tier; none flagged", () => {
  const tiers = normalizeOptions({}).tiers;
  assert.equal(chooseTier(400, tiers).name, "Economy");
  assert.equal(chooseTier(500, tiers).name, "Economy");
  assert.equal(chooseTier(500.01, tiers).name, "Regular");
  assert.equal(chooseTier(2600, tiers).name, "Express");
  assert.equal(chooseTier(30000, tiers), null);
  // unsorted input is sorted by fee; ties go to the faster tier
  const o = normalizeOptions({ tiers: [{ name: "slow", fee: 10, maxValue: 100, days: 50 }, { name: "fast", fee: 10, maxValue: 100, days: 5 }] });
  assert.equal(chooseTier(50, o.tiers).name, "fast");
  const c = evaluateCard({ name: "x", raw: 10, v10: 50000, v9: 1, v8: 1, v7: 1, probs: null, condition: "clean", note: "" }, normalizeOptions({}));
  assert.equal(c.gradable, false);
  assert.equal(c.uplift, null);
  assert.ok(c.findings.some((f) => f.rule === "no-tier"));
});

const O0 = { tiers: [{ name: "T", fee: 20, maxValue: 5000, days: 0 }], shipPerCard: 5, sellFeePct: 10, sellFixed: 0, annualRate: 0 };

test("expected net agrees with hand arithmetic", () => {
  const card = { name: "h", raw: 100, v10: 1000, v9: 400, v8: 200, v7: 80, probs: { p10: 0.2, p9: 0.3, p8: 0.3 }, note: "" };
  const e = evaluateCard(card, normalizeOptions(O0));
  // nets after 10% fee: 900, 360, 180, 72; p7 = 0.2; cost 25
  close(e.expGrade, 0.2 * 900 + 0.3 * 360 + 0.3 * 180 + 0.2 * 72 - 25);
  close(e.netRaw, 90);
  close(e.uplift, 0.2 * 900 + 0.3 * 360 + 0.3 * 180 + 0.2 * 72 - 25 - 90);
  // outcomes below raw: only grade 7 or lower (72 - 25 = 47 < 90); grade 8 gives 155 > 90
  close(e.pLoseVsRaw, 0.2);
  assert.equal(e.worst.grade, "7 or lower");
  close(e.worst.net, 47);
  close(e.worst.vsRaw, 47 - 90);
});

test("time value discounts only the graded sale; fixed fee applies per sale", () => {
  const card = { name: "t", raw: 100, v10: 200, v9: 200, v8: 200, v7: 200, probs: { p10: 1, p9: 0, p8: 0 }, note: "" };
  const o = normalizeOptions({ tiers: [{ name: "T", fee: 10, maxValue: 1000, days: 73 }], shipPerCard: 0, sellFeePct: 0, sellFixed: 1, annualRate: 10 });
  const e = evaluateCard(card, o);
  close(e.discount, 1 / 1.02);
  close(e.expGrade, (200 - 1) / 1.02 - 10);
  close(e.netRaw, 99);
});

test("break-even p10 is exact: expected net equals raw there, and flips either side", () => {
  const o = normalizeOptions({ ...O0, annualRate: 12 });
  const base = { name: "b", raw: 250, v10: 900, v9: 300, v8: 180, v7: 120, note: "" };
  const e0 = evaluateCard({ ...base, probs: { p10: 0.1, p9: 0.3, p8: 0.2 } }, o);
  assert.equal(e0.breakEven.status, "at");
  const p = e0.breakEven.p10;
  const at = evaluateCard({ ...base, probs: { p10: p, p9: 0.3, p8: 0.2 } }, o);
  close(at.uplift, 0, 1e-9);
  assert.ok(evaluateCard({ ...base, probs: { p10: p + 0.01, p9: 0.3, p8: 0.2 } }, o).uplift > 0);
  assert.ok(evaluateCard({ ...base, probs: { p10: p - 0.01, p9: 0.3, p8: 0.2 } }, o).uplift < 0);
});

test("break-even status: always, never, and a card whose 10 is no better than a 7", () => {
  assert.equal(breakEvenP10({ nets: [900, 500, 400, 300], d: 1, cost: 10, netRaw: 100, p9: 0.2, p8: 0.2 }).status, "always");
  const nev = breakEvenP10({ nets: [200, 100, 80, 60], d: 1, cost: 50, netRaw: 150, p9: 0.3, p8: 0.3 });
  assert.equal(nev.status, "never");
  assert.ok(nev.p10 > nev.max);
  assert.equal(breakEvenP10({ nets: [50, 50, 50, 50], d: 1, cost: 5, netRaw: 10, p9: 0, p8: 0 }).status, "always");
  assert.equal(breakEvenP10({ nets: [50, 50, 50, 50], d: 1, cost: 5, netRaw: 100, p9: 0, p8: 0 }).status, "never");
});

test("condition defaults resolve and the remainder is grade 7 or lower", () => {
  const o = normalizeOptions({ ...O0, defaultCondition: "fair" });
  const row = { name: "c", raw: 50, v10: 200, v9: 100, v8: 60, v7: 40, probs: null, condition: null, note: "" };
  const a = evaluateCard(row, o);
  assert.match(a.probs.source, /default condition: fair/);
  const b = evaluateCard({ ...row, condition: "sharp" }, o);
  assert.equal(b.probs.p10, CONDITION_DEFAULTS.sharp.p10);
  close(b.probs.p7, 1 - 0.35 - 0.4 - 0.15);
  assert.throws(() => normalizeOptions({ defaultCondition: "mint" }), /default condition/);
});

test("option validation", () => {
  assert.throws(() => normalizeOptions({ shipPerCard: -1 }), /shipping/);
  assert.throws(() => normalizeOptions({ sellFeePct: 120 }), /marketplace fee/);
  assert.throws(() => normalizeOptions({ maxCards: 2.5 }), /whole number/);
  assert.throws(() => normalizeOptions({ budget: "abc" }), /grading budget/);
  assert.throws(() => normalizeOptions({ tiers: [] }), /fee tier/);
  assert.throws(() => normalizeOptions({ tiers: "name,fee\nbad" }), /tier line/);
  const o = normalizeOptions({ budget: "", maxCards: "" });
  assert.equal(o.budget, Infinity);
  assert.equal(o.maxCards, Infinity);
});

// ---- exact subset selection against brute force ----

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function brute(items, budget, maxCount) {
  const n = items.length;
  let best = { value: 0, cost: 0, ids: [] };
  for (let m = 0; m < 1 << n; m += 1) {
    let c = 0; let v = 0; let k = 0; const ids = [];
    for (let i = 0; i < n; i += 1) if (m & (1 << i)) { c += Math.round(items[i].cost * 100); v += items[i].value; k += 1; ids.push(items[i].id); }
    if (c > Math.round(budget * 100) || k > maxCount) continue;
    if (v > best.value + 1e-9 || (Math.abs(v - best.value) <= 1e-9 && c / 100 < best.cost)) best = { value: v, cost: c / 100, ids };
  }
  return best;
}

test("selectBest equals brute force over all subsets (budget, count and both)", () => {
  const r = rng(20261002);
  for (let trial = 0; trial < 300; trial += 1) {
    const n = 1 + Math.floor(r() * 11);
    const items = Array.from({ length: n }, (_, i) => ({ id: `i${i}`, cost: Math.round((5 + r() * 120) * 100) / 100, value: Math.round((-20 + r() * 300) * 100) / 100 }));
    const mode = trial % 3;
    const budget = mode === 1 ? Infinity : Math.round((20 + r() * 400) * 100) / 100;
    const maxCount = mode === 0 ? Infinity : 1 + Math.floor(r() * 5);
    const got = selectBest(items, { budget, maxCount });
    const want = brute(items, Number.isFinite(budget) ? budget : 1e9, maxCount);
    close(got.value, want.value, 1e-6);
    // the returned subset must itself be feasible and carry the value it claims
    const chosen = got.ids.map((id) => items.find((x) => x.id === id));
    assert.equal(new Set(got.ids).size, got.ids.length);
    assert.ok(chosen.length <= maxCount);
    assert.ok(chosen.reduce((s, x) => s + Math.round(x.cost * 100), 0) <= (Number.isFinite(budget) ? Math.round(budget * 100) : Infinity));
    close(chosen.reduce((s, x) => s + x.value, 0), got.value, 1e-6);
    assert.ok(chosen.every((x) => x.value > 0));
  }
});

test("a knapsack case where ranking by uplift and cutting off is wrong", () => {
  const items = [
    { id: "big", cost: 60, value: 100 },
    { id: "a", cost: 30, value: 70 },
    { id: "b", cost: 30, value: 70 },
  ];
  const got = selectBest(items, { budget: 60 });
  assert.deepEqual(got.ids.sort(), ["a", "b"]);
  close(got.value, 140);
});

test("selectBest with nothing feasible or nothing positive returns an empty set", () => {
  assert.deepEqual(selectBest([{ id: "x", cost: 50, value: 10 }], { budget: 10 }).ids, []);
  assert.deepEqual(selectBest([{ id: "x", cost: 5, value: -10 }], {}).ids, []);
  assert.deepEqual(selectBest([], { maxCount: 0 }).ids, []);
  assert.deepEqual(selectBest([{ id: "x", cost: 5, value: 10 }], { maxCount: 0 }).ids, []);
});

test("plan agrees with brute force on whole card lists", () => {
  const r = rng(77);
  for (let trial = 0; trial < 40; trial += 1) {
    const cards = Array.from({ length: 9 }, (_, i) => {
      const raw = Math.round(20 + r() * 600);
      const v10 = raw * (1.5 + r() * 6); const v9 = raw * (0.8 + r() * 2); const v8 = raw * (0.6 + r()); const v7 = raw * (0.4 + r() * 0.8);
      const p10 = r() * 0.3; const p9 = r() * 0.4; const p8 = r() * 0.3;
      return { name: `c${i}`, raw, v10, v9, v8, v7, probs: { p10, p9, p8 }, condition: null, note: "", line: i + 1 };
    });
    const opts = { budget: 100 + Math.round(r() * 300), maxCards: 2 + Math.floor(r() * 4) };
    const p = plan({ cards }, opts);
    const o = normalizeOptions(opts);
    const ev = cards.map((c) => evaluateCard(c, o)).filter((c) => c.gradable && c.uplift > 0);
    const want = brute(ev.map((c) => ({ id: c.name, cost: c.cost, value: c.uplift })), o.budget, o.maxCards);
    close(p.uplift, want.value, 1e-6);
    assert.ok(p.spend <= o.budget + 1e-9);
    assert.ok(p.submit.length <= o.maxCards);
    assert.ok(p.upliftVsBest >= -1e-6, "the exact plan never does worse than the greedy rule");
  }
});

const CSV = `name,raw,v10,v9,v8,v7,p10,p9,p8,note
Big,1000,6000,2400,1400,900,0.2,0.4,0.25
Mid A,200,1000,420,260,190,0.25,0.4,0.2
Mid B,200,1000,420,260,190,0.25,0.4,0.2
Dud,50,90,60,50,45,0.05,0.1,0.2
Grail,9000,40000,12000,9500,8000,0.1,0.3,0.3
`;

test("plan: ranked submit list, holds with reasons, findings", () => {
  const p = plan(parseCards(CSV), {});
  assert.deepEqual(p.submit.map((c) => c.name), ["Big", "Mid A", "Mid B"].sort((a, b) => p.submit.find((c) => c.name === b).uplift - p.submit.find((c) => c.name === a).uplift));
  assert.ok(p.submit.every((c, i, a) => i === 0 || a[i - 1].uplift >= c.uplift));
  assert.equal(p.hold.find((h) => h.name === "Dud").reason, "expected net from grading is below selling raw");
  assert.match(p.hold.find((h) => h.name === "Grail").reason, /no fee tier/);
  assert.ok(p.findings.some((f) => f.rule === "no-tier"));
  assert.equal(summarize(p).status, "gain");
  close(p.expectedNetAll, p.rawNetAll + p.uplift);
});

test("a budget cap spends the money on the better subset", () => {
  const free = plan(parseCards(CSV), {});
  const capped = plan(parseCards(CSV), { budget: 300 });
  assert.ok(capped.spend <= 300);
  assert.ok(capped.uplift < free.uplift);
  assert.ok(capped.findings.some((f) => f.rule === "limit-bound"));
  const slots = plan(parseCards(CSV), { maxCards: 1 });
  assert.equal(slots.submit.length, 1);
  assert.equal(slots.submit[0].name, "Big");
});

test("nothing worth sending says so", () => {
  const p = plan(parseCards("Dud,50,90,60,50,45,0.05,0.1,0.2"), {});
  assert.equal(p.submit.length, 0);
  assert.equal(summarize(p).status, "none");
  assert.match(summarize(p).text, /Send none/);
});

test("formatting", () => {
  assert.equal(money(1234.5), "$1,234.50");
  assert.equal(money(-2), "-$2.00");
  assert.equal(money(null), "n/a");
  assert.equal(pct(0.355), "35.5%");
  assert.equal(pct(0.2), "20%");
});
