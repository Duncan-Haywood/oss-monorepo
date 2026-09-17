// Pure estate-sale settlement arithmetic. No network, no stored company data.
//
// Estate sale companies typically price on a tiered commission schedule
// rather than one flat rate -- e.g. 40% on the first $2,000 of gross sales,
// 30% on the next $6,000, 25% above that -- plus flat fees a headline
// commission number does not include: a setup/staging fee, a credit-card
// processing pass-through, and a haul-away/donation fee for unsold items.
// A family comparing two companies' quotes is comparing two different tier
// schedules and different fee stacks against the same estimated sale total,
// which "we charge 30%" hides. Some contracts also promise a minimum
// guaranteed payout regardless of how the tiers and fees compute -- this
// module applies that floor when it is entered.
//
// Every function here is pure and synchronous; the page supplies today's
// quoted numbers and this module never stores or fetches them.

export const QUOTE_FIELD_IDS = Object.freeze([
  'tier1Rate', 'tier1Threshold',
  'tier2Rate', 'tier2Threshold',
  'tier3Rate',
  'setupFee', 'cardProcessingFee', 'haulAwayFee',
  'minimumGuarantee',
]);

export const INPUT_IDS = Object.freeze(['grossSale', ...QUOTE_FIELD_IDS]);

function prefixed(id, prefix) {
  return `${prefix}${id[0].toUpperCase()}${id.slice(1)}`;
}

export const B_INPUT_IDS = Object.freeze(QUOTE_FIELD_IDS.map(id => prefixed(id, 'b')));

function isBlank(value) {
  return value === '' || value === null || value === undefined || String(value).trim() === '';
}

function number(value, name, { min = 0, allowBlank = false, blankValue = 0 } = {}) {
  if (isBlank(value)) {
    if (allowBlank) return blankValue;
    throw new Error(`${name} is required`);
  }
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  return result;
}

/**
 * Splits a gross sale total across up to three commission tiers and returns
 * the commission owed. `tier1Threshold` is where tier 1 ends and tier 2
 * begins; `tier2Threshold` is where tier 2 ends and tier 3 (uncapped) takes
 * over. A company quoting a single flat rate is entered as tier1Rate with
 * tier1Threshold set at or above the estimated gross sale, leaving tiers 2
 * and 3 untouched.
 */
export function tieredCommission(grossSale, tier1Rate, tier1Threshold, tier2Rate, tier2Threshold, tier3Rate) {
  const t1Base = Math.min(grossSale, tier1Threshold);
  const t2Base = Math.min(Math.max(grossSale - tier1Threshold, 0), Math.max(tier2Threshold - tier1Threshold, 0));
  const t3Base = Math.max(grossSale - Math.max(tier1Threshold, tier2Threshold), 0);
  const commission = t1Base * (tier1Rate / 100) + t2Base * (tier2Rate / 100) + t3Base * (tier3Rate / 100);
  return { t1Base, t2Base, t3Base, commission };
}

/** One company's quote against one estimated gross sale total. */
export function calculateSettlement(input) {
  const errors = [];
  const read = (id, label, opts) => {
    try {
      return number(input[id], label, opts);
    } catch (error) {
      errors.push({ id, message: error.message });
      return 0;
    }
  };

  const grossSale = read('grossSale', 'Estimated gross sale total');
  const tier1Rate = read('tier1Rate', 'Tier 1 commission rate', { allowBlank: true });
  const tier1Threshold = read('tier1Threshold', 'Tier 1 threshold', { allowBlank: true });
  const tier2Rate = read('tier2Rate', 'Tier 2 commission rate', { allowBlank: true });
  const tier2Threshold = read('tier2Threshold', 'Tier 2 threshold', { allowBlank: true });
  const tier3Rate = read('tier3Rate', 'Tier 3 (above threshold) commission rate', { allowBlank: true });
  const setupFee = read('setupFee', 'Setup / staging fee', { allowBlank: true });
  const cardProcessingFee = read('cardProcessingFee', 'Credit card processing fee', { allowBlank: true });
  const haulAwayFee = read('haulAwayFee', 'Haul-away / donation fee', { allowBlank: true });
  const minimumGuarantee = read('minimumGuarantee', 'Minimum guarantee', { allowBlank: true });

  if (errors.length) return { ok: false, errors };

  const { t1Base, t2Base, t3Base, commission } = tieredCommission(
    grossSale, tier1Rate, tier1Threshold, tier2Rate, tier2Threshold, tier3Rate,
  );
  const fees = setupFee + cardProcessingFee + haulAwayFee;
  const rawNet = grossSale - commission - fees;
  const guaranteeApplied = minimumGuarantee > 0 && rawNet < minimumGuarantee;
  const net = guaranteeApplied ? minimumGuarantee : rawNet;
  const totalRetained = grossSale > 0 ? ((grossSale - net) / grossSale) * 100 : 0;

  const notes = [];
  if (guaranteeApplied) {
    notes.push(`The computed settlement ($${rawNet.toFixed(2)}) is below the $${minimumGuarantee.toFixed(2)} minimum guarantee, so the guarantee applies. Confirm in the contract that the guarantee is a binding term, not a marketing figure.`);
  }
  if (net < 0) {
    notes.push('This quote projects a negative settlement -- commission and fees exceed the estimated sale total.');
  }
  if (t3Base > 0 && tier3Rate === 0) {
    notes.push('Sales above the tier 2 threshold are priced at 0% -- confirm the contract really caps commission there rather than this field being unset.');
  }

  return {
    ok: true, errors: [],
    grossSale, commission, fees, setupFee, cardProcessingFee, haulAwayFee,
    rawNet, net, guaranteeApplied, totalRetained,
    t1Base, t2Base, t3Base,
    notes,
  };
}

/**
 * Compares two companies' quotes against the same estimated gross sale
 * total. `input` carries the primary (unprefixed) quote fields plus a
 * `b`-prefixed copy for the second company, e.g. `bTier1Rate`.
 */
export function compareQuotes(input) {
  const a = calculateSettlement({
    grossSale: input.grossSale,
    ...Object.fromEntries(QUOTE_FIELD_IDS.map(id => [id, input[id]])),
  });
  const b = calculateSettlement({
    grossSale: input.grossSale,
    ...Object.fromEntries(QUOTE_FIELD_IDS.map(id => [id, input[prefixed(id, 'b')]])),
  });
  if (!a.ok || !b.ok) return { ok: false, errors: [...a.errors, ...b.errors] };

  const difference = a.net - b.net;
  return {
    ok: true, errors: [], a, b, difference,
    better: difference === 0 ? 'tie' : (difference > 0 ? 'a' : 'b'),
  };
}
