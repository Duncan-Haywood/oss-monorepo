import { checkDigit as mexicoCheckDigit } from "./mexico.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "./checks.mjs";
import { inspectPartyVat, looksLikeCompleteVat, normalizeVat } from "./vat.mjs";

function invoice({ supplierId = "S1", customerId = "C1", supplierVat, customerVat } = {}) {
  const supplier = { id: supplierId, name: "Supplier GmbH" };
  const customer = { id: customerId, name: "Customer GmbH" };
  if (supplierVat !== undefined) supplier.vat_id = supplierVat;
  if (customerVat !== undefined) customer.vat_id = customerVat;
  return {
    invoice_number: "INV-1",
    issue_date: "2026-08-24",
    currency: "EUR",
    supplier,
    customer,
    lines: [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 19, net: 200 }],
    totals: { net: 200, tax: 38, gross: 238 },
  };
}

test("normalizeVat strips separators", () => {
  assert.equal(normalizeVat("de 136 695 976"), "DE136695976");
  assert.equal(normalizeVat("AT-U-12345675"), "ATU12345675");
  assert.equal(normalizeVat("   "), null);
  assert.equal(normalizeVat(null), null);
});

test("short internal ids are not complete VAT numbers", () => {
  assert.equal(looksLikeCompleteVat("S1"), false);
  assert.equal(looksLikeCompleteVat("DE123"), false);
  assert.equal(looksLikeCompleteVat("DE456"), false);
  assert.equal(looksLikeCompleteVat("DE136695976"), true);
  assert.equal(looksLikeCompleteVat("de 136 695 976"), true);
});

test("valid published VAT shapes produce no finding", () => {
  const valid = [
    "DE136695976",
    "ATU12345675",
    "FR40303265045",
    "BE0411905847",
    "NL123456782B01",
    "IT00743110157",
    "PL5260250274",
    "SE556188740601",
    "DK13585628",
    "FI09853608",
    "PT502757191",
    "LU15027442",
    "IE6433435F",
    "GB434031494",
    "ESA58818501",
  ];
  for (const number of valid) {
    assert.deepEqual(inspectPartyVat({ id: "S1", name: "A", vat_id: number }, "supplier"), []);
    assert.deepEqual(checkInvoice(invoice({ supplierVat: number })), []);
  }
});

test("checksum failure does not echo the number", () => {
  const findings = inspectPartyVat({ id: "S1", name: "A", vat_id: "DE136695977" }, "supplier");
  assert.deepEqual(findings.map((item) => item.rule), ["INV-023"]);
  assert.equal(findings[0].path, "/supplier/vat_id");
  assert.equal(findings[0].message.includes("136695977"), false);
  assert.equal(findings[0].fix.includes("136695977"), false);
  assert.match(findings[0].message, /checksum/i);
});

test("NL elfproef weighs the check digit at -1, not +1", () => {
  // 9*1+8*2+7*3+6*4+5*5+4*6+3*7+2*8-1*2 = 154, divisible by 11: a genuine
  // valid Dutch VAT number under the real elfproef.
  assert.deepEqual(inspectPartyVat({ id: "S1", name: "A", vat_id: "NL123456782B01" }, "supplier"), []);
  // Same 8 digits, wrong check digit: 156 - 3 = 153, not divisible by 11.
  const findings = inspectPartyVat({ id: "S1", name: "A", vat_id: "NL123456783B01" }, "supplier");
  assert.deepEqual(findings.map((item) => item.rule), ["INV-023"]);
  // The old code weighed the check digit at +1 instead of -1, so it summed
  // to 158 (not 154) for .782 — 158 % 11 = 4, which it read as invalid. It
  // rejected a genuinely valid Dutch VAT number outright, on the very
  // example the Dutch tax authority format uses.
});

