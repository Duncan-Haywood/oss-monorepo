import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { noticeDates, whoFiles, checklist, weekday, parseDate, ITEMS, IDENTIFIERS } from "./utprelim.mjs";

const STATUTE = readFileSync(new URL("./sources/ut-38.txt", import.meta.url), "utf8");
// The legislature's HTML puts a space before punctuation after a cross-reference ("Subsection (1)(c) ,").
const flat = (s) => s.replace(/\s+/g, " ").replace(/ ([,.;:])/g, "$1").trim();
const FLAT = flat(STATUTE);
const PAGE = readFileSync(new URL("./utah-preliminary-notice.html", import.meta.url), "utf8");
const ENTITIES = { "&amp;": "&", "&#x27;": "'", "&#39;": "'" };
const decode = (s) => s.replace(/&amp;|&#x27;|&#39;/g, (e) => ENTITIES[e]);

// Dates counted by hand on a calendar.
test("20 calendar days after work starts; the weekday is named", () => {
  const r = noticeDates({ first: "2026-04-06", today: "2026-04-10" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.lastDay, "2026-04-26");
  assert.equal(r.weekday, "Sunday");
  assert.equal(r.status.daysLeft, 16);
  assert.match(r.rule, /§ 38-1a-501\(1\)\(a\)/);
  assert.match(r.notes.join(" "), /§ 68-3-7/);
  const wd = noticeDates({ first: "2026-04-08" });
  assert.equal(wd.lastDay, "2026-04-28");
  assert.equal(wd.weekday, "Tuesday");
  assert.equal(wd.notes.length, 0);
});

test("month end and leap year", () => {
  assert.equal(noticeDates({ first: "2028-02-15" }).lastDay, "2028-03-06");
  assert.equal(noticeDates({ first: "2026-12-20" }).lastDay, "2027-01-09");
  assert.equal(weekday(parseDate("2026-11-28")), "Saturday");
});

test("filed on the last day is on time", () => {
  const r = noticeDates({ first: "2026-04-08", filed: "2026-04-28" });
  assert.equal(r.onTime, true);
  assert.equal(r.covers, "all of your work on this job");
});

test("a late private filing covers work from five days after filing", () => {
  const r = noticeDates({ first: "2026-04-06", filed: "2026-05-04" });
  assert.equal(r.onTime, false);
  assert.equal(r.effectiveFrom, "2026-05-09");
  assert.equal(r.lostDays, 33);
  assert.match(r.notes.join(" "), /Late by 8 day\(s\)/);
  assert.match(r.notes.join(" "), /2026-04-06 to 2026-05-08 is outside the lien/);
});

test("a notice of completion: cut-off 10 days after it, lien 90 days after it, capped at 180 after completion", () => {
  const a = noticeDates({ first: "2026-04-06", completed: "2026-10-30" });
  assert.equal(a.recordBy, "2027-04-28");
  assert.match(a.recordRule, /180 days after final completion/);
  const b = noticeDates({ first: "2026-04-06", completed: "2026-10-30", noc: "2026-11-05" });
  assert.equal(b.recordBy, "2027-02-03");
  assert.match(b.recordRule, /90 days after the notice of completion/);
  assert.equal(b.cutoff, "2026-11-15");
  // A notice of completion filed late in the 180 days: the 180 still caps it.
  const c = noticeDates({ first: "2026-04-06", completed: "2026-10-30", noc: "2027-03-01" });
  assert.equal(c.recordBy, "2027-04-28");
  assert.match(c.recordRule, /outer limit/);
  // Filed 11 days after the notice of completion: no effect.
  const d = noticeDates({ first: "2026-04-06", filed: "2026-11-16", completed: "2026-10-30", noc: "2026-11-05" });
  assert.equal(d.noEffect, true);
  assert.match(d.notes[0], /no effect \(§ 38-1a-501\(1\)\(d\)\)/);
  const e = noticeDates({ first: "2026-04-06", filed: "2026-11-15", completed: "2026-10-30", noc: "2026-11-05" });
  assert.equal(e.noEffect, undefined);
  assert.equal(noticeDates({ first: "2026-04-06" }).recordBy, undefined);
});

test("government jobs: the later of two 20-day dates, the 15-day rule, effective five days after a late filing", () => {
  const a = noticeDates({ project: "government", first: "2026-04-06", commencement: "2026-04-15" });
  assert.equal(a.lastDay, "2026-05-05");
  assert.match(a.rule, /later of/);
  assert.equal(a.notes.some((n) => /§ 38-1b-202\(8\)/.test(n)), false);
  const b = noticeDates({ project: "government", first: "2026-04-06", commencement: "2026-04-23" });
  assert.equal(b.lastDay, "2026-05-13");
  assert.match(b.notes.join(" "), /17 days after you began work.*§ 38-1b-202\(8\)/);
  const c = noticeDates({ project: "government", first: "2026-04-20", commencement: "2026-04-15" });
  assert.equal(c.lastDay, "2026-05-10");
  const d = noticeDates({ project: "government", first: "2026-04-06", filed: "2026-05-01" });
  assert.equal(d.onTime, false);
  assert.match(d.notes.join(" "), /§ 38-1b-202\(5\)/);
  // No lien date on a government job: the claim is on the bond.
  assert.equal(noticeDates({ project: "government", first: "2026-04-06", completed: "2026-10-30" }).recordBy, undefined);
});

test("who files: everyone on private jobs, subcontractors only on government jobs", () => {
  for (const role of ["sub", "direct", "laborer"]) assert.equal(whoFiles("private", role).needed, true, role);
  assert.equal(whoFiles("government", "sub").needed, true);
  assert.equal(whoFiles("government", "direct").needed, false);
  assert.equal(whoFiles("government", "laborer").needed, false);
  assert.match(whoFiles("private", "direct").why, /§ 38-1a-503\(1\)/);
});

test("bad input is named, never guessed", () => {
  assert.match(noticeDates({ first: "" }).errors[0], /first provided/);
  assert.match(noticeDates({ first: "2026-02-30" }).errors[0], /first provided/);
  assert.match(noticeDates({ first: "2026-04-06", filed: "4/20/2026" }).errors[0], /filed/);
  assert.match(noticeDates({ project: "county", first: "2026-04-06" }).errors[0], /private or a government/);
  assert.match(noticeDates({ first: "2026-04-06", filed: "2026-04-01" }).errors[0], /before the first day/);
  assert.match(noticeDates({ first: "2026-04-06", completed: "2026-10-30", noc: "2026-10-01" }).errors[0], /upon final completion/);
});

test("the checklist names each § 38-1a-501(1)(h) item and needs one project identifier", () => {
  const empty = checklist({});
  assert.equal(empty.missing.length, ITEMS.length + 1);
  for (const [, label, cite] of [...ITEMS, ...IDENTIFIERS]) assert.ok(empty.text.includes(label), label), assert.ok(empty.text.includes(cite) || IDENTIFIERS.some((i) => i[2] === cite), cite);
  const full = checklist({ claimant: "Wasatch Mechanical LLC, 410 W 800 S, SLC, 801-555-0142, office@example.com", hiredBy: "Beehive Builders Inc.", owner: "Granary Lofts LLC", original: "Beehive Builders Inc.", site: "750 W 900 S, Salt Lake City", county: "Salt Lake", prelimEntry: "123456", first: "2026-04-06" });
  assert.deepEqual(full.missing, []);
  assert.equal(full.linked, true);
  const noEmail = checklist({ claimant: "Wasatch Mechanical LLC, 801-555-0142", hiredBy: "x", owner: "x", original: "x", site: "x", county: "x", permit: "B-1" });
  assert.deepEqual(noEmail.missing, ["an email address in your contact details (§ 38-1a-501(1)(h)(i) asks for one)"]);
});

test("the lien rule matches PayApps' Utah entry", () => {
  const src = readFileSync(new URL("../payapps/apps/payapps/src/shared/lien-deadline.ts", import.meta.url), "utf8");
  const ut = src.slice(src.indexOf("  UT: {"), src.indexOf("  VA: {"));
  assert.match(ut, /completionDays: 180/);
  assert.match(ut, /nocDays: 90/);
  assert.match(ut, /§ 38-1a-502\(1\)/);
});

test("every quoted phrase on the page is in the statute", () => {
  const quotes = [...PAGE.matchAll(/“([^”]+)”/g)].map((m) => decode(m[1]));
  assert.ok(quotes.length >= 10, `found ${quotes.length} quotes`);
  for (const q of quotes) assert.ok(!q.includes("<"), `keep markup outside the quote marks: "${q}"`);
  for (const q of quotes) assert.ok(FLAT.includes(flat(q)), `not in the statute: "${q}"`);
});

test("the snapshot has every section the page cites, and the page links each on le.utah.gov", () => {
  for (const s of ["38-1a-S102", "38-1a-S501", "38-1a-S502", "38-1a-S503", "38-1a-S506", "38-1a-S507", "38-1a-S701", "38-1b-S202", "68-3-S7"]) {
    assert.ok(STATUTE.includes(`C${s}_`), s);
    assert.match(PAGE, new RegExp(`href="https://le\\.utah\\.gov/xcode/Title\\d+/Chapter\\w+/${s}\\.html"`), s);
  }
  assert.match(PAGE, /read <strong>2026-11-28<\/strong>/);
  for (const id of ["project", "role", "first", "filed", "commencement", "completed", "noc", "today"]) assert.match(PAGE, new RegExp(`<label for="${id}">`), id);
  const waivers = readFileSync(new URL("./utah-lien-waiver-forms.html", import.meta.url), "utf8");
  assert.match(waivers, /href="utah-preliminary-notice\.html"/);
});
