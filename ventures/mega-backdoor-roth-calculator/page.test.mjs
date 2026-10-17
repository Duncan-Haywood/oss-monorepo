import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guide = readFileSync(new URL('./which-conversion-cadence-should-i-use.html', import.meta.url), 'utf8');
const vsByHand = readFileSync(new URL('./vs-doing-the-math-by-hand.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
const calcSource = readFileSync(new URL('./calc.mjs', import.meta.url), 'utf8');

test('the entry page carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, or financial advice/i);
});

test('the entry page states plainly that most plans do not offer this', () => {
  assert.match(html, /most plans do not/i);
});

test('the entry page carries a privacy statement and an opt-in, off-by-default usage checkbox', () => {
  assert.match(html, /id="usage"/);
  assert.doesNotMatch(html, /checked[^>]*id="usage"/);
  assert.match(html, /Nothing is uploaded/);
});

test('the entry page carries SoftwareApplication and FAQPage JSON-LD that parses as valid JSON', () => {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const types = scripts.map((s) => s['@type']);
  assert.ok(types.includes('SoftwareApplication'));
  const faq = scripts.find((s) => s['@type'] === 'FAQPage');
  assert.ok(faq);
  assert.ok(faq.mainEntity.length >= 5);
  for (const question of faq.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('no module in this venture can reach the network', () => {
  assert.doesNotMatch(calcSource, /\bfetch\(/);
  assert.doesNotMatch(calcSource, /XMLHttpRequest/);
  assert.doesNotMatch(html, /\bfetch\(/);
  assert.doesNotMatch(html, /XMLHttpRequest/);
});

test('the guide page stays crawlable, is listed in the sitemap, and links back to the tool', () => {
  assert.match(guide, /<title>Which Roth conversion cadence should I use/);
  assert.match(guide, /name="robots" content="index,follow"/);
  assert.match(guide, /<a href="\.\/">/);
  assert.match(sitemap, /which-conversion-cadence-should-i-use\.html/);
});

test('both pages carry FAQPage JSON-LD that parses as valid JSON and matches visible headings', () => {
  const match = guide.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found on the guide page');
  const schema = JSON.parse(match[1]);
  assert.ok(schema.mainEntity.length >= 4);
  for (const question of schema.mainEntity) {
    assert.ok(guide.includes(`<h3>${question.name}</h3>`), `guide FAQ schema question "${question.name}" has no matching <h3>`);
  }
});

test('the entry page links to the guide page', () => {
  assert.match(html, /href="which-conversion-cadence-should-i-use\.html"/);
});

test('the guide page names no vendor or competing product', () => {
  assert.doesNotMatch(guide, /Fidelity|Vanguard|Schwab|Empower|Voya|Principal/i);
});

test('the entry page links to the by-hand comparison, and it links back', () => {
  assert.match(html, /href="vs-doing-the-math-by-hand\.html"/);
  assert.match(vsByHand, /<a href="\.\/">/);
});

test('the by-hand comparison page names no vendor or competing product', () => {
  assert.doesNotMatch(vsByHand, /Fidelity|Vanguard|Schwab|Empower|Voya|Principal/i);
  assert.match(vsByHand, /names no specific plan provider/i);
});

test('the by-hand comparison page stays crawlable and is listed in the sitemap', () => {
  assert.match(vsByHand, /<title>This calculator vs\. working out/);
  assert.match(vsByHand, /name="robots" content="index,follow"/);
  assert.match(sitemap, /vs-doing-the-math-by-hand\.html/);
});

test('the by-hand comparison page carries the no-warranty disclaimer', () => {
  assert.match(vsByHand, /<strong>No warranty\.<\/strong>/);
});

test('the by-hand comparison page carries FAQPage JSON-LD that parses as valid JSON and matches visible headings', () => {
  const match = vsByHand.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found on the by-hand comparison page');
  const schema = JSON.parse(match[1]);
  assert.ok(schema.mainEntity.length >= 4);
  for (const question of schema.mainEntity) {
    assert.ok(vsByHand.includes(`<h3>${question.name}</h3>`), `by-hand FAQ schema question "${question.name}" has no matching <h3>`);
  }
});

test('the entry page distinguishes this from a regular backdoor Roth IRA', () => {
  assert.match(html, /backdoor Roth IRA/i);
  assert.match(html, /pro-rata/i);
});

test('every input has an associated label', () => {
  const inputNames = [...html.matchAll(/<input name="(\w+)"/g)].map((m) => m[1]);
  assert.ok(inputNames.length > 5);
  for (const name of inputNames) {
    assert.match(html, new RegExp(`<label>[^<]*<input name="${name}"`), `input "${name}" is not inside a <label> with visible text`);
  }
});

// Closest sibling: both are new 2025-2026 individual tax-planning moves,
// stackable rather than mutually exclusive. Related-tool chrome rotates
// inside the catch-all category, so without an explicit one-hop a crawler
// on this page may never land on that tool -- see siblings.mjs.
test('the entry page links one hop to the senior-deduction-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/senior-deduction-calculator\/"/,
    'index must link ../senior-deduction-calculator/ so crawlers reach the sibling deduction calculator in one hop',
  );
});

// A second, concurrently-landed sibling link (both reconcile a figure the
// filer already has against what they actually kept or can still
// contribute), independently added to close the same crawlable-orphan gap
// siblings.test.mjs's committed budget (0) flags. Kept alongside the link
// above rather than picking one -- both are real, correct one-hop paths.
test('index links one hop to the 1099k-reconciliation-worksheet sibling', () => {
  assert.match(
    html,
    /href="\.\.\/1099k-reconciliation-worksheet\/"/,
    'index must link ../1099k-reconciliation-worksheet/ so crawlers reach it in one hop',
  );
});

// trump-account-calculator joined the same category on 2026-09-24 with no
// inbound link of its own (a brand-new venture's first commit) -- this link
// is what keeps it off siblings.test.mjs's committed orphan budget (0).
test('index links one hop to the trump-account-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/trump-account-calculator\/"/,
    'index must link ../trump-account-calculator/ so crawlers reach it in one hop',
  );
});

// solo-401k-contribution-calculator graduated on 2026-09-28 with no inbound
// link of its own (a brand-new venture's first commit) -- this link is what
// keeps it off siblings.test.mjs's committed orphan budget (0). The venture's
// own page already links back here, so this closes the pair both ways.
test('index links one hop to the solo-401k-contribution-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/solo-401k-contribution-calculator\/"/,
    'index must link ../solo-401k-contribution-calculator/ so crawlers reach it in one hop',
  );
});

// backdoor-roth-pro-rata-calculator graduated on 2026-09-29 with no inbound
// link of its own -- this link keeps it off siblings.test.mjs's orphan budget.
test('index links one hop to the backdoor-roth-pro-rata-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/backdoor-roth-pro-rata-calculator\/"/,
    'index must link ../backdoor-roth-pro-rata-calculator/ so crawlers reach it in one hop',
  );
});

// 401k-plan-fee-calculator graduated on 2026-10-10 with no inbound link of its
// own (a brand-new venture's first commit) -- this link is what keeps it off
// siblings.test.mjs's committed orphan budget (0).
test('index links one hop to the 401k-plan-fee-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/401k-plan-fee-calculator\/"/,
    'index must link ../401k-plan-fee-calculator/ so crawlers reach it in one hop',
  );
});
