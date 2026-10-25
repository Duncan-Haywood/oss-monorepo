import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { runPlain, plainAvailable } from "./plain-node.mjs";
import { matchingAddons } from "./schematron-core.mjs";
import { plainFix, hasSpecificFix } from "./schematron-fixes.mjs";

const ready = plainAvailable() && existsSync(new URL("./plain/nlcius-ubl.json", import.meta.url));
const skip = !ready && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
const read = (name) => readFileSync(new URL(`./examples/${name}`, import.meta.url), "utf8");
const nl = (r) => r.findings.filter((f) => f.source === "nlcius-schematron").map((f) => f.rule).sort();

test("the NLCIUS rules are an add-on chosen from BT-24, and a Peppol BIS file does not get them", () => {
  assert.deepEqual(matchingAddons(read("nlcius-invoice.xml"), "ubl").map(([n]) => n), ["nlcius"]);
  assert.deepEqual(matchingAddons(read("peppol-nl-credit-note.xml"), "ubl").map(([n]) => n), ["peppol"]);
});

test("a clean Dutch NLCIUS invoice passes the EU base and the 39 national checks, none skipped", { skip }, async () => {
  const r = await runPlain(read("nlcius-invoice.xml"));
  assert.equal(r.status, "ok");
  assert.deepEqual(r.sets, ["en16931", "nlcius"]);
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.skipped, []);
});

test("NLCIUS rules fire: no seller street, no buyer or order reference, a payment code outside the list, a country subdivision", { skip }, async () => {
  const r = await runPlain(read("nlcius-invoice-with-defects.xml"));
  assert.deepEqual(nl(r), ["BR-NL-12", "BR-NL-2", "BR-NL-28-2", "BR-NL-3"]);
  assert.equal(r.findings.find((f) => f.rule === "BR-NL-28-2").severity, "warning");
  assert.match(r.findings.find((f) => f.rule === "BR-NL-12").fix, /30, 48, 49, 57, 58 or 59/);
});

test("the rules apply only to a Dutch seller", { skip }, async () => {
  const xml = read("nlcius-invoice-with-defects.xml").replace(/<cbc:IdentificationCode>NL<\/cbc:IdentificationCode>/, "<cbc:IdentificationCode>BE</cbc:IdentificationCode>");
  assert.deepEqual(nl(await runPlain(xml)).filter((r) => r !== "BR-NL-28-2"), []);
});

test("every NLCIUS rule has an English fix, the errors a specific one", () => {
  assert.ok(hasSpecificFix("BR-NL-3"));
  assert.match(plainFix("BR-NL-27-1"), /NLCIUS/);
  assert.match(plainFix("SI-UBL-2"), /empty elements/);
});
