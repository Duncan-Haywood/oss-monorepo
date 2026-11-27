// BR-CO-17 tolerance (added 2026-11-27). EN 16931's rule for a VAT breakdown row (BT-117 =
// BT-116 x BT-119 / 100) is tested by CEN's Schematron 1.3.x with a margin under one currency
// unit, so VAT rounded per line (a row a cent or so off the exact figure) passes the official
// validators. The built-in route blocked it as INV-038 and INV-018: the quality audit of
// 2026-11-19 (oss-monorepo portfolio/quality/audits/2026-11-19-einvoice-preflight.json) found
// 80 of 80 such files blocked here and passed by CEN. Now such a row is an INV-038 warning and
// the tax total may be the rows' sum (BR-CO-14). Only documents declaring EN 16931 or a CIUS of
// it get the margin; PINT keeps its own rule (baisa.test.mjs). Mirror: tests/test_br_co_17.py.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseUblInvoice } from "./ubl.mjs";
import { checkInvoice } from "./checks.mjs";
import { isBlocking } from "./report.mjs";
import { withinRoundingTolerance } from "./breakdown.mjs";

const base = readFileSync(new URL("./examples/ubl-invoice.xml", import.meta.url), "utf8");

// examples/ubl-invoice.xml: 19% on 200.00 (38.00) and 7% on 150.00 (10.50), tax 48.50,
// gross 398.50, payable 300.00 after a prepayment. Shift the 19% row and the totals by `off`.
function shifted(off, { rowOff = off, xml = base } = {}) {
  const f = (n, d) => (n + d).toFixed(2);
  return xml
    .replace(">38.00<", `>${f(38, rowOff)}<`)
    .replace(">48.50<", `>${f(48.5, off)}<`)
    .replace(">398.50<", `>${f(398.5, off)}<`)
    .replace(">300.00</cbc:PayableAmount", `>${f(300, off)}</cbc:PayableAmount`);
}

const findings = (xml) => checkInvoice(parseUblInvoice(xml)).filter((f) => ["INV-018", "INV-038"].includes(f.rule));
const blocking = (xml) => findings(xml).filter(isBlocking).map((f) => f.rule).sort();

test("the example itself is clean", () => {
  assert.deepEqual(findings(base), []);
});

test("a row a cent off taxable x rate is a warning, not a rejection", () => {
  const found = findings(shifted(0.01));
  assert.deepEqual(found.map((f) => [f.rule, f.severity]), [["INV-038", "warning"]]);
  assert.match(found[0].message, /0\.01 off .*\(38\.00\).*BR-CO-17/);
  assert.match(found[0].fix, /38\.00/);
});

test("a row 0.99 off is still within CEN's margin", () => {
  assert.deepEqual(blocking(shifted(0.99)), []);
  assert.deepEqual(blocking(shifted(-0.99)), []);
});

test("a row a full unit or more off still blocks, with the tax total", () => {
  assert.deepEqual(blocking(shifted(1)), ["INV-018", "INV-038"]);
  assert.deepEqual(blocking(shifted(1.2)), ["INV-018", "INV-038"]);
});

test("a tax total that is neither the exact figure nor the rows' sum still blocks", () => {
  // Row 38.01 (allowed), but BT-110 48.52 is neither 48.50 nor 38.01 + 10.50.
  assert.deepEqual(blocking(shifted(0.02, { rowOff: 0.01 })), ["INV-018"]);
});

test("the margin is EN 16931's: a PINT document keeps the exact test", () => {
  const pint = base.replace(/<cbc:CustomizationID>[^<]*</, "<cbc:CustomizationID>urn:peppol:pint:billing-1@aunz-1<");
  assert.notEqual(pint, base);
  assert.deepEqual(blocking(shifted(0.01, { xml: pint })), ["INV-018", "INV-038"]);
});

test("a zero-rate row keeps the exact test", () => {
  assert.equal(withinRoundingTolerance(0.01, 0, 0), false);
  assert.equal(withinRoundingTolerance(38.99, 38, 19), true);
  assert.equal(withinRoundingTolerance(39, 38, 19), false);
});
