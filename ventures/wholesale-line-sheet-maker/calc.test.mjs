import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toCents, roundPrice, wholesalePrice, analyzeProduct, msrpForRetailerMargin, roundToCasePack, tierFor, simulateOrder,
  ordersToClear, parseCsv, importProducts, productsToCsv, lineSheetCsv, csvCell, normalizeSettings, catalogueSummary, formatMoney,
} from "./calc.mjs";

const candle = { name: "Soy candle", sku: "C-1", costCents: 700, msrpCents: 2400, casePack: 6 };

test("keystone is half of MSRP and the retailer keeps 50%", () => {
  const a = analyzeProduct(candle, { strategy: "keystone" });
  assert.equal(a.wholesaleCents, 1200);
  assert.equal(a.retailerMarginPct, 50);
  assert.equal(a.keystone, true);
  assert.equal(a.grossCents, 500);
  assert.ok(Math.abs(a.grossMarginPct - 41.6667) < 0.001);
  assert.deepEqual(a.flags, []);
});

test("target margin on cost: price = cost / (1 - margin)", () => {
  const w = wholesalePrice(candle, { strategy: "margin", targetMarginPct: 50 });
  assert.equal(w.cents, 1400);
  const a = analyzeProduct(candle, { strategy: "margin", targetMarginPct: 50 });
  assert.equal(a.grossMarginPct, 50);
  assert.equal(a.retailerMarginPct, ((2400 - 1400) / 2400) * 100);
});

test("multiplier on cost", () => {
  assert.equal(wholesalePrice(candle, { strategy: "multiplier", multiplier: 2.5 }).cents, 1750);
});

test("manual strategy has no price until an override is given", () => {
  assert.equal(wholesalePrice(candle, { strategy: "manual" }).source, "missing");
  assert.ok(analyzeProduct(candle, { strategy: "manual" }).flags.includes("no_price"));
  assert.deepEqual(wholesalePrice({ ...candle, overrideCents: 999 }, { strategy: "manual" }), { cents: 999, source: "override" });
});

test("a per-product override beats every strategy and is not rounded", () => {
  const w = wholesalePrice({ ...candle, overrideCents: 1234 }, { strategy: "keystone", rounding: "00" });
  assert.deepEqual(w, { cents: 1234, source: "override" });
});

test("rounding rules", () => {
  assert.equal(roundPrice(1234, "00"), 1200);
  assert.equal(roundPrice(1250, "00"), 1300);
  assert.equal(roundPrice(1234, "50"), 1250);
  assert.equal(roundPrice(1220, "50"), 1200);
  assert.equal(roundPrice(1230, "95"), 1195);
  assert.equal(roundPrice(1260, "95"), 1295);
  assert.equal(roundPrice(1234, "none"), 1234);
  assert.equal(roundPrice(0, "00"), 0);
  assert.equal(roundPrice(10, "00"), 100, "never rounds a real price to zero");
});

test("rounding is applied to the strategy price", () => {
  const a = analyzeProduct({ ...candle, msrpCents: 2599 }, { strategy: "keystone", rounding: "50" });
  assert.equal(a.wholesaleCents, 1300);
});

test("flags: below cost, low retailer margin, below target, loss after commission", () => {
  const below = analyzeProduct({ ...candle, overrideCents: 600 }, {});
  assert.ok(below.flags.includes("below_cost"));
  const low = analyzeProduct({ ...candle, overrideCents: 1500 }, { retailerMarginFloorPct: 45 });
  assert.ok(low.flags.includes("retailer_margin_low"));
  const tgt = analyzeProduct({ ...candle, overrideCents: 1000 }, { strategy: "margin", targetMarginPct: 55 });
  assert.ok(tgt.flags.includes("below_target_margin"));
  const comm = analyzeProduct({ ...candle, costCents: 1150 }, { strategy: "keystone", commissionPct: 15 });
  assert.ok(comm.flags.includes("loss_after_commission"));
  assert.ok(!comm.flags.includes("below_cost"));
});

test("commission is a user input applied to wholesale", () => {
  const a = analyzeProduct(candle, { strategy: "keystone", commissionPct: 15 });
  assert.equal(a.commissionCents, 180);
  assert.equal(a.netCents, 320);
  assert.ok(Math.abs(a.netMarginPct - (320 / 1200) * 100) < 1e-9);
});

test("missing cost or MSRP is flagged rather than computed as zero", () => {
  const a = analyzeProduct({ name: "x", msrpCents: 2000 }, {});
  assert.equal(a.grossMarginPct, null);
  assert.ok(a.flags.includes("no_cost"));
  const b = analyzeProduct({ name: "x", costCents: 500 }, { strategy: "multiplier", multiplier: 2 });
  assert.equal(b.retailerMarginPct, null);
  assert.ok(b.flags.includes("no_msrp"));
});

