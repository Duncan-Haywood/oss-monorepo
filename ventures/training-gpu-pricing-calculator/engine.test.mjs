import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS as D, GPUS, providerCost, compare, ownCost, breakevenHours, project, summarize } from "./engine.mjs";

test("hourly rate times busy hours, plus storage", () => {
  // RunPod H100 2.99 * 100 h + 200 GB * 0.07
  assert.equal(providerCost(D.runpod, "h100", { busyHours: 100, storageGb: 200 }), 313);
});

test("an instance billed while up pays for idle time; serverless does not", () => {
  // 100 busy hours at 50% utilisation = 200 billed hours on an instance
  assert.equal(providerCost(D.aws, "a100", { busyHours: 100, utilizationPct: 50 }), 820);
  assert.equal(providerCost(D.modal, "a100", { busyHours: 100, utilizationPct: 50 }), 2.1 * 100);
});

test("interruptible capacity re-runs lost work", () => {
  assert.equal(providerCost(D.vast, "h100", { busyHours: 100 }), 209);
});

test("billed hours cap at a month and count multiplies the rate", () => {
  assert.equal(providerCost(D.lambda, "h100", { busyHours: 5000 }), 2182.7);
  assert.equal(providerCost(D.lambda, "h100", { count: 8, busyHours: 10 }), 239.2);
});

test("a provider without the GPU is unavailable, not free", () => {
  assert.equal(providerCost(D.lambda, "rtx4090", { busyHours: 10 }), null);
  const c = compare("rtx4090", { busyHours: 100 });
  assert.ok(c.unavailable.some((u) => u.key === "lambda"));
  assert.ok(c.rows.every((r) => r.monthly > 0));
  assert.equal(c.rows[0].key, "vast");
});

test("compare sorts cheapest first and reports the gap", () => {
  const { rows } = compare("h100", { busyHours: 200 });
  assert.equal(rows[0].extraVsCheapest, 0);
  assert.equal(rows.at(-1).key, "gcp");
  assert.equal(rows.at(-1).extraVsCheapest, Math.round((rows.at(-1).monthly - rows[0].monthly) * 100) / 100);
});

test("ownership: depreciation after residual plus power at busy hours", () => {
  // 1800 * 1.2 = 2160; * 0.7 / 36 = 42; power 450 W * 100 h * 0.15 / 1000 = 6.75
  const o = ownCost("rtx4090", { busyHours: 100 });
  assert.equal(o.depreciation, 42);
  assert.equal(o.power, 6.75);
  assert.equal(o.monthly, 48.75);
});

test("breakeven hours: fixed cost over the per-hour saving, null when owning never wins", () => {
  const h = breakevenHours("rtx4090", 0.69);
  assert.equal(h, 67.47); // 42 / (0.69 - 0.0675)
  assert.equal(breakevenHours("h100", 0.01), null);
  assert.equal(breakevenHours("h100", 2.99) > 0, true);
});

test("project compounds busy hours and includes owning", () => {
  const p = project("a100", { busyHours: 100 }, 10, 3);
  assert.deepEqual(p.path, [100, 110, 121]);
  assert.ok(p.totals.some((t) => t.key === "own"));
  assert.ok(p.totals[0].total <= p.totals.at(-1).total);
});

test("summarize gates on budget for the cheapest or a named provider", () => {
  const { rows } = compare("h100", { busyHours: 300 });
  assert.equal(summarize(rows, { budget: 100000 }).errors, 0);
  const s = summarize(rows, { budget: 100, provider: "aws" });
  assert.equal(s.overBudget, true);
  assert.equal(summarize(rows, { provider: "nope" }).status, "error");
  assert.equal(summarize([], {}).status, "error");
});

test("every default provider lists every GPU key", () => {
  for (const p of Object.values(D)) for (const g of Object.keys(GPUS)) assert.ok(g in p.rates, `${p.label} ${g}`);
});
