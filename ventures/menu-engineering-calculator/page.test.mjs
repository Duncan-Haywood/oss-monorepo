import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMenu, CLASSES, MAX_ITEMS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guide = readFileSync(new URL('./how-menu-engineering-works.html', import.meta.url), 'utf8');

/** The page's JSON-LD blocks, parsed. */
function structuredData() {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(match => JSON.parse(match[1]));
}

/**
 * Visible text with entities and whitespace normalised, so a JSON-LD answer
 * and the paragraph it mirrors can be compared for real rather than defeated
 * by `&mdash;` on one side and `—` on the other.
 */
function normalise(text) {
  return text
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '’')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

test('the page imports the calculator and the usage counter from their own modules', () => {
  assert.match(html, /import \{ calculateMenu, MAX_ITEMS, CLASS_LABELS \} from '\.\/calc\.mjs'/);
  assert.match(html, /import \{ recordUsage, readOptOut, writeOptOut \} from '\.\/usage\.mjs'/);
  // The page stores and restores the opt-out itself: the module takes the
  // choice as an argument, so nothing else would remember it.
  assert.match(html, /readOptOut\(localStorage\)/);
  assert.match(html, /writeOptOut\(localStorage, /);
});

test('the menu-level fields each have an input the calculator reads by the same id', () => {
  for (const id of ['periodWeeks', 'targetFoodCostPercent', 'priceIncrease']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('every item input is built with an accessible name naming its column and row', () => {
  // The 24 axe `label` violations this catalogue shipped were all table inputs
  // whose only label was a column header, announced as "edit, number". This
  // asserts the row builder sets an explicit name on every field it creates.
  assert.match(html, /input\.setAttribute\('aria-label', `\$\{field\.label\}, row \$\{index \+ 1\}`\)/);
  for (const label of ['Dish name', 'Units sold', 'Plate food cost in dollars', 'Menu price in dollars']) {
    assert.ok(html.includes(`label: '${label}'`), `no accessible name defined for ${label}`);
  }
});

test('the worked example the page opens on fills all four quadrants', () => {
  const example = html.match(/const EXAMPLE = \[([\s\S]*?)\];/);
  assert.ok(example, 'the worked example is missing from the page');
  const items = [...example[1].matchAll(
    /name: '([^']+)', unitsSold: '([\d.]+)', foodCost: '([\d.]+)', menuPrice: '([\d.]+)'/g,
  )].map(([, name, unitsSold, foodCost, menuPrice]) => ({
    name, unitsSold: Number(unitsSold), foodCost: Number(foodCost), menuPrice: Number(menuPrice),
  }));
  assert.equal(items.length, 4);

  const result = calculateMenu({ items, periodWeeks: 4, targetFoodCostPercent: 30, priceIncrease: 1 });
  assert.equal(result.ok, true);
  // A first visit is the only chance to show what the four names mean, so each
  // quadrant has to be occupied by the example rather than merely defined.
  for (const name of CLASSES) {
    assert.equal(result.counts[name], 1, `the worked example leaves the ${name} quadrant empty`);
  }
});

test('the page defaults match the ones the worked example was checked against', () => {
  assert.match(html, /id="periodWeeks"[^>]*value="4"/);
  assert.match(html, /id="targetFoodCostPercent"[^>]*value="30"/);
  assert.match(html, /id="priceIncrease"[^>]*value="1"/);
});

test('the result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid input clears the sorted table instead of leaving stale rows beside an error', () => {
  const script = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(script, 'app script not found');
  const problems = script[1].match(/function showProblems\(errors\) \{([\s\S]*?)\n    \}/);
  assert.ok(problems, 'showProblems() not found');
  assert.match(problems[1], /el\('output'\)\.hidden = true/, 'the figures are left visible on a rejected input');
  assert.match(problems[1], /el\('outRows'\)\.replaceChildren\(\)/, 'the sorted table keeps stale rows on a rejected input');
  assert.match(problems[1], /el\('problems'\)\.hidden = false/, 'the errors are never shown');
});

test('the row builder refuses to exceed the calculator’s own cap', () => {
  assert.match(html, /if \(rowCount >= MAX_ITEMS\) return null/);
  assert.ok(MAX_ITEMS > 0);
});

test('each quadrant is named and explained in the results panel', () => {
  for (const word of ['Stars', 'Plowhorses', 'Puzzles', 'Dogs']) {
    assert.ok(html.includes(word), `${word} is not named in the results panel`);
  }
});

test('the thresholds that produced the classification are shown, not just the verdict', () => {
  assert.match(html, /id="averageCm"/);
  assert.match(html, /id="popularityBar"/);
  assert.ok(html.includes('Average CM a cover'));
  assert.ok(html.includes('Popularity bar'));
});

test('usage counting is wired for the three events the page can distinguish', () => {
  assert.match(html, /count\('menu_classified'\)/);
  assert.match(html, /count\('price_move_sized'\)/);
  assert.match(html, /count\('dogs_found'\)/);
});

test('the usage counter can be turned off from the page', () => {
  assert.match(html, /id="usageOptOut"/);
  assert.match(html, /recordUsage\(localStorage, el\('usageOptOut'\)\.checked, event\)/);
});

test('the no-warranty, hosting and privacy clauses are all on the page', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, tax, accounting, insurance, or financial advice/);
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
  assert.match(html, /<strong>Nothing leaves your browser\.<\/strong>/);
  assert.match(html, /never uploaded/);
});

