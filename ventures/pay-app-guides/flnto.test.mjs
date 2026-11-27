import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ntoDates, recipients, draftNotice, NTO_FORM, QUOTES, FIELDS } from "./flnto.mjs";

// PayApps' verified snapshot of the Florida Senate's 2026 text of §§ 713.06(2) and 713.18.
const SNAPSHOT = readFileSync(new URL("../payapps/packages/lien-waivers/sources/fl-713-06.txt", import.meta.url), "utf8");
const statuteLines = SNAPSHOT.split("\n").filter((l) => !l.startsWith("#"));

test("every line of the form is the statute's own line, in order", () => {
  let at = statuteLines.findIndex((l) => l.startsWith("WARNING!"));
  assert.ok(at > 0);
  for (const line of NTO_FORM) {
    assert.equal(statuteLines[at], line);
    at++;
  }
  assert.match(statuteLines[at], /^The form may be combined/); // nothing of the form left out
});

test("every quoted phrase is in the statute", () => {
  for (const q of QUOTES) assert.ok(SNAPSHOT.includes(q), q);
});

test("every phrase the page quotes in curly quotes is in the statute", () => {
  const html = readFileSync(new URL("./florida-notice-to-owner.html", import.meta.url), "utf8");
  const quoted = [...html.matchAll(/“([^”]+)”/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  assert.ok(quoted.length >= 8, `only ${quoted.length} quotes`);
  for (const q of quoted) assert.ok(SNAPSHOT.includes(q), `not in the statute: ${q}`);
});

// Dates counted by hand on a calendar.
test("45 and 40 calendar days after the first day, not moved off a weekend", () => {
  const r = ntoDates({ first: "2026-03-02", today: "2026-03-10" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.serveBy, "2026-04-16");
  assert.equal(r.mailBy, "2026-04-11"); // a Saturday: stays put
  assert.equal(r.status.daysLeft, 37);
  assert.equal(r.mailStatus.daysLeft, 32);
  assert.equal(r.status.state, "open");
});

test("month end and leap year", () => {
  assert.equal(ntoDates({ first: "2028-01-20" }).serveBy, "2028-03-05");
  assert.equal(ntoDates({ first: "2028-01-20" }).mailBy, "2028-02-29");
  assert.equal(ntoDates({ first: "2026-12-01" }).serveBy, "2027-01-15");
});

test("certified mail within 40 days is served on mailing, even if delivered after day 45", () => {
  const r = ntoDates({ first: "2026-03-02", method: "certified", sent: "2026-04-11", delivered: "2026-04-20" });
  assert.equal(r.basis, "mailing");
  assert.equal(r.servedOn, "2026-04-11");
  assert.equal(r.onTime, true);
  assert.match(r.notes.join(" "), /mail log/);
});

test("certified mail after day 40 counts on delivery", () => {
  const late = ntoDates({ first: "2026-03-02", method: "certified", sent: "2026-04-12" });
  assert.equal(late.basis, "delivery");
  assert.equal(late.servedOn, null);
  assert.equal(late.onTime, null);
  assert.match(late.notes.join(" "), /Enter the delivery date/);
  assert.equal(ntoDates({ first: "2026-03-02", method: "certified", sent: "2026-04-12", delivered: "2026-04-16" }).onTime, true);
  const r = ntoDates({ first: "2026-03-02", method: "certified", sent: "2026-04-12", delivered: "2026-04-17" });
  assert.equal(r.onTime, false);
  assert.match(r.notes.join(" "), /complete defense/);
});

test("a courier counts on delivery even within 40 days; hand delivery and posting on the day", () => {
  const c = ntoDates({ first: "2026-03-02", method: "carrier", sent: "2026-03-05", delivered: "2026-03-06" });
  assert.equal(c.basis, "delivery");
  assert.equal(c.servedOn, "2026-03-06");
  const h = ntoDates({ first: "2026-03-02", method: "hand", sent: "2026-04-16" });
  assert.equal(h.onTime, true);
  assert.equal(ntoDates({ first: "2026-03-02", method: "hand", sent: "2026-04-17" }).onTime, false);
  assert.match(ntoDates({ first: "2026-03-02", method: "posting", sent: "2026-03-10" }).notes.join(" "), /cannot be accomplished/);
});

test("serving before commencing is allowed", () => {
  const r = ntoDates({ first: "2026-03-02", method: "hand", sent: "2026-02-20" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.onTime, true);
});

test("bad input is named, never guessed", () => {
  assert.match(ntoDates({ first: "" }).errors[0], /first day/);
  assert.match(ntoDates({ first: "2026-02-30" }).errors[0], /first day/);
  assert.match(ntoDates({ first: "2026-03-02", sent: "3/5/2026" }).errors[0], /mailed, handed/);
  assert.match(ntoDates({ first: "2026-03-02", method: "fax" }).errors[0], /how the notice/);
  assert.match(ntoDates({ first: "2026-03-02", sent: "2026-03-10", delivered: "2026-03-09" }).errors[0], /before the day it was sent/);
});

test("who gets it follows § 713.06(2)(a), (b) and (d)", () => {
  assert.equal(recipients("laborer").needed, false);
  assert.equal(recipients("direct").needed, false);
  assert.equal(recipients("sub").to.length, 3);
  assert.ok(recipients("subsub").to.some((t) => /copy to the contractor/.test(t)));
  assert.ok(!recipients("sub").to.some((t) => /copy to the contractor/.test(t)));
  assert.ok(recipients("supsubsub").to.some((t) => /subcontractor above your customer/.test(t)));
});

test("the draft keeps every statutory line and fills the captions", () => {
  const empty = draftNotice({});
  for (const l of NTO_FORM.filter((l) => !l.startsWith("(Lienor"))) assert.ok(empty.text.includes(l), l);
  assert.equal(empty.missing.length, FIELDS.filter((f) => f[2]).length);
  const full = draftNotice({ owner: "Gulf Shore Partners LLC, 400 Bay St, Tampa, FL 33602", work: "Electrical rough-in and finish, labor and materials", site: "1800 W Kennedy Blvd, Tampa, FL 33606", hiredBy: "Coastline Builders Inc.", lienor: "Bright Line Electric LLC", address: "12 Palm Ave, Clearwater, FL 33755" });
  assert.deepEqual(full.missing, []);
  assert.match(full.text, /To Gulf Shore Partners LLC/);
  assert.match(full.text, /^Electrical rough-in[^\n]* for the improvement of the real property identified as 1800 W Kennedy[^\n]* under an order given by Coastline Builders Inc\.$/m);
  assert.match(full.text, /Copies to: \(Those persons listed/);
  for (const l of NTO_FORM.filter((l) => !l.startsWith("(") && !l.startsWith("To ") && !l.startsWith("Copies"))) assert.ok(full.text.includes(l), l);
});
