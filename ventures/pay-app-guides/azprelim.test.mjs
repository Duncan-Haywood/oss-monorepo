import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { noticeDates, recipients, reNotice, cents, draftNotice, ITEMS, FORM_TITLE, FORM_INTRO, OWNER_NOTICE_HEAD, OWNER_NOTICE, TEN_DAYS, ACK } from "./azprelim.mjs";

const STATUTE = readFileSync(new URL("./sources/az-33.txt", import.meta.url), "utf8");
const flat = (s) => s.replace(/\s+/g, " ").trim();
const FLAT = flat(STATUTE);
const PAGE = readFileSync(new URL("./arizona-preliminary-notice.html", import.meta.url), "utf8");

// Dates counted by hand on a calendar.
test("20 calendar days after first furnishing, not moved off a weekend", () => {
  const r = noticeDates({ first: "2026-03-02", today: "2026-03-10" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.lastDay, "2026-03-22"); // a Sunday: stays put
  assert.equal(r.status.daysLeft, 12);
  assert.equal(r.status.state, "open");
  assert.match(r.rule, /deposited in the mail/);
});

test("month end and leap year", () => {
  assert.equal(noticeDates({ first: "2028-02-15" }).lastDay, "2028-03-06");
  assert.equal(noticeDates({ first: "2026-12-20" }).lastDay, "2027-01-09");
});

test("mailed on the last day is on time; the acknowledgment is chased 30 days after mailing", () => {
  const r = noticeDates({ first: "2026-03-02", mailed: "2026-03-22" });
  assert.equal(r.onTime, true);
  assert.equal(r.covers, "all of your work on this job");
  assert.equal(r.ackBy, "2026-04-21");
  assert.match(r.notes.join(" "), /affidavit/);
});

test("a late notice reaches only the 20 days before mailing, and after", () => {
  const r = noticeDates({ first: "2026-03-02", mailed: "2026-04-15" });
  assert.equal(r.onTime, false);
  assert.equal(r.coversFrom, "2026-03-26");
  assert.equal(r.lostDays, 24);
  assert.match(r.notes[0], /Late by 24 day\(s\)/);
  assert.match(r.notes[0], /2026-03-02 to 2026-03-25 is not covered/);
});

test("lien recording date: 120 days after completion, or 60 after a recorded notice of completion", () => {
  const a = noticeDates({ first: "2026-03-02", completed: "2026-09-30" });
  assert.equal(a.recordBy, "2027-01-28");
  assert.match(a.recordRule, /120 days after completion/);
  const b = noticeDates({ first: "2026-03-02", completed: "2026-09-30", noc: "2026-10-20" });
  assert.equal(b.recordBy, "2026-12-19");
  assert.match(b.notes.join(" "), /2027-01-28 \(§ 33-993\(I\)\)/);
  assert.equal(noticeDates({ first: "2026-03-02", noc: "2026-10-20" }).recordBy, "2026-12-19");
  assert.equal(noticeDates({ first: "2026-03-02" }).recordBy, undefined);
});

test("bad input is named, never guessed", () => {
  assert.match(noticeDates({ first: "" }).errors[0], /first furnished/);
  assert.match(noticeDates({ first: "2026-02-30" }).errors[0], /first furnished/);
  assert.match(noticeDates({ first: "2026-03-02", mailed: "3/5/2026" }).errors[0], /mailed/);
  assert.match(noticeDates({ first: "2026-03-02", method: "email" }).errors[0], /how the notice/);
  assert.match(noticeDates({ first: "2026-03-02", mailed: "2026-03-01" }).errors[0], /before the first day/);
  assert.match(noticeDates({ first: "2026-03-02", completed: "2026-09-30", noc: "2026-09-01" }).errors[0], /after completion/);
});

test("status near and past the date", () => {
  assert.equal(noticeDates({ first: "2026-03-02", today: "2026-03-22" }).status.state, "today");
  assert.equal(noticeDates({ first: "2026-03-02", today: "2026-03-19" }).status.state, "soon");
  assert.equal(noticeDates({ first: "2026-03-02", today: "2026-03-25" }).status.daysLeft, -3);
});

test("who is served follows § 33-992.01(B) and § 33-1002", () => {
  assert.equal(recipients("sub").to.length, 4);
  assert.equal(recipients("direct").to.length, 2);
  assert.equal(recipients("laborer").needed, false);
  const occ = recipients("occupant");
  assert.equal(occ.needed, false);
  assert.match(occ.why, /§ 33-1002\(B\)/);
});

test("a new notice at 30% or more over the prior estimate (§ 33-992.01(G))", () => {
  assert.equal(cents("$184,500.25"), 18450025);
  assert.ok(Number.isNaN(cents("about 5k")));
  assert.deepEqual(reNotice("$100,000", "130,000"), { needed: true, threshold: 130000, increase: 30 });
  assert.equal(reNotice("100000", "129999.99").needed, false);
  assert.equal(reNotice("0", "10"), null);
  assert.equal(reNotice("", "10"), null);
  assert.equal(reNotice("33333.33", "43333.33").needed, true); // 43333.33 >= 43333.329
});

test("the draft follows the § 33-992.01(D) form with its statements and the § 33-992.02 acknowledgment", () => {
  const empty = draftNotice({});
  for (const p of [FORM_TITLE, FORM_INTRO, OWNER_NOTICE_HEAD, ...OWNER_NOTICE, ...TEN_DAYS, ...ACK]) assert.ok(empty.text.includes(p), p);
  assert.equal(empty.missing.length, ITEMS.filter((i) => i[2]).length + 1);
  assert.match(empty.text, /assigns are:\nNone known/);
  const full = draftNotice({ owner: "Desert Ridge Partners LLC, 100 N Central Ave, Phoenix, AZ 85004", original: "Saguaro Builders Inc., 22 W Main St, Mesa, AZ 85201", hiredBy: "Saguaro Builders Inc., 22 W Main St, Mesa, AZ 85201", claimant: "Copper State Electric LLC, 9 E Elm St, Tempe, AZ 85281", work: "Electrical rough-in and trim", site: "4400 E Camelback Rd, Phoenix, AZ", county: "Maricopa", estimate: "$212,000.00", date: "2026-03-10", signer: "Lee Park", company: "Copper State Electric LLC", title: "Owner" });
  assert.deepEqual(full.missing, []);
  assert.match(full.text, /furnished is: \$212,000\.00/);
  assert.match(full.text, /land in Maricopa County, Arizona,/);
  assert.match(full.text, /Owner \(Title\)/);
});

// Every statutory string the module prints is in the statute snapshot, word for word.
test("statement text and form labels are the statute's own words", () => {
  for (const p of [FORM_INTRO, ...OWNER_NOTICE, ...TEN_DAYS, ACK[0]]) assert.ok(FLAT.includes(flat(p)), p);
  assert.ok(FLAT.includes(flat(ACK[1])), ACK[1]);
  // The form is printed in two columns, so its labels are checked word by word, in order, inside § D.
  const d = flat(STATUTE.slice(STATUTE.indexOf("D. The preliminary notice given"), STATUTE.indexOf("E. If labor")));
  for (const [, label] of ITEMS) {
    let at = 0;
    for (const w of label.replace(/\$$/, "").split(" ")) {
      const i = d.indexOf(w, at);
      assert.ok(i >= 0, `${label}: "${w}" not in § 33-992.01(D) after position ${at}`);
      at = i + w.length;
    }
  }
});

test("every quoted phrase on the page is in the statute", () => {
  const quotes = [...PAGE.matchAll(/“([^”]+)”/g)].map((m) => m[1].replace(/&amp;/g, "&").replace(/<[^>]+>/g, ""));
  assert.ok(quotes.length >= 8, `found ${quotes.length} quotes`);
  for (const q of quotes) assert.ok(FLAT.includes(flat(q)), `not in the statute: "${q}"`);
});

test("page cites azleg.gov with the read date, has the calculator fields, and is linked from the Arizona pages", () => {
  for (const s of ["33/00992-01", "33/00992-02", "33/00993", "33/01002"]) assert.match(PAGE, new RegExp(`href="https://www\\.azleg\\.gov/ars/${s}\\.htm"`), s);
  assert.match(PAGE, /read <strong>2026-11-28<\/strong>/);
  for (const id of ["role", "first", "method", "mailed", "completed", "noc", "today", "prior", "current"]) assert.match(PAGE, new RegExp(`<label for="${id}">`), id);
  for (const name of ["arizona-lien-waiver-forms.html", "california-preliminary-notice.html"]) {
    const other = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
    assert.match(other, /href="arizona-preliminary-notice\.html"/, name);
  }
});

test("the page prints the module's statements, so the page and the draft cannot drift", () => {
  const text = PAGE.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'");
  for (const p of [FORM_INTRO, ...OWNER_NOTICE, ...TEN_DAYS]) assert.ok(text.includes(p), p);
});
