import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('./tattoo-deposit-and-touchup-calculator.html', import.meta.url), 'utf8');

test('page carries the no-warranty clause and a local-only privacy line', () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /not legal, tax, or financial advice/i);
  assert.match(page, /never uploaded/i);
  assert.match(page, /Best-effort hosting, no SLA/);
});

test('page wires the touch-up calculator and usage modules', () => {
  assert.match(page, /id="tattoo-form"/);
  assert.match(page, /src="tattoo-app\.mjs"/);
  const app = readFileSync(new URL('./tattoo-app.mjs', import.meta.url), 'utf8');
  assert.match(app, /from '\.\/touchup\.mjs'/);
  assert.match(app, /from '\.\/usage\.mjs'/);
  assert.match(app, /touchup_calculated/);
  assert.match(app, /policy_copied/);
});

test('page does not recommend a deposit percent, window length, or touch-up price', () => {
  assert.doesNotMatch(page, /you should charge|must take a deposit|recommended deposit|recommended window/i);
});

test('index links to the tattoo niche page', () => {
  const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(index, /tattoo-deposit-and-touchup-calculator\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = readFileSync(new URL('./robots.txt', import.meta.url), 'utf8');
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /tattoo-deposit-and-touchup-calculator\.html/);
});

test('the form offers all three touch-up pricing modes and their fields', () => {
  assert.match(page, /name="pricingMode"/);
  assert.match(page, /value="percent"/);
  assert.match(page, /value="flat"/);
  assert.match(page, /value="hourly"/);
  assert.match(page, /name="touchupPercent"/);
  assert.match(page, /name="touchupFlat"/);
  assert.match(page, /name="hourlyRate"/);
  assert.match(page, /name="touchupHours"/);
});

test('the app toggles pricing-mode fields rather than showing all three at once', () => {
  const app = readFileSync(new URL('./tattoo-app.mjs', import.meta.url), 'utf8');
  assert.match(app, /updateModeFields/);
  assert.match(app, /data-mode="percent"/);
  assert.match(app, /data-mode="flat"/);
  assert.match(app, /data-mode="hourly"/);
});

test('the page renders every field the results panel writes to', () => {
  for (const id of ['deposit', 'balance', 'window-status', 'touchup-full-price', 'amount-due', 'touchup-note']) {
    assert.match(page, new RegExp(`id="${id}"`), `missing #${id}`);
  }
  const app = readFileSync(new URL('./tattoo-app.mjs', import.meta.url), 'utf8');
  for (const id of ['deposit', 'balance', 'window-status', 'touchup-full-price', 'amount-due', 'touchup-note']) {
    assert.match(app, new RegExp(`#${id}`), `tattoo-app.mjs never writes #${id}`);
  }
});

test('the results panel is inside the results section, so it stays hidden until submit', () => {
  const results = page.slice(page.indexOf('id="results"'), page.lastIndexOf('</section>'));
  assert.match(results, /id="amount-due"/);
  assert.match(results, /This client's touch-up/);
});

test('every recorded event name is a bare string literal, so no amount or note can leak into it', () => {
  const app = readFileSync(new URL('./tattoo-app.mjs', import.meta.url), 'utf8');
  const calls = app.match(/recordUsage\([^)]*\)/g) || [];
  assert.ok(calls.length >= 3, `expected at least the calculate, outcome, and copy events, saw ${calls.length}`);
  const names = new Set();
  for (const call of calls) {
    assert.doesNotMatch(call, /[`+]/, `recordUsage builds its event name dynamically: ${call}`);
    for (const [, name] of call.matchAll(/'([^']*)'/g)) names.add(name);
  }
  assert.deepEqual(
    [...names].sort(),
    ['policy_copied', 'pricing_mode_changed', 'share_link_copied', 'shared_link_opened', 'touchup_calculated', 'touchup_within_window', 'touchup_past_window'].sort(),
  );
});

test('the FAQ schema questions each have a matching visible heading', () => {
  const schema = JSON.parse(page.match(/"@type":"FAQPage".*?\}\]\}/s)[0].replace(/^/, '{') + '');
  const names = schema.mainEntity.map((q) => q.name);
  assert.ok(names.length >= 3, names.join(' | '));
  for (const name of names) {
    assert.ok(page.includes(`<h3>${name}</h3>`), `no visible <h3> for schema question: ${name}`);
  }
});

test('the page does not claim to know the shop\'s own touch-up policy', () => {
  assert.match(page, /depends entirely on the shop's own policy/);
});
