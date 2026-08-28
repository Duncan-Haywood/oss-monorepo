// Pure bid arithmetic for a pressure-washing / soft-wash job. No network, no
// state: every rate, wage, surface, and travel figure is an input, so the
// result stays a transparent calculation the contractor can check against
// their own payroll and chemical invoices rather than a claim about what any
// driveway or house "should" cost.
//
// The method is the one the trade actually loses money on when it is skipped:
// each surface divided by its own production rate, plus the drive and the
// setup that never show up on a per-square-foot rule of thumb. A $200
// driveway with forty minutes of driving each way is a different job from a
// $200 driveway around the corner, and a flat "driveways are $0.20 a foot"
// quote cannot see the difference.

// Common starting points for production rates, in square feet one technician
// covers per hour, and a typical chemical spend per square foot for that
// surface. These are ballpark figures to start from, NOT an industry
// standard or a guarantee: real rates depend on equipment, dwell time, soil,
// storey height, and how much hand work the job actually needs. Contractors
// should replace them with rates timed from their own crews.
export const SURFACE_PRESETS = Object.freeze([
  { label: 'Concrete driveway', rate: 1000, chemicalPerSqFt: 0.015 },
  { label: 'Oil-stained concrete', rate: 400, chemicalPerSqFt: 0.04 },
  { label: 'Sidewalk / walkway', rate: 900, chemicalPerSqFt: 0.012 },
  { label: 'House siding (soft wash)', rate: 500, chemicalPerSqFt: 0.02 },
  { label: 'Wood deck', rate: 350, chemicalPerSqFt: 0.025 },
  { label: 'Vinyl / wood fence', rate: 500, chemicalPerSqFt: 0.01 },
  { label: 'Patio / pavers', rate: 450, chemicalPerSqFt: 0.02 },
  { label: 'Roof (soft wash)', rate: 250, chemicalPerSqFt: 0.03 },
  { label: 'Parking lot (surface cleaner)', rate: 2000, chemicalPerSqFt: 0.008 },
  { label: 'Dumpster pad / grease', rate: 200, chemicalPerSqFt: 0.05 },
]);

