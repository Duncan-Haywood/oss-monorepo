import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULTS,
  compareExclusiveVsWide,
  ebookNet,
  exclusiveNote,
  ingramNet,
  paperbackNet,
  printCost,
  seventyPercentEligible,
} from './calc.mjs';

test('70% ebook nets list times 0.7 minus delivery', () => {
  assert.equal(ebookNet({ list: 4.99, plan: '70', fileSizeMb: 2, deliveryPerMb: 0.15 }), 4.99 * 0.7 - 0.3);
});

test('35% ebook nets list times 0.35 with no delivery deduction', () => {
  assert.equal(ebookNet({ list: 4.99, plan: '35', fileSizeMb: 2, deliveryPerMb: 0.15 }), 4.99 * 0.35);
});

test('70% is the published band for $2.99–$9.99 and not outside it', () => {
  assert.equal(seventyPercentEligible(2.99), true);
  assert.equal(seventyPercentEligible(9.99), true);
  assert.equal(seventyPercentEligible(2.98), false);
  assert.equal(seventyPercentEligible(10), false);
});

test('paperback print cost is the published B&W starting formula unless overridden', () => {
  assert.equal(printCost({ pages: 280, color: false, bwFixed: 0.85, bwPerPage: 0.012 }), 0.85 + 0.012 * 280);
  assert.equal(printCost({ pages: 280, color: true, colorFixed: 0.85, colorPerPage: 0.07 }), 0.85 + 0.07 * 280);
  assert.equal(printCost({ pages: 280, color: false, override: 4.5, bwFixed: 0.85, bwPerPage: 0.012 }), 4.5);
});

test('paperback net is 60% of list minus print, and can go negative', () => {
  assert.equal(paperbackNet({ list: 14.99, royaltyRate: 0.6, print: 4.21 }), 14.99 * 0.6 - 4.21);
  assert.ok(paperbackNet({ list: 5, royaltyRate: 0.6, print: 4.21 }) < 0);
});

test('Ingram net is list after the wholesale discount, minus their print cost', () => {
  assert.equal(ingramNet({ list: 14.99, wholesale: 0.4, print: 5 }), 14.99 * 0.6 - 5);
});

test('the locked worked example leaves wide ahead of exclusive', () => {
  const result = compareExclusiveVsWide(DEFAULTS);
  assert.equal(result.unitEbook, 4.99 * 0.7 - 0.3);
  assert.equal(result.kdpPrint, 0.85 + 0.012 * 280);
  assert.equal(result.unitPaperback, 14.99 * 0.6 - result.kdpPrint);
  assert.equal(result.ku, 12000 * 0.0045);
  assert.equal(result.otherStores, 40 * 2.5);
  assert.equal(result.exclusive, result.ebookPaid + result.ku + result.paperback);
  assert.equal(result.wide, result.ebookPaid + result.paperback + result.otherStores + result.ingram);
  assert.equal(result.exclusiveWins, false);
  assert.ok(result.wide > result.exclusive);
  assert.equal(result.pagesToMatchOneSale, result.unitEbook / 0.0045);
  assert.equal(result.readsToMatchWide, result.wideExtras / 0.0045);
});

test('enough KU reads flip exclusive ahead of the same wide extras', () => {
  const result = compareExclusiveVsWide({ ...DEFAULTS, kenpReads: 40000 });
  assert.equal(result.exclusiveWins, true);
  assert.ok(result.gap > 0);
});

test('pages-to-match-one-sale is ebook net divided by the KENP rate', () => {
  const result = compareExclusiveVsWide({ ...DEFAULTS, kenpRate: 0.005 });
  assert.equal(result.pagesToMatchOneSale, result.unitEbook / 0.005);
});

test('a zero KENP rate does not invent a page-read target', () => {
  const result = compareExclusiveVsWide({ ...DEFAULTS, kenpRate: 0 });
  assert.equal(result.pagesToMatchOneSale, Infinity);
  assert.equal(result.readsToMatchWide, 0);
  assert.equal(result.ku, 0);
});

test('exclusiveNote reports the arithmetic and never tells the author which path to take', () => {
  const behind = exclusiveNote(compareExclusiveVsWide(DEFAULTS));
  assert.match(behind, /Wide keeps/);
  assert.doesNotMatch(behind, /should|enroll|go wide|stay exclusive/i);
  const ahead = exclusiveNote(compareExclusiveVsWide({ ...DEFAULTS, kenpReads: 40000 }));
  assert.match(ahead, /Exclusive keeps/);
  assert.doesNotMatch(ahead, /should|enroll|go wide|stay exclusive/i);
});

test('rejects a royalty rate typed as a percent instead of a fraction', () => {
  assert.throws(() => paperbackNet({ list: 14.99, royaltyRate: 60, print: 4 }), /fraction/);
  assert.throws(() => ingramNet({ list: 14.99, wholesale: 40, print: 5 }), /fraction/);
});

test('rejects a royalty plan that is not 70 or 35', () => {
  assert.throws(() => ebookNet({ list: 4.99, plan: '50', fileSizeMb: 1, deliveryPerMb: 0.15 }), /70 or 35/);
});

test('rejects negative or non-numeric inputs by name', () => {
  assert.throws(() => compareExclusiveVsWide({ ebookList: -1 }), /eBook list price/);
  assert.throws(() => compareExclusiveVsWide({ kenpReads: 'x' }), /KU page reads/);
});
