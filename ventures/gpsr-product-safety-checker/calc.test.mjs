import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, ROLES, classify, responsible, compute, SAMPLE, summaryText, ladderCsv } from "./calc.mjs";

const cat = (id) => CATEGORIES.find((c) => c.id === id);
const role = (id) => ROLES.find((r) => r.id === id);
const run = (o) => compute({ ...SAMPLE, ...o });

test("a general consumer product sold in the EU is in scope", () => {
  assert.equal(classify({ category: cat("general"), sellsEu: "yes" }).status, "in");
});

test("sector-law products are partly in scope", () => {
  for (const id of ["toy", "electrical", "cosmetic", "ppe-machinery"]) assert.equal(classify({ category: cat(id), sellsEu: "yes" }).status, "partial", id);
});

test("food, medicines, antiques and services are out", () => {
  for (const id of ["food", "medicine", "antique", "services"]) assert.equal(classify({ category: cat(id), sellsEu: "yes" }).status, "out", id);
});

test("no sales to the EU means not in scope", () => {
  assert.equal(classify({ category: cat("general"), sellsEu: "no" }).status, "out");
});

test("a non-EU reseller with no EU operator has a gap", () => {
  assert.equal(responsible({ role: role("distributor"), location: "noneu", euOperator: "no" }).status, "gap");
  assert.equal(responsible({ role: role("distributor"), location: "noneu", euOperator: "unsure" }).status, "unknown");
});

test("a non-EU seller with a named EU operator is covered", () => {
  assert.equal(responsible({ role: role("manufacturer"), location: "noneu", euOperator: "yes" }).status, "covered");
});

test("an EU manufacturer or importer is its own responsible operator", () => {
  assert.equal(responsible({ role: role("manufacturer"), location: "eu", euOperator: "no" }).status, "self");
  assert.equal(responsible({ role: role("importer"), location: "eu", euOperator: "no" }).status, "self");
});

test("an EU distributor must check who is named", () => {
  assert.equal(responsible({ role: role("distributor"), location: "eu", euOperator: "unsure" }).status, "check");
});

test("open duties depend on the role and drop when marked done", () => {
  const m = run({ role: "manufacturer", location: "eu" });
  assert.deepEqual(m.open.map((d) => d.id).sort(), ["batch", "gateway", "identity", "instructions", "listing", "techdoc"]);
  const d = run({ role: "distributor", listing: "1", gateway: "1" });
  assert.equal(d.open.length, 0);
  assert.equal(run({ role: "marketplace", gateway: "1" }).open.length, 0);
});

test("out-of-scope results list no duties", () => {
  const r = run({ category: "food" });
  assert.equal(r.verdict.status, "out");
  assert.equal(r.open.length, 0);
});

test("the gap raises a high finding that names Art 16", () => {
  const r = run({});
  const f = r.findings.find((x) => x.severity === "high" && /responsible person/.test(x.title));
  assert.ok(f);
  assert.match(f.title, /Art 16/);
});

test("the ladder shows both places of establishment", () => {
  const r = run({ role: "distributor", euOperator: "no" });
  assert.deepEqual(r.ladder.map((l) => l.location), ["eu", "noneu"]);
  assert.equal(r.ladder[1].status, "gap");
});

test("bad input is rejected, not clamped", () => {
  assert.ok(compute({}).errors.length >= 3);
  assert.ok(compute({ ...SAMPLE, category: "nope" }).errors[0].match(/product/));
});

test("summary and csv render", () => {
  const r = run({});
  assert.match(summaryText(r), /not legal advice/);
  assert.match(ladderCsv(r), /^established,status,basis/);
});
