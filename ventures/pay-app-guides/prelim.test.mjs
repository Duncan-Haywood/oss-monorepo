import { test } from "node:test";
import assert from "node:assert/strict";
import { noticeDates, recipients, draftNotice, OWNER_NOTICE, OWNER_NOTICE_HEAD, ITEMS } from "./prelim.mjs";

// Dates counted by hand on a calendar.
test("20 calendar days after first furnishing, not moved for a weekend", () => {
  const r = noticeDates({ first: "2026-03-02", today: "2026-03-10" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.lastDay, "2026-03-22"); // a Sunday: stays put
  assert.equal(r.sendBy, "2026-03-22");
  assert.equal(r.status.daysLeft, 12);
  assert.equal(r.status.state, "open");
});

test("month end and leap year", () => {
  assert.equal(noticeDates({ first: "2028-02-15" }).lastDay, "2028-03-06");
  assert.equal(noticeDates({ first: "2026-12-20" }).lastDay, "2027-01-09");
});

test("left and mailed: complete five days after mailing, so mail five days early", () => {
  const r = noticeDates({ first: "2026-03-02", method: "leave", served: "2026-03-19" });
  assert.equal(r.sendBy, "2026-03-17");
  assert.equal(r.given, "2026-03-24");
  assert.equal(r.onTime, false);
  assert.equal(r.coversFrom, "2026-03-04");
  assert.match(r.notes.join(" "), /mail it by 2026-03-17/);
});

test("certified mail on the last day is on time and covers everything", () => {
  const r = noticeDates({ first: "2026-03-02", method: "certified", served: "2026-03-22" });
  assert.equal(r.given, "2026-03-22");
  assert.equal(r.onTime, true);
  assert.equal(r.covers, "all of your work on this job");
});

test("a late notice covers only the 20 days before it and after", () => {
  const r = noticeDates({ first: "2026-03-02", method: "personal", served: "2026-04-15" });
  assert.equal(r.onTime, false);
  assert.equal(r.coversFrom, "2026-03-26");
  assert.equal(r.lostDays, 24);
  assert.match(r.notes.join(" "), /work from 2026-03-02 to 2026-03-25 is not covered/);
});

test("bad input is named, never guessed", () => {
  assert.match(noticeDates({ first: "" }).errors[0], /first furnished/);
  assert.match(noticeDates({ first: "2026-02-30" }).errors[0], /first furnished/);
  assert.match(noticeDates({ first: "2026-03-02", served: "3/5/2026" }).errors[0], /notice is delivered/);
  assert.match(noticeDates({ first: "2026-03-02", method: "fax" }).errors[0], /how the notice/);
  assert.match(noticeDates({ first: "2026-03-02", served: "2026-03-01" }).errors[0], /before the first day/);
});

test("status near and past the date", () => {
  assert.equal(noticeDates({ first: "2026-03-02", today: "2026-03-22" }).status.state, "today");
  assert.equal(noticeDates({ first: "2026-03-02", today: "2026-03-19" }).status.state, "soon");
  assert.equal(noticeDates({ first: "2026-03-02", today: "2026-03-25" }).status.daysLeft, -3);
});

test("who gets the notice follows § 8200", () => {
  assert.equal(recipients("sub").to.length, 3);
  assert.equal(recipients("laborer").needed, false);
  assert.deepEqual(recipients("direct").to, ["The construction lender, if there is one"]);
});

test("the draft carries § 8202(a)(3) word for word and lists missing items", () => {
  const empty = draftNotice({});
  assert.ok(empty.text.includes(OWNER_NOTICE_HEAD));
  for (const p of OWNER_NOTICE) assert.ok(empty.text.includes(p));
  assert.equal(empty.missing.length, ITEMS.filter((i) => i[3]).length);
  assert.match(empty.text, /construction lender, if any: none known/);

  const full = draftNotice({ owner: "Bayview Holdings LLC, 1 Market St, San Francisco CA", direct: "Harbor Builders Inc., 20 Pier Rd, Oakland CA", site: "1200 Mission St, San Francisco CA", claimant: "Ridge Drywall LLC, 5 Elm Ave, Fremont CA, subcontractor to Harbor Builders", work: "Metal framing and drywall", hiredBy: "Harbor Builders Inc.", estimate: "$184,500", date: "2026-03-10", signer: "Ana Ruiz, President" });
  assert.deepEqual(full.missing, []);
  assert.match(full.text, /Estimate of the total price[^\n]*:\n\$184,500/);
  assert.doesNotMatch(full.text, /laborers/i);
  assert.match(full.text, /Name and title: Ana Ruiz, President/);
});

// The statement must match the snapshot of the statute this page was written from (private
// repo packages/lien-waivers/sources/ca-8102-8216.txt); spot-check its distinctive phrases.
test("statement text: key phrases from § 8202(a)(3)", () => {
  const all = OWNER_NOTICE.join(" ");
  assert.match(all, /^EVEN THOUGH YOU HAVE PAID YOUR CONTRACTOR IN FULL, /);
  assert.match(all, /a dwelling containing four or fewer units\.$/);
  assert.match(all, /within 10 days after recording, send a copy of the notice of completion/);
  assert.match(all, /contractor’s|contractor's|contractor/);
});
