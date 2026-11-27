import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { apply, cmmcSignupUrl, heading, signupUrl, status, CMMC_APP_URL, JOBSHOP_APP_URL } from "./cta.mjs";

const LEGACY = `<section class="card cta" id="early-access">
  <h2>In development — early access</h2>
  <p>We are building two paid products for small machine shops: an <strong>RFQ-to-quote assistant</strong>. Neither is released yet. Read what is planned and how to get early access on the <a href="https://marisstella.app/industries/manufacturing/">manufacturing page</a>.</p>
</section>`;

test("sign-up links open the app's create-account page, tagged with the sending page", () => {
  assert.equal(signupUrl("https://a.example/", "index.html"), "https://a.example/sign-up?from=machine-shop-guides");
  assert.equal(signupUrl("https://a.example", "rfq-review.html"), "https://a.example/sign-up?from=machine-shop-guides%2Frfq-review");
});

test("the app URL is an https origin on the catalogue's domain, never workers.dev", () => {
  const u = new URL(JOBSHOP_APP_URL);
  assert.equal(u.protocol, "https:");
  assert.equal(u.pathname, "/");
  assert.ok(u.hostname.endsWith(".marisstella.app"), u.hostname);
});

test("before launch the legacy text is kept; after, the block replaces it once and is idempotent", () => {
  const pre = apply(LEGACY, "x.html", { appUrl: null });
  assert.match(pre, /In development — early access/);
  assert.match(pre, /Neither is released yet\. Read what is planned/);
  const live = apply(LEGACY, "x.html");
  assert.doesNotMatch(live, /Neither is released yet/);
  assert.doesNotMatch(live, /Read what is planned and how to get early access/);
  assert.match(live, /Both products are open, free to start/);
  assert.match(live, /sign-up\?from=machine-shop-guides%2Fx/);
  assert.match(live, /cmmc\.marisstella\.app\/signup\?from=machine-shop-guides%2Fx/);
  const noCmmc = apply(LEGACY, "x.html", { cmmcUrl: null });
  assert.match(noCmmc, /Quoting is open now; the CMMC workspace is coming/);
  assert.match(noCmmc, /The CMMC workspace is not released yet/);
  assert.equal(apply(live, "x.html"), live);
  // And it switches back.
  assert.equal(apply(live, "x.html", { appUrl: null }).includes("Neither is released yet."), true);
});

test("copy says what is off: paid plans not on sale, AI reading not on", () => {
  const s = status("x.html");
  assert.match(s, /paid plans are not on sale yet/);
  assert.match(s, /Reading an RFQ with AI is not switched on yet/);
  assert.doesNotMatch(status("x.html", { aiOn: true }), /not switched on/);
  assert.equal(heading(JOBSHOP_APP_URL, "https://c.example"), "Both products are open, free to start");
});

test("the free plan's numbers match the app's plans.ts", () => {
  const plans = readFileSync(new URL("../jobshop-quote/apps/jobshop-quote/src/shared/plans.ts", import.meta.url), "utf8");
  const free = plans.slice(plans.indexOf('key: "free"'), plans.indexOf('key: "shop"'));
  assert.match(free, /priceCents: 0,/);
  assert.match(free, /purchasable: false,/);
  assert.match(free, /rfqsPerMonth: 40,/);
  assert.match(free, /maxMembers: 3,/);
  const shop = plans.slice(plans.indexOf('key: "shop"'));
  assert.match(shop, /priceCents: 19_900,/);
  assert.match(shop, /priceCents: 39_900,/);
  assert.match(status("x.html"), /40 RFQs a month and 3 users/);
});

test("CMMC Workspace: own host, /signup link, and the free plan its plans.ts defines", () => {
  const u = new URL(CMMC_APP_URL);
  assert.equal(u.protocol, "https:");
  assert.ok(u.hostname.endsWith(".marisstella.app"), u.hostname);
  assert.equal(cmmcSignupUrl(CMMC_APP_URL, "index.html"), "https://cmmc.marisstella.app/signup?from=machine-shop-guides");
  // apps/cmmc opens "Create account" at /signup.
  const app = readFileSync(new URL("../cmmc/apps/cmmc/src/client/App.tsx", import.meta.url), "utf8");
  assert.match(app, /authModeFromLocation\(window\.location\.pathname/);
  const mode = readFileSync(new URL("../cmmc/apps/cmmc/src/client/lib/auth-mode.ts", import.meta.url), "utf8");
  assert.match(mode, /signup\|sign-up/);
  const plans = readFileSync(new URL("../cmmc/apps/cmmc/src/shared/plans.ts", import.meta.url), "utf8");
  const free = plans.slice(plans.indexOf('key: "free"'), plans.indexOf('key: "level2"'));
  assert.match(free, /priceCents: 0,/);
  assert.match(free, /level2: false,/);
  assert.match(free, /maxMembers: 1,/);
  const s = status("sprs-score-calculator.html");
  assert.match(s, /free on Level 1 \(the 15 FAR 52\.204-21 safeguards, their evidence and the SSP, for 1 user, no card\)/);
  assert.match(s, /Level 2, with the SPRS score and the POA&amp;M, is a paid plan that is not on sale yet/);
  assert.doesNotMatch(s.slice(s.indexOf("CMMC Workspace")), /\$\d/, "no CMMC price while checkout is dark");
});
