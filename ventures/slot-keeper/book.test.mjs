import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, saveEvent, book, cancel, slotsFor, feedBusy, dueReminders, purgeOlderThan, summary, toCsv, byToken, formFor } from "./book.mjs";
import { zonedToUtc } from "./slot.mjs";

const NY = "America/New_York", NOW = zonedToUtc(2026, 10, 14, 8, 0, NY);
const setup = (o = {}) => { const s = newState(); const r = saveEvent(s, { name: "Intro call", minutes: 30, tz: NY, hours: "mon-fri 09:00-12:00", noticeMin: 0, horizonDays: 14, ...o }); assert.deepEqual(r.errors, []); return s; };
const ann = (s, start, extra = {}) => book(s, "intro-call", { name: "Ann", email: "Ann@Example.com", start, tz: "Europe/London", ...extra }, NOW);

test("an event type validates its zone and hours and slugs its name", () => {
  const s = newState();
  assert.ok(saveEvent(s, { name: "x", tz: "Mars/Base", hours: "mon 09:00-10:00" }).errors[0].includes("Mars"));
  assert.ok(saveEvent(s, { name: "x", tz: NY, hours: "" }).errors[0].includes("weekly hours"));
  assert.ok(saveEvent(s, { name: "", hours: "mon 09:00-10:00" }).errors.length);
  const r = saveEvent(s, { name: "30 min: Intro & Chat!", tz: NY, hours: "mon 09:00-10:00", minutes: "9999", closed: "2026-12-25, nope" });
  assert.equal(r.event.id, "30-min-intro-chat");
  assert.equal(r.event.minutes, 480);
  assert.deepEqual(r.event.closed, ["2026-12-25"]);
  assert.equal(formFor(r.event).hours, "mon 09:00-10:00");
});

test("booking takes the slot, lowercases the email and returns secrets only in the booking", () => {
  const s = setup(); const t = slotsFor(s, s.events["intro-call"], NOW)[0];
  const r = ann(s, t);
  assert.equal(r.booking.email, "ann@example.com");
  assert.equal(r.booking.end - r.booking.start, 30 * 60_000);
  assert.ok(r.booking.token.length >= 20);
  assert.ok(!slotsFor(s, s.events["intro-call"], NOW).includes(t));
});

test("the same slot cannot be booked twice, and a forged time is refused", () => {
  const s = setup(); const t = slotsFor(s, s.events["intro-call"], NOW)[0];
  assert.ok(ann(s, t).booking);
  assert.equal(book(s, "intro-call", { name: "Bob", email: "bob@example.com", start: t }, NOW).status, 409);
  assert.equal(book(s, "intro-call", { name: "Bob", email: "bob@example.com", start: t + 60_000 }, NOW).status, 409, "off-grid start");
  assert.equal(book(s, "intro-call", { name: "Bob", email: "bob@example.com", start: "abc" }, NOW).status, 409);
  assert.equal(book(s, "intro-call", { name: "Bob", email: "nope", start: t + 1_800_000 }, NOW).status, 400);
  assert.equal(book(s, "missing", { name: "Bob", email: "b@example.com", start: t }, NOW).status, 404);
});

test("a busy calendar feed blocks slots at booking time too", () => {
  const s = setup(); const t = slotsFor(s, s.events["intro-call"], NOW)[0];
  assert.equal(book(s, "intro-call", { name: "Bob", email: "b@example.com", start: t }, NOW, [{ start: t - 1000, end: t + 1000 }]).status, 409);
});

test("event buffers keep bookings apart", () => {
  const s = setup({ bufferAfter: 30 }); const t = slotsFor(s, s.events["intro-call"], NOW)[0];
  assert.ok(ann(s, t).booking);
  assert.equal(book(s, "intro-call", { name: "B", email: "b@example.com", start: t + 1_800_000 }, NOW).status, 409);
  assert.ok(book(s, "intro-call", { name: "B", email: "b@example.com", start: t + 3_600_000 }, NOW).booking);
});

test("reschedule moves the booking only for the same email and token, and frees the old slot", () => {
  const s = setup(); const [t1, t2] = slotsFor(s, s.events["intro-call"], NOW);
  const first = ann(s, t1).booking;
  assert.equal(ann(s, t2, { reschedule: first.token, email: "other@example.com" }).status, 400);
  assert.equal(ann(s, t2, { reschedule: "bogus" }).status, 400);
  const moved = ann(s, t2, { reschedule: first.token });
  assert.equal(moved.booking.rescheduledFrom, first.id);
  assert.equal(s.bookings[first.id].status, "cancelled");
  assert.ok(slotsFor(s, s.events["intro-call"], NOW).includes(t1));
  assert.ok(ann(s, t1, { reschedule: moved.booking.token }).booking, "can move onto its own old slot");
});

