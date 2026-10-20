import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlan, businessDay, callWindow, checkMessage, fill, gate, parseCsv, readProspects, readSuppression, regionOf,
  toCsv, toIcs, zoneOffset, CADENCES, SAMPLE_PROSPECTS, SAMPLE_SENDER,
} from "./calc.mjs";

const plan = buildPlan(SAMPLE_PROSPECTS, SAMPLE_SENDER, { start: "2026-10-26", sellerTz: "America/Denver" });
const person = (name) => plan.people.find((p) => p.first_name === name && !p.excluded) || plan.people.find((p) => p.first_name === name);

test("CSV parser handles quotes, embedded commas and newlines, CRLF and a BOM", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\r\n\r\n'), [["a", "b"], ["x, y", 'say "hi"\nthere']]);
});

test("column aliases map common CRM export headers, and a full name is split", () => {
  const r = readProspects("Full Name,Work Email,Account Name,Job Title,Mobile,State/Province\nDana Reyes,d@x.example,Brightline,COO,303 555 0142,CO\n");
  assert.equal(r.prospects[0].first_name, "Dana");
  assert.equal(r.prospects[0].last_name, "Reyes");
  assert.equal(r.prospects[0].company, "Brightline");
  assert.equal(r.prospects[0].state, "CO");
  assert.equal(r.prospects[0].phone, "303 555 0142");
});

test("merge fields: missing values become visible placeholders, sections follow the field", () => {
  assert.deepEqual(fill("Hi {{first_name}}{{#trigger}}, I saw {{trigger}}{{/trigger}}.", { first_name: "Dana" }), { text: "Hi Dana.", missing: [] });
  assert.equal(fill("{{#t}}yes{{/t}}{{^t}}no{{/t}}", { t: "" }).text, "no");
  assert.deepEqual(fill("Hi {{first_name}}", {}), { text: "Hi [first_name]", missing: ["first_name"] });
});

test("business days skip weekends and holidays", () => {
  assert.equal(businessDay("2026-10-24", 1), "2026-10-26"); // Saturday start -> Monday
  assert.equal(businessDay("2026-10-26", 5), "2026-10-30");
  assert.equal(businessDay("2026-10-26", 6), "2026-11-02");
  assert.equal(businessDay("2026-11-23", 4, ["2026-11-26", "2026-11-27"]), "2026-11-30");
});

test("time zone offsets follow daylight saving", () => {
  assert.equal(zoneOffset("America/Denver", "2026-10-28"), -360);
  assert.equal(zoneOffset("America/Denver", "2026-11-04"), -420);
  assert.equal(zoneOffset("Europe/Berlin", "2026-07-01"), 120);
});

test("call window is 9-5 in the prospect's time, shown in the seller's, and a two-zone state gets the overlap", () => {
  assert.equal(callWindow(["America/New_York"], "America/Los_Angeles", "2026-10-28").label, "06:00–14:00");
  assert.equal(callWindow(["America/Chicago", "America/Denver"], "America/Denver", "2026-10-28").label, "09:00–16:00");
  const w = callWindow(["America/Denver"], "America/Denver", "2026-11-04");
  assert.equal(w.startUtc, 16 * 60);
  assert.equal(callWindow(["Asia/Tokyo"], "America/New_York", "2026-10-28", 9 * 60, 9 * 60 + 20), null);
  assert.equal(callWindow([], "America/Denver", "2026-10-28"), null);
});

test("region: country column, state, then email domain; free-mail is noted", () => {
  assert.equal(regionOf({ state: "TX" }).group, "US");
  assert.equal(regionOf({ state: "ON" }).group, "CA");
  assert.equal(regionOf({ country: "Germany" }).group, "EU");
  assert.equal(regionOf({ country: "uk" }).group, "UK");
  assert.equal(regionOf({ email: "a@firm.co.uk" }).group, "UK");
  assert.equal(regionOf({ email: "a@gmail.com" }).personalEmail, true);
  assert.equal(regionOf({ email: "a@x.example" }).group, "unknown");
  assert.deepEqual(regionOf({ state: "CO", timezone: "America/Phoenix" }).zones, ["America/Phoenix"]);
});

test("gate: suppression by email, domain and phone; do-not-contact; duplicates", () => {
  const sup = readSuppression("dana@a.example\n@blocked.example; (303) 555-0100\n");
  assert.equal(sup.size, 3);
  assert.match(gate({ email: "DANA@a.example" }, sup).excluded, /suppression/);
  assert.match(gate({ email: "x@blocked.example" }, sup).excluded, /domain/);
  assert.match(gate({ email: "y@ok.example", phone: "+1 303-555-0100" }, sup).excluded, /phone/);
  assert.match(gate({ email: "y@ok.example", dnc: "Yes" }, sup).excluded, /do-not-contact/);
  const seen = new Set();
  assert.equal(gate({ email: "z@ok.example", state: "CO" }, sup, seen).excluded, null);
  assert.match(gate({ email: "z@ok.example", state: "CO" }, sup, seen).excluded, /duplicate/);
  assert.match(gate({}, sup).excluded, /no email, phone/);
});

