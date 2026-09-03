import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { faqEntries } from '../../platform/pages/build.mjs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('calculator page is findable and usable without a build step', () => {
  const html = page('index.html');
  assert.match(html, /SaaS Price Increase Churn Calculator/);
  assert.match(html, /calculateImpact\(input\)/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /Do not keep anonymous local usage/i);
  assert.match(html, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /how-much-can-i-raise-my-saas-price\.html/);
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
    assert.ok(question.endsWith('?'));
    assert.ok(answer.length >= 40, `answer to "${question}" is too short to be a real explanation`);
  }
});

test('SEO page answers the search question and does not overclaim', () => {
  const html = page('how-much-can-i-raise-my-saas-price.html');
  assert.match(html, /How much can I raise my SaaS price\?/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
});

test('robots and sitemap let crawlers find the page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /subscription-price-impact\/<\/loc>/);
});

test('an invalid input hides stale results instead of leaving them next to a silent error', () => {
  const html = page('index.html');
  // Before this fix, a rejected input (a negative number, non-numeric text)
  // overwrote only the percentage headline with the error sentence and left
  // every other figure -- subhead, current/proposed revenue, revenue change,
  // break-even subscribers, and the whole churn-scenario table -- showing
  // the last valid calculation. A visitor could easily miss the one-line
  // error and read those stale numbers as the answer for what is now on
  // screen.
  assert.match(html, /id="errors"[^>]*role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const script = scriptMatch[1];
  const catchBlock = script.match(/}catch\(e\)\{([\s\S]*?)\n {4}\}\}/);
  assert.ok(catchBlock, 'render() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /headline\.hidden\s*=\s*true/, 'the headline is not hidden on a rejected input');
  for (const id of ['subhead', 'currentRevenue', 'proposedRevenue', 'revenueChange', 'breakEvenCustomers']) {
    assert.match(
      body,
      new RegExp(`\\$\\('${id}'\\)\\.textContent\\s*=\\s*''`),
      `#${id} keeps its stale value instead of being cleared on a rejected input`,
    );
  }
  assert.match(body, /scenarios'\)\.replaceChildren\(\)/, 'the stale scenario table rows are never cleared');
  assert.match(body, /errorsEl\.hidden\s*=\s*false/, 'the error message is never shown');
});

test('the worked example the page ships with actually computes', async () => {
  const { calculateImpact } = await import('./calc.mjs');
  const markup = page('index.html');
  const defaults = Object.fromEntries(
    [...markup.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)].map(m => [m[1], m[2]]),
  );
  const result = calculateImpact(defaults);
  assert.equal(result.maxChurnRate, 20);
  assert.equal(result.breakEvenCustomers, 80);
});
