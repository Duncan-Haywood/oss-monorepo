import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const secondary = await readFile(new URL('./vs-a-vulnerability-scanner.html', import.meta.url), 'utf8');

test('the entry page is a working tool, not a landing page', () => {
  assert.match(index, /<textarea/);
  assert.match(index, /id="check"/);
  assert.match(index, /id="load-example"/);
  assert.match(index, /id="add-file"/);
  assert.match(index, /classify\.mjs/);
});

test('the page carries the portfolio disclaimers and stays local', () => {
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /never leaves your device/i);
  assert.match(index, /no network calls/i);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
});

test('the page never claims a clean scan means the image has no vulnerabilities', () => {
  const prose = index.replace(/<script[\s\S]*?<\/script>/g, '');
  assert.match(prose, /not a vulnerability scan/);
  assert.match(prose, /makes no claim about CVEs/i);
});

test('the page discloses the data is a curated snapshot, not a live lookup', () => {
  assert.match(index, /curated,? (dated )?table|checked-in (dataset|snapshot)/i);
  assert.match(index, /not a live (lookup|feed)/i);
  assert.match(index, /confirmed/);
  assert.match(index, /estimated/);
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
  assert.match(index, /<title>[^<]*Docker[^<]*EOL[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*end-of-life[^"]*"/);
});

test('index links to the comparison page', () => {
  assert.match(
    index,
    /href="vs-a-vulnerability-scanner\.html"/,
    'index must link the comparison page so crawlers can reach it',
  );
});

test('comparison page links back to the tool', () => {
  assert.match(secondary, /href="\.\/"/);
});

test('comparison page answers the search question without a warranty gap', () => {
  assert.match(secondary, /end-of-life/i);
  assert.match(secondary, /FAQPage/);
  assert.match(secondary, /No warranty/);
  assert.match(secondary, /no SLA/i);
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

// Natural sibling: same Dockerfile, a different question (is the release
// line still supported vs. is the reference pinned against repointing).
// Without a crawlable link here, a crawler entering on this tool never
// reaches docker-base-image-pin-check in one hop.
test('index links one hop to the docker-base-image-pin-check sibling', () => {
  assert.match(
    index,
    /href="\.\.\/docker-base-image-pin-check\/"/,
    'index must link ../docker-base-image-pin-check/ so crawlers reach the sibling checker in one hop',
  );
});
