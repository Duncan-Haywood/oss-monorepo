import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const whyHtml = readFileSync(new URL("./why-a-clean-scan-isnt-a-safety-guarantee.html", import.meta.url), "utf8");
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
const { unclosed: whyUnclosed } = parse(whyHtml);

test("every raw-text element is closed (index)", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("every raw-text element is closed (why page)", () => {
  assert.equal(whyUnclosed, null, `<${whyUnclosed}> is never closed`);
});

test("the page imports and calls the functions it claims to run", () => {
  assert.match(scriptSource, /scanHooks/);
  assert.match(scriptSource, /summaryText/);
  assert.match(scriptSource, /countUsage\("scan_run"\)/);
  assert.match(scriptSource, /countUsage\("summary_copied"\)/);
});

test("carries the no-warranty disclaimer", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not a guarantee that a command is safe or unsafe/i);
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

test("states plainly that a clean scan is not a safety guarantee and that it makes no network calls of its own", () => {
  assert.match(html, /is not proof a command is safe/i);
  assert.match(html, /never runs a single command and never uploads anything/i);
});

test("links to claude-code-settings-check, mcp-config-risk-check, claude-code-subagent-check, and skill-manifest-check as complementary AI-agent-tooling checkers", () => {
  assert.match(html, /claude-code-settings-check\/">/);
  assert.match(html, /mcp-config-risk-check\/">/);
  assert.match(html, /claude-code-subagent-check\/">/);
  assert.match(html, /skill-manifest-check\/">/);
});

test("links to the why-a-clean-scan-isnt-a-safety-guarantee page", () => {
  assert.match(html, /why-a-clean-scan-isnt-a-safety-guarantee\.html/);
});

test("the FAQPage JSON-LD is valid, matches the visible headings, and its answers are byte-identical to the visible paragraphs", () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, "no FAQPage schema found");
  const schema = JSON.parse(match[1]);
  assert.equal(schema["@type"], "FAQPage");
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

test("the why page's FAQPage JSON-LD is valid and matches its visible headings", () => {
  const match = whyHtml.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, "no FAQPage schema found on why page");
  const schema = JSON.parse(match[1]);
  for (const q of schema.mainEntity) {
    const escapedQuestion = q.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const heading = new RegExp(`<h3>${escapedQuestion}<\\/h3>`);
    assert.match(whyHtml, heading, `FAQ heading missing from why page: ${q.name}`);
  }
});

test("the why page carries the no-warranty disclaimer and links back to the tool", () => {
  assert.match(whyHtml, /<strong>No warranty\.<\/strong>/);
  assert.match(whyHtml, /href="\.\/">Claude Code Hooks Security Check<\/a>/);
});

test("the example loads as valid JSON and contains at least one risky command", () => {
  const exampleMatch = scriptSource.match(/const EXAMPLE = JSON\.stringify\((\{[\s\S]*?\}),\s*null,\s*2\);/);
  assert.ok(exampleMatch, "EXAMPLE not found");
});

test("sitemap lists every published page and no extras", () => {
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs.sort(), [
    "./",
    "./vs-reading-the-hooks-config-by-eye.html",
    "./why-a-clean-scan-isnt-a-safety-guarantee.html",
  ]);
});

test("robots.txt allows crawling", () => {
  assert.match(robots, /Allow:\s*\//);
});
