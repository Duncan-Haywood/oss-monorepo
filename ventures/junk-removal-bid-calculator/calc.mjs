// Pure bid arithmetic for an independent junk-hauling job. No network, no
// state: every density, dump rate, and wage is an input, so the result stays
// a transparent calculation the hauler can check against a real dump ticket
// rather than a claim about what any cleanout "should" cost.
//
// The method is the one the trade actually loses money on when it skips it:
// estimate weight from the material, price the dump ticket from tons (with
// the landfill's minimum and surcharge), then layer labor, travel, and the
// dump run. A flat "half truck" special cannot see that two yards of
// concrete weigh more than a whole trailer of couches — and the landfill
// bills the weight, not the picture of the truck.

export const LBS_PER_TON = 2000;

// Ballpark loose densities and per-item dump add-ons. These are starting
// points, NOT a landfill tariff or a guarantee. Real weight depends on how
// packed the load is, how wet it is, and what the transfer station actually
// charges for that commodity. Haulers should replace them with figures from
// their own tickets.
export const MATERIAL_PRESETS = Object.freeze([
  { label: 'Mixed household junk', unit: 'cubic_yards', lbsPerUnit: 200, specialFeeEach: 0, cubicYardsEach: 0 },
  { label: 'Furniture / bulky items', unit: 'cubic_yards', lbsPerUnit: 125, specialFeeEach: 0, cubicYardsEach: 0 },
  { label: 'Construction debris (C&D)', unit: 'cubic_yards', lbsPerUnit: 400, specialFeeEach: 0, cubicYardsEach: 0 },
  { label: 'Drywall / gypsum', unit: 'cubic_yards', lbsPerUnit: 420, specialFeeEach: 0, cubicYardsEach: 0 },
  { label: 'Yard waste / green waste', unit: 'cubic_yards', lbsPerUnit: 350, specialFeeEach: 0, cubicYardsEach: 0 },
  { label: 'Dirt / soil / fill', unit: 'cubic_yards', lbsPerUnit: 2200, specialFeeEach: 0, cubicYardsEach: 0 },
  { label: 'Concrete / masonry', unit: 'cubic_yards', lbsPerUnit: 4000, specialFeeEach: 0, cubicYardsEach: 0 },
  { label: 'Roofing shingles', unit: 'cubic_yards', lbsPerUnit: 2500, specialFeeEach: 0, cubicYardsEach: 0 },
  { label: 'Appliance (each)', unit: 'each', lbsPerUnit: 200, specialFeeEach: 25, cubicYardsEach: 1.5 },
  { label: 'Mattress / box spring (each)', unit: 'each', lbsPerUnit: 80, specialFeeEach: 20, cubicYardsEach: 1 },
  { label: 'Tire (each)', unit: 'each', lbsPerUnit: 25, specialFeeEach: 12, cubicYardsEach: 0.25 },
]);

export const UNIT_LABELS = Object.freeze({
  cubic_yards: 'cu yd',
  each: 'each',
});

