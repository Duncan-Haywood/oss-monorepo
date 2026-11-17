// Pure bid arithmetic for a local moving job. No network, no state: every
// hour, wage, and access figure is an input, so the result stays a transparent
// calculation the mover can check against their own crew times rather than a
// claim about what any house "should" cost.
//
// The method is the one that actually keeps a Saturday from losing money:
// inventory hours for a first-floor, short-carry job, plus access hours that
// scale with cubic feet (stairs and a long carry are extra trips, not a flat
// "stairs extra"), plus packing and drive time. Bedroom-count quotes cannot
// see that a third-floor walk-up of the same furniture is a different job.

// Access hours are priced from volume because a 1,100 cu ft 3-bedroom on a
// third-floor walk-up is many more stair trips than a 400 cu ft studio on the
// same stairs. 200 cu ft is a convenient basis — roughly one decent van load
// — so the minutes-per-flight and minutes-per-50-ft figures stay in a range
// a mover can sanity-check against a stopwatch.
export const ACCESS_VOLUME_BASIS_CU_FT = 200;

// Starting points for inventory lines. Clock hours are "hours on the clock
// for a first-floor, short-carry load and unload" — access is added on top.
// These are ballpark figures to start from, NOT an industry standard.
export const INVENTORY_PRESETS = Object.freeze([
  { label: 'Studio / 1 bedroom', cubicFeet: 400, clockHours: 2.5 },
  { label: '2 bedroom apartment', cubicFeet: 700, clockHours: 3.5 },
  { label: '3 bedroom house', cubicFeet: 1100, clockHours: 5 },
  { label: '4 bedroom house', cubicFeet: 1500, clockHours: 6.5 },
  { label: 'Kitchen (packed)', cubicFeet: 150, clockHours: 1.25 },
  { label: 'Garage / storage unit', cubicFeet: 400, clockHours: 1.5 },
  { label: 'Upright piano', cubicFeet: 60, clockHours: 1 },
  { label: 'Grand piano', cubicFeet: 120, clockHours: 2 },
  { label: 'Gun safe / 400+ lb item', cubicFeet: 30, clockHours: 1.25 },
  { label: 'Treadmill / elliptical', cubicFeet: 40, clockHours: 0.75 },
  { label: 'Washer + dryer', cubicFeet: 50, clockHours: 0.6 },
  { label: 'Dining set', cubicFeet: 80, clockHours: 0.5 },
  { label: 'Home office', cubicFeet: 120, clockHours: 0.75 },
  { label: 'Additional 100 cu ft', cubicFeet: 100, clockHours: 0.4 },
]);

export const ACCESS_DEFAULTS = Object.freeze({
  minutesPerFlightPer200CuFt: 8,
  minutesPer50ftCarryPer200CuFt: 6,
});

// Released value: the carrier's liability when the customer waives full
// value protection, per pound per article. 60 cents is the federal figure for
// interstate household goods moves (49 CFR 375.201 and the "Waiver of Full
// Value Protection" option in Appendix A to Part 375, "Your Rights and
// Responsibilities When You Move"). Local moves follow state rules; many
// states use the same 60 cents, some differ, so it is an input.
export const RELEASED_VALUE_PER_LB = 0.6;

// Common conversion from cubic feet to shipment weight for household goods.
// A rule of thumb, not a scale ticket: an input, so a mover can use their own.
export const DEFAULT_LB_PER_CU_FT = 7;

// Hourly billing in this tool rounds the suggested crew rate up to the next
// $5 and the minimum up to the next half hour, the way rates are posted.
const RATE_STEP = 5;
const HOURS_STEP = 0.5;
const FLOOR_MINIMUM_HOURS = 2;

// `+ 0` turns the -0 that Math.ceil(-1e-9) gives for a zero value into 0.
const ceilTo = (value, step) => Math.ceil(value / step - 1e-9) * step + 0;

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function volumeFactor(totalCubicFeet) {
  return totalCubicFeet / ACCESS_VOLUME_BASIS_CU_FT;
}

