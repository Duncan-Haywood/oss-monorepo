import { test } from "node:test";
import assert from "node:assert/strict";
import { unfold, fold, parseContentLine, parseTime, validate, repair, makeUid, findingsCsv, sampleFile, sampleBrokenFile, decodeBuffer } from "./calc.mjs";

const titles = (r) => r.findings.map((f) => f.title);
const has = (r, re) => r.findings.some((f) => re.test(f.title));
const cal = (...ev) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//t//EN", ...ev, "END:VCALENDAR", ""].join("\r\n");
const vevent = (...p) => ["BEGIN:VEVENT", "UID:a@t", "DTSTAMP:20260101T000000Z", ...p, "END:VEVENT"].join("\r\n");

test("unfold joins continuation lines and fold splits at 75 octets", () => {
  assert.equal(unfold("A:one\r\n two\r\nB:x\r\n")[0].value, "A:onetwo");
  const long = "DESCRIPTION:" + "x".repeat(200);
  const f = fold(long);
  for (const part of f.split("\r\n")) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(unfold(f)[0].value, long);
});

test("fold never splits a multibyte character", () => {
  const long = "SUMMARY:" + "é".repeat(100);
  assert.equal(unfold(fold(long))[0].value, long);
});

test("content lines parse parameters and quoted colons", () => {
  const p = parseContentLine('DTSTART;TZID="Europe/Paris":20260105T090000');
  assert.equal(p.name, "DTSTART"); assert.equal(p.params.TZID, "Europe/Paris"); assert.equal(p.value, "20260105T090000");
  assert.equal(parseContentLine("no colon here"), null);
});

test("parseTime rejects impossible dates and times", () => {
  assert.ok(parseTime("20260230").error);
  assert.ok(parseTime("20260105T250000").error);
  assert.ok(parseTime("2026-01-05").error);
  assert.equal(parseTime("20260105T090000Z").utc, true);
  assert.equal(parseTime("20240229").kind, "date");
});

test("a clean calendar has no findings", () => {
  const r = validate(sampleFile());
  assert.deepEqual(r.findings, []);
  assert.equal(r.summary.events, 1);
});

test("structure: missing VCALENDAR, unclosed and unmatched components", () => {
  assert.ok(has(validate("<html>hello</html>"), /No VCALENDAR/));
  assert.ok(has(validate("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:x\r\nBEGIN:VEVENT\r\nEND:VCALENDAR\r\n"), /never closed|without a matching/));
  assert.ok(has(validate("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:x\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"), /without a matching BEGIN/));
});

test("required calendar and event properties", () => {
  const r = validate("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20260105T090000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n");
  for (const re of [/no VERSION/, /no PRODID/, /no UID/, /no DTSTAMP/]) assert.ok(has(r, re), String(re));
});

test("DTEND checks: before start, mismatched type, zero-length all-day, and with DURATION", () => {
  assert.ok(has(validate(cal(vevent("DTSTART:20260105T100000Z", "DTEND:20260105T090000Z"))), /ends before/));
  assert.ok(has(validate(cal(vevent("DTSTART:20260105", "DTEND:20260106T000000Z"))), /different types/));
  assert.ok(has(validate(cal(vevent("DTSTART;VALUE=DATE:20260105", "DTEND;VALUE=DATE:20260105"))), /zero length/));
  assert.ok(has(validate(cal(vevent("DTSTART:20260105T100000Z", "DTEND:20260105T110000Z", "DURATION:PT1H"))), /both DTEND and DURATION/));
});

test("an equal DTEND on a timed event is not flagged as all-day zero length", () => {
  assert.ok(!has(validate(cal(vevent("DTSTART:20260105T100000Z", "DTEND:20260105T100000Z", "SUMMARY:x"))), /zero length/));
});

test("time zones: TZID without VTIMEZONE warns, with it does not, UTC never does", () => {
  const ev = vevent("DTSTART;TZID=America/New_York:20260105T090000", "SUMMARY:x");
  assert.ok(has(validate(cal(ev)), /no VTIMEZONE/));
  const withTz = cal("BEGIN:VTIMEZONE\r\nTZID:America/New_York\r\nEND:VTIMEZONE", ev);
  assert.ok(!has(validate(withTz), /no VTIMEZONE/));
  assert.ok(!has(validate(cal(vevent("DTSTART:20260105T090000Z", "SUMMARY:x"))), /VTIMEZONE/));
});

test("floating time is information, not an error", () => {
  const r = validate(cal(vevent("DTSTART:20260105T090000", "SUMMARY:x")));
  assert.equal(r.summary.errors, 0);
  assert.ok(r.findings.some((f) => f.severity === "info" && /floating/.test(f.title)));
});

test("RRULE: no FREQ, COUNT with UNTIL, UNTIL type mismatch and non-UTC UNTIL", () => {
  assert.ok(has(validate(cal(vevent("DTSTART:20260105T090000Z", "RRULE:BYDAY=MO", "SUMMARY:x"))), /no FREQ/));
  assert.ok(has(validate(cal(vevent("DTSTART:20260105T090000Z", "RRULE:FREQ=DAILY;COUNT=3;UNTIL=20260201T000000Z", "SUMMARY:x"))), /COUNT and UNTIL/));
  assert.ok(has(validate(cal(vevent("DTSTART:20260105T090000Z", "RRULE:FREQ=DAILY;UNTIL=20260201", "SUMMARY:x"))), /UNTIL type/));
  assert.ok(has(validate(cal(vevent("DTSTART;TZID=Europe/Paris:20260105T090000", "RRULE:FREQ=DAILY;UNTIL=20260201T090000", "SUMMARY:x"))), /UNTIL should be in UTC/));
  assert.ok(has(validate(cal(vevent("DTSTART:20260105T090000Z", "RRULE:FREQ=DAILY;UNTIL=20251201T000000Z", "SUMMARY:x"))), /before DTSTART/));
});

