import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const guide = readFileSync(new URL("./why-does-economic-nexus-differ-by-state.html", import.meta.url), "utf8");
const vsPage = readFileSync(new URL("./vs-paid-nexus-monitoring-software.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");

test("the entry page wires the state form, results table, and threshold logic without a build step", () => {
  assert.match(html, /from '\.\/calc\.mjs'/);
  assert.match(html, /id="entry-form"/);
  assert.match(html, /id="stateSelect"/);
  assert.match(html, /name="grossSales"/);
  assert.match(html, /name="transactionCount"/);
  assert.match(html, /entry_added/);
  assert.match(html, /entry_removed/);
  assert.match(html, /sample_loaded/);
  assert.match(html, /exported/);
});

test("the entry page carries the standard disclaimer, privacy, and sponsor clauses", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /Nothing is uploaded/);
});

test("the entry page never claims to be an independent fifty-state statute review or a determination", () => {
  assert.match(html, /not an independent fifty-state statute review/);
  assert.match(html, /not a determination/);
  assert.doesNotMatch(html, /this tool guarantees|we guarantee/i);
});

test("the entry page states that each state is checked on its own, never combined", () => {
  assert.match(html, /never added to another's total/);
});

test("the usage-counting control is opt-in and honours Do Not Track and Global Privacy Control", () => {
  assert.match(html, /off by default/);
  assert.match(html, /navigator\.doNotTrack/);
  assert.match(html, /navigator\.globalPrivacyControl/);
});

test("index links to the state-differences guide page", () => {
  assert.match(html, /href="why-does-economic-nexus-differ-by-state\.html"/);
});

test("index links to the vs-paid-nexus-monitoring-software comparison page", () => {
  assert.match(html, /href="vs-paid-nexus-monitoring-software\.html"/);
});

test("index links to the vs-tracking-it-in-a-spreadsheet comparison page", () => {
  assert.match(html, /href="vs-tracking-it-in-a-spreadsheet\.html"/);
});

test("the comparison page links back to the tracker, carries the trademark disclaimer, and valid FAQPage JSON-LD matching visible text", () => {
  assert.match(vsPage, /href="\.\/"/);
  assert.match(vsPage, /not\s+affiliated\s+with/i);
  assert.match(vsPage, /Avalara/);
  assert.match(vsPage, /TaxJar/);
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
  assert.match(sitemap, /vs-paid-nexus-monitoring-software\.html/);
});

test("no module in this venture can reach the network", () => {
  const calc = readFileSync(new URL("./calc.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(calc, /\bfetch\(/);
  assert.doesNotMatch(calc, /XMLHttpRequest/);
  assert.doesNotMatch(html, /\bfetch\(/);
});

test("the guide page stays crawlable, is listed in the sitemap, and links back to the tool", () => {
  assert.match(guide, /<title>Why Does Economic Nexus Differ by State\?/);
  assert.match(guide, /name="description"/);
  assert.match(guide, /rel="canonical"/);
  assert.match(guide, /href="\.\/"/);
  assert.match(sitemap, /why-does-economic-nexus-differ-by-state\.html/);
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

test("the orders import is wired, local-only, and explains what it skips and assumes", () => {
  assert.match(html, /from '\.\/orders\.mjs'/);
  assert.match(html, /id="orders-file"/);
  assert.match(html, /never uploaded/);
  assert.match(html, /straight-line estimate/);
  assert.match(html, /orders_imported/);
  const orders = readFileSync(new URL("./orders.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(orders, /\bfetch\(/);
  assert.doesNotMatch(orders, /XMLHttpRequest/);
});

test("the tracker's own results table is selected by id so the import table cannot capture it", () => {
  assert.match(html, /querySelector\('#table tbody'\)/);
});