test("IE legacy letter-second-character shape rearranges before weighing", () => {
  // The 8-character Irish shape covers two different real numbers: the
  // common one is 7 digits plus a check letter (already covered by
  // IE6433435F above); the legacy one is a digit, a letter, 5 digits, and a
  // check letter -- e.g. "8Z49289F". Revenue's own check-digit definition
  // does not weigh a legacy number as typed. It first rearranges it to
  // "0" + the middle 5 digits + the leading digit, *then* applies the same
  // weights [8,7,6,5,4,3,2] mod 23: "0" + "49289" + "8" = "0492898" ->
  // 0*8+4*7+9*6+2*5+8*4+9*3+8*2 = 167, 167 % 23 = 6 -> "F" (0 is "W", so 6
  // is the 7th letter after it: "F").
  assert.deepEqual(inspectPartyVat({ id: "S1", name: "A", vat_id: "IE8Z49289F" }, "supplier"), []);
  // Same number, wrong check letter.
  const findings = inspectPartyVat({ id: "S1", name: "A", vat_id: "IE8Z49289X" }, "supplier");
  assert.deepEqual(findings.map((item) => item.rule), ["INV-023"]);
  // The old code spliced a literal "7" in for the letter and left the
  // leading digit in place instead of moving it to the end -- it computed a
  // checksum for "872492898"->"8749289" (never rearranged, never prepended a
  // "0"), landing on weighted sum 232, 232 % 23 = 2 -> "B". Every genuinely
  // valid legacy-format Irish VAT number therefore failed this check.
});

test("explicit wrong shape is format not checksum", () => {
  const findings = inspectPartyVat({ id: "S1", name: "A", vat_id: "DE123" }, "customer");
  assert.deepEqual(findings.map((item) => item.rule), ["INV-022"]);
  assert.equal(findings[0].path, "/customer/vat_id");
  assert.equal(findings[0].message.includes("DE123"), false);
});

test("unrecognized prefix on explicit vat_id is INV-022", () => {
  const findings = inspectPartyVat({ id: "S1", name: "A", vat_id: "XX123456789" }, "supplier");
  assert.deepEqual(findings.map((item) => item.rule), ["INV-022"]);
});

test("complete VAT in id is checked without treating short ids as VAT", () => {
  assert.deepEqual(checkInvoice(invoice({ supplierId: "DE136695976" })), []);
  const errors = checkInvoice(invoice({ supplierId: "DE136695977" }));
  assert.ok(errors.some((error) => error.rule === "INV-023" && error.path === "/supplier/id"));
  assert.deepEqual(checkInvoice(invoice({ supplierId: "DE123" })), []);
});

test("shape-only countries now get a checksum on the variants implemented", () => {
  // Published example numbers (python-stdnum's documentation), not registrations.
  const valid = {
    EE: "EE100207415", HU: "HU12892312", SI: "SI50223054", SK: "SK2022749619",
    HR: "HR33392005961", LV: "LV40003521600", LT: "LT119511515", BG: "BG175074752",
    RO: "RO18547290", EL: "EL094259216", CZ: "CZ25123891",
    MT: "MT11679112", XI: "XI980780684",
  };
  for (const [country, number] of Object.entries(valid)) {
    assert.deepEqual(inspectPartyVat({ id: "S1", name: "A", vat_id: number }, "supplier"), [], country);
    const bad = `${number.slice(0, -2)}${(Number(number.at(-2)) + 1) % 10}${number.at(-1)}`;
    const findings = inspectPartyVat({ id: "S1", name: "A", vat_id: bad }, "supplier");
    assert.deepEqual(findings.map((item) => item.rule), ["INV-023"], country);
    assert.equal(findings[0].message.includes(bad.slice(2)), false);
  }
});

test("Cyprus check letter (2026-11-08)", () => {
  assert.deepEqual(inspectPartyVat({ id: "S1", name: "A", vat_id: "CY10259033P" }, "supplier"), []);
  const bad = inspectPartyVat({ id: "S1", name: "A", vat_id: "CY10259033Q" }, "supplier");
  assert.deepEqual(bad.map((item) => item.rule), ["INV-023"]);
  const dig = inspectPartyVat({ id: "S1", name: "A", vat_id: "CY10259133P" }, "supplier");
  assert.deepEqual(dig.map((item) => item.rule), ["INV-023"]);
});

test("variants without a checksum here stay shape-only", () => {
  for (const number of ["CZ715319274", "LV01011012345"]) {
    const kind = inspectPartyVat({ id: "S1", name: "A", vat_id: number }, "supplier").map((item) => item.rule);
    assert.ok(!kind.includes("INV-023"), number);
  }
});

