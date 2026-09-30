import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
const robots = readFileSync(new URL("./robots.txt", import.meta.url), "utf8");

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = "";
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, "i").exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === "script") scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { scripts, unclosed } = parse(html);
const scriptSource = scripts.join("\n");

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports and calls the functions it claims to run", () => {
  assert.match(scriptSource, /providerMonthlyCost/);
  assert.match(scriptSource, /compareProviders/);
  assert.match(scriptSource, /cachedInputShare/);
  assert.match(scriptSource, /cacheSavings/);
  assert.match(scriptSource, /decisionSummary/);
  assert.match(scriptSource, /countUsage\("compare_run"\)/);
  assert.match(scriptSource, /countUsage\("summary_copied"\)/);
  assert.match(scriptSource, /function fallbackCopy/);
  assert.match(scriptSource, /execCommand\("copy"\)/);
});

test("carries the no-warranty disclaimer with the pricing-advice wording", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not financial, procurement, or vendor-pricing advice/i);
});

test("carries the best-effort hosting and sponsor paragraphs", () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("carries the usage opt-out toggle and states what is counted", () => {
  assert.match(html, /id="usage"/);
  assert.match(html, /Do Not Track and Global Privacy Control disable counting/);
});

test("states plainly that it never fetches or asserts a vendor's price", () => {
  assert.match(html, /never fetches or asserts a vendor's price/i);
});

test("labels every preloaded provider rate as an example, not a fact", () => {
  const exampleCount = (html.match(/example -- replace with the current rate/g) || []).length;
  // 3 preset provider rows (Anthropic, OpenAI, Google) x 3 rates each.
  assert.equal(exampleCount, 9);
});

test("links to the AI coding plan calculator and the vector DB calculator as complementary tools", () => {
  assert.match(html, /ai-coding-plan-cost-calculator\/">/);
  assert.match(html, /vector-db-cost-calculator\/">/);
});

test("links to the AWS commitment break-even calculator", () => {
  assert.match(html, /aws-commitment-breakeven-calculator\/">/);
});

test("the FAQPage JSON-LD is valid and matches the visible headings", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
  for (const q of schema.mainEntity) {
    const heading = new RegExp(`<h3>${q.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/h3>`);
    assert.match(html, heading, `FAQ heading missing from visible copy: ${q.name}`);
  }
});

test("the SoftwareApplication JSON-LD is valid", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"SoftwareApplication".*?\})<\/script>/s);
  assert.ok(match, "no SoftwareApplication schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema.offers.price, "0");
});

test("sitemap lists every published page and no extras", () => {
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs.sort(), ["./", "./why-prompt-caching-changes-the-math.html", "./vs-a-blended-per-token-rate.html"].sort());
});

test("robots.txt allows crawling", () => {
  assert.match(robots, /Allow:\s*\//);
});