test("MSRP needed for a given retailer margin", () => {
  assert.equal(msrpForRetailerMargin(1200, 50), 2400);
  assert.equal(msrpForRetailerMargin(1200, 60), 3000);
});

test("case pack rounding", () => {
  assert.equal(roundToCasePack(7, 6, "up"), 12);
  assert.equal(roundToCasePack(12, 6, "up"), 12);
  assert.equal(roundToCasePack(7, 6, "nearest"), 6);
  assert.equal(roundToCasePack(2, 6, "nearest"), 6, "never rounds a real order to zero");
  assert.equal(roundToCasePack(0, 6, "up"), 0);
  assert.equal(roundToCasePack(5, 1, "up"), 5);
  assert.equal(roundToCasePack(5, 0, "up"), 5);
});

test("tiers: highest qualifying discount wins, either threshold qualifies", () => {
  const tiers = [{ minSubtotalCents: 50000, pct: 10 }, { minSubtotalCents: 100000, pct: 15 }, { minUnits: 100, pct: 12 }];
  assert.equal(tierFor(49999, 10, tiers), null);
  assert.equal(tierFor(50000, 10, tiers).pct, 10);
  assert.equal(tierFor(60000, 120, tiers).pct, 12);
  assert.equal(tierFor(100000, 120, tiers).pct, 15);
});

test("normalizeSettings drops junk tiers and clamps", () => {
  const s = normalizeSettings({ strategy: "bogus", commissionPct: 500, tiers: [{ pct: 10 }, { minUnits: 5, pct: 0 }, { minUnits: 5, pct: 8 }] });
  assert.equal(s.strategy, "keystone");
  assert.equal(s.commissionPct, 99);
  assert.equal(s.tiers.length, 1);
});

const soap = { name: "Soap", sku: "S-1", costCents: 250, msrpCents: 1000, casePack: 12 };

test("order simulator: subtotal, tier, minimums, profit and retailer revenue", () => {
  const settings = { strategy: "keystone", minOrderCents: 30000, minOrderUnits: 0, tiers: [{ minSubtotalCents: 50000, pct: 10 }], commissionPct: 0 };
  const small = simulateOrder([{ product: candle, qty: 12 }, { product: soap, qty: 12 }], settings);
  assert.equal(small.subtotalCents, 12 * 1200 + 12 * 500);
  assert.equal(small.tierPct, 0);
  assert.equal(small.meetsMinimum, false);
  assert.ok(small.warnings.includes("Below your dollar minimum"));
  const big = simulateOrder([{ product: candle, qty: 36 }, { product: soap, qty: 24 }], settings);
  assert.equal(big.subtotalCents, 36 * 1200 + 24 * 500);
  assert.equal(big.tierPct, 10);
  assert.equal(big.discountCents, Math.round(big.subtotalCents * 0.1));
  assert.equal(big.totalCents, big.subtotalCents - big.discountCents);
  assert.equal(big.cogsCents, 36 * 700 + 24 * 250);
  assert.equal(big.profitCents, big.totalCents - big.cogsCents);
  assert.equal(big.retailerRevenueCents, 36 * 2400 + 24 * 1000);
  assert.equal(big.retailerProfitCents, big.retailerRevenueCents - big.totalCents);
  assert.equal(big.meetsMinimum, true);
});

test("order simulator warns about broken cases and ignores zero lines", () => {
  const o = simulateOrder([{ product: candle, qty: 7 }, { product: soap, qty: 0 }], {});
  assert.equal(o.rows.length, 1);
  assert.equal(o.rows[0].notCasePack, true);
  assert.ok(o.warnings.some((w) => /case pack of 6/.test(w)));
});

test("minimum is checked on the discounted total", () => {
  const settings = { minOrderCents: 45000, tiers: [{ minSubtotalCents: 50000, pct: 10 }] };
  const o = simulateOrder([{ product: { ...candle, casePack: 1 }, qty: 42 }], settings); // 50400 -> 45360
  assert.equal(o.subtotalCents, 50400);
  assert.equal(o.totalCents, 45360);
  assert.equal(o.meetsMinDollar, true);
  const p = simulateOrder([{ product: { ...candle, casePack: 1 }, qty: 41 }], settings); // 49200 no tier
  assert.equal(p.tierPct, 0);
  assert.equal(p.meetsMinDollar, true);
});

test("commission reduces net profit on the order", () => {
  const o = simulateOrder([{ product: candle, qty: 12 }], { commissionPct: 15 });
  assert.equal(o.commissionCents, Math.round(o.totalCents * 0.15));
  assert.equal(o.netProfitCents, o.profitCents - o.commissionCents);
});

