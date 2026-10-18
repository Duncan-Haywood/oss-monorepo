import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = page('index.html');

test('calculator page is findable and usable without a build step', () => {
  assert.match(markup, /TCGplayer Fee Calculator/);
  assert.match(markup, /calculateSale/);
  assert.match(markup, /<script type="application\/ld\+json">/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(markup, /href="LICENSE"/);
  assert.match(markup, /not legal, tax, financial, or selling advice/);
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /Not affiliated with, endorsed by, or sponsored by TCGplayer/);
});

test('index links to the related resale-marketplace calculators', () => {
  assert.match(markup, /href="\.\.\/whatnot-seller-payout\/"/);
  assert.match(markup, /href="\.\.\/ebay-fee-calculator\/"/);
  assert.match(markup, /href="\.\.\/where-to-sell-calculator\/"/);
  assert.match(markup, /href="\.\.\/marketplace-fee-compare\/"/);
});

test('every authored FAQPage question and answer text is echoed on the visible page, verbatim', () => {
  const blocks = [...markup.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const faq = blocks.find(b => b['@type'] === 'FAQPage');
  assert.ok(faq, 'no FAQPage JSON-LD block found');
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(markup.includes(name), `question not visible verbatim: ${name}`);
    assert.ok(markup.includes(acceptedAnswer.text), `answer not visible verbatim: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the generic-method comparison page links back, names no specific product, and is linked from index', () => {
  const spreadsheetSeo = page('vs-tracking-tcgplayer-sales-in-a-spreadsheet.html');
  assert.match(markup, /vs-tracking-tcgplayer-sales-in-a-spreadsheet\.html/);
  assert.match(spreadsheetSeo, /<a href="\.\/">/);
  assert.match(spreadsheetSeo, /names no specific product/i);
  assert.match(spreadsheetSeo, /No warranty/);
  assert.match(spreadsheetSeo, /no SLA/i);
  assert.match(spreadsheetSeo, /not affiliated with, endorsed by, or sponsored by TCGplayer/i);
  assert.match(spreadsheetSeo, /where-to-sell-calculator\/"/);

  const blocks = [...spreadsheetSeo.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const faq = blocks.find(b => b['@type'] === 'FAQPage');
  assert.ok(faq, 'no FAQPage JSON-LD block found on the comparison page');
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(spreadsheetSeo.includes(name), `question not visible verbatim: ${name}`);
    assert.ok(spreadsheetSeo.includes(acceptedAnswer.text), `answer not visible verbatim: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the guide page links back, is linked from index, and echoes its FAQ verbatim', () => {
  const guide = page('tcgplayer-30-cent-fee-and-order-size.html');
  assert.match(markup, /tcgplayer-30-cent-fee-and-order-size\.html/);
  assert.match(guide, /<a href="\.\/">/);
  assert.match(guide, /No warranty/);
  assert.match(guide, /no SLA/i);
  assert.match(guide, /not affiliated with, endorsed by, or sponsored by TCGplayer/i);

  const blocks = [...guide.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const faq = blocks.find(b => b['@type'] === 'FAQPage');
  assert.ok(faq, 'no FAQPage JSON-LD block found on the guide page');
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(guide.includes(name), `question not visible verbatim: ${name}`);
    assert.ok(guide.includes(acceptedAnswer.text), `answer not visible verbatim: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('every published page carries Open Graph tags and a robots/canonical pair', () => {
  const dir = new URL('./', import.meta.url);
  const pages = readdirSync(dir).filter(name => name.endsWith('.html'));
  assert.ok(pages.length >= 2, 'expected index.html plus at least one marketing page');
  for (const name of pages) {
    const source = page(name);
    assert.match(source, /<meta property="og:title" content="[^"]+">/, `${name} is missing og:title`);
    assert.match(source, /<meta property="og:description" content="[^"]+">/, `${name} is missing og:description`);
    assert.match(source, /<meta property="og:type" content="website">/, `${name} is missing og:type`);
    assert.match(source, /<meta name="robots" content="index, follow">/, `${name} is missing a robots meta`);
    assert.match(source, /<link rel="canonical" href="[^"]+">/, `${name} is missing a canonical link`);
  }
});

test('index links to the Whatnot seller payout calculator it is paired with', () => {
  assert.match(markup, /href="\.\.\/whatnot-seller-payout\/"/);
});