test("Bulgarian 10-digit and Czech birth-number check digits (2026-11-09)", () => {
  const find = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier").map((item) => item.rule);
  // BG: 7523169263 is python-stdnum's published EGN example. Any of three public rules may pass,
  // so about a quarter of wrong digits slip through; this catches the rest.
  assert.deepEqual(find("BG7523169263"), []);
  assert.deepEqual(find("BG7523169264"), ["INV-023"]);
  // CZ: a 10-digit birth number is divisible by 11 (or first nine leave 10 and the last is 0).
  assert.deepEqual(find("CZ7103192745"), []);
  assert.deepEqual(find("CZ7103192746"), ["INV-023"]);
  assert.deepEqual(find("CZ7113192745"), ["INV-023"]); // month 13
  assert.deepEqual(find("CZ7103322745"), ["INV-023"]); // day 32
  assert.ok(!find("CZ715319274").includes("INV-023")); // 9 digits: no check digit before 1954
});

test("Norway and Switzerland check digits", () => {
  const ok = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier");
  assert.deepEqual(ok("NO 923 609 016 MVA"), []);
  assert.deepEqual(ok("NO923609016"), []);
  assert.equal(ok("NO923609017MVA")[0].rule, "INV-023");
  assert.equal(ok("NO12345MVA")[0].rule, "INV-022");
  assert.deepEqual(ok("CHE-116.281.710 MWST"), []);
  assert.deepEqual(ok("CHE-116.281.710 TVA"), []);
  assert.equal(ok("CHE-116.281.711 MWST")[0].rule, "INV-023");
  assert.equal(ok("CHE-116.281 MWST")[0].rule, "INV-022");
});

test("Australia, New Zealand and Serbia check digits", () => {
  const ok = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier");
  assert.deepEqual(ok("AU 51 824 753 556"), []);
  assert.equal(ok("AU51824753557")[0].rule, "INV-023");
  assert.equal(ok("AU1234")[0].rule, "INV-022");
  assert.deepEqual(ok("NZ 49-091-850"), []);
  assert.deepEqual(ok("NZ049091850"), []);
  assert.equal(ok("NZ49091851")[0].rule, "INV-023");
  assert.deepEqual(ok("RS101134702"), []);
  assert.equal(ok("RS101134703")[0].rule, "INV-023");
});

test("South Korea BRN and India GSTIN check digits", () => {
  const ok = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier");
  assert.deepEqual(ok("KR 124-81-00998"), []);
  assert.equal(ok("KR1248100999")[0].rule, "INV-023");
  assert.equal(ok("KR12481009")[0].rule, "INV-022");
  assert.deepEqual(ok("IN 27AAPFU0939F1ZV"), []);
  assert.equal(ok("IN27AAPFU0939F1ZW")[0].rule, "INV-023");
  assert.equal(ok("IN27AAPFU0939F1")[0].rule, "INV-022");
});

test("Turkey VKN/TCKN check digits", () => {
  const ok = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier");
  // TCKN 10000000146 is the standard published test number.
  assert.deepEqual(ok("TR10000000146"), []);
  assert.equal(ok("TR10000000147")[0].rule, "INV-023");
  assert.equal(ok("TR123")[0].rule, "INV-022");
});

test("Lithuanian 12-digit check digit (2026-11-08)", () => {
  const rules = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier").map((item) => item.rule);
  assert.deepEqual(rules("LT100001919017"), []);
  assert.deepEqual(rules("LT100001919018"), ["INV-023"]);
  assert.deepEqual(rules("LT100001919027"), ["INV-023"]);
});

