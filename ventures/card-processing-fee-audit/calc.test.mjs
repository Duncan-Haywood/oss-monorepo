import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RATE_MODEL,
  QUOTE_DEFAULTS,
  auditStatement,
  auditMessage,
  auditNotes,
  formatMoney,
  formatPercent,
} from './calc.mjs';

// The worked example on index.html: card-present retail, $30 average ticket.
const EXAMPLE = {
  monthlyVolume: 42000,
  transactions: 1400,
  totalFees: 1300,
  cardPresentPercent: 85,
  fixedMonthlyFees: 45,
};

const near = (actual, expected, tolerance = 0.01) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );

test('effective rate, cost per transaction and average ticket come straight off the statement', () => {
  const result = auditStatement(EXAMPLE);
  near(result.effectiveRatePercent, 3.0952);
  near(result.costPerTransaction, 0.9286);
  near(result.averageTicket, 30);
});

test('pass-through blends the two interchange bands by the card-present share', () => {
  const result = auditStatement(EXAMPLE);
  // 0.0165 * 0.85 + 0.0215 * 0.15 = 0.01725
  near(result.blendedInterchangeRatePercent, 1.725, 0.0001);
  // 42000 * 0.01725 + 1400 * 0.10 + 42000 * 0.0014 + 1400 * 0.02
  near(result.passThrough.mid, 951.3);
  near(result.passThrough.low, 867.3);
  near(result.passThrough.high, 1059.45);
});

test('the markup band inverts the pass-through band', () => {
  // The regression this guards: reading markup.low off the LOW pass-through
  // estimate reports the most flattering reading of the statement as the
  // worst case, which is the direction that sends someone into a negotiation
  // with a number they cannot defend.
  const result = auditStatement(EXAMPLE);
  near(result.markup.mid, 348.7);
  near(result.markup.low, 240.55);
  near(result.markup.high, 432.7);
  assert.ok(result.markup.low < result.markup.mid && result.markup.mid < result.markup.high);
  near(result.markupRatePercent.mid, 0.8302, 0.001);
});

test('markup floors at zero rather than going negative, and says so', () => {
  const result = auditStatement({ ...EXAMPLE, totalFees: 700 });
  assert.equal(result.markup.low, 0);
  assert.equal(result.markup.mid, 0);
  assert.equal(result.markup.high, 0);
  assert.equal(result.atOrBelowEstimatedPassThrough, true);
  assert.match(auditMessage(result), /cannot identify\s+processor markup/);
});

test('a statement above the whole band is not flagged as at-or-below pass-through', () => {
  const result = auditStatement(EXAMPLE);
  assert.equal(result.atOrBelowEstimatedPassThrough, false);
});

test('the comparison quote is priced on the same pass-through midpoint', () => {
  // Interchange is identical under either processor, so pricing the quote on
  // a different pass-through figure would attribute a difference in the
  // networks' share to the processor. 951.30 + 105 + 140 + 10.
  const result = auditStatement(EXAMPLE);
  near(result.quote.monthlyCost, 1206.3);
  near(result.quote.monthlyDifference, 93.7);
  near(result.quote.annualDifference, 1124.4);
  near(result.quote.effectiveRatePercent, 2.8721, 0.001);
});

test('quote defaults apply when the comparison fields are left out', () => {
  const withDefaults = auditStatement(EXAMPLE);
  const explicit = auditStatement({ ...EXAMPLE, ...QUOTE_DEFAULTS });
  assert.deepEqual(withDefaults.quote, explicit.quote);
});

test('a keyed-entry business is priced on the higher card-not-present band', () => {
  const present = auditStatement({ ...EXAMPLE, cardPresentPercent: 100 });
  const online = auditStatement({ ...EXAMPLE, cardPresentPercent: 0 });
  assert.ok(online.passThrough.mid > present.passThrough.mid);
  near(present.blendedInterchangeRatePercent, RATE_MODEL.cardPresent.mid * 100, 0.0001);
  near(online.blendedInterchangeRatePercent, RATE_MODEL.cardNotPresent.mid * 100, 0.0001);
  // Same bill, more of it explained by the networks, so less is markup.
  assert.ok(online.markup.mid < present.markup.mid);
});

test('fixed monthly fees are annualised and reported as a share of the bill', () => {
  const result = auditStatement(EXAMPLE);
  near(result.fixedFeesAnnual, 540);
  near(result.fixedFeesShareOfFeesPercent, 3.4615, 0.001);
});

