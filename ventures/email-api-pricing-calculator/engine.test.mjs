import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROVIDERS, providerCost, compare, project, cheapestSegments, summarize } from "./engine.mjs";

test("free allowance bills nothing; just above it the cheapest plan applies", () => {
  assert.equal(providerCost(DEFAULT_PROVIDERS.resend, 3000), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.resend, 3001), 20);
  assert.equal(providerCost(DEFAULT_PROVIDERS.postmark, 100), 0);
  assert.equal(providerCost(DEFAULT_PROVIDERS.postmark, 101), 15);
});

test("overage is priced per 1,000 and the buyer takes the cheaper of plan-plus-overage and the next plan", () => {
  // resend 60k: 20 + 10*0.9 = 29 beats the 100k plan at 90
  assert.equal(providerCost(DEFAULT_PROVIDERS.resend, 60000), 29);
  // resend 100k: min(20 + 50*0.9 = 65, 90) = 65
  assert.equal(providerCost(DEFAULT_PROVIDERS.resend, 100000), 65);
  // ses is pure pay-as-you-go: 250k = 25
  assert.equal(providerCost(DEFAULT_PROVIDERS.ses, 250000), 25);
});

test("compare sorts cheapest first and reports the gap", () => {
  const rows = compare(40000);
  assert.equal(rows[0].key, "ses");
  assert.equal(rows[0].monthly, 4);
  assert.equal(rows.at(-1).extraVsCheapest, rows.at(-1).monthly - 4);
});

test("project compounds volume and totals each provider", () => {
  const p = project(1000, 10, 3);
  assert.deepEqual(p.path, [1000, 1100, 1210]);
  assert.ok(p.totals.some((t) => t.key === "resend" && t.total === 0));
  const big = project(40000, 8, 12);
  assert.ok(big.endVolume > 90000);
  assert.ok(big.totals[0].total <= big.totals.at(-1).total);
});

test("cheapestSegments covers the range contiguously and names ties", () => {
  const segs = cheapestSegments();
  assert.equal(segs[0].from, 0);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].from, segs[i - 1].to + 1);
  assert.match(segs[0].label, /all \$0\.00/);
});

test("a custom provider table changes the winner", () => {
  const providers = {
    a: { label: "A", url: "", freeEmails: 0, plans: [{ emails: 0, price: 0 }], overagePer1k: 1 },
    b: { label: "B", url: "", freeEmails: 0, plans: [{ emails: 0, price: 50 }], overagePer1k: 0.1 },
  };
  const segs = cheapestSegments(providers, 100000);
  assert.equal(segs[0].key, "a");
  assert.equal(segs.at(-1).key, "b");
  assert.ok(segs[0].to >= 55000 && segs[0].to <= 56000); // v/1000 = 50 + 0.1*v/1000
});

test("summarize gates on budget for the cheapest or a named provider", () => {
  const rows = compare(150000);
  assert.equal(summarize(rows, { budget: 10000 }).errors, 0);
  const s = summarize(rows, { budget: 20, provider: "postmark" });
  assert.equal(s.overBudget, true);
  assert.equal(s.errors, 1);
  assert.equal(summarize(rows, { provider: "nope" }).status, "error");
});

const flat = (label, price) => ({ label, freeEmails: 0, plans: [{ emails: 1e9, price }], overagePer1k: 1 });

test("project: totals sort cheapest first, ties broken by label", () => {
  const prov = { b: flat("Bravo", 10), a: flat("Alpha", 10), c: flat("Cheap", 5) };
  const { totals } = project(1000, 0, 3, prov);
  assert.deepEqual(totals.map((t) => t.label), ["Cheap", "Alpha", "Bravo"]);
});

test("cheapestSegments: starts at 0, ends exactly at maxVolume, segments are contiguous", () => {
  const segs = cheapestSegments(DEFAULT_PROVIDERS, 5000);
  assert.equal(segs[0].from, 0);
  assert.equal(segs[segs.length - 1].to, 5000);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].from, segs[i - 1].to + 1);
});

test("cheapestSegments: the winner at the final volume is reported for the last segment", () => {
  const flip = { x: { label: "X", freeEmails: 4999, plans: [{ emails: 1e9, price: 100 }], overagePer1k: 1 }, y: flat("Y", 50) };
  const s = cheapestSegments(flip, 5000);
  assert.equal(s[s.length - 1].key, "y");
  assert.equal(s[s.length - 1].to, 5000);
});

test("summarize: a monthly cost equal to the budget is not over budget", () => {
  const rows = compare(1000);
  const exact = summarize(rows, { budget: rows[0].monthly });
  assert.equal(exact.overBudget, false);
  assert.equal(exact.status, "ok");
  assert.equal(summarize(rows, { budget: rows[0].monthly - 0.01 }).overBudget, true);
});

test("summarize names the most expensive provider (the last row)", () => {
  const rows = compare(500000);
  const s = summarize(rows);
  const last = rows[rows.length - 1];
  assert.ok(s.text.includes(`The most expensive here, ${last.label}, is `));
});
