import test from "node:test";
import assert from "node:assert/strict";
import { loadQuote, calculate } from "./calc.mjs";

test("weights fuzzy words and prices labor at the hourly rate", () => {
  const q = loadQuote({
    new_words: 1800,
    fuzzy_words: 1200,
    fuzzy_rate: 50,
    words_per_hour: 400,
    hourly_rate: 45,
    qa_hours: 2,
    dtp_cost: 75,
    rush_fee: 0,
    minimum_price: 250,
    target_margin: 25,
  });
  const r = calculate(q);
  assert.equal(r.weighted_words, 2400);
  assert.equal(r.translation_hours, 6);
  assert.equal(r.labor_cost, 270);
  assert.equal(r.add_on_costs, 165);
  assert.equal(r.direct_cost, 435);
  assert.equal(r.target_price, 580);
  assert.equal(r.minimum_price, 435);
});

test("minimum floor wins when it is above direct cost", () => {
  const q = loadQuote({
    new_words: 200,
    words_per_hour: 400,
    hourly_rate: 45,
    minimum_price: 250,
    target_margin: 25,
  });
  const r = calculate(q);
  assert.equal(r.labor_cost, 22.5);
  assert.equal(r.minimum_price, 250);
  assert.equal(r.target_price, 30);
});

test("rejects invalid rate and empty project", () => {
  assert.throws(() => loadQuote({ new_words: 0, fuzzy_words: 0, hourly_rate: 45, words_per_hour: 400 }), /word count/);
  assert.throws(() => loadQuote({ new_words: 1, hourly_rate: 45, words_per_hour: 400, fuzzy_rate: 101 }), /fuzzy_rate/);
  assert.throws(() => loadQuote({ new_words: 1, hourly_rate: 45, words_per_hour: 0 }), /words_per_hour/);
});
