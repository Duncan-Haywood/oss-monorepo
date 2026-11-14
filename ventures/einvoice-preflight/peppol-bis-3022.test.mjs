// Peppol BIS Billing 3.0.21 (mandatory 2026-08-17) and the 3.0.22 hotfix (2026-11-04),
// compiled from OpenPEPPOL/peppol-bis-invoice-3 at 38d693d into plain/peppol-*.json on
// 2026-11-14. Until then the bundled add-on was 3.0.20 (261c458). Each test below is a
// case where the two releases give a different verdict; the made-up file is
// examples/peppol-credit-note.xml with one change. Write-up:
// eval/peppol-bis-3.0.22-2026-11-14.md.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runPlain, plainAvailable } from "./plain-node.mjs";
import { inspectPeppolProfile, isPeppolSpecification, PEPPOL_PROCESSES } from "./profile.mjs";

const skip = !plainAvailable() && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
const manifest = JSON.parse(readFileSync(new URL("./plain/manifest.json", import.meta.url), "utf8"));
const cn = readFileSync(new URL("./examples/peppol-credit-note.xml", import.meta.url), "utf8");
const inv = cn.replace(/CreditNote-2/g, "Invoice-2").replace(/<(\/?)CreditNote\b/g, "<$1Invoice")
  .replace(/CreditNoteTypeCode>381/g, "InvoiceTypeCode>380").replace(/CreditNoteTypeCode/g, "InvoiceTypeCode")
  .replace(/CreditNoteLine/g, "InvoiceLine").replace(/CreditedQuantity/g, "InvoicedQuantity");
const both = (xml, cc, vat) => xml.replace(/IdentificationCode>DE</g, `IdentificationCode>${cc}<`).replace(/DE136695976/g, vat);
const peppol = async (xml) => (await runPlain(xml)).findings.filter((f) => f.rule.startsWith("PEPPOL-") || /^[A-Z]{2}-R-/.test(f.rule));
const rules = async (xml) => [...new Set((await peppol(xml)).map((f) => `${f.rule}:${f.severity}`))].sort();

test("the bundled Peppol add-on is the 3.0.22 commit, all sets still listed in the manifest", () => {
  assert.equal(manifest.sets["peppol-ubl"].commit, "38d693d71d28d813781323a6ca97324edcc4d239");
  assert.equal(manifest.sets["peppol-ubl"].checks, 165);
  assert.equal(manifest.sets["peppol-cii"].checks, 91);
  // build-plain-rules.mjs used to overwrite the manifest with its own seven sets.
  assert.ok(manifest.sets["pint1-om-sb-jur-ubl"] && manifest.sets["zatca-ksa-ubl"] && manifest.sets["cius-pt-ubl"]);
});

test("the example and its invoice form are clean under 3.0.22", { skip }, async () => {
  assert.deepEqual(await rules(cn), []);
  assert.deepEqual(await rules(inv), []);
});

test("France's temporary profiles pass R007 (3.0.20 refused every one)", { skip }, async () => {
  for (const p of ["urn:peppol:france:billing:regulated", "urn:peppol:france:billing:non-regulated"]) {
    assert.deepEqual(await rules(cn.replace("urn:fdc:peppol.eu:2017:poacc:billing:01:1.0", p)), [], p);
  }
});

test("a billing:NN process other than 01 is refused by R007 (3.0.20 took any two digits)", { skip }, async () => {
  assert.deepEqual(await rules(cn.replace("billing:01:1.0", "billing:03:1.0")), ["PEPPOL-EN16931-R007:fatal"]);
});

test("a '::' version suffix on BT-24 is refused by R004", { skip }, async () => {
  assert.deepEqual(await rules(cn.replace("billing:3.0</cbc:Cust", "billing:3.0::2.1</cbc:Cust")), ["PEPPOL-EN16931-R004:fatal"]);
});

test("384 corrected invoice between two Slovak parties passes P0112; an Austrian pair still fails", { skip }, async () => {
  const sk = both(inv.replace("InvoiceTypeCode>380", "InvoiceTypeCode>384"), "SK", "SK2020317068");
  const at = both(inv.replace("InvoiceTypeCode>380", "InvoiceTypeCode>384"), "AT", "ATU13585627");
  assert.deepEqual(await rules(sk), []);
  assert.deepEqual(await rules(at), ["PEPPOL-EN16931-P0112:fatal"]);
});

