import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const here = new URL("./", import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, here), "utf8");

const PAGE = "what-does-this-e-invoice-error-code-mean.html";
const html = read(PAGE);
const index = read("index.html");

/**
 * Every rule ID the shipped checker modules can put in a report.
 *
 * Scanned from the source rather than listed here on purpose: a hand-kept list
 * is exactly what goes stale the first time someone adds INV-055, and a rule
 * reference that silently omits the newest rule is worse than no reference —
 * the reader concludes the code they were given is not ours and stops looking.
 * Test files are excluded because their fixtures use invented ids (INV-1,
 * INV-XML, INV-2026) as invoice *numbers*, which are not rules at all.
 */
function emittedRuleIds() {
  const dir = fs.readdirSync(new URL(".", here));
  const ids = new Set();
  for (const file of dir) {
    if (!file.endsWith(".mjs") || file.endsWith(".test.mjs")) continue;
    for (const match of read(file).matchAll(/"(INV-[A-Z0-9]+)"/g)) {
      ids.add(match[1]);
    }
  }
  return [...ids].sort();
}

test("every rule the checker can emit is documented on the reference page", () => {
  const emitted = emittedRuleIds();
  // Guard the guard: if the scan ever returns almost nothing (a refactor moved
  // the ids behind a constant, say), the coverage assertion below would pass
  // vacuously and the page could rot unnoticed.
  assert.ok(emitted.length >= 50, `expected the checker to define many rules, found ${emitted.length}`);

  const undocumented = emitted.filter((id) => !html.includes(`<code>${id}</code>`));
  assert.deepEqual(
    undocumented,
    [],
    `these rule ids are emitted by the checker but absent from ${PAGE}: ${undocumented.join(", ")}`,
  );
});

test("the page does not invent rule ids the checker never emits", () => {
  const emitted = new Set(emittedRuleIds());
  const onPage = new Set([...html.matchAll(/<code>(INV-[A-Z0-9]+)<\/code>/g)].map((m) => m[1]));
  const invented = [...onPage].filter((id) => !emitted.has(id)).sort();
  assert.deepEqual(
    invented,
    [],
    `these rule ids appear on ${PAGE} but no checker module emits them: ${invented.join(", ")}`,
  );
});

test("index links to the rule reference page", () => {
  assert.match(index, new RegExp(PAGE.replace(/[.]/g, "\\.")));
});

test("the page is in the venture sitemap", () => {
  assert.match(read("sitemap.xml"), new RegExp(PAGE.replace(/[.]/g, "\\.")));
});

test("the docs page carries the house discovery and disclaimer furniture", () => {
  assert.match(html, /What Does This E-invoice Error Code Mean/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /"@type":"Question"/);
  assert.match(html, /rel="canonical"/);
  assert.match(html, /og:title/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /not tax or legal advice/i);
  assert.match(html, /sponsors\/Duncan-Haywood/);
});

test("the page states plainly that INV codes are not network or EN 16931 codes", () => {
  // The one claim on this page that would be actively harmful if it drifted:
  // a reader who quotes an INV code to their submission network gets nowhere,
  // and a reader who believes these are BR- rules thinks a clean run means the
  // document is legally valid. Both are denials the page must keep making.
  // Either spelling of the space: the prose section uses a non-breaking entity
  // so the standard number never wraps, the FAQ answer uses a plain space
  // because its text must match the JSON-LD byte for byte (faq-visible.test.mjs).
  assert.match(html, /not\b[^.]{0,40}EN(?:&nbsp;|\s)16931/i);
  assert.match(html, /Peppol/i);
  assert.match(html, /does not decide tax treatment or legal validity/i);
});

test("the reference cross-links the mixed-rate deep page it shares rules with", () => {
  // INV-037/INV-038 are explained in worked form by the sibling page added in
  // #2288; the reference should hand a reader with a mixed-rate invoice to it
  // rather than restating that arithmetic in a table cell.
  const sibling = "how-do-you-calculate-a-mixed-vat-rate-tax-breakdown.html";
  assert.ok(
    fs.existsSync(path.join(new URL(".", here).pathname, sibling)),
    `${sibling} is expected to exist; if it was renamed, update the cross-link on ${PAGE}`,
  );
  assert.match(html, new RegExp(sibling.replace(/[.]/g, "\\.")));
});