test("Latin American tax ids on a party (2026-11-08)", () => {
  const rules = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier").map((item) => item.rule);
  // Numbers already pinned in each country's own test file.
  assert.deepEqual(rules("AR 33-69345023-9"), []);
  assert.deepEqual(rules("AR33693450238"), ["INV-023"]);
  assert.deepEqual(rules("AR3369345023"), ["INV-022"]);
  assert.deepEqual(rules("PE20131312955"), []);
  assert.deepEqual(rules("PE20131312956"), ["INV-023"]);
  assert.deepEqual(rules("CL 76.086.428-5"), []);
  assert.deepEqual(rules("CL76086428-4"), ["INV-023"]);
  assert.deepEqual(rules("CO 800.197.268-4"), []);
  assert.deepEqual(rules("CO800197268-5"), ["INV-023"]);
  assert.deepEqual(rules("CO12"), ["INV-022"]);
  assert.deepEqual(rules("BR 11.222.333/0001-81"), []);
  assert.deepEqual(rules("BR11222333000182"), ["INV-023"]);
  assert.deepEqual(rules("BR12ABC34501DE35"), []);
  assert.deepEqual(rules("BR111.444.777-35"), []);
  assert.deepEqual(rules("BR1112"), ["INV-022"]);
});

test("Kazakhstan BIN check digit (2026-11-08, hand-computed number)", () => {
  const rules = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier").map((item) => item.rule);
  assert.deepEqual(rules("KZ040701200547"), []);
  assert.deepEqual(rules("KZ040701200548"), ["INV-023"]);
  assert.deepEqual(rules("KZ0407012005"), ["INV-022"]);
});

test("Mexico RFC on a party (2026-11-08, RFCs pinned in mexico.test.mjs)", () => {
  const rules = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier").map((item) => item.rule);
  assert.deepEqual(rules("MX SAT970701NN3"), []);
  assert.deepEqual(rules("MXGODE561231GR8"), []);
  assert.deepEqual(rules("MXGODE561231GR9"), ["INV-023"]);
  assert.deepEqual(rules("MXXAXX010101000"), []);
  assert.deepEqual(rules("MXSAT9707"), ["INV-022"]);
  // a company RFC with & and Ñ survives normalising (check digit computed, not pinned)
  const checkDigit = mexicoCheckDigit;
  const body = "Ñ&A010101AB";
  const rfc = body + checkDigit(body);
  assert.deepEqual(rules("MX" + rfc), []);
});

test("Ukrainian EDRPOU check digit", () => {
  const rules = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier").map((item) => item.rule);
  for (const ok of ["21560766", "14360570", "20077720", "00032129", "40081195"]) {
    assert.deepEqual(rules(`UA${ok}`), [], ok);
  }
  assert.deepEqual(rules("UA21560767"), ["INV-023"]);
  assert.deepEqual(rules("UA2156076"), ["INV-022"]);
});

test("Guatemalan NIT check character (hand-computed, not registered NITs)", () => {
  const rules = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier").map((item) => item.rule);
  // 123456: 7+12+15+16+15+12 = 77, mod 11 = 0, check 0.  12345: 50, mod 11 = 6, check 5.
  // 1000009: 8+18 = 26, mod 11 = 4, check 7.  100001: 7+2 = 9, check 2.
  // 23: 6+6 = 12, mod 11 = 1, check 10 = K.
  for (const ok of ["GT1234560", "GT123455", "GT10000097", "GT1000012", "GT23K", "GT2-3-K"]) {
    assert.deepEqual(rules(ok), [], ok);
  }
  assert.deepEqual(rules("GT123456"), ["INV-023"]);
  assert.deepEqual(rules("GT23-1"), ["INV-023"]);
  assert.deepEqual(rules("GT1"), ["INV-022"]);
});

test("Uruguay RUT and Vietnam MST check digits reach the party VAT check", () => {
  const rules = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier").map((item) => item.rule);
  // Published examples: Antel's RUT (uruguay.test.mjs) and python-stdnum's MST example.
  assert.deepEqual(rules("UY211003420017"), []);
  assert.deepEqual(rules("UY211003420018"), ["INV-023"]);
  assert.deepEqual(rules("UY21100342001"), ["INV-022"]);
  assert.deepEqual(rules("VN0100233488"), []);
  assert.deepEqual(rules("VN0100233488001"), []);
  assert.deepEqual(rules("VN0100233489"), ["INV-023"]);
  assert.deepEqual(rules("VN01002334"), ["INV-022"]);
});

