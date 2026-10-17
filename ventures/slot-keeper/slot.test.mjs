import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHours, hoursText, zonedToUtc, tzParts, freeSlots, groupByDay, parseIcsBusy, buildIcs, dateKey, fmtTime, validTz } from "./slot.mjs";

const NY = "America/New_York";
const ev = (o = {}) => ({ id: "intro", minutes: 30, tz: NY, hours: parseHours("mon-fri 09:00-12:00").hours, horizonDays: 14, noticeMin: 0, ...o });
// Wednesday 2026-10-14 08:00 in New York (EDT, UTC-4)
const NOW = zonedToUtc(2026, 10, 14, 8, 0, NY);

test("weekly hours parse, merge and round-trip", () => {
  const { hours, errors } = parseHours("mon-fri 09:00-12:00,11:00-13:00; sat 10:00-12:00");
  assert.deepEqual(errors, []);
  assert.deepEqual(hours.mon, [[540, 780]]);
  assert.equal(hoursText(hours), "mon 09:00-13:00; tue 09:00-13:00; wed 09:00-13:00; thu 09:00-13:00; fri 09:00-13:00; sat 10:00-12:00");
  assert.ok(parseHours("funday 9-5").errors.length && parseHours("mon 17:00-09:00").errors.length);
  assert.deepEqual(parseHours("fri-mon 09:00-10:00").hours.sun, [[540, 600]]);
});

test("zones: offsets, DST gap and overlap", () => {
  assert.equal(new Date(zonedToUtc(2026, 10, 14, 9, 0, NY)).toISOString(), "2026-10-14T13:00:00.000Z");
  assert.equal(new Date(zonedToUtc(2026, 12, 14, 9, 0, NY)).toISOString(), "2026-12-14T14:00:00.000Z");
  assert.equal(zonedToUtc(2026, 3, 8, 2, 30, NY), null, "2:30 does not exist on spring-forward day");
  assert.equal(new Date(zonedToUtc(2026, 3, 8, 3, 0, NY)).toISOString(), "2026-03-08T07:00:00.000Z");
  assert.equal(new Date(zonedToUtc(2026, 10, 14, 9, 0, "Asia/Kolkata")).toISOString(), "2026-10-14T03:30:00.000Z");
  assert.deepEqual([tzParts(NOW, NY).h, tzParts(NOW, NY).dow], [8, 3]);
  assert.ok(validTz("Europe/Paris") && !validTz("Mars/Base") && !validTz(""));
});

test("slots respect hours, notice, horizon and weekends", () => {
  const s = freeSlots(ev(), [], NOW);
  assert.equal(s[0], zonedToUtc(2026, 10, 14, 9, 0, NY));
  assert.equal(groupByDay(s, NY).get("2026-10-14").length, 6);
  assert.ok(![...groupByDay(s, NY).keys()].some((k) => ["2026-10-17", "2026-10-18"].includes(k)));
  assert.equal(freeSlots(ev({ noticeMin: 24 * 60 + 90 }), [], NOW)[0], zonedToUtc(2026, 10, 15, 9, 30, NY));
  assert.ok(freeSlots(ev({ horizonDays: 1 }), [], NOW).every((x) => x <= NOW + 86_400_000));
  assert.equal(freeSlots(ev({ closed: ["2026-10-14"] }), [], NOW)[0], zonedToUtc(2026, 10, 15, 9, 0, NY));
});

test("a booking and its buffers remove neighbouring slots", () => {
  const at = zonedToUtc(2026, 10, 14, 10, 0, NY);
  const busy = [{ id: "b1", event: "intro", start: at, end: at + 30 * 60_000 }];
  const hours = (s) => s.filter((x) => dateKey(x, NY) === "2026-10-14").map((x) => fmtTime(x, NY));
  assert.deepEqual(hours(freeSlots(ev(), busy, NOW)), ["9:00 AM", "9:30 AM", "10:30 AM", "11:00 AM", "11:30 AM"]);
  assert.deepEqual(hours(freeSlots(ev({ bufferBefore: 15, bufferAfter: 15 }), busy, NOW)), ["9:00 AM", "11:00 AM", "11:30 AM"]);
  assert.equal(freeSlots(ev(), busy, NOW, { ignore: "b1" }).filter((x) => x === at).length, 1, "rescheduling frees the old slot");
});

