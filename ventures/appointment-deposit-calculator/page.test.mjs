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

test('the page collects both no-show rates the net-revenue model needs', () => {
  assert.match(page, /name="noShowWithout"/);
  assert.match(page, /name="noShowWith"/);
  // Both must be inside the one form the script reads, or FormData never sees
  // them and the panel silently falls back to the built-in defaults.
  const form = page.slice(page.indexOf('id="deposit-form"'), page.indexOf('</form>'));
  assert.match(form, /name="noShowWithout"/);
  assert.match(form, /name="noShowWith"/);
});

test('the page renders every field the net-revenue panel writes to', () => {
  for (const id of ['revenue-without', 'revenue-with', 'net-change', 'break-even', 'net-effect']) {
    assert.match(page, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  const app = readFileSync(new URL('./app.mjs', import.meta.url), 'utf8');
  for (const id of ['revenue-without', 'revenue-with', 'net-change', 'break-even', 'net-effect']) {
    assert.match(app, new RegExp(`#${id}`), `app.mjs never writes #${id}`);
  }
  assert.match(app, /netEffectNote/);
});

test('the net-revenue panel is inside the results section, so it stays hidden until submit', () => {
  const results = page.slice(page.indexOf('id="results"'), page.indexOf('</section>', page.indexOf('id="results"')));
  assert.match(results, /id="net-change"/);
  assert.match(results, /Does the deposit pay for itself\?/);
});

test('the outcome event is one of two buckets and carries no amounts', () => {
  const app = readFileSync(new URL('./app.mjs', import.meta.url), 'utf8');
  assert.match(app, /deposit_pays_off/);
  assert.match(app, /deposit_costs_money/);
  // Every event name is a bare string literal: no template literal and no
  // concatenation, so no price, rate or amount can be interpolated into one.
  const calls = app.match(/recordUsage\([^)]*\)/g) || [];
  assert.ok(calls.length >= 3, `expected the calculate, outcome and copy events, saw ${calls.length}`);
  const names = new Set();
  for (const call of calls) {
    assert.doesNotMatch(call, /[`+]/, `recordUsage builds its event name dynamically: ${call}`);
    for (const [, name] of call.matchAll(/'([^']*)'/g)) names.add(name);
  }
  assert.deepEqual(
    [...names].sort(),
    ['deposit_calculated', 'deposit_costs_money', 'deposit_pays_off', 'policy_copied', 'share_link_copied', 'shared_link_opened'],
  );
});

test('the FAQ answers the net-revenue question in both the copy and the schema', () => {
  assert.match(page, /<h3>Does a deposit actually make me more money\?<\/h3>/);
  assert.match(page, /<h3>What is the break-even booking rate\?<\/h3>/);
  const schema = JSON.parse(page.match(/"@type":"FAQPage".*?\}\]\}/s)[0].replace(/^/, '{') + '');
  const names = schema.mainEntity.map((q) => q.name);
  assert.ok(names.includes('Does a deposit actually make me more money?'), names.join(' | '));
  assert.ok(names.includes('What is the break-even booking rate?'), names.join(' | '));
  // Every schema question must have a matching visible heading, or the page
  // claims content to a crawler that a reader cannot find.
  for (const name of names) {
    assert.ok(page.includes(`<h3>${name}</h3>`), `no visible <h3> for schema question: ${name}`);
  }
});

test('the page does not claim a deposit is always worth taking', () => {
  assert.doesNotMatch(page, /deposits always pay|guaranteed to increase|will increase your revenue/i);
  assert.match(page, /assumes a missed appointment earns nothing and the slot is not refilled/);
});
