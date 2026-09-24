import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { calculateSale, compareSchedules, INPUT_IDS, TOGGLE_IDS } from './calc.mjs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = page('index.html');
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = /<script type="module">([\s\S]*)<\/script>/.exec(markup)[1];

test('calculator page is findable and usable without a build step', () => {
  assert.match(markup, /Mercari Fee Calculator/);
  assert.match(markup, /calculateSale/);
  assert.match(markup, /<script type="application\/ld\+json">/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(markup, /href="LICENSE"/);
  assert.match(markup, /how-much-does-mercari-take\.html/);
  assert.match(markup, /not legal, tax, financial, or selling advice/);
  assert.match(markup, /not affiliated with, endorsed by, or sponsored by mercari/i);
});

test('every input the arithmetic reads exists on the form', () => {
  for (const id of [...INPUT_IDS, ...TOGGLE_IDS]) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
});

test('every form number/checkbox input is one the arithmetic knows about', () => {
  const known = new Set([...INPUT_IDS, ...TOGGLE_IDS, 'usageOptOut']);
  const formInputs = [...markup.matchAll(/<input id="([^"]+)"/g)].map(m => m[1]);
  for (const id of formInputs) {
    assert.ok(known.has(id), `#${id} is on the page but not read by calc.mjs`);
  }
});

test('every output slot the script writes exists in the markup', () => {
  for (const id of [
    'payoutOut', 'heroLabel', 'sellingFeeOut', 'processingFeeOut', 'effectiveRateOut',
    'buyerProtectionOut', 'costsOut', 'profitOut', 'targetOut', 'notes', 'errorList',
    'output', 'problems', 'exampleNote', 'compareResult', 'compareCurrentOut',
    'compareLegacyOut', 'compareDiffOut', 'compareNotes',
  ]) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
});

test('results are written as text, never as markup', () => {
  assert.doesNotMatch(script, /innerHTML/);
  assert.match(script, /textContent/);
});

test('the calculator makes no network request of its own', () => {
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|WebSocket/);
});

test('robots and sitemap let crawlers find every page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /mercari-fee-calculator\/<\/loc>/);
  assert.match(sitemap, /how-much-does-mercari-take\.html/);
});

test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = page('sitemap.xml');
  const dir = new URL('./', import.meta.url);
  for (const name of readdirSync(dir).filter(n => n.endsWith('.html'))) {
    if (name === 'index.html') {
      assert.match(sitemap, /mercari-fee-calculator\/<\/loc>/);
      continue;
    }
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

test('the worked example the page ships with actually computes', () => {
  const defaults = Object.fromEntries(
    [...markup.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)].map(m => [m[1], m[2]]),
  );
  const result = calculateSale(defaults);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.ok(result.sellingFee > 0);
});

