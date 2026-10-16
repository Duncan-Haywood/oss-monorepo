import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, updateSettings, upsertType, removeType, slotsFor, book, reschedule, cancel, upcoming, dueReminders, purgeOlderThan, toCsv, isEmail } from "./book.mjs";

const NOW = Date.UTC(2026, 9, 19, 12, 0); // Monday 08:00 in New York
function setup(over = {}) {
  const s = newState();
  updateSettings(s, { tz: "America/New_York", name: "Ann Coaching", weekly: "weekdays 09:00-17:00" });
  upsertType(s, { name: "Intro call", minutes: 30, buffer: 0, notice: 60, ...over });
  return s;
}
const first = (s, slug = "intro-call") => slotsFor(s, s.types[slug], { now: NOW, from: NOW, to: NOW + 2 * 86_400_000 })[0];

test("settings reject bad zones, hours, feeds and emails with a reason", () => {
  const s = newState();
  assert.throws(() => updateSettings(s, { tz: "Mars/Base" }), /unknown time zone/);
  assert.throws(() => updateSettings(s, { weekly: "mon 9" }), /cannot read|bad hours/);
  assert.throws(() => updateSettings(s, { icsUrl: "http://cal.example/a.ics" }), /https/);
  assert.throws(() => updateSettings(s, { icsUrl: "https://u:p@cal.example/a.ics" }), /user name/);
  assert.throws(() => updateSettings(s, { hostEmail: "nope" }), /email/);
  updateSettings(s, { icsUrl: "" });
});

test("meeting types are validated and keyed by a safe slug", () => {
  const s = newState();
  assert.equal(upsertType(s, { name: "  Strategy <b>session</b>! " }).slug, "strategy-b-session-b");
  assert.throws(() => upsertType(s, { name: "x", minutes: "3" }), /5 to 480/);
  assert.throws(() => upsertType(s, { name: "" }), /name/);
  assert.throws(() => upsertType(s, { name: "!!!" }), /letters/);
  assert.throws(() => upsertType(s, { name: "x", weekly: "garbage" }));
  assert.equal(upsertType(s, { name: "Short", minutes: "15" }).step, 15);
  assert.ok(removeType(s, "short")); assert.ok(!removeType(s, "short"));
});

test("booking takes the slot, and the same slot cannot be booked twice", () => {
  const s = setup(); const start = first(s);
  assert.equal(new Date(start).toISOString(), "2026-10-19T13:00:00.000Z");
  const a = book(s, "intro-call", { name: "Bo", email: "BO@x.com", start, tz: "Europe/Berlin" }, NOW);
  assert.equal(a.booking.email, "bo@x.com"); assert.equal(a.booking.tz, "Europe/Berlin"); assert.equal(a.booking.end - a.booking.start, 1_800_000);
  const b = book(s, "intro-call", { name: "Cy", email: "cy@x.com", start }, NOW);
  assert.equal(b.status, 409);
  assert.ok(!slotsFor(s, s.types["intro-call"], { now: NOW, from: NOW, to: NOW + 86_400_000 }).includes(start));
});

test("times that were never offered are refused", () => {
  const s = setup();
  for (const start of [first(s) + 60_000, Date.UTC(2026, 9, 19, 3), NOW - 86_400_000, "soon", NaN]) assert.ok(book(s, "intro-call", { name: "Bo", email: "bo@x.com", start }, NOW).error, String(start));
  assert.equal(book(s, "nope", { name: "Bo", email: "bo@x.com", start: first(s) }, NOW).status, 404);
  assert.equal(book(s, "intro-call", { name: "", email: "bo@x.com", start: first(s) }, NOW).status, 400);
  assert.equal(book(s, "intro-call", { name: "Bo", email: "not-an-email", start: first(s) }, NOW).status, 400);
});

test("one address cannot hold more than three upcoming bookings", () => {
  const s = setup(); const slots = slotsFor(s, s.types["intro-call"], { now: NOW, from: NOW, to: NOW + 3 * 86_400_000 });
  for (let i = 0; i < 3; i++) assert.ok(book(s, "intro-call", { name: "Bo", email: "bo@x.com", start: slots[i] }, NOW).booking);
  assert.equal(book(s, "intro-call", { name: "Bo", email: "bo@x.com", start: slots[3] }, NOW).status, 429);
  assert.ok(book(s, "intro-call", { name: "Cy", email: "cy@x.com", start: slots[3] }, NOW).booking);
});

