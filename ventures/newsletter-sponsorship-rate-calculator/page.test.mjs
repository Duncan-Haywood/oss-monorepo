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
  assert.match(sitemap, /newsletter-sponsorship-rate-benchmarks\.html/);
});

// Closest cross-venture sibling: a self-published author with a mailing list
// is a common overlap with a newsletter operator, and each tool prices a
// different revenue lever on the same audience. Related-tool chrome rotates
// by category, so without an explicit one-hop a crawler on this page may
// never land on that tool (platform/pages/siblings.test.mjs's orphan budget).
test("index links one hop to the kdp-royalty-calculator sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/kdp-royalty-calculator\/"/,
    "index must link ../kdp-royalty-calculator/ so crawlers reach it in one hop",
  );
  assert.match(html, /KDP royalty calculator/i);
});

// A rate card is only useful once the sponsor can see it. These three claims
// have to hold together: the button exists, a decoded link is applied through
// formValues (so a box the sender cleared arrives cleared rather than showing
// the recipient's own state), and the footer's privacy copy no longer says the
// numbers never leave -- they do, in the URL, when the operator asks them to.
test("the page offers a shareable link and restores one through formValues", () => {
  const html = page("index.html");
  assert.match(html, /id="copy-link"/);
  assert.match(html, /import \{ SHARE_FIELDS, encodeInputs, decodeInputs, formValues \} from "\.\/share\.mjs"/);
  assert.match(html, /formValues\(fromLink, els\.niche\.value\)/, "a decoded link must be applied through formValues");
  assert.match(html, /record\("link_copied"\)/);
});

test("the privacy copy lists every counted event and discloses the link", () => {
  const html = page("index.html");
  assert.match(html, /<code>calculate_run<\/code>, <code>example_loaded<\/code>, <code>link_copied<\/code>/);
  assert.match(html, /carries your subscriber count, open rate, and niche inside the URL/);
});

test("opening a shared link renders the rates without yanking the viewport", () => {
  const html = page("index.html");
  // Motion on arrival that nobody asked for. The card still renders; only the
  // scroll is suppressed, which is why this asserts the argument rather than
  // the absence of scrollIntoView.
  assert.match(html, /runCalculate\(\{ scroll: false \}\)/);
  assert.match(html, /if \(scroll\) els\.reportCard\.scrollIntoView/);
});
