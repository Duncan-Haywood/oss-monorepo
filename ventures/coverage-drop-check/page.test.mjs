import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const guide = readFileSync(new URL("./why-did-my-pr-drop-coverage.html", import.meta.url), "utf8");

test("the page imports compareCoverage from compare.mjs and records usage", () => {
  assert.match(html, /import \{ compareCoverage, summarizeCompare \} from "\.\/compare\.mjs"/);
  assert.match(html, /import \{ record, setUsageOptOut, usageOptedOut \} from "\.\/usage\.mjs"/);
  // `usageOptedOut` is what lets the button show a choice made on an earlier
  // visit. Without it the page counted correctly and still told the visitor
  // their click had not taken.
  assert.match(html, /usageOptedOut\(\)/);
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

// flaky-test-finder covers the next question after "did coverage drop?": which
// tests actually flipped. Without a crawlable link on this hub, a crawler
// entering on coverage-drop-check never reaches that sibling in one hop —
// same one-way orphan class as #3639 / #3667 / #3677.
test("index links to the related flaky-test-finder", () => {
  assert.match(
    html,
    /href="\.\.\/flaky-test-finder\/"/,
    "index must link ../flaky-test-finder/ so crawlers can reach the JUnit flaky classifier",
  );
});

// actions-runner-starvation-check covers the question before coverage math
// matters: did GitHub assign a runner at all. The flaky edge of this triangle
// already has reciprocal hub links; without this one, a crawler entering on
// coverage-drop-check still needs two hops to reach the starvation tool —
// same one-hop orphan class as #3677 / #3685.
test("index links to the related actions-runner-starvation-check", () => {
  assert.match(
    html,
    /href="\.\.\/actions-runner-starvation-check\/"/,
    "index must link ../actions-runner-starvation-check/ so crawlers can reach the runner_id classifier",
  );
});
