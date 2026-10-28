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
