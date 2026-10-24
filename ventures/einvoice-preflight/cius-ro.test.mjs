import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { runPlain, plainAvailable } from "./plain-node.mjs";
import { matchingAddons } from "./schematron-core.mjs";
import { plainFix, hasSpecificFix } from "./schematron-fixes.mjs";

const ready = plainAvailable() && existsSync(new URL("./plain/cius-ro-ubl.json", import.meta.url));
const skip = !ready && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
const read = (name) => readFileSync(new URL(`./examples/${name}`, import.meta.url), "utf8");
const ro = (r) => r.findings.filter((f) => f.source === "cius-ro-schematron").map((f) => f.rule).sort();

test("the Romanian rules are an add-on chosen from BT-24, for UBL only", () => {
  assert.deepEqual(matchingAddons(read("ro-invoice.xml"), "ubl").map(([n]) => n), ["cius-ro"]);
  assert.deepEqual(matchingAddons(read("ro-invoice.xml"), "cii"), []);
  assert.deepEqual(matchingAddons(read("ubl-invoice.xml"), "ubl").map(([n]) => n), ["xrechnung"]);
});

test("a clean Romanian RON invoice passes the EU base and the 122 national checks, none skipped", { skip }, async () => {
  const r = await runPlain(read("ro-invoice.xml"));
  assert.equal(r.status, "ok");
  assert.deepEqual(r.sets, ["en16931", "cius-ro"]);
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.skipped, []);
});

test("Romanian rules fire: date format, invoice number, profile id, VAT currency, Bucharest city and county", { skip }, async () => {
  const r = await runPlain(read("ro-invoice-with-defects.xml"));
  assert.deepEqual(ro(r), ["BR-RO-001", "BR-RO-010", "BR-RO-030", "BR-RO-110", "BR-RO-DT001"]);
  const f = r.findings.find((x) => x.rule === "BR-RO-030");
  assert.match(f.message, /^If the Invoice currency code/, "the English half of the bilingual message is shown");
  assert.match(f.fix, /RON/);
});

test("a Romanian invoice with no buyer street address draws BR-RO-082", { skip }, async () => {
  const xml = read("ro-invoice.xml").replace("<cbc:StreetName>Bd. Demonstrativ 22</cbc:StreetName>", "");
  assert.deepEqual(ro(await runPlain(xml)), ["BR-RO-082"]);
});

test("every Romanian rule has an English fix, and the common ones a specific one", () => {
  assert.ok(hasSpecificFix("BR-RO-082"));
  assert.match(plainFix("BR-RO-L201"), /Romania/);
  assert.match(plainFix("BR-RO-DT002"), /YYYY-MM-DD/);
  assert.match(plainFix("BR-DEC-RO-12"), /two decimals/);
});