test('the page carries the sponsor link and a LICENSE link', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
});

test('the page declares a canonical URL and both structured-data blocks', () => {
  assert.match(html, /<link rel="canonical" href="\.\/">/);
  const types = structuredData().map(block => block['@type']);
  assert.deepEqual(types.sort(), ['FAQPage', 'SoftwareApplication']);
});

test('every FAQ answer in the structured data is also visible on the page', () => {
  const faq = structuredData().find(block => block['@type'] === 'FAQPage');
  const visible = normalise(html);
  assert.ok(faq.mainEntity.length >= 6, 'expected a substantive FAQ');
  for (const entry of faq.mainEntity) {
    assert.ok(
      visible.includes(normalise(entry.name)),
      `FAQ question is in the JSON-LD but not visible on the page: ${entry.name}`,
    );
    assert.ok(
      visible.includes(normalise(entry.acceptedAnswer.text)),
      `FAQ answer is in the JSON-LD but not visible on the page: ${entry.name}`,
    );
  }
});

test('the price-move figure never appears without the assumption that qualifies it', () => {
  const visible = normalise(html);
  assert.ok(visible.includes('same number of people order the same items at the new price'));
});

test('the guide page exists, is linked from the calculator, and links back', () => {
  assert.match(html, /href="\.\/how-menu-engineering-works\.html"/);
  assert.match(guide, /href="\.\/"/);
  assert.match(guide, /<strong>No warranty\.<\/strong>/);
  assert.match(guide, /<link rel="canonical"/);
});

test('the guide states the two thresholds the calculator actually uses', () => {
  const text = normalise(guide);
  assert.ok(text.includes('70%'), 'the popularity convention is not stated in the guide');
  assert.ok(/weighted/i.test(text), 'the guide does not say the margin bar is weighted');
});

test('the calculator links to its sibling on the bar side', () => {
  assert.match(html, /href="\.\.\/pour-cost-calculator\/"/);
});

test('index links to the delivery app margin calculator', () => {
  assert.match(html, /href="\.\.\/delivery-app-margin-calculator\/"/, 'the sibling-tool link is missing');
});

test('no wide element can push the page sideways on a phone', () => {
  // Both tables are wider than a 375px viewport by design; each has to scroll
  // inside its own container rather than scrolling the document.
  const wraps = html.match(/<div class="table-wrap">/g) ?? [];
  assert.equal(wraps.length, 2, 'expected both tables to sit in a scroll container');
  assert.match(html, /\.table-wrap \{ overflow-x: auto; \}/);
});
