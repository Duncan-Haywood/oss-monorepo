import { test } from "node:test";
import assert from "node:assert/strict";
import { retainageRelease, CLOSEOUT_ITEMS } from "./calc.mjs";

const base = { held: "15,000", released: "0", trigger: "2026-06-01", days: "60", today: "2026-09-15", project: "Elm St Clinic", to: "Acme GC", from: "Bright Electric", basis: "section 9.2 of our subcontract" };

test("worked example on the page: $15,000 held, 60 days from 1 June, asked on 15 September", () => {
  const r = retainageRelease(base);
  assert.deepEqual(r.errors, []);
  assert.equal(r.owed, 1500000);
  assert.equal(r.due, "2026-07-31");
  assert.equal(r.daysOverdue, 46);
  assert.equal(r.daysLeft, 0);
  assert.match(r.letter, /Under section 9\.2 of our subcontract, the retainage of \$15,000\.00 still held on our subcontract was due on 2026-07-31 and is now 46 days past due\./);
  assert.match(r.letter, /^To: Acme GC$/m);
  assert.match(r.letter, /Re: Release of retainage, Elm St Clinic/);
});

test("a partial release leaves the rest owed; not yet due counts the days left", () => {
  const r = retainageRelease({ ...base, released: "5000", today: "2026-07-21" });
  assert.equal(r.owed, 1000000);
  assert.equal(r.daysOverdue, 0);
  assert.equal(r.daysLeft, 10);
  assert.match(r.letter, /\$10,000\.00 still held on our subcontract is due on 2026-07-31\./);
  assert.doesNotMatch(r.letter, /past due/);
});

test("one day late is singular; due today is not late", () => {
  assert.match(retainageRelease({ ...base, today: "2026-08-01" }).letter, /now 1 day past due/);
  const r = retainageRelease({ ...base, today: "2026-07-31" });
  assert.equal(r.daysOverdue, 0);
  assert.equal(r.daysLeft, 0);
});

test("unticked closeout items are listed as open, unknown ids ignored", () => {
  const r = retainageRelease({ ...base, missing: ["om", "asbuilt", "nope"] });
  assert.match(r.letter, /- Operation and maintenance manuals: \[date\]\n- As-built or record drawings for the scope: \[date\]/);
  assert.doesNotMatch(retainageRelease(base).letter, /Still open/);
});

test("blank names become placeholders and no basis drops the clause", () => {
  const r = retainageRelease({ held: "1000", trigger: "2026-01-01", days: "30", today: "2026-01-10" });
  assert.match(r.letter, /To: \[general contractor\]/);
  assert.match(r.letter, /Re: Release of retainage, \[project\]/);
  assert.match(r.letter, /on 2026-01-01\. The retainage of \$1,000\.00/);
});

test("bad inputs are errors, never a letter", () => {
  for (const bad of [{ held: "" }, { held: "-5" }, { released: "20000" }, { released: "-1" }, { trigger: "2026-02-30" }, { today: "" }, { days: "" }, { days: "1.5" }, { days: "-3" }, { days: "999" }, { held: "1e5" }]) {
    const r = retainageRelease({ ...base, ...bad });
    assert.ok(r.errors.length > 0, JSON.stringify(bad));
    assert.equal(r.letter, undefined);
  }
});

test("closeout items have unique ids", () => {
  assert.equal(new Set(CLOSEOUT_ITEMS.map((i) => i.id)).size, CLOSEOUT_ITEMS.length);
});

test("the letter claims only the final pay app and waiver that were ticked as sent", () => {
  assert.match(retainageRelease(base).letter, /Enclosed or already sent: our final pay application and a conditional final lien waiver for that amount\./);
  const noWaiver = retainageRelease({ ...base, missing: ["final-waiver"] }).letter;
  assert.match(noWaiver, /Enclosed or already sent: our final pay application\.\n/);
  assert.match(noWaiver, /- Final conditional lien waiver for the retainage amount: \[date\]/);
  assert.match(retainageRelease({ ...base, missing: ["final-app", "final-waiver"] }).letter, /Please release \$15,000\.00\.\n/);
});

// Red team 2026-11-25: with everything already released the letter asked for "$0.00 ... past due".
test("nothing left to release is an error, not a letter asking for $0.00", () => {
  const r = retainageRelease({ ...base, released: "15000" });
  assert.equal(r.letter, undefined);
  assert.match(r.errors.join(" "), /nothing left to release/i);
});

// Red team 2026-11-25: Number() read "1e1" as 10 days and "0x3c" as 60.
test("release days must be plain digits", () => {
  for (const days of ["1e1", "0x3c", "6e1", " 60 "]) {
    const r = retainageRelease({ ...base, days });
    if (days.trim() === "60") assert.deepEqual(r.errors, []);
    else assert.match(r.errors.join(" "), /whole number/, days);
  }
});
