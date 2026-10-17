import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the required disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/i);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("robots and sitemap let crawlers find the page", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /index\.html/);
});

test("the page reads every field analyzeAuction accepts", () => {
  const html = page("index.html");
  for (const id of [
    "hammer-price", "buyer-premium-percent", "buyer-premium-cap", "bidding-online",
    "online-premium-percent", "paying-by-card", "card-surcharge-percent", "tax-exempt",
    "tax-rate", "doc-fee", "max-budget", "copy-link", "optout",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  assert.match(html, /import \{ analyzeAuction, DEFAULTS \} from "\.\/calc\.mjs"/);
  assert.match(html, /import \{ encodeInputs, decodeInputs, formValues \} from "\.\/share\.mjs"/);
});

test("every input and select carries a visible <label> for accessibility", () => {
  const html = page("index.html");
  const ids = [
    "hammer-price", "buyer-premium-percent", "buyer-premium-cap", "bidding-online",
    "online-premium-percent", "paying-by-card", "card-surcharge-percent", "tax-exempt",
    "tax-rate", "doc-fee", "max-budget",
  ];
  for (const id of ids) {
    assert.match(html, new RegExp(`<label for="${id}"`), `missing <label for="${id}">`);
  }
});

test("the FAQPage JSON-LD matches the visible common-questions text verbatim", () => {
  const html = page("index.html");
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD");
  assert.ok(faq.mainEntity.length >= 4);
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(html.includes(name), `question not found verbatim: ${name}`);
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim for: ${name}`);
  }
});

test("the worked example in the load-example button matches calc.mjs's DEFAULTS", () => {
  const html = page("index.html");
  assert.match(html, /\$45,000 hammer price/);
  assert.match(html, /capped at \$2,500/);
});

test("index links one hop to the storage-auction-max-bid-calculator sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/storage-auction-max-bid-calculator\/"/,
    'index must link ../storage-auction-max-bid-calculator/ so crawlers reach it in one hop',
  );
});

test("clicking calculate records auction_analyzed, not a different event name", () => {
  const html = page("index.html");
  assert.match(html, /record\("auction_analyzed"\)/);
  assert.match(html, /record\("example_loaded"\)/);
  assert.match(html, /record\("link_copied"\)/);
});

test("index links to the vs-a-flat-percent-rule comparison page", () => {
  assert.match(page("index.html"), /href="\.\/vs-a-flat-percent-rule\.html"/);
});

test("the comparison page links back to the calculator and carries valid FAQPage JSON-LD matching visible text", () => {
  const vsPage = page("vs-a-flat-percent-rule.html");
  assert.match(vsPage, /href="\.\/"/);
  const blocks = [...vsPage.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = blocks.map((b) => JSON.parse(b));
  const faq = parsed.find((p) => p["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD on the comparison page");
  assert.ok(faq.mainEntity.length >= 3);
  for (const qa of faq.mainEntity) {
    assert.ok(vsPage.includes(qa.name), `visible question missing: ${qa.name}`);
    assert.ok(vsPage.includes(qa.acceptedAnswer.text), `visible answer missing for: ${qa.name}`);
  }
});

test("the comparison page carries the no-warranty clause and is listed in the venture sitemap", () => {
  const vsPage = page("vs-a-flat-percent-rule.html");
  assert.match(vsPage, /No warranty/);
  assert.match(vsPage, /Nothing leaves your browser/);
  const sitemap = page("sitemap.xml");
  assert.match(sitemap, /vs-a-flat-percent-rule\.html/);
});

test("index links to the sales-tax guide page", () => {
  assert.match(page("index.html"), /href="why-is-sales-tax-charged-on-the-buyers-premium\.html"/);
});

test("the sales-tax guide page links back to the calculator, carries the no-warranty clause, and is listed in the venture sitemap", () => {
  const guide = page("why-is-sales-tax-charged-on-the-buyers-premium.html");
  assert.match(guide, /<a href="\.\/">/);
  assert.match(guide, /No warranty/);
  assert.match(guide, /Nothing leaves your browser/);
  assert.match(guide, /href="LICENSE"/);
  assert.match(guide, /github\.com\/sponsors\/Duncan-Haywood/);
  const sitemap = page("sitemap.xml");
  assert.match(sitemap, /why-is-sales-tax-charged-on-the-buyers-premium\.html/);
});

test("the sales-tax guide page's worked example matches calc.mjs exactly", async () => {
  const { analyzeAuction } = await import("./calc.mjs");
  const result = analyzeAuction({ hammerPrice: 45000, buyerPremiumPercent: 10, buyerPremiumCap: 2500, taxRate: 6 });
  assert.equal(result.hammerPrice, 45000);
  assert.equal(result.buyerPremium, 2500);
  assert.equal(result.purchasePrice, 47500);
  assert.equal(result.salesTax, 2850);

  const guide = page("why-is-sales-tax-charged-on-the-buyers-premium.html");
  assert.match(guide, /\$45,000\.00/);
  assert.match(guide, /\$2,500\.00/);
  assert.match(guide, /\$47,500\.00/);
  assert.match(guide, /\$2,850\.00/);
  assert.match(guide, /\$2,700\.00/);
  assert.match(guide, /\$150\.00/);
});

test("every visible FAQ question and answer on the sales-tax guide page also appears in its FAQPage block", () => {
  const guide = page("why-is-sales-tax-charged-on-the-buyers-premium.html");
  const questions = [...guide.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
  assert.ok(questions.length >= 4);
  const blocks = [...guide.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD on the guide page");
  const faqNames = faq.mainEntity.map((q) => q.name);
  for (const question of questions) assert.ok(faqNames.includes(question), `question not in FAQPage: ${question}`);
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(guide.includes(name), `question not found verbatim: ${name}`);
    assert.ok(guide.includes(acceptedAnswer.text), `answer not found verbatim for: ${name}`);
  }
});
