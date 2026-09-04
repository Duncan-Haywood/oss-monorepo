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

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

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