test("duplicate UIDs are flagged unless a RECURRENCE-ID separates them", () => {
  const a = vevent("DTSTART:20260105T090000Z", "SUMMARY:x");
  assert.ok(has(validate(cal(a, a)), /UID repeats/));
  const ov = vevent("DTSTART:20260106T090000Z", "RECURRENCE-ID:20260106T090000Z", "SUMMARY:x");
  assert.ok(!has(validate(cal(a, ov)), /UID repeats/));
});

test("line endings and long lines are reported", () => {
  assert.ok(has(validate(sampleFile().replace(/\r\n/g, "\n")), /LF, not CRLF/));
  assert.ok(has(validate(cal(vevent("DTSTART:20260105T090000Z", "SUMMARY:x", "DESCRIPTION:" + "y".repeat(120)))), /longer than 75/));
});

test("an already-folded long line is not reported", () => {
  const text = cal(vevent("DTSTART:20260105T090000Z", "SUMMARY:x", fold("DESCRIPTION:" + "y".repeat(120))));
  assert.ok(!has(validate(text), /longer than 75/));
});

test("repair makes only provable fixes and the result re-validates cleaner", () => {
  const before = validate(sampleBrokenFile());
  const fix = repair(sampleBrokenFile(), { now: Date.UTC(2026, 0, 2, 3, 4, 5) });
  assert.match(fix.text, /DTSTAMP:20260102T030405Z/);
  assert.match(fix.text, /VERSION:2\.0/);
  assert.match(fix.text, /DTEND;VALUE=DATE:20260211/);
  assert.ok(!/[^\r]\n/.test(fix.text));
  const after = validate(fix.text);
  assert.equal(after.summary.fixable, 0);
  assert.ok(after.summary.errors < before.summary.errors);
  // Unprovable problems stay: both-COUNT-and-UNTIL, bad date, ends-before-start.
  assert.ok(has(after, /COUNT and UNTIL/)); assert.ok(has(after, /bad DTSTART/)); assert.ok(has(after, /ends before/));
});

test("repair is idempotent and leaves a clean file semantically unchanged", () => {
  const once = repair(sampleBrokenFile(), { now: 0 }).text;
  assert.equal(repair(once, { now: 0 }).text, once);
  assert.equal(repair(sampleFile()).changes.length, 0);
});

test("makeUid is deterministic and distinct", () => {
  assert.equal(makeUid("a"), makeUid("a"));
  assert.notEqual(makeUid("a"), makeUid("b"));
});

test("findingsCsv quotes commas and quotes", () => {
  const csv = findingsCsv({ findings: [{ severity: "error", line: 3, title: 'a, "b"', detail: "d", fixable: false }] });
  assert.match(csv, /"a, ""b"""/);
});

test("decodeBuffer handles BOM and UTF-16", () => {
  assert.equal(decodeBuffer(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]).buffer), "A");
  assert.equal(decodeBuffer(new Uint8Array([0xff, 0xfe, 0x41, 0x00]).buffer), "A");
});

const ev = (...p) => cal(vevent("DTSTART:20260105T090000Z", "SUMMARY:t", ...p));

test("RRULE BY* parts are range-checked", () => {
  assert.ok(has(validate(ev("RRULE:FREQ=WEEKLY;BYDAY=MONDAY")), /bad BYDAY value MONDAY/));
  assert.ok(has(validate(ev("RRULE:FREQ=MONTHLY;BYMONTHDAY=32")), /bad BYMONTHDAY/));
  assert.ok(has(validate(ev("RRULE:FREQ=MONTHLY;BYMONTHDAY=0")), /bad BYMONTHDAY/));
  assert.ok(has(validate(ev("RRULE:FREQ=YEARLY;BYMONTH=13")), /bad BYMONTH value 13/));
  assert.ok(has(validate(ev("RRULE:FREQ=DAILY;COUNT=0")), /bad COUNT/));
  assert.ok(has(validate(ev("RRULE:FREQ=WEEKLY;WKST=XX")), /bad WKST/));
  assert.ok(has(validate(ev("RRULE:FREQ=WEEKLY;BYMONTHDAY=5")), /BYMONTHDAY with FREQ=WEEKLY/));
  assert.ok(has(validate(ev("RRULE:FREQ=WEEKLY;BYDAY=2TU")), /needs FREQ=MONTHLY/));
});

test("valid BY* parts raise nothing", () => {
  for (const rule of ["FREQ=MONTHLY;BYDAY=2TU,-1FR", "FREQ=MONTHLY;BYMONTHDAY=1,-1", "FREQ=YEARLY;BYMONTH=1,12;BYDAY=1MO", "FREQ=WEEKLY;BYDAY=MO,WE;WKST=SU;COUNT=10"])
    assert.deepEqual(validate(ev("RRULE:" + rule)).findings, [], rule);
});

test("EXDATE/RDATE must match DTSTART's type and parse", () => {
  assert.ok(has(validate(ev("RRULE:FREQ=DAILY", "EXDATE;VALUE=DATE:20260106")), /EXDATE type does not match/));
  assert.ok(has(validate(ev("RRULE:FREQ=DAILY", "RDATE:20260106")), /RDATE type does not match/));
  assert.ok(has(validate(ev("RRULE:FREQ=DAILY", "EXDATE:2026-01-06")), /bad EXDATE value/));
  assert.deepEqual(validate(ev("RRULE:FREQ=DAILY", "EXDATE:20260106T090000Z,20260107T090000Z")).findings, []);
});
