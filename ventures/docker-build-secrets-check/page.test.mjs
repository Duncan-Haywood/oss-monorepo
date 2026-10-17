import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const secondary = await readFile(
  new URL('./how-to-pass-a-docker-build-secret-without-baking-it-into-the-image.html', import.meta.url),
  'utf8',
);

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
  assert.match(index, /never uploaded/i);
  assert.match(index, /no network calls/i);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /Turn usage counting off/);
  assert.match(index, /sponsors\/Duncan-Haywood/);
});

test('the page never claims a clean scan means the build has no secret exposure', () => {
  const prose = index.replace(/<script[\s\S]*?<\/script>/g, '');
  const claims = /\b(?:is|are|was|were)\s+(?:secret[- ]free|free of secrets|safe|secure)\b/gi;
  for (const match of prose.matchAll(claims)) {
    const preceding = prose.slice(Math.max(0, match.index - 60), match.index);
    const following = prose.slice(match.index + match[0].length, match.index + match[0].length + 12);
    const denied = /\b(?:never|not|no|cannot|does not|doesn't|guarantee that)\b/i.test(preceding);
    const asked = following.trimStart().startsWith('?');
    assert.ok(
      denied || asked,
      `unqualified safety claim near: ${JSON.stringify(prose.slice(Math.max(0, match.index - 60), match.index + 40))}`,
    );
  }
  assert.match(index, /not a security audit/);
});

test('the page tells the visitor it makes no network calls of its own', () => {
  assert.match(index, /mount=type=secret/);
  assert.match(index, /makes no network calls/i);
  assert.match(index, /never leaves your device/i);
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
  assert.match(index, /<title>[^<]*Docker[^<]*Secrets[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*secret[^"]*"/);
});

test('index links to the how-to docs page', () => {
  assert.match(
    index,
    /href="how-to-pass-a-docker-build-secret-without-baking-it-into-the-image\.html"/,
    'index must link the secondary docs page so crawlers can reach it',
  );
});

test('docs page links back to the tool', () => {
  assert.match(secondary, /href="\.\/"/);
});

test('secondary docs page answers the search question without a warranty gap', () => {
  assert.match(secondary, /mount=type=secret/i);
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

// The mandatory inbound sibling link: platform/pages/siblings-budget.json is
// held at an orphan budget of 0, so a new tool must ship with an inbound
// link from another tool's page in the same commit rather than landing as
// an orphan to close later. docker-base-image-pin-check's footer is edited
// in this same change to name this venture back.
test('index links one hop to the docker-base-image-pin-check sibling', () => {
  assert.match(
    index,
    /href="\.\.\/docker-base-image-pin-check\/"/,
    'index must link ../docker-base-image-pin-check/ so crawlers reach the sibling checker in one hop',
  );
});

test('index links one hop to the terraform-plan-secret-exposure-check sibling', () => {
  assert.match(
    index,
    /href="\.\.\/terraform-plan-secret-exposure-check\/"/,
    'index must link ../terraform-plan-secret-exposure-check/ -- same secret-exposure question, a different artifact',
  );
});

test('index links one hop to the actions-secret-leak-check sibling', () => {
  assert.match(
    index,
    /href="\.\.\/actions-secret-leak-check\/"/,
    'index must link ../actions-secret-leak-check/ -- same secret-exposure question, a different artifact',
  );
});

// Inbound hop for docker-compose-security-check, which would otherwise be a
// crawlable orphan (`platform/pages/siblings.mjs` fails on one).
test('index links one hop to the docker-compose-security-check sibling', () => {
  assert.match(index, /href="\.\.\/docker-compose-security-check\/"/);
});
