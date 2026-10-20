// Card processing fee audit.
//
// A small business reads five numbers off one month's merchant statement and
// this splits the total fee into the part the card networks set (interchange
// plus assessments, which no processor can discount) and the part the
// processor keeps (markup, which is the only negotiable half). Then it prices
// the same month under an interchange-plus quote so the difference is a
// dollar figure rather than a rate comparison.
//
// Why the split matters more than the effective rate: a statement showing
// 3.10% is unremarkable on a keyed-entry business with a $28 average ticket
// and outrageous on card-present retail with a $120 ticket. The effective
// rate alone cannot tell those apart, which is why "shop your rate" advice is
// mostly noise. The pass-through estimate is what makes the number mean
// something.
//
// The estimate is a BAND, deliberately, and every consumer of it should show
// the band rather than the midpoint alone. Actual interchange depends on the
// exact card mix -- a regulated debit card and a small-business rewards card
// on the same terminal differ by well over a percentage point -- and this
// tool cannot see that mix. Reporting a single number would imply a precision
// the inputs do not carry, and the whole point of the product is that the
// user takes the output to their processor; a figure they cannot defend is
// worse than no figure.

// Blended interchange bands by presentment, plus the network assessments that
// apply on top of both. These are ranges typical of US card-brand published
// schedules for small-merchant traffic, held here as one named constant so a
// session updating them updates the tests' expectations in the same place.
// They are an estimate of a blend, not a lookup of any single rate.
export const RATE_MODEL = Object.freeze({
  cardPresent: Object.freeze({ low: 0.0145, mid: 0.0165, high: 0.019, perTransaction: 0.1 }),
  cardNotPresent: Object.freeze({ low: 0.0195, mid: 0.0215, high: 0.0245, perTransaction: 0.1 }),
  assessments: Object.freeze({ rate: 0.0014, perTransaction: 0.02 }),
});

// A competitive interchange-plus quote for a small merchant, used as the
// default comparison so the tool answers something on first load rather than
// showing an empty panel.
export const QUOTE_DEFAULTS = Object.freeze({
  quoteMarkupPercent: 0.25,
  quotePerTransaction: 0.1,
  quoteMonthlyFees: 10,
});

function toNumber(value, label, { min = 0, max = Infinity, integer = false } = {}) {
  if (value === '' || value === null || value === undefined) {
    throw new Error(`Enter ${label}.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be a number.`);
  }
  if (number < min) {
    throw new Error(`${label} cannot be below ${min}.`);
  }
  if (number > max) {
    throw new Error(`${label} cannot be above ${max}.`);
  }
  if (integer && !Number.isInteger(number)) {
    throw new Error(`${label} must be a whole number.`);
  }
  return number;
}

// One month of pass-through at a given point in the band. Split out because
// the low/mid/high estimates differ only in which interchange point they use,
// and restating the arithmetic three times is how the three drift apart.
function passThroughAt(point, { monthlyVolume, transactions, cardPresentShare }) {
  const presentRate = RATE_MODEL.cardPresent[point];
  const notPresentRate = RATE_MODEL.cardNotPresent[point];
  const blendedRate = presentRate * cardPresentShare + notPresentRate * (1 - cardPresentShare);
  const interchange =
    monthlyVolume * blendedRate + transactions * RATE_MODEL.cardPresent.perTransaction;
  const assessments =
    monthlyVolume * RATE_MODEL.assessments.rate +
    transactions * RATE_MODEL.assessments.perTransaction;
  return { blendedRate, interchange, assessments, total: interchange + assessments };
}

/**
 * Audit one month of card processing.
 *
 * Every input arrives as a string from a form field, so each is coerced and
 * range-checked here rather than at the call site.
 */
