import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { noticeDates, whoServes, ROLES, JOBS } from "./ohfurnish.mjs";

const STATUTE = readFileSync(new URL("./sources/oh-1311.txt", import.meta.url), "utf8");
const flat = (s) => s.replace(/\s+/g, " ").trim();
const FLAT = flat(STATUTE.split("\n").filter((l) => !l.startsWith("#")).join(" "));
const PAGE = readFileSync(new URL("./ohio-notice-of-furnishing.html", import.meta.url), "utf8");
const MODULE = readFileSync(new URL("./ohfurnish.mjs", import.meta.url), "utf8");
const ENTITIES = { "&amp;": "&", "&#x27;": "'", "&#39;": "'" };
const decode = (s) => s.replace(/&amp;|&#x27;|&#39;/g, (e) => ENTITIES[e]);

const BLANK = "<>";
const blanks = (s) =>
  flat(s)
    .replace(/_{4,}/g, BLANK)
    .replace(/\s*<>\s*/g, ` ${BLANK} `)
    .replace(new RegExp(`${BLANK}(\\s*${BLANK})+`, "g"), BLANK)
    .replace(/\s+/g, " ")
    .trim();

test("every quoted phrase on the page and in the calculator is in the statute", () => {
  const quotes = [...PAGE.matchAll(/“([^”]+)”/g), ...MODULE.matchAll(/“([^”]+)”/g)].map((m) => decode(m[1]));
  assert.ok(quotes.length >= 15, `found ${quotes.length} quotes`);
  for (const q of quotes) assert.ok(!q.includes("<"), `keep markup outside the quote marks: "${q}"`);
  for (const q of quotes) assert.ok(FLAT.includes(flat(q)), `not in the statute: "${q}"`);
});

test("the form on the page is § 1311.05(B)'s, word for word, blanks aside", () => {
  const section = PAGE.slice(PAGE.indexOf('<section class="card statement" id="form">'));
  const body = section.slice(section.indexOf('<p class="bold">Notice of Furnishing'), section.indexOf('<p class="note">'));
  const printed = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => decode(m[1])).join(" ");
  const start = STATUTE.indexOf('"Notice of Furnishing\n(For use in connection with improvements\nto property other');
  const form = STATUTE.slice(start + 1, STATUTE.indexOf('Date:"', start) + 5);
  // The page adds a line under the original contractor's name for its address, and one after "Date:".
  const expected = flat(form)
    .replace("(Name of original contractor from notice of commencement) (Address", "(Name of original contractor from notice of commencement) ____ (Address")
    .replace(/Date:$/, "Date: ____");
  assert.equal(blanks(printed), blanks(expected));
});

test("the page prints the same form PayApps prints (packages/lien-waivers/src/oh-notice.ts)", async () => {
  const { OH_WARNING, OH_SUBTITLE, OH_CAPTIONS } = await import("../payapps/packages/lien-waivers/src/oh-notice.ts");
  const text = decode(PAGE);
  for (const s of [OH_WARNING, OH_SUBTITLE, ...Object.values(OH_CAPTIONS)]) assert.ok(text.includes(s), s);
});

test("who serves: subs and suppliers on a job with a recorded notice of commencement, nobody else", () => {
  for (const role of Object.keys(ROLES)) for (const job of Object.keys(JOBS)) {
    const r = whoServes(role, job);
    const expected = job === "public" ? role === "lower" : job === "recorded" && (role === "sub" || role === "lower");
    assert.equal(r.needed, expected, `${role} on ${job}`);
  }
  assert.match(whoServes("sub", "recorded").why, /does not require you to serve it too/);
  assert.match(whoServes("lower", "recorded").why, /both the designee/);
  assert.match(whoServes("direct", "recorded").why, /No original contractor/);
  assert.match(whoServes("sub", "home").why, /home construction contract/);
  assert.equal(whoServes("x", "recorded").needed, null);
});

