import { test } from "node:test";
import assert from "node:assert/strict";
import { busyFromIcs, buildIcs } from "./ics.mjs";

const iso = (ms) => new Date(ms).toISOString();
const wrap = (...ev) => `BEGIN:VCALENDAR\r\n${ev.map((e) => `BEGIN:VEVENT\r\n${e}\r\nEND:VEVENT`).join("\r\n")}\r\nEND:VCALENDAR`;

test("single events in UTC, a named zone and as all-day", () => {
  const b = busyFromIcs(wrap("DTSTART:20261019T140000Z\r\nDTEND:20261019T150000Z", "DTSTART;TZID=America/New_York:20261020T090000\r\nDURATION:PT30M", "DTSTART;VALUE=DATE:20261021\r\nDTEND;VALUE=DATE:20261022"), { tz: "America/New_York" });
  assert.deepEqual(b.map((x) => [iso(x.start), (x.end - x.start) / 60000]), [["2026-10-19T14:00:00.000Z", 60], ["2026-10-20T13:00:00.000Z", 30], ["2026-10-21T04:00:00.000Z", 1440]]);
});

test("weekly repeats with BYDAY, COUNT and EXDATE stay on the local clock across daylight saving", () => {
  const b = busyFromIcs(wrap("DTSTART;TZID=America/New_York:20261026T100000\r\nDTEND;TZID=America/New_York:20261026T110000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6\r\nEXDATE;TZID=America/New_York:20261028T100000"), { tz: "UTC" });
  assert.deepEqual(b.map((x) => iso(x.start)), ["2026-10-26T14:00:00.000Z", "2026-11-02T15:00:00.000Z", "2026-11-04T15:00:00.000Z", "2026-11-09T15:00:00.000Z", "2026-11-11T15:00:00.000Z"]); // the excluded Oct 28 still counts toward COUNT=6
});

test("daily, monthly and UNTIL rules", () => {
  const d = busyFromIcs(wrap("DTSTART:20261001T090000Z\r\nDTEND:20261001T093000Z\r\nRRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261007T235959Z"), { tz: "UTC" });
  assert.deepEqual(d.map((x) => iso(x.start).slice(0, 10)), ["2026-10-01", "2026-10-03", "2026-10-05", "2026-10-07"]);
  const m = busyFromIcs(wrap("DTSTART:20260131T090000Z\r\nDTEND:20260131T100000Z\r\nRRULE:FREQ=MONTHLY;COUNT=3"), { tz: "UTC" });
  assert.deepEqual(m.map((x) => iso(x.start).slice(0, 10)), ["2026-01-31", "2026-03-31", "2026-05-31"]);
});

test("cancelled and free events do not block, folded lines and junk are tolerated", () => {
  const b = busyFromIcs(wrap("DTSTART:20261019T140000Z\r\nDTEND:20261019T150000Z\r\nSTATUS:CANCELLED", "DTSTART:20261019T160000Z\r\nDTEND:20261019T170000Z\r\nTRANSP:TRANSPARENT", "DTSTART:20261019T180000Z\r\nDTEND:20261019T190000Z\r\nSUMMARY:Long\r\n  title"), {});
  assert.equal(b.length, 1);
  assert.deepEqual(busyFromIcs("not a calendar at all"), []);
  assert.deepEqual(busyFromIcs(wrap("DTSTART:garbage\r\nDTEND:garbage")), []);
});

test("window and size caps hold", () => {
  const rule = wrap("DTSTART:20200101T090000Z\r\nDTEND:20200101T093000Z\r\nRRULE:FREQ=DAILY");
  const b = busyFromIcs(rule, { from: Date.UTC(2026, 9, 1), to: Date.UTC(2026, 9, 8) });
  assert.equal(b.length, 7, "a rule that began years ago still lands in the window");
  assert.ok(busyFromIcs(wrap("DTSTART:20261001T090000Z\r\nDTEND:20261001T093000Z\r\nRRULE:FREQ=DAILY"), { max: 5 }).length <= 5);
});

test("an exported booking escapes text, folds long lines and carries the attendee", () => {
  const ics = buildIcs({ uid: "u1", start: Date.UTC(2026, 9, 19, 14), end: Date.UTC(2026, 9, 19, 15), title: "Call; with, Ann", description: "line1\nline2 " + "x".repeat(200), attendee: { name: "Ann", email: "ann@x.com" }, now: Date.UTC(2026, 9, 1) });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/); assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.match(ics, /SUMMARY:Call\; with\\, Ann\r\n/); assert.match(ics, /DTSTART:20261019T140000Z/); assert.match(ics, /ATTENDEE;CN=Ann;RSVP=FALSE:mailto:ann@x\.com/);
  for (const l of ics.split("\r\n")) assert.ok(Buffer.byteLength(l) <= 75, l);
  assert.match(ics, /line1\\nline2/);
});
