import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { convert, parseCents, checkIban, checkBic, transliterate, sampleFile, sampleBrokenFile, findingsCsv, parseTable, formatCents } from "./calc.mjs";

const S = { debtorName: "Example Trading Ltd", debtorIban: "ES9121000418450200051332", date: "2026-10-26", created: "2026-10-20T09:00:00" };

test("the clean example converts with no errors and exact control totals", () => {
  const r = convert(sampleFile(), S);
  assert.equal(r.summary.errors, 0);
  assert.equal(r.summary.payments, 3);
  assert.equal(r.summary.total, "1705.20");
  assert.match(r.xml, /<NbOfTxs>3<\/NbOfTxs>/);
  assert.match(r.xml, /<CtrlSum>1705\.20<\/CtrlSum>/);
  assert.match(r.xml, /<InstdAmt Ccy="EUR">1200\.00<\/InstdAmt>/);
});

test("an error anywhere means no file is written", () => {
  const r = convert(sampleBrokenFile(), S);
  assert.ok(r.summary.errors >= 3);
  assert.equal(r.xml, null);
  assert.ok(r.findings.some((f) => /IBAN for Van Dijk/.test(f.title) && f.line === 3));
});

test("amounts are exact cents and ambiguity is refused, not guessed", () => {
  for (const [s, c] of [["1200", 120000n], ["1,200.50", 120050n], ["1.200,50", 120050n], ["1200,5", 120050n], ["€ 5", 500n], ["0.07", 7n], ["1 200,00", 120000n]]) {
    assert.equal(parseCents(s).cents, c, s);
  }
  for (const s of ["1,234", "1.234", "", "-5", "0", "abc", "1.234,567", "12.5.5.5"]) assert.equal(parseCents(s).ok, false, s);
  assert.equal(formatCents(5n), "0.05");
  const sum = ["0.10", "0.20"].map((x) => parseCents(x).cents).reduce((a, b) => a + b);
  assert.equal(formatCents(sum), "0.30");
});

test("IBAN and BIC checks", () => {
  assert.equal(checkIban("de89 3704 0044 0532 0130 00").ok, true);
  assert.equal(checkIban("DE89370400440532013001").ok, false);
  assert.equal(checkIban("DE8937040044053201300").ok, false);
  assert.equal(checkIban("US64SVBKUS6S3300958879").ok, false);
  assert.equal(checkBic("COBADEFFXXX").ok, true);
  assert.equal(checkBic("").ok, true);
  assert.equal(checkBic("COBA").ok, false);
});

test("text is made SEPA-safe and XML-escaped", () => {
  assert.equal(transliterate("Müller & Söhne – Straße"), "Mueller + Soehne - Strasse");
  const r = convert("payee,iban,amount,reference\nA <b> Ltd,NL91ABNA0417164300,5,x & y\n", S);
  assert.ok(r.xml.includes("<Nm>A (b) Ltd</Nm>"));
  assert.ok(r.xml.includes("<Ustrd>x + y</Ustrd>"));
  assert.ok(r.findings.some((f) => f.severity === "warning"));
});

test("headerless files use the order name, iban, amount, reference", () => {
  const r = convert("Acme,DE89370400440532013000,10.50,Inv 1\n", S);
  assert.equal(r.summary.errors, 0);
  assert.match(r.xml, /<Ustrd>Inv 1<\/Ustrd>/);
});

test("semicolon files with comma decimals and quoted fields", () => {
  const r = convert('Name;IBAN;Betrag;Verwendungszweck\n"Acme; GmbH";DE89 3704 0044 0532 0130 00;1.200,00;Rechnung 1\n', S);
  assert.equal(r.summary.errors, 0);
  assert.equal(r.summary.total, "1200.00");
  assert.match(r.xml, /<Nm>Acme, GmbH<\/Nm>/);
});

test("settings are validated", () => {
  const r = convert(sampleFile(), { debtorName: "", debtorIban: "DE00", date: "26/10/2026" });
  assert.ok(r.summary.errors >= 3);
  assert.equal(r.xml, null);
  const past = convert(sampleFile(), { ...S, today: new Date(Date.UTC(2026, 9, 28)) });
  assert.ok(past.findings.some((f) => /past/.test(f.title)));
});

test("pain.001.001.09 wraps the date and uses BICFI", () => {
  const r = convert("payee,iban,amount,reference,bic\nAcme,DE89370400440532013000,10.50,Inv 1,COBADEFF\n", { ...S, version: "pain.001.001.09", debtorBic: "CAIXESBBXXX" });
  assert.equal(r.summary.errors, 0);
  assert.match(r.xml, /<ReqdExctnDt><Dt>2026-10-26<\/Dt><\/ReqdExctnDt>/);
  assert.match(r.xml, /<BICFI>CAIXESBBXXX<\/BICFI>/);
  assert.match(r.xml, /<CdtrAgt><FinInstnId><BICFI>COBADEFF<\/BICFI>/);
});

test("duplicates and repeated ids are caught", () => {
  const r = convert("payee,iban,amount,reference,id\nA,NL91ABNA0417164300,5,x,1\nA,NL91ABNA0417164300,5,x,1\n", S);
  assert.ok(r.findings.some((f) => /duplicate/i.test(f.title)));
  assert.ok(r.findings.some((f) => /used twice/.test(f.title)));
  assert.equal(r.xml, null);
});

test("findings CSV and table parsing", () => {
  assert.match(findingsCsv(convert(sampleBrokenFile(), S)), /^severity,line,title,detail\n/);
  assert.equal(parseTable("a;b\n1;2\n").delim, ";");
});

// The output is checked by the sibling validator when this venture sits beside it in the monorepo.
const sibling = new URL("../sepa-pain001-validator/calc.mjs", import.meta.url);
test("the sibling pain.001 validator finds no errors in what this tool writes", { skip: !existsSync(sibling) }, async () => {
  const { validate } = await import(sibling.href);
  for (const version of ["pain.001.001.03", "pain.001.001.09"]) {
    const r = convert(sampleFile(), { ...S, version, debtorBic: "CAIXESBBXXX", date: "2026-10-26" });
    const v = validate(r.xml, { today: new Date(Date.UTC(2026, 9, 20)) });
    const errs = v.findings.filter((f) => f.severity === "error");
    assert.deepEqual(errs, [], version);
  }
});

test("a payment ID with a leading, trailing or double slash is warned about", () => {
  const S2 = { debtorName: "Me", debtorIban: "ES9121000418450200051332", date: "2026-12-01" };
  const r = convert("payee,iban,amount,reference,id\nAcme GmbH,DE89370400440532013000,10.00,Invoice 1,INV//7/\nBeta BV,NL91ABNA0417164300,5.00,Invoice 2,INV-8\n", S2);
  const slash = r.findings.filter((f) => /slash/.test(f.title));
  assert.equal(slash.length, 1);
  assert.equal(slash[0].line, 2);
});
