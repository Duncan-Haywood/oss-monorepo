// A UAE volume-discount credit note names no preceding invoice (added 2026-11-14).
// PINT AE's ibr-055-ae requires BillingReference on a 381 credit note except when its
// reason code (BTAE-03, cac:DiscrepancyResponse/cbc:ResponseCode) is VD, and then
// forbids it: a period discount may cover many invoices. OpenPeppol's
// Volume-discount-credit-note.xml drew our INV-033 ("missing the original invoice")
// on every route. The credit notes here are made up from examples/peppol-credit-note.xml.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseUblInvoice } from "./ubl.mjs";
import { steppedAside } from "./aside.mjs";
import { preflightDocuments } from "./report.mjs";

const base = readFileSync(new URL("./examples/peppol-credit-note.xml", import.meta.url), "utf8");
const AE = "urn:peppol:pint:billing-1@ae-1";
const noReference = base.replace(/<cac:BillingReference>[\s\S]*?<\/cac:BillingReference>/, "");
const withSpec = (xml, id) => xml.replace(/<cbc:CustomizationID>[^<]*/, `<cbc:CustomizationID>${id}`);
const withReason = (xml, ...codes) => xml.replace(
  "<cbc:BuyerReference>",
  codes.map((c) => `<cac:DiscrepancyResponse><cbc:ResponseCode>${c}</cbc:ResponseCode></cac:DiscrepancyResponse>`).join("") + "<cbc:BuyerReference>",
);
const rules = async (xml) => {
  const { reports } = await preflightDocuments([{ name: "cn.xml", source: xml }]);
  return reports[0].errors.map((e) => e.rule);
};

test("the reader takes the header reason codes, not a line's", () => {
  const xml = withReason(noReference, "VD", "DL8.61.1.E")
    .replace("<cac:CreditNoteLine>", "<cac:CreditNoteLine><cac:DiscrepancyResponse><cbc:ResponseCode>XX</cbc:ResponseCode></cac:DiscrepancyResponse>");
  assert.deepEqual(parseUblInvoice(xml).credit_reason_codes, ["VD", "DL8.61.1.E"]);
  assert.equal(parseUblInvoice(base).credit_reason_codes, undefined);
});

test("INV-033 steps aside on a PINT AE credit note with reason VD", async () => {
  const vd = withSpec(withReason(noReference, "VD"), AE);
  assert.ok(steppedAside(parseUblInvoice(vd)).has("INV-033"));
  assert.ok(!(await rules(vd)).includes("INV-033"));
});

test("any header VD counts, as XPath's = does in ibr-055-ae", async () => {
  const vd = withSpec(withReason(noReference, "DL8.61.1.E", "VD"), AE);
  assert.ok(!(await rules(vd)).includes("INV-033"));
});

test("INV-033 still fires without VD, outside AE, or on a line-level VD only", async () => {
  assert.ok((await rules(withSpec(withReason(noReference, "DL8.61.1.E"), AE))).includes("INV-033"));
  assert.ok((await rules(withSpec(noReference, AE))).includes("INV-033"));
  assert.ok((await rules(withReason(noReference, "VD"))).includes("INV-033"), "EU Peppol BIS: VD means nothing");
  assert.ok((await rules(withSpec(withReason(noReference, "VD"), "urn:peppol:pint:billing-1@sg-1"))).includes("INV-033"));
  const lineOnly = withSpec(noReference, AE).replace(/<cac:CreditNoteLine>/, "<cac:CreditNoteLine><cac:DiscrepancyResponse><cbc:ResponseCode>VD</cbc:ResponseCode></cac:DiscrepancyResponse>");
  assert.ok((await rules(lineOnly)).includes("INV-033"));
});

test("a lower-case vd is not VD (the rule compares the string exactly)", async () => {
  assert.ok((await rules(withSpec(withReason(noReference, "vd"), AE))).includes("INV-033"));
});