test("389 self-billed outside Germany now fails P0112 as well as P0100", { skip }, async () => {
  const be = both(inv.replace("InvoiceTypeCode>380", "InvoiceTypeCode>389"), "BE", "BE0123456749");
  assert.deepEqual(await rules(be), ["PEPPOL-EN16931-P0100:fatal", "PEPPOL-EN16931-P0112:fatal"]);
});

test("a Danish P number (0096) that is not ten digits is now an error, not a warning", { skip }, async () => {
  const xml = cn.replace('<cbc:EndpointID schemeID="0088">4012345000009</cbc:EndpointID>', '<cbc:EndpointID schemeID="0096">12345678</cbc:EndpointID>');
  assert.deepEqual(await rules(xml), ["PEPPOL-COMMON-R052:fatal"]);
});

test("a Dutch KVK number (0106) that is not eight digits draws the new R054 warning", { skip }, async () => {
  const xml = cn.replace('<cbc:EndpointID schemeID="0088">4012345000009</cbc:EndpointID>', '<cbc:EndpointID schemeID="0106">1234567</cbc:EndpointID>');
  assert.deepEqual(await rules(xml), ["PEPPOL-COMMON-R054:warning"]);
});

test("BGN is out of Peppol's currency list (CL007); the EU base already refused it", { skip }, async () => {
  const r = await rules(cn.replace(/"EUR"/g, '"BGN"').replace(/>EUR</g, ">BGN<"));
  assert.ok(r.includes("PEPPOL-EN16931-CL007:fatal"), r.join(" "));
});

test("the JSON route's PP-001 and PP-002 follow the same R007 and R004", () => {
  const base = {
    invoice_number: "INV-1", issue_date: "2026-11-14", currency: "EUR", buyer_reference: "PO-1",
    profile_id: "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
    specification_id: "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0",
    supplier: { name: "S", endpoint: { scheme: "0088", id: "5790000435975" } },
    customer: { name: "B", endpoint: { scheme: "0088", id: "4012345000009" } },
  };
  const ids = (patch) => inspectPeppolProfile({ ...base, ...patch }).map((f) => f.rule);
  assert.equal(PEPPOL_PROCESSES.length, 4);
  for (const p of PEPPOL_PROCESSES) assert.deepEqual(ids({ profile_id: p }), [], p);
  assert.deepEqual(ids({ profile_id: "urn:fdc:peppol.eu:2017:poacc:billing:03:1.0" }), ["PP-001"]);
  assert.deepEqual(ids({ specification_id: base.specification_id + "::2.1" }), ["PP-002"]);
  assert.match(inspectPeppolProfile({ ...base, specification_id: base.specification_id + "::2.1" })[0].message, /'::'/);
  assert.ok(isPeppolSpecification(base.specification_id + "#conformant#urn:example:extension"));
});

// plain-compile.mjs pasted pattern-level <let>s into rule contexts, where their relative
// paths started from the Invoice element instead of the document node, so the Danish
// and Icelandic rules, whose country lets read ubl-invoice:Invoice/..., never fired.
test("Danish rules fire on a Danish seller and buyer (they were silent before the let fix)", { skip }, async () => {
  const dk = both(cn, "DK", "DK12345674").replace('<cbc:CompanyID>DK12345674</cbc:CompanyID>', '<cbc:CompanyID schemeID="0088">DK12345674</cbc:CompanyID>');
  const r = (await rules(dk)).filter((x) => x.startsWith("DK-R-"));
  assert.ok(r.length > 0, "no DK-R rule fired");
});

test("Icelandic rules fire on an Icelandic seller (IS-R-002)", { skip }, async () => {
  const is = cn.replace("<cbc:IdentificationCode>DE</cbc:IdentificationCode>", "<cbc:IdentificationCode>IS</cbc:IdentificationCode>");
  assert.ok((await rules(is)).includes("IS-R-002:fatal"));
});

test("the compiler roots a relative schema or pattern let and leaves constants alone", async () => {
  const { fromRoot } = await import("./plain-compile.mjs");
  assert.equal(fromRoot("concat(ubl-invoice:Invoice/cac:X, 'a')"), "root(.)/(concat(ubl-invoice:Invoice/cac:X, 'a'))");
  assert.equal(fromRoot("'^[A-Z]{2}$'"), "'^[A-Z]{2}$'");
  assert.equal(fromRoot("/*/cbc:ID"), "/*/cbc:ID");
  assert.equal(fromRoot("u:gln(.)"), "u:gln(.)");
});
