import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const guide = readFileSync(new URL("./why-did-my-pr-drop-coverage.html", import.meta.url), "utf8");

test("the page imports compareCoverage from compare.mjs and records usage", () => {
  assert.match(html, /import \{ compareCoverage, summarizeCompare \} from "\.\/compare\.mjs"/);
  assert.match(html, /import \{ record, setUsageOptOut \} from "\.\/usage\.mjs"/);
  assert.match(html, /record\("check_run"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

test("the no-warranty disclaimer is on the page", () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /You are responsible for reviewing and verifying its output/);
});

test("the page carries the standard sponsor link and a LICENSE link", () => {
  assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
});

test("FAQPage JSON-LD questions match the visible headings", () => {
  const faq = html.match(/"@type":"FAQPage".*?<\/script>/s)[0];
  for (const question of [
    "How is a drop decided?",
    "Why not just use --cov-fail-under or a Codecov flag?",
    "Which coverage formats does this work with?",
    "Is my coverage report uploaded anywhere?",
  ]) {
    assert.match(faq, new RegExp(question.replace(/[?]/g, "\\?")));
    assert.match(html, new RegExp(`<h3>${question.replace(/[?]/g, "\\?")}</h3>`));
  }
});

test("the guide page carries the same disclaimer and links back to the tool", () => {
  assert.match(guide, /No warranty\.<\/strong>/);
  assert.match(guide, /href="index.html"/);
  assert.match(guide, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test("every .html file in the venture is reachable from the sitemap", () => {
  const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
  const htmlFiles = readdirSync(new URL("./", import.meta.url)).filter((name) => name.endsWith(".html"));
  for (const name of htmlFiles) {
    if (name === "index.html" || name === "offline.html") continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, "\\.")), `${name} is missing from sitemap.xml`);
  }
});
