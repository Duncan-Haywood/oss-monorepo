import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, ROLES, isMicro, classify, compute, SAMPLE, summaryText, ladderCsv } from "./calc.mjs";

const cat = (id) => CATEGORIES.find((c) => c.id === id);
const role = (id) => ROLES.find((r) => r.id === id);
const run = (o) => compute({ category: "s-ecommerce", role: "provider", staff: "30", turnover: "5", balance: "4", eu: "yes", audience: "consumers", ...o });

test("microenterprise follows Recommendation 2003/361 ceilings", () => {
  assert.equal(isMicro(9, 2, 5), true); // turnover at the ceiling is enough
  assert.equal(isMicro(9, 5, 2), true); // so is the balance sheet
  assert.equal(isMicro(10, 1, 1), false); // ten people leaves the class
  assert.equal(isMicro(9, 2.1, 2.1), false); // over both ceilings
  assert.equal(isMicro(0, 0, 0), true);
});

test("a listed service from a non-micro provider is in scope under Art 2(2)", () => {
  const v = classify({ category: cat("s-banking"), role: role("provider"), micro: false });
  assert.equal(v.status, "in");
  assert.match(v.via, /Art 2\(2\)\(d\)/);
  assert.match(v.via, /Art 13/);
});

test("microenterprise service providers are exempt under Art 4(5)", () => {
  const v = classify({ category: cat("s-ecommerce"), role: role("provider"), micro: true });
  assert.equal(v.status, "exempt-micro");
  assert.equal(v.via, "Art 4(5)");
});

test("the micro exemption does not reach product makers", () => {
  for (const r of ["manufacturer", "importer", "distributor"]) {
    assert.equal(classify({ category: cat("p-ereader"), role: role(r), micro: true }).status, "in");
  }
});

test("business-only services are out; business-only products stay in", () => {
  assert.equal(classify({ category: cat("s-ecommerce"), role: role("provider"), micro: false, audience: "business" }).status, "out");
  assert.equal(classify({ category: cat("p-payment"), role: role("manufacturer"), micro: false, audience: "business" }).status, "in");
});

test("no Union market or no listed category is out", () => {
  assert.equal(classify({ category: cat("s-ecommerce"), role: role("provider"), micro: false, eu: "no" }).status, "out");
  assert.equal(classify({ category: cat("none"), role: role("provider"), micro: false }).status, "out");
});

test("compute rejects a role that does not fit the category, and missing input", () => {
  assert.match(run({ role: "manufacturer" }).errors[0], /service provider/);
  assert.match(run({ category: "p-ereader", role: "provider" }).errors[0], /manufacturer, importer or distributor/);
  assert.ok(compute({}).errors.length >= 5);
  assert.match(run({ staff: "-1" }).errors[0], /cannot be negative/);
  assert.match(run({ turnover: "abc" }).errors[0], /must be a number/);
  assert.match(run({ balance: "" }).errors[0], /required/);
});

test("compute: the sample is a 14-person online shop, so in scope, and exempt at micro size", () => {
  const r = compute(SAMPLE);
  assert.equal(r.errors.length, 0);
  assert.equal(r.size, "notmicro");
  assert.equal(r.verdict.status, "in");
  assert.equal(r.ladder[0].status, "exempt-micro");
  assert.equal(r.ladder[1].status, "in");
  assert.ok(r.obligations.length >= 3);
  assert.ok(r.findings.some((f) => /checkout/.test(f.title)));
});

test("compute: duties follow the role", () => {
  const m = run({ category: "p-atm", role: "manufacturer" });
  assert.ok(m.obligations.some((o) => /CE marking/.test(o)));
  const d = run({ category: "p-atm", role: "distributor" });
  assert.ok(d.obligations.some((o) => /Art 9/.test(o)));
  assert.ok(!d.obligations.some((o) => /Art 7/.test(o)));
});

test("compute: an exempt or out result carries no duties", () => {
  const e = run({ staff: "3", turnover: "0.5", balance: "0.2" });
  assert.equal(e.verdict.status, "exempt-micro");
  assert.equal(e.obligations.length, 0);
  assert.ok(e.findings.some((f) => /recheck/.test(f.title)));
  const o = run({ category: "none" });
  assert.equal(o.obligations.length, 0);
});

test("compute: unsure about the Union market and legacy contracts add findings", () => {
  assert.ok(run({ eu: "unsure" }).findings.some((f) => /unsure/.test(f.title)));
  assert.ok(run({ legacy: "1" }).findings.some((f) => /Art 32/.test(f.title)));
  assert.ok(!run({}).findings.some((f) => /Art 32/.test(f.title)));
});

test("summary and csv name the result and the Article", () => {
  const r = compute(SAMPLE);
  const t = summaryText(r);
  assert.match(t, /Result: in scope \[Art 2\(2\)\(f\), Art 13\]/);
  assert.match(t, /not legal advice/);
  const csv = ladderCsv(r).split("\n");
  assert.equal(csv.length, 3);
  assert.match(csv[1], /microenterprise","exempt-micro","Art 4\(5\)"/);
});

test("every category kind has a role of the same kind", () => {
  for (const c of CATEGORIES.filter((x) => x.kind)) assert.ok(ROLES.some((r) => r.kind === c.kind));
});
