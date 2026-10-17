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
  assert.match(scriptSource, /lintAgent/);
  assert.match(scriptSource, /summaryText/);
  assert.match(scriptSource, /countUsage\("check_run"\)/);
  assert.match(scriptSource, /countUsage\("summary_copied"\)/);
});

test("carries the no-warranty disclaimer with delegation/runtime-behaviour wording", () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not a guarantee of how Claude Code will delegate to or run this subagent/i);
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

test("states plainly that findings do not describe delegation behaviour and it makes no network calls of its own", () => {
  assert.match(html, /does not know whether Claude Code's orchestrator will actually delegate/i);
  assert.match(html, /never uploads anything and never calls an LLM/i);
});

test("links to claude-code-settings-check, skill-manifest-check, mcp-config-risk-check, and hidden-unicode-check as complementary AI-agent-tooling checkers", () => {
  assert.match(html, /claude-code-settings-check\/">/);
  assert.match(html, /skill-manifest-check\/">/);
  assert.match(html, /mcp-config-risk-check\/">/);
  assert.match(html, /hidden-unicode-check\/">/);
});

test("supports pasting a subagent definition and an optional filename", () => {
  assert.match(html, /id="agentInput"/);
  assert.match(html, /id="filenameInput"/);
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

test("the example is present in the script source", () => {
  assert.match(scriptSource, /const EXAMPLE = \[/);
});

test("sitemap lists every published page and no extras", () => {
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs.sort(), ["./", "./vs-reading-the-subagent-file-by-eye.html"]);
});

test("robots.txt allows crawling", () => {
  assert.match(robots, /Allow:\s*\//);
});
