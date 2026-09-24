import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = page('index.html');

test('calculator page is findable and usable without a build step', () => {
  assert.match(markup, /Depop Fee Calculator/);
  assert.match(markup, /calculateSale/);
  assert.match(markup, /<script type="application\/ld\+json">/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(markup, /href="LICENSE"/);
  assert.match(markup, /not legal, tax, financial, or selling advice/);
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /Not affiliated with, endorsed by, or sponsored by Depop/);
});

test('index links to the related resale-marketplace calculators', () => {
  assert.match(markup, /href="\.\.\/poshmark-fee-calculator\/"/);
  assert.match(markup, /href="\.\.\/mercari-fee-calculator\/"/);
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
