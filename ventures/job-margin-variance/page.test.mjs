import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { faqEntries } from '../../platform/pages/build.mjs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('calculator page is findable and usable without a build step', () => {
  const html = page('index.html');
  assert.match(html, /Job Cost Variance Calculator/);
  assert.match(html, /calculate\(read\(\)\)/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Do not keep an anonymous local usage count/);
  assert.match(html, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /why-did-my-job-cost-more-than-i-estimated\.html/);
});

test('the page carries Open Graph and Twitter card tags so a shared link renders', () => {
  const html = page('index.html');
  assert.match(html, /property="og:title"/);
  assert.match(html, /property="og:description"/);
  assert.match(html, /property="og:type"/);
  assert.match(html, /name="twitter:card"/);
  assert.match(html, /name="twitter:title"/);
});

test('the entry page ships a real, question-shaped FAQ that build.mjs will turn into FAQPage schema', () => {
  const html = page('index.html');
  assert.match(html, /<h2>Common questions<\/h2>/);
  const entries = faqEntries(html);
  // Four real questions, not a padded filler list — each with an answer long
  // enough to be a real explanation rather than a caption. faq-coverage.mjs
  // counts this venture as covered only once at least one entry survives the
  // builder's own filters, so this pins that outcome rather than trusting the
  // raw markup to keep matching what the builder expects.
  assert.ok(entries.length >= 4, `expected at least 4 derived FAQ entries, got ${entries.length}`);
  for (const { question, answer } of entries) {
    assert.ok(question.endsWith('?'));
    assert.ok(answer.length >= 40, `answer to "${question}" is too short to be a real explanation`);
  }
  const questions = entries.map(e => e.question);
  assert.ok(questions.some(q => /other costs/i.test(q)));
  assert.ok(questions.some(q => /minus sign/i.test(q)));
  assert.ok(questions.some(q => /store or upload/i.test(q)));
});

test('SEO page answers the search question and does not claim a determination it cannot make', () => {
  const html = page('why-did-my-job-cost-more-than-i-estimated.html');
  assert.match(html, /Why did my job cost more than I estimated\?/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
});

test('robots and sitemap let crawlers find both pages', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /job-margin-variance\/<\/loc>/);
  assert.match(sitemap, /why-did-my-job-cost-more-than-i-estimated\.html/);
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  const html = page('index.html');
  // Before this fix, a rejected input (a negative number, non-numeric text)
  // overwrote only the currency headline with the error sentence and left
  // every other figure -- estimated/actual costs, cost variance, labor
  // variance, largest movement -- showing the last valid calculation. A
  // visitor could easily miss the one-line error and read those stale
  // numbers as the answer for what is now on screen.
  assert.match(html, /id="errors"[^>]*role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const script = scriptMatch[1];
  const catchBlock = script.match(/}catch\(e\)\{([\s\S]*?)\n}}ids\.forEach/);
  assert.ok(catchBlock, 'update() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /headline\.hidden\s*=\s*true/, 'the headline is not hidden on a rejected input');
  for (const id of ['headlineLabel', 'estimated', 'actual', 'costVariance', 'laborVariance', 'largest']) {
    assert.match(
      body,
      new RegExp(`getElementById\\('${id}'\\)\\.textContent\\s*=\\s*''`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
  assert.match(body, /errorsEl\.hidden\s*=\s*false/, 'the error message is never shown');
});

test('the worked example the page ships with actually computes', async () => {
  const { calculate } = await import('./calc.mjs');
  const markup = page('index.html');
  const defaults = Object.fromEntries(
    [...markup.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)].map(m => [m[1], m[2]]),
  );
  const result = calculate(defaults);
  assert.ok(result.largest.label, 'the shipped defaults should compute a real result');
  assert.equal(result.costVariance, 60);
});
