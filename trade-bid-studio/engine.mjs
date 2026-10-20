// Pure, trade-agnostic bid arithmetic. No network, no state, no rate tables:
// every figure is the contractor's own input, so the result is a transparent
// calculation they can check against payroll and supplier invoices, not a
// claim about what any job "should" cost.
//
// The point of the engine is the distinction most one-line quotes blur:
// markup is a percentage of COST, margin is a percentage of PRICE. A 25%
// markup is only a 20% margin, and a contractor who thinks they are making a
// 25% margin is under-pricing every job by the gap.

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pct = v => Math.max(0, num(v)) / 100;
const round2 = v => Math.round((v + Number.EPSILON) * 100) / 100;

export function markupToMargin(markupPct) {
  const m = pct(markupPct);
  return round2((m / (1 + m)) * 100);
}

export function marginToMarkup(marginPct) {
  const g = Math.min(pct(marginPct), 0.99);
  return round2((g / (1 - g)) * 100);
}

// Cost build-up, then the three prices that matter.
//   walkAway   = full cost (labor + burden + materials + subs + other, plus
//                overhead). Below it the job loses money before profit.
//   price      = full cost grossed up so profit is `marginPct` of the PRICE.
//   atOffer    = what an offered/competitor price leaves you.
export function calculateBid(input = {}) {
  const laborHours = Math.max(0, num(input.laborHours));
  const wage = Math.max(0, num(input.wage));
  const burden = pct(input.burdenPct);
  const labor = laborHours * wage;
  const burdenCost = labor * burden;

  const materialsRaw = Math.max(0, num(input.materials));
  const materialsMarkup = materialsRaw * pct(input.materialMarkupPct);
  const subsRaw = Math.max(0, num(input.subs));
  const subsMarkup = subsRaw * pct(input.subMarkupPct);
  const other = Math.max(0, num(input.other));

  const directCost = labor + burdenCost + materialsRaw + subsRaw + other;
  const overhead = directCost * pct(input.overheadPct);
  const walkAway = directCost + overhead;

  const margin = Math.min(pct(input.marginPct), 0.95);
  const marginPrice = walkAway / (1 - margin);
  // Material/sub markups are pass-through add-ons on top of the margin price.
  const price = marginPrice + materialsMarkup + subsMarkup;

  const offered = Math.max(0, num(input.offeredPrice));
  const hasOffer = offered > 0;
  const offerProfit = offered - walkAway;

  return {
    labor: round2(labor), burden: round2(burdenCost), materials: round2(materialsRaw),
    subs: round2(subsRaw), other: round2(other), overhead: round2(overhead),
    directCost: round2(directCost), walkAway: round2(walkAway),
    price: round2(price), profit: round2(price - walkAway),
    effectiveMarginPct: price > 0 ? round2(((price - walkAway) / price) * 100) : 0,
    effectiveMarkupPct: walkAway > 0 ? round2(((price - walkAway) / walkAway) * 100) : 0,
    laborShareOfPricePct: price > 0 ? round2((labor + burdenCost) / price * 100) : 0,
    offer: hasOffer ? {
      price: round2(offered), profit: round2(offerProfit),
      marginPct: round2((offerProfit / offered) * 100),
      loses: offerProfit < 0,
      belowTarget: offered < price,
    } : null,
  };
}

// The overrun nobody prices in: how far labor can slip before the target
// profit is gone. A 10% hour overrun on a labor-heavy job is often the whole
// profit.
export function overrunToBreakEven(input = {}) {
  const base = calculateBid(input);
  const laborPlusBurden = base.labor + base.burden;
  if (laborPlusBurden <= 0) return null;
  const withOverhead = laborPlusBurden * (1 + pct(input.overheadPct));
  const cushion = base.price - base.walkAway; // profit at the quoted price
  return round2((cushion / withOverhead) * 100);
}

export const money = (v, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