test("a booking's own buffer protects it from other event types", () => {
  const at = zonedToUtc(2026, 10, 14, 10, 0, NY);
  const busy = [{ id: "b", event: "other", start: at, end: at + 30 * 60_000, before: 0, after: 30 }];
  const t = freeSlots(ev(), busy, NOW).filter((x) => dateKey(x, NY) === "2026-10-14").map((x) => fmtTime(x, NY));
  assert.ok(!t.includes("10:30 AM") && t.includes("11:00 AM"));
});

test("maxPerDay closes a day once it is full", () => {
  const a = zonedToUtc(2026, 10, 14, 9, 0, NY);
  const busy = [{ id: "1", event: "intro", start: a, end: a + 1_800_000 }, { id: "2", event: "intro", start: a + 3_600_000, end: a + 5_400_000 }];
  assert.ok(!freeSlots(ev({ maxPerDay: 2 }), busy, NOW).some((x) => dateKey(x, NY) === "2026-10-14"));
  assert.ok(freeSlots(ev({ maxPerDay: 3 }), busy, NOW).some((x) => dateKey(x, NY) === "2026-10-14"));
});

test("no slot lands in the spring-forward gap and the day keeps its other slots", () => {
  const e = ev({ hours: parseHours("sun 01:00-04:00").hours, horizonDays: 7 });
  const now = zonedToUtc(2026, 3, 5, 8, 0, NY);
  const s = freeSlots(e, [], now).map((x) => fmtTime(x, NY));
  assert.deepEqual(s, ["1:00 AM", "1:30 AM", "3:00 AM", "3:30 AM"]);
});

test("the same slot reads differently for an invitee in another zone", () => {
  const s = freeSlots(ev(), [], NOW)[0];
  assert.equal(fmtTime(s, NY), "9:00 AM");
  assert.equal(fmtTime(s, "Europe/London"), "2:00 PM");
  assert.equal(fmtTime(s, "Asia/Tokyo"), "10:00 PM");
});

