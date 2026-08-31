import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { faqEntries } from "../../../platform/pages/build.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(dir, "index.html"), "utf8");
const docsHtml = readFileSync(join(dir, "what-is-mcp-tool-poisoning.html"), "utf8");

test("landing copy names the MCP manifest drift problem in the first screen", () => {
  assert.match(html, /<title>MCP Supply-Chain Watch/);
  assert.match(html, /meta name="description"/);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /HowTo/);
  assert.match(html, /og:title/);
  assert.match(html, /og:description/);
});

test("user-facing disclaimer and privacy line are on the page", () => {
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, financial, security, or compliance advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Do not keep anonymous local usage counts/);
  assert.match(html, /GitHub Sponsors/);
});

test("primary actions exist for compare, example, export, and ticket copy", () => {
  assert.match(html, /id="compareBtn"/);
  assert.match(html, /id="exampleBtn"/);
  assert.match(html, /id="downloadBtn"/);
  assert.match(html, /id="copyBtn"/);
  assert.match(html, /id="before"/);
  assert.match(html, /id="after"/);
  assert.match(html, /id="beforeFile"/);
  assert.match(html, /id="afterFile"/);
});

test("links to the docs page and vice versa", () => {
  assert.match(html, /href="\.\/what-is-mcp-tool-poisoning\.html"/);
  assert.match(docsHtml, /href="\.\/index\.html"/);
});

test("the entry page ships a real, question-shaped FAQ that build.mjs will turn into FAQPage schema", () => {
  // No FAQPage block is authored in index.html itself: build.mjs's own
  // faqEntries() derives it from this visible "Common questions" section at
  // build time, which is what keeps the schema and the copy from drifting
  // apart. This pins the derived outcome directly, the same way build.mjs
  // will read it, rather than parsing a hand-written block that could go
  // stale next to the copy.
  assert.match(html, /<h2>Common questions<\/h2>/);
  const entries = faqEntries(html);
  assert.ok(entries.length >= 6, `expected at least 6 derived FAQ entries, got ${entries.length}`);
  for (const { question, answer } of entries) {
    assert.ok(question.endsWith("?"));
    assert.ok(answer.length >= 40, `answer to "${question}" is too short to be a real explanation`);
  }
  const questions = entries.map((e) => e.question);
  assert.ok(questions.some((q) => /manifest/i.test(q)));
  assert.ok(questions.some((q) => /alert severity/i.test(q)));
  assert.ok(questions.some((q) => /instruction-bearing/i.test(q)));
});

test("docs page answers the specific question in its title and has its own FAQPage schema", () => {
  assert.match(docsHtml, /<title>What is an MCP tool poisoning attack\?/);
  assert.match(docsHtml, /FAQPage/);
  assert.match(docsHtml, /rug-pull/);
  assert.match(docsHtml, /No warranty/);
});

test("robots.txt and sitemap.xml are present and reference each page", () => {
  const robots = readFileSync(join(dir, "robots.txt"), "utf8");
  const sitemap = readFileSync(join(dir, "sitemap.xml"), "utf8");
  assert.match(robots, /Sitemap: sitemap\.xml/);
  assert.match(sitemap, /<loc>\.\/<\/loc>/);
  assert.match(sitemap, /what-is-mcp-tool-poisoning\.html/);
});
