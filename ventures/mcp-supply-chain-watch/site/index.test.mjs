import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(dir, "index.html"), "utf8");
const docsHtml = readFileSync(join(dir, "what-is-mcp-tool-poisoning.html"), "utf8");

test("landing copy names the MCP manifest drift problem in the first screen", () => {
  assert.match(html, /<title>MCP Supply-Chain Watch/);
  assert.match(html, /meta name="description"/);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /FAQPage/);
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

test("visible FAQ copy matches the JSON-LD FAQ questions, so they cannot drift apart", () => {
  const ldMatch = html.match(/"@type": "FAQPage"[\s\S]*?"mainEntity": \[([\s\S]*?)\]\s*\}/);
  assert.ok(ldMatch, "expected an inline FAQPage JSON-LD block");
  const questionNames = [...ldMatch[1].matchAll(/"name": "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(questionNames.length >= 3);
  for (const question of questionNames) {
    assert.match(html, new RegExp(`<h3>${question.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h3>`));
  }
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
