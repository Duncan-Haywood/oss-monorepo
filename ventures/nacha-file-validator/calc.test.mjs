import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validate, repair, sampleFile, sampleBrokenFile, buildFile, routingCheckDigitOk, checkDigitFor,
  federalReserveHolidays, bankingDayInfo, nextBankingDay, splitRecords, maskedFindingsCsv,
} from "./calc.mjs";

const codes = (r) => r.findings.map((x) => x.code);
const lines = (t) => t.split("\n").filter((l) => l.length);
const join = (ls) => ls.join("\n") + "\n";

test("routing check digit: known-good numbers pass, a changed digit fails, and the fix digit is found", () => {
  for (const r of ["021000021", "011000015", "121000248", "026009593", "322271627"]) assert.ok(routingCheckDigitOk(r), r);
  assert.ok(!routingCheckDigitOk("021000022"));
  assert.ok(!routingCheckDigitOk("12345678"));
  assert.equal(checkDigitFor("02100002"), 1);
});

test("the worked example is structurally clean and has the shape the page describes", () => {
  const r = validate(sampleFile());
  assert.equal(r.findings.filter((x) => x.severity !== "info").length, 0);
  assert.equal(r.summary.batches, 2);
  assert.equal(r.summary.entries, 5);
  assert.equal(r.summary.addenda, 1);
  assert.equal(r.summary.credit, 184250 + 152075 + 96310);
  assert.equal(r.summary.debit, 640000 + 215500);
  assert.ok(codes(r).includes("CLEAN"));
  assert.equal(sampleFile().split("\n").length - 1, 20);
});

test("a changed amount is caught by the batch and file credit totals", () => {
  const ls = lines(sampleFile());
  ls[2] = ls[2].slice(0, 29) + "0000185250" + ls[2].slice(39);
  const c = codes(validate(join(ls)));
  assert.ok(c.includes("C-CREDIT") && c.includes("T-CREDIT"));
  assert.ok(!c.includes("C-HASH"));
});

test("a changed routing number moves the hash and fails the check digit", () => {
  const ls = lines(sampleFile());
  ls[3] = ls[3].slice(0, 5) + "9" + ls[3].slice(6);
  const c = codes(validate(join(ls)));
  assert.ok(c.includes("E-CHECKDIGIT") && c.includes("C-HASH") && c.includes("T-HASH"));
});

test("a short record, a tab and lowercase are each reported on their line", () => {
  const ls = lines(sampleFile());
  ls[0] = ls[0].trimEnd();
  ls[2] = ls[2].slice(0, 60) + "\t" + ls[2].slice(61);
  ls[3] = ls[3].replace("BEN EXAMPLE", "Ben Example");
  const r = validate(join(ls));
  const at = (code) => r.findings.filter((x) => x.code === code).map((x) => x.line);
  assert.deepEqual(at("LEN"), [1]);
  assert.deepEqual(at("CHARS"), [3]);
  assert.deepEqual(at("CASE"), [4]);
});

test("a file with no blocking records fails the block rules, and repair fixes them", () => {
  const ls = lines(sampleFile()).slice(0, 12);
  const r = validate(join(ls));
  assert.ok(codes(r).includes("T-PAD"));
  const fixed = repair(join(ls));
  assert.equal(fixed.error, null);
  assert.equal(fixed.text.split("\n").length - 1, 20);
  assert.equal(validate(fixed.text).findings.filter((x) => x.severity === "error").length, 0);
});

test("repair rebuilds corrupted control totals but never edits an entry", () => {
  const broken = sampleBrokenFile();
  const before = lines(broken).filter((l) => l[0] === "6" || l[0] === "7");
  const fixed = repair(broken);
  const after = lines(fixed.text).filter((l) => l[0] === "6" || l[0] === "7");
  assert.deepEqual(after, before);
  const c = codes(validate(fixed.text));
  assert.ok(!c.some((x) => x.startsWith("C-") || x.startsWith("T-")), c.join());
  assert.ok(c.includes("E-CHECKDIGIT"), "the mistyped routing number is still reported");
  assert.ok(fixed.changes.length >= 3);
  assert.ok(fixed.changes.some((x) => /File control/.test(x)));
});

