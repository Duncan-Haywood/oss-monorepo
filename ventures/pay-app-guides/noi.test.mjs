import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { noiDates, draftNotice, addMonths, parseDate, isoDate, STATES, WY_NOTE, WY_HEAD, WY_TO_CAPTION, wyBody } from "./noi.mjs";

const SRC = readFileSync(new URL("./sources/noi.txt", import.meta.url), "utf8");
const flat = (s) => s.replace(/\s+/g, " ").trim();
const FLAT = flat(SRC);
const PAGE = readFileSync(new URL("./notice-of-intent-to-lien.html", import.meta.url), "utf8");
// One pass, so "&amp;#39;" becomes "&#39;" and is not decoded a second time.
const ENTITIES = { "&amp;": "&", "&#x27;": "'", "&#39;": "'", "&quot;": '"' };
const decode = (s) => s.replace(/&amp;|&#x27;|&#39;|&quot;/g, (e) => ENTITIES[e]);

test("Colorado: four months after last furnishing, serve 10 days before (hand-counted)", () => {
  const r = noiDates({ state: "CO", last: "2026-06-30", today: "2026-10-01" });
  assert.equal(r.lienBy, "2026-10-30");
  assert.equal(r.fileOn, "2026-10-30");
  assert.equal(r.serveBy, "2026-10-20");
  assert.equal(r.status.daysLeft, 19);
  assert.equal(r.status.state, "open");
});

test("addMonths clamps to the month's end, like PayApps' lien-deadline.ts", () => {
  assert.equal(isoDate(addMonths(parseDate("2026-10-31"), 4)), "2027-02-28");
  assert.equal(isoDate(addMonths(parseDate("2027-10-31"), 4)), "2028-02-29");
  const r = noiDates({ state: "CO", last: "2026-10-31" });
  assert.equal(r.lienBy, "2027-02-28");
  assert.equal(r.serveBy, "2027-02-18");
});

test("North Dakota: 90 days, notice 10 days before recording", () => {
  const r = noiDates({ state: "ND", last: "2026-03-01" });
  assert.equal(r.lienBy, "2026-05-30"); // March 30 + April 30 + May 30 = 90
  assert.equal(r.serveBy, "2026-05-20");
});

test("Wyoming: 120 days for a sub, 150 for a contractor, from the earlier of last day and substantial completion; 20 days before", () => {
  const sub = noiDates({ state: "WY", last: "2026-05-01" });
  assert.equal(sub.lienBy, "2026-08-29");
  assert.equal(sub.serveBy, "2026-08-09");
  const gc = noiDates({ state: "WY", role: "direct", last: "2026-05-01" });
  assert.equal(gc.lienBy, "2026-09-28");
  const early = noiDates({ state: "WY", last: "2026-05-01", completed: "2026-04-21" });
  assert.equal(early.lienBy, "2026-08-19");
  assert.match(early.lienRule, /substantial completion/);
  const later = noiDates({ state: "WY", last: "2026-05-01", completed: "2026-06-01" });
  assert.equal(later.lienBy, "2026-08-29");
});

test("Missouri: no lien date computed; the filing day you enter dates the notice; an original contractor is excluded", () => {
  const none = noiDates({ state: "MO", last: "2026-05-01" });
  assert.equal(none.lienBy, undefined);
  assert.equal(none.serveBy, undefined);
  assert.ok(none.notes.some((n) => /Enter the day you will file/.test(n)));
  const r = noiDates({ state: "MO", file: "2026-09-15" });
  assert.equal(r.serveBy, "2026-09-05");
  const gc = noiDates({ state: "MO", role: "direct", file: "2026-09-15" });
  assert.equal(gc.needed, false);
  assert.match(gc.excluded, /except the original contractor/);
});

test("a planned filing day after the deadline is flagged; a passed serve-by day says what is left", () => {
  const late = noiDates({ state: "CO", last: "2026-06-30", file: "2026-11-15" });
  assert.match(late.notes[0], /after the last day/);
  const still = noiDates({ state: "CO", last: "2026-06-30", today: "2026-10-19", file: "2026-10-25" });
  assert.equal(still.status.state, "past");
  assert.match(still.notes[0], /serve now/);
  const gone = noiDates({ state: "CO", last: "2026-06-30", today: "2026-10-25" });
  assert.match(gone.notes[0], /attorney/);
  const served = noiDates({ state: "ND", last: "2026-03-01", served: "2026-05-25" });
  assert.equal(served.servedOk, false);
  assert.equal(served.earliestFile, "2026-06-04");
  assert.match(served.servedNote, /after the last day to file/);
});

test("bad dates are refused, not guessed", () => {
  assert.ok(noiDates({ state: "CO", last: "2026-02-30" }).errors.length);
  assert.ok(noiDates({ state: "CO", last: "2026-06-30", file: "2026-06-01" }).errors.length);
  assert.ok(noiDates({ state: "XX" }).errors.length);
});

test("Wyoming draft is the § 29-10-102 form word for word, blanks aside", () => {
  const start = SRC.indexOf("Note to lien claimant:");
  const form = flat(SRC.slice(start, SRC.indexOf("cc:", start)));
  for (const s of [WY_NOTE, WY_HEAD, WY_TO_CAPTION]) assert.ok(form.includes(s), s);
  const statute = flat(form.slice(form.indexOf("You are hereby"))).replace(/_{3,}/g, "<>");
  assert.equal(wyBody({ claimant: "<>", amount: "<>", dueFrom: "<>" }).join(" "), statute);
  const d = draftNotice("WY", { owner: "A", date: "2026-08-01", claimant: "B LLC", amount: "1,250", dueFrom: "C Inc.", signer: "D" });
  assert.equal(d.missing.length, 0);
  assert.match(d.text, /The amount of the lien claim is \$1,250\.00\./);
});

test("plain drafts carry what the statute asks for and name what is blank", () => {
  const co = draftNotice("CO", {});
  assert.ok(co.missing.includes("the prime contractor and address"));
  const mo = draftNotice("MO", { owner: "O", claimant: "Show Me Drywall LLC, 1 Main St", dueFrom: "GC Inc.", property: "9 Elm St", county: "Greene", work: "drywall", amount: "18400", date: "2026-09-01", signer: "Pat", fileOn: "2026-09-15" });
  assert.equal(mo.missing.length, 0);
  assert.match(mo.text, /holds a claim against the building or improvement/);
  assert.match(mo.text, /\$18,400\.00, due from GC Inc\./);
  assert.match(mo.text, /Show Me Drywall LLC intends to file the lien with the clerk of the circuit court when 10 days have passed after this notice is served/);
});

test("every quoted phrase on the page and in noi.mjs is in the statutes", () => {
  const MJS = readFileSync(new URL("./noi.mjs", import.meta.url), "utf8");
  const quotes = [...decode(PAGE).matchAll(/“([^”]+)”/g), ...MJS.matchAll(/“([^”]+)”/g)].map((m) => m[1]);
  assert.ok(quotes.length >= 8, `found ${quotes.length}`);
  for (const q of quotes) assert.ok(FLAT.includes(flat(q)), `not in sources/noi.txt: "${q}"`);
});

test("page: inputs labelled, each state's statute linked with the read date, FAQ matches, linked from the lien pages", () => {
  for (const [, s] of Object.entries(STATES)) assert.ok(PAGE.includes(`href="${s.url.replace(/&/g, "&amp;")}"`), s.name);
  assert.match(PAGE, /read <strong>2026-11-28<\/strong>/);
  for (const m of PAGE.matchAll(/<(input|select)[^>]*id="([^"]+)"/g)) assert.match(PAGE, new RegExp(`<label for="${m[2]}"`), m[2]);
  assert.match(PAGE, /from "\.\/noi\.mjs"/);
  const faq = JSON.parse(PAGE.match(/<script type="application\/ld\+json">(\{"@context": "https:\/\/schema\.org", "@type": "FAQPage"[\s\S]*?)<\/script>/)[1]);
  for (const q of faq.mainEntity) assert.ok(PAGE.includes(`<h3>${q.name}</h3>`), q.name);
  for (const name of ["paid-short.html", "lien-waiver-forms-by-state.html"]) {
    const other = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
    assert.match(other, /href="notice-of-intent-to-lien\.html"/, name);
  }
});

test("the amount is read as a plain number only", () => {
  for (const bad of ["1e3", "0x10", "", "-5", "12.345", "1,23"]) assert.ok(draftNotice("ND", { amount: bad }).missing.includes("the amount claimed"), bad);
  assert.match(draftNotice("ND", { amount: "$18,400.5" }).text, /\$18,400\.50/);
});
