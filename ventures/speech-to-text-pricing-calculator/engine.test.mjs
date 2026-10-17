import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS as D, providerCost, compare, project, cheapestSegments, summarize } from "./engine.mjs";

test("pay-as-you-go cost is hours times the hourly rate", () => {
  assert.deepEqual(providerCost(D.assemblyai, 100), { plan: "Universal (pre-recorded)", monthly: 15 });
  assert.equal(providerCost(D.openai, 100).monthly, 18); // the cheaper mini model wins, and supports streaming
});

test("streaming rules out batch-only plans, speaker labels rule out plans without them", () => {
  assert.equal(providerCost(D.deepgram, 100, true, false).monthly, 46);
  assert.equal(providerCost(D.deepgram, 100, false, true).monthly, 38);
  assert.equal(providerCost(D.deepgram, 100, true, true).monthly, 58);
  assert.equal(providerCost(D.openai, 100, false, true), null);
});

test("self-hosting is a flat fee until its included hours run out, then the extra-hour rate", () => {
  assert.equal(providerCost(D.whisper, 10, false, true).monthly, 360);
  assert.equal(providerCost(D.whisper, 6000, false, true).monthly, 360 + 1000 * 0.07);
  assert.equal(providerCost(D.whisper, 10, true, false), null); // no streaming on the self-host plan
});

test("no covering plan returns null, and compare sorts it last", () => {
  const rows = compare(100, true, true);
  assert.equal(rows.at(-1).monthly, null);
  assert.ok(rows[0].monthly != null);
});

test("compare sorts cheapest first and reports the gap", () => {
  const rows = compare(500, false, true);
  assert.equal(rows[0].extraVsCheapest, 0);
  const priced = rows.filter((r) => r.monthly != null);
  for (let i = 1; i < priced.length; i++) assert.ok(priced[i].monthly >= priced[i - 1].monthly);
  assert.equal(priced[1].extraVsCheapest, priced[1].monthly - priced[0].monthly);
});

test("projection grows the hours and totals every month", () => {
  const p = project(100, false, false, 10, 12);
  assert.equal(p.path[0], 100);
  assert.equal(p.path.length, 12);
  assert.ok(p.endHours > 250);
  assert.equal(project(100, false, false, 0, 12).totals.find((t) => t.key === "assemblyai").total, 180);
});

test("projection total is null when no plan covers the need", () => {
  assert.equal(project(100, true, false, 0, 12).totals.find((t) => t.key === "whisper").total, null);
});

test("cheapestSegments covers 1..max without gaps and finds the self-host crossover", () => {
  const segs = cheapestSegments(false, true, D, 5000);
  assert.equal(segs[0].from, 1);
  assert.equal(segs.at(-1).to, 5000);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].from, segs[i - 1].to + 1);
  assert.match(segs.at(-1).label, /Self-host/);
});

test("summarize: budget gate, unknown provider, uncovered provider", () => {
  const rows = compare(500, false, true);
  assert.equal(summarize(rows, { budget: 1000 }).overBudget, false);
  const over = summarize(rows, { budget: 10, provider: "aws" });
  assert.equal(over.overBudget, true);
  assert.equal(over.errors, 1);
  assert.match(summarize(rows, { provider: "nope" }).text, /Unknown provider/);
  assert.match(summarize(compare(500, true, true), { provider: "openai" }).text, /no listed plan/);
});