test("an external calendar event blocks the time", () => {
  const s = setup(); const start = first(s);
  const ext = [{ start, end: start + 3_600_000 }];
  assert.equal(book(s, "intro-call", { name: "Bo", email: "bo@x.com", start }, NOW, ext).status, 409);
  assert.ok(book(s, "intro-call", { name: "Bo", email: "bo@x.com", start: start + 3_600_000 }, NOW, ext).booking);
});

test("rescheduling frees the old time and refuses a taken one; cancelling frees the time", () => {
  const s = setup(); const sl = slotsFor(s, s.types["intro-call"], { now: NOW, from: NOW, to: NOW + 86_400_000 });
  const a = book(s, "intro-call", { name: "Bo", email: "bo@x.com", start: sl[0] }, NOW).booking;
  const c = book(s, "intro-call", { name: "Cy", email: "cy@x.com", start: sl[1] }, NOW).booking;
  assert.equal(reschedule(s, a, sl[1], NOW).status, 409);
  assert.ok(reschedule(s, a, sl[2], NOW).booking); assert.equal(a.rev, 1);
  assert.ok(slotsFor(s, s.types["intro-call"], { now: NOW, from: NOW, to: NOW + 86_400_000 }).includes(sl[0]));
  assert.ok(reschedule(s, a, a.start, NOW).booking, "choosing the current time again is allowed");
  assert.ok(cancel(c, "invitee", NOW, "can't make it\nthanks")); assert.ok(!cancel(c, "invitee", NOW));
  assert.equal(c.reason, "can't make it thanks");
  assert.equal(reschedule(s, c, sl[3], NOW).status, 409, "a cancelled booking stays cancelled");
  assert.ok(book(s, "intro-call", { name: "Di", email: "di@x.com", start: sl[1] }, NOW).booking);
});

test("a daily cap closes the day once reached", () => {
  const s = setup({ maxPerDay: 2 }); const sl = slotsFor(s, s.types["intro-call"], { now: NOW, from: NOW, to: NOW + 86_400_000 });
  book(s, "intro-call", { name: "A", email: "a@x.com", start: sl[0] }, NOW); book(s, "intro-call", { name: "B", email: "b@x.com", start: sl[4] }, NOW);
  assert.deepEqual(slotsFor(s, s.types["intro-call"], { now: NOW, from: NOW, to: NOW + 86_400_000 }), []);
});

test("reminders come due once, inside the window, for upcoming confirmed bookings only", () => {
  const s = setup({ reminderMinutes: 1440 }); const start = first(s);
  const a = book(s, "intro-call", { name: "A", email: "a@x.com", start }, NOW).booking;
  assert.deepEqual(dueReminders(s, NOW).map((b) => b.id), [a.id]);
  a.reminded = true; assert.deepEqual(dueReminders(s, NOW), []);
  const s2 = setup({ reminderMinutes: 0 }); book(s2, "intro-call", { name: "A", email: "a@x.com", start: first(s2) }, NOW); assert.deepEqual(dueReminders(s2, NOW), []);
  const s3 = setup({ reminderMinutes: 30 }); book(s3, "intro-call", { name: "A", email: "a@x.com", start: first(s3) }, NOW); assert.deepEqual(dueReminders(s3, NOW), [], "not yet inside 30 minutes");
});

test("retention removes old bookings and CSV is formula safe", () => {
  const s = setup(); const b = book(s, "intro-call", { name: "=HYPERLINK(1)", email: "a@x.com", start: first(s), notes: 'say "hi", ok' }, NOW).booking;
  const csv = toCsv(s); assert.match(csv, /'=HYPERLINK\(1\)/); assert.match(csv, /"say ""hi"", ok"/);
  assert.equal(purgeOlderThan(s, 30, NOW), 0); assert.equal(purgeOlderThan(s, 30, b.end + 31 * 86_400_000), 1); assert.equal(upcoming(s, NOW).length, 0);
  assert.ok(isEmail("a@b.co")); assert.ok(!isEmail("a b@c.co")); assert.ok(!isEmail('a"@c.co'));
});
