import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("sample: a non-earner and a 32k earner save 252 a year, 1,260 with four years backdated", () => {
  const r = run({});
  assert.equal(r.eligible, true);
  assert.equal(r.low, 9000);
  assert.equal(r.high, 32000);
  assert.equal(r.gross, 252);
  assert.equal(r.giverCost, 0);
  assert.equal(r.net, 252);
  assert.equal(r.years, 5);
  assert.equal(r.total, 1260);
});

test("order of the partners does not matter", () => {
  assert.equal(run({ a: 32000, b: 9000 }).total, 1260);
});

test("giver above 11,310 uses part of the allowance and the saving shrinks", () => {
  const r = run({ a: 12000, b: 30000, back: 0 });
  assert.equal(r.giverUsedAllowance, 690);
  assert.equal(r.giverCost, 138);
  assert.equal(r.net, 114);
  assert.ok(r.findings.some((f) => f.title.includes("GBP 690")));
});

test("giver exactly at the allowance gains nothing", () => {
  const r = run({ a: 12570, b: 30000, back: 0 });
  assert.equal(r.net, 0);
  assert.ok(r.findings[0].title.includes("gain nothing"));
});

test("lower earner above the allowance is ineligible", () => {
  const r = run({ a: 20000, b: 30000 });
  assert.equal(r.eligible, false);
  assert.equal(r.net, 0);
  assert.ok(r.findings[0].title.includes("would not qualify"));
});

test("higher rate recipient is ineligible, with the Scottish limit lower", () => {
  assert.equal(run({ b: 50270 }).eligible, true);
  assert.equal(run({ b: 50271 }).eligible, false);
  assert.equal(run({ b: 44000, region: "scot" }).eligible, false);
  assert.equal(run({ b: 44000, region: "rest" }).eligible, true);
});

test("two non-taxpayers have nothing to save", () => {
  const r = run({ a: 0, b: 12000 });
  assert.equal(r.eligible, false);
  assert.ok(r.reasons[0].includes("no tax"));
});

test("near the basic-rate limit warns about the margin", () => {
  assert.ok(run({ b: 49800 }).findings.some((f) => f.title.includes("basic-rate limit")));
});

test("bad input is rejected, never clamped", () => {
  assert.ok(compute({ ...SAMPLE, a: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, b: -1 }).errors.length);
  assert.ok(compute({ ...SAMPLE, back: 5 }).errors.length);
  assert.ok(compute({ ...SAMPLE, back: 1.5 }).errors.length);
  assert.ok(compute({ ...SAMPLE, region: "mars" }).errors.length);
  assert.ok(compute({ ...SAMPLE, year: 1999 }).errors.length);
  assert.ok(parse(undefined).errors.length);
});

test("summary names the source and carries the disclaimer", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.ok(t.includes("Not tax advice"));
  assert.ok(t.includes("Total across years: GBP 1,260"));
});

test("Scottish higher-rate threshold is inclusive at 43,662 and exclusive above", () => {
  assert.equal(run({ b: 43662, region: "scot" }).eligible, true);
  assert.equal(run({ b: 43663, region: "scot" }).eligible, false);
});

test("a missing income is reported and parsed as zero, never a made-up amount", () => {
  const p = parse({ ...SAMPLE, a: "" });
  assert.equal(p.errors.length, 1);
  assert.equal(p.a, 0);
});