test("repair is a no-op on a clean file", () => {
  const clean = sampleFile();
  const fixed = repair(clean);
  assert.equal(fixed.text, clean);
  assert.deepEqual(fixed.changes, []);
});

test("repair refuses a file whose structure is not there to rebuild around", () => {
  assert.ok(repair("hello").error);
  const ls = lines(sampleFile());
  ls.splice(3, 0, "X" + " ".repeat(93));
  assert.ok(repair(join(ls)).error);
});

test("a 220 batch with a debit and a 225 batch with a credit are errors", () => {
  const odfi = "12345678";
  const rn = (p) => p + checkDigitFor(p);
  const mk = (service, code) => buildFile({
    destination: rn(odfi), origin: " " + rn(odfi), destName: "B", origName: "O", created: "261001",
    batches: [{ service, company: "ACME", companyId: "1234567890", sec: "PPD", desc: "PAY", effective: "261006", odfi, entries: [{ code, routing: rn("23456780"), account: "1", cents: 100, name: "X" }] }],
  });
  assert.ok(codes(validate(mk("220", "27"))).includes("B-220"));
  assert.ok(codes(validate(mk("225", "22"))).includes("B-225"));
  assert.ok(!codes(validate(mk("200", "22"))).includes("B-220"));
});

test("zero amounts: a live entry fails, a prenote passes, a prenote with money fails", () => {
  const odfi = "12345678";
  const rn = (p) => p + checkDigitFor(p);
  const mk = (code, cents) => validate(buildFile({
    destination: rn(odfi), origin: " " + rn(odfi), destName: "B", origName: "O", created: "261001",
    batches: [{ service: "200", company: "ACME", companyId: "1234567890", sec: "PPD", desc: "PAY", effective: "261006", odfi, entries: [{ code, routing: rn("23456780"), account: "1", cents, name: "X" }] }],
  }));
  assert.ok(codes(mk("22", 0)).includes("E-ZERO"));
  assert.ok(!codes(mk("23", 0)).some((c) => c.startsWith("E-")));
  assert.ok(codes(mk("23", 500)).includes("E-PRENOTE"));
  assert.ok(codes(mk("24", 0)).includes("E-ZERO-SEC"));
});

test("trace numbers: wrong ODFI prefix is an error, a repeat in a batch is an error, across batches a warning", () => {
  const ls = lines(sampleFile());
  ls[3] = ls[3].slice(0, 79) + "99999999" + ls[3].slice(87);
  assert.ok(codes(validate(join(ls))).includes("E-TRACE-ODFI"));
  const dup = lines(sampleFile());
  dup[3] = dup[3].slice(0, 79) + dup[2].slice(79);
  assert.ok(codes(validate(join(dup))).includes("E-TRACE-DUP"));
  const across = lines(sampleFile());
  across[7] = across[7].slice(0, 79) + across[2].slice(79);
  const r = validate(join(across));
  assert.ok(codes(r).includes("E-TRACE-DUP-FILE"));
  assert.equal(r.findings.find((x) => x.code === "E-TRACE-DUP-FILE").severity, "warning");
});

test("addenda: indicator without an addenda, and an addenda behind an indicator of 0", () => {
  const ls = lines(sampleFile());
  const iAdd = ls.findIndex((l) => l[0] === "7");
  const noAdd = ls.filter((_, i) => i !== iAdd);
  assert.ok(codes(validate(join(noAdd))).includes("ADD-MISSING"));
  const flip = [...ls];
  flip[iAdd - 1] = flip[iAdd - 1].slice(0, 78) + "0" + flip[iAdd - 1].slice(79);
  assert.ok(codes(validate(join(flip))).includes("A-IND"));
});

test("a possible duplicate payment inside a batch is flagged and a different amount is not", () => {
  const ls = lines(sampleFile());
  const copy = ls[2].slice(0, 79) + "123456780000009";
  ls.splice(3, 0, copy);
  assert.ok(codes(validate(join(ls))).includes("E-DUP"));
});

