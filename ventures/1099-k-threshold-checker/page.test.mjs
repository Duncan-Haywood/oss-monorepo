import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const guide = readFileSync(new URL("./why-did-the-1099-k-threshold-keep-changing.html", import.meta.url), "utf8");
const vsPage = readFileSync(new URL("./vs-checking-the-threshold-yourself.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("the entry page wires the platform form, results table, and threshold logic without a build step", () => {
  assert.match(html, /from '\.\/calc\.mjs'/);
  assert.match(html, /id="source-form"/);
  assert.match(html, /name="platform"/);
  assert.match(html, /id="stateSelect"/);
  assert.match(html, /name="grossPayments"/);
  assert.match(html, /name="transactionCount"/);
  assert.match(html, /id="taxYear"/);
  assert.match(html, /source_added/);
  assert.match(html, /source_removed/);
  assert.match(html, /sample_loaded/);
  assert.match(html, /exported/);
});

test("the entry page carries the standard disclaimer, privacy, and sponsor clauses", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, financial, or tax advice/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /Nothing is uploaded/);
});

test("the entry page never claims to know what a specific platform actually did or will do", () => {
  assert.match(html, /does not know what any specific platform actually did or will do/);
  assert.match(html, /Neither is guaranteed/);
  assert.doesNotMatch(html, /this tool guarantees|we guarantee/i);
});

test("the entry page states that income is taxable regardless of whether a form is issued", () => {
  assert.match(html, /Business income is reportable whether or not any form documents it/);
});

test("the usage-counting control is opt-in and honours Do Not Track and Global Privacy Control", () => {
  assert.match(html, /off by default/);
  assert.match(html, /navigator\.doNotTrack/);
  assert.match(html, /navigator\.globalPrivacyControl/);
});

test("index links one hop to the 1099k-reconciliation-worksheet sibling", () => {
  assert.match(
    html,
    /href="\.\.\/1099k-reconciliation-worksheet\/"/,
    "index must link ../1099k-reconciliation-worksheet/ so crawlers reach it in one hop",
  );
});

test("index links to the threshold-timeline guide page", () => {
  assert.match(html, /href="why-did-the-1099-k-threshold-keep-changing\.html"/);
});

test("index links to the vs-checking-the-threshold-yourself comparison page", () => {
  assert.match(html, /href="vs-checking-the-threshold-yourself\.html"/);
});

test("the comparison page links back to the checker and carries valid FAQPage JSON-LD matching visible text", () => {
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
  assert.match(vsPage, /No warranty/);
  assert.match(vsPage, /Nothing leaves your browser/);
  assert.match(sitemap, /vs-checking-the-threshold-yourself\.html/);
});

test("no module in this venture can reach the network", () => {
  const calc = readFileSync(new URL("./calc.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(calc, /\bfetch\(/);
  assert.doesNotMatch(calc, /XMLHttpRequest/);
  assert.doesNotMatch(html, /\bfetch\(/);
});

test("the guide page stays crawlable, is listed in the sitemap, and links back to the tool", () => {
  assert.match(guide, /<title>Why Did the 1099-K Threshold Keep Changing\?/);
  assert.match(guide, /name="description"/);
  assert.match(guide, /rel="canonical"/);
  assert.match(guide, /href="\.\/"/);
  assert.match(sitemap, /why-did-the-1099-k-threshold-keep-changing\.html/);
});

test("both pages carry FAQPage JSON-LD that parses as valid JSON", () => {
  for (const page of [html, guide]) {
    const matches = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(matches.length >= 1, "expected at least one JSON-LD block");
    for (const match of matches) {
      assert.doesNotThrow(() => JSON.parse(match[1]));
    }
  }
});

test('links to the EU DAC7 seller reporting checker', async () => {
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('./index.html', import.meta.url), 'utf8'), /href="\.\.\/dac7-seller-reporting-checker\/"/);
});
