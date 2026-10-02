import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOrders, analyze, summarize, contribution, DEFAULTS } from "./engine.mjs";

const fixture = readFileSync(new URL("./fixtures/orders.csv", import.meta.url), "utf8");
const O = { ...DEFAULTS, margin: 0.4, outShip: 7, returnShip: 6, handling: 2, resale: 0.85, feePct: 0.03, feeFixed: 0.3 };

test("parseOrders reads a header in any order, bare rows, and skips bad lines", () => {
  const p = parseOrders("refund,Category,subtotal\n0,Tops,40\n40,Tops,40\n# note\nnonsense\nTops,10,50\n");
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows.map((r) => r.refund), [0, 40]);
  assert.equal(p.skipped, 2, "nonsense and a refund larger than the order are skipped, never guessed at");
  const bare = parseOrders("Dresses,60,60,5.5\nDresses,60,0,\n");
  assert.equal(bare.rows[0].label, 5.5);
  assert.equal(bare.rows[1].label, null);
});

test("a kept order earns margin less card fee and outbound shipping", () => {
  const c = contribution({ subtotal: 100, refund: 0, label: null }, O);
  assert.ok(Math.abs(c - (40 - 3.3 - 7)) < 1e-9);
});

test("a full refund costs outbound shipping, label, handling, card fee and unsellable stock", () => {
  const c = contribution({ subtotal: 100, refund: 100, label: null }, O);
  // revenue 0 - cogs 60 + resold cost 0.85*60 - fee 3.3 - ship 7 - label 6 - handling 2
  assert.ok(Math.abs(c - (-60 + 51 - 3.3 - 7 - 6 - 2)) < 1e-9);
  assert.ok(c < 0);
});

test("a partial refund sits between kept and fully refunded", () => {
  const kept = contribution({ subtotal: 100, refund: 0, label: null }, O);
  const half = contribution({ subtotal: 100, refund: 50, label: null }, O);
  const full = contribution({ subtotal: 100, refund: 100, label: null }, O);
  assert.ok(full < half && half < kept);
});

test("analysis on the fixture finds dresses worst and a fee beating free returns", () => {
  const r = analyze(parseOrders(fixture));
  assert.equal(r.count, 220);
  assert.equal(r.categories[0].cat, "Dresses");
  assert.ok(r.totals.marginAfterReturns < r.totals.marginBeforeReturns);
  assert.ok(r.findings.some((f) => f.rule === "high-return-category"));
  assert.ok(r.findings.some((f) => f.rule === "better-policy"));
  assert.equal(summarize(r).status, "warn");
});

test("no deterrence and heavy drop-off make free returns the better policy", () => {
  const r = analyze(parseOrders(fixture), { deterrence: 0, drag: 0.3 });
  assert.ok(r.table.every((t) => t.gain < 0));
  assert.ok(!r.findings.some((f) => f.rule === "better-policy"));
  assert.ok(r.findings.some((f) => f.rule === "free-returns-fine"));
});

test("break-even drop-off is where the fee's gain crosses zero", () => {
  const r = analyze(parseOrders(fixture));
  const t = r.table.find((p) => p.breakEven.kind === "atMost");
  assert.ok(t, "at least one policy has a finite break-even");
  const lo = analyze(parseOrders(fixture), { drag: Math.max(0, t.breakEven.drag - 0.01) }).table.find((p) => p.id === t.id);
  const hi = analyze(parseOrders(fixture), { drag: Math.min(0.3, t.breakEven.drag + 0.01) }).table.find((p) => p.id === t.id);
  assert.ok(lo.gain > 0 && hi.gain < 0);
});

test("a category that loses money after returns is an error finding", () => {
  const lines = ["Lamps,30,0", ...Array.from({ length: 12 }, () => "Lamps,30,30")].join("\n");
  const r = analyze(parseOrders(lines));
  assert.ok(r.findings.some((f) => f.rule === "category-loses-money"));
  assert.equal(summarize(r).status, "error");
});

test("no refunds, no rows and thin data are handled", () => {
  assert.ok(analyze(parseOrders("Tops,40,0\nTops,50,0")).findings.some((f) => f.rule === "no-returns"));
  assert.equal(analyze(parseOrders("")).count, 0);
  assert.equal(summarize(analyze(parseOrders(""))).status, "none");
  assert.ok(analyze(parseOrders("Tops,40,40\nTops,50,0")).findings.some((f) => f.rule === "thin-data"));
});

test("the safest policy never has more regret than the best", () => {
  const r = analyze(parseOrders(fixture));
  assert.ok(r.robust.maxRegret <= r.best.maxRegret + 1e-9);
});
