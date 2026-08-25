// Structural tests for index.html.
//
// calc.test.mjs never looks at the page, so it stays green when the Offsite
// Ads table grows a column without a matching cell, or when schema.org
// advertises ROI that the result panel never renders. Kept dependency-free
// so CI stays a plain `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./are-etsy-offsite-ads-worth-it.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

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
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { markup, scripts, unclosed } = parse(html);
const scriptSource = scripts.join('\n');

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test('Offsite Ads table headers match the cells the renderer writes', () => {
  const table = markup.match(/<tbody id="offsiteScenarios">[\s\S]*?<\/table>/);
  assert.ok(table, 'offsiteScenarios table not found');
  const headerBlock = markup.match(/<tbody id="offsiteScenarios">/)
    ? markup.slice(0, markup.indexOf('id="offsiteScenarios"'))
    : '';
  const headers = [...headerBlock.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim());
  assert.deepEqual(headers, ['Path', 'Ad fee', 'Profit', 'vs organic', 'ROI']);

  const cellWrite = scriptSource.match(/for \(const text of \[path, money\(row\.offsiteAdFee\), money\(row\.profit\), signedMoney\(row\.profitVsOrganic\), roiText\]\)/);
  assert.ok(cellWrite, 'row renderer must write Path, Ad fee, Profit, vs organic, ROI in that order');
});

test('figures named in schema.org featureList are actually rendered', () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, 'no schema.org featureList found');
  assert.match(featureList[1], /ROI on cash invested/);
  assert.match(featureList[1], /Offsite Ads/);
  assert.match(markup, /id="roi"/);
  assert.match(markup, /id="invested"/);
  assert.match(markup, /id="offsiteScenarios"/);
  assert.match(scriptSource, /compareOffsiteAdRates/);
  assert.match(scriptSource, /maxAffordableOffsiteRate/);
});

test('SEO companion page and sitemap cover the Offsite Ads question', () => {
  assert.match(seo, /Are Etsy Offsite Ads worth it/);
  assert.match(seo, /\$14/);
  assert.match(seo, /15%/);
  assert.match(sitemap, /are-etsy-offsite-ads-worth-it\.html/);
});
