import test from "node:test";
import assert from "node:assert/strict";
import { parseComposition, compositionLabel, checkLabel, requirements, suggestCare } from "./labels.mjs";

test("parses shares in either order and sorts descending", () => {
  const p = parseComposition("5% elastane, cotton 95%");
  assert.deepEqual(p.parts, [{ key: "cotton", pct: 95 }, { key: "elastane", pct: 5 }]);
  assert.equal(p.total, 100); assert.deepEqual(p.problems, []);
});
test("shares that do not add to 100 are a problem and give no label", () => {
  const r = checkLabel("60% cotton, 30% polyester");
  assert.equal(r.ok, false); assert.equal(r.label, ""); assert.match(r.problems[0], /90%/);
});
test("brand names are flagged but still mapped", () => {
  const p = parseComposition("92% cotton, 8% Lycra");
  assert.ok(p.problems.some(x => /brand name/.test(x)));
  assert.equal(p.parts[1].key, "elastane");
});
test("unknown fibre is a problem", () => {
  assert.ok(parseComposition("100% bamboo").problems[0].includes("bamboo"));
});
test("EU and US use their own names for the same fibre", () => {
  const p = parseComposition("90% cotton, 10% elastane").parts;
  assert.equal(compositionLabel(p, "eu"), "90% cotton, 10% elastane");
  assert.equal(compositionLabel(p, "us"), "90% cotton, 10% spandex");
  assert.equal(compositionLabel(parseComposition("100% nylon").parts, "eu"), "100% polyamide or nylon");
});
test("EU translates names and the grouped line", () => {
  const p = parseComposition("80% cotton, 17% polyester, 2% elastane, 1% silk").parts;
  assert.equal(compositionLabel(p, "eu", "de"), "80% Baumwolle, 17% Polyester, 3% andere Fasern");
});
test("US lists fibres under 5% as other fibre but keeps spandex", () => {
  const p = parseComposition("93% cotton, 4% spandex, 3% silk").parts;
  assert.equal(compositionLabel(p, "us"), "93% cotton, 4% spandex, 3% other fiber");
  const q = parseComposition("96% cotton, 4% linen").parts;
  assert.equal(compositionLabel(q, "us"), "96% cotton, 4% other fiber");
});
test("requirements change with the market and the maker's location", () => {
  assert.deepEqual(checkLabel("100% cotton", { market: "us" }).missing, ["Country of origin", "Maker's name or RN number", "Care instructions"]);
  const eu = checkLabel("100% cotton", { market: "eu", makerName: "A", makerAddress: "1 Rue", productId: "B1", makerOutsideEu: true, care: "x" });
  assert.deepEqual(eu.missing, ["EU responsible person (name and address)"]);
  assert.equal(requirements("eu", {}).length, 4);
});
test("care starts from the most delicate fibre", () => {
  assert.equal(suggestCare(parseComposition("70% cotton, 30% wool").parts).drivenBy, "wool");
  assert.match(suggestCare(parseComposition("100% cotton").parts).text, /Machine wash warm/);
});
test("unknown EU language is reported", () => {
  assert.ok(checkLabel("100% cotton", { lang: "xx" }).problems.length);
});
