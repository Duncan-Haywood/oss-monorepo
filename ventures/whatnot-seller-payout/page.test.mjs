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

// A seller retyping the category preset and every rate on each visit is the
// retyping this venture's own kill criteria asks whether they'll tolerate
// twice in 90 days — so the form must be saveable and shareable, not just
// calculable.
test('the page saves and shares its inputs rather than losing them on reload', () => {
  assert.ok(ids.has('copyLink'), 'missing #copyLink');
  assert.ok(ids.has('reset'), 'missing #reset');
  assert.ok(ids.has('status'));
  assert.match(script, /from '\.\/share\.mjs'/);
  assert.match(script, /encodeInputs/);
  assert.match(script, /decodeInputs/);
  assert.match(script, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(script, /localStorage\.removeItem\(STORAGE_KEY\)/);
});

test('reset restores the page\'s own shipped defaults, not a blank form', () => {
  assert.match(script, /const DEFAULT_INPUTS = readInput\(\)/);
  assert.match(script, /applyInputs\(DEFAULT_INPUTS\)/);
});

test('a shared or restored lot wins over the shipped worked example', () => {
  assert.match(script, /const fromLink = decodeInputs\(location\.hash \|\| location\.search\)/);
  assert.match(script, /exampleNote'\)\.hidden = hasRestored/);
});

test('a shared link is applied through formValues rather than a plain spread', () => {
  // Regression for the shared-link-clears defect (platform/ci/check_shared_link_clears.py):
  // a plain `{ ...saved, ...fromLink }` merge looks like the link wins and is
  // not -- a numeric field the sender left blank falls through to the
  // recipient's own saved draft instead of being cleared. formValues(fromLink)
  // is what actually clears it.
  assert.match(script, /applyInputs\(formValues\(fromLink\)\)/);
  assert.doesNotMatch(script, /\{\s*\.\.\.saved\s*,\s*\.\.\.fromLink\s*\}/);
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

// The comparison page names Whatnot to say what this tool is *not*, so the
// two lines that keep it honest are the ones most likely to be lost in a
// later edit: the not-affiliated statement, and the reverse link from index.
// Without the link a crawler entering on the hub never reaches it -- the same
// one-way orphan class the marketplace-fee-compare test above guards against.
test('the comparison page disclaims affiliation and is reachable from index', () => {
  const source = page('vs-whatnot-seller-dashboard.html');
  assert.match(source, /not affiliated with, endorsed by, or sponsored by Whatnot/i);
  assert.match(source, /href="\.\/"/, 'must link back to the calculator');
  assert.match(
    markup,
    /href="\.\/vs-whatnot-seller-dashboard\.html"/,
    'index must link the comparison page so crawlers can reach it',
  );
});

// The FAQ answers are duplicated between visible copy and the JSON-LD block.
// A crawler that reads structured data disagreeing with the page is the defect
// CLAUDE.md records from #3671, so pin that they stay identical.
test('comparison page FAQ structured data matches the visible answers', () => {
  const source = page('vs-whatnot-seller-dashboard.html');
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(source)[1]);
  assert.equal(ld['@type'], 'FAQPage');
  const visible = source.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const entry of ld.mainEntity) {
    const question = entry.name.replace(/&/g, '&amp;');
    assert.ok(
      visible.includes(`<h3>${question}</h3>`),
      `structured-data question is not on the page: ${entry.name}`,
    );
    assert.ok(
      visible.includes(`<p>${entry.acceptedAnswer.text}</p>`),
      `structured-data answer does not match the visible copy for: ${entry.name}`,
    );
  }
});

function near(actual, expected, tolerance = 0.001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

function nearMoney(html, value, printed = Number(value.toFixed(2))) {
  const pretty = printed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  assert.match(html, new RegExp(`\\$${pretty.replace(/,/g, ',')}`));
}

// Both price one transaction through platform-specific fees to find the true
// seller payout -- a livestream lot and a nightly stay. Without a crawlable
// link here, a crawler entering on this page never reaches the STR host
// payout calculator in one hop.
test('index links one hop to the str-host-payout-calculator sibling', () => {
  assert.match(
    markup,
    /href="\.\.\/str-host-payout-calculator\/"/,
    'index must link ../str-host-payout-calculator/ so crawlers reach the STR host payout calculator in one hop',
  );
});
