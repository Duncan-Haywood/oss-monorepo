import { test } from "node:test";
import assert from "node:assert/strict";
import { levelBids, levelText } from "./bidlevel.mjs";

const bud = { lines: [
  { item: "Wall sheathing sheets", qty: 100, unit: "sheets", unitPrice: null },
  { item: "Vapor barrier", qty: 1000, unit: "sq ft", unitPrice: null },
  { item: "Anchor bolts", qty: 50, unit: "each", unitPrice: 2 },
] };

test("a cheap bid that is short on quantity and omits scope is leveled up", () => {
  const r = levelBids(bud, [
    { bidder: "A", lines: [{ item: "wall sheathing  sheets", qty: 80, unitPrice: 30 }, { item: "Vapor barrier", qty: 1000, unitPrice: 0.5 }, { item: "Anchor bolts", qty: 50, unitPrice: 2 }] },
    { bidder: "B", lines: [{ item: "Wall sheathing sheets", qty: 100, unitPrice: 32 }, { item: "Vapor barrier", qty: 1000, unitPrice: 0.7 }] },
  ]);
  const A = r.bidders[0], B = r.bidders[1];
  assert.equal(A.bidTotal, 2400 + 500 + 100);
  assert.equal(A.additions, 600); // 20 short sheets at its own 30
  assert.equal(B.bidTotal, 3200 + 700);
  assert.equal(B.additions, 100); // anchor bolts at the plan price 2 x 50
  assert.equal(A.leveledTotal, 3600);
  assert.equal(B.leveledTotal, 4000);
  assert.equal(r.lowestAsBid, "A");
  assert.ok(B.flags.some((f) => f.kind === "missing" && f.item === "Anchor bolts"));
});

test("a gap with no price anywhere is listed, not guessed", () => {
  const r = levelBids(bud, [{ bidder: "A", lines: [{ item: "Anchor bolts", amount: 100, qty: 50 }] }]);
  assert.deepEqual(r.bidders[0].unleveled.sort(), ["Vapor barrier", "Wall sheathing sheets"]);
  assert.equal(r.bidders[0].additions, 0);
});

test("a missing line is priced from the median of the other bids", () => {
  const r = levelBids(bud, [
    { bidder: "A", lines: [{ item: "Vapor barrier", qty: 1000, unitPrice: 1 }] },
    { bidder: "B", lines: [{ item: "Vapor barrier", qty: 1000, unitPrice: 3 }] },
    { bidder: "C", lines: [] },
  ]);
  assert.equal(r.bidders[2].flags.find((f) => f.item === "Vapor barrier").note.includes("median of bids"), true);
  assert.equal(r.bidders[2].additions, 2000 + 100);
});

test("unknown items and lines without an amount are reported", () => {
  const r = levelBids(bud, [{ bidder: "A", lines: [{ item: "Gold taps", amount: 5 }, { item: "Vapor barrier" }] }]);
  assert.equal(r.errors.length, 2);
  assert.ok(levelText(r).some((l) => l.startsWith("ERROR")));
});

test("within tolerance is not flagged; over-quantity is flagged and not removed", () => {
  const r = levelBids(bud, [{ bidder: "A", lines: [{ item: "Wall sheathing sheets", qty: 104, unitPrice: 30 }, { item: "Vapor barrier", qty: 1200, unitPrice: 1 }] }]);
  const f = r.bidders[0].flags;
  assert.ok(!f.some((x) => x.item === "Wall sheathing sheets"));
  assert.equal(f.find((x) => x.item === "Vapor barrier").kind, "over");
  assert.equal(r.bidders[0].bidTotal, 3120 + 1200);
});

test("CLI --level-bids levels plan bids against the budget", async () => {
  const { main } = await import("./cli.mjs");
  const { samplePlan } = await import("./engine.mjs");
  const run = (plan) => main(["p.json", "--level-bids", "--json"], () => JSON.stringify(plan));
  assert.equal(run(samplePlan()).code, 1);
  const plan = { ...samplePlan(), bids: [{ bidder: "A", lines: [{ item: "Studs", amount: 1 }] }] };
  const bad = run(plan);
  assert.equal(bad.code, 1);
  const item = JSON.parse(main(["p.json", "--budget", "--json"], () => JSON.stringify(samplePlan())).out).lines[0].item;
  const ok = run({ ...samplePlan(), bids: [{ bidder: "A", lines: [{ item, amount: 100 }] }] });
  assert.equal(ok.code, 0);
  assert.equal(JSON.parse(ok.out).bidders[0].bidTotal, 100);
});