test("last day: first furnished + 21 calendar days, hand counted", () => {
  const r = noticeDates({ first: "2026-11-02", today: "2026-11-20" });
  assert.equal(r.lastDay, "2026-11-23");
  assert.equal(r.weekday, "Monday");
  assert.deepEqual(r.status, { daysLeft: 3, state: "soon" });
  // Across a month end, landing on a Saturday.
  const s = noticeDates({ first: "2026-01-14" });
  assert.equal(s.lastDay, "2026-02-04");
  const sat = noticeDates({ first: "2026-11-07" });
  assert.equal(sat.lastDay, "2026-11-28");
  assert.equal(sat.weekday, "Saturday");
  assert.ok(sat.notes.some((n) => n.includes("does not move a deadline")));
});

test("§ 1311.04(I): a notice of commencement recorded after you start restarts the 21 days", () => {
  const r = noticeDates({ first: "2026-11-02", recorded: "2026-11-10" });
  assert.equal(r.lastDay, "2026-12-01");
  assert.match(r.rule, /1311\.04\(I\)/);
  // Recorded before you started: no change.
  assert.equal(noticeDates({ first: "2026-11-02", recorded: "2026-10-01" }).lastDay, "2026-11-23");
});

test("§ 1311.04(J): a copy served more than 10 days after the request runs the 21 days from it", () => {
  const r = noticeDates({ first: "2026-11-02", requested: "2026-11-03", received: "2026-11-20" });
  assert.equal(r.lastDay, "2026-12-11");
  assert.match(r.rule, /1311\.04\(E\), \(J\)/);
  // Served within the 10 days: no extension.
  assert.equal(noticeDates({ first: "2026-11-02", requested: "2026-11-03", received: "2026-11-13" }).lastDay, "2026-11-23");
  // Not served yet: the date it is due, and the rule.
  const w = noticeDates({ first: "2026-11-02", requested: "2026-11-03" });
  assert.ok(w.notes.some((n) => n.includes("by 2026-11-13")));
  assert.deepEqual(noticeDates({ first: "2026-11-02", requested: "2026-11-10", received: "2026-11-09" }).errors.length, 1);
});

test("§ 1311.05(D): a late notice covers the 21 days before service and after", () => {
  const r = noticeDates({ first: "2026-11-02", served: "2026-12-10" });
  assert.equal(r.onTime, false);
  assert.equal(r.coversFrom, "2026-11-19");
  assert.match(r.notes.join(" "), /Late by 17 day\(s\)/);
  const ok = noticeDates({ first: "2026-11-02", served: "2026-11-23" });
  assert.equal(ok.onTime, true);
  assert.equal(ok.covers, "all of your work on this job");
});

test("§ 1311.06(B): the lien affidavit 75 days after last work, 60 on a home or condo unit", () => {
  assert.equal(noticeDates({ first: "2026-11-02", last: "2026-12-15" }).affidavitBy, "2027-02-28");
  const home = noticeDates({ first: "2026-11-02", last: "2026-12-15", property: "dwelling" });
  assert.equal(home.affidavitBy, "2027-02-13");
  assert.match(home.affidavitRule, /1311\.06\(B\)\(1\)/);
  assert.ok(home.notes.some((n) => n.includes("§ 1311.07")));
});

test("bad dates are named, not guessed", () => {
  assert.equal(noticeDates({ first: "11/02/2026" }).errors.length, 1);
  assert.equal(noticeDates({ first: "2026-11-02", served: "soon" }).errors.length, 1);
  assert.equal(noticeDates({ first: "2026-11-02", last: "2026-11-01" }).errors.length, 1);
});

test("page: inputs labelled, codes.ohio.gov cited with the read date, linked from the guides", () => {
  for (const id of ["job", "role", "first", "recorded", "requested", "received", "served", "last", "property", "today"]) {
    assert.match(PAGE, new RegExp(`<label for="${id}">`), id);
  }
  for (const s of ["1311.04", "1311.05", "1311.06", "1311.07", "1311.19", "1311.261"]) {
    assert.match(PAGE, new RegExp(`href="https://codes\\.ohio\\.gov/ohio-revised-code/section-${s.replace(".", "\\.")}"`), s);
  }
  assert.match(PAGE, /read <strong>2026-11-28<\/strong>/);
  assert.match(PAGE, /It is not legal advice\./);
  const mi = readFileSync(new URL("./michigan-notice-of-furnishing.html", import.meta.url), "utf8");
  assert.match(mi, /href="ohio-notice-of-furnishing\.html"/);
});
