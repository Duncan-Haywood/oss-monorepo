// INV-065: a number or date with a no-break space (or another non-XML space) at
// its end. String.trim() took it, so the built-in readers said nothing while a
// receiver's validator stops on the file. Added 2026-11-17; eval/nbsp-amounts-2026-11-17.md.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseUblInvoice } from "./ubl.mjs";
import { parseCiiInvoice } from "./cii.mjs";
import { checkInvoice } from "./checks.mjs";
import { unreadableValue, unreadableLeaves } from "./xmlvalues.mjs";
import { parseXmlTree } from "./ubl.mjs";

const UBL = readFileSync(new URL("./examples/peppol-credit-note.xml", import.meta.url), "utf8");
const CII = readFileSync(new URL("./examples/cii-invoice.xml", import.meta.url), "utf8");
const inv065 = (invoice) => checkInvoice(invoice).filter((f) => f.rule === "INV-065");

test("unreadableValue: castable once JavaScript trims, not once XML trims", () => {
  for (const v of ["238.00\u00A0", "\u00A0238.00", "238.00\u202F", "\uFEFF1", "2026-11-17\u3000", "20261117\u00A0", "true\u2009", "14:30:00\u00A0", "\u00A014:30:00.5+03:00", "2026-11-17T14:30:00Z\u00A0"]) {
    assert.equal(unreadableValue(v), true, JSON.stringify(v));
  }
  for (const v of ["238.00", " 238.00\n", "\t2026-11-17 ", "ACME\u00A0GmbH", "NL123456782B01\u00A0", "1\u00A0000.00", "", " 14:30:00 ", "14:30\u00A0"]) {
    assert.equal(unreadableValue(v), false, JSON.stringify(v));
  }
});

test("unreadableLeaves decodes character references and names the path", () => {
  const tree = parseXmlTree("<a><b>1</b><b>2&#160;</b><c><d>x&#xA0;</d><d>\u00A03</d></c></a>");
  assert.deepEqual(unreadableLeaves(tree), [
    { path: "/a[1]/b[2]", element: "b", value: "2\u00A0" },
    { path: "/a[1]/c[1]/d[2]", element: "d", value: "\u00A03" },
  ]);
});

test("the shipped examples draw no INV-065", () => {
  assert.deepEqual(inv065(parseUblInvoice(UBL)), []);
  assert.deepEqual(inv065(parseCiiInvoice(CII)), []);
});

test("a UBL amount with a literal no-break space draws INV-065, an error", () => {
  const payable = UBL.match(/<cbc:PayableAmount[^>]*>([^<]+)<\/cbc:PayableAmount>/);
  assert.ok(payable);
  const xml = UBL.replace(payable[0], payable[0].replace(`>${payable[1]}<`, `>${payable[1]}\u00A0<`));
  const invoice = parseUblInvoice(xml);
  // The reader still reads the amount (it did before, silently).
  const findings = inv065(invoice);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, undefined);
  assert.match(findings[0].message, /PayableAmount .*\[U\+00A0\].*no-break space \(U\+00A0\)/);
  assert.match(findings[0].message, /\/CreditNote\[1\]\/LegalMonetaryTotal\[1\]\/PayableAmount\[1\]/);
  assert.equal(findings[0].path, "/xml_values/0/value");
});

test("a CII date and quantity with non-XML spaces draw INV-065 once each", () => {
  const date = CII.match(/<udt:DateTimeString format="102">(\d{8})<\/udt:DateTimeString>/);
  const qty = CII.match(/<ram:BilledQuantity([^>]*)>([^<]+)<\/ram:BilledQuantity>/);
  assert.ok(date && qty);
  const xml = CII
    .replace(date[0], date[0].replace(date[1], `${date[1]}\u202F`))
    .replace(qty[0], `<ram:BilledQuantity${qty[1]}>\uFEFF${qty[2]}</ram:BilledQuantity>`);
  const findings = inv065(parseCiiInvoice(xml));
  assert.deepEqual(findings.map((f) => f.message.split(" ")[0]), ["DateTimeString", "BilledQuantity"]);
});

test("a no-break space inside a name or VAT number is not INV-065", () => {
  const xml = UBL.replace("<cbc:CompanyID>DE136695976</cbc:CompanyID>", "<cbc:CompanyID>DE136695976\u00A0</cbc:CompanyID>");
  assert.deepEqual(inv065(parseUblInvoice(xml)), []);
});

test("a JSON invoice with no xml_values draws none, and a bad row is skipped", () => {
  assert.deepEqual(inv065({ xml_values: [null, 3, { value: 1 }] }), []);
});
