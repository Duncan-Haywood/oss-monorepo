import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOrders, analyze, summarize, profitAt, candidateThresholds, DEFAULTS } from "./engine.mjs";

const text = readFileSync(new URL("./fixtures/orders.csv", import.meta.url), "utf8");
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const O = { ...DEFAULTS, fee: 5, margin: 0.5, reach: 0.3 };

test("parser maps headers, strips $, treats blank shipping as unknown, skips bad rows", () => {
  const p = parseOrders("# c\nshipping,subtotal\n6.5,$1200.00\n,40\nx,50\n0,0\n");
  assert.equal(p.rows.length, 2);
  assert.deepEqual(p.rows.map((r) => r.subtotal), [1200, 40]);
  assert.equal(p.rows[0].ship, 6.5);
  assert.equal(p.rows[1].ship, null);
  assert.equal(p.skipped, 2);
  assert.equal(parseOrders("55\n60").rows[1].ship, null);
});

test("with no behaviour, profit is plain arithmetic: margin on merchandise, shipping cost, fee under the threshold", () => {
  const orders = [{ subtotal: 40, ship: 7 }, { subtotal: 100, ship: 9 }];
  // threshold 50: order 1 pays the fee, order 2 ships free.
  near(profitAt(orders, 50, Infinity, O, 0, 0), (40 * 0.5 - 7 + 5) + (100 * 0.5 - 9));
  // never free: both pay the fee.
  near(profitAt(orders, Infinity, Infinity, O, 0, 0), (20 - 7 + 5) + (50 - 9 + 5));
});

test("a top-up replaces the order with one at the threshold: extra margin, no fee", () => {
  const orders = [{ subtotal: 49, ship: 7 }];
  const without = profitAt(orders, 50, Infinity, O, 0, 0);
  const full = profitAt(orders, 50, Infinity, O, 1, 0);
  // weight at gap 1 of 50 with reach 0.3 is 1 - 1/15
  const w = 1 - 1 / 15;
  near(full - without, w * ((50 * 0.5 - 7) - (49 * 0.5 - 7 + 5)));
});

test("checkout drop-off scales fee-paying orders back up when a threshold waives their fee", () => {
  const orders = [{ subtotal: 40, ship: 7 }];
  // observed under 'never free'; threshold 30 waives the fee, so the order stands for 1/(1-a) buyers.
  near(profitAt(orders, 30, Infinity, O, 0, 0.2), (40 * 0.5 - 7) / 0.8);
  // observed baseline is always weight 1
  near(profitAt(orders, Infinity, Infinity, O, 0, 0.2), 40 * 0.5 - 7 + 5);
  // raising the threshold on a free-shipping store loses the buyers who abandon at the fee
  const free = [{ subtotal: 40, ship: 7 }];
  near(profitAt(free, 60, 30, O, 0, 0.2), 0.8 * (40 * 0.5 - 7 + 5));
});

test("the current policy is its own baseline: zero gain, no break-even, and the top-up is not double counted", () => {
  const r = analyze(parseOrders(text), { current: 35, fee: 4.99, margin: 0.55 });
  const cur = r.table.find((t) => t.threshold === 35);
  near(cur.gain, 0);
  assert.equal(cur.breakEven, null);
  assert.equal(r.current, 35);
});

test("candidates are round steps plus the current threshold; the sweep ends with 'no free shipping'", () => {
  const c = candidateThresholds([20, 30, 40, 55, 60, 80, 120], 47);
  assert.ok(c.includes(47));
  assert.ok(c.every((t, i) => i === 0 || t > c[i - 1]));
  const r = analyze(parseOrders(text), {});
  assert.equal(r.table.at(-1).threshold, Infinity);
  assert.equal(r.label(Infinity), "no free shipping");
});

test("break-even drop-off is where the gain crosses zero", () => {
  const r = analyze(parseOrders(text), { current: 35, fee: 4.99, margin: 0.55 });
  const t = r.table.find((x) => x.breakEven?.kind === "atMost" && x.threshold >= 80);
  assert.ok(t, "a higher threshold should win only below some drop-off");
  const o = r.options;
  const orders = parseOrders(text).rows.map((x) => ({ subtotal: x.subtotal, ship: x.ship }));
  const base = profitAt(orders, 35, 35, o, 0, 0);
  const at = (a) => profitAt(orders, t.threshold, 35, o, o.topUp, a) - base;
  assert.ok(Math.abs(at(t.breakEven.drag)) < 0.01);
  assert.ok(at(t.breakEven.drag - 0.05) > 0 && at(t.breakEven.drag + 0.05) < 0);
});

test("with zero top-up and zero drop-off, charging shipping on every order is never beaten", () => {
  const r = analyze(parseOrders(text), { topUp: 0, drag: 0, fee: 7.1 });
  assert.equal(r.best.threshold, Infinity);
  assert.ok(r.table.every((t) => t.gain <= 1e-9));
});

test("a heavy drop-off makes free shipping win, and the robust pick is a real candidate", () => {
  const r = analyze(parseOrders(text), { drag: 0.3, fee: 4.99, margin: 0.55 });
  assert.notEqual(r.best.threshold, Infinity);
  assert.ok(r.table.includes(r.robust));
  assert.ok(r.robust.maxRegret <= r.best.maxRegret + 1e-9);
});

test("findings: better-threshold warns, thin-data warns, a fine threshold is info only", () => {
  const warn = analyze(parseOrders(text), { current: 35, fee: 4.99, margin: 0.55 });
  assert.ok(warn.findings.some((f) => f.rule === "better-threshold"));
  assert.equal(summarize(warn).status, "warn");
  assert.ok(warn.findings.some((f) => f.rule === "current-threshold"));
  const thin = analyze(parseOrders("50,6\n60,6\n70,6"), {});
  assert.ok(thin.findings.some((f) => f.rule === "thin-data"));
  const fine = analyze(parseOrders(text), { topUp: 0, drag: 0, fee: 7.1 });
  assert.ok(fine.findings.some((f) => f.rule === "threshold-fine"));
  assert.equal(summarize(fine).status, "ok");
  assert.equal(summarize(analyze(parseOrders("nothing"))).status, "none");
});

test("missing shipping cost falls back to the average of known rows; fee defaults to average cost", () => {
  const r = analyze(parseOrders("subtotal,shipping\n50,6\n60,8\n70\n"), {});
  near(r.totals.avgShip, 7);
  near(r.totals.fee, 7);
});
