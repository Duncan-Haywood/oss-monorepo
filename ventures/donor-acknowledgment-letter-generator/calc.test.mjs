import { test } from "node:test";
import assert from "node:assert/strict";
import { check, readGifts, parseCsv, parseDate, parseMoney, classifyType, isoDay, dollars, letterText, lettersText, lettersHtml, donorSummaryCsv, findingsCsv, sampleList, sampleBrokenList, SAMPLE_ORG, ackDeadlineNote } from "./calc.mjs";

const HEAD = "Donor,Address,Date,Amount,Type,Description,Goods or services,Benefit value,Fund\n";
const run = (rows, org = SAMPLE_ORG) => check(HEAD + rows.join("\n"), org);
const titles = (r) => r.findings.map((f) => f.title);

test("dates and money are read the way a donor database writes them", () => {
  assert.equal(isoDay(parseDate("3/14/2026")), "2026-03-14");
  assert.equal(isoDay(parseDate("03/14/26")), "2026-03-14");
  assert.equal(isoDay(parseDate("2026-03-14T10:00:00Z")), "2026-03-14");
  assert.ok(Number.isNaN(parseDate("2026-02-30")));
  assert.equal(parseMoney("$1,250.50"), 125050);
  assert.equal(parseMoney("(50)"), -5000);
  assert.equal(parseMoney("-12.5"), -1250);
  assert.ok(Number.isNaN(parseMoney("abc")));
  assert.equal(parseMoney(""), null);
  assert.equal(dollars(125050), "$1,250.50");
});

test("gift types: a card is not a car, a pledge is not a gift, property is non-cash", () => {
  assert.equal(classifyType("Card", ""), "cash");
  assert.equal(classifyType("Credit card", ""), "cash");
  assert.equal(classifyType("Check", ""), "cash");
  assert.equal(classifyType("Pledge", ""), "pledge");
  assert.equal(classifyType("Vehicle", ""), "vehicle");
  assert.equal(classifyType("", "2014 Honda Civic car"), "vehicle");
  assert.equal(classifyType("In-kind", "ladders"), "noncash");
  assert.equal(classifyType("Stock", ""), "noncash");
  assert.equal(classifyType("Volunteer hours", ""), "services");
});

test("csv parser handles quotes, embedded commas and newlines, and a BOM", () => {
  const rows = parseCsv('﻿a,b\n"x, y","say ""hi"""\n"two\nlines",z\n');
  assert.deepEqual(rows.map((r) => r.cells), [["a", "b"], ["x, y", 'say "hi"'], ["two\nlines", "z"]]);
});

test("the sample list is clean and the broken sample trips every rule", () => {
  const ok = check(sampleList(), SAMPLE_ORG);
  assert.equal(ok.summary.errors, 0);
  assert.equal(ok.summary.donors, 4);
  const bad = check(sampleBrokenList(), SAMPLE_ORG);
  for (const t of ["Goods or services given with no value", "No donor name", "Unreadable date", "Negative amount", "Possible duplicate gift", "A pledge is not a gift yet", "Gift is in 2025, not 2026", "Vehicle gift: Form 1098-C"]) assert.ok(titles(bad).includes(t), t);
});

test("a plain gift of $250 or more needs a letter that says no goods or services were provided", () => {
  const r = run(["Ann Lee,,2026-03-01,250,Check,,No,,"]);
  assert.equal(r.donors[0].needsLetter, true);
  const t = letterText(r.donors[0], r.org);
  assert.match(t, /\$250\.00/);
  assert.match(t, /No goods or services were provided in exchange for your contributions\./);
  assert.match(t, /Example Community Fund/);
});

test("the threshold is per gift: $249.99 does not require a letter, $250.00 does", () => {
  assert.equal(run(["A,,2026-03-01,249.99,Card,,,,"]).donors[0].needsLetter, false);
  assert.equal(run(["A,,2026-03-01,250,Card,,,,"]).donors[0].needsLetter, true);
});

test("several small gifts are not aggregated into a requirement but are flagged and still lettered", () => {
  const r = run(["A,,2026-01-01,100,Card,,,,", "A,,2026-02-01,100,Card,,,,", "A,,2026-03-01,100,Card,,,,"]);
  assert.equal(r.donors[0].needsLetter, false);
  assert.ok(titles(r).includes("Several small gifts add up past $250"));
  assert.match(letterText(r.donors[0], r.org), /Total cash contributions: \$300\.00/);
});

test("quid pro quo: a payment over $75 with a benefit needs the value and the deductible part", () => {
  const r = run(["B,,2026-05-04,300,Card,,Dinner for two,120,Gala"]);
  assert.equal(r.donors[0].deductibleCents, 18000);
  const t = letterText(r.donors[0], r.org);
  assert.match(t, /estimated value of \$120\.00/);
  assert.match(t, /limited to \$180\.00/);
  assert.doesNotMatch(t, /No goods or services were provided in exchange for your contributions\./);
});

test("quid pro quo gift with no value is an error and is left out, not written as 'nothing received'", () => {
  const r = run(["B,,2026-05-04,300,Card,,Dinner for two,,Gala"]);
  assert.ok(titles(r).includes("Goods or services given with no value"));
  assert.equal(r.donors.length, 0);
  assert.equal(r.summary.skipped, 1);
});

