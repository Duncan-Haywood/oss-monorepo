import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const howTo = readFileSync(new URL("./how-to-decode-a-jwt-without-a-tool.html", import.meta.url), "utf8");
const vsPage = readFileSync(new URL("./vs-eyeballing-the-payload.html", import.meta.url), "utf8");
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

function faqSchema(source) {
  const match = source.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  return match ? JSON.parse(match[1]) : null;
}

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports and calls the functions it claims to run", () => {
  assert.match(scriptSource, /analyzeJwt/);
  assert.match(scriptSource, /summaryText/);
  assert.match(scriptSource, /countUsage\("check_run"\)/);
  assert.match(scriptSource, /countUsage\("summary_copied"\)/);
  assert.match(scriptSource, /function fallbackCopy/);
  assert.match(scriptSource, /execCommand\("copy"\)/);
});

test("carries the no-warranty disclaimer and states it never verifies a signature", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /never asks for a key/i);
  assert.match(html, /never verifies a signature/i);
});

test("carries a client-side privacy statement", () => {
  assert.match(html, /<strong>Privacy\.<\/strong>/);
  assert.match(html, /never leaves your device/i);
});

test("carries the best-effort hosting and sponsor paragraphs", () => {
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test("carries the usage opt-out toggle and states what is counted", () => {
  assert.match(html, /id="usage"/);
  assert.match(html, /Do Not Track and Global Privacy Control disable counting/);
});

test("states plainly that findings are not a verdict and nothing is uploaded", () => {
  assert.match(html, /worth a look, not a verdict/i);
  assert.match(html, /No signature verification, no upload/i);
});

test("links to mcp-config-risk-check and hidden-unicode-check as complementary paste-and-check tools", () => {
  assert.match(html, /mcp-config-risk-check\/">/);
  assert.match(html, /hidden-unicode-check\/">/);
});

test("links to its own how-to guide and comparison page", () => {
  assert.match(html, /href="\.\/how-to-decode-a-jwt-without-a-tool\.html"/);
  assert.match(html, /href="\.\/vs-eyeballing-the-payload\.html"/);
});

test("the FAQPage JSON-LD on the index page is valid, matches the visible headings, and its answers are byte-identical to the visible paragraphs", () => {
  const schema = faqSchema(html);
  assert.ok(schema, "no FAQPage schema found");
  for (const q of schema.mainEntity) {
    const escapedQuestion = q.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const heading = new RegExp(`<h3>${escapedQuestion}<\\/h3>`);
    assert.match(html, heading, `FAQ heading missing from visible copy: ${q.name}`);
    const escapedAnswer = q.acceptedAnswer.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const answerPara = new RegExp(`<p>${escapedAnswer}<\\/p>`);
    assert.match(html, answerPara, `FAQ answer not byte-identical to visible copy: ${q.name}`);
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
  assert.deepEqual(
    locs.sort(),
    ["./", "./how-to-decode-a-jwt-without-a-tool.html", "./vs-eyeballing-the-payload.html"].sort(),
  );
});

test("robots.txt allows crawling", () => {
  assert.match(robots, /Allow:\s*\//);
});

// ---- how-to guide page ----------------------------------------------------

test("the how-to page's FAQPage JSON-LD matches its visible copy", () => {
  const schema = faqSchema(howTo);
  assert.ok(schema, "no FAQPage schema found on the how-to page");
  for (const q of schema.mainEntity) {
    const escapedQuestion = q.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(howTo, new RegExp(`<h3>${escapedQuestion}<\\/h3>`), `heading missing: ${q.name}`);
    const escapedAnswer = q.acceptedAnswer.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(howTo, new RegExp(`<p>${escapedAnswer}<\\/p>`), `answer not byte-identical: ${q.name}`);
  }
});

test("the how-to page links back to the tool and carries the disclaimer", () => {
  assert.match(howTo, /href="\.\/"/);
  assert.match(howTo, /<strong>No warranty\.<\/strong>/);
});

// ---- comparison page --------------------------------------------------------

test("the comparison page names no specific decoder product and says so", () => {
  assert.match(vsPage, /names no specific decoder site or library/);
});

test("the comparison page's FAQPage JSON-LD matches its visible copy", () => {
  const schema = faqSchema(vsPage);
  assert.ok(schema, "no FAQPage schema found on the comparison page");
  for (const q of schema.mainEntity) {
    const escapedQuestion = q.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(vsPage, new RegExp(`<h3>${escapedQuestion}<\\/h3>`), `heading missing: ${q.name}`);
    const escapedAnswer = q.acceptedAnswer.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(vsPage, new RegExp(`<p>${escapedAnswer}<\\/p>`), `answer not byte-identical: ${q.name}`);
  }
});

test("the comparison page carries the disclaimer and links back to the tool", () => {
  assert.match(vsPage, /<strong>No warranty\.<\/strong>/);
  assert.match(vsPage, /href="\.\/"/);
});
