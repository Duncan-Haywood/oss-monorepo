import test from "node:test";
import assert from "node:assert/strict";
import { MARKETS, marketPrices, priceEnding } from "./markets.mjs";
import { DEFAULT_PLAN, sellingSide } from "./costing.mjs";

test("price endings round up, never down", () => {
  assert.equal(priceEnding(41.2, 0.95), 41.95);
  assert.equal(priceEnding(41.96, 0.95), 42.95);
  assert.equal(priceEnding(41.95, 0.95), 41.95);
  assert.equal(priceEnding(0), null);
});
test("EU shelf price carries VAT and still meets the target margin", () => {
  const rows = marketPrices({ landed: 18, quantity: 100 }, { ...DEFAULT_PLAN, targetMarginPct: 60 });
  const it = rows.find(r => r.market === "IT");
  assert.equal(it.vatPct, 22);
  assert.ok(it.marginPct >= 60, `margin ${it.marginPct}`);
  assert.ok(it.shelfPrice >= it.exactPrice && it.shelfPrice - it.exactPrice < 1);
  const de = rows.find(r => r.market === "DE");
  assert.ok(de.shelfPrice < it.shelfPrice, "lower VAT, lower shelf price");
});
test("US price excludes sales tax so it is below an EU price with the same cost", () => {
  const rows = marketPrices({ landed: 18, quantity: 100, currencyRates: { USD: 1, GBP: 1 } });
  const us = rows.find(r => r.market === "US"), fr = rows.find(r => r.market === "FR");
  assert.equal(us.vatPct, 0);
  assert.ok(us.shelfPrice < fr.shelfPrice);
});
test("a currency without a rate is refused, not guessed", () => {
  const rows = marketPrices({ landed: 18, quantity: 100 });
  assert.match(rows.find(r => r.market === "UK").error, /EUR to GBP/);
  assert.match(rows.find(r => r.market === "US").error, /EUR to USD/);
  assert.ok(!rows.find(r => r.market === "IT").error);
});
test("hostile VAT and unknown markets are reported", () => {
  const rows = marketPrices({ landed: 10, quantity: 50, markets: ["IT", "XX"], vat: { IT: 90 } });
  assert.match(rows[0].error, /outside/); assert.match(rows[1].error, /Unknown/);
});
test("impossible margin target gives a reason", () => {
  const rows = marketPrices({ landed: 10, quantity: 50, markets: ["IT"] }, { ...DEFAULT_PLAN, targetMarginPct: 99, channelFeePct: 30 });
  assert.match(rows[0].error, /target margin/);
});
test("agrees with sellingSide at the shelf price", () => {
  const [r] = marketPrices({ landed: 20, quantity: 80, markets: ["FR"] });
  const s = sellingSide({ landed: 20, price: r.shelfPrice, quantity: 80 }, { ...DEFAULT_PLAN, salesTaxPct: 20 });
  assert.equal(r.profitPerSale, s.profitPerSale);
});
import { ossThreshold } from "./markets.mjs";
test("OSS threshold: under, will-cross, over by this or last year, bad input", () => {
  assert.equal(ossThreshold({ euCrossBorderSalesEur: 4000 }).status, "under");
  assert.equal(ossThreshold({ euCrossBorderSalesEur: 4000 }).headroomEur, 6000);
  assert.equal(ossThreshold({ euCrossBorderSalesEur: 4000, plannedExtraEur: 7000 }).status, "will-cross");
  assert.equal(ossThreshold({ euCrossBorderSalesEur: 10000 }).status, "under");
  assert.equal(ossThreshold({ euCrossBorderSalesEur: 10001 }).status, "over");
  assert.equal(ossThreshold({ euCrossBorderSalesEur: 0, priorYearEur: 12000 }).status, "over");
  assert.ok(ossThreshold({ euCrossBorderSalesEur: -1 }).error);
});

test("children's clothing is zero-rated in the UK and Ireland, so the shelf price falls", () => {
  const input = { landed: 10, quantity: 100, markets: ["IE", "UK", "FR"], currencyRates: { GBP: 1 } };
  const adult = marketPrices(input), kids = marketPrices({ ...input, audience: "children" });
  assert.equal(adult[0].vatPct, 23);
  assert.equal(kids[0].vatPct, 0); assert.equal(kids[1].vatPct, 0);
  assert.equal(kids[2].vatPct, 20, "France has no children's zero rate");
  assert.ok(kids[0].shelfPrice < adult[0].shelfPrice);
  assert.equal(kids[2].shelfPrice, adult[2].shelfPrice);
});
test("an edited VAT beats the children's default", () => {
  const [r] = marketPrices({ landed: 10, quantity: 100, markets: ["IE"], audience: "children", vat: { IE: 13.5 } });
  assert.equal(r.vatPct, 13.5);
});
test("all 27 EU states are present; only non-euro ones need a rate", () => {
  const eu = Object.keys(MARKETS).filter(k => k !== "UK" && k !== "US");
  assert.equal(eu.length, 27);
  const need = marketPrices({ landed: 18, quantity: 100, markets: eu }).filter(r => r.error).map(r => r.market).sort();
  assert.deepEqual(need, ["CZ", "DK", "HU", "PL", "RO", "SE"]);
});
