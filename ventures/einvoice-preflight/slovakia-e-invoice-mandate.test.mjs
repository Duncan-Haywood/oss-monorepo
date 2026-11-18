import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const html = fs.readFileSync(new URL("./slovakia-e-invoice-mandate.html", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("carries the no-warranty disclaimer and licence line", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /Free and open source/);
});

test("states the date and the format", () => {
  assert.match(html, /1 Jan 2027/);
  assert.match(html, /1 Jul 2030/);
  assert.match(html, /Peppol BIS Billing 3\.0/);
});

test("pins the facts read from Act 385/2025 and the Financial Administration (2026-11-16)", () => {
  // Article VIII: points in force 1 Jan 2026, 1 Jan 2027 (§ 85o(1)-(16), § 71(5)) and 1 Jul 2030 (§ 71(4)).
  assert.match(html, /Act No\. 385\/2025 Z\. z\./);
  assert.match(html, /1 Jan 2026/);
  assert.match(html, /§ 85o\(1\) to \(16\)/);
  assert.match(html, /§ 71\(4\), \(6\)/);
  assert.match(html, /Issue within 15 days/);
  assert.match(html, /the issue deadline becomes 10 days/);
  assert.match(html, /EUR 10,000/);
  assert.match(html, /EUR 100,000 if repeated/);
  assert.match(html, /kept for 10 years/);
  assert.match(html, /UBL 2\.1 or CII D16B/);
  assert.match(html, /0245 = DIČ/);
  assert.match(html, /100 certified providers/);
  // No longer written from vendor guides; the unconfirmed vendor claims stay marked.
  assert.doesNotMatch(html, /as vendor guides report it/);
  assert.match(html, /"1 July 2027" access-point limit one vendor mentioned is not in the Act/);
  assert.match(html, /a text this page did not read in its earlier form/);
});

test("documents every SK rule the profile ships", async () => {
  const { SLOVAK_RULES } = await import("./profile.mjs");
  for (const id of Object.keys(SLOVAK_RULES)) assert.ok(html.includes(id) || (id === "SK-002" && html.includes("SK-001, SK-002")), id);
  assert.match(html, /\?profile=slovakia/);
  assert.match(indexHtml, /id="slovakia"/);
});

test("makes no price claim", () => {
  assert.doesNotMatch(html, /\$\d/);
});

test("canonical names this file", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/einvoice-preflight\/slovakia-e-invoice-mandate\.html">/);
});

test("FAQPage schema is valid JSON and matches visible h3 headings", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context".*?\})<\/script>/s);
  assert.ok(match, "no schema");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  for (const q of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), q.name);
    assert.ok(html.includes(q.acceptedAnswer.text));
  }
});

test("linked from the tool page and listed in the sitemap", () => {
  assert.match(indexHtml, /href="slovakia-e-invoice-mandate\.html"/);
  assert.match(sitemap, /slovakia-e-invoice-mandate\.html/);
});

test("links to the checker, creator and rule reference", () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="create\.html"/);
  assert.match(html, /href="what-does-this-e-invoice-error-code-mean\.html"/);
});

test("links to the German and French pages and the sitemap entry is its own url block", () => {
  assert.match(html, /href="germany-e-invoice-mandate\.html"/);
  assert.match(html, /href="france-e-invoice-mandate\.html"/);
  assert.match(html, /href="croatia-e-invoice-mandate\.html"/);
  assert.match(html, /href="belgium-e-invoice-mandate\.html"/);
  assert.match(html, /href="poland-ksef-e-invoice-mandate\.html"/);
  assert.match(sitemap, /<\/url>\s*<url>\s*<loc>[^<]*slovakia-e-invoice-mandate\.html<\/loc>\s*<\/url>/);
});

test("every other country page links to the Slovakia page", () => {
  for (const f of fs.readdirSync(new URL("./", import.meta.url)).filter((n) => /-mandate\.html$/.test(n) && !n.startsWith("slovakia"))) {
    const page = fs.readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
    assert.match(page, /href="slovakia-e-invoice-mandate\.html"/, f);
  }
});
