import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { convert, parseCents, checkCreditorId, sampleFile, sampleBrokenFile, findingsCsv, formatCents } from "./calc.mjs";

const S = {
  creditorName: "Example Gym Club", creditorId: "DE98ZZZ09999999999", creditorIban: "FR1420041010050500013M02606",
  date: "2026-10-26", created: "2026-10-20T09:00:00", today: new Date(Date.UTC(2026, 9, 20)),
};

test("the clean example converts with no errors, one batch per sequence type, and exact totals", () => {
  const r = convert(sampleFile(), S);
  assert.equal(r.summary.errors, 0);
  assert.equal(r.summary.payments, 3);
  assert.equal(r.summary.batches, 2);
  assert.equal(r.summary.total, "94.30");
  assert.match(r.xml, /<CtrlSum>94\.30<\/CtrlSum>/);
  assert.match(r.xml, /<SeqTp>FRST<\/SeqTp>/);
  assert.match(r.xml, /<SeqTp>RCUR<\/SeqTp>/);
  assert.match(r.xml, /<MndtId>MAND-0003<\/MndtId><DtOfSgntr>2026-10-02<\/DtOfSgntr>/);
  assert.match(r.xml, /<Id>DE98ZZZ09999999999<\/Id><SchmeNm><Prtry>SEPA<\/Prtry>/);
});

test("an error anywhere means no file is written", () => {
  const r = convert(sampleBrokenFile(), S);
  assert.ok(r.summary.errors >= 4);
  assert.equal(r.xml, null);
  const titles = r.findings.map((f) => f.title).join("|");
  assert.match(titles, /IBAN for Jan de Vries/);
  assert.match(titles, /Mandate id for Lena Mueller is empty/);
  assert.match(titles, /signed in the future/);
  assert.match(titles, /Possible duplicate collection/);
});

test("creditor identifiers use the mod 97-10 check and ignore the business code", () => {
  assert.equal(checkCreditorId("DE98ZZZ09999999999").ok, true);
  assert.equal(checkCreditorId("de98 zzz 09999999999").ok, true);
  assert.equal(checkCreditorId("DE98ABC09999999999").ok, true, "business code is not part of the check");
  assert.equal(checkCreditorId("DE99ZZZ09999999999").ok, false);
  assert.equal(checkCreditorId("DE98ZZZ09999999998").ok, false);
  assert.equal(checkCreditorId("").ok, false);
  assert.equal(checkCreditorId("12345").ok, false);
});

test("settings are validated", () => {
  const r = convert(sampleFile(), { creditorName: "", creditorId: "XX", creditorIban: "DE00", date: "soon" });
  assert.ok(r.summary.errors >= 4);
  assert.equal(r.xml, null);
  const past = convert(sampleFile(), { ...S, date: "2026-10-20" });
  assert.ok(past.findings.some((f) => /today or in the past/.test(f.title)));
  assert.equal(past.xml, null);
  const weekend = convert(sampleFile(), { ...S, date: "2026-10-24" });
  assert.ok(weekend.findings.some((f) => /weekend/.test(f.title)));
});

test("a mandate signed on or after the collection date is refused", () => {
  const r = convert("debtor,iban,amount,mandate,signed\nA,NL91ABNA0417164300,5,M1,2026-10-26\n", { ...S, today: undefined });
  assert.ok(r.findings.some((f) => /on or after the collection date/.test(f.title)));
  assert.equal(r.xml, null);
});

test("sequence words, default sequence and unknown sequence", () => {
  const ok = convert("debtor,iban,amount,mandate,signed,seq\nA,NL91ABNA0417164300,5,M1,2025-01-01,first\nB,NL91ABNA0417164300,6,M2,2025-01-01,one-off\nC,NL91ABNA0417164300,7,M3,2025-01-01,\n", S);
  assert.equal(ok.summary.errors, 0);
  assert.deepEqual([...ok.xml.matchAll(/<SeqTp>(\w+)<\/SeqTp>/g)].map((m) => m[1]), ["FRST", "RCUR", "OOFF"]);
  const bad = convert("debtor,iban,amount,mandate,signed,seq\nA,NL91ABNA0417164300,5,M1,2025-01-01,monthly\n", S);
  assert.ok(bad.findings.some((f) => /Sequence type/.test(f.title)));
  const frst = convert("debtor,iban,amount,mandate,signed\nA,NL91ABNA0417164300,5,M1,2025-01-01\n", { ...S, defaultSeq: "FRST" });
  assert.ok(frst.findings.some((f) => /FRST/.test(f.title)));
});

test("only the long-standing SEPA version is offered", () => {
  assert.throws(() => convert(sampleFile(), { ...S, version: "pain.008.001.08" }), /Unknown version/);
});

test("B2B scheme is written and warned about", () => {
  const r = convert("debtor,iban,amount,mandate,signed,seq\nA,NL91ABNA0417164300,5,M1,2025-01-01,FRST\n", { ...S, scheme: "B2B" });
  assert.match(r.xml, /<LclInstrm><Cd>B2B<\/Cd><\/LclInstrm>/);
  assert.ok(r.findings.some((f) => /B2B mandates/.test(f.title)));
});

test("amounts are exact cents and ambiguity is refused", () => {
  for (const [s, c] of [["34,50", 3450n], ["1.200,50", 120050n], ["€ 5", 500n]]) assert.equal(parseCents(s).cents, c, s);
  for (const s of ["1,234", "", "-5", "0", "29.905"]) assert.equal(parseCents(s).ok, false, s);
  assert.equal(formatCents(5n), "0.05");
});

test("headerless files use the documented column order", () => {
  const r = convert("Acme,DE89370400440532013000,10.50,M-9,2025-02-03,Fee,RCUR\n", S);
  assert.equal(r.summary.errors, 0);
  assert.match(r.xml, /<MndtId>M-9<\/MndtId>/);
});

test("german dates dd.mm.yyyy are read", () => {
  const r = convert("Name;IBAN;Betrag;Mandat;Mandatsdatum\nAcme;DE89 3704 0044 0532 0130 00;10,50;M-9;03.02.2025\n", S);
  assert.equal(r.summary.errors, 0);
  assert.match(r.xml, /<DtOfSgntr>2025-02-03<\/DtOfSgntr>/);
});

test("text is made SEPA-safe and XML-escaped", () => {
  const r = convert("debtor,iban,amount,mandate,signed,reference\nA <b> Ltd,NL91ABNA0417164300,5,M&1,2025-01-01,x & y\n", S);
  assert.ok(r.xml.includes("<Nm>A (b) Ltd</Nm>"));
  assert.ok(r.xml.includes("<MndtId>M+1</MndtId>"));
  assert.ok(r.xml.includes("<Ustrd>x + y</Ustrd>"));
});

test("findings CSV", () => {
  assert.match(findingsCsv(convert(sampleBrokenFile(), S)), /^severity,line,title,detail\n/);
});

// The output is checked by the sibling validator when this venture sits beside it in the monorepo.
const sibling = new URL("../sepa-pain001-validator/calc.mjs", import.meta.url);
test("the sibling validator finds no errors in what this tool writes", { skip: !existsSync(sibling) }, async () => {
  const { validate } = await import(sibling.href);
  for (const version of ["pain.008.001.02"]) {
    for (const scheme of ["CORE", "B2B"]) {
      const r = convert(sampleFile(), { ...S, version, scheme, creditorBic: "BNPAFRPPXXX" });
      const v = validate(r.xml, { today: new Date(Date.UTC(2026, 9, 20)) });
      assert.deepEqual(v.findings.filter((f) => f.severity === "error"), [], `${version} ${scheme}`);
    }
  }
});
