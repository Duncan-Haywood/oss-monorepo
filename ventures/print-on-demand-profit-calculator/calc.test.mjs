import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, solvePrice, feeModel, comparePlatforms, priceLadder, sampleInputs, summaryText, csvText, money, PLATFORMS } from "./calc.mjs";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const base = { platform: "custom", price: 100, shipCharged: 0, baseCost: 40, shipCost: 10, refundPct: 0, adSpend: 0, sampleCost: 0, customPct: 10, customFixed: 1 };

test("hand-checked custom platform profit and margin", () => {
  const r = analyze(base);
  close(r.unit.fees, 11);
  close(r.unit.profit, 39);
  close(r.unit.marginPct, 39);
});

test("Etsy default fees on a $29.99 shirt", () => {
  const r = analyze({ platform: "etsy", price: 29.99, baseCost: 14.5, shipCost: 4.75, refundPct: 2 });
  close(r.unit.fees, 29.99 * 0.095 + 0.45);
  close(r.unit.profit, 29.99 - 29.99 * 0.02 - (29.99 * 0.095 + 0.45) - 19.25);
});

test("fees are charged on shipping the buyer pays", () => {
  const r = analyze({ ...base, shipCharged: 10 });
  close(r.unit.order, 110);
  close(r.unit.fees, 12);
  close(r.unit.profit, 110 - 12 - 50);
});

test("refunds give back revenue but not supplier cost or fees", () => {
  const r = analyze({ ...base, refundPct: 10 });
  close(r.unit.refundLoss, 10);
  close(r.unit.profit, 29);
});

test("solvePrice round-trips to the requested margin", () => {
  const o = { ...base, refundPct: 3, adSpend: 4, sampleCost: 1, shipCharged: 5 };
  const price = solvePrice(analyze(o).inputs, 30);
  const back = analyze({ ...o, price });
  close(back.unit.marginPct, 30, 1e-7);
});

test("solvePrice returns null when fees and refunds alone eat the target", () => {
  assert.equal(solvePrice(analyze({ ...base, customPct: 80 }).inputs, 30), null);
});

test("max ad spend and break-even ROAS", () => {
  const r = analyze({ ...base, adSpend: 20 });
  close(r.maxAdSpend, 39);
  close(r.breakEvenRoas, 100 / 39);
  close(r.unit.profit, 19);
});

test("Etsy Offsite Ads is an expected-value fee on the share of orders it drove", () => {
  const o = analyze({ platform: "etsy", price: 100, baseCost: 0, offsitePct: 15, offsiteShare: 20 }).inputs;
  const fm = feeModel(o);
  close(fm.pct, 0.065 + 0.03 + 0.03);
  assert.equal(fm.lines.length, 4);
});

test("comparePlatforms ranks the same sale across presets", () => {
  const rows = comparePlatforms(analyze({ ...base, platform: "etsy" }).inputs);
  assert.deepEqual(rows.map((x) => x.key), ["etsy", "shopify", "ebay"]);
  const shopify = rows.find((x) => x.key === "shopify");
  close(shopify.fees, 100 * 0.029 + 0.3);
});

test("ladder centres on the entered price", () => {
  const l = priceLadder(analyze(base).inputs);
  assert.equal(l.length, 6);
  assert.equal(l[2].price, 100);
  assert.ok(l[5].profit > l[0].profit);
});

test("bad input returns errors, not NaN", () => {
  assert.ok(analyze({ ...base, price: "" }).errors.length);
  assert.ok(analyze({ ...base, baseCost: "" }).errors.length);
  assert.ok(analyze({ ...base, refundPct: 120 }).errors.length);
});

test("warnings fire for a loss and a thin margin", () => {
  assert.match(analyze({ ...base, baseCost: 95 }).warnings.join(" "), /lose money/);
  assert.match(analyze({ ...base, baseCost: 74 }).warnings.join(" "), /Under 10%/);
});

test("monthly rollup, summary and csv", () => {
  const r = analyze({ ...sampleInputs(), orders: 100 });
  close(r.monthly.profit, r.unit.profit * 100);
  assert.match(summaryText(r), /Profit per sale/);
  assert.equal(csvText(r).trim().split("\n").length, 7);
  assert.equal(money(-3.456), "-3.46");
  assert.ok(Object.keys(PLATFORMS).includes("custom"));
});
