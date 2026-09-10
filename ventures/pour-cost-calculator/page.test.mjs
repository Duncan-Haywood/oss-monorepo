import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ALL_INPUT_IDS, REQUIRED_INGREDIENT_IDS, OPTIONAL_INGREDIENT_IDS } from './calc.mjs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = page('index.html');
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = /<script type="module">([\s\S]*)<\/script>/.exec(markup)[1];

test('calculator page is findable and usable without a build step', () => {
  assert.match(markup, /Pour Cost Calculator/);
  assert.match(markup, /calculatePourCost/);
  assert.match(markup, /<script type="application\/ld\+json">/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(markup, /href="LICENSE"/);
  assert.match(markup, /how-to-calculate-pour-cost\.html/);
  // The disclaimer has to name the specific things this tool looks like it is
  // doing and is not: alcohol service, not just the usual tax/legal set.
  assert.match(markup, /alcohol-service/);
  assert.match(markup, /pour-size or service law/);
});

test('every required and optional input the arithmetic reads exists on the form', () => {
  for (const id of ALL_INPUT_IDS) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
});

test('every form input is one the arithmetic knows about', () => {
  const known = new Set([...ALL_INPUT_IDS, 'usageOptOut']);
  const formInputs = [...markup.matchAll(/<input id="([^"]+)"/g)].map(m => m[1]);
  for (const id of formInputs) {
    assert.ok(known.has(id), `#${id} is on the page but not read by calc.mjs`);
  }
});

test('the page reads the whole form, required and optional fields alike', () => {
  assert.match(script, /ALL_INPUT_IDS\.map\(id => \[id, el\(id\)\.value\]\)/);
  assert.match(script, /for \(const id of ALL_INPUT_IDS\)/);
  for (const id of OPTIONAL_INGREDIENT_IDS) {
    assert.ok(!REQUIRED_INGREDIENT_IDS.includes(id), `${id} must stay optional`);
  }
});

test('every output slot the script writes exists in the markup', () => {
  for (const id of [
    'pourCostPercent', 'heroLabel', 'recipeCost', 'menuPriceOut', 'grossProfitPerDrink',
    'grossProfitPercent', 'targetPourCostOut', 'targetMenuPrice', 'priceGap',
    'overpourPerDrink', 'pourCostWithOverpour', 'overpourYear', 'notes',
    'errorList', 'output', 'problems', 'empty',
  ]) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
});

test('results are written as text, never as markup', () => {
  // Every value shown comes from numbers the visitor typed. Building any of
  // it with innerHTML would make the form a self-XSS route.
  assert.doesNotMatch(script, /innerHTML/);
  assert.match(script, /textContent/);
});

test('the calculator makes no network request of its own', () => {
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|WebSocket/);
});

test('robots and sitemap let crawlers find both pages', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /pour-cost-calculator\/<\/loc>/);
  assert.match(sitemap, /how-to-calculate-pour-cost\.html/);
});

test('the worked example the page ships with actually computes', async () => {
  const { calculatePourCost } = await import('./calc.mjs');
  const defaults = Object.fromEntries(
    [...markup.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)].map(m => [m[1], m[2]]),
  );
  const result = calculatePourCost(defaults);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.ok(result.recipeCost > 0);
  assert.ok(result.pourCostPercent > 0);
});

test('the page opens on the worked example rather than an em-dash', async () => {
  assert.ok(ids.has('exampleNote'), 'the example result needs a note marking it as an example');
  assert.match(script, /const example = calculatePourCost\(readInput\(\)\)/);
  assert.match(script, /render\(example\)/);
  assert.match(markup, /not yours yet/, 'the note must not let the example read as the visitor’s own recipe');
});

