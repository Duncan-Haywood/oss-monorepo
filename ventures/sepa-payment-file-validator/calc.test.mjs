import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ibanCheck, maskIban, mod97, parseCents, euros, targetClosed, nextBankingDay,
  validate, repair, sampleDates, sampleFile, sampleBrokenFile, maskedFindingsCsv,
} from "./calc.mjs";

const today = new Date("2026-10-01T00:00:00Z");
const titles = (r) => r.findings.map((f) => f.title);

test("well-known example IBANs pass the mod-97 check", () => {
  for (const i of ["DE89370400440532013000", "GB82WEST12345698765432", "NL91ABNA0417164300", "FR1420041010050500013M02606", "ES9121000418450200051332", "IT60X0542811101000000123456"])
    assert.equal(ibanCheck(i).ok, true, i);
  assert.equal(ibanCheck("DE89 3704 0044 0532 0130 00").ok, true);
});

test("IBAN failures name the cause: length, country, format, checksum with the right digits", () => {
  assert.equal(ibanCheck("DE8937040044053201300").reason, "length");
  assert.equal(ibanCheck("XX89370400440532013000").reason, "country");
  assert.equal(ibanCheck("DE-9").reason, "format");
  const r = ibanCheck("DE00370400440532013000");
  assert.equal(r.reason, "checksum");
  assert.equal(r.fixDigits, "89");
});

test("a transposed pair of digits fails the check", () => {
  assert.equal(ibanCheck("NL91ABNA0417164030").ok, false);
});

test("mod97 handles letters", () => assert.equal(mod97("3214282912345698765432161182"), 1));
test("maskIban keeps the last four only", () => assert.equal(maskIban("DE89 3704 0044 0532 0130 00"), "…3000"));

test("parseCents is strict and exact", () => {
  assert.equal(parseCents("1250.00"), 125000);
  assert.equal(parseCents("0.1"), 10);
  assert.equal(parseCents("19.99"), 1999);
  for (const bad of ["1,250.00", "-5", "1e3", "", "12.345", "abc"]) assert.equal(parseCents(bad), null, bad);
  assert.equal(euros(285050), "2,850.50");
});

test("TARGET2 closing days: weekends, Good Friday, Easter Monday, 1 May, Christmas", () => {
  assert.ok(targetClosed(new Date("2026-10-10T00:00:00Z")));
  assert.match(targetClosed(new Date("2026-04-03T00:00:00Z")), /Good Friday/);
  assert.match(targetClosed(new Date("2026-04-06T00:00:00Z")), /Easter Monday/);
  assert.ok(targetClosed(new Date("2026-05-01T00:00:00Z")));
  assert.ok(targetClosed(new Date("2026-12-26T00:00:00Z")));
  assert.equal(targetClosed(new Date("2026-10-12T00:00:00Z")), null);
  assert.equal(nextBankingDay(new Date("2026-10-10T00:00:00Z")), "2026-10-12");
});

test("the clean sample has no findings", () => {
  assert.deepEqual(validate(sampleFile(), { today }).findings, []);
  const s = validate(sampleFile(), { today }).summary;
  assert.equal(s.transactions, 3);
  assert.equal(s.totalCents, 275050);
});

test("the broken sample reports the hand-edit faults with line numbers", () => {
  const r = validate(sampleBrokenFile(), { today });
  const t = titles(r).join("|");
  assert.match(t, /Group CtrlSum is 2750.50 but the amounts add to 2,850.50/);
  assert.match(t, /PmtInf CtrlSum/);
  assert.match(t, /weekend/);
  assert.match(t, /EndToEndId "INV-1001" repeats/);
  assert.match(t, /Creditor IBAN …2660 is invalid/);
  assert.match(t, /characters outside the SEPA set/);
  assert.ok(r.findings.every((f) => f.line > 0));
});

test("findings never print a full IBAN", () => {
  const r = validate(sampleBrokenFile(), { today });
  const blob = JSON.stringify(r.findings) + maskedFindingsCsv(r);
  assert.doesNotMatch(blob, /FR1420041010050500013M02660/);
});

test("repair rebuilds only counts and control sums, never an amount, IBAN or name", () => {
  const broken = sampleBrokenFile();
  const fix = repair(broken);
  assert.equal(fix.changes.length, 2);
  const after = validate(fix.text, { today });
  assert.ok(!titles(after).some((t) => /CtrlSum|NbOfTxs/.test(t)));
  const strip = (s) => s.replace(/<CtrlSum>[^<]*<\/CtrlSum>/g, "").replace(/<NbOfTxs>[^<]*<\/NbOfTxs>/g, "");
  assert.equal(strip(fix.text), strip(broken));
});

