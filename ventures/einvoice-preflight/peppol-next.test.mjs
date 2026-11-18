// Peppol BIS Billing 3.1.0 (published 2026-11-23, in force from 2027-02-24), compiled from
// OpenPEPPOL/peppol-bis-invoice-3 branch 2026-Q4-QA2 at 90f078a into plain/peppol-next-*.json,
// runs in place of 3.0.22 when asked (peppolNext: true; ?peppol=next; the page's checkbox).
// Each finding 3.0.22 does not raise is marked. Write-up: eval/peppol-bis-3.1.0-2026-11-18.md.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runPlain, plainAvailable } from "./plain-node.mjs";
import { PEPPOL_NEXT, plainOnlySets } from "./schematron-core.mjs";

const skip = !plainAvailable() && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
const manifest = JSON.parse(readFileSync(new URL("./plain/manifest.json", import.meta.url), "utf8"));
const cn = readFileSync(new URL("./examples/peppol-credit-note.xml", import.meta.url), "utf8");
const ENDPOINT = '<cbc:EndpointID schemeID="0088">4012345000009</cbc:EndpointID>';
const VAT = "<cbc:CompanyID>DE136695976</cbc:CompanyID>";
const peppol = (r) => r.findings.filter((f) => /peppol/.test(f.source)).map((f) => `${f.rule}:${f.severity}${f.peppolNext ? ":new" : ""}`).sort();
const next = async (xml) => peppol(await runPlain(xml, { peppolNext: true }));
const now = async (xml) => peppol(await runPlain(xml));

test("3.1.0 is in the manifest beside 3.0.22, from the release branch", () => {
  assert.equal(PEPPOL_NEXT.release, "3.1.0");
  assert.equal(PEPPOL_NEXT.mandatory, "2027-02-24");
  assert.equal(manifest.sets["peppol-next-ubl"].commit, "90f078a801c865b78bd9af628d7cd8a69aecfe84");
  assert.equal(manifest.sets["peppol-next-ubl"].checks, 294);
  assert.equal(manifest.sets["peppol-next-cii"].checks, 95);
  assert.equal(manifest.sets["peppol-ubl"].commit, "38d693d71d28d813781323a6ca97324edcc4d239");
});

test("only a Peppol file asked to preview 3.1.0 is sent to the plain route for it", () => {
  assert.deepEqual(plainOnlySets(cn, "ubl"), []);
  assert.deepEqual(plainOnlySets(cn, "ubl", { peppolNext: true }), ["peppol-next"]);
  const plainEu = cn.replace("urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0", "urn:cen.eu:en16931:2017");
  assert.deepEqual(plainOnlySets(plainEu, "ubl", { peppolNext: true }), []);
});

test("the example is clean under both releases, and 3.1.0 replaces 3.0.22 only when asked", { skip }, async () => {
  const asked = await runPlain(cn, { peppolNext: true });
  assert.ok(asked.sets.includes("peppol-next") && !asked.sets.includes("peppol"), asked.sets.join(" "));
  assert.ok((await runPlain(cn)).sets.includes("peppol"));
  assert.ok(!(await runPlain(cn)).sets.includes("peppol-next"));
  assert.deepEqual(await now(cn), []);
  assert.deepEqual(await next(cn), []);
});

test("R058: a Luxembourg VAT number's check digits are its first six digits mod 89, zero-padded", { skip }, async () => {
  const lu = (v) => cn.replace(VAT, `<cbc:CompanyID>${v}</cbc:CompanyID>`);
  assert.deepEqual(await next(lu("LU00000101")), []); // 1 mod 89 = 01: fontoxpath's format-integer gave "1"
  assert.deepEqual(await next(lu("LU98765421")), []);
  assert.deepEqual(await next(lu("LU00000102")), ["PEPPOL-COMMON-R058:warning:new"]);
  assert.deepEqual(await now(lu("LU00000102")), []);
});

test("R040: scheme 0088 takes a 13-digit GLN only, as OpenPeppol's own 3.0.22 examples did not", { skip }, async () => {
  const xml = cn.replace(ENDPOINT, '<cbc:EndpointID schemeID="0088">9482348239847239874</cbc:EndpointID>');
  assert.deepEqual(await now(xml), []);
  assert.deepEqual(await next(xml), ["PEPPOL-COMMON-R040:fatal:new"]);
  const message = (await runPlain(xml, { peppolNext: true })).findings.find((f) => f.rule === "PEPPOL-COMMON-R040").message;
  assert.match(message, /New in Peppol BIS 3\.1\.0, rejected from 2027-02-24/);
});

test("R054: a Dutch KVK number that is not eight digits goes from warning to error", { skip }, async () => {
  const xml = cn.replace(ENDPOINT, '<cbc:EndpointID schemeID="0106">1234567</cbc:EndpointID>');
  assert.deepEqual(await now(xml), ["PEPPOL-COMMON-R054:warning"]);
  assert.deepEqual(await next(xml), ["PEPPOL-COMMON-R054:fatal:new"]);
});

test("R043: a Belgian enterprise number (0208) must also start with 0 or 1", { skip }, async () => {
  const be = (v) => cn.replace(ENDPOINT, `<cbc:EndpointID schemeID="0208">${v}</cbc:EndpointID>`);
  assert.deepEqual(await next(be("0403170701")), []); // 97 - (04031707 mod 97) = 01
  assert.deepEqual(await now(be("2403170743")), []); // mod 97 holds, so 3.0.22 accepts it
  assert.deepEqual(await next(be("2403170743")), ["PEPPOL-COMMON-R043:fatal:new"]);
  // a mod-97 failure was already fatal: not marked new
  assert.deepEqual(await next(be("0403170702")), ["PEPPOL-COMMON-R043:fatal"]);
});

test("the page offers the 3.1.0 box, passes it to the official rules, and names pasted XML .xml", () => {
  const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="peppolNext"/);
  assert.match(page, /addOfficialFindings\(result, inputs, \{ profile, peppolNext \}\)/);
  // a pasted UBL/CII file named pasted.json was skipped by addOfficialFindings (/\.json$/)
  assert.match(page, /"pasted\.xml" : "pasted\.json"/);
});
