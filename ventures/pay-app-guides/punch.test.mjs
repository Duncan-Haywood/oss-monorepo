import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parseLines, status, summaryText, backCheckEmail, itemsCsv, sampleItems, SAMPLE_SETTINGS } from "./punch.mjs";
import { parseDate } from "./colog.mjs";

test("status follows PayApps' order: accepted, not ours, done, overdue, open", () => {
  const d = (s) => parseDate(s);
  const today = d("2026-11-20");
  assert.equal(status({ accepted: d("2026-11-12"), notOurs: "x", fixed: d("2026-11-10") }, today), "accepted");
  assert.equal(status({ notOurs: "other trade", fixed: d("2026-11-10") }, today), "disputed");
  assert.equal(status({ fixed: d("2026-11-10"), due: d("2026-11-01") }, today), "done");
  assert.equal(status({ due: d("2026-11-19") }, today), "overdue");
  assert.equal(status({ due: d("2026-11-20") }, today), "open", "due today is not overdue");
  assert.equal(status({}, today), "open");
});

test("the example: counts by hand", () => {
  const r = compute(sampleItems(), SAMPLE_SETTINGS);
  assert.deepEqual(r.errors, []);
  const s = r.summary;
  // P-001, P-006 accepted; P-002 done; P-003 overdue (due 11-14); P-004 open (due 11-24); P-005 not ours.
  assert.deepEqual([s.total, s.accepted, s.done, s.overdue, s.open, s.disputed, s.counted, s.left], [6, 2, 1, 1, 1, 1, 5, 3]);
  assert.equal(s.acceptedPct, 40);
  assert.equal(s.complete, false);
  assert.equal(r.items.find((x) => x.number === "P-003").daysOverdue, 6);
  assert.equal(r.held, 1840000);
  assert.match(summaryText(r), /\$18,400\.00 of retainage held while 3 items are not accepted/);
  assert.ok(r.findings.some((f) => f.severity === "high" && /P-003 \(6 days\)/.test(f.text)));
});

test("back-check email lists only fixed, unaccepted items and the count still open", () => {
  const r = compute(sampleItems(), SAMPLE_SETTINGS);
  const e = backCheckEmail(r, { pm: "Maria Hill", project: "Elm St Clinic", sub: "Spark Electric", gc: "Hill Builders" });
  assert.match(e, /^Subject: Elm St Clinic: punch list items ready for back-check/);
  assert.match(e, /Hi Maria,/);
  assert.match(e, /P-002  Room 104: Label panel LP-1 directory \(fixed 2026-11-09\)/);
  assert.doesNotMatch(e, /P-001|P-003|P-005|P-006/);
  assert.match(e, /2 items are still open on our side/);
  assert.doesNotMatch(e, /entitled|release is due|conditions? (are|is) met/i);
  assert.equal(backCheckEmail(compute("Description\nFix it", {})), "");
});

test("a list pasted from an email: numbering dropped, location split, numbers assigned", () => {
  assert.deepEqual(parseLines("1. Room 104 - missing cover plate\n2) Corridor: touch up paint\n- Label panel\nP-007 Lobby\tcracked plate\n\n"), [
    { description: "missing cover plate", location: "Room 104" },
    { description: "touch up paint", location: "Corridor" },
    { description: "Label panel", location: "" },
    { description: "cracked plate", location: "Lobby" },
  ]);
  const r = compute("1. Room 104 - missing cover plate\n2. Label panel", { asOf: "2026-11-20" });
  assert.deepEqual(r.items.map((x) => [x.number, x.status]), [["P-001", "open"], ["P-002", "open"]]);
  assert.ok(r.findings.some((f) => /no due date/.test(f.text)));
});

test("items without a number continue after the highest one given", () => {
  const r = compute("Item,Description\nP-004,a\n,b\n12,c\n,d", {});
  assert.deepEqual(r.items.map((x) => x.number), ["P-004", "P-013", "12", "P-014"]);
});

test("bad dates and impossible orders are errors, not guesses", () => {
  assert.match(compute("Description,Due\nx,next week", {}).errors[0], /not a date/);
  assert.match(compute("Description,Listed,Fixed\nx,2026-11-10,2026-11-01", {}).errors[0], /fixed before it was listed/);
  assert.match(compute("Description,Fixed,Accepted\nx,2026-11-10,2026-11-01", {}).errors[0], /accepted before it was fixed/);
  assert.match(compute("Description\nx", { retainage: "-5" }).errors[0], /Retainage/);
  assert.match(compute("Item,Description\n1,", {}).errors[0], /no description/);
});

test("all accepted: complete, and the finding points to the release letter", () => {
  const r = compute("Description,Fixed,Accepted,Not ours\na,2026-11-01,2026-11-02,\nb,,,Painter's work", { asOf: "2026-11-20", retainage: "1000" });
  assert.equal(r.summary.complete, true);
  assert.match(summaryText(r), /Punch list complete; \$1,000\.00 of retainage held\./);
  assert.ok(r.findings.some((f) => /ask for your retainage in writing/.test(f.text)));
});

test("CSV neutralises formula cells and keeps a GC initials column", () => {
  const r = compute('Description,Location\n"=HYPERLINK(""x"")",@room', {});
  const csv = itemsCsv(r);
  assert.match(csv.split("\n")[0], /,GC initials$/);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /'@room/);
});

// Red-team 2026-11-27: guards for mutants of punch.mjs that the suite let through.
test("table errors name the spreadsheet row (header is row 1)", () => {
  const r = compute("Item,Description,Listed\nP-1,Fix plate,2026-11-03\nP-2,,2026-11-03\nP-3,Seal,nope\n");
  assert.deepEqual(r.errors, ["Row 3: no description.", 'Row 4: "nope" is not a date (use YYYY-MM-DD or MM/DD/YYYY).']);
});

test("pasted lines keep their order in line numbers", () => {
  const r = compute("Fix plate\nSeal conduit\n");
  assert.deepEqual(r.items.map((x) => x.line), [1, 2]);
});

test("P- numbers of up to four digits are dropped; longer ones stay as text", () => {
  assert.equal(parseLines("P-0004 Label panel")[0].description, "Label panel");
  assert.equal(parseLines("P-12345 Label panel")[0].description, "P-12345 Label panel");
});

test("no 'who accepted' finding when nobody on the list names an acceptor", () => {
  const text = "Item,Description,Fixed,Accepted,Accepted by\nP-1,Fix plate,2026-11-07,2026-11-12,\n";
  const r = compute(text, { asOf: "2026-11-20" });
  assert.equal(r.findings.some((f) => /who accepted/.test(f.text)), false);
  const named = compute(text + "P-2,Seal,2026-11-07,2026-11-12,M. Hill\n", { asOf: "2026-11-20" });
  assert.equal(named.findings.some((f) => /1 accepted item does not say who accepted it/.test(f.text)), true);
});

test("the back-check email puts the date right under the subject", () => {
  const r = compute(sampleItems(), SAMPLE_SETTINGS);
  const lines = backCheckEmail(r, { date: "2026-11-20" }).split("\n");
  assert.match(lines[0], /^Subject: /);
  assert.equal(lines[1], "Date: 2026-11-20");
});
