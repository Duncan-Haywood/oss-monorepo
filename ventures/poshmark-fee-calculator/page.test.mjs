import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { calculateSale, compareOffer, INPUT_IDS, OFFER_INPUT_IDS } from './calc.mjs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = page('index.html');
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = /<script type="module">([\s\S]*)<\/script>/.exec(markup)[1];

test('calculator page is findable and usable without a build step', () => {
  assert.match(markup, /Poshmark Fee Calculator/);
  assert.match(markup, /calculateSale/);
  assert.match(markup, /<script type="application\/ld\+json">/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(markup, /href="LICENSE"/);
  assert.match(markup, /how-much-does-poshmark-take\.html/);
  assert.match(markup, /is-a-lower-offer-worth-it-on-poshmark\.html/);
  assert.match(markup, /not legal, tax, financial, or selling advice/);
  assert.match(markup, /not affiliated with, endorsed by, or sponsored by poshmark/i);
});

test('every input the arithmetic reads exists on the form', () => {
  for (const id of [...INPUT_IDS, ...OFFER_INPUT_IDS]) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
});

test('every form number input is one the arithmetic knows about', () => {
  const known = new Set([...INPUT_IDS, ...OFFER_INPUT_IDS, 'usageOptOut']);
  const formInputs = [...markup.matchAll(/<input id="([^"]+)"/g)].map(m => m[1]);
  for (const id of formInputs) {
    assert.ok(known.has(id), `#${id} is on the page but not read by calc.mjs`);
  }
});

test('every output slot the script writes exists in the markup', () => {
  for (const id of [
    'payoutOut', 'heroLabel', 'tierOut', 'commissionOut', 'effectiveRateOut',
    'costsOut', 'profitOut', 'targetOut', 'notes', 'errorList', 'output',
    'problems', 'exampleNote', 'offerResult', 'offerListedOut', 'offerOfferOut',
    'offerPriceDropOut', 'offerPayoutDropOut', 'offerNotes',
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
  assert.match(sitemap, /poshmark-fee-calculator\/<\/loc>/);
  assert.match(sitemap, /how-much-does-poshmark-take\.html/);
  assert.match(sitemap, /is-a-lower-offer-worth-it-on-poshmark\.html/);
});

test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = page('sitemap.xml');
  const dir = new URL('./', import.meta.url);
  for (const name of readdirSync(dir).filter(n => n.endsWith('.html'))) {
    if (name === 'index.html') {
      assert.match(sitemap, /poshmark-fee-calculator\/<\/loc>/);
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
  assert.ok(result.commission > 0);
});

test('the default offer comparison actually computes', () => {
  const defaults = Object.fromEntries(
    [...markup.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)].map(m => [m[1], m[2]]),
  );
  const result = compareOffer(defaults);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('the page opens on the worked example rather than an em-dash', () => {
  assert.ok(ids.has('exampleNote'));
  assert.match(script, /const example = calculateSale\(readInput\(\)\)/);
  assert.match(script, /render\(example\)/);
  assert.match(markup, /Worked example, not your listing yet/);
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

test('the $50 / $10 / $14.75 figures on the how-much page match the arithmetic', () => {
  const html = page('how-much-does-poshmark-take.html');
  const fifty = calculateSale({ salePrice: 50, itemCost: 0, otherCost: 0 });
  assert.equal(fifty.commission, 10);
  assert.equal(fifty.payout, 40);
  assert.match(html, /\$10\.00/);
  assert.match(html, /\$40\.00/);

  const ten = calculateSale({ salePrice: 10, itemCost: 0, otherCost: 0 });
  assert.equal(ten.commission, 2.95);
  assert.ok(Math.abs(ten.effectiveRate - 29.5) < 0.01);
  assert.match(html, /\$2\.95/);
  assert.match(html, /\$7\.05/);
  assert.match(html, /29\.5%/);

  const five = calculateSale({ salePrice: 5, itemCost: 0, otherCost: 0 });
  assert.ok(Math.abs(five.effectiveRate - 59) < 0.01);
  assert.match(html, /59%/);

  assert.match(html, /\$14\.75/);

  const atLine = calculateSale({ salePrice: 15, itemCost: 0, otherCost: 0 });
  const justUnder = calculateSale({ salePrice: 14.99, itemCost: 0, otherCost: 0 });
  assert.equal(atLine.payout, 12);
  assert.ok(Math.abs(justUnder.payout - 12.04) < 1e-9);
  assert.match(html, /\$12\.00/);
  assert.match(html, /\$12\.04/);
});

test('the offer-comparison page\'s worked examples match the arithmetic', () => {
  const html = page('is-a-lower-offer-worth-it-on-poshmark.html');

  const inTier = compareOffer({ listedPrice: 40, offerPrice: 35, itemCost: 0, otherCost: 0 });
  assert.ok(Math.abs(inTier.commissionDrop - 1) < 1e-9);
  assert.ok(Math.abs(inTier.payoutDrop - 4) < 1e-9);
  assert.match(html, /\$8\.00/);
  assert.match(html, /\$7\.00/);
  assert.match(html, /\$32\.00/);
  assert.match(html, /\$28\.00/);

  const flatTier = compareOffer({ listedPrice: 12, offerPrice: 8, itemCost: 0, otherCost: 0 });
  assert.ok(Math.abs(flatTier.commissionDrop) < 1e-9);
  assert.match(html, /\$9\.05/);
  assert.match(html, /\$5\.05/);

  const crossing = compareOffer({ listedPrice: 20, offerPrice: 14, itemCost: 0, otherCost: 0 });
  assert.ok(Math.abs(crossing.commissionDrop - 1.05) < 1e-9);
  assert.ok(Math.abs(crossing.payoutDrop - 4.95) < 1e-9);
  assert.match(html, /\$16\.00/);
  assert.match(html, /\$11\.05/);
  assert.match(html, /\$4\.95/);

  const boundary = compareOffer({ listedPrice: 15, offerPrice: 14.99, itemCost: 0, otherCost: 0 });
  assert.ok(boundary.payoutDrop < 0);
  assert.match(html, /\$12\.00/);
  assert.match(html, /\$12\.04/);
});

test('every published page carries Open Graph tags and the no-warranty clause', () => {
  const dir = new URL('./', import.meta.url);
  const pages = readdirSync(dir).filter(name => name.endsWith('.html'));
  assert.ok(pages.length >= 3, 'expected the calculator plus two guides');
  for (const name of pages) {
    const source = page(name);
    assert.match(source, /<meta property="og:title" content="[^"]+">/, `${name} is missing og:title`);
    assert.match(source, /<meta property="og:description" content="[^"]+">/, `${name} is missing og:description`);
    assert.match(source, /no warranty/i, `${name} is missing the no-warranty clause`);
  }
});

test('index links to the related marketplace fee compare hub', () => {
  assert.match(
    markup,
    /href="\.\.\/marketplace-fee-compare\/"/,
    'index should link ../marketplace-fee-compare/ so crawlers can reach the retail fee ranking',
  );
});

test('the incumbent-comparison page links back, names Poshmark\'s own resource honestly, and cross-links to real anchors', () => {
  const vsSeo = page('vs-poshmarks-how-it-works-page.html');
  assert.match(markup, /vs-poshmarks-how-it-works-page\.html/);
  assert.match(vsSeo, /<a href="\.\/">/);
  assert.match(vsSeo, /poshmark\.com\/what_is_poshmark/);
  assert.match(vsSeo, /\$2\.95/);
  assert.match(vsSeo, /20%/);
  assert.match(vsSeo, /October 3, 2024/);
  assert.match(vsSeo, /October 24, 2024/);
  assert.match(vsSeo, /5\.99%/);
  assert.match(vsSeo, /not affiliated with, endorsed by, or sponsored by Poshmark/i);
  assert.match(vsSeo, /No warranty/);
  assert.match(vsSeo, /no SLA/i);
  for (const anchor of ['sale-section', 'offer-compare']) {
    assert.match(vsSeo, new RegExp(`#${anchor}"`), `vs-page should link to #${anchor}`);
    assert.match(markup, new RegExp(`id="${anchor}"`), `index.html should have id="${anchor}"`);
  }
});
