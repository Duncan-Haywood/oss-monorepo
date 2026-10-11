import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, visitCost, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS, prepMultiplier } from "./calc.mjs";

const base = () => readInput(sampleInput()).v;

test("the worked example prices chef hours, groceries, travel and margin", () => {
  const c = visitCost(base());
  assert.equal(c.guests, 4);
  assert.equal(c.prepHrs, 1.3);
  assert.equal(c.chefHrs, 6.8);
  assert.equal(c.onSiteHrs, 4.3);
  assert.equal(c.groceries, 88);
  assert.equal(c.markup, 13.2);
  assert.equal(c.travel, 21);
  assert.equal(c.cost, 431.88);
  assert.equal(c.wanted, 536.54);
  assert.equal(c.price, 536.54);
  assert.equal(c.pricePerGuest, 134.14);
});

test("dietary needs stretch prep time only", () => {
  assert.equal(prepMultiplier({ dietPct: 0, dietUp: 25 }), 1);
  assert.equal(prepMultiplier({ dietPct: 100, dietUp: 50 }), 1.5);
  assert.ok(visitCost({ ...base(), dietPct: 100 }).prepHrs > visitCost(base()).prepHrs);
});

test("the price per guest falls as the table grows because shopping and travel are fixed", () => {
  const rows = plan(sampleInput()).table;
  assert.deepEqual(rows.map((r) => r.guests), [2, 4, 6, 8, 12]);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].pricePerGuest < rows[i - 1].pricePerGuest);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].price > rows[i - 1].price);
});

test("the realised margin equals the margin asked for when no minimum applies", () => {
  const pure = visitCost({ ...base(), groceryMarkupPct: 0 });
  assert.ok(Math.abs(pure.actualMarginPct - 20) < 0.1);
});

test("a minimum charge floors the price and the advice says so", () => {
  const r = plan({ ...sampleInput(), guests: "1", courses: "1", shopHrs: "0", cookHrs: "0.5", cleanHrs: "0.25", minCharge: "900" });
  assert.equal(r.job.minApplied, true);
  assert.equal(r.job.price, 900);
  assert.match(r.advice.join(" "), /minimum charge sets this price/);
});

test("a current price under cost-plus is flagged with the monthly gap", () => {
  const r = plan({ ...sampleInput(), currentPrice: "220" });
  assert.match(r.advice.join(" "), /under the cost-plus price/);
  assert.match(r.advice.join(" "), /left on the table/);
  assert.match(plan({ ...sampleInput(), currentPrice: "900" }).advice.join(" "), /already covers/);
});

test("assistants add labour for on-site hours only", () => {
  const c = visitCost({ ...base(), assistants: 2 });
  assert.ok(Math.abs(c.assistantLabor - 2 * c.onSiteHrs * 22) < 2);
  assert.equal(c.chefHrs, visitCost(base()).chefHrs);
});

test("bad input is rejected with a plain message", () => {
  assert.match(plan({ ...sampleInput(), guests: "0" }).error, /Guests/);
  assert.match(plan({ ...sampleInput(), guests: "2.5" }).error, /whole number/);
  assert.match(plan({ ...sampleInput(), marginPct: "95" }).error, /Margin/);
  assert.match(plan({ ...sampleInput(), chefRate: "-5" }).error, /not negative/);
  assert.match(plan({ ...sampleInput(), dietPct: "120" }).error, /dietary/);
  assert.match(plan({ ...sampleInput(), shopHrs: "20", cookHrs: "20" }).error, /24 hours/);
  assert.match(plan({ ...sampleInput(), guests: "500" }).error, /200/);
});

test("share links round-trip known keys and drop everything else", () => {
  const enc = encodeShare(sampleInput());
  const back = decodeShare("#" + enc + "&evil=1&__proto__=x");
  assert.deepEqual(back, sampleInput());
  assert.equal(back.evil, undefined);
  assert.equal(SHARE_KEYS.length, new Set(SHARE_KEYS).size);
});

test("csv has a header and one row per table size", () => {
  const lines = toCsv(plan(sampleInput())).split("\n");
  assert.equal(lines.length, 6);
  assert.match(lines[0], /^guests,/);
});
