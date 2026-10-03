import test from "node:test";
import assert from "node:assert/strict";
import { parseRequests, calculate, toMarkdown, toCsv, gate, effectiveRate } from "./engine.mjs";

const Q = { basePrice: 6000, baseHours: 60 };

test("parseRequests reads hours, h suffix and days, and reports bad lines", () => {
  const { items, bad } = parseRequests("Add SSO | 6\nDark mode, 3h\nReports | 1.5d\nnonsense\n | 4");
  assert.deepEqual(items.map((i) => i.hours), [6, 3, 12]);
  assert.equal(bad.length, 2);
});

test("effective rate comes from price/hours unless a rate is given", () => {
  assert.equal(effectiveRate(Q), 100);
  assert.equal(effectiveRate({ ...Q, rate: 120 }), 120);
  assert.equal(effectiveRate({}), 0);
});

test("change order is priced at the implied rate plus premium", () => {
  const r = calculate([{ title: "SSO", hours: 6 }, { title: "Dark mode", hours: 4 }], { ...Q, premiumPct: 20 });
  assert.equal(r.changeRate, 120);
  assert.equal(r.amount, 1200);
  assert.equal(r.newPrice, 7200);
  assert.equal(r.creepPct, 16.67);
});

test("free buffer is consumed in order before billing starts", () => {
  const r = calculate([{ title: "A", hours: 4 }, { title: "B", hours: 4 }], { ...Q, bufferPct: 10 });
  assert.equal(r.buffer, 6);
  assert.deepEqual(r.lines.map((l) => l.billableHours), [0, 2]);
  assert.equal(r.amount, 200);
});

test("absorbing the work lowers the effective rate and has a cost", () => {
  const r = calculate([{ title: "A", hours: 20 }], Q);
  assert.equal(r.absorbedCost, 2000);
  assert.equal(r.absorbedRate, 75);
  assert.equal(r.rateDropPct, 25);
  assert.equal(r.daysAdded, 3.33);
});

test("markdown and csv carry the figures; gate flags overruns", () => {
  const r = calculate([{ title: "A | B", hours: 5 }], Q);
  assert.match(toMarkdown(r, { client: "Acme", project: "Site" }), /Change order total: \$500\.00/);
  assert.match(toCsv(r), /"A \| B",5,0,5,500/);
  assert.equal(gate(r, { maxCreepPct: 20 }).length, 0);
  assert.equal(gate(r, { maxCreepPct: 5 }).length, 1);
  assert.equal(gate(r, { maxAbsorbed: 100 }).length, 1);
});

test("zero quote does not divide by zero", () => {
  const r = calculate([{ title: "A", hours: 3 }], {});
  assert.equal(r.amount, 0);
  assert.equal(r.creepPct, null);
});
