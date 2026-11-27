import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { noticeDates, recipients, draftNotice, FORM, FIELDS, WARNINGS } from "./flnto.mjs";

const SRC = readFileSync(new URL("./sources/fl-713.txt", import.meta.url), "utf8");
const statute = SRC.split("\n").filter((l) => !l.startsWith("#")).join("\n");
const flatS = statute.replace(/\s+/g, " ");
const PAGE = readFileSync(new URL("./florida-notice-to-owner.html", import.meta.url), "utf8");

// Dates counted by hand on a calendar.
test("45 and 40 calendar days after first furnishing, not moved for a weekend", () => {
  const r = noticeDates({ first: "2026-03-02", today: "2026-03-10" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.serveBy, "2026-04-16");
  assert.equal(r.mailBy, "2026-04-11"); // a Saturday: stays put
  assert.equal(r.status.daysLeft, 37);
  assert.equal(r.mailByStatus.daysLeft, 32);
});

test("month end and leap year", () => {
  assert.equal(noticeDates({ first: "2028-01-20" }).serveBy, "2028-03-05");
  assert.equal(noticeDates({ first: "2028-01-20" }).mailBy, "2028-02-29");
  assert.equal(noticeDates({ first: "2026-12-10" }).serveBy, "2027-01-24");
});

test("certified mail on day 40 is served on mailing", () => {
  const r = noticeDates({ first: "2026-03-02", sent: "2026-04-11", method: "mail" });
  assert.equal(r.served, "2026-04-11");
  assert.equal(r.onTime, true);
  assert.match(r.servedHow, /on mailing/);
});

test("certified mail on day 42 counts only on delivery", () => {
  const open = noticeDates({ first: "2026-03-02", sent: "2026-04-13", method: "mail" });
  assert.equal(open.served, undefined);
  assert.match(open.notes.join(" "), /after the 40th day/);
  const ok = noticeDates({ first: "2026-03-02", sent: "2026-04-13", delivered: "2026-04-16", method: "mail" });
  assert.equal(ok.onTime, true);
  const late = noticeDates({ first: "2026-03-02", sent: "2026-04-13", delivered: "2026-04-18", method: "mail" });
  assert.equal(late.onTime, false);
  assert.match(late.notes.join(" "), /Late by 2 day\(s\).*complete defense/);
});

test("courier and hand delivery count on delivery", () => {
  assert.equal(noticeDates({ first: "2026-03-02", sent: "2026-04-15", delivered: "2026-04-17", method: "carrier" }).onTime, false);
  const h = noticeDates({ first: "2026-03-02", sent: "2026-04-16", method: "hand" });
  assert.equal(h.onTime, true);
  assert.equal(h.mailBy, null);
});

test("serving before work starts is allowed, with a note", () => {
  const r = noticeDates({ first: "2026-03-02", sent: "2026-02-25", method: "hand" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.onTime, true);
  assert.match(r.notes[0], /before commencing/);
});

test("claim of lien: 90 days after the last day of furnishing", () => {
  assert.equal(noticeDates({ first: "2026-03-02", last: "2026-09-30" }).claimBy, "2026-12-29");
  assert.match(noticeDates({ first: "2026-03-02", last: "2026-02-01" }).errors[0], /before the first/);
});

test("bad dates are errors", () => {
  assert.equal(noticeDates({ first: "2026-02-30" }).errors.length, 1);
  assert.equal(noticeDates({ first: "2026-03-02", sent: "03/04/2026" }).errors.length, 1);
  assert.match(noticeDates({ first: "2026-03-02", sent: "2026-04-13", delivered: "2026-04-10" }).errors[0], /before the mailing/);
});

test("who gets it, by role", () => {
  assert.equal(recipients("laborer").needed, false);
  assert.equal(recipients("direct").needed, false);
  assert.equal(recipients("sub").to.length, 2);
  assert.ok(recipients("subsub").to.some((t) => /copy on the contractor/.test(t)));
  assert.ok(recipients("supplierSub").to.some((t) => /copy on the contractor/.test(t)));
  assert.ok(!recipients("supplierGc").to.some((t) => /copy on the contractor/.test(t)));
  assert.ok(recipients("supplierSubsub").to.some((t) => /subcontractor above/.test(t)));
});

test("the form is § 713.06(2)(c) word for word", () => {
  const blank = FORM.map((l) => l.replace(/\{\{(\w+)\}\}/g, (_, k) => FIELDS.find(([f]) => f === k)[1]));
  // The snapshot prints the description, property and order-giver on one line, and the signature
  // block's captions, as the statute does; the draft gives each its own paragraph.
  const form = statute.slice(statute.indexOf(WARNINGS[0]), statute.indexOf("The form may be combined"));
  const flat = (t) => t.replace(/\s+/g, " ").trim();
  assert.equal(flat(blank.join(" ")).replace("given by ____.", "given by____."), flat(form));
});

test("draft fills the blanks and names what is missing", () => {
  const d = draftNotice({ owner: "Gulf Point LLC, 1 Bay St, Tampa, FL 33602", work: "Drywall, labor and materials", site: "400 Harbor Blvd, Tampa", hiredBy: "Coastline Builders Inc.", lienorName: "Ridge Drywall LLC", lienorAddress: "" });
  assert.ok(d.text.includes("Drywall, labor and materials for the improvement of the real property identified as 400 Harbor Blvd, Tampa under an order given by Coastline Builders Inc."));
  assert.deepEqual(d.missing, ["your company's address"]);
  assert.ok(!d.text.includes("Inc.."), "the form's own period must not double a name's");
  assert.ok(d.text.includes("(Lienor’s Address)"));
  assert.ok(d.text.includes("Copies to: (Those persons listed"));
});

test("every phrase the page and module quote is in the statute", () => {
  // Quotations are \"escaped\" in the module's strings and “curly” in the page's prose.
  const src = readFileSync(new URL("./flnto.mjs", import.meta.url), "utf8");
  const quotes = [...src.matchAll(/\\"([^"\\]+)\\"/g), ...PAGE.matchAll(/“([^”]+)”/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  assert.ok(quotes.length >= 10, `found ${quotes.length} quotes`);
  for (const q of quotes) assert.ok(flatS.includes(q.replace(/\s+/g, " ")), `not in the statute: "${q}"`);
});

test("page cites the Florida Senate with the read date and links the guides", () => {
  assert.match(PAGE, /href="https:\/\/www\.flsenate\.gov\/Laws\/Statutes\/2026\/713\.06"/);
  assert.match(PAGE, /href="https:\/\/www\.flsenate\.gov\/Laws\/Statutes\/2026\/713\.08"/);
  assert.match(PAGE, /read <strong>2026-11-27<\/strong>/);
  for (const id of ["role", "first", "method", "sent", "delivered", "last", "today"]) assert.match(PAGE, new RegExp(`<label for="${id}">`), id);
  for (const name of ["florida-lien-waiver-forms.html", "california-preliminary-notice.html"]) {
    const other = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
    assert.match(other, /href="florida-notice-to-owner\.html"/, name);
  }
});