test("Ecuador RUC and Paraguay RUC check digits reach the party VAT check", () => {
  const rules = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier").map((item) => item.rule);
  // Same numbers the ecuador and paraguay tests pin (hand-computed / published examples).
  assert.deepEqual(rules("EC1790010937001"), []);
  assert.deepEqual(rules("EC1790010938001"), ["INV-023"]);
  assert.deepEqual(rules("EC179001093700"), ["INV-022"]);
  assert.deepEqual(rules("PY80016875-5"), []);
  assert.deepEqual(rules("PY80016875-4"), ["INV-023"]);
  assert.deepEqual(rules("PY12"), ["INV-022"]);
});

test("Israel check digit and Japan, Egypt, Kenya shapes reach the party VAT check", () => {
  const rules = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier").map((item) => item.rule);
  // 000000018 is the hand-worked example in israel.mjs.
  assert.deepEqual(rules("IL000000018"), []);
  assert.deepEqual(rules("IL000000019"), ["INV-023"]);
  assert.deepEqual(rules("IL12345"), ["INV-022"]);
  assert.deepEqual(rules("JPT1234567890123"), []);
  assert.deepEqual(rules("JP1234567890123"), []);
  assert.deepEqual(rules("JPT12345"), ["INV-022"]);
  assert.deepEqual(rules("EG123-456-789"), []);
  assert.deepEqual(rules("EG12345678"), ["INV-022"]);
  assert.deepEqual(rules("KEA123456789Z"), []);
  assert.deepEqual(rules("KEX123456789Z"), ["INV-022"]);
});

test("Indonesia NPWP shape reaches the party VAT check", () => {
  const rules = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier").map((item) => item.rule);
  assert.deepEqual(rules("ID012345678901234"), []);
  assert.deepEqual(rules("ID123456789012345"), []);
  assert.deepEqual(rules("ID12345"), ["INV-022"]);
});

test("Taiwan GUI and Thailand TIN check digits reach the party VAT check", () => {
  const rules = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier").map((item) => item.rule);
  // 04595257: 0+8+5+9+5+4+2+7 = 40, a multiple of 5. Hand-computed, not checked against the registry.
  assert.deepEqual(rules("TW04595257"), []);
  assert.deepEqual(rules("TW04595258"), ["INV-023"]);
  assert.deepEqual(rules("TW0459525"), ["INV-022"]);
  // Seventh digit 7 also accepts total + 1: 10000073 totals 14 (15 is a multiple of 5); 10000072 totals 13 (14): refused.
  assert.deepEqual(rules("TW10000073"), []);
  assert.deepEqual(rules("TW10000072"), ["INV-023"]);
  // Thailand: 0105536112014 -> sum of first 12 weighted 13..2 is 7 mod 11, check (11-7) mod 10 = 4.
  assert.deepEqual(rules("TH0105536112014"), []);
  assert.deepEqual(rules("TH0105536112015"), ["INV-023"]);
  assert.deepEqual(rules("TH010553611201"), ["INV-022"]);
});

