import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DECLINE_CODES, classifyDecline } from "./dunning.mjs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const PAGES = ["stripe-decline-codes.html", "vs-paid-recovery-services.html"];

for (const name of PAGES) {
  test(`${name}: disclaimer, sponsor link, canonical, sitemap, inbound link`, () => {
    const html = page(name);
    assert.match(html, /<strong>No warranty\.<\/strong>/);
    assert.match(html, /not legal, tax, or financial advice/);
    assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
    assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
    assert.ok(html.includes(`<link rel="canonical" href="./${name}">`));
    assert.ok(page("sitemap.xml").includes(`./${name}`));
    assert.ok(page("index.html").includes(`href="./${name}"`), "linked from the tool page");
    assert.doesNotMatch(html, /\$\s?\d/, "no invented price");
  });

  test(`${name}: FAQ schema matches the visible FAQ`, () => {
    const html = page(name);
    const m = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    const schema = JSON.parse(m[1]);
    assert.ok(schema.mainEntity.length > 0);
    for (const qn of schema.mainEntity) {
      assert.ok(html.includes(`<h3>${qn.name}</h3>`), qn.name);
      assert.ok(html.includes(`<p>${qn.acceptedAnswer.text}</p>`), qn.name);
    }
  });
}

test("the decline-code table lists every code with the class the engine uses", () => {
  const html = page("stripe-decline-codes.html");
  for (const code of DECLINE_CODES) {
    const row = html.match(new RegExp(`<td><code>${code}</code></td><td>[^<]+</td><td>(\\w+)</td>`));
    assert.ok(row, `${code} missing from the table`);
    assert.equal(row[1], classifyDecline(code), code);
  }
});

test("the comparison page is not affiliated with the services it names", () => {
  assert.match(page("vs-paid-recovery-services.html"), /not affiliated with, endorsed by, or sponsored by Churn Buster, Churnkey, Baremetrics or Stripe/);
});
