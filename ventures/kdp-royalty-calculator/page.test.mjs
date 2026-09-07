import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { faqEntries } from '../../platform/pages/build.mjs';
import { compareExclusiveVsWide, DEFAULTS } from './calc.mjs';

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('calculator page is findable and usable without a build step', () => {
  const html = page('index.html');
  assert.match(html, /KDP Royalty Calculator/);
  assert.match(html, /compareExclusiveVsWide/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Do not keep anonymous local usage/i);
  assert.match(html, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /should-i-enroll-this-book-in-kindle-unlimited\.html/);
  assert.match(html, /vs-amazon-kdp-royalty-calculator\.html/);
});

test('every number input offers a numeric keypad', () => {
  const html = page('index.html');
  const inputs = [...html.matchAll(/<input[^>]*type="number"[^>]*>/g)].map((m) => m[0]);
  assert.ok(inputs.length >= 10, `only ${inputs.length} number inputs`);
  for (const tag of inputs) {
    assert.match(tag, /inputmode="decimal"/, `missing inputmode: ${tag}`);
  }
});

test('the page carries Open Graph tags so a shared link renders', () => {
  const html = page('index.html');
  assert.match(html, /property="og:title"/);
  assert.match(html, /property="og:description"/);
});

test('the entry page ships a real, question-shaped FAQ that build.mjs will turn into FAQPage schema', () => {
  const html = page('index.html');
  assert.match(html, /<h2>Common questions<\/h2>/);
  const entries = faqEntries(html);
  assert.ok(entries.length >= 4, `expected at least 4 derived FAQ entries, got ${entries.length}`);
  for (const { question, answer } of entries) {
    assert.ok(question.endsWith('?'), `not a question: ${question}`);
    assert.ok(answer.length >= 40, `answer to "${question}" is too short to be a real explanation`);
  }
});

test('the 90-day landing page uses the same worked example the tests lock', () => {
  const html = page('should-i-enroll-this-book-in-kindle-unlimited.html');
  const result = compareExclusiveVsWide(DEFAULTS);
  assert.match(html, /\$405\.12/);
  assert.match(html, /\$491\.06/);
  assert.equal(result.exclusive.toFixed(2), '405.12');
  assert.equal(result.wide.toFixed(2), '491.06');
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /FAQPage/);
});

test('the comparison page is linked, listed, and not affiliated', () => {
  const hub = page('index.html');
  const vs = page('vs-amazon-kdp-royalty-calculator.html');
  const sitemap = page('sitemap.xml');
  assert.match(hub, /vs-amazon-kdp-royalty-calculator\.html/);
  assert.match(vs, /not affiliated with/i);
  assert.match(vs, /Amazon/);
  assert.match(vs, /href="\.\/"/);
  assert.match(vs, /No warranty/);
  assert.match(sitemap, /vs-amazon-kdp-royalty-calculator\.html/);
});

test('robots and sitemap let crawlers find every page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /kdp-royalty-calculator\/<\/loc>/);
  assert.match(sitemap, /should-i-enroll-this-book-in-kindle-unlimited\.html/);
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  const html = page('index.html');
  assert.match(html, /id="errors"[^>]*role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const script = scriptMatch[1];
  const catchBlock = script.match(/} catch \(e\) \{([\s\S]*?)\n {6}\}/);
  assert.ok(catchBlock, 'render() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /headline\.hidden\s*=\s*true/, 'the headline is not hidden on a rejected input');
  for (const id of ['subhead', 'unitEbook', 'kdpPrint', 'unitPaperback', 'pagesToMatchOneSale', 'exclusive', 'wide', 'readsToMatchWide']) {
    assert.match(
      body,
      new RegExp(`\\$\\('${id}'\\)\\.textContent\\s*=\\s*''`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
  assert.match(body, /errorsEl\.hidden\s*=\s*false/, 'the error message is never shown');
});

test('the result panel is announced to screen readers when it updates', () => {
  assert.match(page('index.html'), /id="result"[^>]*aria-live="polite"/);
});
