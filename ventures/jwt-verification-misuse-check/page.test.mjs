import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const secondary = await readFile(
  new URL('./what-is-jwt-verification-misuse.html', import.meta.url),
  'utf8',
);

test('the entry page is a working tool, not a landing page', () => {
  assert.match(index, /<textarea/);
  assert.match(index, /id="check"/);
  assert.match(index, /id="load-example"/);
  assert.match(index, /id="add-file"/);
  assert.match(index, /usage\.mjs/);
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

test('the page never claims a clean scan means the workflow is safe', () => {
  // Guarded as the assertive forms only -- the FAQ deliberately *asks*
  // "does a clean scan mean my workflows are safe?", which is the honest
  // question, so a blanket ban on the phrase would forbid the question
  // along with the overclaim.
  const prose = index.replace(/<script[\s\S]*?<\/script>/g, '');
  const claims = /\b(?:is|are|was|were)\s+safe\b/gi;
  for (const match of prose.matchAll(claims)) {
    const preceding = prose.slice(Math.max(0, match.index - 60), match.index);
    const following = prose.slice(match.index + match[0].length, match.index + match[0].length + 12);
    const denied = /\b(?:never|not|no|cannot|does not|doesn't)\b/i.test(preceding);
    const asked = following.trimStart().startsWith('?');
    assert.ok(
      denied || asked,
      `unqualified safety claim near: ${JSON.stringify(prose.slice(Math.max(0, match.index - 60), match.index + 40))}`,
    );
  }
  assert.match(index, /not a security audit/);
});

test('the page tells the visitor it makes no network calls of its own', () => {
  assert.match(index, /makes no network calls/i);
});

test('the JSON-LD FAQPage questions match the visible FAQ headings', () => {
  const ldMatch = index.match(/"@type":"FAQPage"[\s\S]*?<\/script>/);
  assert.ok(ldMatch, 'expected a FAQPage JSON-LD block');
  const ld = ldMatch[0];
  const headings = [...index.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').trim(),
  );
  assert.ok(headings.length > 0, 'expected visible h3 FAQ headings');
  const ldUnescaped = ld.replace(/\\"/g, '"');
  for (const heading of headings) {
    assert.ok(
      ldUnescaped.includes(heading) || ldUnescaped.includes(heading.replace(/’/g, "'")),
      `visible heading not found in FAQPage JSON-LD: ${heading}`,
    );
  }
});

test('title and meta description carry the actual search phrases', () => {
  assert.match(index, /<title>[^<]*JWT[^<]*<\/title>/);
  assert.match(index, /name="description" content="[^"]*jwt\.decode[^"]*"/i);
});

test('index links to the JWT misuse guide page', () => {
  assert.match(
    index,
    /href="what-is-jwt-verification-misuse\.html"/,
    'index must link the secondary docs page so crawlers can reach it',
  );
});

test('docs page links back to the tool', () => {
  assert.match(secondary, /href="\.\/"/);
});

test('secondary docs page answers the search question without a warranty gap', () => {
  assert.match(secondary, /jwt\.verify/i);
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

test('the page labels itself a heuristic line scan and says what it is not', () => {
  assert.match(index, /heuristic line scan/i);
  assert.match(index, /not a security audit/i);
  assert.match(secondary, /heuristic line scan/i);
});

test('the page makes no network calls: no fetch, XHR, beacon or WebSocket in its script', () => {
  const scripts = [...index.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  assert.ok(scripts.length > 0);
  assert.doesNotMatch(scripts, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
});

test('every finding type the scanner can emit is described on the guide page', async () => {
  const { RISK_CLASSIFICATIONS } = await import('./classify.mjs');
  for (const type of RISK_CLASSIFICATIONS) {
    assert.ok(secondary.includes(type), `guide page does not describe ${type}`);
  }
});

test('index links one hop to the cors-misconfig-check sibling', () => {
  assert.match(index, /href="\.\.\/cors-misconfig-check\/"/);
});

test('index links one hop to the jwt-security-check sibling', () => {
  assert.match(index, /href="\.\.\/jwt-security-check\/"/);
});