test("rescheduling onto the slot being vacated overlap is allowed, taking a held slot is not", () => {
  const s = setup(); const [t1, t2] = slotsFor(s, s.events["intro-call"], NOW);
  const a = ann(s, t1).booking;
  book(s, "intro-call", { name: "B", email: "b@example.com", start: t2 }, NOW);
  assert.equal(ann(s, t2, { reschedule: a.token }).status, 409);
  assert.equal(s.bookings[a.id].status, "confirmed", "a failed reschedule leaves the original in place");
});

test("cancel is idempotent and frees the slot", () => {
  const s = setup(); const t = slotsFor(s, s.events["intro-call"], NOW)[0];
  const b = ann(s, t).booking;
  assert.ok(cancel(s, b, "invitee", NOW)); assert.ok(!cancel(s, b, "host", NOW));
  assert.ok(slotsFor(s, s.events["intro-call"], NOW).includes(t));
  assert.equal(byToken(s, b.token).cancelledBy, "invitee");
});

test("one address cannot hold more than five upcoming bookings", () => {
  const s = setup(); const slots = slotsFor(s, s.events["intro-call"], NOW);
  for (let i = 0; i < 5; i++) assert.ok(ann(s, slots[i]).booking);
  assert.equal(ann(s, slots[5]).status, 429);
});

test("reminders go out once, inside the window, never for brand-new or cancelled bookings", () => {
  const s = setup(); const slots = slotsFor(s, s.events["intro-call"], NOW);
  const b = ann(s, slots[0]).booking; const c = ann(s, slots[1]).booking; cancel(s, c, "host", NOW);
  assert.deepEqual(dueReminders(s, NOW + 31 * 60_000, 24).map((x) => x.id), [b.id]);
  assert.deepEqual(dueReminders(s, NOW + 60_000, 24), [], "just booked: no reminder");
  assert.deepEqual(dueReminders(s, NOW + 31 * 60_000, 0), []);
  b.remindedAt = NOW; assert.deepEqual(dueReminders(s, NOW + 31 * 60_000, 24), []);
});

test("retention, summary and CSV (formula-safe)", () => {
  const s = setup(); const slots = slotsFor(s, s.events["intro-call"], NOW);
  ann(s, slots[0], { name: "=HYPERLINK(\"http://x\")", notes: "a, b\nc" }); const c = ann(s, slots[1], { email: "z@example.com" }).booking; cancel(s, c, "invitee", NOW);
  assert.deepEqual(summary(s, NOW), { upcoming: 1, next7: 1, past: 0, cancelled: 1, cancelRate: 50 });
  const csv = toCsv(s);
  assert.match(csv, /'=HYPERLINK/); assert.match(csv, /"a, b\nc"/);
  assert.equal(purgeOlderThan(s, NOW + 40 * 86_400_000, 30), 2);
  assert.equal(purgeOlderThan(s, NOW, 0), 0);
});

test("a calendar feed that is stale or never loaded blocks every slot instead of risking a double booking", () => {
  const s = setup(); const ev = s.events["intro-call"];
  const open = slotsFor(s, ev, NOW, []).length; assert.ok(open > 0);
  const fresh = { busy: [], at: NOW - 30 * 60_000 };
  assert.equal(slotsFor(s, ev, NOW, feedBusy(fresh, NOW)).length, open);
  assert.equal(slotsFor(s, ev, NOW, feedBusy({ busy: [], at: NOW - 61 * 60_000 }, NOW)).length, 0);
  assert.equal(slotsFor(s, ev, NOW, feedBusy({ busy: [], at: 0 }, NOW)).length, 0);
  assert.equal(slotsFor(s, ev, NOW, feedBusy({ busy: [], at: 0 }, NOW, { configured: false })).length, open); // no feed configured: nothing to distrust
  const refused = book(s, "intro-call", { name: "Ann", email: "a@b.co", start: slotsFor(s, ev, NOW, [])[0], tz: NY }, NOW, feedBusy({ busy: [], at: 0 }, NOW));
  assert.equal(refused.status, 409); assert.equal(Object.keys(s.bookings).length, 0);
});
