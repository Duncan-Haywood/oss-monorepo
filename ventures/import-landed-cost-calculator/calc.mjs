// Pure landed-cost arithmetic for a small importer's shipment. No network,
// no stored duty schedule, no HTS lookup: the duty rate and the supplemental
// (Section 301 / reciprocal) tariff rate are inputs you supply from your own
// HTS classification, not facts this file claims to know. That keeps the
// result a checkable calculation against your broker's entry summary rather
// than a claim about what CBP currently charges any given product.
//
// This is arithmetic only, never a customs classification or compliance
// tool. It does not determine an HTS code, a duty rate, or a compliance
// obligation -- it prices the numbers you already have.
//
// Customs value, for the arithmetic here, is item (commercial invoice) cost
// plus freight to the US port/border -- the common basis for most import
// styles. Valuation rules vary by terms of sale and mode of transport; a
// licensed customs broker confirms the correct basis for a specific entry.
// Insurance is not folded into that base -- it is priced as its own landed
// cost line, since whether it enters dutiable value depends on the terms of
// sale in a way this tool cannot know.

export const INPUT_FIELDS = [
  'itemCost',
  'freightCost',
  'insuranceCost',
  'quantity',
  'dutyRatePct',
  'supplementalRatePct',
  'brokerFee',
  'entryType',
  'oceanFreight',
  'sellPricePerUnit',
  'targetMarginPct',
];

export const ENTRY_TYPES = ['formal', 'informal'];

// Merchandise Processing Fee -- published CBP fee schedule, current as of
// this tool's last update. Confirm current figures at cbp.gov before relying
// on this for a real entry; CBP indexes these periodically.
export const MPF_FORMAL_RATE_PCT = 0.3464;
export const MPF_FORMAL_MIN = 32.71;
export const MPF_FORMAL_MAX = 634.62;
export const MPF_INFORMAL_FLAT = 2.62;

// Harbor Maintenance Fee -- ocean shipments only, published CBP fee
// schedule. Confirm current figures before relying on this for a real entry.
export const HMF_RATE_PCT = 0.125;

// Illustrative worked example ($5,000 goods, $800 freight, 500 units, 4.5%
// duty, 25% supplemental tariff, formal ocean entry). The duty and
// supplemental rates are placeholders to show the arithmetic, never a claim
// about any product's actual current rate -- look yours up at
// hts.usitc.gov or confirm with your broker.
export const LANDED_COST_DEFAULTS = {
  itemCost: 5000,
  freightCost: 800,
  insuranceCost: 0,
  quantity: 500,
  dutyRatePct: 4.5,
  supplementalRatePct: 25,
  brokerFee: 125,
  entryType: 'formal',
  oceanFreight: true,
  sellPricePerUnit: 24,
  targetMarginPct: 30,
};

function number(value, name, fallback) {
  const raw = value === undefined || value === null || value === '' ? fallback : value;
  const result = Number(raw);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
  return result;
}

function boolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return value === true || value === '1' || value === 'true' || value === 1;
}

function entryType(value, fallback) {
  const raw = value === undefined || value === null || value === '' ? fallback : value;
  if (!ENTRY_TYPES.includes(raw)) throw new Error(`Entry type must be one of ${ENTRY_TYPES.join(', ')}`);
  return raw;
}

// Merchandise Processing Fee. Formal entries are percentage-of-customs-value
// with a statutory floor and ceiling per entry; informal entries are a flat
// fee regardless of value.
export function calculateMpf(customsValue, entry) {
  if (entry === 'informal') return MPF_INFORMAL_FLAT;
  const raw = customsValue * MPF_FORMAL_RATE_PCT / 100;
  return Math.min(Math.max(raw, MPF_FORMAL_MIN), MPF_FORMAL_MAX);
}

// Harbor Maintenance Fee -- charged on ocean shipments only, regardless of
// formal/informal entry type.
export function calculateHmf(customsValue, ocean) {
  return ocean ? customsValue * HMF_RATE_PCT / 100 : 0;
}

/**
 * Full landed-cost breakdown for one shipment. Every dutiable-value or
 * fee-schedule figure is broken out on its own line so the result can be
 * checked line by line against a broker's entry summary, rather than
 * handed over as a single opaque number.
 */