const feed = (body) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}END:VCALENDAR\r\n`;
const day = (n) => 86_400_000 * n;

test("busy feed: UTC, TZID, all-day, duration, cancelled and free events", () => {
  const busy = parseIcsBusy(feed(
    "BEGIN:VEVENT\r\nDTSTART:20261014T140000Z\r\nDTEND:20261014T150000Z\r\nEND:VEVENT\r\n" +
    "BEGIN:VEVENT\r\nDTSTART;TZID=America/New_York:20261015T100000\r\nDURATION:PT45M\r\nEND:VEVENT\r\n" +
    "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261016\r\nEND:VEVENT\r\n" +
    "BEGIN:VEVENT\r\nDTSTART:20261014T160000Z\r\nDTEND:20261014T170000Z\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\n" +
    "BEGIN:VEVENT\r\nDTSTART:20261014T170000Z\r\nDTEND:20261014T180000Z\r\nTRANSP:TRANSPARENT\r\nEND:VEVENT\r\n"), NOW, NOW + day(10), NY);
  assert.equal(busy.length, 3);
  assert.equal(new Date(busy[0].start).toISOString(), "2026-10-14T14:00:00.000Z");
  assert.equal(busy[1].end - busy[1].start, 45 * 60_000);
  assert.equal(busy[2].end - busy[2].start, day(1));
  const s = freeSlots(ev(), busy, NOW).filter((x) => dateKey(x, NY) === "2026-10-14").map((x) => fmtTime(x, NY));
  assert.ok(!s.includes("10:00 AM") && !s.includes("10:30 AM") && s.includes("9:30 AM"), "a 14:00Z meeting blocks 10:00-11:00 New York");
});

test("busy feed: weekly rules keep wall-clock time across DST, COUNT, UNTIL, EXDATE and folded lines", () => {
  const weekly = parseIcsBusy(feed("BEGIN:VEVENT\r\nDTSTART;TZID=America/New_York:20261026T100000\r\nDTEND;TZID=America/New_York:20261026T110000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,TH\r\nEND:VEVENT\r\n"), zonedToUtc(2026, 10, 26, 0, 0, NY), zonedToUtc(2026, 11, 10, 0, 0, NY), NY);
  assert.deepEqual(weekly.map((b) => new Date(b.start).toISOString()), ["2026-10-26T14:00:00.000Z", "2026-10-29T14:00:00.000Z", "2026-11-02T15:00:00.000Z", "2026-11-05T15:00:00.000Z", "2026-11-09T15:00:00.000Z"]);
  const counted = parseIcsBusy(feed("BEGIN:VEVENT\r\nDTSTART:20261014T140000Z\r\nDTEND:20261014T150000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEXDATE:20261015T140000Z\r\nEND:VEVENT\r\n"), NOW, NOW + day(30), NY);
  assert.equal(counted.length, 2);
  const until = parseIcsBusy(feed("BEGIN:VEVENT\r\nDTSTART:20261014T140000Z\r\nDTEND:20261014T150000Z\r\nRRULE:FREQ=DAILY;UNTIL=20261016T235959Z\r\nEND:VEVENT\r\n"), NOW, NOW + day(30), NY);
  assert.equal(until.length, 3);
  const folded = parseIcsBusy("BEGIN:VEVENT\r\nDTSTART:20261014T14\r\n 0000Z\r\nDTEND:20261014T150000Z\r\nEND:VEVENT\r\n", NOW, NOW + day(2), NY);
  assert.equal(folded.length, 1);
  const odd = parseIcsBusy(feed("BEGIN:VEVENT\r\nDTSTART:20261014T140000Z\r\nDTEND:20261014T150000Z\r\nRRULE:FREQ=MONTHLY;BYSETPOS=1;BYDAY=MO\r\nEND:VEVENT\r\n"), NOW, NOW + day(30), NY);
  assert.equal(odd.length, 1);
  assert.deepEqual(odd.unsupported, ["MONTHLY"]);
});

test("busy feed: garbage in does not throw or invent time", () => {
  assert.deepEqual([...parseIcsBusy("not a calendar", NOW, NOW + day(5))], []);
  assert.deepEqual([...parseIcsBusy(feed("BEGIN:VEVENT\r\nDTSTART:soon\r\nEND:VEVENT\r\n"), NOW, NOW + day(5))], []);
});

test("invitation text: UID, UTC times, escaping, folding and cancel method", () => {
  const ics = buildIcs({ uid: "b1@slot", start: Date.UTC(2026, 9, 14, 13), end: Date.UTC(2026, 9, 14, 13, 30), summary: "Intro; with, Ann", description: "Line1\nLine2 " + "x".repeat(200), location: "https://meet.example/abc", organizer: { name: 'Host "H"', email: "h@x.test" }, attendee: { name: "Ann", email: "a@x.test" }, now: Date.UTC(2026, 9, 1) });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261014T130000Z\r\n/);
  assert.match(ics, /SUMMARY:Intro\; with\\, Ann\r\n/);
  assert.match(ics, /METHOD:REQUEST/);
  assert.ok(ics.split("\r\n").every((l) => l.length <= 75));
  assert.match(ics, /ORGANIZER;CN=Host H:mailto:h@x\.test/);
  assert.match(buildIcs({ uid: "b1@slot", start: 0, end: 1, summary: "x", method: "CANCEL", sequence: 1 }), /METHOD:CANCEL[\s\S]*STATUS:CANCELLED/);
  assert.equal(parseIcsBusy(ics, 0, Date.UTC(2027, 0, 1), "UTC").length, 1, "our own invitation reads back as busy time");
});
