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
  // The venture's own guide tells a reader to quote "$435 or the
  // target-margin price above it" by hand -- this is that comparison done
  // for them: the $580 target price is higher than the $435 cost floor, so
  // it is what the tool should actually recommend sending.
  assert.equal(r.recommended_price, 580);
});

test("minimum floor wins over direct cost when the job is small", () => {
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
  // The target-margin price ($30) is below the stated minimum ($250) here,
  // so the minimum is also what should be recommended, not the margin math.
  assert.equal(r.recommended_price, 250);
});

test("recommended price never drops below the target margin once the flat minimum stops binding", () => {
  // Regression: `minimum_price` used to floor against raw direct cost, so
  // the flat $250 minimum still won here (direct cost is only $225) even
  // though the $300 target-margin price is *also* above the minimum and
  // nothing ever compared the two. The recommendation has to be the larger
  // of all three -- minimum, direct cost, and target price -- not just the
  // first two.
  const q = loadQuote({
    new_words: 2000,
    words_per_hour: 400,
    hourly_rate: 45,
    minimum_price: 250,
    target_margin: 25,
  });
  const r = calculate(q);
  assert.equal(r.direct_cost, 225);
  assert.equal(r.target_price, 300);
  // Old behavior: minimum_price = max(250, 225) = 250, and nothing ever
  // reconciled that $250 against the $300 the stated 25% margin requires --
  // the tool would have silently under-recommended by $50.
  assert.equal(r.minimum_price, 250);
  assert.equal(r.recommended_price, 300);
});

test("rejects invalid rate and empty project", () => {
  assert.throws(() => loadQuote({ new_words: 0, fuzzy_words: 0, hourly_rate: 45, words_per_hour: 400 }), /word count/);
  assert.throws(() => loadQuote({ new_words: 1, hourly_rate: 45, words_per_hour: 400, fuzzy_rate: 101 }), /fuzzy_rate/);
  assert.throws(() => loadQuote({ new_words: 1, hourly_rate: 45, words_per_hour: 0 }), /words_per_hour/);
});
