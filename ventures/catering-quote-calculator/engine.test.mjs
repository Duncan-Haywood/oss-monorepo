import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLines, analyze, summarize } from "./engine.mjs";

const fixture = readFileSync(new URL("./fixtures/event.csv", import.meta.url), "utf8");

test("parses a header or no header, quoted names, bases and skips junk", () => {
  const a = parseLines("Chicken,guest,1,5\nVan,flat,1,50\nbad line\nCook,hour,4,20");
  assert.equal(a.length, 3);
  assert.equal(a.skipped, 1);
  const b = parseLines('Item,Type,Qty,Cost\n"Rolls, warm",per guest,2,$0.50');
  assert.equal(b[0].name, "Rolls, warm");
  assert.equal(b[0].basis, "guest");
  assert.equal(b[0].unit, 0.5);
  assert.equal(parseLines("x,weird,1,1").skipped, 1);
});

test("price is cost / (1 - margin - overhead); margin at that price round-trips", () => {
  const lines = parseLines("Food,guest,1,10\nVan,flat,1,100");
  const r = analyze(lines, { guests: 10, wastePct: 0, burdenPct: 0, targetMargin: 0.3, overheadPct: 0.1 });
  assert.equal(r.totalCost, 200);
  assert.equal(r.quote, 333.33);
  const back = analyze(lines, { guests: 10, wastePct: 0, burdenPct: 0, targetMargin: 0.3, overheadPct: 0.1, offeredPrice: r.quote / 10 });
  assert.ok(Math.abs(back.offered.margin - 0.3) < 1e-3);
  assert.ok(!back.findings.some((f) => f.rule === "offered-price-below-target"));
});

test("waste applies to per-guest lines and burden to staff hours only", () => {
  const r = analyze(parseLines("Food,guest,1,10\nCook,staff-hour,10,20\nVan,flat,1,100"), { guests: 10, wastePct: 0.1, burdenPct: 0.2 });
  assert.equal(r.food, 110);
  assert.equal(r.labor, 240);
  assert.equal(r.fixed, 340);
});

test("break-even guests = fixed / (price after overhead - per-guest cost)", () => {
  const r = analyze(parseLines("Food,guest,1,10\nVan,flat,1,200"), { guests: 10, wastePct: 0, offeredPrice: 20, overheadPct: 0 });
  assert.equal(r.breakEven, 20);
  assert.ok(r.findings.some((f) => f.rule === "below-break-even-count" && f.severity === "error"));
  assert.equal(analyze(parseLines("Food,guest,1,30\nVan,flat,1,200"), { guests: 10, wastePct: 0, offeredPrice: 20, overheadPct: 0 }).breakEven, null);
});

test("an impossible margin is an error, not a negative price", () => {
  const r = analyze(parseLines("Food,guest,1,10"), { targetMargin: 0.6, overheadPct: 0.5 });
  assert.ok(r.findings.some((f) => f.rule === "margin-impossible"));
  assert.equal(summarize(r).status, "error");
});

test("tiers lower the per-guest price as the guest count rises (fixed costs spread)", () => {
  const r = analyze(parseLines(fixture), { guests: 60 });
  for (let i = 1; i < r.tiers.length; i += 1) assert.ok(r.tiers[i].pricePerGuest < r.tiers[i - 1].pricePerGuest);
  assert.equal(r.tiers[2].guests, 60);
});

test("empty input reports no lines", () => {
  assert.equal(summarize(analyze(parseLines(""))).status, "none");
});
