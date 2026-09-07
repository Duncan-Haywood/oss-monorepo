import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { calculateSale, compareFreeShipping, INPUT_IDS } from './calc.mjs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = page('index.html');
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = /<script type="module">([\s\S]*)<\/script>/.exec(markup)[1];

test('calculator page is findable and usable without a build step', () => {
  assert.match(markup, /Whatnot Seller Payout Calculator/);
  assert.match(markup, /calculateSale/);
  assert.match(markup, /<script type="application\/ld\+json">/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(markup, /href="LICENSE"/);
  assert.match(markup, /how-much-does-whatnot-take\.html/);
  assert.match(markup, /should-i-offer-free-shipping-on-whatnot\.html/);
  assert.match(markup, /not legal, tax, financial, or selling advice/);
});

test('every input the arithmetic reads exists on the form', () => {
  for (const id of INPUT_IDS) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
  assert.ok(ids.has('giveaway'));
  assert.ok(ids.has('categoryPreset'));
});

test('every form number input is one the arithmetic knows about', () => {
  const known = new Set([...INPUT_IDS, 'usageOptOut']);
  const formInputs = [...markup.matchAll(/<input id="([^"]+)"/g)].map(m => m[1]);
  for (const id of formInputs) {
    if (id === 'giveaway') continue;
    assert.ok(known.has(id), `#${id} is on the page but not read by calc.mjs`);
  }
});

test('every output slot the script writes exists in the markup', () => {
  for (const id of [
    'leftoverOut', 'heroLabel', 'commissionOut', 'processingOut', 'feesOut',
    'takeRateOut', 'payoutOut', 'costsOut', 'leftoverRow', 'showOut',
    'targetOut', 'notes', 'errorList', 'output', 'problems', 'exampleNote',
    'shipCompareLabel', 'shipCompareOut',
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
  assert.match(sitemap, /whatnot-seller-payout\/<\/loc>/);
  assert.match(sitemap, /how-much-does-whatnot-take\.html/);
  assert.match(sitemap, /should-i-offer-free-shipping-on-whatnot\.html/);
});

test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = page('sitemap.xml');
  const dir = new URL('./', import.meta.url);
  for (const name of readdirSync(dir).filter(n => n.endsWith('.html'))) {
    if (name === 'index.html') {
      assert.match(sitemap, /whatnot-seller-payout\/<\/loc>/);
      continue;
    }
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

test('the worked example the page ships with actually computes', () => {
  const defaults = Object.fromEntries(
    [...markup.matchAll(/<input id="([^"]+)"[^>]*value="([^"]*)"/g)].map(m => [m[1], m[2]]),
  );
  defaults.giveaway = false;
  const result = calculateSale(defaults);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.ok(result.fees > 0);
});

test('the page opens on the worked example rather than an em-dash', () => {
  assert.ok(ids.has('exampleNote'));
  assert.match(script, /const example = calculateSale\(readInput\(\)\)/);
  assert.match(script, /render\(example\)/);
  assert.match(markup, /not your lot yet/);
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

test('the $50 / $20+shipping / $2,400 figures on the how-much page match the arithmetic', () => {
  const html = page('how-much-does-whatnot-take.html');
  const fifty = calculateSale({ salePrice: 50, commissionRate: 8, paymentRate: 2.9, paymentFixed: 0.3 });
  assert.match(html, /\$4\.00/);
  assert.match(html, /\$1\.75/);
  assert.match(html, /\$5\.75/);
  assert.match(html, /\$44\.25/);
  nearMoney(html, fifty.payout);

  const card = calculateSale({
    salePrice: 20, shippingCharged: 5, commissionRate: 8, paymentRate: 2.9, paymentFixed: 0.3,
  });
  assert.match(html, /\$1\.60/);
  assert.match(html, /\$1\.03/);
  assert.match(html, /\$2\.63/);
  assert.match(html, /\$17\.38/);
  nearMoney(html, card.fees, 2.63);

  const graded = calculateSale({
    salePrice: 2400, commissionRate: 8, commissionCap: 1500, paymentRate: 2.9, paymentFixed: 0.3,
  });
  assert.match(html, /\$120\.00/);
  assert.match(html, /\$192/);
  assert.match(html, /\$72\.00/);
  assert.match(html, /\$2,210\.10/);
  near(graded.commission, 120);
});

test('the free-shipping page’s three-way table matches the arithmetic', () => {
  const html = page('should-i-offer-free-shipping-on-whatnot.html');
  const charge = calculateSale({
    salePrice: 25, shippingCharged: 5, shippingCost: 5, itemCost: 8,
    commissionRate: 8, paymentRate: 2.9, paymentFixed: 0.3,
  });
  const bake = calculateSale({
    salePrice: 30, shippingCharged: 0, shippingCost: 5, itemCost: 8,
    commissionRate: 8, paymentRate: 2.9, paymentFixed: 0.3,
  });
  const eat = calculateSale({
    salePrice: 25, shippingCharged: 0, shippingCost: 5, itemCost: 8,
    commissionRate: 8, paymentRate: 2.9, paymentFixed: 0.3,
  });
  assert.match(html, /\$13\.83/);
  assert.match(html, /\$13\.43/);
  assert.match(html, /\$8\.98/);
  near(charge.leftover, 13.83, 0.01);
  near(bake.leftover, 13.43, 0.01);
  near(eat.leftover, 8.98, 0.01);
  const { leftoverDelta } = compareFreeShipping({
    salePrice: 25, shippingCharged: 5, shippingCost: 5, itemCost: 8,
    commissionRate: 8, paymentRate: 2.9, paymentFixed: 0.3,
  });
  assert.ok(leftoverDelta < 0, 'eating the label at the same hammer is worse');
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

// marketplace-fee-compare deliberately excludes Whatnot from the retail ranking
// and deep-links here instead. Without the reverse link, a crawler entering on
// this hub never reaches that compare — same one-way orphan class as #3639 /
// #3667 / #3678.
test('index links to the related marketplace fee compare hub', () => {
  assert.match(
    markup,
    /href="\.\.\/marketplace-fee-compare\/"/,
    'index must link ../marketplace-fee-compare/ so crawlers can reach the retail fee ranking',
  );
});

function near(actual, expected, tolerance = 0.001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

function nearMoney(html, value, printed = Number(value.toFixed(2))) {
  const pretty = printed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  assert.match(html, new RegExp(`\\$${pretty.replace(/,/g, ',')}`));
}
