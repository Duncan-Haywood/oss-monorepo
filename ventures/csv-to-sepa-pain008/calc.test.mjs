import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { convert, checkCreditorId, parseDate, parseCents, sampleFile, sampleBrokenFile, findingsCsv } from "./calc.mjs";

const S = {
  creditorName: "Example Gym Club", creditorIban: "BE68539007547034", creditorId: "DE98ZZZ09999999999",
  date: "2026-10-26", created: "2026-10-20T09:00:00", today: new Date(Date.UTC(2026, 9, 20)),
};

test("the clean example converts with exact totals, one block per sequence type", () => {
  const r = convert(sampleFile(), S);
  assert.equal(r.summary.errors, 0);
  assert.equal(r.summary.collections, 3);
  assert.equal(r.summary.total, "1309.80");
  assert.equal(r.summary.blocks, 2);
  assert.equal([...r.xml.matchAll(/<PmtInf>/g)].length, 2);
  assert.match(r.xml, /<SeqTp>FRST<\/SeqTp>/);
  assert.match(r.xml, /<SeqTp>RCUR<\/SeqTp>/);
  assert.match(r.xml, /<CtrlSum>1309\.80<\/CtrlSum>/);
  assert.match(r.xml, /<CtrlSum>29\.90<\/CtrlSum>/);
  assert.match(r.xml, /<CtrlSum>1279\.90<\/CtrlSum>/);
  assert.match(r.xml, /<ReqdColltnDt>2026-10-26<\/ReqdColltnDt>/);
  assert.match(r.xml, /<MndtId>MAND-0003<\/MndtId><DtOfSgntr>2024-01-09<\/DtOfSgntr>/);
});

test("an error anywhere means no file is written", () => {
  const r = convert(sampleBrokenFile(), S);
  assert.ok(r.summary.errors >= 5);
  assert.equal(r.xml, null);
  assert.ok(r.findings.some((f) => /Mandate ID for Anna Rossi is empty/.test(f.title) && f.line === 5));
  assert.ok(r.findings.some((f) => /Sequence type for Lee Wong/.test(f.title)));
});

test("creditor identifier check digits", () => {
  assert.equal(checkCreditorId("DE98 ZZZ 09999999999").ok, true);
  assert.equal(checkCreditorId("DE98ZZZ09999999990").ok, false);
  assert.equal(checkCreditorId("DE98ZZ").ok, false);
  assert.equal(checkCreditorId("US98ZZZ09999999999").ok, false);
  assert.equal(checkCreditorId("").ok, false);
  assert.equal(convert(sampleFile(), { ...S, creditorId: "DE98ZZZ09999999990" }).xml, null);
});

test("dates: ISO and dotted are read, an ambiguous slash date is refused", () => {
  assert.equal(parseDate("2025-03-14").ok, true);
  assert.equal(parseDate("14.03.2025").ok, true);
  assert.equal(parseDate("14/03/2025").ok, true);
  assert.equal(parseDate("03/04/2025").ok, false);
  assert.equal(parseDate("2025-02-30").ok, false);
  assert.equal(parseDate("").ok, false);
});

test("mandate ids are quoted exactly as signed, never rewritten", () => {
  const bad = convert("name,iban,amount,mandate id,mandate date\nA,NL91ABNA0417164300,10,MÜLLER_1,2025-01-01\n", S);
  assert.equal(bad.xml, null);
  assert.ok(bad.findings.some((f) => /characters SEPA does not allow/.test(f.title)));
  const long = convert(`name,iban,amount,mandate id,mandate date\nA,NL91ABNA0417164300,10,${"M".repeat(36)},2025-01-01\n`, S);
  assert.equal(long.xml, null);
});

test("mandate date rules: future, after the collection date, over 36 months", () => {
  const f = (d) => convert(`name,iban,amount,mandate id,mandate date\nA,NL91ABNA0417164300,10,M1,${d}\n`, S);
  assert.ok(f("2026-12-01").findings.some((x) => /future/.test(x.title)));
  assert.ok(f("2026-10-20").xml, "signed today is fine");
  assert.ok(f("2022-01-01").findings.some((x) => /over 36 months/.test(x.title)));
  assert.ok(f("2022-01-01").xml, "an old mandate is a warning, not a block");
});

test("collection date: past blocks, weekend and next-day warn", () => {
  const f = (date) => convert(sampleFile(), { ...S, date });
  assert.equal(f("2026-10-20").xml, null);
  assert.ok(f("2026-10-24").findings.some((x) => /weekend/.test(x.title)));
  assert.ok(f("2026-10-21").findings.some((x) => /very next business day/.test(x.title)));
  assert.equal(f("2026-10-21").xml !== null, true);
});

