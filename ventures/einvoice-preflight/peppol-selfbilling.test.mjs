// Peppol BIS Self-Billing (the buyer issues the invoice for its supplier). Its BT-24 names
// peppol.eu, so until 2026-11-18 it got Peppol BIS Billing's rules, whose R004, R007 and
// P0112 (type code 389 outside Germany) reject every valid self-billing file. It now gets
// OpenPeppol's own Self-Billing set: 3.0.2 (in force 2026-08-17) and, when asked, 3.1.0
// (in force 2027-02-24). Write-up: eval/peppol-self-billing-2026-11-18.md.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runPlain, plainAvailable } from "./plain-node.mjs";
import { matchingAddons, plainOnlySets } from "./schematron-core.mjs";
import { preflightDocuments, isBlocking } from "./report.mjs";
import { inspectPeppolProfile } from "./profile.mjs";
import { parseUblInvoice } from "./ubl.mjs";

const skip = !plainAvailable() && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
const manifest = JSON.parse(readFileSync(new URL("./plain/manifest.json", import.meta.url), "utf8"));
const sb = readFileSync(new URL("./examples/peppol-self-billing-invoice.xml", import.meta.url), "utf8");
const cn = readFileSync(new URL("./examples/peppol-credit-note.xml", import.meta.url), "utf8");
const peppol = (r) => r.findings.filter((f) => /peppol/.test(f.source)).map((f) => `${f.rule}:${f.severity}${f.peppolNext ? ":new" : ""}`).sort();

test("both Self-Billing releases are built from OpenPeppol's release branches", () => {
  assert.equal(manifest.sets["peppol-sb-ubl"].commit, "bd9f24ed25cb32f46df9a12f234d3a80b20a699d");
  assert.equal(manifest.sets["peppol-sb-ubl"].checks, 62);
  assert.equal(manifest.sets["peppol-sb-next-ubl"].commit, "387676dae962c5b978f2dc1f805d20a3157c4fa3");
  assert.equal(manifest.sets["peppol-sb-next-ubl"].checks, 185);
});

test("a self-billing file gets the Self-Billing set, not Billing's, and goes to the plain route", () => {
  assert.deepEqual(matchingAddons(sb, "ubl").map(([n]) => n), ["peppol-sb"]);
  assert.deepEqual(matchingAddons(cn, "ubl").map(([n]) => n), ["peppol"]);
  assert.deepEqual(plainOnlySets(sb, "ubl"), ["peppol-sb"]);
  assert.deepEqual(plainOnlySets(sb, "ubl", { peppolNext: true }), ["peppol-sb", "peppol-sb-next"]);
  // The old A-NZ self-billing id is a PINT profile, not this set.
  const aunz = sb.replaceAll("poacc:selfbilling:3.0", "poacc:selfbilling:international:aunz:3.0");
  assert.deepEqual(matchingAddons(aunz, "ubl").map(([n]) => n).filter((n) => n === "peppol-sb"), []);
});

test("the example passes Self-Billing 3.0.2 and 3.1.0; Billing's rules would refuse it", { skip }, async () => {
  const now = await runPlain(sb);
  assert.ok(now.sets.includes("peppol-sb") && !now.sets.includes("peppol"), now.sets.join(" "));
  assert.deepEqual(peppol(now), []);
  const next = await runPlain(sb, { peppolNext: true });
  assert.ok(next.sets.includes("peppol-sb-next"), next.sets.join(" "));
  assert.deepEqual(peppol(next), []);
  const { reports } = await preflightDocuments([{ name: "sb.xml", source: sb }], { schematron: true });
  assert.deepEqual(reports[0].errors.filter(isBlocking).map((e) => e.rule), []);
});

test("Self-Billing's own rules still bite, with Self-Billing advice", { skip }, async () => {
  const billingId = sb.replaceAll(">urn:fdc:peppol.eu:2017:poacc:selfbilling:01:1.0<", ">urn:fdc:peppol.eu:2017:poacc:billing:01:1.0<");
  const r = await runPlain(billingId);
  assert.deepEqual(peppol(r), ["PEPPOL-EN16931-R007:fatal"]);
  assert.match(r.findings.find((f) => f.rule === "PEPPOL-EN16931-R007").fix, /selfbilling:01:1\.0/);
  const plainInvoice = await runPlain(sb.replace("<cbc:InvoiceTypeCode>389<", "<cbc:InvoiceTypeCode>380<"));
  assert.deepEqual(peppol(plainInvoice), ["PEPPOL-EN16931-P0100:fatal"]);
  assert.match(plainInvoice.findings.find((f) => f.rule === "PEPPOL-EN16931-P0100").fix, /389.*527/);
});

test("3.1.0 marks what 3.0.2 does not raise", { skip }, async () => {
  const gln = sb.replace('<cbc:EndpointID schemeID="0088">4012345000009<', '<cbc:EndpointID schemeID="0088">9482348239847239874<');
  assert.deepEqual(peppol(await runPlain(gln)), []);
  const next = await runPlain(gln, { peppolNext: true });
  assert.deepEqual(peppol(next), ["PEPPOL-COMMON-R040:fatal:new"]);
  assert.match(next.findings[0].message, /New in Peppol BIS Self-Billing 3\.1\.0, rejected from 2027-02-24; 3\.0\.2/);
});

test("a debit note sent as a UBL Invoice (383, or self-billed 527) is not a type mismatch", () => {
  for (const code of ["383", "527"]) {
    const inv = parseUblInvoice(sb.replace("<cbc:InvoiceTypeCode>389<", `<cbc:InvoiceTypeCode>${code}<`));
    assert.equal(inv.document_type, "debit_note");
  }
  assert.equal(parseUblInvoice(sb).document_type, "invoice");
});

test("the opt-in Peppol profile accepts the Self-Billing identifiers as a pair", () => {
  const base = { specification_id: "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:selfbilling:3.0", profile_id: "urn:fdc:peppol.eu:2017:poacc:selfbilling:01:1.0" };
  const ids = (inv) => inspectPeppolProfile(inv).map((f) => f.rule).filter((r) => r === "PP-001" || r === "PP-002");
  assert.deepEqual(ids(base), []);
  assert.deepEqual(ids({ ...base, profile_id: "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0" }), ["PP-001"]);
});