test('the default schedule comparison actually computes', () => {
  const defaults = Object.fromEntries(
    [...markup.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)].map(m => [m[1], m[2]]),
  );
  const result = compareSchedules(defaults);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('the page opens on the worked example rather than an em-dash', () => {
  assert.ok(ids.has('exampleNote'));
  assert.match(script, /const example = calculateSale\(readInput\(\)\)/);
  assert.match(script, /render\(example\)/);
  assert.match(markup, /Worked example, not your listing yet/);
});

test('page wires save, forget, and a shareable link that wins over the saved draft', () => {
  for (const id of ['save', 'forget', 'copyLink', 'saveStatus']) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
  assert.match(script, /import \{ FIELD_IDS, encodeInputs, decodeInputs, formValues \} from '\.\/share\.mjs'/);

  const draftIndex = script.indexOf("localStorage.getItem(DRAFT_KEY)");
  const linkIndex = script.indexOf('decodeInputs(location.hash');
  assert.ok(
    draftIndex !== -1 && linkIndex !== -1 && draftIndex < linkIndex,
    'the shared-link restore must run after the saved-draft restore so a link wins',
  );
  assert.match(script, /el\('copyLink'\)\.addEventListener\('click'/);
  assert.match(script, /count\('link_copied'\)/);
  assert.match(script, /count\('numbers_saved'\)/);
});

test('the FAQ answer about uploads names the save and share controls honestly', () => {
  assert.match(markup, /Copy shareable link button puts the same numbers in the page.s URL fragment/);
});

test('opening the page counts nothing', () => {
  const initial = /\(\(\) => \{[\s\S]*?\}\)\(\);/.exec(script);
  assert.ok(initial, 'expected the load-time render to be a self-calling block');
  assert.doesNotMatch(initial[0], /count\(/, 'a page load is not a calculation');
});

test('every FAQPage question is also visible copy', () => {
  const blocks = [...markup.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const faq = blocks.map(b => JSON.parse(b[1])).find(j => j['@type'] === 'FAQPage');
  assert.ok(faq, 'expected a FAQPage JSON-LD block');
  for (const entity of faq.mainEntity) {
    assert.match(markup, new RegExp(entity.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const snippet = entity.acceptedAnswer.text.slice(0, 40);
    assert.match(markup, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('the worked-example figures on the how-much page match the arithmetic', () => {
  const html = page('how-much-does-mercari-take.html');

  const fifty = calculateSale({ itemPrice: 50, itemCost: 0, otherCost: 0 });
  assert.equal(fifty.sellingFee, 5);
  assert.equal(fifty.payout, 45);
  assert.match(html, /\$5\.00/);
  assert.match(html, /\$45\.00/);

  const withShipping = calculateSale({ itemPrice: 20, buyerShipping: 6, itemCost: 0, otherCost: 0 });
  assert.ok(Math.abs(withShipping.sellingFee - 2.6) < 1e-9);
  assert.ok(Math.abs(withShipping.payout - 23.4) < 1e-9);
  assert.match(html, /\$2\.60/);
  assert.match(html, /\$23\.40/);

  const legacy = calculateSale({ itemPrice: 50, itemCost: 0, otherCost: 0, legacySchedule: true });
  assert.ok(Math.abs(legacy.processingFee - 1.95) < 1e-9);
  assert.ok(Math.abs(legacy.mercariFee - 6.95) < 1e-9);
  assert.ok(Math.abs(legacy.payout - 43.05) < 1e-9);
  assert.match(html, /\$6\.95|\$1\.95/);
  assert.match(html, /\$43\.05/);
});

test('every published page carries Open Graph tags and the no-warranty clause', () => {
  const dir = new URL('./', import.meta.url);
  const pages = readdirSync(dir).filter(name => name.endsWith('.html'));
  assert.ok(pages.length >= 2, 'expected the calculator plus at least one guide');
  for (const name of pages) {
    const source = page(name);
    assert.match(source, /<meta property="og:title" content="[^"]+">/, `${name} is missing og:title`);
    assert.match(source, /<meta property="og:description" content="[^"]+">/, `${name} is missing og:description`);
    assert.match(source, /no warranty/i, `${name} is missing the no-warranty clause`);
  }
});

test('index links to the related seller-tool calculators', () => {
  assert.match(markup, /href="\.\.\/where-to-sell-calculator\/"/);
  assert.match(markup, /href="\.\.\/marketplace-fee-compare\/"/);
  assert.match(markup, /href="\.\.\/poshmark-fee-calculator\/"/);
  assert.match(markup, /href="\.\.\/depop-fee-calculator\/"/);
});

test('an edit updates the payout on screen rather than leaving the last one standing', () => {
  const listener = /el\('saleForm'\)\.addEventListener\('input', \(\) => \{[\s\S]*?\n    \}\);/.exec(script);
  assert.ok(listener, 'expected an input listener on the sale form');
  assert.match(listener[0], /calculateSale\(readInput\(\)\)/);
  assert.match(listener[0], /render\(result\)/);
  assert.doesNotMatch(listener[0], /showProblems/);
  assert.doesNotMatch(listener[0], /count\(/);
});

test('toggling the legacy-schedule checkbox also updates the payout on screen', () => {
  const listener = /el\('saleForm'\)\.addEventListener\('change', \(\) => \{[\s\S]*?\n    \}\);/.exec(script);
  assert.ok(listener, 'expected a change listener on the sale form for the checkbox');
  assert.match(listener[0], /calculateSale\(readInput\(\)\)/);
  assert.match(listener[0], /render\(result\)/);
});
