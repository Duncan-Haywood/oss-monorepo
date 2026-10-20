// Pure bid arithmetic for sod installation: fescue, bermuda, and zoysia.
// No network, no state: every lawn, pallet, prep method, wage, and farm
// invoice is an input, so the result stays a transparent calculation the
// landscaper can check against their own tickets rather than a claim about
// what any yard "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$0.55 a square foot installed" Facebook special treats 2,000 sq ft of
// fescue on ready soil you pick up at the farm as the same job as 8,000
// sq ft of zoysia on clay that needs the existing lawn stripped, hauled
// off, tilled, graded, and three watering visits. Homeowners (and a lot
// of estimator sheets) count the same kind of number. Pallets are sold
// whole. Prep hours do not live in a per-foot special. Matching a cheap
// fescue pickup on a strip-and-haul zoysia job is how a sold lawn becomes
// a two-day loss after the first dump-ticket.
//
// Distinct from *lawn-care* bidding (recurring mowing of living grass)
// and from *artificial turf* (synthetic rolls, crushed-rock base, and
// infill). This prices living sod by the pallet, the dirt work, and the
// first watering.

export const GRASS_PRESETS = Object.freeze([
  { id: 'fescue', label: 'Tall fescue' },
  { id: 'bermuda', label: 'Bermuda' },
  { id: 'zoysia', label: 'Zoysia' },
]);

export const PREP_PRESETS = Object.freeze([
  { id: 'none', label: 'Ready soil — no prep' },
  { id: 'till-grade', label: 'Till and grade' },
  { id: 'strip-haul', label: 'Strip existing lawn and haul off' },
]);

