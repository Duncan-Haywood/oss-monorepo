import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, analyzeDeal, netForDeal, baseCosts, crowdSensitivity, money, sampleInput, toCsv } from "./calc.mjs";

const c = { hours: 4, cupsPerHour: 30, avgPrice: 5, cogsPerCup: 1, cardFeePct: 3, staffCount: 2, wage: 20, setupHours: 1, travelCost: 40, permitFee: 10 };

test("fixed cost is labour plus travel plus permit", () => {
  // 2 people * $20 * 5 hours = 200; + 40 + 10
  assert.deepEqual(baseCosts(c), { labour: 200, fixed: 250 });
});

test("hand-computed flat fee deal", () => {
  // 100 cups * $5 = 500 revenue; card 15; cogs 100; fixed 250; fee 300 -> 500+300-15-100-250 = 435
  const r = netForDeal(c, { key: "flat", fee: 300 }, 100);
  assert.equal(r.revenue, 500);
  assert.equal(r.net, 435);
});

test("hand-computed share deal", () => {
  // 500 revenue; host 20% = 100; card 15; cogs 100; fixed 250 -> 35
  const r = netForDeal(c, { key: "share", sharePct: 20 }, 100);
  assert.equal(r.hostCost, 100);
  assert.equal(r.net, 35);
});

test("prepaid deal pays for cups nobody drinks and caps at capacity", () => {
  // guarantee 80 cups @ $4 = 320 income; demand 50 -> extra 0; cups served counted 80 (cogs 80); fixed 250 -> -10
  const low = netForDeal(c, { key: "prepaid", guaranteeCups: 80, guaranteePrice: 4 }, 50);
  assert.equal(low.hostIncome, 320);
  assert.equal(low.net, -10);
  // demand 500, cap 120 -> extra 40 @ $5 = 200 revenue
  const hi = netForDeal(c, { key: "prepaid", guaranteeCups: 80, guaranteePrice: 4 }, 500);
  assert.equal(hi.cups, 120);
  assert.equal(hi.revenue, 200);
});

test("demand above cart capacity is capped", () => {
  const a = netForDeal(c, { key: "flat", fee: 0 }, 120), b = netForDeal(c, { key: "flat", fee: 0 }, 9999);
  assert.equal(a.net, b.net);
});

test("break-even drinks makes net non-negative and one fewer does not", () => {
  const d = { key: "share", sharePct: 15 };
  const r = analyzeDeal(c, d, 100);
  assert.ok(netForDeal(c, d, r.breakEvenCups).net >= 0);
  assert.ok(netForDeal(c, d, r.breakEvenCups - 1).net < 0);
});

test("a deal that cannot cover cost inside capacity reports never", () => {
  const r = analyzeDeal({ ...c, travelCost: 99999 }, { key: "share", sharePct: 15 }, 100);
  assert.equal(r.breakEvenCups, null);
});

test("analyze ranks and flags a loss", () => {
  const s = analyze(sampleInput());
  assert.equal(s.anyProfit, true);
  assert.equal(s.ranked[0], s.best);
  assert.equal(s.deals.length, 3);
  const bad = analyze({ ...sampleInput(), expectedCups: 5, flatFee: 0, guaranteeCups: 0 });
  assert.equal(bad.anyProfit, false);
  assert.match(bad.advice.join(" "), /No deal covers your costs/);
});

test("validation", () => {
  assert.match(analyze({ hours: 0 }).error, /hours/);
  assert.match(analyze({ avgPrice: 0 }).error, /price/);
  assert.match(analyze({ cardFeePct: 60 }).error, /Card fee/);
  assert.match(analyze({ wage: -1 }).error, /negative/);
  assert.match(analyze({ sharePct: 120 }).error, /share/);
  assert.match(analyze({ staffCount: 0 }).error, /staffs/);
});

test("sensitivity centre row matches the base", () => {
  const rows = crowdSensitivity(sampleInput());
  const base = analyze(sampleInput());
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[2].cells.map((x) => x.net), base.deals.map((d) => d.net));
  assert.ok(rows[4].cells[1].net > rows[0].cells[1].net);
});

test("csv and money", () => {
  assert.equal(money(-1234.4), "-$1,234");
  const csv = toCsv(analyze(sampleInput()));
  assert.equal(csv.trim().split("\n").length, 4);
  assert.match(csv, /break-even drinks/);
});
