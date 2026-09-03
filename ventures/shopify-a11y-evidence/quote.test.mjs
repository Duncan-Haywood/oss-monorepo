import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hoursForItem,
  quoteRemediation,
  quoteAsText,
  recordQuoteUsage,
  USAGE_KEY,
} from './quote.mjs';

const sample = {
  url: 'https://shop.test',
  testEngine: { name: 'axe-core' },
  violations: [
    { id: 'color-contrast', impact: 'serious', help: 'Fix contrast', nodes: [{}, {}] },
    { id: 'image-alt', impact: 'critical', help: 'Add alt text', nodes: [{}] },
    { id: 'landmark-one-main', impact: 'moderate', help: 'Add a main landmark', nodes: [{}] },
  ],
  passes: [{}],
  incomplete: [],
};

test('hours scale with impact and extra nodes of the same rule', () => {
  assert.equal(hoursForItem({ impact: 'serious', nodes: 1 }), 1);
  assert.equal(hoursForItem({ impact: 'serious', nodes: 2 }), 1.25);
  assert.equal(hoursForItem({ impact: 'critical', nodes: 1 }), 1.5);
});

test('quotes a typical three-rule Shopify scan at the default rate', () => {
  const quote = quoteRemediation(sample, { hourlyRate: 150, bufferPercent: 20, themeMultiplier: 1 });
  // 1.25 + 1.5 + 0.5 = 3.25 raw; 20% buffer → 3.9 h; mid 3.9 * 150 = 585
  assert.equal(quote.rawHours, 3.25);
  assert.equal(quote.bufferedHours, 3.9);
  assert.equal(quote.quote.mid, 585);
  assert.equal(quote.quote.low, 497.25);
  assert.equal(quote.quote.high, 731.25);
  assert.equal(quote.items[0].id, 'color-contrast');
  assert.equal(quote.empty, false);
});

test('ranks a many-node serious rule ahead of a one-node critical rule', () => {
  const quote = quoteRemediation({
    violations: [
      { id: 'button-name', impact: 'critical', help: 'Name the button', nodes: [{}] },
      { id: 'color-contrast', impact: 'serious', help: 'Fix contrast', nodes: [{}, {}, {}, {}, {}] },
    ],
  });
  assert.equal(quote.items[0].id, 'color-contrast');
  assert.equal(quote.items[1].id, 'button-name');
});

test('a clean scan quotes zero and still refuses a compliance claim', () => {
  const quote = quoteRemediation({ violations: [] });
  assert.equal(quote.empty, true);
  assert.equal(quote.rawHours, 0);
  assert.equal(quote.quote.mid, 0);
  assert.match(quoteAsText(quote), /Manual and assistive-technology review is still required/);
  assert.match(quoteAsText(quote), /not a compliance determination/);
});

test('rejects impossible rate and buffer assumptions', () => {
  assert.throws(() => quoteRemediation(sample, { hourlyRate: 0 }), /Hourly rate/);
  assert.throws(() => quoteRemediation(sample, { bufferPercent: 140 }), /Buffer percent/);
  assert.throws(() => quoteRemediation(sample, { themeMultiplier: 0.2 }), /Theme complexity/);
});

test('theme multiplier scales hours without changing the ranking', () => {
  const quote = quoteRemediation(sample, { themeMultiplier: 1.4, bufferPercent: 0, hourlyRate: 100 });
  assert.equal(quote.rawHours, 4.55);
  assert.equal(quote.items[0].id, 'color-contrast');
});

test('copyable quote names the money range and the first fix', () => {
  const text = quoteAsText(quoteRemediation(sample, { hourlyRate: 150, bufferPercent: 20 }));
  assert.match(text, /\$585\.00/);
  assert.match(text, /color-contrast/);
  assert.match(text, /not a fixed bid/);
});

test('usage is aggregate, named, and opt-out', () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
  };
  recordQuoteUsage(storage);
  recordQuoteUsage(storage, false, 'quote_copied');
  recordQuoteUsage(storage, true);
  assert.deepEqual(JSON.parse(data.get(USAGE_KEY)), { quote_generated: 1, quote_copied: 1 });
});
