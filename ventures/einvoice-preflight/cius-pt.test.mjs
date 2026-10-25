import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { runPlain, plainAvailable } from "./plain-node.mjs";
import { matchingAddons } from "./schematron-core.mjs";
import { plainFix } from "./schematron-fixes.mjs";

const ready = plainAvailable() && existsSync(new URL("./plain/cius-pt-ubl.json", import.meta.url));
const skip = !ready && "npm i --no-save slimdom fontoxpath (rules are in ./plain/)";
const read = (name) => readFileSync(new URL(`./examples/${name}`, import.meta.url), "utf8");
const pt = (r) => r.findings.filter((f) => f.source === "cius-pt-schematron").map((f) => f.rule).sort();
const sample = read("pt-invoice.xml");

test("the Portuguese rules are an add-on chosen from BT-24, for UBL only", () => {
  assert.deepEqual(matchingAddons(sample, "ubl").map(([n]) => n), ["cius-pt"]);
  assert.deepEqual(matchingAddons(sample, "cii"), []);
});

test("a clean Portuguese invoice passes the EU base and the CIUS-PT checks, none skipped", { skip }, async () => {
  const r = await runPlain(sample);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.sets, ["en16931", "cius-pt"]);
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.skipped, []);
});

test("number formats: a VAT rate needs two decimals, a remittance reference its #REFERENCE@ATMPAYMENT# frame", { skip }, async () => {
  assert.deepEqual(pt(await runPlain(sample.replace("<cbc:Percent>23.00</cbc:Percent>", "<cbc:Percent>23</cbc:Percent>"))), ["DT-CIUS-PT-106.1"]);
  assert.deepEqual(pt(await runPlain(sample.replace("#REFERENCE@ATMPAYMENT#FT 2026/0042#", "FT 2026/0042"))), ["DT-CIUS-PT-080"]);
});

test("a missing Deliver to group, missing VAT identifiers and an unreferenced debit note are caught", { skip }, async () => {
  assert.deepEqual(pt(await runPlain(sample.replace(/<cac:Delivery>[\s\S]*?<\/cac:Delivery>\n/, ""))), ["BR-CIUS-PT-66"]);
  const noSeller = sample.replace(/<cac:PartyTaxScheme>\s*<cbc:CompanyID>PT123456789[\s\S]*?<\/cac:PartyTaxScheme>/, "");
  assert.deepEqual(pt(await runPlain(noSeller)), ["BR-CIUS-PT-01", "BR-CIUS-PT-02"]);
  assert.deepEqual(pt(await runPlain(sample.replace("<cbc:InvoiceTypeCode>380<", "<cbc:InvoiceTypeCode>383<"))), ["BR-CIUS-PT-65"]);
});

test("every Portuguese rule gets an English fix", () => {
  assert.match(plainFix("BR-CIUS-PT-01"), /NIF/);
  assert.match(plainFix("DT-CIUS-PT-106.1"), /Portugal/);
});

test("a Portuguese-only VAT category code fails the EU list, and the finding says the profile accepts it", { skip }, async () => {
  for (const code of ["AA", "RED", "INT", "NOR"]) {
    const r = await runPlain(sample.replaceAll("<cbc:ID>S</cbc:ID>", `<cbc:ID>${code}</cbc:ID>`));
    const cl = r.findings.filter((f) => f.rule === "BR-CL-17" || f.rule === "BR-CL-18");
    assert.ok(cl.length >= 2, code);
    for (const f of cl) assert.match(f.fix, /CIUS-PT, whose own rules accept AA, RED, INT/);
  }
  const eu = await runPlain(sample.replace("CIUS-PT:2.1.1", "xx").replaceAll("<cbc:ID>S</cbc:ID>", "<cbc:ID>AA</cbc:ID>"));
  for (const f of eu.findings.filter((f) => f.rule === "BR-CL-18")) assert.doesNotMatch(f.fix, /CIUS-PT/);
});
