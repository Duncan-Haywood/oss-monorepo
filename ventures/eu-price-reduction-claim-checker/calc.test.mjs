import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parseHistory, summaryText, SAMPLE, VERIFY, MODES } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("prior price is the lowest price in the 30 days before the reduction", () => {
  const r = run({});
  assert.equal(r.prior, 69);
  assert.equal(r.window.from, "2026-09-10");
  assert.equal(r.window.to, "2026-10-09");
});

test("a price that was lower earlier than the window does not count", () => {
  const r = run({ history: "2026-06-01, 40\n2026-08-01, 89\n2026-10-10, 59", claimedWas: "", claimedPct: "" });
  assert.equal(r.prior, 89);
});

test("window edge: the price in force on day 30 before counts, day 31 before does not", () => {
  const base = "2026-01-01, 100\n2026-09-10, 50\n2026-09-11, 100";
  assert.equal(run({ history: base, claimedWas: "", claimedPct: "" }).prior, 50);
  const out = "2026-01-01, 100\n2026-09-09, 50\n2026-09-10, 100";
  assert.equal(run({ history: out, claimedWas: "", claimedPct: "" }).prior, 100);
});

test("an inflated crossed-out price is flagged as misleading", () => {
  const r = run({});
  assert.equal(r.verdict, "misleading");
  assert.ok(r.findings.some((f) => f.severity === "high" && /89\.00/.test(f.title)));
});

test("an inflated percentage is flagged, a true one is not", () => {
  assert.equal(run({ claimedWas: "", claimedPct: 34 }).verdict, "misleading");
  const ok = run({ claimedWas: 69, claimedPct: 14 });
  assert.equal(ok.verdict, "ok");
  assert.equal(ok.findings.filter((f) => f.severity === "high").length, 0);
});

test("a sale price at or above the prior price is no reduction", () => {
  const r = run({ salePrice: 69, claimedWas: "", claimedPct: "" });
  assert.equal(r.verdict, "no-reduction");
  assert.equal(r.isReduction, false);
  assert.equal(run({ salePrice: 70, claimedWas: "", claimedPct: 10 }).verdict, "misleading");
});

test("progressive reductions measure from before the first reduction", () => {
  const history = "2026-08-01, 100\n2026-09-25, 80\n2026-10-10, 60";
  const r = run({ history, mode: "progressive", firstReductionDate: "2026-09-25", reductionDate: "2026-10-10", salePrice: 60, claimedWas: "", claimedPct: "" });
  assert.equal(r.prior, 100);
  assert.ok(Math.abs(r.trueDiscount - 40) < 1e-9);
  const std = run({ history, reductionDate: "2026-10-10", salePrice: 60, claimedWas: "", claimedPct: "" });
  assert.equal(std.prior, 80);
});

test("history shorter than 30 days is called out, not silently accepted", () => {
  const r = run({ history: "2026-10-01, 80", claimedWas: "", claimedPct: "" });
  assert.equal(r.window.covered, false);
  assert.ok(r.findings.some((f) => /less than 30 days/.test(f.title)));
});

test("bad input is rejected with a message, never clamped", () => {
  assert.match(run({ history: "" }).errors[0], /Paste the price history/);
  assert.match(run({ history: "tomorrow, 5" }).errors[0], /not a date followed by a price/);
  assert.match(run({ history: "2026-02-30, 5" }).errors[0], /not a real date/);
  assert.match(run({ history: "2026-09-01, 0" }).errors[0], /more than zero/);
  assert.match(run({ history: "2026-09-01, 5\n2026-09-01, 6" }).errors[0], /Two prices/);
  assert.match(run({ reductionDate: "" }).errors[0], /reduced price starts/);
  assert.match(run({ salePrice: "" }).errors[0], /Enter the reduced price/);
  assert.match(run({ claimedPct: 150 }).errors[0], /at most 100/);
  assert.match(run({ history: "2026-10-12, 80" }).errors[0], /starts on 2026-10-12/);
  assert.match(run({ mode: "progressive", firstReductionDate: "" }).errors[0], /first reduction/);
});

test("decimal commas and unsorted history are accepted", () => {
  const h = parseHistory("2026-09-01; 59,90\n2026-08-01, 79,50");
  assert.deepEqual(h.rows.map((r) => r.price), [79.5, 59.9]);
});

test("summary names the source to verify and the result", () => {
  const s = summaryText(run({}));
  assert.ok(s.includes(VERIFY));
  assert.match(s, /Not supported by the price history/);
  assert.equal(MODES.length, 2);
});
