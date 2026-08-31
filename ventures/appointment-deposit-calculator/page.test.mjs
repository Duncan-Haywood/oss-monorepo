import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('page carries the no-warranty clause and a local-only privacy line', () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /not legal, tax, or financial advice/i);
  assert.match(page, /never uploaded/i);
  assert.match(page, /Best-effort hosting, no SLA/);
});

test('page wires the extracted calculator and usage modules', () => {
  assert.match(page, /id="deposit-form"/);
  assert.match(page, /src="app\.mjs"/);
  const app = readFileSync(new URL('./app.mjs', import.meta.url), 'utf8');
  assert.match(app, /from '\.\/calc\.mjs'/);
  assert.match(app, /from '\.\/usage\.mjs'/);
  assert.match(app, /deposit_calculated/);
  assert.match(app, /policy_copied/);
});

test('page does not recommend a deposit percent', () => {
  assert.match(page, /does not decide for you/);
  assert.doesNotMatch(page, /you should charge|must take a deposit|recommended deposit/i);
});

test('index links to the deposit-percentage SEO/AI-discovery page', () => {
  assert.match(page, /what-percentage-deposit-should-i-charge\.html/);
});

const docsPage = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('the deposit-percentage page answers the search question with a worked table', () => {
  const html = docsPage('what-percentage-deposit-should-i-charge.html');
  assert.match(html, /What percentage deposit should you charge/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /"@type":"Question"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  // Table figures match calc.mjs's plan() at price=150, so a reader who runs
  // the numbers themselves gets the same answer this page states.
  assert.match(html, /\$37\.50/);
  assert.match(html, /\$112\.50/);
  assert.match(html, /\$21,762\.00/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = docsPage('robots.txt');
  const sitemap = docsPage('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /appointment-deposit-calculator\/<\/loc>/);
  assert.match(sitemap, /what-percentage-deposit-should-i-charge\.html/);
});