function number(value, name, { min = 0, allowZero = true, max = Infinity } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (result > max) throw new Error(`${name} must be at most ${max}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function dumpRunsFor(totalCubicYards, truckCapacity) {
  if (totalCubicYards <= 0) return 0;
  return Math.max(1, Math.ceil(totalCubicYards / truckCapacity));
}

/**
 * Price a junk-removal job from its piles, dump tariff, and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, quantity: number, unit?: string, lbsPerUnit: number, specialFeeEach?: number, cubicYardsEach?: number}>} input.piles
 *   One row per material. Splitting mixed household from concrete is the
 *   whole point: a single "truck load" rate hides the dump ticket.
 * @param {number} input.truckCapacityCubicYards
 * @param {number} input.dumpFeePerTon
 * @param {number} input.dumpMinimum
 * @param {number} input.surchargeRate          Environmental / host-fee % on the dump ticket.
 * @param {number} input.onSiteHours            Clock time on the property, before stairs and carry.
 * @param {number} input.stairsFlights
 * @param {number} input.minutesPerFlight
 * @param {number} input.longCarryMinutes       Extra clock time for a long walk from the pile to the truck.
 * @param {number} input.oneWayMinutes          Drive to the job. Round-trip is applied.
 * @param {number} input.dumpMinutes            One dump-run clock time, applied per run.
 * @param {number} input.crewSize
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate
 * @param {number} input.fuelPerJob
 * @param {number} input.otherJobCost
 * @param {number} input.overheadRate           Business overhead as a % on direct cost.
 * @param {number} input.targetMargin           Net profit as a % of the final price.
 * @param {number} input.minimumCharge          Floor bid. Many haulers will not roll a truck under this.
 * @param {number|null} input.proposedPrice     Optional price already on the table.
 */
export function calculateBid(input) {
  const pilesInput = Array.isArray(input.piles) ? input.piles : [];
  if (pilesInput.length === 0) throw new Error('Add at least one pile to price');

  const truckCapacity = number(input.truckCapacityCubicYards ?? 0, 'Truck capacity', { allowZero: false });
  const dumpFeePerTon = number(input.dumpFeePerTon ?? 0, 'Dump fee per ton');
  const dumpMinimum = number(input.dumpMinimum ?? 0, 'Dump minimum');
  const surchargeRate = number(input.surchargeRate ?? 0, 'Dump surcharge');
  const onSiteHours = number(input.onSiteHours ?? 0, 'On-site hours');
  const stairsFlights = number(input.stairsFlights ?? 0, 'Stair flights');
  const minutesPerFlight = number(input.minutesPerFlight ?? 0, 'Minutes per flight');
  const longCarryMinutes = number(input.longCarryMinutes ?? 0, 'Long-carry minutes');
  const oneWayMinutes = number(input.oneWayMinutes ?? 0, 'One-way travel');
  const dumpMinutes = number(input.dumpMinutes ?? 0, 'Dump-run minutes');
  const crewSize = number(input.crewSize ?? 1, 'Crew size', { min: 1, allowZero: false });
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const fuelPerJob = number(input.fuelPerJob ?? 0, 'Fuel');
  const otherJobCost = number(input.otherJobCost ?? 0, 'Other job cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  const minimumCharge = number(input.minimumCharge ?? 0, 'Minimum charge');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const piles = pilesInput.map((pile, index) => {
    const label = pile.name?.trim() || `Pile ${index + 1}`;
    const unit = pile.unit === 'each' ? 'each' : 'cubic_yards';
    const quantity = number(pile.quantity ?? 0, `${label}: quantity`);
    const lbsPerUnit = number(pile.lbsPerUnit ?? 0, `${label}: pounds per unit`);
    const specialFeeEach = number(pile.specialFeeEach ?? 0, `${label}: special dump fee`);
    const cubicYardsEach = number(pile.cubicYardsEach ?? 0, `${label}: cubic yards each`);
    const cubicYards = unit === 'each' ? quantity * cubicYardsEach : quantity;
    const pounds = quantity * lbsPerUnit;
    const specialFees = unit === 'each' ? quantity * specialFeeEach : 0;
    return {
      name: label,
      unit,
      quantity,
      lbsPerUnit,
      specialFeeEach,
      cubicYardsEach,
      cubicYards,
      pounds,
      tons: pounds / LBS_PER_TON,
      specialFees,
    };
  });

  const totalCubicYards = piles.reduce((sum, pile) => sum + pile.cubicYards, 0);
  const totalPounds = piles.reduce((sum, pile) => sum + pile.pounds, 0);
  const estimatedTons = totalPounds / LBS_PER_TON;
  const specialFees = piles.reduce((sum, pile) => sum + pile.specialFees, 0);
  const dumpRuns = dumpRunsFor(totalCubicYards, truckCapacity);

  // The transfer station bills the greater of its per-ton rate and its
  // minimum ticket. A light furniture load still pays the minimum; a
  // concrete load pays the tons.
  const dumpTicket = Math.max(dumpMinimum, estimatedTons * dumpFeePerTon);
  const dumpSurcharge = dumpTicket * surchargeRate / 100;
  const dumpCost = dumpTicket + dumpSurcharge + specialFees;

  const stairsHours = stairsFlights * minutesPerFlight / 60;
  const longCarryHours = longCarryMinutes / 60;
  const travelHours = oneWayMinutes * 2 / 60;
  const dumpHours = dumpRuns * dumpMinutes / 60;
  const clockHours = onSiteHours + stairsHours + longCarryHours + travelHours + dumpHours;
  const personHours = clockHours * crewSize;
  const laborCost = personHours * loadedWage;

  const directCost = laborCost + dumpCost + fuelPerJob + otherJobCost;
  const overhead = directCost * overheadRate / 100;
  const jobCost = directCost + overhead;
  const marginPrice = jobCost / (1 - targetMargin / 100);
  // A posted minimum is a floor on the customer's number, not a substitute
  // for knowing cost. Walk-away stays at cost so a "$149 special" that
  // costs $180 still shows as a loss.
  const bidPrice = Math.max(marginPrice, minimumCharge);
  const minimumApplied = minimumCharge > marginPrice;
  const profit = bidPrice - jobCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    piles: piles.map(pile => ({
      ...pile,
      weightShare: totalPounds === 0 ? 0 : pile.pounds / totalPounds * 100,
      volumeShare: totalCubicYards === 0 ? 0 : pile.cubicYards / totalCubicYards * 100,
    })),
    totalCubicYards,
    totalPounds,
    estimatedTons,
    truckLoads: totalCubicYards === 0 ? 0 : totalCubicYards / truckCapacity,
    dumpRuns,
    dumpTicket,
    dumpSurcharge,
    specialFees,
    dumpCost,
    loadedWage,
    onSiteHours,
    stairsHours,
    longCarryHours,
    travelHours,
    dumpHours,
    clockHours,
    personHours,
    laborCost,
    fuelPerJob,
    otherJobCost,
    overhead,
    jobCost,
    marginPrice,
    minimumCharge,
    minimumApplied,
    bidPrice,
    profit,
    pricePerCubicYard: totalCubicYards === 0 ? null : bidPrice / totalCubicYards,
    effectiveHourlyRate: personHours === 0 ? null : bidPrice / personHours,
    breakEvenPrice: jobCost,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - jobCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - jobCost) / proposedPrice * 100,
      hourlyRate: personHours === 0 ? null : proposedPrice / personHours,
      belowBreakEven: proposedPrice < jobCost,
    },
  };
}

function money(value) {
  const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Plain-text bid draft a hauler can paste into a text or estimate. The
 * figures are the same ones on screen; this does not invent scope language
 * or promise a dump ticket.
 */
export function formatBidSummary(result) {
  const piles = result.piles
    .filter(pile => pile.quantity > 0)
    .map(pile => {
      const qty = pile.unit === 'each'
        ? `${pile.quantity} each`
        : `${pile.cubicYards.toFixed(1)} cu yd`;
      return `- ${pile.name}: ${qty}, ~${pile.tons.toFixed(2)} tons`;
    })
    .join('\n');
  return [
    'JUNK REMOVAL BID',
    '',
    `Proposed job price: ${money(result.bidPrice)}`,
    `Estimated volume: ${result.totalCubicYards.toFixed(1)} cu yd (${result.truckLoads.toFixed(2)} truck loads)`,
    `Estimated weight: ${result.estimatedTons.toFixed(2)} tons`,
    `Dump ticket (from your rates): ${money(result.dumpCost)}`,
    `Crew time: ${result.clockHours.toFixed(2)} clock hours, ${result.personHours.toFixed(2)} person-hours`,
    result.pricePerCubicYard === null ? 'Price per cubic yard: n/a' : `Price per cubic yard: ${money(result.pricePerCubicYard)}`,
    '',
    'LOAD',
    piles || '- No piles entered',
    '',
    'This is a draft for review. Confirm the load, dump commodity, access, and all pricing before sending. Weight is an estimate until the scale ticket prints.',
  ].join('\n');
}