export const DELIVERY_PRESETS = Object.freeze([
  { id: 'pickup', label: 'Farm pickup' },
  { id: 'delivered', label: 'Farm delivery' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '2,000 sq ft fescue, ready soil, pickup (the cheap special)',
    grass: 'fescue',
    lengthFt: 50,
    widthFt: 40,
    wastePercent: 5,
    palletCoverageSqFt: 450,
    prep: 'none',
    delivery: 'pickup',
    slope: false,
    fertilizer: true,
    roller: true,
    wateringVisits: 0,
    extraIrrigationHeads: 0,
  },
  {
    label: '5,000 sq ft bermuda, till and grade, delivered',
    grass: 'bermuda',
    lengthFt: 100,
    widthFt: 50,
    wastePercent: 8,
    palletCoverageSqFt: 450,
    prep: 'till-grade',
    delivery: 'delivered',
    slope: false,
    fertilizer: true,
    roller: true,
    wateringVisits: 1,
    extraIrrigationHeads: 0,
  },
  {
    label: '8,000 sq ft zoysia, strip and haul, slope, 3 waterings (where the special loses)',
    grass: 'zoysia',
    lengthFt: 100,
    widthFt: 80,
    wastePercent: 10,
    palletCoverageSqFt: 400,
    prep: 'strip-haul',
    delivery: 'delivered',
    slope: true,
    fertilizer: true,
    roller: true,
    wateringVisits: 3,
    extraIrrigationHeads: 4,
  },
  {
    label: '1,200 sq ft front-yard fescue, till and grade, delivered',
    grass: 'fescue',
    lengthFt: 40,
    widthFt: 30,
    wastePercent: 8,
    palletCoverageSqFt: 450,
    prep: 'till-grade',
    delivery: 'delivered',
    slope: false,
    fertilizer: true,
    roller: true,
    wateringVisits: 1,
    extraIrrigationHeads: 0,
  },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function flag(value) {
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0 || value === '' || value == null) {
    return false;
  }
  return Boolean(value);
}

function requirePreset(presets, id, label) {
  const found = presets.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown ${label}`);
  return found;
}

/**
 * Lawn area from length × width. Either dimension at zero is a
 * zero-area lawn, not a missing input — the shop can still price
 * material rates without a shape.
 */
export function lawnAreaSqFt(lengthFt, widthFt) {
  return number(lengthFt, 'Length') * number(widthFt, 'Width');
}

/**
 * Square feet the farm is asked to cut, after waste on curves,
 * edges, and bad rolls. Waste is applied to the lawn, not to the
 * pallet size — the pallet is what the farm sells.
 */
export function orderSqFt(areaSqFt, wastePercent) {
  const area = number(areaSqFt, 'Lawn area');
  const waste = number(wastePercent, 'Waste percent');
  return area * (1 + waste / 100);
}

/**
 * Whole pallets to buy. Farms do not sell a fraction of a pallet.
 * Coverage of zero is rejected rather than defaulted — a free pallet
 * would hide a missing farm figure.
 */
export function palletCount(neededSqFt, palletCoverageSqFt) {
  const needed = number(neededSqFt, 'Order area');
  const coverage = number(palletCoverageSqFt, 'Pallet coverage', { allowZero: false });
  if (needed === 0) return 0;
  return Math.ceil(needed / coverage);
}

/**
 * Delivery trips. Pickup is zero. Delivery is one trip per truckload
 * of pallets — leftover pallets still need the truck.
 */
export function deliveryTrips(pallets, palletsPerTruck, delivery) {
  requirePreset(DELIVERY_PRESETS, delivery, 'delivery');
  if (delivery === 'pickup') return 0;
  const count = number(pallets, 'Pallets');
  const perTruck = number(palletsPerTruck, 'Pallets per truck', { allowZero: false });
  if (count === 0) return 0;
  return Math.ceil(count / perTruck);
}

/**
 * Starting hours and material rates from the grass. These are
 * ballpark crew figures, not a farm catalog. Picking a grass never
 * overwrites a rate the shop has already typed.
 */
export function suggestedGrassKit(grass) {
  const id = String(grass);
  if (id === 'fescue') {
    return {
      hoursTrip: 1,
      hoursPerSqFtInstall: 1 / 450,
      hoursPerWatering: 1.1,
      hoursIrrigationHead: 0.45,
      siteHours: 0.5,
      sodPerSqFt: 0.45,
      fertilizerEach: 28,
      rollerEach: 35,
      irrigationHeadEach: 42,
      wateringVisitEach: 55,
    };
  }
  if (id === 'bermuda') {
    return {
      hoursTrip: 1.1,
      hoursPerSqFtInstall: 1 / 400,
      hoursPerWatering: 1.15,
      hoursIrrigationHead: 0.45,
      siteHours: 0.6,
      sodPerSqFt: 0.55,
      fertilizerEach: 32,
      rollerEach: 35,
      irrigationHeadEach: 42,
      wateringVisitEach: 55,
    };
  }
  if (id === 'zoysia') {
    return {
      hoursTrip: 1.25,
      hoursPerSqFtInstall: 1 / 300,
      hoursPerWatering: 1.25,
      hoursIrrigationHead: 0.5,
      siteHours: 0.75,
      sodPerSqFt: 0.85,
      fertilizerEach: 36,
      rollerEach: 40,
      irrigationHeadEach: 48,
      wateringVisitEach: 60,
    };
  }
  throw new Error('Unknown grass');
}

/**
 * Starting dirt-work hours from the prep method. Ready soil is a
 * site walk, not a crew day. Strip-and-haul is the ticket the
 * per-foot special never sees.
 */
export function suggestedPrepKit(prep) {
  const id = String(prep);
  if (id === 'none') {
    return {
      hoursPerSqFtPrep: 0,
      dumpTicketEach: 0,
      dumpTickets: 0,
    };
  }
  if (id === 'till-grade') {
    return {
      hoursPerSqFtPrep: 1 / 1000,
      dumpTicketEach: 0,
      dumpTickets: 0,
    };
  }
  if (id === 'strip-haul') {
    return {
      hoursPerSqFtPrep: 1 / 500,
      dumpTicketEach: 85,
      dumpTickets: 1,
    };
  }
  throw new Error('Unknown prep');
}

/**
 * Starting delivery rates. Pickup is the shop's trailer and time
 * already in the trip. Delivery is the farm's truck plus unload.
 */
export function suggestedDeliveryKit(delivery) {
  const id = String(delivery);
  if (id === 'pickup') {
    return {
      hoursPerDeliveryTrip: 0,
      deliveryTripEach: 0,
      palletsPerTruck: 10,
    };
  }
  if (id === 'delivered') {
    return {
      hoursPerDeliveryTrip: 0.75,
      deliveryTripEach: 125,
      palletsPerTruck: 10,
    };
  }
  throw new Error('Unknown delivery');
}

/**
 * Price a sod install from the lawn, the grass, and the dirt work.
 *
 * @param {object} input
 * @param {string} input.grass
 * @param {number} input.lengthFt
 * @param {number} input.widthFt
 * @param {number} input.wastePercent
 * @param {number} input.palletCoverageSqFt
 * @param {string} input.prep
 * @param {string} input.delivery
 * @param {boolean} [input.slope]
 * @param {boolean} [input.fertilizer]
 * @param {boolean} [input.roller]
 * @param {number} [input.wateringVisits]
 * @param {number} [input.extraIrrigationHeads]
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate
 * @param {number} input.overheadRate
 * @param {number} input.targetMargin
 * @param {number} [input.travelAndEquipment]
 * @param {number} [input.otherCost]
 * @param {number|null} [input.proposedPrice]
 */
export function calculateBid(input) {
  const grass = requirePreset(GRASS_PRESETS, input.grass, 'grass').id;
  const prep = requirePreset(PREP_PRESETS, input.prep, 'prep').id;
  const delivery = requirePreset(DELIVERY_PRESETS, input.delivery, 'delivery').id;

  const lengthFt = number(input.lengthFt ?? 0, 'Length');
  const widthFt = number(input.widthFt ?? 0, 'Width');
  const wastePercent = number(input.wastePercent ?? 0, 'Waste percent');
  const palletCoverageSqFt = number(input.palletCoverageSqFt ?? 0, 'Pallet coverage', { allowZero: false });
  const slope = flag(input.slope);
  const fertilizer = flag(input.fertilizer);
  const roller = flag(input.roller);
  const wateringVisits = number(input.wateringVisits ?? 0, 'Watering visits');
  const extraIrrigationHeads = number(input.extraIrrigationHeads ?? 0, 'Extra irrigation heads');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerSqFtInstall = number(input.hoursPerSqFtInstall ?? 0, 'Install hours per sq ft');
  const hoursPerSqFtPrep = number(input.hoursPerSqFtPrep ?? 0, 'Prep hours per sq ft');
  const hoursPerWatering = number(input.hoursPerWatering ?? 0, 'Hours per watering');
  const hoursIrrigationHead = number(input.hoursIrrigationHead ?? 0, 'Hours per irrigation head');
  const hoursPerDeliveryTrip = number(input.hoursPerDeliveryTrip ?? 0, 'Hours per delivery trip');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const sodPerSqFt = number(input.sodPerSqFt ?? 0, 'Sod per sq ft');
  const fertilizerEach = number(input.fertilizerEach ?? 0, 'Starter fertilizer');
  const rollerEach = number(input.rollerEach ?? 0, 'Roller');
  const irrigationHeadEach = number(input.irrigationHeadEach ?? 0, 'Irrigation head');
  const wateringVisitEach = number(input.wateringVisitEach ?? 0, 'Watering visit');
  const dumpTicketEach = number(input.dumpTicketEach ?? 0, 'Dump ticket');
  const dumpTickets = number(input.dumpTickets ?? 0, 'Dump tickets');
  const deliveryTripEach = number(input.deliveryTripEach ?? 0, 'Delivery trip');
  const palletsPerTruck = number(input.palletsPerTruck ?? 10, 'Pallets per truck', { allowZero: false });

  const areaSqFt = lawnAreaSqFt(lengthFt, widthFt);
  const neededSqFt = orderSqFt(areaSqFt, wastePercent);
  const pallets = palletCount(neededSqFt, palletCoverageSqFt);
  const paidCoverageSqFt = pallets * palletCoverageSqFt;
  const trips = deliveryTrips(pallets, palletsPerTruck, delivery);

  // Slope slows both prep and install. The adder is on those hours only —
  // trip and watering already include the drive.
  const slopeFactor = slope ? 1.2 : 1;
  const hoursPrep = areaSqFt * hoursPerSqFtPrep * slopeFactor;
  const hoursInstall = neededSqFt * hoursPerSqFtInstall * slopeFactor;
  const hoursDelivery = trips * hoursPerDeliveryTrip;
  const hoursWatering = wateringVisits * hoursPerWatering;
  const hoursIrrigation = extraIrrigationHeads * hoursIrrigationHead;
  const totalHours = hoursTrip + hoursPrep + hoursInstall + hoursDelivery
    + hoursWatering + hoursIrrigation + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const sodMaterial = paidCoverageSqFt * sodPerSqFt;
  const fertilizerMaterial = fertilizer ? fertilizerEach : 0;
  const rollerMaterial = roller ? rollerEach : 0;
  const irrigationMaterial = extraIrrigationHeads * irrigationHeadEach;
  const wateringMaterial = wateringVisits * wateringVisitEach;
  const dumpMaterial = dumpTickets * dumpTicketEach;
  const deliveryMaterial = trips * deliveryTripEach;
  const extraHardware = fertilizerMaterial + rollerMaterial + irrigationMaterial
    + wateringMaterial + dumpMaterial + deliveryMaterial;
  const materialCost = sodMaterial + extraHardware;

  const softCost = travelAndEquipment + otherCost;
  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);
  const hourShare = (amount) => (totalHours === 0 ? 0 : amount / totalHours * 100);
  const extraCost = extraHardware;

  return {
    grass,
    prep,
    delivery,
    lengthFt,
    widthFt,
    wastePercent,
    palletCoverageSqFt,
    slope,
    fertilizer,
    roller,
    wateringVisits,
    extraIrrigationHeads,
    areaSqFt,
    neededSqFt,
    pallets,
    paidCoverageSqFt,
    leftoverSqFt: Math.max(0, paidCoverageSqFt - neededSqFt),
    trips,
    loadedWage,
    hoursTrip,
    hoursPrep,
    hoursInstall,
    hoursDelivery,
    hoursWatering,
    hoursIrrigation,
    siteHours,
    totalHours,
    laborCost,
    sodMaterial,
    fertilizerMaterial,
    rollerMaterial,
    irrigationMaterial,
    wateringMaterial,
    dumpMaterial,
    deliveryMaterial,
    extraHardware,
    extraCost,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSqFt: areaSqFt === 0 ? null : price / areaSqFt,
    pricePerPallet: pallets === 0 ? null : price / pallets,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      sod: costShare(sodMaterial),
      extra: costShare(extraCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(hoursTrip),
      prep: hourShare(hoursPrep),
      install: hourShare(hoursInstall),
      delivery: hourShare(hoursDelivery),
      watering: hourShare(hoursWatering),
      irrigation: hourShare(hoursIrrigation),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perSqFt: areaSqFt === 0 ? null : proposedPrice / areaSqFt,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same lawn three ways — fescue, bermuda, zoysia — from the
 * suggested kits so the shop can see when zoysia plus strip-and-haul
 * flips the cheaper grass. User-typed grass rates are not reused here:
 * the comparison is apples-to-apples on the starting figures. Prep and
 * delivery kits stay with the current job.
 */
export function compareGrass(input) {
  const prepKit = suggestedPrepKit(String(input.prep ?? 'none'));
  const deliveryKit = suggestedDeliveryKit(String(input.delivery ?? 'pickup'));
  const rows = GRASS_PRESETS.map((preset) => {
    const kit = suggestedGrassKit(preset.id);
    const bid = calculateBid({
      ...input,
      grass: preset.id,
      ...kit,
      ...prepKit,
      ...deliveryKit,
    });
    return {
      grass: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerSqFt: bid.pricePerSqFt,
      pallets: bid.pallets,
      sodMaterial: bid.sodMaterial,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      breakEvenPrice: bid.breakEvenPrice,
    };
  });
  const cheapest = Math.min(...rows.map((row) => row.price));
  return rows
    .map((row) => ({
      ...row,
      cheapest: row.price === cheapest,
      delta: row.price - cheapest,
    }))
    .sort((a, b) => a.price - b.price);
}

function money(value) {
  const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Format a bid as a plain-text draft the shop can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this is
 * the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Sod installation') {
  const perFt = result.pricePerSqFt === null
    ? 'n/a'
    : `${money(result.pricePerSqFt)} / sq ft`;
  const grass = GRASS_PRESETS.find((item) => item.id === result.grass)?.label ?? result.grass;
  const prep = PREP_PRESETS.find((item) => item.id === result.prep)?.label ?? result.prep;
  const delivery = DELIVERY_PRESETS.find((item) => item.id === result.delivery)?.label ?? result.delivery;
  const extras = [
    result.fertilizer ? 'starter fertilizer included' : 'no starter fertilizer',
    result.roller ? 'rolled after install' : null,
    result.slope ? 'sloped site' : null,
    `${result.wateringVisits} watering visit${result.wateringVisits === 1 ? '' : 's'}`,
    `${result.extraIrrigationHeads} extra irrigation head${result.extraIrrigationHeads === 1 ? '' : 's'}`,
  ].filter(Boolean).join('; ');
  return [
    'SOD INSTALLATION BID',
    '',
    `Proposed sod price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${grass}`,
    `Price per square foot: ${perFt}`,
    `Pallets: ${result.pallets} (${result.paidCoverageSqFt.toLocaleString('en-US')} sq ft bought for ${result.neededSqFt.toFixed(0)} sq ft ordered)`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.lengthFt} ft × ${result.widthFt} ft lawn (${result.areaSqFt.toLocaleString('en-US')} sq ft)`,
    `- ${prep}; ${delivery}`,
    `- ${extras}`,
    `- Prep: ${result.hoursPrep.toFixed(1)} h; install: ${result.hoursInstall.toFixed(1)} h; watering / irrigation: ${(result.hoursWatering + result.hoursIrrigation).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm lawn size, grass, soil prep, delivery, watering, irrigation, and all pricing before sending. It is not a landscape specification, a soil test, an irrigation design, or an engineering stamp.',
  ].join('\n');
}
