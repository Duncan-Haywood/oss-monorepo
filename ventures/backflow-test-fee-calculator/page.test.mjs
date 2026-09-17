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

test("index page states this is not legal, engineering, or regulatory advice", () => {
  const html = page("index.html");
  assert.match(html, /not legal, engineering, or regulatory advice/);
});

test("robots and sitemap let crawlers find the page", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /index\.html/);
});

test("index page states the jurisdiction caveat more than once, not only in the footer", () => {
  const html = page("index.html");
  const occurrences = (html.match(/water utility/gi) || []).length;
  assert.ok(occurrences >= 2, `expected the water-utility caveat to appear more than once, saw ${occurrences}`);
});

test("the calculator has device rows and the per-job fee inputs", () => {
  const html = page("index.html");
  assert.match(html, /id="device-rows"/);
  assert.match(html, /id="discount-percent"/);
  assert.match(html, /id="travel-fee"/);
  assert.match(html, /id="filing-fee"/);
  assert.match(html, /id="retest-fee"/);
  assert.match(html, /computeJobQuote/);
});

test("the calculator supports adding and removing device rows", () => {
  const html = page("index.html");
  assert.match(html, /id="add-device"/);
  assert.match(html, /remove-device/);
});

test("the report offers a copy of the breakdown", () => {
  const html = page("index.html");
  assert.match(html, /id="copy-breakdown"/);
  assert.match(html, /Copy breakdown/);
  assert.match(html, /formatQuoteBreakdown/);
});

// The clipboard API is absent over plain http and in some embedded webviews.
// Without a fallback the button would be inert exactly where it fails.
test("a blocked clipboard still leaves the breakdown reachable in a labelled textarea", () => {
  const html = page("index.html");
  assert.match(html, /id="breakdown-fallback"[^>]*hidden/);
  assert.match(html, /<label class="note" for="breakdown-text">/);
  assert.match(html, /<textarea id="breakdown-text"[^>]*readonly/);
  assert.match(html, /catch \{/);
});

// A copy taken after Clear, or after editing a row without recalculating,
// must not hand out figures the screen is no longer showing.
test("the breakdown is served from the last calculated result, and Clear drops it", () => {
  const html = page("index.html");
  assert.match(html, /let lastResult = null;/);
  assert.match(html, /lastResult = result;/);
  assert.match(html, /if \(!lastResult\)/);
  const clearBlock = html.slice(html.indexOf('$("#clear")'));
  assert.match(clearBlock.slice(0, 700), /lastResult = null;/);
});

test("copying the breakdown, calculating, and loading the example are each counted as their own usage event", () => {
  const html = page("index.html");
  assert.match(html, /record\("quote_calculated"\)/);
  assert.match(html, /record\("breakdown_copied"\)/);
  assert.match(html, /record\("example_loaded"\)/);
});

// Closest sibling: another recurring-inspection-fee tool, not a one-time
// trade bid. This venture graduated into the "More free tools" bucket with
// nothing linking to it, so without an explicit one-hop a crawler landing
// here could not reach any sibling at all (platform/pages/siblings.mjs
// --check orphan class).
test("index links one hop to the fire-extinguisher-inspection-route-margin sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/fire-extinguisher-inspection-route-margin\/"/,
    'index must link ../fire-extinguisher-inspection-route-margin/ so crawlers reach that sibling in one hop',
  );
});

// The comparison page is this venture's organic-discovery surface: it
// targets the "backflow test fee calculator" / "price backflow testing
// multiple devices" query directly, so a crawler that never reaches it is a
// channel that does not exist.
test("index links to the vs-spreadsheet comparison page", () => {
  assert.match(page("index.html"), /href="\.\/vs-spreadsheet\.html"/);
});

test("the comparison page links back to the calculator and its FAQPage JSON-LD matches the visible text", () => {
  const vs = page("vs-spreadsheet.html");
  assert.match(vs, /href="\.\/"/);
  const blocks = [...vs.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD on the comparison page");
  assert.ok(faq.mainEntity.length >= 3);
  const visible = vs.replace(/&mdash;/g, "—").replace(/&amp;/g, "&");
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(visible.includes(name), `question not found verbatim: ${name}`);
    assert.ok(
      visible.includes(acceptedAnswer.text),
      `answer not found verbatim for: ${name}`,
    );
  }
});

test("the comparison page carries the disclaimers and is listed in the venture sitemap", () => {
  const vs = page("vs-spreadsheet.html");
  assert.match(vs, /No warranty/);
  assert.match(vs, /Nothing leaves your browser/);
  // It compares against a category of tool rather than a named competitor,
  // which is the basis for its clauses.mjs exemption -- so the page has to
  // keep saying so.
  assert.match(vs, /names no specific product/i);
  assert.match(page("sitemap.xml"), /vs-spreadsheet\.html/);
});

test("the comparison page does not repeat a question the index page already answers", () => {
  const faqOf = (name) => {
    const html = page(name);
    const block = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]))
      .find((b) => b["@type"] === "FAQPage");
    return new Set(block.mainEntity.map((q) => q.name));
  };
  const overlap = [...faqOf("vs-spreadsheet.html")].filter((q) =>
    faqOf("index.html").has(q),
  );
  assert.deepEqual(overlap, [], `duplicated FAQ question(s): ${overlap.join(", ")}`);
});