test('page wires save, forget, and a shareable link that wins over the saved draft', () => {
  for (const id of ['save', 'forget', 'copyLink', 'saveStatus']) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
  assert.match(script, /import \{ encodeInputs, decodeInputs \} from '\.\/share\.mjs'/);

  const draftIndex = script.indexOf("localStorage.getItem(DRAFT_KEY)");
  const linkIndex = script.indexOf('decodeInputs(location.hash');
  assert.ok(
    draftIndex !== -1 && linkIndex !== -1 && draftIndex < linkIndex,
    'the shared-link restore must run after the saved-draft restore so a link wins',
  );
  assert.match(script, /el\('copyLink'\)\.addEventListener\('click'/);
  assert.match(script, /count\('link_copied'\)/);
  assert.match(script, /count\('recipe_saved'\)/);
});

test('a restored draft or link opens on real figures, not the example note', () => {
  assert.match(script, /current = restored \? example : null/);
  assert.match(script, /showingExample = !restored/);
});

test('the FAQ answer about uploads names the save and share controls honestly', () => {
  assert.match(markup, /Copy shareable link button puts the same numbers in the page.s URL fragment/);
});

test('opening the page counts nothing', () => {
  const initial = /\(\(\) => \{[\s\S]*?\}\)\(\);/.exec(script);
  assert.ok(initial, 'expected the load-time render to be a self-calling block');
  assert.doesNotMatch(initial[0], /count\(/, 'a page load is not a calculation');
});

test('the worked comparison in the how-to page matches what the calculator computes', async () => {
  // Prose and arithmetic drift apart silently, so every figure quoted in the
  // worked example is recomputed here from the same numbers used in the copy,
  // rather than asserted by eye.
  const { calculatePourCost } = await import('./calc.mjs');
  const html = page('how-to-calculate-pour-cost.html');
  const result = calculatePourCost({
    primaryBottleCost: 24, primaryBottleSizeOz: 33.8, primaryOzUsed: 1.5,
    modifierBottleCost: 20, modifierBottleSizeOz: 25.4, modifierOzUsed: 0.75,
    mixerBottleCost: 6, mixerBottleSizeOz: 32, mixerOzUsed: 1,
    menuPrice: 12, targetPourCostPercent: 20, drinksPerWeek: 200, overPourOzPerDrink: 0.25,
  });
  assert.match(html, new RegExp(`\\$${result.recipeCost.toFixed(2)}`));
  assert.match(html, new RegExp(`${result.pourCostPercent.toFixed(1)}%`));
  assert.match(html, new RegExp(`\\$${result.targetMenuPrice.toFixed(2)}`));
  assert.match(html, new RegExp(`\\$${result.priceGapVsTarget.toFixed(2)}`));
  assert.match(html, new RegExp(`${result.pourCostPercentWithOverpour.toFixed(1)}%`));
  assert.ok(html.includes(`$${Math.round(result.overPourCostPerYear).toLocaleString('en-US')}`));
});

test('every published page carries Open Graph tags and the no-warranty clause', () => {
  const dir = new URL('./', import.meta.url);
  const pages = readdirSync(dir).filter(name => name.endsWith('.html'));
  assert.ok(pages.length >= 2, 'expected at least the 2 known pages in this venture');
  for (const name of pages) {
    const source = page(name);
    assert.match(source, /<meta property="og:title" content="[^"]+">/, `${name} is missing og:title`);
    assert.match(source, /<meta property="og:description" content="[^"]+">/, `${name} is missing og:description`);
    assert.match(source, /no warranty/i, `${name} is missing the no-warranty clause`);
  }
});

// Closest sibling: the same cost-vs-price arithmetic on the kitchen side
// rather than the bar. Related-tool chrome rotates alphabetically inside a
// subcategory, so without an explicit one-hop a crawler landing here may never
// reach the food menu tool.
test('index links one hop to the menu-engineering-calculator sibling', () => {
  assert.match(
    markup,
    /href="\.\.\/menu-engineering-calculator\/"/,
    'index must link ../menu-engineering-calculator/ so crawlers reach the menu tool in one hop',
  );
  assert.match(markup, /menu engineering calculator/i);
});