test("a small quid pro quo payment (at or under $75) is not flagged as requiring disclosure", () => {
  const r = run(["C,,2026-05-04,50,Card,,Raffle ticket,5,"]);
  assert.ok(titles(r).includes("Quid pro quo disclosure not required at this size"));
  assert.notEqual(r.gifts[0].qpq, true);
});

test("a payment over $75 with a small benefit triggers a letter even under $250", () => {
  const r = run(["C,,2026-05-04,100,Card,,Tote bag,15,"]);
  assert.equal(r.donors[0].needsLetter, true);
  assert.equal(r.donors[0].hasQualifying, false);
});

test("non-cash gifts are described and never valued", () => {
  const r = run(["Harbor Hardware,,2026-08-22,,Non-cash,Ten ladders,No,,"]);
  const t = letterText(r.donors[0], r.org);
  assert.match(t, /Ten ladders/);
  assert.match(t, /No value is stated/);
  assert.doesNotMatch(t, /\$\d/);
  assert.equal(r.donors[0].cashCents, 0);
  assert.equal(r.donors[0].needsLetter, true);
});

test("a non-cash gift with a dollar amount drops it and says so; one with no description is an error", () => {
  const r = run(["H,,2026-08-22,900,Non-cash,Couch,,,", "J,,2026-08-23,,Non-cash,,,,"]);
  assert.ok(titles(r).includes("Value on a property gift is not used"));
  assert.ok(titles(r).includes("Non-cash gift has no description"));
  assert.doesNotMatch(letterText(r.donors[0], r.org), /900/);
  assert.equal(r.donors.length, 1);
});

test("pledges, services, refunds and wrong-year gifts are left out with a reason", () => {
  const r = run([
    "P,,2026-04-04,1000,Pledge,,,,", "S,,2026-04-04,0,Volunteer hours,,,,", "R,,2026-04-04,-50,Card,,,,", "Y,,2025-12-31,200,Card,,,,", "Ok,,2026-04-04,200,Card,,,,",
  ]);
  assert.deepEqual(r.donors.map((d) => d.donor), ["Ok"]);
  assert.equal(r.summary.skipped, 4);
});

test("a vehicle gift points to Form 1098-C and does not state a value", () => {
  const r = run(["V,,2026-07-07,4200,Vehicle,2014 Honda Civic,,,"]);
  assert.ok(titles(r).includes("Vehicle gift: Form 1098-C"));
  assert.doesNotMatch(letterText(r.donors[0], r.org), /4,200/);
});

test("a religious organisation may state intangible religious benefits only", () => {
  const r = run(["A,,2026-03-01,500,Check,,No,,"], { ...SAMPLE_ORG, religious: true });
  assert.match(letterText(r.donors[0], r.org), /other than intangible religious benefits/);
});

test("donors are grouped by name and address, ignoring case and spacing", () => {
  const r = run(["Maria  Alvarez,14 Oak St,2026-01-01,300,Card,,,,", "maria alvarez,14 oak st,2026-02-01,300,Card,,,,"]);
  assert.equal(r.donors.length, 1);
  assert.equal(r.donors[0].gifts.length, 2);
});

test("same name at two addresses is flagged rather than silently merged", () => {
  const r = run(["Sam Ortiz,1 A St,2026-01-01,300,Card,,,,", "Sam Ortiz,2 B St,2026-02-01,300,Card,,,,"]);
  assert.equal(r.donors.length, 2);
  assert.ok(titles(r).includes("Same name, different address"));
});

test("missing columns are named", () => {
  const r = readGifts("Name,Amount\nA,5");
  assert.ok(r.findings.some((f) => f.title === 'No "date" column'));
  assert.equal(r.gifts.length, 0);
  assert.equal(readGifts("").findings[0].title, "Nothing to read");
});

test("exports: letters text and html carry every donor, csvs escape commas", () => {
  const r = check(sampleList(), SAMPLE_ORG);
  const txt = lettersText(r, "2027-01-05");
  assert.equal((txt.match(/Dear /g) || []).length, 4);
  assert.match(txt, /Date: 2027-01-05/);
  const html = lettersHtml(r, "2027-01-05", true);
  assert.equal((html.match(/class="letter"/g) || []).length, r.summary.letters);
  assert.match(donorSummaryCsv(r), /"14 Oak St, Dayton OH 45402"/);
  assert.match(findingsCsv(check(sampleBrokenList(), SAMPLE_ORG)), /^Severity,Line,Donor,Finding,Detail/);
});

test("letters never invent a deductibility opinion", () => {
  const t = lettersText(check(sampleList(), SAMPLE_ORG), "2027-01-05");
  assert.match(t, /We cannot tell you whether or how much of a contribution you may deduct/);
  assert.doesNotMatch(t, /you may deduct \$|is tax[- ]deductible/i);
});

test("html letters escape donor-supplied text", () => {
  const r = run(["<script>alert(1)</script>,,2026-03-01,300,Card,,,,"]);
  assert.doesNotMatch(lettersHtml(r), /<script>alert/);
});

test("the deadline note names January 31 and April 15 of the following year", () => {
  assert.match(ackDeadlineNote(2026), /January 31, 2027/);
  assert.match(ackDeadlineNote(2026), /April 15, 2027/);
});
