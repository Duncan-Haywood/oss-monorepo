import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyDesk, exampleDesk, expandBookings } from "./engine.mjs";
import { openSlots, openingsText, weekGrid, toggleSkip, bookingRequest, approveRequest, requestReply, bookPage, fmt12, fmtRange, weekStart, localMinutes, fitsOpenSlot } from "./slots.mjs";

// 2026-11-02 is a Monday.
function desk() {
  const d = emptyDesk();
  d.profile.availability = "Mon-Fri 15:00-22:00; Sat 08:00-23:30";
  d.families = [{ id: "fam_a", name: "Rivera family", kids: [{ name: "Mia", allergies: "peanuts" }, { name: "Leo" }] }];
  return d;
}
const win = (days, date) => days.find((x) => x.date === date).windows.map((w) => `${w.start}-${w.end}`);

test("time formatting for posts", () => {
  assert.equal(fmt12("15:00"), "3pm");
  assert.equal(fmt12("15:30"), "3:30pm");
  assert.equal(fmt12("00:00"), "12am");
  assert.equal(fmt12("12:00"), "12pm");
  assert.equal(fmtRange("15:00", "22:00"), "3-10pm");
  assert.equal(fmtRange("08:00", "15:00"), "8am-3pm");
  assert.equal(fmtRange("18:00", "00:30"), "6pm-12:30am");
  assert.equal(weekStart("2026-11-08"), "2026-11-02");
  assert.equal(weekStart("2026-11-02"), "2026-11-02");
});

test("with nothing booked the open slots are the weekly availability", () => {
  const days = openSlots(desk(), { from: "2026-11-02" });
  assert.equal(days.length, 7);
  assert.deepEqual(win(days, "2026-11-03"), ["15:00-22:00"]);
  assert.deepEqual(win(days, "2026-11-07"), ["08:00-23:30"]);
  assert.deepEqual(win(days, "2026-11-08"), []);
  assert.ok(days[0].windows[0].full);
});

test("a booked sit and its travel buffer come out; short leftovers are dropped", () => {
  const d = desk();
  d.bookings = [{ id: "b1", familyId: "fam_a", date: "2026-11-03", start: "16:00", end: "19:00", status: "scheduled" }];
  // Tue 15:00-22:00 minus 15:30-19:30: 15:00-15:30 is under the 3 h minimum, 19:30-22:00 is 2.5 h.
  assert.deepEqual(win(openSlots(d, { from: "2026-11-02" }), "2026-11-03"), []);
  assert.deepEqual(win(openSlots(d, { from: "2026-11-02", minHours: 2 }), "2026-11-03"), ["19:30-22:00"]);
  assert.deepEqual(win(openSlots(d, { from: "2026-11-02", minHours: 2, bufferMin: 0 }), "2026-11-03"), ["19:00-22:00"]);
  d.bookings[0].status = "cancelled";
  assert.deepEqual(win(openSlots(d, { from: "2026-11-02" }), "2026-11-03"), ["15:00-22:00"]);
});

test("weekly repeats block every week except a skipped date", () => {
  const d = desk();
  d.bookings = [{ id: "b1", familyId: "fam_a", date: "2026-11-02", start: "15:00", end: "18:00", status: "scheduled", repeatWeeks: 4, skip: ["2026-11-09"] }];
  const days = openSlots(d, { from: "2026-11-02", weeks: 3 });
  assert.equal(days.length, 21);
  assert.deepEqual(win(days, "2026-11-02"), ["18:30-22:00"]); // 3.5 h after the sit and a 30 min buffer
  assert.deepEqual(openSlots(d, { from: "2026-11-02", minHours: 4 })[0].windows, []);
  assert.deepEqual(win(days, "2026-11-09"), ["15:00-22:00"]);
  assert.deepEqual(win(days, "2026-11-16"), ["18:30-22:00"]);
});