test("gate: CASL and EU drop email without a consent basis, and a consent value restores it", () => {
  const none = readSuppression("");
  assert.match(gate({ email: "p@n.example", state: "ON", phone: "4165550110" }, none).drop.email, /CASL/);
  assert.equal(gate({ email: "p@n.example", state: "ON", consent: "express, 2026-09 webinar" }, none).drop.email, undefined);
  assert.match(gate({ email: "t@b.example", country: "DE" }, none).drop.email, /consent/);
  assert.match(gate({ email: "t@gmail.com", country: "GB" }, none).drop.email, /PECR/);
  assert.equal(gate({ email: "t@firm.example", country: "GB" }, none).drop.email, undefined);
  assert.match(gate({ email: "t@firm.example", phone: "555 0100 22", state: "NY" }, none).drop.letter, /postal/);
  assert.match(gate({ email: "t@x.example", phone: "5550100222" }, none).drop.call, /time zone/);
});

test("the sample plan: who is in, who is out, and why", () => {
  const s = plan.summary;
  assert.equal(s.prospects, 7);
  assert.equal(s.included, 5);
  assert.equal(s.blocked, 0);
  assert.equal(person("Leo").excluded, "marked do-not-contact in your list");
  assert.equal(plan.people.filter((p) => p.first_name === "Dana")[1].excluded, "duplicate of an earlier row");
  assert.equal(person("Dana").touches, CADENCES["b2b-classic"].steps.length);
  assert.ok(person("Priya").dropped.email);
  assert.deepEqual(plan.tasks.filter((t) => t.prospect === "Tom Becker").map((t) => t.channel), ["linkedin"]);
  assert.equal(s.first, "2026-10-26");
  assert.equal(s.last, "2026-11-13");
});

test("every drafted email carries the postal address and opt-out, and no template invents a number", () => {
  const inputs = SAMPLE_PROSPECTS + Object.values(SAMPLE_SENDER).join(" ");
  for (const t of plan.tasks) {
    assert.deepEqual(t.check.errors, [], `${t.prospect} ${t.channel}`);
    assert.deepEqual(checkMessage(t.channel, t, { sourceText: inputs }).errors, [], `${t.prospect} ${t.template}`);
    if (t.channel === "email") assert.match(t.body, /500 Main Street[\s\S]*no thanks/);
  }
});

test("without a real proof point the proof email becomes a referral ask; with one it is used verbatim", () => {
  assert.ok(plan.tasks.some((t) => t.template === "referral"));
  assert.ok(!plan.tasks.some((t) => t.template === "proof"));
  const p2 = buildPlan(SAMPLE_PROSPECTS, { ...SAMPLE_SENDER, proof: "Northwind Freight now builds its routes in a morning instead of two days" }, { start: "2026-10-26", sellerTz: "America/Denver" });
  assert.match(p2.tasks.find((t) => t.template === "proof").body, /Northwind Freight now builds/);
});

test("voicemail and letter never promise a channel the prospect will not get", () => {
  const priya = plan.tasks.find((t) => t.prospect === "Priya Shah" && t.channel === "call");
  assert.doesNotMatch(priya.voicemail, /email/);
  assert.match(plan.tasks.find((t) => t.prospect === "Dana Reyes" && t.channel === "call").voicemail, /short email/);
  const noPhone = buildPlan("first_name,company,address,state\nKim,Acme,1 Elm Street,CO\n", SAMPLE_SENDER, { start: "2026-10-26", cadence: "letter-first", sellerTz: "America/Denver" });
  assert.doesNotMatch(noPhone.tasks[0].body, /I'll call/);
});

test("checks: deceptive subject, missing footer, placeholders, LinkedIn length, long voicemail, urgency", () => {
  assert.match(checkMessage("email", { subject: "Re: our chat", body: "Hi. 1 Main Street. no thanks" }).errors[0], /Re: or Fwd:/);
  const bare = checkMessage("email", { subject: "Hi", body: "Hi [first_name]" }).errors.join(" ");
  assert.match(bare, /\[first_name\]/);
  assert.match(bare, /postal address/);
  assert.match(bare, /opt out/);
  assert.match(checkMessage("linkedin", { body: "x".repeat(301) }).errors[0], /300/);
  assert.match(checkMessage("linkedin", { body: "x".repeat(250) }).warnings[0], /shorter/);
  assert.match(checkMessage("call", { body: "", voicemail: "word ".repeat(90) }).warnings[0], /30 seconds/);
  assert.match(checkMessage("call", { body: "Act now, last chance" }).warnings[0], /urgency/);
});

test("the CSV guards spreadsheet formulas and the calendar is valid iCalendar", () => {
  const csv = toCsv([{ ...plan.tasks[0], prospect: "=HYPERLINK(1)" }]);
  assert.match(csv, /,'=HYPERLINK\(1\),/);
  assert.equal(csv.split("\r\n")[0], "date,call_window,channel,step,prospect,company,email,phone,subject,body,voicemail,issues");
  const ics = toIcs(plan.tasks, { now: "2026-10-20T00:00:00Z" });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, plan.tasks.length);
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  const call = plan.tasks.find((t) => t.prospect === "Dana Reyes" && t.channel === "call");
  assert.ok(ics.includes(`DTSTART:20261028T150000Z`), "Dana's first call starts 09:00 Denver = 15:00Z");
  assert.ok(call.window);
  assert.match(ics, /DTSTART;VALUE=DATE:20261026/);
});

test("bad options fail loudly", () => {
  assert.throws(() => buildPlan(SAMPLE_PROSPECTS, SAMPLE_SENDER, { start: "next monday" }), /start/);
  assert.throws(() => buildPlan(SAMPLE_PROSPECTS, SAMPLE_SENDER, { start: "2026-10-26", cadence: "spam" }), /unknown cadence/);
});
