import { test } from "node:test";
import assert from "node:assert/strict";
import { weddingPlan, guestsForRealistic, fitBand, CATEGORIES, CONTINGENCY, FLOOR, CAP, needs } from "./calc.mjs";

const base = { budget: 40000, guests: 100, region: "mid", season: "standard", priorities: [] };

test("allocations plus contingency never exceed the budget", () => {
  for (const budget of [8000, 20000, 40000, 90000]) {
    const r = weddingPlan({ ...base, budget });
    assert.ok(r.allocated + r.contingency <= budget + 0.01, `budget ${budget}`);
  }
});

test("mid-range budget is allocated fully and lands inside floor and cap", () => {
  const r = weddingPlan(base);
  assert.ok(Math.abs(r.allocated + r.cushion - r.spendable) < 0.01);
  for (const row of r.rows) {
    assert.ok(row.alloc >= row.need * FLOOR - 0.01);
    assert.ok(row.alloc <= row.need * CAP + 0.01);
  }
});

test("priorities get a larger share of need than non-priorities", () => {
  const plain = weddingPlan(base);
  const prio = weddingPlan({ ...base, priorities: ["photo"] });
  const share = (r, k) => r.rows.find((x) => x.key === k).alloc / r.rows.find((x) => x.key === k).need;
  assert.ok(share(prio, "photo") > share(plain, "photo"));
  assert.ok(share(prio, "video") < share(plain, "video"));
});

test("very large budget leaves a cushion rather than overspending past caps", () => {
  const r = weddingPlan({ ...base, budget: 400000 });
  assert.ok(r.cushion > 0);
  for (const row of r.rows) assert.ok(row.alloc <= row.need * CAP + 0.01);
});

test("region and season move the typical cost the right way", () => {
  const t = (o) => weddingPlan({ ...base, ...o }).typical;
  assert.ok(t({ region: "veryhigh" }) > t({ region: "high" }));
  assert.ok(t({ region: "high" }) > t({ region: "mid" }));
  assert.ok(t({ region: "mid" }) > t({ region: "low" }));
  assert.ok(t({ season: "peak" }) > t({ season: "standard" }));
  assert.ok(t({ season: "standard" }) > t({ season: "off" }));
});

test("per-guest lines scale with guests; fixed lines do not", () => {
  const a = needs({ guests: 50, region: "mid", season: "standard" });
  const b = needs({ guests: 100, region: "mid", season: "standard" });
  const get = (list, k) => list.find((x) => x.key === k).need;
  assert.equal(get(b, "catering"), get(a, "catering") * 2);
  assert.equal(get(b, "photo"), get(a, "photo"));
});

test("fit bands", () => {
  assert.equal(fitBand(0.5), "very tight");
  assert.equal(fitBand(0.7), "tight");
  assert.equal(fitBand(1), "realistic");
  assert.equal(fitBand(1.5), "comfortable");
});

test("tight budget suggests a smaller guest count that actually reaches the realistic bar", () => {
  const tight = { ...base, budget: 32000, guests: 150 };
  const r = weddingPlan(tight);
  assert.ok(["tight", "very tight"].includes(r.band));
  const g = guestsForRealistic(tight.budget, tight.guests, tight.region, tight.season);
  assert.ok(g > 0 && g < 150);
  const check = weddingPlan({ ...tight, guests: g });
  assert.ok(check.ratio >= 0.85);
  const over = weddingPlan({ ...tight, guests: g + 1 });
  assert.ok(over.ratio < 0.85);
  assert.ok(r.findings.some((f) => f.title.startsWith("Budget covers")));
});

test("realistic budgets are not flagged as tight", () => {
  assert.equal(weddingPlan({ ...base, budget: 60000 }).findings.some((f) => f.title.startsWith("Budget covers")), false);
});

test("contingency is the documented share of the budget", () => {
  assert.equal(weddingPlan(base).contingency, base.budget * CONTINGENCY);
});

test("invalid input is rejected with a message", () => {
  assert.ok(weddingPlan({ ...base, budget: 0 }).invalid);
  assert.ok(weddingPlan({ ...base, budget: "x" }).invalid);
  assert.ok(weddingPlan({ ...base, guests: 0 }).invalid);
  assert.ok(weddingPlan({ ...base, guests: 10.5 }).invalid);
  assert.ok(weddingPlan({ ...base, region: "mars" }).invalid);
  assert.ok(weddingPlan({ ...base, priorities: ["yacht"] }).invalid);
  assert.ok(weddingPlan(undefined).invalid);
});

test("every category has a unique key", () => {
  assert.equal(new Set(CATEGORIES.map((c) => c.key)).size, CATEGORIES.length);
});

test("a budget below fixed costs returns no guest suggestion but says so", () => {
  assert.equal(guestsForRealistic(8000, 100, "mid", "standard"), null);
  const r = weddingPlan({ ...base, budget: 8000 });
  assert.ok(r.findings.some((f) => /small guest list/.test(f.detail)));
});