export function auditStatement(input = {}) {
  const monthlyVolume = toNumber(input.monthlyVolume, 'card sales for the month', { min: 0.01 });
  const transactions = toNumber(input.transactions, 'the number of transactions', {
    min: 1,
    integer: true,
  });
  const totalFees = toNumber(input.totalFees, 'total processing fees');
  const cardPresentPercent = toNumber(input.cardPresentPercent, 'the card-present share', {
    min: 0,
    max: 100,
  });
  const fixedMonthlyFees = toNumber(input.fixedMonthlyFees ?? 0, 'the fixed monthly fees');

  // A statement cannot charge more in flat monthly fees than it charges in
  // total. Catching it here rather than letting it flow through keeps the
  // "fixed fees are N% of your fee bill" note from exceeding 100%, which
  // reads as a bug in the tool rather than a typo in the input.
  if (fixedMonthlyFees > totalFees) {
    throw new Error('Fixed monthly fees cannot exceed the total fees on the statement.');
  }

  const cardPresentShare = cardPresentPercent / 100;
  const shape = { monthlyVolume, transactions, cardPresentShare };

  const low = passThroughAt('low', shape);
  const mid = passThroughAt('mid', shape);
  const high = passThroughAt('high', shape);

  // Markup inverts the band: the HIGH pass-through estimate implies the LOW
  // markup. Getting this backwards would report the most flattering reading
  // of the statement as the worst case, which is the direction that would
  // send someone into a negotiation with a number they cannot defend.
  const markupLow = Math.max(0, totalFees - high.total);
  const markupMid = Math.max(0, totalFees - mid.total);
  const markupHigh = Math.max(0, totalFees - low.total);

  const effectiveRatePercent = (totalFees / monthlyVolume) * 100;
  const averageTicket = monthlyVolume / transactions;

  const quoteMarkupPercent = toNumber(
    input.quoteMarkupPercent ?? QUOTE_DEFAULTS.quoteMarkupPercent,
    'the quoted markup',
  );
  const quotePerTransaction = toNumber(
    input.quotePerTransaction ?? QUOTE_DEFAULTS.quotePerTransaction,
    'the quoted per-transaction fee',
  );
  const quoteMonthlyFees = toNumber(
    input.quoteMonthlyFees ?? QUOTE_DEFAULTS.quoteMonthlyFees,
    'the quoted monthly fees',
  );

  // The quote is priced on the SAME pass-through midpoint as the statement.
  // That is the only way the comparison is apples to apples: interchange is
  // identical under either processor, so a difference here is a difference in
  // what the processor keeps, never in what the networks charge.
  const quoteMonthlyCost =
    mid.total +
    monthlyVolume * (quoteMarkupPercent / 100) +
    transactions * quotePerTransaction +
    quoteMonthlyFees;
  const monthlyDifference = totalFees - quoteMonthlyCost;

  return {
    monthlyVolume,
    transactions,
    totalFees,
    cardPresentPercent,
    fixedMonthlyFees,
    averageTicket,
    effectiveRatePercent,
    costPerTransaction: totalFees / transactions,
    blendedInterchangeRatePercent: mid.blendedRate * 100,
    passThrough: { low: low.total, mid: mid.total, high: high.total },
    markup: { low: markupLow, mid: markupMid, high: markupHigh },
    markupRatePercent: {
      low: (markupLow / monthlyVolume) * 100,
      mid: (markupMid / monthlyVolume) * 100,
      high: (markupHigh / monthlyVolume) * 100,
    },
    // True when even the cheapest reading of the networks' share accounts for
    // the whole bill. Not "you are being overcharged nothing" -- it means the
    // statement is at or under what this model can explain, and the markup
    // figure has bottomed out at zero rather than gone negative.
    atOrBelowEstimatedPassThrough: totalFees <= high.total,
    fixedFeesAnnual: fixedMonthlyFees * 12,
    fixedFeesShareOfFeesPercent: totalFees > 0 ? (fixedMonthlyFees / totalFees) * 100 : 0,
    quote: {
      markupPercent: quoteMarkupPercent,
      perTransaction: quotePerTransaction,
      monthlyFees: quoteMonthlyFees,
      monthlyCost: quoteMonthlyCost,
      monthlyDifference,
      annualDifference: monthlyDifference * 12,
      effectiveRatePercent: (quoteMonthlyCost / monthlyVolume) * 100,
    },
  };
}

