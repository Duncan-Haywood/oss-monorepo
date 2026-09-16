import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const comparison = await readFile(new URL('./vs-diffing-the-raw-json-files.html', import.meta.url), 'utf8');

test('the entry page is a working tool, not a landing page', () => {
  assert.match(index, /<textarea/);
  assert.match(index, /id="check"/);
  assert.match(index, /id="load-example"/);
  assert.match(index, /id="old-sbom"/);
  assert.match(index, /id="new-sbom"/);
  assert.match(index, /diff\.mjs/);
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

test('the page never claims a change (or lack of one) means the build is safe', () => {
  const prose = index.replace(/<script[\s\S]*?<\/script>/g, '');
  const claims = /\b(?:is|are|was|were)\s+(?:vulnerable|safe|secure)\b/gi;
  for (const match of prose.matchAll(claims)) {
    const preceding = prose.slice(Math.max(0, match.index - 60), match.index);
    const following = prose.slice(match.index + match[0].length, match.index + match[0].length + 12);
    const denied = /\b(?:never|not|no|cannot|does not|doesn't|nothing about whether)\b/i.test(preceding);
    const asked = following.trimStart().startsWith('?');
    assert.ok(
      denied || asked,
      `unqualified safety claim near: ${JSON.stringify(prose.slice(Math.max(0, match.index - 60), match.index + 40))}`,
    );
  }
});

test('the page tells the visitor it makes no network calls of its own', () => {
  assert.match(index, /makes no network calls/i);
  assert.match(index, /never leave your device/i);
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
  assert.match(index, /<title>[^<]*SBOM[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*CycloneDX[^"]*"/);
});

test('index links to the comparison page', () => {
  assert.match(
    index,
    /href="vs-diffing-the-raw-json-files\.html"/,
    'index must link the comparison page so crawlers can reach it',
  );
});

test('comparison page links back to the tool and carries the disclaimers', () => {
  assert.match(comparison, /href="\.\/"/);
  assert.match(comparison, /No warranty/);
  assert.match(comparison, /Nothing leaves your browser/);
  // Compares against a generic method/category rather than a named
  // competitor, which is the basis for its clauses.mjs exemption -- so the
  // page has to keep saying so.
  assert.match(comparison, /names no specific product/i);
});

test('the comparison page has valid FAQPage JSON-LD matching visible text', () => {
  const blocks = [...comparison.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]),
  );
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'missing FAQPage JSON-LD on the comparison page');
  assert.ok(faq.mainEntity.length >= 3);
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(comparison.includes(name), `visible question missing: ${name}`);
    assert.ok(comparison.includes(acceptedAnswer.text), `visible answer missing for: ${name}`);
  }
});

test('the comparison page does not repeat a question the index page already answers', () => {
  const faqOf = (html) => {
    const block = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]))
      .find((b) => b['@type'] === 'FAQPage');
    return new Set(block.mainEntity.map((q) => q.name));
  };
  const overlap = [...faqOf(comparison)].filter((q) => faqOf(index).has(q));
  assert.deepEqual(overlap, [], `duplicated FAQ question(s): ${overlap.join(', ')}`);
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

// Closest siblings: same "what does this build actually contain" family of
// checker. Without a crawlable link here, a crawler entering on this tool
// never reaches either sibling in one hop.
test('index links one hop to the docker-base-image-pin-check sibling', () => {
  assert.match(
    index,
    /href="\.\.\/docker-base-image-pin-check\/"/,
    'index must link ../docker-base-image-pin-check/ so crawlers reach the sibling checker in one hop',
  );
});

test('index links one hop to the license-drift-check sibling', () => {
  assert.match(
    index,
    /href="\.\.\/license-drift-check\/"/,
    'index must link ../license-drift-check/ so crawlers reach the sibling checker in one hop',
  );
});
