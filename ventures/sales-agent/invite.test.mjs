import test from "node:test";
import assert from "node:assert/strict";
import { buildInvite } from "./invite.mjs";
import { findSlots } from "./slots.mjs";
import { runInbox } from "./engine.mjs";

const today = "2026-11-06"; // a Friday
const unfold = (r) => (r.ics ? { ...r, ics: r.ics.replace(/\r\n /g, "") } : r);
const base = (slot, extra = {}) => unfold(buildInvite({ email: "dana@acme.example", name: "Dana Ruiz", company: "Acme", slot, today, offer: { product: "RouteKit" }, ...extra }));

test("a timed slot becomes a tentative floating-time event of 30 minutes", () => {
  const [s] = findSlots("Tuesday at 2pm works", today);
  const r = base(s);
  assert.ok(r.ok);
  assert.match(r.ics, /DTSTART:20261110T140000\r\n/);
  assert.match(r.ics, /DTEND:20261110T143000\r\n/);
  assert.match(r.ics, /STATUS:TENTATIVE/);
  assert.match(r.ics, /TIME ZONE NOT CONFIRMED/);
  assert.ok(!/TZID|Z\r\nDTEND/.test(r.ics.replace(/DTSTAMP[^\r]*/, "")), "no zone is guessed");
  assert.match(r.ics, /ATTENDEE;CN=Dana Ruiz;[^:]*:mailto:dana@acme.example/);
  assert.ok(r.ics.startsWith("BEGIN:VCALENDAR\r\n") && r.ics.endsWith("END:VCALENDAR\r\n"));
});
test("part of day, lower bound and bare date give no file", () => {
  for (const t of ["Friday morning", "Thursday after 3pm", "Monday"]) {
    const r = base(findSlots(`${t} is good`, today)[0]);
    assert.equal(r.ok, false, t);
    assert.ok(r.why);
  }
});
test("duration comes from the offer within bounds, else 30", () => {
  const [s] = findSlots("Nov 12 at 10:30", today);
  assert.match(base(s, { offer: { duration_minutes: 45 } }).ics, /DTEND:20261112T111500/);
  assert.match(base(s, { offer: { duration_minutes: 9999 } }).ics, /DTEND:20261112T110000/);
});
test("crossing midnight rolls the date; text is escaped and folded to 75 octets; header injection is stripped", () => {
  const r0 = buildInvite({ email: "a@b.example", name: 'Eve; "X"\r\nATTENDEE:mailto:evil@x.example', company: "A,B", slot: { text: "11pm", date: "2026-12-31", time: "23:45", ambiguous: false }, today, offer: { duration_minutes: 30 } }), r = unfold(r0);
  assert.match(r.ics, /DTEND:20270101T001500/);
  assert.ok(!/\r\nATTENDEE:mailto:evil/.test(r.ics));
  for (const l of r0.ics.split("\r\n")) assert.ok(Buffer.byteLength(l) <= 75, l);
});
test("a bad address gives no file; organizer only when a valid sender is typed", () => {
  assert.equal(base(findSlots("Tuesday at 2pm", today)[0], { email: "not an address" }).ok, false);
  const [s] = findSlots("Tuesday at 2pm", today);
  assert.ok(!/ORGANIZER/.test(base(s).ics));
  assert.match(base(s, { offer: { sender_email: "me@us.example", sender_name: "Me" } }).ics, /ORGANIZER;CN=Me:mailto:me@us.example/);
});
test("same prospect and time give the same UID, so a re-import updates instead of duplicating", () => {
  const [s] = findSlots("Tuesday at 2pm", today);
  assert.equal(base(s).ics.match(/UID:.*/)[0], base(s).ics.match(/UID:.*/)[0]);
});
test("works on a triaged reply from the inbox agent", () => {
  const r = runInbox({ replies: "From: Dana Ruiz <dana@acme.example>\nSubject: Re: intro\n\nSounds good. Can we talk Tuesday at 2pm?", prospects: "email,first_name,company\ndana@acme.example,Dana,Acme", suppression: "", offer: {}, today });
  const it = r.items[0];
  assert.equal(it.triage.category, "interested");
  assert.ok(base(it.triage.slots[0]).ok);
});
