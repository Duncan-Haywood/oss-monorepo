// Structural checks on the pages. calc.test.mjs never reads the HTML, so a
// column mismatch or an advertised-but-unrendered figure would stay green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateOrder } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./are-ebay-promoted-listings-worth-it.html', import.meta.url), 'utf8');

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
const promotedTemplate = scriptSource.match(/<tr class="\$\{row\.isCurrent[\s\S]*?<\/tr>/g);

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test('the promoted-listings row template has one cell per column', () => {
  assert.ok(promotedTemplate && promotedTemplate.length >= 1, 'could not find the promoted-listings <tr> template');
  const promotedMarkup = markup.split('id="promotedTable"')[1] || '';
  const headers = [...promotedMarkup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim());
  const cells = (promotedTemplate[promotedTemplate.length - 1].match(/<t[hd][\s>]/g) || []).length;
  assert.equal(
    cells,
    headers.length,
    `promoted table declares ${headers.length} columns (${headers.join(' | ')}) but the row template emits ${cells} cells`,
  );
});

test('schema.org featureList names the promoted-listings comparison the page actually renders', () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, 'no schema.org featureList found');
  assert.match(featureList[1], /promoted listings/i);
  assert.match(markup, /id="promotedTable"/);
  assert.match(markup, /id="maxBreakEvenRate"/);
  assert.match(markup, /id="maxTargetRate"/);
  assert.match(scriptSource, /calculatePromotedTable/);
  assert.match(scriptSource, /promoted_sensitivity_viewed/);
});

test('the SEO page uses the same worked example the calculator defaults produce', () => {
  assert.match(seo, /Are eBay promoted listings worth it/i);
  assert.match(seo, /\$40/);
  assert.match(seo, /\$6/);
  assert.match(seo, /13\.25%/);
  assert.match(seo, /href="\."/);
  assert.match(seo, /No warranty/);
  const example = {
    price: 40, shippingCharged: 6, finalValueRate: 13.25, fixedFee: 0.3,
    costOfGoods: 12, shippingCost: 5, packagingCost: 1,
  };
  const money = (value) => `$${(Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2)}`;
  for (const rate of [0, 2, 5, 8]) {
    const result = calculateOrder({ ...example, promotedRate: rate });
    assert.ok(seo.includes(money(result.fees.promoted)), `missing ad fee ${money(result.fees.promoted)} at ${rate}%`);
    assert.ok(seo.includes(money(result.profit)), `missing profit ${money(result.profit)} at ${rate}%`);
  }
});
