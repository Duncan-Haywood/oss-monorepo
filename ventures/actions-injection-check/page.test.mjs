import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const secondary = await readFile(
  new URL('./what-is-a-pwn-request-in-github-actions.html', import.meta.url),
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

test('the page never claims a clean scan means the workflow is secure', () => {
  // Guarded as the assertive forms only -- the FAQ deliberately *asks*
  // "does a clean scan mean my workflows are secure?", which is the honest
  // question, so a blanket ban on the phrase would forbid the question
  // along with the overclaim.
  const prose = index.replace(/<script[\s\S]*?<\/script>/g, '');
  const claims = /\b(?:is|are|was|were)\s+secure\b/gi;
  for (const match of prose.matchAll(claims)) {
    const preceding = prose.slice(Math.max(0, match.index - 60), match.index);
    const following = prose.slice(match.index + match[0].length, match.index + match[0].length + 12);
    const denied = /\b(?:never|not|no|cannot|does not|doesn't)\b/i.test(preceding);
    const asked = following.trimStart().startsWith('?');
    assert.ok(
      denied || asked,
      `unqualified security claim near: ${JSON.stringify(prose.slice(Math.max(0, match.index - 60), match.index + 40))}`,
    );
  }
  assert.match(index, /not a security audit/);
});

test('the page tells the visitor it makes no network calls of its own', () => {
  assert.match(index, /makes no network calls/i);
});

test('the JSON-LD FAQPage questions match the visible FAQ headings', () => {
  // Parse the block rather than substring-matching it. A question containing a
  // double quote is spelled `\"` inside JSON and `"` in the visible <h3>, so a
  // raw includes() reports a mismatch on a pair that is in fact identical.
  const ldMatch = index.match(
    /<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?)<\/script>/,
  );
  assert.ok(ldMatch, 'expected a FAQPage JSON-LD block');
  const faq = JSON.parse(ldMatch[1]);
  const questions = faq.mainEntity.map((entry) => entry.name);
  const headings = [...index.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').trim(),
  );
  assert.ok(headings.length > 0, 'expected visible h3 FAQ headings');
  for (const heading of headings) {
    assert.ok(
      questions.includes(heading) || questions.includes(heading.replace(/’/g, "'")),
      `visible heading not found in FAQPage JSON-LD: ${heading}`,
    );
  }
});

test('title and meta description carry the actual search phrases', () => {
  assert.match(index, /<title>[^<]*Pwn Requests[^<]*Script Injection[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*pwn request[^"]*"/i);
});

test('index links to the pwn-request docs page', () => {
  assert.match(
    index,
    /href="what-is-a-pwn-request-in-github-actions\.html"/,
    'index must link the secondary docs page so crawlers can reach it',
  );
});

test('docs page links back to the tool', () => {
  assert.match(secondary, /href="\.\/"/);
});

test('secondary docs page answers the search question without a warranty gap', () => {
  assert.match(secondary, /pwn request/i);
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
