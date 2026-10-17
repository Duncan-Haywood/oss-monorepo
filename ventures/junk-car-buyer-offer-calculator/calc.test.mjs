import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyze, carEconomics, breakEvenScrapPrice, maxTowMiles, breakEvenSellThrough, num, money, toCsv } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("default car works out by hand", () => {
  const e = carEconomics(DEFAULTS);
  near(e.hulk, (3200 - 250) / 2000 * 220); // 324.5
  near(e.parts, 450 * 0.6 * 0.87); // 234.9
  near(e.revenue, 324.5 + 150 + 234.9);
  near(e.tow, 35 + 20 * 3); // 95
  near(e.costs, 95 + 40 + 25 + 28 + 37.5 + 30);
  near(e.net, e.revenue - e.costs);
  near(e.maxOffer, e.net - 100);
  near(e.profitAtAsk, e.net - 300);
});

test("break-even scrap price leaves exactly the target profit at the ask", () => {
  const o = { ...DEFAULTS, scrapPricePerTon: 120 };
  const p = breakEvenScrapPrice(o);
  near(carEconomics({ ...o, scrapPricePerTon: p }).profitAtAsk, o.targetProfit);
});

test("max tow miles leaves exactly the target profit at the ask", () => {
  const m = maxTowMiles(DEFAULTS);
  near(carEconomics({ ...DEFAULTS, towMiles: m }).profitAtAsk, DEFAULTS.targetProfit);
  assert.ok(Number.isNaN(maxTowMiles({ ...DEFAULTS, towPerMile: 0 })));
});

test("break-even sell-through leaves exactly the target profit, or says never", () => {
  const o = { ...DEFAULTS, sellerAsk: 480 };
  const s = breakEvenSellThrough(o);
  assert.ok(s > 0 && s <= 100);
  near(carEconomics({ ...o, partsSellThroughPct: s }).profitAtAsk, o.targetProfit);
  assert.equal(breakEvenSellThrough({ ...DEFAULTS, sellerAsk: 10 }), 0);
  assert.ok(Number.isNaN(breakEvenSellThrough({ ...DEFAULTS, sellerAsk: 5000 })));
});

test("buying at the max offer earns the target; ask above it is a counter", () => {
  const a = analyze({ sellerAsk: 600 });
  assert.equal(a.result.buy, false);
  near(carEconomics({ ...a.opts, sellerAsk: a.result.maxOffer }).profitAtAsk, a.opts.targetProfit);
  assert.match(a.warnings.join(" "), /counter at/);
  assert.equal(analyze({ sellerAsk: 100 }).result.buy, true);
});

test("ladders move the right way", () => {
  const a = analyze({});
  for (const key of ["scrap", "converter", "sellThrough", "weight"]) for (let i = 1; i < a[key].length; i++) assert.ok(a[key][i].maxOffer >= a[key][i - 1].maxOffer, key);
  for (let i = 1; i < a.tow.length; i++) assert.ok(a.tow[i].maxOffer <= a.tow[i - 1].maxOffer);
  assert.equal(a.scrap.length, 5);
});

test("bad input is reported, not computed", () => {
  assert.equal(analyze({ weightLbs: 0 }).result, null);
  assert.equal(analyze({ removedLbs: 5000 }).result, null);
  assert.equal(analyze({ partsFeePct: 150 }).result, null);
  assert.equal(analyze({ converterValue: -5 }).result, null);
});

test("free car worth less than target profit is flagged", () => {
  const a = analyze({ scrapPricePerTon: 0, converterValue: 0, partsRetail: 0 });
  assert.ok(a.result.maxOffer < 0);
  assert.match(a.warnings.join(" "), /worth less than your target profit/);
});

test("parsing, formatting and csv", () => {
  assert.equal(num("$1,250"), 1250);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
  const csv = toCsv(analyze({}));
  assert.match(csv, /^scrap_price_per_ton,profit_at_ask,max_offer/);
  assert.equal(toCsv(analyze({ weightLbs: 0 })), "");
});
