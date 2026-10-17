import { test } from "node:test";
import assert from "node:assert/strict";
import { scan, SAMPLE, RULES, summaryText, findingsCsv, highlight, daysSince, MAX_CHARS } from "./calc.mjs";

const T = "2026-10-13";
const rules = (text) => scan(text, T).findings.map((f) => f.rule);

test("offsetting claims about a product are banned on their face", () => {
  for (const s of ["This shirt is carbon neutral.", "A climate-neutral shipping option", "Our net zero candle", "Dieses Produkt ist klimaneutral.", "Un produit neutre en carbone", "Producto neutro en carbono"]) {
    const r = scan(s, T);
    assert.equal(r.findings[0].rule, "offset", s);
    assert.equal(r.findings[0].severity, "high", s);
    assert.equal(r.verdict, "fix");
  }
});

test("a bare generic word is high; with a specification nearby it drops to check", () => {
  const bare = scan("Our eco-friendly cleaner.", T).findings[0];
  assert.equal(bare.rule, "generic");
  assert.equal(bare.severity, "high");
  const spec = scan("Our eco-friendly cleaner, made from 95% plant-based ingredients.", T).findings[0];
  assert.equal(spec.severity, "check");
  assert.equal(spec.specificationNearby, true);
});

test("other languages are scanned", () => {
  for (const s of ["Ein umweltfreundliches Produkt", "Un emballage respectueux de l'environnement", "Un envase sostenible", "Una confezione ecosostenibile", "Een milieuvriendelijke fles"]) {
    assert.deepEqual(rules(s), ["generic"], s);
  }
});

test("a self-made badge is flagged for the label rule", () => {
  assert.deepEqual(rules("Look for our Green Seal on the box"), ["label"]);
  assert.deepEqual(rules("Sustainability score: 9/10"), ["label"]);
});

test("future targets are flagged, and a date alone does not trigger", () => {
  assert.ok(rules("We will be net zero by 2030.").includes("future"));
  assert.deepEqual(rules("Founded in 2030 BC by nobody"), []);
});

test("a stricter rule over the same words suppresses the looser one", () => {
  const r = scan("We will be carbon neutral by 2030.", T);
  assert.equal(r.findings.filter((f) => f.rule === "generic").length, 0);
  assert.ok(r.findings.some((f) => f.rule === "future" || f.rule === "offset"));
});

test("whole-product claims need a named part, legal-minimum claims are caught", () => {
  assert.ok(rules("The product is 100% recyclable.").includes("wholepart"));
  assert.deepEqual(rules("The recyclable box protects it."), []);
  assert.deepEqual(rules("CFC-free formula"), ["legal"]);
  assert.deepEqual(rules("Complies with all EU regulations"), ["legal"]);
});

test("plain copy produces no findings and a 'none' verdict; the 'green tea' trap stays clean", () => {
  const r = scan("Stainless steel bottle, 750 ml, dishwasher safe. Ships in 2 days. Green tea flavour pack.", T);
  assert.equal(r.counts.total, 0);
  assert.equal(r.verdict, "none");
});

test("the sample hits every rule and mixed severities", () => {
  const r = scan(SAMPLE.text, SAMPLE.today);
  for (const rule of RULES) assert.ok(r.byRule[rule.id] > 0, rule.id);
  assert.equal(r.verdict, "fix");
  assert.equal(r.counts.high + r.counts.check, r.counts.total);
});

test("findings are positioned inside the text and do not overlap", () => {
  const r = scan(SAMPLE.text, T);
  let prev = 0;
  for (const f of r.findings) {
    assert.equal(SAMPLE.text.slice(f.start, f.end), f.matched);
    assert.ok(f.start >= prev);
    prev = f.end;
  }
  assert.equal(highlight(SAMPLE.text, r.findings).map((s) => s.text).join(""), SAMPLE.text);
});

test("date handling: in force from 27 Sept 2026, rejects bad dates", () => {
  assert.equal(scan("x green product", "2026-09-26").inForce, false);
  assert.equal(scan("x green product", "2026-09-27").inForce, true);
  assert.equal(daysSince("2026-09-27", T), 16);
  assert.ok(scan("x", "2026-02-30").errors);
  assert.ok(scan("x", "tomorrow").errors);
});

test("empty and oversized input is rejected with a message", () => {
  assert.ok(scan("   ", T).errors[0].match(/Paste/));
  assert.ok(scan("a".repeat(MAX_CHARS + 1), T).errors[0].match(/limit/));
  assert.ok(scan(null, T).errors);
});

test("a long page scans quickly (no catastrophic backtracking)", () => {
  const t0 = Date.now();
  scan("we will " + "x ".repeat(20000) + "the goal is " + "y".repeat(20000), T);
  assert.ok(Date.now() - t0 < 2000);
});

test("summary and csv carry the rule, the fix and the caveat", () => {
  const r = scan(SAMPLE.text, T);
  const s = summaryText(r);
  assert.match(s, /Annex I 4c/);
  assert.match(s, /Fix:/);
  assert.match(s, /not legal advice/);
  const csv = findingsCsv(r).split("\n");
  assert.equal(csv.length, r.findings.length + 1);
  assert.match(csv[0], /severity/);
});
