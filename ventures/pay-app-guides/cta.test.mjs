import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, signupUrl, status } from "./cta.mjs";

const PAGE = `<main><section class="card cta" id="early-access">
  <h2>Chasing waivers?</h2>
  <p>We are building hosted pay-app billing for specialty subcontractors that tracks waivers. It is <strong>in development, with early access</strong>; nothing is for sale yet. <a href="https://marisstella.app/industries/construction/">See the construction tools and join early access</a>.</p>
</section></main>`;

test("before launch the page reads as it did by hand, inside the generated markers", () => {
  const out = apply(PAGE, "lien-waiver-log.html", null);
  assert.equal(out.replace(/<!-- \/?cta-status[^>]*-->/g, ""), PAGE);
  assert.equal(apply(out, "lien-waiver-log.html", null), out, "idempotent");
});

test("at launch: open now, free on one job, sign-up link that names the guide", () => {
  const pre = apply(PAGE, "lien-waiver-log.html", null);
  const live = apply(pre, "lien-waiver-log.html", "https://app.example.com/");
  assert.match(live, /<p>PayApps is hosted pay-app billing/);
  assert.doesNotMatch(live, /We are building|nothing is for sale yet|early access/);
  assert.match(live, /<strong>open now<\/strong>: free on one job, no card; paid plans for more jobs are not on sale yet\./);
  assert.match(live, /href="https:\/\/app\.example\.com\/\?signup&amp;from=pay-app-guides%2Flien-waiver-log">Start free in PayApps<\/a>/);
  assert.equal(apply(live, "lien-waiver-log.html", "https://app.example.com/"), live, "idempotent");
  // and back again, should the app be taken down
  assert.equal(apply(live, "lien-waiver-log.html", null), pre);
});

test("prices appear only once checkout is on", () => {
  assert.doesNotMatch(status("index.html", "https://a.example", false), /\$/);
  assert.match(status("index.html", "https://a.example", true), /\$99 to \$249 a month/);
});

test("the hub page is the pay-app-guides source", () => {
  assert.equal(signupUrl("https://a.example", "index.html"), "https://a.example/?signup&from=pay-app-guides");
});

test("a page without a recognisable CTA fails loudly", () => {
  assert.throws(() => apply("<main></main>", "x.html", null), /no <section/);
  assert.throws(
    () => apply('<section class="card cta" id="early-access"><p>Something else.</p></section>', "x.html", null),
    /neither/,
  );
});