export function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function formatPercent(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number.toFixed(digits)}%`;
}

/**
 * The headline sentence. Phrased as an observation the reader acts on, never
 * as a determination made for them -- "roughly X of your bill is processor
 * markup", not "you are overpaying".
 */
export function auditMessage(result) {
  const rate = formatPercent(result.effectiveRatePercent);
  if (result.atOrBelowEstimatedPassThrough) {
    return (
      `Your effective rate is ${rate}. That is at or below the top of the estimated ` +
      `network pass-through for this volume and card mix, so this model cannot identify ` +
      `processor markup in it. Check the fixed monthly fees separately — they are charged ` +
      `whatever the rate says.`
    );
  }
  return (
    `Your effective rate is ${rate}. Of the ${formatMoney(result.totalFees)} charged this ` +
    `month, roughly ${formatMoney(result.passThrough.mid)} is what the card networks take ` +
    `regardless of processor, leaving about ${formatMoney(result.markup.mid)} ` +
    `(${formatPercent(result.markupRatePercent.mid)} of sales) as processor markup — the ` +
    `part a quote can change. Estimated range: ${formatMoney(result.markup.low)} to ` +
    `${formatMoney(result.markup.high)}.`
  );
}

/**
 * Two to four short observations tied to this statement's own shape. These
 * are the parts a rate comparison cannot say, and they are where most of the
 * recoverable money on a small merchant account actually sits.
 */
export function auditNotes(result) {
  const notes = [];

  if (result.fixedMonthlyFees > 0) {
    notes.push(
      `Fixed monthly fees of ${formatMoney(result.fixedMonthlyFees)} are ` +
        `${formatPercent(result.fixedFeesShareOfFeesPercent, 1)} of this month's bill and ` +
        `${formatMoney(result.fixedFeesAnnual)} a year. Statement, PCI, gateway and ` +
        `monthly-minimum fees are markup by another name: they do not fall when your rate does, ` +
        `so ask about them separately from the rate.`,
    );
  } else {
    notes.push(
      'No fixed monthly fees were entered. Statement, PCI-compliance, gateway, batch and ' +
        'monthly-minimum lines are easy to miss because they sit apart from the rate summary — ' +
        'worth a second look at the statement before trusting the split above.',
    );
  }

  if (result.averageTicket < 20) {
    notes.push(
      `Your average ticket is ${formatMoney(result.averageTicket)}. Below about $20 the ` +
        `per-transaction cents matter more than the percentage: at this ticket size a $0.10 ` +
        `difference per transaction moves your effective rate by roughly ` +
        `${formatPercent((0.1 / result.averageTicket) * 100)}. Compare quotes on cents first.`,
    );
  } else if (result.averageTicket > 150) {
    notes.push(
      `Your average ticket is ${formatMoney(result.averageTicket)}. At this size the ` +
        `percentage dominates and per-transaction cents barely register, so a quote that wins ` +
        `on the per-item fee and loses on the percentage is the wrong trade for you.`,
    );
  }

  if (result.cardPresentPercent < 50) {
    notes.push(
      `${formatPercent(100 - result.cardPresentPercent, 0)} of your volume is keyed or online. ` +
        `Card-not-present interchange is genuinely higher, so part of a rate that looks poor is ` +
        `not the processor's to give back. Address verification and passing full transaction ` +
        `data can move some of it; a different processor cannot.`,
    );
  }

  if (result.quote.annualDifference > 0) {
    notes.push(
      `Priced on this same month, the comparison quote would have cost ` +
        `${formatMoney(result.quote.monthlyCost)} — a difference of ` +
        `${formatMoney(result.quote.annualDifference)} a year. Volume varies month to month, so ` +
        `run a second statement before treating that as annual.`,
    );
  } else if (result.quote.annualDifference < 0) {
    notes.push(
      `Priced on this same month, the comparison quote would have cost ` +
        `${formatMoney(result.quote.monthlyCost)} — ` +
        `${formatMoney(Math.abs(result.quote.annualDifference))} a year more than you pay now. ` +
        `Your current pricing is ahead of that quote on this month's mix.`,
    );
  }

  return notes;
}