/**
 * Price a local moving job from inventory, access, and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, cubicFeet: number, clockHours: number}>} input.inventory
 *   One row per room or specialty item. Clock hours are first-floor,
 *   short-carry load + unload time for the whole crew.
 * @param {number} input.originFlights     Flights of stairs at pickup.
 * @param {number} input.destFlights       Flights of stairs at drop-off.
 * @param {number} input.carryFeet         Longest door-to-truck carry, feet.
 * @param {number} input.elevatorWaitMinutes  Flat wait the crew sits through.
 * @param {number} input.minutesPerFlightPer200CuFt
 * @param {number} input.minutesPer50ftCarryPer200CuFt
 * @param {number} input.packingHours      Extra clock hours to pack.
 * @param {number} input.driveHours        Truck hours (loaded + deadhead).
 * @param {number} input.crewSize          Movers on the truck, including driver.
 * @param {number} input.hourlyWage        What one mover is paid per hour.
 * @param {number} input.burdenRate        Payroll burden as a % on top of wage.
 * @param {number} input.truckCost         Truck day rate or rental for this job.
 * @param {number} input.fuelTolls         Fuel, tolls, parking for this job.
 * @param {number} input.materials         Boxes, tape, pads, shrink wrap.
 * @param {number} input.otherCost         Anything else billed to this job.
 * @param {number} input.overheadRate      Business overhead as a % on direct cost.
 * @param {number} input.targetMargin      Net profit as a % of the final price.
 * @param {number|string|null} [input.quotedHourlyRate] Optional crew-and-truck
 *   hourly rate already posted; blank uses the suggested rate.
 * @param {number} [input.lbPerCuFt]        Shipment weight per cubic foot (default 7).
 * @param {number} [input.releasedValuePerLb] Released-value liability per lb (default 0.60).
 * @param {number} [input.declaredValue]    Declared value for full value protection.
 * @param {number} [input.valuationRatePer1000] Charge per $1,000 of declared value.
 * @param {number|null} input.proposedPrice Optional: a bedroom-count quote
 *   already on the table, so the mover can see the margin it actually leaves.
 */