test('every field is validated, with a message naming what to fix', () => {
  const cases = [
    [{ ...EXAMPLE, monthlyVolume: '' }, /Enter card sales for the month/],
    [{ ...EXAMPLE, monthlyVolume: 'lots' }, /must be a number/],
    [{ ...EXAMPLE, monthlyVolume: 0 }, /cannot be below/],
    [{ ...EXAMPLE, transactions: 0 }, /cannot be below/],
    [{ ...EXAMPLE, transactions: 12.5 }, /whole number/],
    [{ ...EXAMPLE, totalFees: -1 }, /cannot be below/],
    [{ ...EXAMPLE, cardPresentPercent: 101 }, /cannot be above/],
    [{ ...EXAMPLE, cardPresentPercent: -5 }, /cannot be below/],
    [{ ...EXAMPLE, fixedMonthlyFees: 2000 }, /cannot exceed the total fees/],
    [{ ...EXAMPLE, quoteMarkupPercent: -1 }, /cannot be below/],
  ];
  for (const [input, pattern] of cases) {
    assert.throws(() => auditStatement(input), pattern, JSON.stringify(input));
  }
});

test('a zero-fee statement is legal input and reports a zero rate', () => {
  const result = auditStatement({ ...EXAMPLE, totalFees: 0, fixedMonthlyFees: 0 });
  assert.equal(result.effectiveRatePercent, 0);
  assert.equal(result.atOrBelowEstimatedPassThrough, true);
});

test('the headline sentence quotes the band, never a single markup figure', () => {
  const message = auditMessage(auditStatement(EXAMPLE));
  assert.match(message, /3\.10%/);
  assert.match(message, /\$348\.70/);
  assert.match(message, /\$240\.55 to \$432\.70/);
  // Positioning: an observation the reader acts on, not a determination.
  assert.doesNotMatch(message, /overpay|you are being|ripped off/i);
});

test('notes call out fixed fees, ticket size, presentment mix and the quote', () => {
  const notes = auditNotes(auditStatement(EXAMPLE));
  assert.ok(notes.some((note) => /\$540\.00 a year/.test(note)), 'fixed fees note missing');
  assert.ok(notes.some((note) => /\$1,124\.40 a year/.test(note)), 'quote note missing');
  // $30 ticket and 85% card-present: neither the small-ticket nor the
  // large-ticket nor the keyed-entry note applies.
  assert.ok(!notes.some((note) => /average ticket/.test(note)));
  assert.ok(!notes.some((note) => /keyed or online/.test(note)));
});

test('a small-ticket merchant is told the per-transaction cents dominate', () => {
  const notes = auditNotes(auditStatement({ ...EXAMPLE, transactions: 4200 }));
  assert.ok(notes.some((note) => /average ticket is \$10\.00/.test(note)));
  assert.ok(notes.some((note) => /1\.00%/.test(note)), 'per-transaction impact not quantified');
});

test('a large-ticket merchant is told the opposite', () => {
  const notes = auditNotes(auditStatement({ ...EXAMPLE, transactions: 200 }));
  assert.ok(notes.some((note) => /percentage dominates/.test(note)));
});

test('a mostly-online merchant is told part of the rate is not the processor to give back', () => {
  const notes = auditNotes(auditStatement({ ...EXAMPLE, cardPresentPercent: 20 }));
  assert.ok(notes.some((note) => /80% of your volume is keyed or online/.test(note)));
});

test('a quote that loses is reported as losing, not hidden', () => {
  const notes = auditNotes(auditStatement({ ...EXAMPLE, totalFees: 1000 }));
  assert.ok(notes.some((note) => /a year more than you pay now/.test(note)));
});

test('a statement with no fixed fees entered gets a prompt to look again', () => {
  const notes = auditNotes(auditStatement({ ...EXAMPLE, fixedMonthlyFees: 0 }));
  assert.ok(notes.some((note) => /No fixed monthly fees were entered/.test(note)));
});

test('formatters render money and percentages, and survive junk', () => {
  assert.equal(formatMoney(1234.5), '$1,234.50');
  assert.equal(formatMoney(Number.NaN), '—');
  assert.equal(formatPercent(3.0952), '3.10%');
  assert.equal(formatPercent(80, 0), '80%');
  assert.equal(formatPercent(undefined), '—');
});
