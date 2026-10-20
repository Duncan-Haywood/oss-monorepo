import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { calculateSale, feeLadder, INPUT_IDS } from './calc.mjs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = page('index.html');
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = /<script type="module">([\s\S]*)<\/script>/.exec(markup)[1];

test('calculator page is findable and usable without a build step', () => {
  assert.match(markup, /Discogs Fee Calculator/);
  assert.match(markup, /<script type="application\/ld\+json">/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(markup, /href="LICENSE"/);
  assert.match(markup, /how-much-does-discogs-take\.html/);
  assert.match(markup, /not legal, tax, financial, or selling advice/);
  assert.match(markup, /not affiliated with, endorsed by, or sponsored by discogs/i);
});

test('every input the arithmetic reads exists on the form, and nothing else is on it', () => {
  for (const id of INPUT_IDS) assert.ok(ids.has(id), `missing #${id}`);
  const known = new Set([...INPUT_IDS, 'usageOptOut']);
  for (const id of [...markup.matchAll(/<input id="([^"]+)"/g)].map(m => m[1])) {
    assert.ok(known.has(id), `#${id} is on the page but not read by calc.mjs`);
  }
});

test('every output slot the script writes exists in the markup', () => {
  for (const id of [
    'payoutOut', 'heroLabel', 'sellingFeeOut', 'processingFeeOut', 'effectiveRateOut', 'costsOut',
    'profitOut', 'targetOut', 'notes', 'errorList', 'output', 'problems', 'exampleNote', 'ladderBody',
    'whereToSellLink',
  ]) assert.ok(ids.has(id), `missing #${id}`);
});

test('results are written as text, never as markup, and nothing is fetched', () => {
  assert.doesNotMatch(script, /innerHTML/);
  assert.match(script, /textContent/);
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|WebSocket/);
});

test('robots and sitemap let crawlers find every page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /discogs-fee-calculator\/<\/loc>/);
  for (const name of readdirSync(new URL('./', import.meta.url)).filter(n => n.endsWith('.html') && n !== 'index.html')) {
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

test('the worked example the page ships with computes, and the ladder with it', () => {
  const defaults = Object.fromEntries(
    [...markup.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)].map(m => [m[1], m[2]]),
  );
  const result = calculateSale(defaults);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.ok(result.sellingFee > 0);
  assert.equal(feeLadder(defaults).ok, true);
});

test('the page opens on the worked example, counts nothing on load, and updates on every edit', () => {
  assert.match(script, /const example = calculateSale\(readInput\(\)\)/);
  assert.match(markup, /Worked example, not your listing yet/);
  const initial = /\(\(\) => \{[\s\S]*?\}\)\(\);/.exec(script);
  assert.ok(initial);
  assert.doesNotMatch(initial[0], /count\(/);
  assert.match(script, /\['input', 'change'\]/);
});

test('page wires save, forget, and a shareable link that wins over the saved draft', () => {
  for (const id of ['save', 'forget', 'copyLink', 'saveStatus']) assert.ok(ids.has(id), `missing #${id}`);
  assert.ok(script.indexOf('localStorage.getItem(DRAFT_KEY)') < script.indexOf('decodeInputs(location.hash'));
  assert.match(script, /count\('link_copied'\)/);
});

test('every FAQPage question is also visible copy', () => {
  const blocks = [...markup.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const faq = blocks.map(b => JSON.parse(b[1])).find(j => j['@type'] === 'FAQPage');
  assert.ok(faq);
  for (const entity of faq.mainEntity) {
    assert.ok(markup.includes(entity.name.replace(/'/g, "'")), entity.name);
    assert.ok(markup.includes(entity.acceptedAnswer.text.slice(0, 40).replace(/&/g, '&amp;')), entity.name);
  }
});

test('the figures on the guide pages match the arithmetic', () => {
  const html = page('how-much-does-discogs-take.html');
  const fifty = calculateSale({ itemPrice: 50 });
  assert.equal(fifty.sellingFee, 4.5);
  assert.ok(Math.abs(fifty.processingFee - 1.75) < 1e-9);
  assert.ok(Math.abs(fifty.payout - 43.75) < 1e-9);
  for (const text of ['$4.50', '$1.75', '$43.75']) assert.ok(html.includes(text), text);

  const shipped = calculateSale({ itemPrice: 20, buyerShipping: 6 });
  assert.ok(Math.abs(shipped.sellingFee - 2.34) < 1e-9);
  assert.ok(Math.abs(shipped.processingFee - 1.054) < 1e-9);
  assert.ok(Math.abs(shipped.payout - 22.606) < 1e-9);
  for (const text of ['$2.34', '$1.05', '$22.61']) assert.ok(html.includes(text), text);

  const single = calculateSale({ itemPrice: 3 });
  assert.ok(Math.abs(single.effectiveRate - 21.9) < 0.05);
  assert.match(html, /about 22%/);
});

test('every published page carries Open Graph tags and the no-warranty clause', () => {
  for (const name of readdirSync(new URL('./', import.meta.url)).filter(n => n.endsWith('.html'))) {
    const source = page(name);
    assert.match(source, /<meta property="og:title" content="[^"]+">/, name);
    assert.match(source, /<meta property="og:description" content="[^"]+">/, name);
    assert.match(source, /no warranty/i, name);
  }
});

test('index links to the sibling channel tools', () => {
  for (const slug of ['where-to-sell-calculator', 'reverb-fee-calculator', 'ebay-fee-calculator']) {
    assert.match(markup, new RegExp(`href="\\.\\./${slug}/"`));
  }
});