export function calculateBid(input) {
  const inventoryInput = Array.isArray(input.inventory) ? input.inventory : [];
  if (inventoryInput.length === 0) throw new Error('Add at least one room or item to price');

  const originFlights = number(input.originFlights ?? 0, 'Stairs at pickup');
  const destFlights = number(input.destFlights ?? 0, 'Stairs at drop-off');
  const carryFeet = number(input.carryFeet ?? 0, 'Long carry');
  const elevatorWaitMinutes = number(input.elevatorWaitMinutes ?? 0, 'Elevator wait');
  const minutesPerFlight = number(
    input.minutesPerFlightPer200CuFt ?? ACCESS_DEFAULTS.minutesPerFlightPer200CuFt,
    'Minutes per flight per 200 cu ft',
  );
  const minutesPer50ft = number(
    input.minutesPer50ftCarryPer200CuFt ?? ACCESS_DEFAULTS.minutesPer50ftCarryPer200CuFt,
    'Minutes per 50 ft carry per 200 cu ft',
  );
  const packingHours = number(input.packingHours ?? 0, 'Packing hours');
  const driveHours = number(input.driveHours ?? 0, 'Drive hours');
  const crewSize = number(input.crewSize ?? 0, 'Crew size', { allowZero: false });
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const truckCost = number(input.truckCost ?? 0, 'Truck cost');
  const fuelTolls = number(input.fuelTolls ?? 0, 'Fuel and tolls');
  const materials = number(input.materials ?? 0, 'Materials');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const inventory = inventoryInput.map((item, index) => {
    const label = item.name?.trim() || `Item ${index + 1}`;
    const cubicFeet = number(item.cubicFeet ?? 0, `${label}: cubic feet`);
    const clockHours = number(item.clockHours ?? 0, `${label}: clock hours`);
    return { name: label, cubicFeet, clockHours };
  });

  const totalCubicFeet = inventory.reduce((sum, item) => sum + item.cubicFeet, 0);
  const inventoryHours = inventory.reduce((sum, item) => sum + item.clockHours, 0);
  const factor = volumeFactor(totalCubicFeet);

  // Stairs and carry scale with volume: more cubes, more trips. Elevator wait
  // does not — the whole crew sits through it once per stop.
  const stairHours = (originFlights + destFlights) * (minutesPerFlight / 60) * factor;
  const carryHours = (carryFeet / 50) * (minutesPer50ft / 60) * factor;
  const elevatorHours = elevatorWaitMinutes / 60;
  const accessHours = stairHours + carryHours + elevatorHours;

  const clockHours = inventoryHours + accessHours + packingHours + driveHours;
  const personHours = clockHours * crewSize;
  const laborCost = personHours * loadedWage;

  const directCost = laborCost + truckCost + fuelTolls + materials + otherCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = String(input.proposedPrice ?? '').trim() !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  // ---- hourly quote ---------------------------------------------------------
  // Most local moves are sold as "$X per hour for a crew and truck, N-hour
  // minimum", not as the lump sum above. The trap in an hourly quote is that
  // the truck day, fuel and materials are fixed per job while only labor
  // scales with the clock: a rate that earns the target margin at the
  // estimated hours loses money on a short job. So the minimum is the shortest
  // billed time at which the quoted rate covers the job's fixed costs (the
  // break-even), rounded up; marginHours says from when it also earns the
  // target margin.
  const ohFactor = 1 + overheadRate / 100;
  const marginShare = targetMargin / 100;
  const variablePerHour = crewSize * loadedWage * ohFactor;
  const fixedJobCost = (truckCost + fuelTolls + materials + otherCost) * ohFactor;
  const suggestedRate = clockHours === 0 ? null : ceilTo(price / clockHours, RATE_STEP);
  const hasRate = input.quotedHourlyRate !== null && input.quotedHourlyRate !== undefined && input.quotedHourlyRate !== '';
  const quotedRate = hasRate ? number(input.quotedHourlyRate, 'Hourly rate you quote', { allowZero: false }) : suggestedRate;
  let hourly = null;
  if (quotedRate !== null) {
    const earnsPerHour = quotedRate * (1 - marginShare) - variablePerHour;
    // Hours of billing it takes to cover the fixed cost at `perHour` left over
    // per hour. At exactly zero left over, a job with no fixed cost is covered
    // from the first hour (0); one with a fixed cost never is (null).
    const hoursToCover = (perHour) => {
      if (Math.abs(perHour) < 1e-9) return fixedJobCost === 0 ? 0 : null;
      return perHour > 0 ? fixedJobCost / perHour : null;
    };
    const breakEvenHours = hoursToCover(quotedRate - variablePerHour);
    const marginHours = hoursToCover(earnsPerHour);
    const minimumHours = breakEvenHours === null ? null : Math.max(FLOOR_MINIMUM_HOURS, ceilTo(breakEvenHours, HOURS_STEP));
    const at = (hours) => {
      const billedHours = minimumHours === null ? hours : Math.max(hours, minimumHours);
      const billed = quotedRate * billedHours;
      const cost = fixedJobCost + variablePerHour * hours;
      // flatProfit: the same day under the lump-sum price above, for comparison
      return { hours, billedHours, billed, cost, profit: billed - cost, margin: billed === 0 ? 0 : (billed - cost) / billed * 100, flatProfit: price - cost };
    };
    hourly = {
      rate: quotedRate,
      suggested: !hasRate,
      variablePerHour,
      fixedJobCost,
      breakEvenHours,
      marginHours,
      minimumHours,
      // Never true for the suggested rate: below the labor cost no
      // minimum rescues a job, every extra hour loses more. A rate exactly at
      // the labor cost is not below it (each hour nets $0).
      belowLaborCost: quotedRate < variablePerHour - 1e-9,
      scenarios: [0.75, 1, 1.25].map((k) => ({ scale: k, ...at(clockHours * k) })),
    };
  }

  // ---- valuation (liability for loss or damage) -----------------------------
  const lbPerCuFt = number(input.lbPerCuFt ?? DEFAULT_LB_PER_CU_FT, 'Pounds per cubic foot');
  const releasedPerLb = number(input.releasedValuePerLb ?? RELEASED_VALUE_PER_LB, 'Released value per pound');
  const declaredValue = number(input.declaredValue ?? 0, 'Declared value');
  const valuationRatePer1000 = number(input.valuationRatePer1000 ?? 0, 'Full value rate per $1,000');
  const estimatedWeight = totalCubicFeet * lbPerCuFt;
  const valuation = {
    estimatedWeight,
    lbPerCuFt,
    releasedPerLb,
    // The most the mover owes on a total loss at released value; a single
    // damaged article is capped at its own weight times the same rate.
    releasedLiabilityCap: estimatedWeight * releasedPerLb,
    declaredValue,
    ratePer1000: valuationRatePer1000,
    fullValueCharge: declaredValue / 1000 * valuationRatePer1000,
    // What full value protection exposes the mover to, beyond released value.
    extraExposure: Math.max(0, declaredValue - estimatedWeight * releasedPerLb),
  };

  const hoursShare = (hours) => (clockHours === 0 ? 0 : hours / clockHours * 100);

  return {
    inventory,
    totalCubicFeet,
    loadedWage,
    inventoryHours,
    stairHours,
    carryHours,
    elevatorHours,
    accessHours,
    packingHours,
    driveHours,
    clockHours,
    personHours,
    laborCost,
    truckCost,
    fuelTolls,
    materials,
    otherCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    // Sanity numbers a mover checks a bid against before sending it.
    pricePerCuFt: totalCubicFeet === 0 ? null : price / totalCubicFeet,
    effectiveHourlyPerMover: personHours === 0 ? null : price / personHours,
    pricePerClockHour: clockHours === 0 ? null : price / clockHours,
    // Price at which the job stops making money — the walk-away number when
    // a customer asks them to match a cheaper bedroom-count quote.
    breakEvenPrice: totalCost,
    hourly,
    valuation,
    accessHoursShare: hoursShare(accessHours),
    split: [
      { name: 'Load & unload', hours: inventoryHours, share: hoursShare(inventoryHours) },
      { name: 'Stairs', hours: stairHours, share: hoursShare(stairHours) },
      { name: 'Long carry', hours: carryHours, share: hoursShare(carryHours) },
      { name: 'Elevator wait', hours: elevatorHours, share: hoursShare(elevatorHours) },
      { name: 'Packing', hours: packingHours, share: hoursShare(packingHours) },
      { name: 'Drive time', hours: driveHours, share: hoursShare(driveHours) },
    ].filter((row) => row.hours > 0),
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      hourlyPerMover: personHours === 0 ? null : proposedPrice / personHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}
