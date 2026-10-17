import { test } from "node:test";
import assert from "node:assert/strict";
import { roastedCostPerLb, bagEconomics, priceForMargin, channelTable, parseLots, parseChannels, optimizeBlend, costOfScoreFrontier, weeklyPlan, breakEven, channelsCsv, blendText } from "./calc.mjs";

test("roast loss raises the cost of every roasted pound", () => {
  const r = roastedCostPerLb({ greenPerLb: 5.1, shrinkPct: 15, laborPerRoastedLb: 0.4, energyPerRoastedLb: 0.1 });
  assert.equal(r.greenPerRoastedLb, 6); // 5.10 / 0.85
  assert.equal(r.total, 6.5);
  assert.equal(r.shrinkCostPerRoastedLb, 0.9);
  assert.equal(roastedCostPerLb({ greenPerLb: 5, shrinkPct: 0 }).total, 5);
  assert.throws(() => roastedCostPerLb({ greenPerLb: 5, shrinkPct: 60 }), /between 0% and 50%/);
});

test("bag economics: hand-computed 12 oz retail bag", () => {
  // coffee 6.50/lb * 12/16 = 4.875; packaging 0.90; Shopify-style 2.9% + 0.30; ship 0 paid, 0 charged.
  const e = bagEconomics({ costPerRoastedLb: 6.5, bagOz: 12, packagingPerBag: 0.9, price: 16, feePct: 2.9, feeFixed: 0.3 });
  assert.equal(e.coffeeCost, 4.88);
  assert.equal(e.fees, 0.76); // 0.464 + 0.30
  assert.equal(e.profit, 9.46); // 16 - 0.764 - 4.875 - 0.9 = 9.461
  assert.equal(e.marginPct, 59.1);
  assert.equal(e.pricePerLb, 21.33);
  assert.equal(e.profitPerRoastedLb, 12.61);
});

test("shipping you pay and shipping you charge both move the margin", () => {
  const base = { costPerRoastedLb: 6.5, bagOz: 12, packagingPerBag: 0.9, price: 16 };
  const free = bagEconomics({ ...base, shippingPaid: 5.5 });
  const paid = bagEconomics({ ...base, shippingPaid: 5.5, shippingCharged: 5.5 });
  assert.ok(paid.profit - free.profit > 5.4);
});

test("priceForMargin round-trips through bagEconomics", () => {
  const cost = 4.875 + 0.9;
  const price = priceForMargin({ costPerBag: cost, targetMarginPct: 55, feePct: 2.9, feeFixed: 0.3 });
  const e = bagEconomics({ costPerRoastedLb: 6.5, bagOz: 12, packagingPerBag: 0.9, price, feePct: 2.9, feeFixed: 0.3 });
  assert.ok(Math.abs(e.marginPct - 55) < 0.6, String(e.marginPct));
  assert.throws(() => priceForMargin({ costPerBag: 5, targetMarginPct: 80, feePct: 25 }), /under 100%/);
});

test("channel table ranks channels by profit per roasted pound and per roasting hour", () => {
  const t = channelTable({
    costPerRoastedLb: 6.5,
    bagOz: 12,
    packagingPerBag: 0.9,
    retailPrice: 16,
    roastedLbPerHour: 60,
    channels: [{ name: "Online", price: 16, feePct: 2.9, feeFixed: 0.3, shippingPaid: 5.5, shippingCharged: 0 }, { name: "Wholesale", discountPct: 40 }, { name: "Cafe 5 lb", price: 40 * 0.6 }],
  });
  assert.equal(t.rows.length, 3);
  assert.equal(t.rows[1].price, 9.6);
  assert.ok(t.rows.every((r) => r.profitPerRoastingHour != null));
  assert.ok(["Online", "Wholesale", "Cafe 5 lb"].includes(t.bestChannel));
  const top = [...t.rows].sort((a, b) => b.profitPerRoastedLb - a.profitPerRoastedLb)[0].name;
  assert.equal(t.bestChannel, top);
});

test("parseLots reads optional columns and reports bad lines", () => {
  const { lots, problems } = parseLots("Brazil, 3.9, 82\nEthiopia Guji, 7.2, 88, 15, 200, 10, 40\nbroken line");
  assert.equal(lots.length, 2);
  assert.equal(lots[0].shrinkPct, 15);
  assert.equal(lots[0].availableLb, Infinity);
  assert.deepEqual([lots[1].availableLb, lots[1].minShare, lots[1].maxShare], [200, 0.1, 0.4]);
  assert.equal(problems.length, 1);
});

const LOTS = parseLots("Brazil Cerrado, 3.9, 82, 14\nColombia Huila, 4.9, 85, 15\nEthiopia Guji, 7.2, 89, 15\nSumatra, 4.4, 83, 17").lots;