test("same mandate on two IBANs is an error, FRST twice is a warning", () => {
  const two = convert("name,iban,amount,mandate id,mandate date,sequence\nA,NL91ABNA0417164300,10,M1,2025-01-01,RCUR\nA,ES9121000418450200051332,10,M1,2025-01-01,RCUR\n", S);
  assert.equal(two.xml, null);
  assert.ok(two.findings.some((x) => /two different IBANs/.test(x.title)));
  const first = convert("name,iban,amount,mandate id,mandate date,sequence\nA,NL91ABNA0417164300,10,M1,2025-01-01,FRST\nA,NL91ABNA0417164300,11,M1,2025-01-01,FRST\n", S);
  assert.ok(first.findings.some((x) => /FRST\) twice/.test(x.title)));
});

test("B2B scheme is written and warned about; sequence words and the default are read", () => {
  const r = convert("name,iban,amount,mandate id,mandate date,sequence\nA,NL91ABNA0417164300,10,M1,2025-01-01,one-off\nB,ES9121000418450200051332,10,M2,2025-01-01,final\n", { ...S, scheme: "B2B", defaultSeq: "FRST" });
  assert.match(r.xml, /<LclInstrm><Cd>B2B<\/Cd><\/LclInstrm><SeqTp>OOFF<\/SeqTp>/);
  assert.match(r.xml, /<SeqTp>FNAL<\/SeqTp>/);
  assert.ok(r.findings.some((x) => /Business-to-business/.test(x.title)));
  const d = convert("name,iban,amount,mandate id,mandate date\nA,NL91ABNA0417164300,10,M1,2025-01-01\n", { ...S, defaultSeq: "FRST" });
  assert.match(d.xml, /<SeqTp>FRST<\/SeqTp>/);
});

test("headerless files use the order name, iban, amount, mandate, date, reference, sequence", () => {
  const r = convert("Acme,NL91ABNA0417164300,10.50,M-1,01.02.2025,Fee,RCUR\n", S);
  assert.equal(r.summary.errors, 0);
  assert.match(r.xml, /<Ustrd>Fee<\/Ustrd>/);
  assert.match(r.xml, /<DtOfSgntr>2025-02-01<\/DtOfSgntr>/);
});

test("missing required columns are named", () => {
  const r = convert("name,iban,amount\nA,NL91ABNA0417164300,10\n", S);
  assert.equal(r.xml, null);
  assert.ok(r.findings.some((f) => /No "Mandate ID" column/.test(f.title)));
  assert.ok(r.findings.some((f) => /No "Mandate date" column/.test(f.title)));
});

test("settings are validated, BIC goes in the right element, text is escaped", () => {
  const bad = convert(sampleFile(), { creditorName: "", creditorIban: "DE00", creditorId: "x", date: "10/11/2026" });
  assert.ok(bad.summary.errors >= 4);
  const r = convert("name,iban,amount,mandate id,mandate date,reference,bic\nA <b> Ltd,NL91ABNA0417164300,5,M1,2025-01-01,x & y,ABNANL2A\n", { ...S, creditorBic: "KREDBEBB" });
  assert.ok(r.xml.includes("<Nm>A (b) Ltd</Nm>"));
  assert.ok(r.xml.includes("<Ustrd>x + y</Ustrd>"));
  assert.match(r.xml, /<CdtrAgt><FinInstnId><BIC>KREDBEBB<\/BIC>/);
  assert.match(r.xml, /<DbtrAgt><FinInstnId><BIC>ABNANL2A<\/BIC>/);
});

test("amounts are exact cents and findings export as CSV", () => {
  assert.equal(parseCents("1.250,00").cents, 125000n);
  assert.equal(parseCents("1,234").ok, false);
  assert.match(findingsCsv(convert(sampleBrokenFile(), S)), /^severity,line,title,detail\n/);
});

// The output is checked by the sibling validator when this venture sits beside it in the monorepo.
const sibling = new URL("../sepa-pain001-validator/calc.mjs", import.meta.url);
test("the sibling validator finds no errors in what this tool writes", { skip: !existsSync(sibling) }, async () => {
  const { validate } = await import(sibling.href);
  for (const scheme of ["CORE", "B2B"]) {
    const r = convert(sampleFile(), { ...S, scheme, creditorBic: "KREDBEBB" });
    const v = validate(r.xml, { today: new Date(Date.UTC(2026, 9, 20)) });
    assert.deepEqual(v.findings.filter((f) => f.severity === "error"), [], scheme);
  }
});
