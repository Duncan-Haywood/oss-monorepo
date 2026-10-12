import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseReports, analyze, summarize, predictDuration, DEFAULT_PRICES } from "./engine.mjs";

const logs = readFileSync(new URL("./fixtures/report-lines.txt", import.meta.url), "utf8");
const line = (d, mem, used, extra = "") => `REPORT RequestId: a\tDuration: ${d} ms\tBilled Duration: ${Math.ceil(d)} ms\tMemory Size: ${mem} MB\tMax Memory Used: ${used} MB${extra}`;
const rules = (r) => r.findings.map((f) => f.rule);

test("parseReports reads tab and space separated lines, init duration, and ignores other lines", () => {
  const { records, skipped } = parseReports(`START RequestId: x\n${line(100.5, 512, 80)}\nREPORT RequestId: b Duration: 50 ms Billed Duration: 50 ms Memory Size: 512 MB Max Memory Used: 70 MB Init Duration: 200.1 ms\nREPORT RequestId: broken\nEND`);
  assert.equal(records.length, 2);
  assert.equal(records[1].init, 200.1);
  assert.equal(records[0].billed, 101);
  assert.equal(skipped, 1);
  assert.equal(parseReports("").records.length, 0);
});

test("Billed Duration is not mistaken for Duration", () => {
  const { records } = parseReports("REPORT RequestId: a Billed Duration: 999 ms Duration: 12.5 ms Memory Size: 128 MB Max Memory Used: 30 MB");
  assert.equal(records[0].duration, 12.5);
});

test("predictDuration: I/O-bound is flat, CPU-bound scales with CPU share up to one vCPU", () => {
  assert.equal(predictDuration(1000, 1024, 256, 0), 1000);
  assert.ok(Math.abs(predictDuration(1000, 512, 1024, 1) - 500) < 1e-9);
  assert.equal(predictDuration(1000, 2048, 4096, 1), 1000); // beyond ~1769 MB a single thread stops speeding up
});

test("fixture: over-provisioned, answers differ by CPU-bound share, arm64 noted", () => {
  const p = parseReports(logs);
  const r = analyze(p, { invocations: 5e6 });
  assert.equal(r.stats.size, 1024);
  assert.equal(r.scenarios.ioBound.best.mb, 256);
  assert.equal(r.scenarios.cpuBound.best.mb, 1024);
  assert.ok(r.scenarios.yours.best.mb < 1024 && r.scenarios.yours.best.mb > 256);
  assert.ok(rules(r).includes("memory-overprovisioned"));
  assert.ok(rules(r).includes("try-arm64"));
  assert.equal(summarize(r).status, "warn");
});

test("the latency cap stops a cheaper-but-much-slower recommendation", () => {
  const p = parseReports([line(900, 1024, 100), line(910, 1024, 100)].join("\n"));
  const capped = analyze(p, { cpuBound: 1, maxSlowdown: 1.25 });
  assert.equal(capped.best.mb, 1024);
  const uncapped = analyze(p, { cpuBound: 1, maxSlowdown: Infinity });
  assert.ok(uncapped.best.mb <= 1024);
});

test("peak memory near the limit is flagged; at the limit is an error", () => {
  const warn = analyze(parseReports(line(100, 512, 470)));
  assert.ok(rules(warn).includes("memory-near-limit"));
  const err = analyze(parseReports(line(100, 512, 510)));
  assert.equal(summarize(err).status, "error");
  assert.ok(err.findings.some((f) => f.rule === "out-of-memory-risk"));
});

test("cost is memory x billed time x price plus the request charge", () => {
  const r = analyze(parseReports(line(1000, 1024, 600)), { cpuBound: 0 });
  const expected = (1 * 1 * DEFAULT_PRICES.x86.perGbSecond + 0.2 / 1e6) * 1e6;
  assert.ok(Math.abs(r.current.costPerMillion - expected) < 1e-6);
});

test("cold starts and a mixed-size sample are reported; empty input is 'none'", () => {
  const mixed = [line(100, 512, 80, " Init Duration: 300 ms"), line(100, 512, 80), line(100, 512, 80), line(100, 256, 80)].join("\n");
  const r = analyze(parseReports(mixed));
  assert.ok(rules(r).includes("cold-start-heavy"));
  assert.ok(rules(r).includes("mixed-memory-sizes"));
  assert.ok(rules(r).includes("small-sample"));
  assert.equal(summarize(analyze(parseReports("nothing"))).status, "none");
});
