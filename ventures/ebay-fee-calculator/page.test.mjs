// Structural checks on the pages. calc.test.mjs never reads the HTML, so a
// column mismatch or an advertised-but-unrendered figure would stay green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateOrder, compareStoreTiers } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./is-an-ebay-store-worth-it.html', import.meta.url), 'utf8');

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = '';
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, 'i').exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === 'script') scripts.push(rest.slice(contentStart, contentStart + closer.index));
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { markup, scripts, unclosed } = parse(html);
const scriptSource = scripts.join('\n');
const storeTemplate = scriptSource.match(/<tr class="\$\{row\.isCurrent[\s\S]*?row\.breakEvenOrders[\s\S]*?<\/tr>/g);

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test('the store row template has one cell per column', () => {
  assert.ok(storeTemplate && storeTemplate.length >= 1, 'could not find the store <tr> template');
  const storeMarkup = markup.split('id="storeTable"')[1] || '';
  const headers = [...storeMarkup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim());
  const cells = (storeTemplate[storeTemplate.length - 1].match(/<t[hd][\s>]/g) || []).length;
  assert.equal(
    cells,
    headers.length,
    `store table declares ${headers.length} columns (${headers.join(' | ')}) but the row template emits ${cells} cells`,
  );
});

test('schema.org featureList names the store comparison the page actually renders', () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, 'no schema.org featureList found');
  assert.match(featureList[1], /store subscription/i);
  assert.match(markup, /id="storeTable"/);
  assert.match(markup, /id="monthlyOrders"/);
  assert.match(markup, /id="monthlyStoreFee"/);
  assert.match(scriptSource, /compareStoreTiers/);
  assert.match(scriptSource, /store_comparison_viewed/);
});

test('the SEO page uses the same worked example the calculator defaults produce', () => {
  assert.match(seo, /Is an eBay store worth it/i);
  assert.match(seo, /\$40/);
  assert.match(seo, /\$6/);
  assert.match(seo, /13\.25%/);
  assert.match(seo, /href="\.\/?"/);
  assert.match(seo, /No warranty/);
  const example = {
    price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
    costOfGoods: 12, shippingCost: 5, packagingCost: 1, monthlyOrders: 40,
  };
  const money = (value) => `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
  const signed = (value) => `${value < 0 ? '−' : '+'}${money(Math.abs(value))}`;
  const current = calculateOrder(example);
  const at40 = compareStoreTiers(example);
  const at120 = compareStoreTiers({ ...example, monthlyOrders: 120 });
  assert.ok(seo.includes(money(current.profit)), `missing current profit ${money(current.profit)}`);
  for (const row of at40.filter((item) => !item.isCurrent)) {
    assert.ok(seo.includes(money(row.profit)), `missing ${row.id} profit ${money(row.profit)}`);
    assert.ok(seo.includes(signed(row.monthlyDelta)), `missing 40-order delta ${signed(row.monthlyDelta)}`);
  }
  for (const row of at120.filter((item) => !item.isCurrent)) {
    assert.ok(seo.includes(signed(row.monthlyDelta)), `missing 120-order delta ${signed(row.monthlyDelta)}`);
  }
});
