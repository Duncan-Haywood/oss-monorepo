import test from "node:test";
import assert from "node:assert/strict";
import { quote, compareServices, checkAsk, toMarkdown } from "./engine.mjs";

test("100 guests, 4 h full bar: drinks, staffing and price add up", () => {
  const q = quote({});
  assert.equal(q.drinks, Math.ceil(100 * (2 + 3 * 1.2))); // 560
  assert.equal(q.bartenders, 2);
  assert.equal(q.paidHoursEach, 5.5);
  assert.equal(q.lines.labor, 2 * 5.5 * 30);
  const sum = q.lines.labor + q.lines.alcohol + q.lines.supplies + q.lines.travel + q.lines.fixed;
  assert.ok(Math.abs(q.cost - sum) < 0.02);
  assert.ok(Math.abs(q.profit / q.price - 0.4) < 0.005);
});

test("call minimum lifts a short event's paid hours", () => {
  assert.equal(quote({ hours: 2, setupHours: 0.5 }).paidHoursEach, 4);
});

test("service-only carries no alcohol cost and is cheaper", () => {
  const [full, beer, svc] = compareServices({});
  assert.equal(quote({ service: "service-only" }).lines.alcohol, 0);
  assert.ok(full.price > beer.price && beer.price > svc.price);
});

test("a low per-head ask is flagged as a loss or below target", () => {
  assert.equal(checkAsk({}, 5).verdict, "loss");
  assert.equal(checkAsk({}, 500).verdict, "meets-target");
  const q = quote({});
  assert.equal(checkAsk({}, q.pricePerGuest - 1).verdict === "meets-target", false);
});

test("validation", () => {
  assert.throws(() => quote({ guests: 0 }), RangeError);
  assert.throws(() => quote({ hours: -1 }), RangeError);
  assert.throws(() => quote({ service: "open-keg" }), RangeError);
  assert.throws(() => quote({ targetMargin: 0.99 }), RangeError);
  assert.throws(() => checkAsk({}, 0), RangeError);
});

test("markdown carries the quote and the planning-estimate caveat", () => {
  const md = toMarkdown(quote({}), { client: "Acme" });
  assert.match(md, /for Acme/);
  assert.match(md, /Planning estimate only/);
});
