import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, parseOffers, parseTrailer, solve, bruteForce, greedy, timeline, toCsv, money, EXAMPLE_SHARED, CLASSES, MAX_OFFERS } from "./calc.mjs";

const T = { lowerIn: 40 * 12, upperIn: 40 * 12, payload: 40000, upperMax: 16000, heavy: 6500, gap: 6, cpm: 2, handling: 10 };
const o = (label, len, wt, pay, pu, dr, detour = 0) => ({ label, len, wt, pay, pu, dr, detour });

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

test("parser reads class names, explicit lengths and a header", () => {
  const w = [];
  const r = parseOffers("label,type,weight,pay,pickup,drop,detour\nA, sedan, , 500, 0, 300\nB, 210, 4100, 600, 50, 400, 12\nC, HD Pickup,,900,0,100", w);
  assert.deepEqual(w, []);
  assert.equal(r.length, 3);
  assert.equal(r[0].len, CLASSES.sedan.len);
  assert.equal(r[0].wt, CLASSES.sedan.wt);
  assert.equal(r[1].len, 210);
  assert.equal(r[1].detour, 12);
  assert.equal(r[2].len, CLASSES.hdpickup.len);
});

test("parser rejects bad lines with a reason and keeps the good ones", () => {
  const w = [];
  const r = parseOffers("A, sedan,, 500, 0, 300\nB, spaceship,, 500, 0, 300\nC, sedan,, 500, 300, 100\nD, 200,, 500, 0, 300\nE, sedan,, x, 0, 300\nF, sedan", w);
  assert.equal(r.length, 1);
  assert.equal(w.length, 5);
  assert.match(w.join(" "), /spaceship/);
  assert.match(w.join(" "), /must be after pickup/);
});

test("more than the maximum offers is trimmed with a warning", () => {
  const w = [];
  const text = Array.from({ length: MAX_OFFERS + 3 }, (_, i) => `V${i}, sedan,, 400, 0, 100`).join("\n");
  assert.equal(parseOffers(text, w).length, MAX_OFFERS);
  assert.match(w[0], /first 24/);
});

test("trailer parser demands lengths and payload, defaults the rest", () => {
  const w = [];
  assert.equal(parseTrailer({ lowerFt: "", payloadLb: "40000" }, w), null);
  assert.match(w.join(" "), /Lower deck length/);
  const t = parseTrailer({ lowerFt: "40", payloadLb: "40000" }, []);
  assert.equal(t.lowerIn, 480);
  assert.equal(t.upperIn, 0);
  assert.equal(t.gap, 6);
  assert.equal(t.upperMax, 40000);
});

test("a single deck holds only what fits, counting the gaps", () => {
  const t = { ...T, upperIn: 0, lowerIn: 2 * 190 + 6 };
  const offers = [o("a", 190, 3000, 500, 0, 100), o("b", 190, 3000, 400, 0, 100), o("c", 190, 3000, 300, 0, 100)];
  assert.equal(solve(t, offers).items.length, 2); // 190+6+190 fits exactly, a third does not
  assert.equal(solve({ ...t, lowerIn: 2 * 190 + 5 }, offers).items.length, 1);
});

test("a car dropped at a mile frees its space for one picked up at that mile", () => {
  const t = { ...T, upperIn: 0, lowerIn: 200 };
  const sequential = [o("a", 190, 3000, 500, 0, 100), o("b", 190, 3000, 500, 100, 200)];
  assert.equal(solve(t, sequential).items.length, 2);
  const overlap = [o("a", 190, 3000, 500, 0, 100), o("b", 190, 3000, 500, 99, 200)];
  assert.equal(solve(t, overlap).items.length, 1);
});

test("heavy vehicles ride the lower deck only, and the upper deck weight cap holds", () => {
  const t = { ...T, lowerIn: 200, upperIn: 400, upperMax: 7000 };
  const heavy = o("big", 190, 8000, 900, 0, 100);
  const r = solve(t, [heavy, o("x", 190, 3000, 100, 0, 100)]);
  assert.equal(r.items.find((s) => s.i === 0).d, 0);
  const light = [o("a", 190, 4000, 500, 0, 100), o("b", 190, 4000, 500, 0, 100), o("c", 190, 4000, 500, 0, 100)];
  const r2 = solve({ ...t, heavy: 9000 }, light);
  // one on the lower deck, the upper deck can take only one 4000 lb car under a 7000 lb cap
  assert.equal(r2.items.length, 2);
});

test("total payload binds across both decks", () => {
  const t = { ...T, payload: 9000, heavy: Infinity };
  const offers = [o("a", 150, 4000, 500, 0, 100), o("b", 150, 4000, 400, 0, 100), o("c", 150, 4000, 300, 0, 100)];
  const r = solve(t, offers);
  assert.equal(r.items.length, 2);
  assert.equal(r.value, 500 + 400 - 20);
});

test("detour miles and handling are charged, and a losing car is left", () => {
  const t = { ...T, cpm: 2, handling: 10 };
  const offers = [o("far", 190, 3000, 100, 0, 100, 50), o("ok", 190, 3000, 400, 0, 100, 5)];
  const r = solve(t, offers);
  assert.deepEqual(r.items.map((s) => s.i), [1]);
  assert.equal(r.value, 400 - 10 - 10);
});