test("Saudi and South African VAT numbers get a shape check", () => {
  const rules = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier").map((item) => item.rule);
  assert.deepEqual(rules("SA300075588700003"), []);
  assert.deepEqual(rules("SA310175397400003"), []);
  assert.deepEqual(rules("SA200075588700003"), ["INV-022"]);
  assert.deepEqual(rules("SA300075588700002"), ["INV-022"]);
  assert.deepEqual(rules("SA30007558870003"), ["INV-022"]);
  assert.deepEqual(rules("ZA4123456789"), []);
  assert.deepEqual(rules("ZA3123456789"), ["INV-022"]);
  assert.deepEqual(rules("ZA41234"), ["INV-022"]);
  assert.deepEqual(rules("AE1001234567890033"), ["INV-022"]);
  assert.deepEqual(rules("AE100123456700003"), []);
  assert.deepEqual(rules("AE10012345"), ["INV-022"]);
  assert.deepEqual(rules("SG200812345K"), []);
  assert.deepEqual(rules("SGM2000123"), ["INV-022"]);
  assert.deepEqual(rules("SGM200012345"), []);
  assert.deepEqual(rules("PH123456789"), []);
  assert.deepEqual(rules("PH123456789012"), []);
  assert.deepEqual(rules("PH1234567890"), ["INV-022"]);
  assert.deepEqual(rules("MYC2584563200"), []);
  assert.deepEqual(rules("MYIG12345678090"), []);
  assert.deepEqual(rules("MYX12345678"), ["INV-022"]);
  assert.deepEqual(rules("MA001234567000012"), []);
  assert.deepEqual(rules("MA12345678"), ["INV-022"]);
  assert.deepEqual(rules("AZ1401555071"), []);
  assert.deepEqual(rules("AZ1401555081"), ["INV-023"]);
  assert.deepEqual(rules("AZ1400057424"), ["INV-023"]);
  assert.deepEqual(rules("AZ12345"), ["INV-022"]);
  assert.deepEqual(rules("UZ123456789"), []);
  assert.deepEqual(rules("MD1234567890122"), []);
  assert.deepEqual(rules("MD1234567890123"), ["INV-023"]);
  assert.deepEqual(rules("MD123456789012"), ["INV-022"]);
  assert.deepEqual(rules("GE123456789"), []);
  assert.deepEqual(rules("GE12345678901"), []);
  assert.deepEqual(rules("GE1234567890"), ["INV-022"]);
  assert.deepEqual(rules("AM12345678"), []);
  assert.deepEqual(rules("TZ123456789"), []);
  assert.deepEqual(rules("UG1234567890"), []);
  assert.deepEqual(rules("ZM1234567890"), []);
  assert.deepEqual(rules("TN1234567M"), []);
  assert.deepEqual(rules("TN1234567MAM000"), []);
  assert.deepEqual(rules("TN1234567MAE001"), []);
  assert.deepEqual(rules("TN1234567MAM001"), ["INV-022"]);
  assert.deepEqual(rules("TN1219773U"), ["INV-022"]);
  assert.deepEqual(rules("TN1234567MAX000"), ["INV-022"]);
  assert.deepEqual(rules("TN12345"), ["INV-022"]);
  assert.deepEqual(rules("RW123456789"), []);
  assert.deepEqual(rules("RW12345678A"), ["INV-022"]);
});

