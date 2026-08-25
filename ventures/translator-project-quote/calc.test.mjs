import test from 'node:test';
import assert from 'node:assert/strict';
import { loadQuote, calculate } from './calc.mjs';

test('weights fuzzy words and adds project costs', () => {
  const q = loadQuote({ new_words: 1800, fuzzy_words: 1200, fuzzy_rate: 50, hourly_rate: 500, qa_hours: 2, dtp_cost: 75, rush_fee: 25, minimum_price: 250, target_margin: 25 });
  const r = calculate(q);
  assert.equal(r.weighted_words, 2400);
  assert.equal(r.translation_hours, 4.8);
  assert.equal(r.labor_cost, 2400);
  assert.equal(r.add_on_costs, 1100);
  assert.equal(r.target_price, 4666.666666666667);
  assert.equal(r.minimum_price, 3500);
});

test('rejects invalid rate and empty project', () => {
  assert.throws(() => loadQuote({ new_words: 0, fuzzy_words: 0, hourly_rate: 500 }), /word count/);
  assert.throws(() => loadQuote({ new_words: 1, hourly_rate: 500, fuzzy_rate: 101 }), /fuzzy_rate/);
});
