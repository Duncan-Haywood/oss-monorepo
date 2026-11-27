import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { monthlyDates, retainageDates, draftNotice, holidays, deadline, parseDate, isoDate, FORMS, HOMESTEAD_STATEMENT, DELIVERY } from "./txnotice.mjs";

const SRC = readFileSync(new URL("./sources/tx-53.txt", import.meta.url), "utf8");
const statute = SRC.split("\n").filter((l) => !l.startsWith("#")).join("\n");
// The published HTML puts a space before a subsection after a section number ("53.057 (f)").
const flat = (s) => s.replace(/_+/g, " ").replace(/"/g, "").replace(/\s+/g, " ").replace(/(\d) \(/g, "$1(").trim();
const flatS = flat(statute);
const PAGE = readFileSync(new URL("./texas-lien-notice.html", import.meta.url), "utf8");

// Dates counted by hand on a 2026-2028 calendar.
test("commercial: 15th of the third month after each month of work; residential: the second", () => {
  const c = monthlyDates({ fromMonth: "2026-03", toMonth: "2026-04", today: "2026-03-10" });
  assert.deepEqual(c.errors, []);
  assert.deepEqual(c.months.map((m) => m.date), ["2026-06-15", "2026-07-15"]);
  assert.equal(c.months[0].extended, null); // Monday
  const r = monthlyDates({ type: "residential", fromMonth: "2026-03", toMonth: "2026-04" });
  assert.deepEqual(r.months.map((m) => m.date), ["2026-05-15", "2026-06-15"]);
});

test("a Saturday or Sunday date is extended to the next business day (§ 53.003(e)), the plan date stays", () => {
  const r = monthlyDates({ fromMonth: "2026-05", toMonth: "2026-08" });
  const may = r.months[0];
  assert.equal(may.date, "2026-08-15"); // Saturday
  assert.equal(may.extended, "2026-08-17");
  assert.deepEqual(may.why, ["2026-08-15 is Saturday", "2026-08-16 is Sunday"]);
  assert.equal(r.months[3].date, "2026-11-15"); // Sunday
  assert.equal(r.months[3].extended, "2026-11-16");
});

test("holidays: Gov't Code § 662.003 national and state days, a shared day named once", () => {
  const h = holidays(2026);
  assert.equal(h.get(parseDate("2026-01-19")), "Martin Luther King, Jr., Day and Confederate Heroes Day");
  assert.equal(h.get(parseDate("2026-11-26")), "Thanksgiving Day");
  assert.equal(h.get(parseDate("2026-11-27")), "the Friday after Thanksgiving Day");
  assert.equal(h.get(parseDate("2026-05-25")), "Memorial Day");
  assert.equal(h.get(parseDate("2026-06-19")), "Emancipation Day in Texas");
  assert.equal(h.size, 16);
  assert.equal(holidays(2027).size, 17);
  // November 2026 work is due 2027-02-15, Presidents' Day: moved to Tuesday.
  const nov = monthlyDates({ fromMonth: "2026-11" }).months[0];
  assert.equal(nov.date, "2027-02-15");
  assert.equal(nov.extended, "2027-02-16");
  // A Friday holiday then a weekend: 2026-12-24 (Thu), 25, 26 (Sat), 27 (Sun) -> 28.
  const d = deadline(parseDate("2026-12-24"));
  assert.equal(d.extended, "2026-12-28");
  assert.equal(d.why.length, 4);
  // Optional holidays (§ 662.003(c)) do not move a date: Good Friday 2027 is 26 March.
  assert.equal(deadline(parseDate("2027-03-26")).extended, null);
});

test("year end, past months and the next open date", () => {
  const r = monthlyDates({ fromMonth: "2026-09", toMonth: "2026-12", today: "2026-12-20" });
  assert.deepEqual(r.months.map((m) => m.date), ["2026-12-15", "2027-01-15", "2027-02-15", "2027-03-15"]);
  assert.equal(r.months[0].status.state, "past");
  assert.equal(r.next.month, "2026-10");
  assert.equal(r.next.status.daysLeft, 26);
  assert.match(r.notes.join(" "), /1 month\(s\) are past.*loses the lien for that month's work/);
});

test("lien affidavit: 15th of the fourth month after the last month (third residential), copy in 5 days, suit in a year", () => {
  const c = monthlyDates({ fromMonth: "2026-03", toMonth: "2026-04", lastMonth: "2026-06" });
  assert.equal(c.affidavit.date, "2026-10-15");
  assert.equal(c.affidavitCopy.date, "2026-10-20");
  assert.equal(c.suit.date, "2027-10-15");
  const r = monthlyDates({ type: "residential", fromMonth: "2026-03", lastMonth: "2026-06" });
  assert.equal(r.affidavit.date, "2026-09-15");
  // 2026-08 work: affidavit 2026-12-15 (Tue); 2026-10 work: 2027-02-15 Presidents' Day.
  assert.equal(monthlyDates({ fromMonth: "2026-10" }).affidavit.extended, "2027-02-16");
});

test("older original contracts are out of scope; bad input is named", () => {
  const old = monthlyDates({ contract: "2021-12-31", fromMonth: "2026-03" });
  assert.equal(old.oldLaw, true);
  assert.match(old.notes[0], /SECTION 37/);
  assert.equal(monthlyDates({ contract: "2022-01-01", fromMonth: "2026-03" }).oldLaw, undefined);
  assert.match(monthlyDates({ fromMonth: "2026-13" }).errors[0], /first month/);
  assert.match(monthlyDates({ fromMonth: "2026-05", toMonth: "2026-03" }).errors[0], /before the first/);
  assert.match(monthlyDates({ fromMonth: "2026-05", toMonth: "2026-06", lastMonth: "2026-05" }).errors[0], /before the last unpaid/);
  assert.match(monthlyDates({ fromMonth: "2023-01", toMonth: "2026-12" }).errors[0], /at most 36/);
  assert.match(monthlyDates({ contract: "2026-02-30", fromMonth: "2026-03" }).errors[0], /original contract date/);
});

test("retainage notice: earlier of 30 days after your contract ends or the original contract is terminated", () => {
  const a = retainageDates({ claimantDone: "2026-10-20", today: "2026-11-01" });
  assert.equal(a.notice.date, "2026-11-19");
  assert.equal(a.noticeFrom, "claimant");
  assert.equal(a.affidavit, undefined);
  assert.match(a.notes[0], /§ 53\.052\(d\)/);
  const b = retainageDates({ claimantDone: "2026-10-20", originalEnded: "2026-10-01" });
  assert.equal(b.notice.date, "2026-10-31"); // Saturday
  assert.equal(b.notice.extended, "2026-11-02");
  assert.equal(b.noticeFrom, "original");
  // Affidavit: 15th of the third month after the month the original contract ended.
  assert.equal(b.affidavit.date, "2027-01-15");
  assert.equal(b.reservedFunds.date, "2026-10-31");
  const c = retainageDates({ claimantDone: "2026-10-20", originalDone: "2026-12-01" });
  assert.equal(c.affidavit.date, "2027-03-15");
  assert.equal(c.reservedFunds.date, "2026-12-31");
  assert.match(retainageDates({}).errors[0], /your contract/);
});

test("both forms are the statute's, word for word, in order", () => {
  for (const [kind, form] of Object.entries(FORMS)) {
    const text = flat(form.map((l) => l.replace(/\{\{\w+\}\}/g, " ")).join(" "));
    assert.ok(flatS.includes(text), `${kind} form is not in § 53.056/§ 53.057 as written`);
  }
  for (const p of HOMESTEAD_STATEMENT) assert.ok(flatS.includes(flat(p)), p.slice(0, 40));
});

test("draft fills blanks, keeps the statute's underscores, and adds the homestead statement on request", () => {
  const d = draftNotice("monthly", { date: "2026-06-01", project: "1200 Main St, Austin", claimant: "Lone Star Drywall LLC", work: "Drywall labor and materials, April 2026", gc: "Capitol Builders Inc.", amount: "$18,400.00", contact: "J. Ortiz", address: "5 Oak Rd, Round Rock, TX" });
  assert.deepEqual(d.missing, []);
  assert.equal(d.lines[0], "NOTICE OF CLAIM FOR UNPAID LABOR OR MATERIALS");
  assert.ok(d.lines.includes("Claim amount: $18,400.00"));
  assert.ok(d.lines.includes("Party with whom claimant contracted if different from original contractor: _______________"));
  assert.ok(!d.text.includes("If a subcontractor or supplier"));
  const h = draftNotice("retainage", {}, { homestead: true });
  assert.equal(h.lines[0], "NOTICE OF CLAIM FOR UNPAID RETAINAGE");
  assert.equal(h.missing.length, 8);
  assert.ok(h.text.endsWith("written notice of the claim."));
  assert.throws(() => draftNotice("nope"));
});

// Visible text of the page: script blocks dropped (any case, `</script >` too), tags
// dropped, entities decoded in one pass so "&amp;#39;" stays literal.
const ENTITIES = { "&amp;": "&", "&#39;": "'", "&rsquo;": "'" };
function pageText(html) {
  return html.replace(/<script\b[\s\S]*?<\/script[^>]*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&(?:amp|#39|rsquo);/g, (e) => ENTITIES[e]);
}

test("every quoted phrase on the page is in the statute snapshot", () => {
  const body = pageText(PAGE);
  const quotes = [...body.matchAll(/“([^”]+)”/g)].map((m) => m[1]);
  assert.ok(quotes.length >= 10, `only ${quotes.length} quotes`);
  for (const q of quotes) assert.ok(flatS.includes(flat(q)), `not in the statute: “${q}”`);
  for (const line of DELIVERY) assert.ok(/§ 53\.003/.test(line));
});

test("page text extraction drops upper-case script blocks and does not double-decode entities", () => {
  assert.equal(pageText("a<SCRIPT>x</SCRIPT >b").replace(/\s/g, ""), "ab");
  assert.equal(pageText("&amp;#39;"), "&#39;");
});

test("page: inputs labelled, wired to txnotice.mjs, sources linked with a read date, disclaimer", () => {
  for (const id of ["type", "contract", "from", "to", "last", "today", "r-claimant", "r-ended", "r-done", "kind", "homestead", "f-date", "f-project", "f-claimant", "f-work", "f-gc", "f-hiredBy", "f-amount", "f-contact", "f-address"]) assert.match(PAGE, new RegExp(`<label for="${id}">`), id);
  assert.match(PAGE, /from "\.\/txnotice\.mjs"/);
  assert.match(PAGE, /record\("guide_tx_notice_viewed"\)/);
  assert.match(PAGE, /href="https:\/\/statutes\.capitol\.texas\.gov\/Docs\/PR\/htm\/PR\.53\.htm"/);
  assert.match(PAGE, /href="https:\/\/statutes\.capitol\.texas\.gov\/Docs\/GV\/htm\/GV\.662\.htm"/);
  assert.match(PAGE, /read <strong>2026-11-27<\/strong>/);
  assert.match(PAGE, /No warranty/);
  assert.equal(isoDate(parseDate("2026-11-27")), "2026-11-27");
});
