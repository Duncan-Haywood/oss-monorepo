import test from "node:test";
import assert from "node:assert/strict";
import { checkClaims, claimsCsv, RULES } from "./greenclaims.mjs";

const rules = t => checkClaims(t).findings.map(f => f.rule);

test("eco-friendly and sustainable are generic claims (banned form)", () => {
  const r = checkClaims("Our eco-friendly, sustainable tee.");
  assert.deepEqual(r.findings.map(f => f.phrase.toLowerCase()), ["eco-friendly", "sustainable"]);
  assert.equal(r.counts.ban, 2);
});
test("carbon neutral is the offset rule, not the generic one", () => {
  assert.deepEqual(rules("A carbon neutral hoodie"), ["offset"]);
  assert.deepEqual(rules("Net-zero shipping"), ["offset"]);
});
test("a colour called green is not flagged", () => assert.deepEqual(rules("Forest green hoodie, green print"), []));
test("specific, certified wording passes", () => {
  const r = checkClaims("Shell: 100% cotton. Dyed with OEKO-TEX Standard 100 dyes.");
  assert.equal(r.findings.length, 0);
  assert.match(r.summary, /not clearance/);
});
test("future promise is flagged as needing proof", () => {
  const f = checkClaims("We will be net-zero by 2030.").findings;
  assert.ok(f.some(x => x.rule === "future" || x.rule === "offset"));
  assert.equal(checkClaims("By 2030 we aim to be carbon neutral").findings.length >= 1, true);
});
test("own badge is banned, a recycled share is a proof item", () => {
  assert.deepEqual(rules("Wearing our eco-certified badge"), ["label"]);
  const r = checkClaims("Lining of recycled polyester");
  assert.deepEqual(r.findings.map(f => [f.rule, f.severity]), [["recycled", "proof"]]);
});
test("whole-product claim wins over the plain recycled match at the same place", () => {
  const r = checkClaims("Made from recycled bottles");
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].rule, "whole");
});
test("legal requirement as a feature", () => assert.deepEqual(rules("REACH compliant and azo-free"), ["legal", "legal"]));
test("line numbers and context", () => {
  const r = checkClaims("Soft tee\nVery sustainable fabric");
  assert.equal(r.findings[0].line, 2);
  assert.match(r.findings[0].context, /Very sustainable fabric/);
});
test("repeat calls give the same answer (no stale regex state)", () => {
  assert.deepEqual(checkClaims("eco-friendly").findings.length, checkClaims("eco-friendly").findings.length);
});
test("input checks and csv quoting", () => {
  assert.throws(() => checkClaims(5));
  assert.throws(() => checkClaims("x".repeat(100001)));
  const csv = claimsCsv(checkClaims('Say "sustainable" now'));
  assert.match(csv, /^line,severity,rule,phrase,context,safer\n1,ban,generic,"sustainable"/);
});
test("every rule has all its fields", () => {
  for (const r of RULES) assert.ok(r.id && r.label && r.re.global && r.why && r.safer && ["ban", "proof"].includes(r.severity));
});
