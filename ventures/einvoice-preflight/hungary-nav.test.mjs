import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { checkNavInvoice, checkNavInvoiceData, huTaxpayerIdOk, looksLikeNavInvoice } from "./hungary-nav.mjs";
import { base64Bytes, sha3_512Hex } from "./sha3.mjs";
import { preflightDocuments } from "./report.mjs";

// NAV's own sample files (MIT, fixtures/hungary-nav/README.md).
const read = (f) => readFileSync(new URL(`./fixtures/hungary-nav/${f}`, import.meta.url), "utf8");
const foreign = read("foreign-currency.xml");
const simplified = read("simplified.xml");
const modification = read("modification.xml");
const several = read("several-vat-types.xml");
const request = read("manageInvoice.xml");
const rules = (xml) => checkNavInvoice(xml).findings.map((f) => f.rule).sort();

test("NAV's clean samples are recognised and pass", () => {
  for (const xml of [foreign, simplified, modification]) {
    assert.ok(looksLikeNavInvoice(xml));
    assert.deepEqual(checkNavInvoice(xml).findings, []);
  }
  assert.ok(!looksLikeNavInvoice('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/>'));
  assert.equal(checkNavInvoice(modification).meta.modification, true);
  assert.equal(checkNavInvoice(simplified).meta.category, "SIMPLIFIED");
});

test("the two summary typos in NAV's several-VAT-types sample are found, nothing else", () => {
  const f = checkNavInvoice(several).findings;
  assert.deepEqual(f.map((x) => x.rule).sort(), ["HU-023", "HU-025"]);
  assert.ok(f.every((x) => x.severity === "warning"));
  assert.ok(f.some((x) => /3068000\.00/.test(x.message) && /306800\.00/.test(x.message)));
  assert.ok(f.some((x) => /reverse/.test(x.message) && /500000\.00/.test(x.message)));
});

test("line arithmetic outside NAV's 1% tolerance is a warning; inside it is not", () => {
  const within = foreign.replace("<lineNetAmount>3000.00<", "<lineNetAmount>3020.00<");
  assert.ok(!rules(within).includes("HU-020"));
  const beyond = foreign.replace("<lineNetAmount>3000.00<", "<lineNetAmount>3400.00<");
  const r = rules(beyond);
  for (const rule of ["HU-020", "HU-022", "HU-023", "HU-024"]) assert.ok(r.includes(rule), rule);
});

test("exchange-rate rules: HUF takes 1, EUR must sit in NAV's band", () => {
  assert.ok(rules(simplified.replace(/<exchangeRate>[^<]+</, "<exchangeRate>1.5<")).includes("HU-012"));
  const perHundred = checkNavInvoice(foreign.replace("<exchangeRate>310.00<", "<exchangeRate>3.10<")).findings;
  assert.ok(perHundred.some((f) => f.rule === "HU-012" && /250-600/.test(f.message)));
});

test("VAT rate lists by date and invoice type", () => {
  assert.ok(rules(foreign.replace("<vatPercentage>0.27<", "<vatPercentage>0.21<")).includes("HU-005"));
  assert.ok(rules(foreign.replace("<vatPercentage>0.27<", "<vatPercentage>0.25<")).includes("HU-005"));
  assert.ok(rules(simplified.replace("<vatContent>0.2126</vatContent>", "<vatPercentage>0.27</vatPercentage>")).includes("HU-006"));
  // 0% is valid only on supplies from 2024; the sample's delivery date is 2021.
  assert.ok(checkNavInvoice(foreign.replace("<vatPercentage>0.05<", "<vatPercentage>0<")).findings.some((f) => f.rule === "HU-005" && /2024/.test(f.message)));
});

test("customer rules: a private person carries no name; KBAET needs OTHER", () => {
  assert.ok(rules(foreign.replace("<customerVatStatus>DOMESTIC<", "<customerVatStatus>PRIVATE_PERSON<")).includes("HU-008"));
  const kbaet = several.replace(/<vatExemption>\s*<case>TAM</, "<vatExemption><case>KBAET<");
  assert.ok(rules(kbaet).includes("HU-009"));
});

test("line structure: numbering, OWN units, mandatory content", () => {
  assert.ok(rules(foreign.replace("<lineNumber>2<", "<lineNumber>3<")).includes("HU-002"));
  assert.ok(rules(foreign.replace("<unitOfMeasureOwn>dkg</unitOfMeasureOwn>", "")).includes("HU-015"));
  assert.ok(rules(foreign.replace("<quantity>1500.00</quantity>", "")).includes("HU-004"));
});

