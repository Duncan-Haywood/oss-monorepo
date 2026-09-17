import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const secondary = await readFile(
  new URL('./why-branch-protection-drifts.html', import.meta.url),
  'utf8',
);

test('the entry page is a working tool, not a landing page', () => {
  assert.match(index, /<textarea/);
  assert.match(index, /id="actual"/);
  assert.match(index, /id="policy"/);
  assert.match(index, /id="check"/);
  assert.match(index, /id="load-example"/);
  assert.match(index, /engine\.mjs/);
});

test('the page carries the portfolio disclaimers and stays local', () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /never uploaded/i);
  assert.match(index, /no network calls/i);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
});

test('the page never claims a clean result is a full audit or compliance guarantee', () => {
  const prose = index.replace(/<script[\s\S]*?<\/script>/g, '');
  assert.match(prose, /not a security audit/);
  assert.match(prose, /not.*a compliance attestation|compliance attestation/i);
});

test('the page tells the visitor it makes no network calls and does not read branch protection for it', () => {
  assert.match(index, /makes no network calls/i);
  assert.match(index, /read my branch protection settings for me/i);
});

test('a rule the policy does not mention is never silently scored as a pass or fail', () => {
  assert.match(index, /not policed/i);
  assert.match(index, /stronger than policy/i);
});

test('the JSON-LD FAQPage questions match the visible FAQ headings', () => {
  const ldMatch = index.match(/"@type":"FAQPage"[\s\S]*?<\/script>/);
  assert.ok(ldMatch, 'expected a FAQPage JSON-LD block');
  const ld = ldMatch[0];
  const headings = [...index.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').trim(),
  );
  assert.ok(headings.length > 0, 'expected visible h3 FAQ headings');
  for (const heading of headings) {
    assert.ok(
      ld.includes(heading) || ld.includes(heading.replace(/’/g, "'")),
      `visible heading not found in FAQPage JSON-LD: ${heading}`,
    );
  }
});

test('title and meta description carry the actual search phrase', () => {
  assert.match(index, /<title>[^<]*Branch Protection Drift Check[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*branch protection[^"]*"/);
});

test('index links to the secondary docs page', () => {
  assert.match(
    index,
    /href="why-branch-protection-drifts\.html"/,
    'index must link the secondary docs page so crawlers can reach it',
  );
});

test('docs page links back to the tool', () => {
  assert.match(secondary, /href="\.\/"/);
});

test('secondary docs page answers the search question without a warranty gap', () => {
  assert.match(secondary, /branch protection/i);
  assert.match(secondary, /FAQPage/);
  assert.match(secondary, /No warranty/);
});

test('every .html file in the venture is reachable from the sitemap', async () => {
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const dir = new URL('./', import.meta.url);
  const htmlFiles = readdirSync(dir).filter((name) => name.endsWith('.html'));
  for (const name of htmlFiles) {
    if (name === 'index.html') continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

// Closest sibling: both are free, browser-only branch-protection checkers,
// one about required-check names, this one about the surrounding policy
// fields. Without a crawlable link here, a crawler entering on this tool
// never reaches required-checks-drift-check in one hop.
test('index links one hop to the required-checks-drift-check sibling', () => {
  assert.match(
    index,
    /href="\.\.\/required-checks-drift-check\/"/,
    'index must link ../required-checks-drift-check/ so crawlers reach a sibling checker in one hop',
  );
});
