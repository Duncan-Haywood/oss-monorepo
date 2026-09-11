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

// Reciprocal of brand-deal-rate-calculator's own inbound link to this
// venture: closes the sibling pair so platform/pages/siblings.mjs --check
// counts neither tool as a crawlable orphan.
test("index links one hop to the brand-deal-rate-calculator sibling", () => {
  const html = page("index.html");
  assert.match(
    html,
    /href="\.\.\/brand-deal-rate-calculator\/"/,
    "index must link ../brand-deal-rate-calculator/ so crawlers reach it in one hop",
  );
  assert.match(html, /brand deal rate calculator/i);
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

// Static guard for the shape of bug platform/pages/roundtrip.mjs found live
// in bounce-house-rental-calculator (#4606): "Copy shareable link" reads the
// subscriber/open-rate/niche fields directly off the form, not off whatever
// was last rendered. Without a live listener, editing a field after pressing
// "Calculate my rates" left the on-screen ranges showing the *old* numbers
// while a link copied a moment later carried the *new* ones -- the sender and
// the recipient would see two different rate cards for the same link. The
// authoritative regression check is the real browser behaviour in
// roundtrip.mjs; this only pins that the wiring which fixes it stays shipped.
test("every field recomputes the rate card live, not only on an explicit calculate", () => {
  const html = page("index.html");
  assert.match(
    html,
    /for \(const el of \[els\.subscribers, els\.openRate, els\.niche\]\)/,
    "subscribers, openRate and niche must all be covered by the live-recompute listener loop",
  );
  assert.match(
    html,
    /el\.addEventListener\("input", syncFromInputs\)/,
    'an "input" listener must call syncFromInputs so editing a field updates the rate card immediately',
  );
  assert.match(
    html,
    /el\.addEventListener\("change", syncFromInputs\)/,
    'a "change" listener must call syncFromInputs so the niche <select> updates the rate card immediately',
  );
});

// Distinct from the test above: repricing live must not turn calculate_run
// into a per-keystroke typing counter -- the same guard
// bounce-house-rental-calculator's #4616 added for its own live-recompute
// fix. record("calculate_run") must stay tied to the explicit button click.
test("repricing on input or change never records a usage event", () => {
  const html = page("index.html");
  assert.doesNotMatch(
    html,
    /function syncFromInputs\(\) \{[^}]*record\(/,
    "syncFromInputs must not record a usage event on every keystroke",
  );
  assert.match(
    html,
    /runCalculate\(\);\s*\n\s*record\("calculate_run"\);/,
    'record("calculate_run") must stay on the explicit "Calculate my rates" click handler',
  );
});