test("Dominican RNC/cedula and Venezuelan RIF match python-stdnum 2.2 verdicts on 120 seeded numbers", () => {
  const rules = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier").map((item) => item.rule);
  // Docstring examples of python-stdnum do.rnc and ve.rif (rule source; DGII and SENIAT text unread).
  assert.deepEqual(rules("DO1-01-85004-3"), []);
  assert.deepEqual(rules("DO101850042"), ["INV-023"]);
  assert.deepEqual(rules("DO1018A0043"), ["INV-022"]);
  assert.deepEqual(rules("VEV-11470283-4"), []);
  assert.deepEqual(rules("VEV-11470283-3"), ["INV-023"]);
  assert.deepEqual(rules("VEX114702834"), ["INV-022"]);
  // Each row is [country, number, python-stdnum says valid], generated with Python seed 1.
  const rows = [
  ["DO", "690736625", true],
  ["DO", "341925412", true],
  ["DO", "114426942", true],
  ["VE", "V685878310", true],
  ["DO", "396217232", true],
  ["DO", "611597143", true],
  ["DO", "51702821649", true],
  ["DO", "97541921363", true],
  ["DO", "10007569436", true],
  ["VE", "G588202439", true],
  ["DO", "212690184", true],
  ["VE", "J087413844", true],
  ["DO", "81706964566", true],
  ["DO", "739820518", true],
  ["DO", "28751907362", true],
  ["DO", "136719061", true],
  ["DO", "136243652", true],
  ["DO", "732983868", true],
  ["VE", "V702480031", true],
  ["DO", "94653019888", true],
  ["VE", "E240130060", true],
  ["DO", "561092812", true],
  ["VE", "P589367273", true],
  ["DO", "697825252", true],
  ["DO", "59056055599", true],
  ["VE", "E337970128", true],
  ["DO", "792352451", true],
  ["DO", "511513191", true],
  ["DO", "27749925866", true],
  ["VE", "E334485490", true],
  ["VE", "V250789820", true],
  ["DO", "634873096", true],
  ["DO", "05561959221", true],
  ["VE", "G373598234", true],
  ["VE", "G652602489", true],
  ["VE", "J435928390", true],
  ["DO", "14084853333", true],
  ["DO", "78323455549", true],
  ["VE", "E767162734", true],
  ["DO", "66340404129", true],
  ["DO", "291417776", false],
  ["DO", "31706690743", false],
  ["VE", "G150008063", false],
  ["DO", "608377835", false],
  ["DO", "33740681241", false],
  ["VE", "J868344978", false],
  ["DO", "85178128657", false],
  ["VE", "V704999622", false],
  ["DO", "830388368", false],
  ["DO", "59574890682", false],
  ["VE", "G836075983", false],
  ["DO", "867565088", false],
  ["DO", "99579032892", false],
  ["VE", "V840110704", false],
  ["DO", "24824475771", false],
  ["VE", "V465634148", false],
  ["DO", "396030620", false],
  ["DO", "27868387380", false],
  ["VE", "P956042304", false],
  ["DO", "08093972980", false],
  ["VE", "P351396937", false],
  ["DO", "164870596", false],
  ["DO", "40235925634", false],
  ["DO", "122283459", false],
  ["DO", "84555143972", false],
  ["VE", "G815061622", false],
  ["DO", "519961983", false],
  ["DO", "91454981741", false],
  ["VE", "V409016103", false],
  ["DO", "16684847513", false],
  ["VE", "J000495765", false],
  ["DO", "98754283433", false],
  ["VE", "J141719536", false],
  ["DO", "405259435", false],
  ["DO", "18999133036", false],
  ["VE", "V481100457", false],
  ["DO", "721851822", false],
  ["DO", "22541894232", false],
  ["VE", "G059832468", false],
  ["DO", "203417684", false],
  ["DO", "87870652470", false],
  ["VE", "P900592922", false],
  ["DO", "446962913", false],
  ["DO", "70285873357", false],
  ["VE", "P365894301", false],
  ["DO", "852834448", false],
  ["DO", "52791198962", false],
  ["VE", "E463907656", false],
  ["DO", "828081414", false],
  ["DO", "12917366625", false],
  ["VE", "P297316986", false],
  ["DO", "144368038", false],
  ["DO", "79009343242", false],
  ["VE", "G344947285", false],
  ["DO", "761396341", false],
  ["DO", "01908421859", false],
  ["VE", "J685850177", false],
  ["DO", "548659716", false],
  ["DO", "63804983798", false],
  ["VE", "P427983580", false],
  ["DO", "696659917", false],
  ["DO", "34062642190", false],
  ["VE", "J468427472", false],
  ["DO", "780481961", false],
  ["VE", "J383354118", false],
  ["DO", "578802484", false],
  ["DO", "59368627495", false],
  ["VE", "E493096563", false],
  ["DO", "431297929", false],
  ["DO", "47822275463", false],
  ["VE", "V341136571", false],
  ["DO", "200903078", false],
  ["VE", "P762334789", false],
  ["DO", "637457913", false],
  ["VE", "E200628096", false],
  ["DO", "421740080", false],
  ["DO", "82041613072", false],
  ["VE", "J376544330", false],
  ["DO", "992569880", false],
  ["DO", "58683861491", false],
  ];
  for (const [cc, n, valid] of rows) {
    assert.deepEqual(rules(cc + n), valid ? [] : ["INV-023"], cc + n);
  }
});

test("Russia INN, Canada BN and Dominican RNC get a check-digit test", () => {
  const rules = (v) => inspectPartyVat({ id: "S1", name: "A", vat_id: v }, "supplier").map((item) => item.rule);
  assert.deepEqual(rules("RU7707083893"), []);
  assert.deepEqual(rules("RU7707083894"), ["INV-023"]);
  assert.deepEqual(rules("RU500100732259"), []);
  assert.deepEqual(rules("RU500100732258"), ["INV-023"]);
  assert.deepEqual(rules("RU123"), ["INV-022"]);
  assert.deepEqual(rules("CA123456782RT0001"), []);
  assert.deepEqual(rules("CA123456783RT0001"), ["INV-023"]);
  assert.deepEqual(rules("CA12345"), ["INV-022"]);
  assert.deepEqual(rules("DO101001577"), []);
  assert.deepEqual(rules("DO101001578"), ["INV-023"]);
});
