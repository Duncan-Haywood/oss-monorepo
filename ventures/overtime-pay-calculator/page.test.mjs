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

test("index page states this is not legal, tax, or financial advice", () => {
  const html = page("index.html");
  assert.match(html, /not legal, tax, or financial advice/);
});

test("robots and sitemap let crawlers find the page", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /index\.html/);
});

test("index page states the federal-only caveat, not just in the footer", () => {
  const html = page("index.html");
  // Appears in the calculator's own finding text (calc.mjs), the FAQ, and
  // the footer -- not only in fine print the visitor may never scroll to.
  const occurrences = (html.match(/federal FLSA/gi) || []).length;
  assert.ok(occurrences >= 2, `expected the federal-only caveat to appear more than once, saw ${occurrences}`);
});

// --- Single-rate calculator ---

test("the single-rate calculator has rate, hours, threshold, and multiplier inputs", () => {
  const html = page("index.html");
  assert.match(html, /id="single-rate"/);
  assert.match(html, /id="single-hours"/);
  assert.match(html, /id="single-threshold"/);
  assert.match(html, /id="single-multiplier"/);
  assert.match(html, /computeSingleRateOvertime/);
});

// --- Blended-rate calculator ---

test("the blended-rate calculator supports adding and removing rate rows", () => {
  const html = page("index.html");
  assert.match(html, /id="add-rate"/);
  assert.match(html, /remove-rate/);
  assert.match(html, /computeWeightedAverageOvertime/);
});

test("the blended report offers a copy of the breakdown", () => {
  const html = page("index.html");
  assert.match(html, /id="copy-breakdown"/);
  assert.match(html, /Copy breakdown/);
  assert.match(html, /formatWeightedBreakdown/);
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
  const clearBlock = html.slice(html.indexOf('$("#clear-blended")'));
  assert.match(clearBlock.slice(0, 700), /lastResult = null;/);
});

test("copying the breakdown is counted as its own usage event", () => {
  assert.match(page("index.html"), /record\("breakdown_copied"\)/);
});

test("both calculators are counted as separate usage events", () => {
  const html = page("index.html");
  assert.match(html, /record\("overtime_calculated"\)/);
  assert.match(html, /record\("blended_calculated"\)/);
});

// Closest sibling: another payroll-arithmetic tool. This venture graduated
// into the "More free tools" bucket with nothing linking to it, so without an
// explicit one-hop a crawler landing here could not reach any sibling at all
// (platform/pages/siblings.mjs --check orphan class).
test("index links one hop to the certified-payroll-calculator sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/certified-payroll-calculator\/"/,
    'index must link ../certified-payroll-calculator/ so crawlers reach the certified payroll calculator in one hop',
  );
  assert.match(html, /certified payroll calculator/i);
});

// The comparison page is this venture's organic-discovery surface: it targets
// the "blended overtime rate calculator" / "two different pay rates" query
// directly, so a crawler that never reaches it is a channel that does not
// exist. These assertions are the same shape the other vs-* pages carry.
test("index links to the single-rate comparison page", () => {
  assert.match(page("index.html"), /href="\.\/vs-single-rate-calculator\.html"/);
});

test("the comparison page links back to the calculator and its FAQPage JSON-LD matches the visible text", () => {
  const vs = page("vs-single-rate-calculator.html");
  assert.match(vs, /href="\.\/"/);
  const blocks = [...vs.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  assert.ok(faq, "missing FAQPage JSON-LD on the comparison page");
  assert.ok(faq.mainEntity.length >= 3);
  // The visible copy uses HTML entities where the JSON-LD carries literal
  // unicode; decode the two this page actually uses before comparing, the
  // same normalization the index page's own FAQ test does.
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
  const vs = page("vs-single-rate-calculator.html");
  assert.match(vs, /No warranty/);
  assert.match(vs, /Nothing leaves your browser/);
  // It compares against a category of tool rather than a named competitor,
  // which is the basis for its clauses.mjs exemption -- so the page has to
  // keep saying so.
  assert.match(vs, /names no specific product/i);
  assert.match(page("sitemap.xml"), /vs-single-rate-calculator\.html/);
});

test("the comparison page does not repeat a question the index page already answers", () => {
  const faqOf = (name) => {
    const html = page(name);
    const block = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]))
      .find((b) => b["@type"] === "FAQPage");
    return new Set(block.mainEntity.map((q) => q.name));
  };
  const overlap = [...faqOf("vs-single-rate-calculator.html")].filter((q) =>
    faqOf("index.html").has(q),
  );
  assert.deepEqual(overlap, [], `duplicated FAQ question(s): ${overlap.join(", ")}`);
});
