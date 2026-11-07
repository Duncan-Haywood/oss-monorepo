import test from "node:test";
import assert from "node:assert/strict";
import { buildLineSheet, orderFormCsv, lineSheetHtml } from "./linesheet.mjs";

test("wholesale by hand: 60 incl 20% tax -> 50 net -> 25", () => {
  const r = buildLineSheet({ styles: [{ name: "Tee", retail: 60, landed: 10 }] });
  assert.equal(r.styles[0].wholesale, 25);
  assert.equal(r.styles[0].sku, "S001");
  assert.equal(r.warnings.length, 0);
  assert.equal(r.minUnitsAtCheapest, 12); // 300 / 25
});

test("rejects bad margin and empty list; skips unnamed styles", () => {
  assert.equal(buildLineSheet({ shopMarginPct: 100, styles: [{ name: "a", retail: 5 }] }).ok, false);
  assert.equal(buildLineSheet({ styles: [] }).ok, false);
  const r = buildLineSheet({ styles: [{ name: "", retail: 5 }, { name: "ok", retail: 12 }] });
  assert.equal(r.styles.length, 1);
  assert.equal(r.warnings.length, 1);
  assert.equal(buildLineSheet({ styles: [{ name: "", retail: 5 }] }).ok, false);
});

test("thin wholesale warns and duplicate SKUs are renamed", () => {
  const r = buildLineSheet({ styles: [{ sku: "A", name: "x", retail: 30, landed: 14 }, { sku: "A", name: "y", retail: 60 }] });
  assert.match(r.warnings[0], /under 2x landed/);
  assert.equal(r.styles[1].sku, "A-2");
});

test("order form: colour x size rows, formula cells neutralised, quoting", () => {
  const r = buildLineSheet({ styles: [{ name: '=Hyp,"er"', retail: 60, colours: "Red, Blue", sizes: ["S", "M"] }] });
  const lines = orderFormCsv(r).trim().split("\n");
  assert.equal(lines.length, 1 + 4);
  assert.ok(lines[1].includes(`"'=Hyp,""er"""`));
  assert.ok(lines[1].endsWith("25.00,60.00,"));
});

test("html escapes brand and style text", () => {
  const r = buildLineSheet({ styles: [{ name: "<script>x</script>", retail: 60 }] });
  const h = lineSheetHtml(r, { name: "A&B <i>" });
  assert.ok(!h.includes("<script>"));
  assert.ok(h.includes("A&amp;B &lt;i&gt;"));
});