test("optimizer: blending beats the cheapest single origin that clears the score", () => {
  // 87 needs Ethiopia in the mix; no other single coffee reaches it.
  const r = optimizeBlend({ lots: LOTS, targetScore: 87 });
  assert.ok(r.best.score >= 87 - 1e-9);
  assert.equal(r.cheapestSingleOrigin.name, "Ethiopia Guji");
  assert.ok(r.savingVsSingleOrigin > 0.3, String(r.savingVsSingleOrigin));
  // shares sum to 100%
  assert.equal(Math.round(r.best.shares.reduce((a, s) => a + s.pct, 0)), 100);
});

test("optimizer: matches a brute-force search at 5% steps on every blend it returns", () => {
  const r = optimizeBlend({ lots: LOTS, targetScore: 86, top: 3 });
  let best = Infinity;
  for (let a = 0; a <= 20; a++) for (let b = 0; a + b <= 20; b++) for (let c = 0; a + b + c <= 20; c++) {
    const d = 20 - a - b - c;
    const sh = [a, b, c, d].map((x) => x / 20);
    let score = 0, cost = 0;
    LOTS.forEach((l, i) => { score += sh[i] * l.score; cost += sh[i] * l.greenPerLb / (1 - l.shrinkPct / 100); });
    if (score >= 86 - 1e-9 && cost < best) best = cost;
  }
  assert.ok(Math.abs(r.best.greenCostPerRoastedLb - best) < 0.001);
  for (const alt of r.alternatives) assert.ok(alt.greenCostPerRoastedLb >= r.best.greenCostPerRoastedLb);
});

test("optimizer: limits on share and pounds available are respected, and an impossible score is reported", () => {
  const capped = parseLots("Cheap, 3.5, 80\nGreat, 8, 90, 15, 30").lots; // only 30 lb green of Great
  const r = optimizeBlend({ lots: capped, targetScore: 85, batchRoastedLb: 100 });
  assert.equal(r.best, null); // 50% of 100 lb roasted needs 58.8 lb green; only 30 available
  const r2 = optimizeBlend({ lots: capped, targetScore: 85, batchRoastedLb: 40 });
  assert.ok(r2.best && r2.best.shares.find((s) => s.name === "Great").greenLb <= 30);
  assert.equal(optimizeBlend({ lots: LOTS, targetScore: 95 }).best, null);
  const maxed = parseLots("A, 4, 80, 15, , , 30\nB, 6, 90").lots;
  const r3 = optimizeBlend({ lots: maxed, targetScore: 80 });
  assert.ok(r3.best.shares.find((s) => s.name === "A").pct <= 30);
  assert.throws(() => optimizeBlend({ lots: [] , targetScore: 80 }), /at least one/);
});

test("cost-of-score frontier never falls as the target rises", () => {
  const f = costOfScoreFrontier({ lots: LOTS, from: 82, to: 89, stepScore: 1 }).filter((x) => x.greenCostPerRoastedLb != null);
  for (let i = 1; i < f.length; i++) assert.ok(f[i].greenCostPerRoastedLb >= f[i - 1].greenCostPerRoastedLb - 1e-9);
  assert.ok(f.length >= 7);
});

test("weekly plan: green needed, batches, roasting hours and sacks to order", () => {
  const p = weeklyPlan({ skus: [{ bags: 100, bagOz: 12 }, { bags: 10, bagOz: 80 }], shrinkPct: 15, batchGreenLb: 30, minutesPerBatch: 18, greenOnHandLb: 100, targetWeeksCover: 4, sackLb: 132 });
  assert.equal(p.roastedLb, 125); // 75 + 50
  assert.equal(p.greenLb, 147.1);
  assert.equal(p.batches, 5);
  assert.equal(p.roastingHours, 1.5);
  assert.equal(p.weeksCover, 0.7);
  assert.equal(p.sacksToOrder, 4); // (147.06*4 - 100)/132 = 3.7
});

test("break-even volume", () => {
  const b = breakEven({ fixedMonthly: 6000, profitPerBag: 7.5, bagOz: 12 });
  assert.equal(b.bagsPerMonth, 800);
  assert.equal(b.roastedLbPerMonth, 600);
  assert.equal(breakEven({ fixedMonthly: 1, profitPerBag: -1 }).bagsPerMonth, null);
});

test("channels parse and export", () => {
  const { channels, problems } = parseChannels("Online, 16, 2.9, 0.30, 5.5, 0\nWholesale, 9.6\nnope");
  assert.equal(channels.length, 2);
  assert.equal(problems.length, 1);
  const t = channelTable({ costPerRoastedLb: 6.5, bagOz: 12, packagingPerBag: 0.9, retailPrice: 16, channels });
  const csv = channelsCsv(t.rows);
  assert.match(csv, /^channel,price,/);
  assert.equal(csv.trim().split("\n").length, 3);
  assert.match(blendText(null), /No blend/);
});
