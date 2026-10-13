import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES, sizeClass, classify, compute, SAMPLE, summaryText, ladderCsv } from "./calc.mjs";

const role = (id) => ROLES.find((r) => r.id === id);
const run = (o) => compute({ role: "manufacturer", staff: "80", turnover: "20", balance: "15", eu: "yes", ...o });

test("size classes follow Recommendation 2003/361 ceilings", () => {
  assert.equal(sizeClass(9, 2, 50), "micro");
  assert.equal(sizeClass(10, 1, 1), "small");
  assert.equal(sizeClass(49, 10, 99), "small");
  assert.equal(sizeClass(49, 11, 11), "notsmall");
  assert.equal(sizeClass(50, 1, 1), "notsmall");
});

test("a medium manufacturer is in scope under Art 3 to 5", () => {
  const v = classify({ role: role("manufacturer"), size: "notsmall" });
  assert.equal(v.status, "in");
  assert.equal(v.via, "Art 3 to 5");
});

test("a small manufacturer is exempt under Art 7", () => {
  assert.equal(classify({ role: role("manufacturer"), size: "small" }).status, "exempt-small");
  assert.equal(classify({ role: role("holder"), size: "micro" }).via, "Art 7");
});

test("a larger partner or subcontracting removes the exemption", () => {
  assert.equal(classify({ role: role("manufacturer"), size: "small", partner: true }).status, "in");
  const s = classify({ role: role("service"), size: "micro", subcontract: true });
  assert.equal(s.status, "in");
  assert.match(s.reason, /subcontract/i);
});

test("cloud switching duties have no size exemption", () => {
  for (const s of ["micro", "small", "notsmall"]) assert.equal(classify({ role: role("cloud"), size: s }).status, "in");
});

test("third-party recipients are in scope at any size", () => {
  assert.equal(classify({ role: role("recipient"), size: "micro" }).status, "in");
});

test("no Union reach or no matching role is out", () => {
  assert.equal(classify({ role: role("manufacturer"), size: "notsmall", eu: "no" }).status, "out");
  assert.equal(classify({ role: role("none"), size: "notsmall" }).status, "out");
});

test("compute rejects missing and bad input", () => {
  assert.ok(compute({}).errors.length >= 4);
  assert.match(run({ staff: "-1" }).errors[0], /cannot be negative/);
  assert.match(run({ turnover: "abc" }).errors[0], /must be a number/);
  assert.match(run({ balance: "" }).errors[0], /required/);
  assert.match(run({ role: "x" }).errors[0], /Choose your role/);
});

test("compute: the sample is a 35-person maker, small and so exempt, but in scope with a larger partner", () => {
  const r = compute(SAMPLE);
  assert.equal(r.size, "small");
  assert.equal(r.verdict.status, "exempt-small");
  assert.equal(r.ladder.map((l) => l.status).join(), "exempt-small,exempt-small,in");
  assert.equal(compute({ ...SAMPLE, partner: "1" }).verdict.status, "in");
  assert.ok(compute({ ...SAMPLE, partner: "1" }).findings.some((f) => /removes the Art 7 exemption/.test(f.title)));
});

test("compute: duties follow the role", () => {
  assert.ok(run({}).obligations.some((o) => /12 September 2026/.test(o)));
  assert.ok(run({ role: "cloud", staff: "5", turnover: "1", balance: "1" }).obligations.some((o) => /12 January 2027/.test(o)));
  assert.ok(run({ role: "recipient" }).obligations.some((o) => /profiling/.test(o)));
  assert.ok(run({ role: "holder" }).obligations.some((o) => /public sector/.test(o)));
});

test("compute: exempt and out results carry no duties", () => {
  const e = run({ staff: "3", turnover: "0.5", balance: "0.2" });
  assert.equal(e.verdict.status, "exempt-small");
  assert.equal(e.obligations.length, 0);
  assert.equal(run({ role: "none" }).obligations.length, 0);
});

test("unsure about the Union adds a finding; design date only for makers", () => {
  assert.ok(run({ eu: "unsure" }).findings.some((f) => /unsure/.test(f.title)));
  assert.ok(run({}).findings.some((f) => /Art 3\(1\)/.test(f.title)));
  assert.ok(!run({ role: "cloud" }).findings.some((f) => /Art 3\(1\)/.test(f.title)));
});

test("summary and csv name the result and the Article", () => {
  const r = run({});
  const t = summaryText(r);
  assert.match(t, /Result: in scope \[Art 3 to 5\]/);
  assert.match(t, /not legal advice/);
  const csv = ladderCsv(r).split("\n");
  assert.equal(csv.length, 4);
  assert.match(csv[1], /microenterprise","exempt-small","Art 7"/);
});
