import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, parseQuote, summarise, compareQuotes, money, range, renderText, EXAMPLE } from './funeral.mjs';

test('the one fee that cannot be declined is the basic services fee', () => {
  assert.equal(classify('Basic services of funeral director and staff').status, 'fixed');
  assert.equal(classify('Non-declinable basic services fee').category, 'basic-services');
});

test('a handling fee for an outside casket is flagged, not filed as a casket', () => {
  const c = classify('Casket handling fee (outside purchase)');
  assert.equal(c.status, 'flag');
  assert.equal(c.category, 'outside-merchandise-fee');
  assert.equal(classify('Casket - 18 gauge steel').category, 'casket');
});

test('specific phrases beat the general words they contain', () => {
  assert.equal(classify('Alternative container for cremation').category, 'cremation-container');
  assert.equal(classify('Outer burial container').category, 'vault');
  assert.equal(classify('Direct cremation').status, 'package');
  assert.equal(classify('Cremation fee (crematory)').category, 'cremation');
  assert.equal(classify('Opening and closing of grave').status, 'third');
  assert.equal(classify('Certified death certificates (5)').status, 'third');
  assert.equal(classify('Embalming').category, 'embalming');
  assert.equal(classify('Zzz widget').status, 'unknown');
});

test('prices parse from dots, pipes, tabs and dollar signs', () => {
  const p = parseQuote('Embalming ........ $795\nHearse | 395.00\nTransfer of remains\t$1,250.50\nViewing: 600');
  assert.deepEqual(p.items.map((i) => [i.label, i.low]), [['Embalming', 79500], ['Hearse', 39500], ['Transfer of remains', 125050], ['Viewing', 60000]]);
});

test('a price range keeps both ends and the total carries both', () => {
  const p = parseQuote('Hearse $350 - $450\nEmbalming $800');
  assert.equal(p.items[0].low, 35000);
  assert.equal(p.items[0].high, 45000);
  const s = summarise(p);
  assert.deepEqual(s.total, { low: 115000, high: 125000 });
  assert.equal(range(s.total), '$1,150–$1,250');
});

test('lines with no price are reported, not silently dropped or guessed', () => {
  const p = parseQuote('GENERAL PRICE LIST\nCall for pricing\nEmbalming $800');
  assert.equal(p.items.length, 1);
  assert.deepEqual(p.unpriced, ['GENERAL PRICE LIST', 'Call for pricing']);
});

test('a number inside the description is not read as the price', () => {
  const p = parseQuote('24-hour care of remains');
  assert.equal(p.items.length, 0);
  assert.equal(p.unpriced.length, 1);
});

test('the example adds up and its groups add back to the total', () => {
  const s = summarise(parseQuote(EXAMPLE));
  assert.equal(s.count, 14);
  assert.equal(s.total.low, 1114000);
  const groups = Object.values(s.byStatus).reduce((a, g) => a + g.low, 0);
  assert.equal(groups, s.total.low);
  assert.equal(s.byStatus.fixed.low, 219500);
  assert.equal(s.byStatus.flag.count, 1);
  assert.ok(s.questions.some((q) => /handling fee/.test(q)));
});

test('"required" wording about embalming or cremation caskets is surfaced', () => {
  const s = summarise(parseQuote('Embalming (required by state law) $900\nCasket required for cremation $700'));
  assert.equal(s.claims.length, 2);
  assert.match(s.claims[0], /Embalming/);
  assert.match(s.claims[1], /cremation/);
});

test('comparing two homes shows the biggest gap first and what only one lists', () => {
  const a = parseQuote('Basic services $2,000\nEmbalming $800\nCasket $3,000');
  const b = parseQuote('Basic services $1,500\nCasket $1,000\nRefrigeration $200');
  const c = compareQuotes(a, b);
  assert.equal(c.diffLow, 580000 - 270000);
  assert.equal(c.rows[0].category, 'casket');
  assert.deepEqual(c.onlyA, ['embalming']);
  assert.deepEqual(c.onlyB, ['refrigeration']);
});

test('money formats cents with thousands separators', () => {
  assert.equal(money(123456), '$1,234.56');
  assert.equal(money(500000), '$5,000');
  assert.equal(money(-1000), '-$10');
});

test('empty and junk input does not throw', () => {
  assert.equal(summarise(parseQuote('')).count, 0);
  assert.equal(summarise(parseQuote(null)).total.low, 0);
  assert.match(renderText(parseQuote('')), /0 priced/);
});

test('a range keeps the whole label, including its first letter', () => {
  const { items } = parseQuote('Cremation $1,000 - $1,500');
  assert.equal(items.length, 1);
  assert.equal(items[0].label, 'Cremation');
});

test('a price glued to a three-letter label still parses', () => {
  const { items, unpriced } = parseQuote('Fee500');
  assert.equal(unpriced.length, 0);
  assert.equal(items[0].label, 'Fee');
  assert.equal(items[0].low, 50000);
});

test('the embalming claim window stops at 60 characters', () => {
  const near = `Embalming ${'x'.repeat(59)}required`; // " " + 59 = 60 chars after the word "Embalming"
  const far = `Embalming ${'x'.repeat(60)}required`;
  assert.equal(parseQuote(near).claims.length, 1);
  assert.equal(parseQuote(far).claims.length, 0);
});
