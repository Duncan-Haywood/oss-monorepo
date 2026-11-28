import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MI_ATTACHED, MI_CAPTIONS, MI_WARNING } from "../payapps/packages/lien-waivers/src/mi-notice.ts";

const STATUTE = readFileSync(new URL("./sources/mi-570.txt", import.meta.url), "utf8");
const flat = (s) => s.replace(/\s+/g, " ").trim();
const FLAT = flat(STATUTE);
const PAGE = readFileSync(new URL("./michigan-notice-of-furnishing.html", import.meta.url), "utf8");
const ENTITIES = { "&amp;": "&", "&#x27;": "'", "&#39;": "'" };
const decode = (s) => s.replace(/&amp;|&#x27;|&#39;/g, (e) => ENTITIES[e]);

/** Each blank (dots in the statute, a rule on the page) as one marker, so the two compare. */
const BLANK = "<>";
const blanks = (s) =>
  flat(s)
    .replace(/\.{4,}/g, BLANK)
    .replace(/_{4,}/g, BLANK)
    .replace(new RegExp(`${BLANK}(\\s*${BLANK})+`, "g"), BLANK)
    .replace(/\s+([,.])/g, "$1");

test("every quoted phrase on the page is in the statute", () => {
  const quotes = [...PAGE.matchAll(/“([^”]+)”/g)].map((m) => decode(m[1]));
  assert.ok(quotes.length >= 10, `found ${quotes.length} quotes`);
  for (const q of quotes) assert.ok(!q.includes("<"), `keep markup outside the quote marks: "${q}"`);
  for (const q of quotes) assert.ok(FLAT.includes(flat(q)), `not in the statute: "${q}"`);
});

test("the form on the page is § 570.1109(4)'s, word for word, blanks aside", () => {
  const section = PAGE.slice(PAGE.indexOf('<section class="card statement" id="form">'));
  const body = section.slice(section.indexOf("NOTICE OF FURNISHING") - '<p class="bold">'.length, section.indexOf('<p class="note">'));
  const printed = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => decode(m[1])).join(" ");
  const start = STATUTE.indexOf("NOTICE OF FURNISHING\n");
  const form = STATUTE.slice(start, STATUTE.indexOf("(5) The failure", start));
  // The statute ends "Date:....... ." and the page leaves off the stray full stop.
  assert.equal(blanks(printed).replace("Date: <>", "Date:<>"), blanks(form).replace(/Date:<>\.$/, "Date:<>"));
});

test("the page prints the same form PayApps prints (packages/lien-waivers/src/mi-notice.ts)", () => {
  const text = decode(PAGE);
  for (const s of [MI_WARNING, MI_ATTACHED, ...Object.values(MI_CAPTIONS)]) assert.ok(text.includes(s), s);
});

test("page cites legislature.mi.gov with the read date, has its FAQ, and is linked from the Michigan pages", () => {
  for (const s of ["1108", "1108a", "1109", "1111"]) assert.match(PAGE, new RegExp(`href="https://www\\.legislature\\.mi\\.gov/Laws/MCL\\?objectName=mcl-570-${s}"`), s);
  assert.match(PAGE, /read <strong>2026-11-28<\/strong>/);
  const faq = JSON.parse(PAGE.match(/<script type="application\/ld\+json">(\{"@context": "https:\/\/schema\.org", "@type": "FAQPage"[\s\S]*?)<\/script>/)[1]);
  for (const q of faq.mainEntity) assert.ok(PAGE.includes(`<h3>${q.name}</h3>`), q.name);
  for (const name of ["michigan-lien-waiver-forms.html", "index.html", "lien-waiver-forms-by-state.html"]) {
    const other = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
    assert.match(other, /href="michigan-notice-of-furnishing\.html"/, name);
  }
});