// After-travel hourly rates a contractor typically sanity-checks a bid
// against. The bid at each rate is just that hourly times total hours
// (wash + travel + setup) — the number they would have to charge to actually
// take that rate home after the drive.
export const AFTER_TRAVEL_HOURLY_TARGETS = Object.freeze([40, 50, 60, 75]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * Price a one-time pressure-washing job from its surfaces, travel, and costs.
 *
 * @param {object} input
 * @param {Array<{name?: string, squareFeet: number, productionRate: number, chemicalCost?: number}>} input.surfaces
 *   One row per distinct surface. Splitting the job this way is the whole
 *   point: a house wash is not a driveway, and a blended square-foot price
 *   hides the siding hours that eat the day.
 * @param {number} input.hourlyWage         What the technician is paid per hour.
 * @param {number} input.burdenRate         Payroll burden as a % on top of wage.
 * @param {number} input.roundTripMinutes   Drive time there and back.
 * @param {number} input.setupMinutes       Unload, mask, connect, pack-up.
 * @param {number} input.waterCost          Hydrant / meter / tank water for this job.
 * @param {number} input.equipmentWear      Wear, fuel, and tips allocated to this job.
 * @param {number} input.otherCost          Anything else billed to this job.
 * @param {number} input.overheadRate       Business overhead as a % on direct cost.
 * @param {number} input.targetMargin       Net profit as a % of the final price.
 * @param {number} input.minimumJob         Floor bid — mobilization is not free.
 * @param {number|null} input.proposedPrice Optional: a price already on the table.
 * @param {number} [input.packageVisits=1]  Visits in a maintenance package (1 = one-time).
 * @param {number} [input.packageDiscount=0] Percent off the one-time bid for a package visit.
 */
export function calculateBid(input) {
  const surfacesInput = Array.isArray(input.surfaces) ? input.surfaces : [];
  if (surfacesInput.length === 0) throw new Error('Add at least one surface to price');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const roundTripMinutes = number(input.roundTripMinutes ?? 0, 'Round-trip drive time');
  const setupMinutes = number(input.setupMinutes ?? 0, 'Setup time');
  const waterCost = number(input.waterCost ?? 0, 'Water cost');
  const equipmentWear = number(input.equipmentWear ?? 0, 'Equipment wear');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  const minimumJob = number(input.minimumJob ?? 0, 'Minimum job');
  const packageVisits = number(input.packageVisits ?? 1, 'Package visits');
  const packageDiscount = number(input.packageDiscount ?? 0, 'Package discount');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  if (packageDiscount >= 100) throw new Error('Package discount must be less than 100%');
  if (packageVisits < 1) throw new Error('Package visits must be at least 1');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const surfaces = surfacesInput.map((surface, index) => {
    const label = surface.name?.trim() || `Surface ${index + 1}`;
    const squareFeet = number(surface.squareFeet ?? 0, `${label}: square feet`);
    // A zero production rate would divide by zero and report a free wash, so
    // it is rejected rather than defaulted — the contractor has to state how
    // fast the surface actually washes.
    const productionRate = number(
      surface.productionRate ?? 0,
      `${label}: production rate`,
      { allowZero: false },
    );
    const chemicalCost = number(surface.chemicalCost ?? 0, `${label}: chemical cost`);
    const washHours = squareFeet / productionRate;
    return {
      name: label,
      squareFeet,
      productionRate,
      chemicalCost,
      washHours,
      laborCost: washHours * loadedWage,
    };
  });

  const totalSquareFeet = surfaces.reduce((sum, s) => sum + s.squareFeet, 0);
  const washHours = surfaces.reduce((sum, s) => sum + s.washHours, 0);
  const travelHours = roundTripMinutes / 60;
  const setupHours = setupMinutes / 60;
  const totalHours = washHours + travelHours + setupHours;
  const chemicalCost = surfaces.reduce((sum, s) => sum + s.chemicalCost, 0);

  const laborCost = totalHours * loadedWage;
  const directCost = laborCost + chemicalCost + waterCost + equipmentWear + otherCost;
  // Overhead is a markup on the direct cost of this job — office, ads, and
  // the truck payment. It is deliberately not applied to itself or to profit.
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;

  // Margin is a share of price, not a markup on cost, because that is how the
  // customer's number is quoted and how the contractor's P&L reads it.
  const targetPrice = totalCost / (1 - targetMargin / 100);
  // A minimum exists because mobilization is a real cost even on a tiny pad.
  // The bid is the greater of the margin-priced number and that floor.
  const bidPrice = Math.max(targetPrice, minimumJob);
  const minimumApplied = bidPrice > targetPrice && minimumJob > targetPrice;
  const profit = bidPrice - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const afterTravelHourly = totalHours === 0 ? null : bidPrice / totalHours;
  const onSiteHourly = washHours === 0 ? null : bidPrice / washHours;

  const rateCard = AFTER_TRAVEL_HOURLY_TARGETS.map((hourly) => {
    const price = hourly * totalHours;
    return {
      hourly,
      price,
      profit: price - totalCost,
      coversCost: price >= totalCost,
      belowMinimum: price < minimumJob,
    };
  });

  const packageEach = bidPrice * (1 - packageDiscount / 100);
  const packageAnnual = packageEach * packageVisits;

  return {
    surfaces: surfaces.map((surface) => ({
      ...surface,
      // Share of wash hours (not total hours). This is the line that shows
      // a contractor that the house siding is most of the day even when the
      // customer called about the driveway.
      hoursShare: washHours === 0 ? 0 : surface.washHours / washHours * 100,
    })),
    totalSquareFeet,
    loadedWage,
    washHours,
    travelHours,
    setupHours,
    totalHours,
    laborCost,
    chemicalCost,
    waterCost,
    equipmentWear,
    otherCost,
    overhead,
    totalCost,
    targetPrice,
    bidPrice,
    minimumJob,
    minimumApplied,
    profit,
    annualPackageEach: packageEach,
    annualPackageTotal: packageAnnual,
    packageVisits,
    packageDiscount,
    // The two sanity numbers: what the bid works out to per square foot, and
    // what they actually bill per hour after the drive. The second is the
    // one a per-square-foot quote hides.
    pricePerSqFt: totalSquareFeet === 0 ? null : bidPrice / totalSquareFeet,
    afterTravelHourly,
    onSiteHourly,
    travelShare: totalHours === 0 ? 0 : (travelHours + setupHours) / totalHours * 100,
    // Price at which the job stops making money — the walk-away number to
    // hold when a homeowner asks them to sharpen their pencil. The minimum
    // job is a separate floor; walk-away is still cost.
    breakEvenPrice: totalCost,
    rateCard,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      afterTravelHourly: totalHours === 0 ? null : proposedPrice / totalHours,
      onSiteHourly: washHours === 0 ? null : proposedPrice / washHours,
      belowBreakEven: proposedPrice < totalCost,
      belowMinimum: proposedPrice < minimumJob,
    },
  };
}

/**
 * Format a contractor-facing bid summary they can paste into a text or email.
 * Pure string assembly — no DOM — so the same text is testable and is what
 * the copy button puts on the clipboard.
 */
export function formatBidSummary(result) {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const hours = (value) => `${value.toFixed(2)} h`;
  const lines = [
    'Pressure washing bid',
    ...result.surfaces.map((surface) => (
      `${surface.name}: ${surface.squareFeet.toLocaleString('en-US')} sq ft — ${hours(surface.washHours)}`
    )),
    `Wash time: ${hours(result.washHours)}`,
    `Travel + setup: ${hours(result.travelHours + result.setupHours)}`,
    `Total hours: ${hours(result.totalHours)}`,
    `Job cost: ${money(result.totalCost)}`,
    `Bid: ${money(result.bidPrice)}${result.minimumApplied ? ' (minimum job applied)' : ''}`,
    `Profit: ${money(result.profit)}`,
    result.afterTravelHourly === null
      ? 'After-travel hourly: n/a'
      : `After-travel hourly: ${money(result.afterTravelHourly)}/h`,
    `Walk-away price: ${money(result.breakEvenPrice)}`,
  ];
  if (result.packageVisits > 1) {
    lines.push(
      `Maintenance package: ${result.packageVisits} visits at ${money(result.annualPackageEach)} each (${money(result.annualPackageTotal)} / year)`,
    );
  }
  return lines.join('\n');
}