test("modifying documents: lineModificationReference both ways, MODIFY lines, same number", () => {
  assert.ok(rules(modification.replace(/<lineModificationReference>[\s\S]*?<\/lineModificationReference>/, "")).includes("HU-017"));
  const mod = modification.replace("<lineOperation>CREATE<", "<lineOperation>MODIFY<");
  assert.ok(rules(mod).includes("HU-017"));
  const orig = /<originalInvoiceNumber>([^<]+)</.exec(modification)[1];
  const same = modification.replace(/<invoiceNumber>[^<]+</, `<invoiceNumber>${orig}<`);
  assert.ok(rules(same).includes("HU-013"));
});

test("tax-number check digit (CDV)", () => {
  assert.ok(huTaxpayerIdOk("99999999"));
  assert.ok(huTaxpayerIdOk("99887764"));
  assert.ok(!huTaxpayerIdOk("99887765"));
  assert.ok(!huTaxpayerIdOk("9988776"));
  const f = checkNavInvoice(foreign.replace("<base:taxpayerId>99887764<", "<base:taxpayerId>99887765<")).findings;
  assert.ok(f.some((x) => x.rule === "HU-018"));
  assert.ok(f.every((x) => !x.message.includes("99887765")), "never repeats the tax number");
});

test("a cut-off file is reported, not misread", () => {
  assert.deepEqual(rules(foreign.slice(0, 3000)), ["HU-001"]);
});

test("SHA3-512 and Base64 agree with node:crypto", () => {
  for (let i = 0; i < 60; i++) {
    const b = randomBytes((i * 37) % 400);
    assert.equal(sha3_512Hex(b), createHash("sha3-512").update(b).digest("hex"));
    assert.deepEqual(Buffer.from(base64Bytes(b.toString("base64"))), b);
  }
  assert.throws(() => base64Bytes("not base64!"));
});

test("NAV's manageInvoice sample: three Base64 operations, electronicInvoiceHash verifies on all three", () => {
  const r = checkNavInvoice(request);
  assert.equal(r.meta.operations, 3);
  assert.ok(!r.findings.some((f) => f.rule === "HU-016"));
  // The sample's placeholder data uses 0.25 on a 2020 delivery: NAV's current list refuses it.
  assert.ok(r.findings.every((f) => f.rule === "HU-005"));
  const tampered = request.replace(/(<electronicInvoiceHash cryptoType="SHA3-512">)0/, "$11");
  assert.ok(checkNavInvoice(tampered).findings.some((f) => f.rule === "HU-016" && /does not match/.test(f.message)));
  const lower = request.replace(/(<electronicInvoiceHash cryptoType="SHA3-512">)([0-9A-F]+)/, (m, a, h) => a + h.toLowerCase());
  assert.ok(checkNavInvoice(lower).findings.some((f) => f.rule === "HU-016" && /lower case/.test(f.message)));
  const sha256 = request.replace('<electronicInvoiceHash cryptoType="SHA3-512">', '<electronicInvoiceHash cryptoType="SHA-256">');
  assert.ok(checkNavInvoice(sha256).findings.some((f) => f.rule === "HU-016" && /SHA3-512/.test(f.message)));
});

test("an operation flag that disagrees with the reference", () => {
  const b64 = Buffer.from(modification).toString("base64");
  const req = `<ManageInvoiceRequest xmlns="http://schemas.nav.gov.hu/OSA/3.0/api"><invoiceOperations><compressedContent>false</compressedContent><invoiceOperation><index>1</index><invoiceOperation>CREATE</invoiceOperation><invoiceData>${b64}</invoiceData></invoiceOperation></invoiceOperations></ManageInvoiceRequest>`;
  assert.ok(checkNavInvoice(req).findings.some((f) => f.rule === "HU-017" && /INVOICE_REFERENCE_NOT_EXPECTED/.test(f.message)));
  const data = checkNavInvoiceData(foreign, { operation: "MODIFY" });
  assert.ok(data.findings.some((f) => /INVOICE_REFERENCE_EXPECTED/.test(f.message)));
});

test("the batch report reads a NAV file as Hungarian, not EN 16931", async () => {
  const res = await preflightDocuments([{ name: "nav.xml", source: several }, { name: "req.xml", source: request }]);
  assert.match(res.reports[0].envelope, /NAV Online Számla 3\.0 invoice data report, NORMAL/);
  assert.deepEqual(res.reports[0].errors.map((e) => e.rule).sort(), ["HU-023", "HU-025"]);
  assert.match(res.reports[1].envelope, /manageInvoice request \(3 operations\)/);
});
