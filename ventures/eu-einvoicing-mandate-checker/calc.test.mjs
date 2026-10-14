import { test } from "node:test";
import assert from "node:assert/strict";
import { COUNTRIES, compute, statusOf, daysUntil, summaryText, SAMPLE } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("daysUntil counts calendar days and goes negative after the date", () => {
  assert.equal(daysUntil("2026-10-14", "2026-10-13"), 1);
  assert.equal(daysUntil("2026-10-12", "2026-10-13"), -1);
  assert.equal(daysUntil("bad", "2026-10-13"), null);
});

test("statusOf separates in force, soon, later and pending", () => {
  assert.equal(statusOf("2025-01-01", "2026-10-13").state, "inforce");
  assert.equal(statusOf("2027-01-01", "2026-10-13").state, "soon");
  assert.equal(statusOf("2030-07-01", "2026-10-13").state, "later");
  assert.equal(statusOf(null, "2026-10-13").state, "pending");
});

test("Germany: receive since 2025, issue 2027 over EUR 800k, 2028 otherwise", () => {
  const big = run({});
  assert.equal(big.receive.state, "inforce");
  assert.equal(big.issue.state, "soon");
  assert.match(big.issue.text, /1 January 2027/);
  assert.match(run({ band: "upto800k" }).issue.text, /1 January 2028/);
});

test("France: SMEs issue a year after large companies, all receive from 1 Sept 2026", () => {
  assert.match(run({ country: "FR", band: "large" }).issue.text, /1 September 2026/);
  assert.match(run({ country: "FR", band: "sme" }).issue.text, /1 September 2027/);
  assert.equal(run({ country: "FR", band: "sme" }).receive.state, "inforce");
});

test("Spain has no fixed date and says why", () => {
  const r = run({ country: "ES", band: "over8m" });
  assert.equal(r.issue.state, "pending");
  assert.ok(r.findings.some((f) => /implementing regulation/.test(f.title)));
});

test("paper or PDF invoicing triggers a high finding when a date is live or near", () => {
  assert.ok(run({ method: "pdf" }).findings.some((f) => f.severity === "high" && /not an e-invoice/.test(f.title)));
  assert.ok(run({ method: "unsure" }).findings.some((f) => /not sure how you invoice/.test(f.title)));
  assert.ok(!run({ method: "structured" }).findings.some((f) => /not an e-invoice/.test(f.title)));
});

test("another country gets the ViDA note and no national dates", () => {
  const r = run({ country: "other", band: "" });
  assert.equal(r.country, null);
  assert.match(r.findings[0].title, /ViDA/);
  assert.match(summaryText(r), /not legal advice/);
});

test("missing country or band is rejected", () => {
  assert.ok(compute({ country: "", band: "" }).errors.length);
  assert.ok(compute({ country: "DE", band: "" }).errors.length);
  assert.ok(compute({ country: "DE", band: "nope" }).errors.length);
  assert.ok(compute({ country: "ZZ", band: "x" }).errors.length);
});

test("every country row has a receive field, an issue date per band and a verify source", () => {
  for (const [code, c] of Object.entries(COUNTRIES)) {
    assert.ok(c.verify, code);
    for (const b of c.bands) assert.ok(b.id in c.issue, `${code}/${b.id}`);
    for (const d of [c.receive, ...Object.values(c.issue)]) assert.ok(d === null || /^\d{4}-\d{2}-\d{2}$/.test(d), code);
  }
});

test("summary names the verify source", () => {
  assert.match(summaryText(run({})), /Verify against:/);
});