export function calculateLandedCost(input = {}) {
  const itemCost = number(input.itemCost, 'Item cost', 0);
  const freightCost = number(input.freightCost, 'Freight cost', 0);
  const insuranceCost = number(input.insuranceCost, 'Insurance cost', 0);
  const quantity = number(input.quantity, 'Quantity', 1);
  // A field cleared mid-edit falls back to the illustrated worked-example
  // rate/fee rather than snapping to zero -- a blank duty rate reading as
  // "0% duty" would look like a real determination instead of an
  // in-progress edit. See LANDED_COST_DEFAULTS; the disclaimer already says
  // these are placeholders, not a claim about anyone's actual rate.
  const dutyRatePct = number(input.dutyRatePct, 'Duty rate', LANDED_COST_DEFAULTS.dutyRatePct);
  const supplementalRatePct = number(input.supplementalRatePct, 'Supplemental tariff rate', LANDED_COST_DEFAULTS.supplementalRatePct);
  const brokerFee = number(input.brokerFee, 'Broker / entry fee', LANDED_COST_DEFAULTS.brokerFee);
  // Selling price is optional: blank means "do not show a margin". The
  // target margin falls back to the worked-example figure like the rates do.
  const sellPricePerUnit = input.sellPricePerUnit === undefined || input.sellPricePerUnit === null || input.sellPricePerUnit === ''
    ? null : number(input.sellPricePerUnit, 'Selling price per unit', 0);
  const targetMarginPct = number(input.targetMarginPct, 'Target margin', LANDED_COST_DEFAULTS.targetMarginPct);
  if (targetMarginPct >= 100) throw new Error('Target margin must be under 100%');
  const entry = entryType(input.entryType, 'formal');
  const ocean = boolean(input.oceanFreight, false);

  if (quantity < 1) {
    throw new Error('Quantity must be at least 1 unit -- landed cost per unit is undefined at zero');
  }
  if (!Number.isInteger(quantity)) {
    throw new Error('Quantity must be a whole number of units');
  }

  // Customs value for dutiable purposes: item cost plus freight to the
  // port/border. See the module note above -- this basis varies by terms of
  // sale and a broker should confirm it for a specific shipment.
  const customsValue = itemCost + freightCost;

  const duty = customsValue * dutyRatePct / 100;
  const supplementalTariff = customsValue * supplementalRatePct / 100;
  const mpf = calculateMpf(customsValue, entry);
  const hmf = calculateHmf(customsValue, ocean);

  const fees = { duty, supplementalTariff, mpf, hmf, brokerFee, total: duty + supplementalTariff + mpf + hmf + brokerFee };

  const totalLandedCost = itemCost + freightCost + insuranceCost + fees.total;
  const perUnitLandedCost = totalLandedCost / quantity;

  // The number sellers care about most: government-imposed duty and fees as
  // a share of the invoice value, not counting freight, insurance, or the
  // broker's own service fee (those are logistics costs, not tariff burden).
  const tariffBurden = duty + supplementalTariff + mpf + hmf;
  const effectiveTariffBurdenPct = itemCost === 0 ? 0 : tariffBurden / itemCost * 100;

  // Pricing: what the landed cost means for the shelf price. Margin is
  // profit / selling price (not markup). Marketplace fees, shipping to the
  // customer and ad spend are not modelled -- subtract them yourself.
  const pricing = {
    sellPricePerUnit,
    profitPerUnit: sellPricePerUnit === null ? null : sellPricePerUnit - perUnitLandedCost,
    marginPct: sellPricePerUnit === null || sellPricePerUnit === 0 ? null : (sellPricePerUnit - perUnitLandedCost) / sellPricePerUnit * 100,
    totalProfit: sellPricePerUnit === null ? null : (sellPricePerUnit - perUnitLandedCost) * quantity,
    targetMarginPct,
    minPriceForTarget: perUnitLandedCost / (1 - targetMarginPct / 100),
    // Price at which the shipment merely recovers its landed cost.
    breakEvenPrice: perUnitLandedCost,
  };

  return {
    pricing,
    itemCost,
    freightCost,
    insuranceCost,
    quantity,
    dutyRatePct,
    supplementalRatePct,
    entryType: entry,
    oceanFreight: ocean,
    customsValue,
    fees,
    totalLandedCost,
    perUnitLandedCost,
    tariffBurden,
    effectiveTariffBurdenPct,
  };
}

