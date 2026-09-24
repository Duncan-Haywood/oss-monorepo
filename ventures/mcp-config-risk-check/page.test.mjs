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
  assert.match(scriptSource, /parseConfig/);
  assert.match(scriptSource, /auditConfig/);
  assert.match(scriptSource, /summaryText/);
  assert.match(scriptSource, /countUsage\("audit_run"\)/);
  assert.match(scriptSource, /countUsage\("summary_copied"\)/);
  assert.match(scriptSource, /function fallbackCopy/);
  assert.match(scriptSource, /execCommand\("copy"\)/);
});

test("carries the no-warranty disclaimer with the security-audit wording", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not a security audit/i);
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

test("states plainly that findings are not a verdict and it makes no network calls of its own", () => {
  assert.match(html, /not a verdict/i);
  assert.match(html, /never makes a network request of its own/i);
});

test("links to mcp-supply-chain-watch as the complementary drift checker", () => {
  assert.match(html, /mcp-supply-chain-watch\/">/);
});

test("links to hidden-unicode-check as a complementary AI-agent-security checker", () => {
  assert.match(html, /hidden-unicode-check\/">/);
});

// skill-manifest-check lives in a different directory; this link is added
// there specifically to keep both ventures out of the sibling-orphan report
// (platform/pages/siblings.test.mjs), per that check's own instruction.
test("links to skill-manifest-check as a complementary AI-agent-tooling checker", () => {
  assert.match(html, /skill-manifest-check\/">/);
});

test("links to claude-code-subagent-check as a complementary AI-agent-tooling checker", () => {
  assert.match(html, /claude-code-subagent-check\/">/);
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
  assert.deepEqual(locs.sort(), [
    "./",
    "./vs-mcp-scan.html",
    "./vs-reading-the-config-by-hand.html",
    "./why-a-clean-scan-isnt-a-safety-guarantee.html",
  ]);
});

test("robots.txt allows crawling", () => {
  assert.match(robots, /Allow:\s*\//);
});
