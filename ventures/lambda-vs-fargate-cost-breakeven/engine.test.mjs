import test from "node:test";
import assert from "node:assert/strict";
import { compare, breakEven, sensitivity, findings, parseInput, summarize, lambdaCost, fargateCost, tasksNeeded, normalise, fmtUsd, fmtVolume } from "./engine.mjs";

test("lambda cost is requests fee plus GiB-seconds", () => {
  const { w, p } = normalise({ requestsPerMonth: 1e6, durationMs: 1000, memoryGib: 1 });
  const c = lambdaCost(w, p);
  assert.ok(Math.abs(c.requests - 0.2) < 1e-9);
  assert.ok(Math.abs(c.compute - 1e6 * 0.0000166667) < 1e-6);
});

test("fargate respects the always-on floor and scales with peak concurrency", () => {
  const { w, p } = normalise({ requestsPerMonth: 1000 });
  assert.equal(tasksNeeded(w), 2);
  const floor = fargateCost(w, p);
  assert.ok(floor.total > 0);
  const big = normalise({ requestsPerMonth: 2e9, durationMs: 200, concurrency: 10, peakRatio: 4 });
  assert.ok(tasksNeeded(big.w) > 2);
});

test("low volume favours pay-per-request, high volume favours always-on", () => {
  assert.ok(["lambda", "cloud-run"].includes(compare({ requestsPerMonth: 100_000 }).cheapest));
  assert.equal(compare({ requestsPerMonth: 500_000_000, concurrency: 20 }).cheapest, "fargate");
});

test("zero requests costs nothing on pay-per-request platforms", () => {
  const r = compare({ requestsPerMonth: 0 });
  assert.equal(r.results.lambda.total, 0);
  assert.equal(summarize(r).status, "none");
  assert.equal(findings(r)[0].rule, "no-traffic");
});

test("break-even sits where the two cost lines cross", () => {
  const be = breakEven({}, {}, "lambda", "fargate");
  assert.ok(be.volume > 1e6 && be.volume < 1e9);
  const below = compare({ requestsPerMonth: be.volume * 0.8 });
  const above = compare({ requestsPerMonth: be.volume * 1.2 });
  assert.ok(below.results.lambda.total < below.results.fargate.total);
  assert.ok(above.results.lambda.total > above.results.fargate.total);
});

test("break-even reports a note when always-on is already cheaper or never wins", () => {
  const always = breakEven({ durationMs: 5000, memoryGib: 4, concurrency: 1, minTasks: 0 }, { lambdaPerGibSec: 1 }, "lambda", "fargate");
  assert.equal(always.volume, null);
  assert.match(always.note, /already cheaper/);
  const never = breakEven({ minTasks: 2 }, { lambdaPerMReq: 0, lambdaPerGibSec: 0 }, "lambda", "fargate");
  assert.equal(never.volume, null);
  assert.match(never.note, /stays cheaper/);
});

test("sensitivity lists a cheapest platform per volume multiplier", () => {
  const rows = sensitivity({ requestsPerMonth: 10_000_000 });
  assert.equal(rows.length, 7);
  assert.equal(rows[3].requestsPerMonth, 10_000_000);
  assert.ok(rows.every((r) => r.cheapest));
});

test("findings flag Lambda at more than twice Fargate and concurrency 1", () => {
  const r = compare({ requestsPerMonth: 500_000_000, concurrency: 1, peakRatio: 1 });
  const rules = findings(r).map((f) => f.rule);
  assert.ok(rules.includes("concurrency-one"));
  const hi = compare({ requestsPerMonth: 500_000_000, concurrency: 20 });
  assert.ok(findings(hi).some((f) => f.rule === "lambda-over-2x-fargate"));
  assert.ok(findings(compare({ requestsPerMonth: 1e6, peakRatio: 10 })).some((f) => f.rule === "spiky-traffic"));
});

test("parseInput reads key: value lines with k/M/B suffixes, and JSON", () => {
  assert.deepEqual(parseInput("requests: 20M\nduration-ms: 150\nnoise here\nconcurrency=8"), { requestsPerMonth: 20e6, durationMs: 150, concurrency: 8 });
  assert.equal(parseInput('{"requests": 5000000, "memoryGib": 1}').memoryGib, 1);
  assert.deepEqual(parseInput(""), {});
});

test("invalid or negative inputs fall back to defaults", () => {
  const { w } = normalise({ requestsPerMonth: -5, durationMs: "x", concurrency: 0 });
  assert.equal(w.requestsPerMonth, 10_000_000);
  assert.equal(w.durationMs, 120);
  assert.equal(w.concurrency, 1);
});

test("formatters", () => {
  assert.equal(fmtUsd(4.871), "$4.87");
  assert.equal(fmtUsd(1234.5), "$1,235");
  assert.equal(fmtVolume(15_000_000), "15.0M");
  assert.equal(fmtVolume(2_500_000_000), "2.50B");
});
