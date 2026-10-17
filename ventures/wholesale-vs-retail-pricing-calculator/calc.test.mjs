import { test } from "node:test";
import assert from "node:assert/strict";
import { channels, clean, terms, discountLadder, breakEvenSellThrough, DEFAULTS } from "./calc.mjs";

test("defaults produce the hand-computed numbers", () => {
  const c = channels({});
  // direct: 40 - (12 + 2.2 + 4 + 2.5) = 19.30
  assert.equal(c.direct.profit, 19.3);
  // wholesale: 20 - (12 + 0.6 + 0.4167 + finance 12*0.12*30/365=0.1184) = 6.86
  assert.equal(c.wholesale.cost, 13.14);
  assert.equal(c.wholesale.profit, 6.86);
  assert.equal(c.orderProfit, 329.28);
});

test("terms cost scales with days and rate", () => {
  assert.equal(terms(100, 365, 10), 10);
  assert.equal(terms(100, 0, 10), 0);
});

test("consignment is paid only on what sells but you fund every unit", () => {
  const c = channels({ sellThroughPct: 50, consignPct: 40, retailPrice: 40, unitCost: 12 });
  assert.equal(c.consignment.revenue, 12); // 40*0.6*0.5
  assert.ok(c.consignment.profit < 0);
  assert.ok(c.findings.some((f) => /Consignment loses money/.test(f.title)));
});

test("break-even sell-through equals cost over shop-paid share", () => {
  const { o } = clean({});
  const be = breakEvenSellThrough(o);
  const at = channels({ sellThroughPct: be * 100 });
  assert.ok(Math.abs(at.consignment.profit) < 0.05);
});

test("a target margin price actually reaches the target", () => {
  const c = channels({ targetMarginPct: 40 });
  const m = (c.priceForTarget - c.wholesale.cost) / c.priceForTarget;
  assert.ok(Math.abs(m - 0.4) < 0.001);
  const back = channels({ retailPrice: c.retailForTarget, targetMarginPct: 40 });
  assert.ok(back.wholesale.margin >= 0.399);
});

test("wholesale loss is flagged high severity", () => {
  const c = channels({ unitCost: 30 });
  assert.ok(c.wholesale.profit < 0);
  assert.equal(c.findings[0].severity, "high");
});

test("bad input is an error, not NaN", () => {
  assert.match(channels({ retailPrice: 0 }).error, /Retail price/);
  assert.match(channels({ consignPct: 100 }).error, /Shop share/);
  assert.match(channels({ orderQty: 0 }).error, /Order quantity/);
  const c = channels({ unitCost: "abc" });
  assert.equal(c.o.unitCost, DEFAULTS.unitCost);
});

test("ladder lowers profit as the wholesale share falls", () => {
  const l = discountLadder({});
  for (let i = 1; i < l.length; i++) assert.ok(l[i].profit > l[i - 1].profit);
  assert.equal(l.find((x) => x.pct === 50).profit, channels({}).wholesale.profit);
});

test("direct equivalent is the direct sales that match one order's profit", () => {
  const c = channels({});
  assert.equal(c.directEquivalent, Math.ceil(c.orderProfit / c.direct.profit));
});