test("solver matches exhaustive search on random small loads", () => {
  const rand = rng(42);
  for (let trial = 0; trial < 60; trial++) {
    const n = 4 + Math.floor(rand() * 5);
    const t = { ...T, lowerIn: 200 + Math.floor(rand() * 400), upperIn: Math.floor(rand() * 500), payload: 8000 + Math.floor(rand() * 20000), upperMax: 5000 + Math.floor(rand() * 8000), heavy: rand() < 0.5 ? 5500 : Infinity };
    const offers = [];
    for (let i = 0; i < n; i++) {
      const pu = Math.floor(rand() * 5) * 100;
      offers.push(o("v" + i, 160 + Math.floor(rand() * 100), 2500 + Math.floor(rand() * 4500), 150 + Math.floor(rand() * 700), pu, pu + 100 + Math.floor(rand() * 5) * 100, rand() < 0.3 ? 20 : 0));
    }
    const r = solve(t, offers);
    assert.ok(r.exact);
    assert.ok(Math.abs(r.value - bruteForce(t, offers)) < 1e-6, `trial ${trial}: ${r.value} vs ${bruteForce(t, offers)}`);
  }
});

test("solution never beats the answer by greedy in the wrong direction", () => {
  const a = analyze(EXAMPLE_SHARED);
  assert.ok(a.ok);
  assert.ok(a.exact);
  assert.ok(a.best.value >= a.greedy.value - 1e-9);
});

test("the example loads and every picked car respects the capacity timeline", () => {
  const a = analyze(EXAMPLE_SHARED);
  assert.deepEqual(a.warnings, []);
  for (const p of a.timeline) {
    assert.ok(p.lowerFt * 12 <= a.trailer.lowerIn + 1e-6);
    assert.ok(p.upperFt * 12 <= a.trailer.upperIn + 1e-6);
    assert.ok(p.weight <= a.trailer.payload);
  }
  assert.ok(a.best.count >= 5);
});

test("walk-away price: carried cars tie at that pay, left cars tie at that pay", () => {
  const a = analyze(EXAMPLE_SHARED);
  const bump = (idx, pay) => {
    const offers = a.offers.map((x, i) => (i === idx ? { ...x, pay } : x));
    return solve(a.trailer, offers).value;
  };
  for (const r of a.rows) {
    if (r.walkAway == null) continue;
    const atWalk = bump(r.index, r.walkAway);
    if (r.taken) {
      // lowering its pay to the walk-away price makes the best plan without it exactly as good as the plan with it
      assert.ok(Math.abs(atWalk - (a.best.value - (r.pay - r.walkAway))) < 1e-6, `${r.label}: ${atWalk}`);
      assert.ok(r.walkAway <= r.pay + 1e-9);
      assert.ok(bump(r.index, r.walkAway - 5) <= atWalk + 1e-6);
    } else {
      // raising a left car's pay to its walk-away price just ties the plan; any less and it stays out
      assert.ok(Math.abs(atWalk - a.best.value) < 1e-6, `${r.label}: ${atWalk}`);
      assert.ok(r.walkAway >= r.pay - 1e-9);
      assert.ok(Math.abs(bump(r.index, r.walkAway - 5) - a.best.value) < 1e-6);
    }
  }
});

test("a car that fits nowhere is reported and excluded", () => {
  const a = analyze({ ...EXAMPLE_SHARED, lowerFt: "30", upperFt: "30", offers: EXAMPLE_SHARED.offers + "\nTank, 395, 9000, 5000, 0, 10" });
  assert.match(a.warnings.join(" "), /Tank cannot be carried/);
  assert.ok(a.skipped >= 1);
  assert.equal(a.offers.length + a.skipped, 19);
});

test("a tiny node budget is reported as not proven", () => {
  const a = analyze(EXAMPLE_SHARED);
  const r = solve(a.trailer, a.offers, { maxNodes: 5 });
  assert.equal(r.exact, false);
});

test("timeline counts what is aboard at each pickup", () => {
  const offers = [o("a", 190, 3000, 500, 0, 100), o("b", 190, 3000, 500, 50, 100)];
  const items = [{ i: 0, d: 0 }, { i: 1, d: 1 }];
  const tl = timeline(T, offers, items);
  assert.deepEqual(tl.map((p) => p.onboard), [1, 2]);
  assert.equal(tl[1].weight, 6000);
});

test("analyze rejects missing trailer and too few offers", () => {
  assert.equal(analyze({ ...EXAMPLE_SHARED, lowerFt: "" }).ok, false);
  assert.equal(analyze({ ...EXAMPLE_SHARED, offers: "A, sedan,, 400, 0, 100" }).ok, false);
});

test("CSV has a row per offer and quotes commas", () => {
  const a = analyze({ ...EXAMPLE_SHARED, offers: EXAMPLE_SHARED.offers.replace("Camry A", '"Camry, A"') });
  const csv = toCsv(a);
  assert.equal(csv.trim().split("\n").length, a.rows.length + 1);
  assert.match(money(1234.5), /\$1,234\.5/);
});
