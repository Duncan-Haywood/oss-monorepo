import { test } from "node:test";
import assert from "node:assert/strict";
import { unfold, fold, parseContentLine, checkDate, fnFromN, validate, repair, findingsCsv, sampleFile, sampleBrokenFile, decodeBuffer } from "./calc.mjs";

const has = (r, re) => r.findings.some((f) => re.test(f.title));
const card = (...p) => ["BEGIN:VCARD", "VERSION:3.0", ...p, "END:VCARD", ""].join("\r\n");

test("unfold joins continuation lines and quoted-printable soft breaks; fold respects 75 octets", () => {
  assert.equal(unfold("NOTE:one\r\n two\r\nFN:x\r\n")[0].value, "NOTE:onetwo");
  assert.equal(unfold("NOTE;ENCODING=QUOTED-PRINTABLE:Caf=\r\nC3=A9\r\nFN:x\r\n")[0].value, "NOTE;ENCODING=QUOTED-PRINTABLE:CafC3=A9");
  const long = "NOTE:" + "é".repeat(100);
  for (const part of fold(long).split("\r\n")) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(unfold(fold(long))[0].value, long);
});

test("content lines parse groups, parameters and bare 2.1 types", () => {
  const p = parseContentLine("item1.TEL;WORK;VOICE:+1 555 0100");
  assert.equal(p.name, "TEL"); assert.equal(p.group, "ITEM1"); assert.equal(p.params.TYPE, "WORK,VOICE");
  assert.equal(parseContentLine("no colon"), null);
});

test("dates must be real, and year-less birthdays are accepted", () => {
  assert.ok(checkDate("1990-02-30")); assert.ok(checkDate("March 3"));
  assert.equal(checkDate("19840309"), null); assert.equal(checkDate("--0309"), null);
});

test("FN is built from N in display order", () => {
  assert.equal(fnFromN("Rivera;Sam;J;Dr.;Jr."), "Dr. Sam J Rivera Jr.");
  assert.equal(fnFromN(";;;;"), "");
});

test("a clean card has no findings", () => {
  const r = validate(sampleFile());
  assert.deepEqual(r.findings, []);
  assert.equal(r.summary.cards, 1);
});

test("missing FN, short N, bad BDAY, email and phone are reported", () => {
  const r = validate(card("N:Okafor;Ada", "EMAIL:mailto:a b@x", "TEL:call me", "BDAY:1990-02-30"));
  for (const re of [/no FN/, /N has 2 components/, /EMAIL does not look/, /TEL has no digits/, /bad BDAY/]) assert.ok(has(r, re), String(re));
});

test("unclosed card, no VERSION, duplicate UID and quoted-printable are reported", () => {
  assert.ok(has(validate("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:A\r\n"), /never closed/));
  assert.ok(has(validate("BEGIN:VCARD\r\nFN:A\r\nEND:VCARD\r\n"), /no VERSION/));
  const dup = card("FN:A", "N:A;;;;", "UID:1") + card("FN:B", "N:B;;;;", "UID:1");
  assert.ok(has(validate(dup), /UID repeats/));
  assert.ok(has(validate(card("FN:A", "N:A;;;;", "NOTE;ENCODING=QUOTED-PRINTABLE:Caf=C3=A9")), /QUOTED-PRINTABLE/));
});

test("no file, or a web page, is a clear error", () => {
  assert.ok(has(validate("<html>hi</html>"), /No vCard found/));
});

test("repair builds FN, pads N, drops identical duplicates and writes CRLF", () => {
  const src = card("N:Okafor;Ada", "EMAIL:a@x.test") + card("FN:Lee", "N:Lee;;;;", "REV:20260101T000000Z") + card("FN:Lee", "N:Lee;;;;", "REV:20260202T000000Z");
  const out = repair(src.replace(/\r\n/g, "\n"));
  assert.match(out.text, /FN:Ada Okafor/); assert.match(out.text, /N:Okafor;Ada;;;/);
  assert.equal((out.text.match(/BEGIN:VCARD/g) || []).length, 2);
  assert.ok(!/[^\r]\n/.test(out.text));
  assert.equal(validate(out.text).findings.filter((f) => f.fixable).length, 0);
});

test("repair is idempotent and leaves unfixable problems alone", () => {
  const once = repair(sampleBrokenFile()).text;
  assert.equal(repair(once).text, once);
  assert.match(once, /BDAY:1990-02-30/);
  assert.match(once, /QUOTED-PRINTABLE/);
});

test("different people sharing nothing are not treated as duplicates", () => {
  const r = validate(card("FN:A", "N:A;;;;", "EMAIL:a@x.test") + card("FN:B", "N:B;;;;", "EMAIL:b@x.test"));
  assert.ok(!has(r, /identical/));
});

test("a UTF-16 file decodes", () => {
  const s = card("FN:Zoë", "N:Zoë;;;;");
  const buf = new Uint8Array(2 + s.length * 2); buf[0] = 0xff; buf[1] = 0xfe;
  for (let i = 0; i < s.length; i++) { buf[2 + i * 2] = s.charCodeAt(i) & 255; buf[3 + i * 2] = s.charCodeAt(i) >> 8; }
  assert.equal(decodeBuffer(buf.buffer), s);
});

test("findings export as CSV with quoting", () => {
  const csv = findingsCsv(validate(sampleBrokenFile()));
  assert.match(csv, /^severity,line,title,detail,auto_fixed\r\n/);
});