/**
 * Ordered [label, amount] rows for the breakdown table -- one line per
 * component of total landed cost, in the order a seller would want to check
 * them against a broker's entry summary.
 */
export function breakdownRows(result) {
  return [
    ['Item cost', result.itemCost],
    ['Freight to port', result.freightCost],
    ['Insurance', result.insuranceCost],
    ['Duty', result.fees.duty],
    ['Supplemental / Section 301 tariff', result.fees.supplementalTariff],
    ['Merchandise Processing Fee', result.fees.mpf],
    ['Harbor Maintenance Fee', result.fees.hmf],
    ['Customs broker / entry fee', result.fees.brokerFee],
    ['Total landed cost', result.totalLandedCost],
  ];
}

/**
 * One customs entry carrying several products (HTS lines). Duty and the
 * supplemental tariff are per line, each at its own rate. Freight and
 * insurance are shared and split across lines in proportion to item cost.
 * The Merchandise Processing Fee, Harbor Maintenance Fee and broker fee are
 * charged once per entry -- the MPF floor and ceiling apply to the entry's
 * total customs value, not to each line -- and are then split across lines by
 * customs value so each product shows its own landed cost per unit.
 *
 * Lines: [{ name, itemCost, quantity, dutyRatePct, supplementalRatePct }].
 * Shared: { freightCost, insuranceCost, brokerFee, entryType, oceanFreight }.
 */
export function calculateEntry(lines, shared = {}) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('Add at least one product line');
  const freightCost = number(shared.freightCost, 'Freight cost', 0);
  const insuranceCost = number(shared.insuranceCost, 'Insurance cost', 0);
  const brokerFee = number(shared.brokerFee, 'Broker / entry fee', LANDED_COST_DEFAULTS.brokerFee);
  const entry = entryType(shared.entryType, 'formal');
  const ocean = boolean(shared.oceanFreight, false);

  const parsed = lines.map((line, i) => {
    const label = line.name || `Line ${i + 1}`;
    const quantity = number(line.quantity, `${label}: quantity`, 1);
    if (quantity < 1 || !Number.isInteger(quantity)) throw new Error(`${label}: quantity must be a whole number of at least 1`);
    return {
      name: label,
      itemCost: number(line.itemCost, `${label}: item cost`, 0),
      quantity,
      dutyRatePct: number(line.dutyRatePct, `${label}: duty rate`, LANDED_COST_DEFAULTS.dutyRatePct),
      supplementalRatePct: number(line.supplementalRatePct, `${label}: supplemental rate`, 0),
    };
  });

  const totalItemCost = parsed.reduce((s, l) => s + l.itemCost, 0);
  const share = l => (totalItemCost === 0 ? 1 / parsed.length : l.itemCost / totalItemCost);
  const withValue = parsed.map(l => {
    const freight = freightCost * share(l);
    const insurance = insuranceCost * share(l);
    return { ...l, freight, insurance, customsValue: l.itemCost + freight };
  });
  const customsValue = withValue.reduce((s, l) => s + l.customsValue, 0);
  const mpf = calculateMpf(customsValue, entry);
  const hmf = calculateHmf(customsValue, ocean);
  const vshare = l => (customsValue === 0 ? 1 / withValue.length : l.customsValue / customsValue);

  const out = withValue.map(l => {
    const duty = l.customsValue * l.dutyRatePct / 100;
    const supplementalTariff = l.customsValue * l.supplementalRatePct / 100;
    const entryFees = (mpf + hmf + brokerFee) * vshare(l);
    const totalLandedCost = l.itemCost + l.freight + l.insurance + duty + supplementalTariff + entryFees;
    return { ...l, duty, supplementalTariff, entryFees, totalLandedCost, perUnitLandedCost: totalLandedCost / l.quantity };
  });

  const duties = out.reduce((s, l) => s + l.duty + l.supplementalTariff, 0);
  const totalLandedCost = out.reduce((s, l) => s + l.totalLandedCost, 0);
  const tariffBurden = duties + mpf + hmf;
  return {
    lines: out,
    customsValue,
    fees: { duty: out.reduce((s, l) => s + l.duty, 0), supplementalTariff: out.reduce((s, l) => s + l.supplementalTariff, 0), mpf, hmf, brokerFee },
    totalLandedCost,
    tariffBurden,
    effectiveTariffBurdenPct: totalItemCost === 0 ? 0 : tariffBurden / totalItemCost * 100,
  };
}
