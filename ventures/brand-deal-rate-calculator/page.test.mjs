import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the required disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("robots and sitemap let crawlers find every page", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /index\.html/);
  assert.match(sitemap, /brand-deal-rate-benchmarks\.html/);
});

// Closest cross-venture sibling: both tools price a sponsorship for the same
// underlying creator, just on a different channel (social platform here,
// email list on the sibling). Related-tool chrome rotates by category, so
// without an explicit one-hop a crawler on this page may never land on that
// tool (platform/pages/siblings.test.mjs's orphan budget).
test("index links one hop to the newsletter-sponsorship-rate-calculator sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/newsletter-sponsorship-rate-calculator\/"/,
    "index must link ../newsletter-sponsorship-rate-calculator/ so crawlers reach it in one hop",
  );
  assert.match(html, /newsletter sponsorship rate calculator/i);
});

// Adjacent step in the same workflow: this tool answers "what should I
// charge", influencer-media-kit-generator answers "how do I present it" --
// a creator with a rate in hand still needs the one-pager to send it in.
test("index links one hop to the influencer-media-kit-generator sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/influencer-media-kit-generator\/"/,
    "index must link ../influencer-media-kit-generator/ so crawlers reach it in one hop",
  );
});