test("repair fixes a wrong transaction count too", () => {
  const f = sampleFile().replace("<NbOfTxs>3</NbOfTxs>", "<NbOfTxs>5</NbOfTxs>");
  const r = validate(f, { today });
  assert.match(titles(r).join("|"), /NbOfTxs is 5/);
  assert.deepEqual(validate(repair(f).text, { today }).findings, []);
});

test("repair refuses a file that does not parse", () => {
  const r = repair(sampleFile().replace("</Cdtr>", ""));
  assert.equal(r.text, null);
  assert.match(r.error, /XML structure/);
});

test("mismatched tags and a bare ampersand are reported", () => {
  const r = validate(sampleFile().replace("Example Supplies BV", "Smith & Sons"), { today });
  assert.match(titles(r).join("|"), /not well-formed/);
  assert.match(r.findings.find((f) => /well-formed/.test(f.title)).detail, /&amp;/);
});

test("a non-pain.001 file and a non-XML file give a clear first finding", () => {
  assert.match(titles(validate("hello", { today }))[0], /No Document/);
  const dd = sampleFile().replace("pain.001.001.03", "pain.008.001.02");
  assert.match(titles(validate(dd, { today })).join("|"), /Not a pain\.00x|Schema version/);
});

test("non-euro currency, 3-decimal and comma amounts are errors", () => {
  assert.match(titles(validate(sampleFile().replace('Ccy="EUR">1250.00', 'Ccy="USD">1250.00'), { today })).join("|"), /not EUR/);
  assert.match(titles(validate(sampleFile().replace("1250.00", "1250.005"), { today })).join("|"), /more than two decimals/);
  assert.match(titles(validate(sampleFile().replace("1250.00", "1,250.00"), { today })).join("|"), /not a decimal/);
});

test("past, impossible and malformed execution dates", () => {
  assert.match(titles(validate(sampleFile().replace("2026-10-12", "2026-09-01"), { today })).join("|"), /in the past/);
  assert.match(titles(validate(sampleFile().replace("2026-10-12", "2026-02-30"), { today })).join("|"), /does not exist/);
  assert.match(titles(validate(sampleFile().replace("2026-10-12", "12/10/2026"), { today })).join("|"), /not YYYY-MM-DD/);
});

test("over-length fields and duplicate payments are flagged", () => {
  const long = "X".repeat(36);
  assert.match(titles(validate(sampleFile().replace("INV-1001", long), { today })).join("|"), /EndToEndId is 36 characters/);
  const dup = sampleFile().replace("ES9121000418450200051332", "NL91ABNA0417164300").replace("<InstdAmt Ccy=\"EUR\">500.00", "<InstdAmt Ccy=\"EUR\">1250.00").replace("2750.50", "3500.50");
  assert.match(titles(validate(dup, { today })).join("|"), /Possible duplicate/);
});

test("both Ustrd and Strd, and missing service level, are errors", () => {
  const both = sampleFile().replace("<Ustrd>Invoice 1001</Ustrd>", "<Ustrd>x</Ustrd><Strd><CdtrRefInf><Ref>1</Ref></CdtrRefInf></Strd>");
  assert.match(titles(validate(both, { today })).join("|"), /Both Ustrd and Strd/);
  const nosvc = sampleFile().replace("<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>", "");
  assert.match(titles(validate(nosvc, { today })).join("|"), /Service level/);
});

test("pain.001.001.09 layout (BICFI, nested date) is read", () => {
  const f = sampleFile().replace("pain.001.001.03", "pain.001.001.09").replace("<ReqdExctnDt>2026-10-12</ReqdExctnDt>", "<ReqdExctnDt><Dt>2026-10-12</Dt></ReqdExctnDt>").replace("<BIC>COBADEFFXXX</BIC>", "<BICFI>COBADEFFXXX</BICFI>");
  assert.deepEqual(validate(f, { today }).findings, []);
  assert.match(titles(validate(f.replace("COBADEFFXXX", "BAD"), { today })).join("|"), /not a valid BIC/);
});

test("example dates track today: a banking day for the clean file, a Saturday for the broken one", () => {
  for (const d of ["2026-10-04", "2027-04-01", "2027-12-20"]) {
    const now = new Date(d + "T00:00:00Z");
    const { ok, saturday } = sampleDates(now);
    assert.equal(targetClosed(new Date(ok + "T00:00:00Z")), null);
    assert.equal(new Date(saturday + "T00:00:00Z").getUTCDay(), 6);
    assert.deepEqual(validate(sampleFile(now), { today: now }).findings, []);
    assert.match(titles(validate(sampleBrokenFile(now), { today: now })).join("|"), /weekend/);
  }
});
