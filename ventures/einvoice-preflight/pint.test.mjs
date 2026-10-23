import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { runPlain, plainAvailable } from "./plain-node.mjs";
import { matchingProfile } from "./schematron-core.mjs";

const ready = plainAvailable() && existsSync(new URL("./plain/pint-sg-billing3-ubl.json", import.meta.url));
const skip = !ready && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
const read = (name) => readFileSync(new URL(`./examples/${name}`, import.meta.url), "utf8");
const rules = (r) => r.findings.map((f) => f.rule).sort();

test("the profile is picked from BT-24, and only for UBL", () => {
  assert.equal(matchingProfile(read("pint-sg-invoice.xml"), "ubl")[0], "pint-sg");
  assert.equal(matchingProfile(read("pint-aunz-invoice.xml"), "ubl")[0], "pint-aunz");
  assert.equal(matchingProfile(read("pint-aunz-invoice.xml").replace("billing:international", "selfbilling:international"), "ubl")[0], "pint-aunz-sb");
  assert.equal(matchingProfile(read("pint-sg-invoice.xml"), "cii"), null);
  assert.equal(matchingProfile(read("peppol-credit-note.xml"), "ubl"), null);
});

test("a clean Singapore invoice with GST category SR passes, and the EU base rules do not run on it", { skip }, async () => {
  const r = await runPlain(read("pint-sg-invoice.xml"));
  assert.equal(r.status, "ok");
  assert.deepEqual(r.sets, ["pint-sg"]);
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.skipped, [], "every rule was evaluated");
});

test("Singapore GST rules fire: a bad UUID and an NG breakdown that carries GST", { skip }, async () => {
  const r = await runPlain(read("pint-sg-invoice-with-defects.xml"));
  assert.deepEqual(rules(r), ["BR-109-GST-SG", "BR-CO-17-GST-SG", "BR-NG-08-GST-SG", "BR-NG-09-GST-SG", "BR-NG-12-GST-SG"]);
  assert.equal(r.findings.find((f) => f.rule === "BR-109-GST-SG").source, "pint-sg-schematron");
  assert.match(r.findings.find((f) => f.rule === "BR-109-GST-SG").path, /UUID/);
});

test("the profile id is matched as a prefix, as the PINT rule itself does", { skip }, async () => {
  const r = await runPlain(read("pint-sg-invoice.xml").replace("billing:international:sg:3.0", "billing:international:sg:3.0.1"));
  assert.ok(!rules(r).includes("PEPPOL-EN16931-R004-SG"), "a longer id still starts with the required text");
});

test("a clean Australia/New Zealand invoice passes; the ABN rules fire on a missing and a wrong ABN", { skip }, async () => {
  const xml = read("pint-aunz-invoice.xml");
  const clean = await runPlain(xml);
  assert.deepEqual(clean.sets, ["pint-aunz"]);
  assert.deepEqual(clean.findings, []);
  assert.deepEqual(clean.skipped, []);
  const noAbn = await runPlain(xml.replace('<cbc:CompanyID schemeID="0151">53004085616</cbc:CompanyID>', ""));
  assert.ok(rules(noAbn).includes("AUNZ-R-004"));
  const badAbn = await runPlain(xml.replaceAll("53004085616", "53004085617"));
  assert.ok(rules(badAbn).includes("PEPPOL-COMMON-R050"));
});

test("ordinary Peppol BIS and XRechnung files keep the EU base and add-ons", { skip }, async () => {
  const r = await runPlain(read("peppol-credit-note.xml"));
  assert.deepEqual(r.sets, ["en16931", "peppol"]);
});