test("today's window starts no earlier than now, and an overnight sit from yesterday blocks the morning", () => {
  const d = desk();
  d.profile.availability = "Fri 18:00-02:00; Sat 08:00-23:30";
  assert.deepEqual(win(openSlots(d, { from: "2026-11-06" }), "2026-11-06"), ["18:00-02:00"]);
  assert.equal(openSlots(d, { from: "2026-11-06" })[0].windows[0].overnight, true);
  assert.deepEqual(win(openSlots(d, { from: "2026-11-07", nowMin: 13 * 60 }), "2026-11-07"), ["13:00-23:30"]);
  d.bookings = [{ id: "b", date: "2026-11-06", start: "20:00", end: "09:00", status: "scheduled" }];
  assert.deepEqual(win(openSlots(d, { from: "2026-11-06" }), "2026-11-07"), ["09:30-23:30"]);
});

test("openings text reads like a post", () => {
  const d = desk();
  d.bookings = [
    { id: "b1", date: "2026-11-02", start: "15:00", end: "22:00", status: "scheduled" },
    { id: "b2", date: "2026-11-04", start: "15:00", end: "22:00", status: "scheduled" },
    { id: "b3", date: "2026-11-05", start: "18:30", end: "22:00", status: "scheduled" },
    { id: "b4", date: "2026-11-06", start: "15:00", end: "22:00", status: "scheduled" },
  ];
  const text = openingsText(openSlots(d, { from: "2026-11-02", weeks: 2 }), { bookUrl: "https://sit.example/book" });
  const lines = text.split("\n");
  assert.equal(lines[0], "Openings this week: Tue 3-10pm, Thu 3-6pm, Sat all day");
  assert.equal(lines[1], "Openings next week: Mon Nov 9 3-10pm, Tue Nov 10 3-10pm, Wed Nov 11 3-10pm, Thu Nov 12 3-10pm, Fri Nov 13 3-10pm, Sat Nov 14 all day");
  assert.equal(lines[2], "Message me to book! Pick a time: https://sit.example/book");
  d.profile.availability = "Sun off";
  assert.match(openingsText(openSlots(d, { from: "2026-11-02" })), /^I'm fully booked this week\./);
});

test("the week grid shows sits as blocks with allergies, and skipped repeats", () => {
  const d = desk();
  d.bookings = [{ id: "b1", familyId: "fam_a", date: "2026-10-27", start: "15:00", end: "18:00", kids: 2, status: "scheduled", repeatWeeks: 3, skip: ["2026-11-03"] }];
  const g = weekGrid(d, "2026-11-05");
  assert.equal(g.start, "2026-11-02");
  assert.equal(g.days.length, 7);
  assert.equal(g.from, "07:00");
  assert.equal(g.to, "24:00");
  const tue = g.days[1];
  assert.equal(tue.blocks.length, 1);
  assert.equal(tue.blocks[0].skipped, true);
  assert.deepEqual(tue.blocks[0].allergies, ["Mia: peanuts"]);
  assert.equal(tue.blocks[0].family, "Rivera family");
  assert.ok(Math.abs(tue.blocks[0].top - 8 / 17) < 1e-9);
  assert.ok(Math.abs(tue.blocks[0].height - 3 / 17) < 1e-9);
  assert.deepEqual(tue.open.map((w) => w.start), ["15:00"]); // the skipped date is free
  assert.deepEqual(weekGrid(d, "2026-11-05", { today: "2026-11-05" }).days.map((x) => x.open.length), [0, 0, 0, 1, 1, 1, 0]);
});

test("toggleSkip skips and restores one weekly date and refuses dates off the repeat", () => {
  const b = { id: "b1", date: "2026-11-02", start: "15:00", end: "18:00", repeatWeeks: 4, status: "scheduled" };
  const s = toggleSkip(b, "2026-11-16");
  assert.deepEqual(s.skip, ["2026-11-16"]);
  assert.equal(expandBookings([s]).filter((x) => x.status === "cancelled").length, 1);
  assert.deepEqual(toggleSkip(s, "2026-11-16").skip, []);
  assert.throws(() => toggleSkip(b, "2026-11-17"));
  assert.throws(() => toggleSkip(b, "2026-11-30"));
  assert.throws(() => toggleSkip({ ...b, repeatWeeks: 1 }, "2026-11-02"));
  assert.equal(b.skip, undefined);
});

test("a booking request becomes a requested lead only inside an open window", () => {
  const d = desk();
  const ok = bookingRequest({ name: "Jo Park", contact: "jo@example.com", date: "2026-11-03", start: "17:00", end: "21:00", kids: "3, 5" }, d, "2026-11-02", { id: "lead_x" });
  assert.equal(ok.ok, true);
  assert.equal(ok.lead.status, "requested");
  assert.deepEqual(ok.lead.requested, { date: "2026-11-03", start: "17:00", end: "21:00" });
  assert.equal(ok.lead.source, "booking page");
  assert.match(bookingRequest({ name: "A", contact: "b", date: "2026-11-03", start: "14:00", end: "18:00" }, d, "2026-11-02").why, /not open/);
  assert.match(bookingRequest({ name: "A", contact: "b", date: "2026-11-03", start: "17:00", end: "18:00" }, d, "2026-11-02").why, /shortest sit is 3 hours/);
  assert.match(bookingRequest({ name: "", contact: "b", date: "2026-11-03", start: "17:00", end: "21:00" }, d, "2026-11-02").why, /name/);
  assert.match(bookingRequest({ name: "A", contact: "b", date: "nope", start: "17:00", end: "21:00" }, d, "2026-11-02").why, /pick a day/);
  // A pending request holds its time: the same evening cannot be requested twice.
  d.leads.push(ok.lead);
  assert.equal(bookingRequest({ name: "B", contact: "c", date: "2026-11-03", start: "17:00", end: "21:00" }, d, "2026-11-02").ok, false);
  assert.equal(fitsOpenSlot([], "2026-11-03", "17:00", "21:00").ok, false);
});

test("approving a request makes a family and a booking; the input desk is unchanged", () => {
  const d = desk();
  d.leads.push(bookingRequest({ name: "Jo Park", contact: "jo@example.com", date: "2026-11-03", start: "17:00", end: "21:00", kids: "3, 5" }, d, "2026-11-02", { id: "lead_x" }).lead);
  const r = approveRequest(d, "lead_x", { today: "2026-11-02", bookingId: "bk_new", newFamilyId: "fam_new" });
  assert.equal(r.check.ok, true);
  assert.equal(r.booking.status, "scheduled");
  assert.equal(r.booking.kids, 2);
  assert.equal(r.desk.families.at(-1).name, "Park family");
  assert.equal(r.desk.leads[0].status, "booked");
  assert.equal(r.desk.leads[0].bookingId, "bk_new");
  assert.equal(d.leads[0].status, "requested");
  assert.equal(d.bookings.length, 0);
  assert.throws(() => approveRequest(r.desk, "lead_x"));
  const r2 = approveRequest(d, "lead_x", { familyId: "fam_a" });
  assert.equal(r2.desk.families.length, 1);
  assert.equal(r2.booking.familyId, "fam_a");
  assert.match(requestReply(d.leads[0], d.profile, true), /^Hi Jo! You're booked: Tue Nov 3, 5-9pm/);
  assert.match(requestReply(d.leads[0], d.profile, false), /can't take Tue Nov 3/);
});

test("the booking page shows times and never a family, kid, lead or contact", () => {
  const d = exampleDesk("2026-11-02");
  d.leads.push(bookingRequest({ name: "Zed Secretname", contact: "zed@example.com", date: "2026-11-05", start: "18:00", end: "21:30", kids: "2" }, d, "2026-11-02").lead);
  const html = bookPage(d, openSlots(d, { from: "2026-11-02", weeks: 2 }));
  assert.match(html, /Book a sit with Grace Notes Babysitting/);
  assert.match(html, /<option value="2026-11-03"/);
  for (const secret of ["Rivera", "Chen", "Ana", "Leo", "Mia", "peanut", "Oak St", "Elm Ave", "555-0111", "555-0122", "Hannah", "Tom Ellis", "tom@example.com", "Zed", "zed@example.com", "Grandma"]) assert.ok(!html.includes(secret), `leaks ${secret}`);
  assert.match(html, /name="website"/);
  assert.match(bookPage(emptyDesk(), []), /No open times right now/);
});

test("localMinutes reads the minute of the day in a time zone", () => {
  assert.equal(localMinutes(Date.parse("2026-11-02T15:07:00Z"), "UTC"), 15 * 60 + 7);
  assert.equal(localMinutes(Date.parse("2026-11-02T15:07:00Z"), "America/Chicago"), 9 * 60 + 7);
});
