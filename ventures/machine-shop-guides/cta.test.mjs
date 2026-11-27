import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRODUCTS, apply, isCmmcPage, pages, signupUrl, status } from "./cta.mjs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const planBlock = (src, key, next) => src.slice(src.indexOf(`key: "${key}"`), src.indexOf(`key: "${next}"`));

test("every page's card is what cta.mjs writes (run `node cta.mjs` after a change)", () => {
  const list = pages();
  assert.ok(list.length >= 21, `only ${list.length} pages`);
  for (const page of list) {
    const html = read(page);
    assert.equal(apply(html, page), html, page);
    assert.doesNotMatch(html, /Neither is released yet/, page);
  }
});

test("the free-plan lines match the apps' own plans.ts", () => {
  const jq = planBlock(read("../jobshop-quote/apps/jobshop-quote/src/shared/plans.ts"), "free", "shop");
  assert.match(jq, /priceCents: 0,/);
  const rfqs = /rfqsPerMonth: (\d+)/.exec(jq)[1];
  const members = /maxMembers: (\d+)/.exec(jq)[1];
  assert.equal(PRODUCTS.quote.free, `${rfqs} RFQs a month and ${members} users`);

  const cm = planBlock(read("../cmmc/apps/cmmc/src/shared/plans.ts"), "free", "level2");
  assert.match(cm, /priceCents: 0,/);
  assert.match(cm, /level2: false,/);
  assert.match(cm, /maxMembers: 1,/);
  assert.match(PRODUCTS.cmmc.free, /for 1 user$/);
});

test("paid plans are never offered while checkout is dark", () => {
  for (const p of Object.values(PRODUCTS)) {
    assert.equal(p.paidOn, false);
    assert.match(p.paid, /not on sale yet/);
    assert.match(p.url, /^https:\/\/[a-z-]+\.marisstella\.app$/, "own host on the catalogue's domain, never workers.dev");
  }
  // The card only: some guides compare competitors' published prices, which is fine.
  for (const page of pages()) {
    const card = /<section class="card cta" id="early-access">[\s\S]*?<\/section>/.exec(read(page))[0];
    assert.doesNotMatch(card.replace(/<[^>]+>/g, " "), /\$\d/, page);
  }
});

test("sign-up links open each app's create-account form and name the guide", () => {
  assert.equal(
    signupUrl(PRODUCTS.cmmc, "sprs-score-calculator.html"),
    "https://cmmc.marisstella.app/?signup&from=machine-shop-guides%2Fsprs-score-calculator",
  );
  assert.equal(
    signupUrl(PRODUCTS.quote, "index.html"),
    "https://jobshop-quote.marisstella.app/sign-up?from=machine-shop-guides",
  );
  // apps/cmmc reads `?signup` (src/client/lib/auth-mode.ts); Job Shop Quote routes /sign-up.
  assert.match(read("../cmmc/apps/cmmc/src/client/App.tsx"), /initialAuthMode\(window\.location\.search\)/);
  assert.match(read("../jobshop-quote/apps/jobshop-quote/src/client/router.tsx"), /path: "\/sign-up"/);
});

test("CMMC pages lead with the CMMC workspace, quoting pages with Job Shop Quote", () => {
  assert.ok(isCmmcPage("sprs-score-calculator.html") && isCmmcPage("nist-800-171-ssp-template.html"));
  assert.ok(!isCmmcPage("rfq-review.html") && !isCmmcPage("index.html"));
  assert.ok(status("cmmc-cost.html").indexOf("CMMC Workspace") < status("cmmc-cost.html").indexOf("Job Shop Quote"));
  assert.ok(status("rfq-review.html").indexOf("Job Shop Quote") < status("rfq-review.html").indexOf("CMMC Workspace"));
});

test("with no URLs the card goes back to the pre-launch wording", () => {
  const off = { quote: { ...PRODUCTS.quote, url: null }, cmmc: { ...PRODUCTS.cmmc, url: null } };
  const html = read("rfq-review.html");
  const back = apply(html, "rfq-review.html", off);
  assert.match(back, /In development — early access/);
  assert.match(back, /We are building two paid products/);
  assert.match(back, /Neither is released yet\./);
  assert.equal(apply(back, "rfq-review.html"), html);
});
