import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseMetrics, analyze, summarize, breakEvenUtilization, DEFAULT_PRICES } from "./engine.mjs";

const fixture = readFileSync(new URL("./fixtures/consumed-capacity.csv", import.meta.url), "utf8");
const flat = (reads, writes, n = 48) => Array.from({ length: n }, (_, i) => `2026-09-01T${String(i % 24).padStart(2, "0")}:00:00Z,${reads},${writes}`).join("\n");

test("parser reads rows, maps a header in either order, skips junk", () => {
  const p = parseMetrics("when,WriteUnits,ReadUnits\n2026-01-01,5,10\nnot a row\n# note\n2026-01-02,7,11");
  assert.deepEqual(p.records.map((r) => [r.read, r.write]), [[10, 5], [11, 7]]);
  assert.equal(p.skipped, 1);
  assert.equal(parseMetrics("").records.length, 0);
  assert.equal(parseMetrics("t,-1,2").records.length, 0);
});

test("on-demand cost is exactly consumed units times the per-million price, scaled to 730 h", () => {
  const r = analyze(parseMetrics(flat(3_600_000, 360_000)), {});
  // 48 h: reads 172.8M, writes 17.28M -> per 730 h scale 15.208x
  const expected = ((172.8e6 / 1e6) * 0.125 + (17.28e6 / 1e6) * 0.625) * (730 / 48);
  assert.ok(Math.abs(r.totals.onDemand - expected) < 1e-6);
});

test("break-even utilisation is about 29% with default prices, for reads and writes", () => {
  assert.ok(Math.abs(breakEvenUtilization(0.125, 0.00013) - 0.2889) < 1e-3);
  assert.ok(Math.abs(breakEvenUtilization(0.625, 0.00065) - 0.2889) < 1e-3);
});

test("steady traffic favours provisioned; near-idle traffic favours on-demand", () => {
  const steady = analyze(parseMetrics(flat(3_600_000, 360_000)), {});
  assert.match(steady.best.mode, /^provisioned/); // perfectly flat traffic: a fixed peak beats autoscaling headroom
  assert.ok(steady.findings.some((f) => f.rule === "switch-capacity-mode"));
  const idle = analyze(parseMetrics(flat(0, 0, 48)), {});
  assert.equal(idle.best.mode, "on-demand");
  assert.ok(idle.findings.some((f) => f.rule === "mostly-idle"));
  assert.ok(!idle.findings.some((f) => f.rule === "switch-capacity-mode"));
});

test("current provisioned capacity below the average rate throttles and is an error", () => {
  const r = analyze(parseMetrics(flat(3_600_000, 360_000)), { currentProvisioned: { read: 500, write: 50 } });
  assert.ok(r.findings.some((f) => f.rule === "current-capacity-throttles" && f.severity === "error"));
  assert.equal(summarize(r).status, "error");
  assert.ok(r.totals.current > 0);
});

test("overprovisioned current capacity is told to switch down", () => {
  const r = analyze(parseMetrics(flat(3_600_000, 360_000)), { currentProvisioned: { read: 5000, write: 1000 } });
  assert.ok(r.findings.some((f) => f.rule === "switch-capacity-mode"));
  assert.ok(r.saving > 0);
});

test("a one-hour spike is flagged and makes a fixed peak expensive", () => {
  const rows = Array.from({ length: 72 }, (_, i) => `t${i},${i === 30 ? 36_000_000 : 360_000},${i === 30 ? 3_600_000 : 36_000}`).join("\n");
  const r = analyze(parseMetrics(rows), {});
  assert.ok(r.findings.some((f) => f.rule === "spiky-reads"));
  assert.ok(r.findings.some((f) => f.rule === "autoscaling-ramp-risk"));
  assert.ok(r.totals.staticPeak > r.totals.autoscaled);
});

test("short samples are flagged; prices and period are honoured", () => {
  assert.ok(analyze(parseMetrics(flat(1000, 100, 6)), {}).findings.some((f) => f.rule === "small-sample"));
  const dear = analyze(parseMetrics(flat(3_600_000, 360_000)), { prices: { ...DEFAULT_PRICES, onDemandPerMillionRead: 1 } });
  const base = analyze(parseMetrics(flat(3_600_000, 360_000)), {});
  assert.ok(dear.totals.onDemand > base.totals.onDemand);
  const fiveMin = analyze(parseMetrics(flat(360_000, 36_000, 288)), { periodSeconds: 300 });
  assert.equal(Math.round(fiveMin.hours), 24);
});

test("no rows gives the none summary", () => {
  assert.equal(summarize(analyze(parseMetrics("hello"))).status, "none");
});

test("the fixture week demonstrates the headline recommendation", () => {
  const r = analyze(parseMetrics(fixture), {});
  assert.equal(r.count, 168);
  assert.equal(r.best.mode, "provisioned with autoscaling");
  assert.ok(r.saving > 20);
});
