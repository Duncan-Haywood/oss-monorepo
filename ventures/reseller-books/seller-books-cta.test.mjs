// The Seller Books CTA on the free reseller pages is what seller-books-cta.mjs writes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_URL, LLMS, PAGES, apply, applyLlms, signupUrl, status } from "./seller-books-cta.mjs";

const root = new URL("../", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), "utf8");

for (const page of PAGES) {
  test(`${page}: carries the generated Seller Books block, up to date`, () => {
    const html = read(page);
    assert.equal(apply(html, page), html, "stale: run `node seller-books-cta.mjs` in ventures/reseller-books");
    assert.match(html, /<!-- seller-books-cta: generated/);
    assert.ok(html.includes(`href="${signupUrl(page)}"`), "links to the app's sign-up");
    assert.doesNotMatch(html, /Seller Books<\/strong>[^<]*<strong>in development/, "no pre-launch status left");
  });
}

for (const file of LLMS) {
  test(`${file}: Seller Books status line is current`, () => {
    const text = read(file);
    assert.equal(applyLlms(text, file), text);
    assert.doesNotMatch(text, /Seller Books[^\n]*In development, early access/);
  });
}

test("sign-up links name the page that sent the visitor", () => {
  assert.equal(signupUrl("ebay-fee-calculator/index.html"), `${APP_URL}/signup?from=ebay-fee-calculator`);
  assert.equal(signupUrl("ebay-fee-calculator/schedule-c-worksheet-for-resellers.html"), `${APP_URL}/signup?from=ebay-fee-calculator%2Fschedule-c-worksheet-for-resellers`);
});

test("honest copy: Free plan limits from plans.ts, paid plans not for sale while checkout is dark", () => {
  const s = status("x/index.html");
  assert.match(s, /one platform and up to 25 orders a month, no card/);
  assert.match(s, /not on sale yet/);
  assert.doesNotMatch(s, /\$\d/, "no price while paid plans are dark");
  assert.doesNotMatch(status("x/index.html", APP_URL, true), /not on sale/);
});

test("rewrites both hand-written forms and refuses a page with neither", () => {
  const ind = 'https://marisstella.app/industries/online-sellers/';
  const old = `<strong>in development &mdash; early access</strong>: see <a href="${ind}">tools for online sellers</a>.`;
  const calc = `<p>X. We are building that as <strong>Seller Books</strong>, a hosted product that is ${old} Free guides.</p>`;
  const out = apply(calc, "a/index.html");
  assert.match(out, /That is what <strong>Seller Books<\/strong> does, hosted\. It is <strong>open now<\/strong>/);
  assert.equal(apply(out, "a/index.html"), out, "idempotent");
  const guide = `<p>This is the job we are building <strong>Seller Books</strong> for: books. It is ${old} Today.</p>`;
  const g = apply(guide, "a/b.html");
  assert.match(g, /This is the job <strong>Seller Books<\/strong> does: books\. <!-- seller-books-cta/);
  assert.equal(apply(g, "a/b.html"), g);
  assert.throws(() => apply("<p>nothing</p>", "z.html"));
});