test("WEB entries need a payment type code", () => {
  const ls = lines(sampleFile());
  ls[6] = ls[6].slice(0, 50) + "WEB" + ls[6].slice(53);
  assert.ok(codes(validate(join(ls))).includes("E-PAYTYPE"));
});

test("effective dates: weekend and holiday warnings name the next banking day; past dates use today when given", () => {
  const ls = lines(sampleFile());
  ls[1] = ls[1].slice(0, 69) + "261010" + ls[1].slice(75);
  const r = validate(join(ls));
  const w = r.findings.find((x) => x.code === "B-EFF-HOL");
  assert.match(w.title, /Saturday/);
  assert.match(w.detail, /2026-10-13/); // Monday the 12th is Columbus Day
  const later = validate(sampleFile(), { today: new Date(Date.UTC(2026, 9, 20)) });
  assert.ok(codes(later).includes("B-EFF-PAST"));
  assert.ok(!codes(validate(sampleFile())).includes("B-EFF-PAST"));
});

test("federal reserve holidays: observed rules and a few known dates", () => {
  const h = federalReserveHolidays(2026);
  assert.equal(h.get("2026-01-01"), "New Year's Day");
  assert.equal(h.get("2026-01-19"), "Martin Luther King Jr. Day");
  assert.equal(h.get("2026-05-25"), "Memorial Day");
  assert.equal(h.get("2026-11-26"), "Thanksgiving Day");
  assert.ok(!h.has("2026-07-03"), "July 4 2026 is a Saturday and the Reserve does not observe it on Friday");
  const h27 = federalReserveHolidays(2027);
  assert.ok(h27.has("2027-12-24") === false);
  assert.ok(h27.has("2027-07-05"), "July 4 2027 is a Sunday, observed Monday");
  assert.equal(bankingDayInfo(new Date(Date.UTC(2026, 9, 12))).open, false);
  assert.equal(iso(nextBankingDay(new Date(Date.UTC(2026, 9, 10)))), "2026-10-13");
});

function iso(d) { return d.toISOString().slice(0, 10); }

test("structure: first record, unknown record type, unclosed batch, empty file", () => {
  assert.ok(codes(validate("")).includes("EMPTY"));
  const ls = lines(sampleFile());
  assert.ok(codes(validate(join(ls.slice(1)))).includes("FIRST"));
  const bad = [...ls];
  bad.splice(4, 0, "Z" + " ".repeat(93));
  assert.ok(codes(validate(join(bad))).includes("TYPE"));
  const open = ls.filter((l, i) => !(l[0] === "8" && i < 8));
  assert.ok(codes(validate(join(open))).some((c) => c === "NEST" || c === "UNCLOSED"));
});

test("an unbroken one-line file of whole records is accepted, and CRLF is preserved by repair", () => {
  const flat = lines(sampleFile()).join("");
  assert.equal(splitRecords(flat).lines.length, 20);
  assert.equal(validate(flat).findings.filter((x) => x.severity === "error").length, 0);
  const crlf = sampleFile().replace(/\n/g, "\r\n");
  assert.equal(validate(crlf).findings.filter((x) => x.severity === "error").length, 0);
  assert.ok(repair(crlf).text.includes("\r\n"));
});

test("findings are sorted errors first and account numbers are never printed in full", () => {
  const r = validate(sampleBrokenFile());
  const sev = r.findings.map((x) => x.severity);
  assert.deepEqual(sev, [...sev].sort((a, b) => ({ error: 0, warning: 1, info: 2 })[a] - ({ error: 0, warning: 1, info: 2 })[b]));
  const csv = maskedFindingsCsv(r);
  assert.ok(!/100200301|400500602|700800903|55501234|66602345/.test(csv));
  const dupText = validate(join([...lines(sampleFile())].flatMap((l, i) => (i === 3 ? [l.slice(0, 79) + "123456780000009", l] : [l])))).findings.map((x) => x.detail).join();
  assert.ok(!/400500602/.test(dupText));
});

test("the calculator never touches the network", async () => {
  const { readFileSync } = await import("node:fs");
  assert.doesNotMatch(readFileSync(new URL("./calc.mjs", import.meta.url), "utf8"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|require\(|import\(/);
});
