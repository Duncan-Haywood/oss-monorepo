import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTORS, sizeClass, classify, compute, SAMPLE, summaryText, ladderCsv } from "./calc.mjs";

const sector = (id) => SECTORS.find((s) => s.id === id);
const run = (o) => compute({ sector: "digital-cloud", staff: "100", turnover: "20", balance: "20", eu: "yes", ...o });

test("size classes follow Recommendation 2003/361 ceilings", () => {
  assert.equal(sizeClass(49, 10, 10), "small");
  assert.equal(sizeClass(49, 11, 10), "small"); // balance sheet at the ceiling is enough
  assert.equal(sizeClass(49, 11, 11), "medium"); // under 50 staff but over both EUR 10M ceilings
  assert.equal(sizeClass(50, 5, 5), "medium"); // 50 staff leaves the small class
  assert.equal(sizeClass(249, 50, 100), "medium");
  assert.equal(sizeClass(249, 51, 43), "medium");
  assert.equal(sizeClass(249, 51, 44), "large"); // over both
  assert.equal(sizeClass(250, 1, 1), "large");
});

test("large Annex I is essential, medium Annex I is important", () => {
  assert.equal(classify({ sector: sector("energy-gas"), size: "large" }).category, "essential");
  assert.equal(classify({ sector: sector("energy-gas"), size: "medium" }).category, "important");
});

test("Annex II is important at medium and large, and not in scope when small", () => {
  assert.equal(classify({ sector: sector("food"), size: "large" }).category, "important");
  assert.equal(classify({ sector: sector("food"), size: "medium" }).category, "important");
  assert.equal(classify({ sector: sector("food"), size: "small" }).status, "maybe-out");
});

test("regardless-of-size types are in scope when small", () => {
  assert.deepEqual(["in", "essential"], [classify({ sector: sector("digital-dns"), size: "small" })].map((c) => [c.status, c.category])[0]);
  assert.equal(classify({ sector: sector("trust-qualified"), size: "small" }).category, "essential");
  assert.equal(classify({ sector: sector("trust-other"), size: "small" }).category, "important");
  assert.equal(classify({ sector: sector("public-central"), size: "small" }).category, "essential");
});

test("public electronic communications: important small, essential medium and up", () => {
  assert.equal(classify({ sector: sector("ecomms"), size: "small" }).category, "important");
  assert.equal(classify({ sector: sector("ecomms"), size: "medium" }).category, "essential");
  assert.equal(classify({ sector: sector("ecomms"), size: "large" }).category, "essential");
});

test("a CER critical entity is essential whatever the sector or size", () => {
  const c = classify({ sector: sector("none"), size: "small", cer: true });
  assert.equal(c.status, "in");
  assert.equal(c.category, "essential");
});

test("no Union activity takes the entity out, even large Annex I", () => {
  assert.equal(classify({ sector: sector("energy-gas"), size: "large", eu: "no" }).status, "out");
});

test("a Member State designation brings a small Annex entity in, category left to the state", () => {
  const c = classify({ sector: sector("food"), size: "small", designated: true });
  assert.equal(c.status, "in");
  assert.match(c.category, /Member State/);
  assert.equal(classify({ sector: sector("none"), size: "large" }).status, "out");
});

test("compute: the sample is a medium cloud provider, so important", () => {
  const r = compute(SAMPLE);
  assert.equal(r.errors.length, 0);
  assert.equal(r.size, "medium");
  assert.equal(r.verdict.category, "important");
  assert.equal(r.ladder.length, 3);
  assert.equal(r.ladder[0].status, "maybe-out");
  assert.equal(r.ladder[2].category, "essential");
});

test("compute: out-of-scope result carries the supply chain finding and no duties", () => {
  const r = run({ sector: "none" });
  assert.equal(r.verdict.status, "out");
  assert.equal(r.obligations.length, 0);
  assert.ok(r.findings.some((f) => /supply chain/.test(f.title)));
});

test("compute: banks get the DORA finding", () => {
  const r = run({ sector: "banking", staff: "400", turnover: "90", balance: "200" });
  assert.equal(r.verdict.category, "essential");
  assert.ok(r.findings.some((f) => /DORA/.test(f.title)));
});

test("compute: unsure about the Union gets a finding rather than a guess", () => {
  const r = run({ eu: "unsure" });
  assert.ok(r.findings.some((f) => /unsure/.test(f.title)));
});

test("bad input is rejected, not clamped", () => {
  assert.ok(compute({ sector: "", staff: "1", turnover: "1", balance: "1" }).errors.length >= 1);
  assert.match(compute({ sector: "food", staff: "-3", turnover: "1", balance: "1" }).errors[0], /negative/);
  assert.match(compute({ sector: "food", staff: "abc", turnover: "1", balance: "1" }).errors[0], /number/);
  assert.match(compute({ sector: "food", staff: "", turnover: "1", balance: "1" }).errors[0], /required/);
});

test("summary and CSV carry the verdict and the ladder", () => {
  const r = compute(SAMPLE);
  assert.match(summaryText(r), /in scope, important/);
  assert.match(summaryText(r), /not legal advice/);
  const rows = ladderCsv(r).split("\n");
  assert.equal(rows.length, 4);
  assert.match(rows[3], /essential/);
});

test("every sector has an annex or is the explicit none", () => {
  for (const s of SECTORS) assert.ok(s.id === "none" ? s.annex === null : ["I", "II"].includes(s.annex), s.id);
  assert.equal(new Set(SECTORS.map((s) => s.id)).size, SECTORS.length);
});