test("hostile bids are refused with a reason, never thrown or summed", () => {
  const b = { lines: [{ item: "Studs", qty: 100, unit: "ea", unitPrice: 3 }] };
  for (const amount of [NaN, Infinity, -5, 1e300, "9"]) {
    const r = levelBids(b, [{ bidder: "A", lines: [{ item: "Studs", amount }] }]);
    assert.equal(r.bidders[0].bidTotal, 0, String(amount));
    assert.ok(r.errors.some((e) => /must be a number/.test(e)), String(amount));
    assert.ok(Number.isFinite(r.bidders[0].leveledTotal));
  }
  const d = levelBids(b, [{ bidder: "A", lines: [{ item: "Studs", amount: 100 }] }, { bidder: "A", lines: [{ item: "Studs", amount: 50 }] }]);
  assert.equal(d.bidders.length, 1);
  assert.equal(d.bidders[0].bidTotal, 100);
  assert.ok(d.errors.some((e) => /listed twice/.test(e)));
  for (const bad of [[null], [{ bidder: "A", lines: 5 }], [{ bidder: "A", lines: [null] }], [{ lines: [] }], "x", null]) {
    assert.doesNotThrow(() => levelBids(b, /** @type {any} */ (bad)));
  }
});

test("a lump-sum line (amount, no qty) is taken as the full line, not flagged short", () => {
  const r = levelBids(bud, [{ bidder: "A", lines: [{ item: "Vapor barrier", amount: 900 }] }]);
  const A = r.bidders[0];
  assert.ok(!A.flags.some((f) => f.item === "Vapor barrier"), JSON.stringify(A.flags));
  assert.equal(A.bidTotal, 900);
  assert.equal(A.additions, 100); // anchor bolts at the plan price only
});

test("a rival's lump sum levels a gap, so leaving scope out never wins", () => {
  // Red team 2026-11-26: A priced the vapor barrier as a 900 lump sum, B left
  // it out. With no unit price anywhere, B was left "unleveled" and named
  // lowest leveled at 450 against A's 1300, when B's scope really costs 1350.
  const b2 = { lines: [{ item: "Studs", qty: 100, unit: "ea", unitPrice: null }, { item: "Vapor barrier", qty: 1000, unit: "sq ft", unitPrice: null }] };
  const r = levelBids(b2, [
    { bidder: "A", lines: [{ item: "Studs", qty: 100, unitPrice: 4 }, { item: "Vapor barrier", amount: 900 }] },
    { bidder: "B", lines: [{ item: "Studs", qty: 100, unitPrice: 4.5 }] },
  ]);
  const B = r.bidders[1];
  assert.deepEqual(B.unleveled, []);
  assert.equal(B.additions, 900);
  assert.equal(B.leveledTotal, 1350);
  assert.equal(r.lowestLeveled, "A");
  assert.match(B.flags.find((f) => f.item === "Vapor barrier").note, /lump sum/);
  assert.equal(r.rows.find((x) => x.item === "Vapor barrier").refAmount, 900);
});

test("a line with no item name is reported as such", () => {
  for (const line of [{ qty: 5, amount: 10 }, { item: 5, amount: 10 }]) {
    const r = levelBids(bud, [{ bidder: "A", lines: [/** @type {any} */ (line)] }]);
    assert.deepEqual(r.errors, ["A: a line without an item name is ignored"], JSON.stringify(line));
  }
});

test("a negative or non-number tolerance is refused and the default used", () => {
  for (const tolerance of [-1, NaN, Infinity, "0.1", null]) {
    const r = levelBids(bud, [{ bidder: "A", lines: [{ item: "Wall sheathing sheets", qty: 100, unitPrice: 30 }] }], /** @type {any} */ ({ tolerance }));
    assert.equal(r.tolerance, 0.05, String(tolerance));
    assert.ok(!r.bidders[0].flags.some((f) => f.item === "Wall sheathing sheets"), String(tolerance));
    if (tolerance !== null) assert.ok(r.errors.some((e) => /tolerance/.test(e)), String(tolerance));
  }
  assert.equal(levelBids(bud, [], { tolerance: 0 }).tolerance, 0);
});