test("ordersToClear finds the smallest number of sets, rounded to case packs", () => {
  const mix = [{ product: candle, qty: 6 }];
  const r = ordersToClear(mix, { strategy: "keystone" }, 100000);
  // $5.00 profit per candle -> 200 candles; 6-packs -> 204
  assert.equal(r.lines[0].qty, 204);
  assert.ok(r.order.profitCents >= 100000);
  const prev = simulateOrder([{ product: candle, qty: 198 }], { strategy: "keystone" });
  assert.ok(prev.profitCents < 100000);
});

test("ordersToClear respects minimums and returns null when it can never clear", () => {
  const r = ordersToClear([{ product: { ...candle, casePack: 1 }, qty: 1 }], { minOrderCents: 100000 }, 1000);
  assert.ok(r.order.totalCents >= 100000);
  const loss = ordersToClear([{ product: candle, qty: 6 }], { strategy: "manual" }, 1000);
  assert.equal(loss, null);
  const below = ordersToClear([{ product: { ...candle, overrideCents: 500 }, qty: 6 }], {}, 1000);
  assert.equal(below, null);
  assert.equal(ordersToClear([], {}, 1000), null);
});

test("ordersToClear after commission needs a bigger order", () => {
  const mix = [{ product: candle, qty: 6 }];
  const gross = ordersToClear(mix, { commissionPct: 15 }, 100000, { afterCommission: false });
  const net = ordersToClear(mix, { commissionPct: 15 }, 100000, { afterCommission: true });
  assert.ok(net.lines[0].qty > gross.lines[0].qty);
});

test("CSV parsing: quotes, embedded commas and newlines, CRLF, BOM, tabs, semicolons", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n'), [["a", "b"], ["x, y", 'he said "hi"']]);
  assert.deepEqual(parseCsv("﻿a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseCsv("a;b\n1;2"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseCsv('a,b\n"line1\nline2",2'), [["a", "b"], ["line1\nline2", "2"]]);
  assert.deepEqual(parseCsv(""), []);
});

test("import: header synonyms, money formats, case pack and override", () => {
  const { products, errors } = importProducts("Product,Item Number,Unit Cost,Retail,Case Pack,Wholesale\n\"Candle, 8oz\",C-1,$7.00,\"$24.00\",6,\nSoap,S-1,2.5,10,,5.25\n,X,1,2,,\nBad,B,abc,5,,");
  assert.equal(products.length, 3);
  assert.deepEqual(products[0], { id: "", name: "Candle, 8oz", sku: "C-1", costCents: 700, msrpCents: 2400, casePack: 6, overrideCents: 0 });
  assert.equal(products[1].casePack, 1);
  assert.equal(products[1].overrideCents, 525);
  assert.equal(errors.length, 2);
  assert.ok(errors.some((e) => /no product name/.test(e)));
  assert.ok(errors.some((e) => /not a number/.test(e)));
});

test("import without a header uses the default column order", () => {
  const { products } = importProducts("Mug,M-1,6,22,4\nBowl,B-1,8,30,2");
  assert.equal(products.length, 2);
  assert.equal(products[0].name, "Mug");
  assert.equal(products[0].costCents, 600);
  assert.equal(products[1].casePack, 2);
});

test("export then import round-trips", () => {
  const src = [candle, { ...soap, name: 'Soap "lavender", bar', overrideCents: 525 }];
  const back = importProducts(productsToCsv(src)).products;
  assert.deepEqual(back.map((p) => [p.name, p.sku, p.costCents, p.msrpCents, p.casePack, p.overrideCents]), src.map((p) => [p.name, p.sku, p.costCents, p.msrpCents, p.casePack, p.overrideCents ?? 0]));
});

test("CSV text cells cannot start a spreadsheet formula", () => {
  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvCell("+1"), "'+1");
  assert.equal(csvCell("plain"), "plain");
});

test("line sheet CSV shows buyer-facing columns only", () => {
  const csv = lineSheetCsv([candle], { strategy: "keystone" });
  assert.equal(csv.split("\n")[0], "SKU,Product,Wholesale,MSRP,Case pack");
  assert.equal(csv.split("\n")[1], "C-1,Soy candle,12.00,24.00,6");
  assert.doesNotMatch(csv, /7\.00/);
});

test("catalogue summary averages margins over priced products", () => {
  const s = catalogueSummary([candle, soap, { name: "blank" }], { strategy: "keystone" });
  assert.equal(s.count, 3);
  assert.equal(s.priced, 2);
  assert.equal(s.avgRetailerMarginPct, 50);
  assert.ok(s.lowestGrossMarginPct <= s.avgGrossMarginPct);
});

test("toCents and formatMoney", () => {
  assert.equal(toCents("$1,234.56"), 123456);
  assert.equal(toCents("1.005"), 101);
  assert.equal(toCents("abc"), 0);
  assert.match(formatMoney(123456, "USD"), /1,234\.56/);
});
