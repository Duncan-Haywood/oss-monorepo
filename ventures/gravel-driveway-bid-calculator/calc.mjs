// Pure bid arithmetic for gravel / crushed-stone driveway installation.
// No network, no state: every length, depth, stone, prep method, wage, and
// quarry invoice is an input, so the result stays a transparent calculation
// the excavation or landscape shop can check against their own tickets
// rather than a claim about what any drive "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$4 a square foot installed" or "$45 a ton dumped" Facebook special
// treats 600 sq ft of 4-inch crusher-run on ready grade as the same job
// as 1,120 sq ft of 8-inch recycled stone that needs the existing surface
// excavated, hauled off, fabric, leftover truck tons, and a street apron.
// Homeowners (and a lot of estimator sheets) count the same kind of
// number. Quarries sell whole truckloads. Compaction is extra tons you
// order and never see on the finished surface. Matching a cheap 4-inch
// dump on an 8-inch excavate-and-haul drive is how a sold job becomes a
// two-day loss after the first dump ticket.
//
// Distinct from *asphalt paving* (hot-mix tons, mill, overlay), *concrete
// driveway pours* (cubic yards of slab), *sealcoat* (coats and cracks),
// and *paver patio* (interlocking units and a sand setting bed). This
// prices loose stone by the compacted depth, the truck, and the dirt.

export const STONE_PRESETS = Object.freeze([
  { id: 'crusher-run', label: 'Crusher run / dense grade' },
  { id: 'clean-stone', label: 'Clean crushed stone (#57)' },
  { id: 'recycled', label: 'Recycled crushed concrete' },
  { id: 'pea-gravel', label: 'Pea gravel' },
]);

export const PREP_PRESETS = Object.freeze([
  { id: 'none', label: 'Ready grade — no dirt work' },
  { id: 'grade-compact', label: 'Machine grade and compact' },
  { id: 'excavate-haul', label: 'Excavate existing surface and haul off' },
]);

export const DELIVERY_PRESETS = Object.freeze([
  { id: 'pickup', label: 'Quarry pickup (your truck)' },
  { id: 'delivered', label: 'Quarry delivery (sold by the load)' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '50×12, 4" crusher-run, ready grade, pickup (the cheap special)',
    stone: 'crusher-run',
    lengthFt: 50,
    widthFt: 12,
    depthIn: 4,
    compactionPercent: 25,
    prep: 'none',
    delivery: 'pickup',
    slope: false,
    fabric: false,
    apron: false,
    culvert: false,
  },
  {
    label: '80×14, 6" crusher-run, grade and compact, delivered, fabric',
    stone: 'crusher-run',
    lengthFt: 80,
    widthFt: 14,
    depthIn: 6,
    compactionPercent: 25,
    prep: 'grade-compact',
    delivery: 'delivered',
    slope: false,
    fabric: true,
    apron: true,
    culvert: false,
  },
  {
    label: '80×14, 8" recycled, excavate and haul, slope, fabric, apron (where the special loses)',
    stone: 'recycled',
    lengthFt: 80,
    widthFt: 14,
    depthIn: 8,
    compactionPercent: 30,
    prep: 'excavate-haul',
    delivery: 'delivered',
    slope: true,
    fabric: true,
    apron: true,
    culvert: true,
  },
  {
    label: '40×10, 4" pea gravel walk/drive, grade and compact, delivered',
    stone: 'pea-gravel',
    lengthFt: 40,
    widthFt: 10,
    depthIn: 4,
    compactionPercent: 20,
    prep: 'grade-compact',
    delivery: 'delivered',
    slope: false,
    fabric: true,
    apron: false,
    culvert: false,
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
 * Drive area from length × width. Either dimension at zero is a
 * zero-area drive, not a missing input — the shop can still price
 * quarry rates without a shape.
 */
export function drivewayAreaSqFt(lengthFt, widthFt) {
  return number(lengthFt, 'Length') * number(widthFt, 'Width');
}

/**
 * Loose cubic yards from area and *finished* compacted depth.
 * Depth of zero is a zero-volume drive, not a missing input.
 */
export function looseCubicYards(areaSqFt, depthIn) {
  const area = number(areaSqFt, 'Drive area');
  const depth = number(depthIn, 'Depth');
  return area * (depth / 12) / 27;
}

/**
 * Ordered cubic yards after compaction. Stone settles. The extra is
 * applied to the loose volume — you buy more than the finished pad.
 */
export function orderedCubicYards(looseCy, compactionPercent) {
  const loose = number(looseCy, 'Loose cubic yards');
  const compaction = number(compactionPercent, 'Compaction percent');
  return loose * (1 + compaction / 100);
}

/**
 * Ordered tons from ordered yards and the stone's tons-per-yard.
 * Density of zero is rejected rather than defaulted — a free ton
 * would hide a missing quarry figure.
 */
export function orderedTons(orderedCy, tonsPerCy) {
  const yards = number(orderedCy, 'Ordered cubic yards');
  const density = number(tonsPerCy, 'Tons per cubic yard', { allowZero: false });
  return yards * density;
}

/**
 * Whole truckloads. Pickup is zero — the shop's truck is already in
 * the trip hours. Delivery is one load at a time; leftover tons still
 * need the truck.
 */
export function truckLoads(tons, tonsPerTruck, delivery) {
  requirePreset(DELIVERY_PRESETS, delivery, 'delivery');
  if (delivery === 'pickup') return 0;
  const weight = number(tons, 'Tons');
  const perTruck = number(tonsPerTruck, 'Tons per truck', { allowZero: false });
  if (weight === 0) return 0;
  return Math.ceil(weight / perTruck);
}

/**
 * Fabric square yards with overlap. Area of zero is zero fabric.
 * Overlap is a percent on the drive, not a second roll size.
 */
export function fabricSqYd(areaSqFt, overlapPercent) {
  const area = number(areaSqFt, 'Drive area');
  const overlap = number(overlapPercent, 'Fabric overlap');
  return (area / 9) * (1 + overlap / 100);
}

/**
 * Starting hours and quarry rates from the stone. These are ballpark
 * crew figures, not a quarry catalog. Picking a stone never overwrites
 * a rate the shop has already typed.
 */
export function suggestedStoneKit(stone) {
  const id = String(stone);
  if (id === 'crusher-run') {
    return {
      hoursTrip: 1.1,
      hoursPerSqFtSpread: 1 / 400,
      hoursApron: 2.5,
      hoursCulvert: 3,
      siteHours: 0.6,
      tonsPerCy: 1.5,
      stonePerTon: 28,
      fabricEachSqYd: 0.85,
      fabricOverlapPercent: 10,
      apronEach: 420,
      culvertEach: 380,
    };
  }
  if (id === 'clean-stone') {
    return {
      hoursTrip: 1.15,
      hoursPerSqFtSpread: 1 / 350,
      hoursApron: 2.5,
      hoursCulvert: 3,
      siteHours: 0.7,
      tonsPerCy: 1.4,
      stonePerTon: 36,
      fabricEachSqYd: 0.85,
      fabricOverlapPercent: 10,
      apronEach: 420,
      culvertEach: 380,
    };
  }
  if (id === 'recycled') {
    return {
      hoursTrip: 1.2,
      hoursPerSqFtSpread: 1 / 380,
      hoursApron: 2.6,
      hoursCulvert: 3.1,
      siteHours: 0.65,
      tonsPerCy: 1.4,
      stonePerTon: 22,
      fabricEachSqYd: 0.85,
      fabricOverlapPercent: 10,
      apronEach: 420,
      culvertEach: 380,
    };
  }
  if (id === 'pea-gravel') {
    return {
      hoursTrip: 1.25,
      hoursPerSqFtSpread: 1 / 280,
      hoursApron: 2.8,
      hoursCulvert: 3.2,
      siteHours: 0.8,
      tonsPerCy: 1.35,
      stonePerTon: 42,
      fabricEachSqYd: 0.95,
      fabricOverlapPercent: 12,
      apronEach: 440,
      culvertEach: 400,
    };
  }
  throw new Error('Unknown stone');
}

/**
 * Starting dirt-work hours from the prep method. Ready grade is a
 * site walk, not a crew day. Excavate-and-haul is the ticket the
 * per-foot special never sees.
 */
export function suggestedPrepKit(prep) {
  const id = String(prep);
  if (id === 'none') {
    return {
      hoursPerSqFtGrade: 0,
      dumpTicketEach: 0,
      dumpTickets: 0,
    };
  }
  if (id === 'grade-compact') {
    return {
      hoursPerSqFtGrade: 1 / 800,
      dumpTicketEach: 0,
      dumpTickets: 0,
    };
  }
  if (id === 'excavate-haul') {
    return {
      hoursPerSqFtGrade: 1 / 400,
      dumpTicketEach: 95,
      dumpTickets: 2,
    };
  }
  throw new Error('Unknown prep');
}

/**
 * Starting delivery rates. Pickup is the shop's truck and time
 * already in the trip. Delivery is the quarry's load plus leftover
 * tons on the last truck.
 */
export function suggestedDeliveryKit(delivery) {
  const id = String(delivery);
  if (id === 'pickup') {
    return {
      hoursPerTruck: 0,
      truckTripEach: 0,
      tonsPerTruck: 16,
    };
  }
  if (id === 'delivered') {
    return {
      hoursPerTruck: 0.6,
      truckTripEach: 145,
      tonsPerTruck: 16,
    };
  }
  throw new Error('Unknown delivery');
}

/**
 * Price a gravel driveway from the pad, the stone, and the dirt work.
 *
 * @param {object} input
 * @param {string} input.stone
 * @param {number} input.lengthFt
 * @param {number} input.widthFt
 * @param {number} input.depthIn
 * @param {number} input.compactionPercent
 * @param {string} input.prep
 * @param {string} input.delivery
 * @param {boolean} [input.slope]
 * @param {boolean} [input.fabric]
 * @param {boolean} [input.apron]
 * @param {boolean} [input.culvert]
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate
 * @param {number} input.overheadRate
 * @param {number} input.targetMargin
 * @param {number} [input.travelAndEquipment]
 * @param {number} [input.otherCost]
 * @param {number|null} [input.proposedPrice]
 */
export function calculateBid(input) {
  const stone = requirePreset(STONE_PRESETS, input.stone, 'stone').id;
  const prep = requirePreset(PREP_PRESETS, input.prep, 'prep').id;
  const delivery = requirePreset(DELIVERY_PRESETS, input.delivery, 'delivery').id;

  const lengthFt = number(input.lengthFt ?? 0, 'Length');
  const widthFt = number(input.widthFt ?? 0, 'Width');
  const depthIn = number(input.depthIn ?? 0, 'Depth');
  const compactionPercent = number(input.compactionPercent ?? 0, 'Compaction percent');
  const slope = flag(input.slope);
  const fabric = flag(input.fabric);
  const apron = flag(input.apron);
  const culvert = flag(input.culvert);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerSqFtSpread = number(input.hoursPerSqFtSpread ?? 0, 'Spread hours per sq ft');
  const hoursPerSqFtGrade = number(input.hoursPerSqFtGrade ?? 0, 'Grade hours per sq ft');
  const hoursPerTruck = number(input.hoursPerTruck ?? 0, 'Hours per truck');
  const hoursApron = number(input.hoursApron ?? 0, 'Apron hours');
  const hoursCulvert = number(input.hoursCulvert ?? 0, 'Culvert hours');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const tonsPerCy = number(input.tonsPerCy ?? 0, 'Tons per cubic yard', { allowZero: false });
  const stonePerTon = number(input.stonePerTon ?? 0, 'Stone per ton');
  const fabricEachSqYd = number(input.fabricEachSqYd ?? 0, 'Fabric per sq yd');
  const fabricOverlapPercent = number(input.fabricOverlapPercent ?? 0, 'Fabric overlap');
  const apronEach = number(input.apronEach ?? 0, 'Apron');
  const culvertEach = number(input.culvertEach ?? 0, 'Culvert');
  const dumpTicketEach = number(input.dumpTicketEach ?? 0, 'Dump ticket');
  const dumpTickets = number(input.dumpTickets ?? 0, 'Dump tickets');
  const truckTripEach = number(input.truckTripEach ?? 0, 'Truck trip');
  const tonsPerTruck = number(input.tonsPerTruck ?? 16, 'Tons per truck', { allowZero: false });

  const areaSqFt = drivewayAreaSqFt(lengthFt, widthFt);
  const looseCy = looseCubicYards(areaSqFt, depthIn);
  const orderedCy = orderedCubicYards(looseCy, compactionPercent);
  const neededTons = orderedTons(orderedCy, tonsPerCy);
  const loads = truckLoads(neededTons, tonsPerTruck, delivery);
  const paidTons = delivery === 'delivered' ? loads * tonsPerTruck : neededTons;
  const leftoverTons = Math.max(0, paidTons - neededTons);
  const fabricYards = fabric ? fabricSqYd(areaSqFt, fabricOverlapPercent) : 0;

  // Slope slows grade and spread. The adder is on those hours only —
  // trip, apron, and culvert already include the extra handling.
  const slopeFactor = slope ? 1.2 : 1;
  const hoursGrade = areaSqFt * hoursPerSqFtGrade * slopeFactor;
  const hoursSpread = areaSqFt * hoursPerSqFtSpread * slopeFactor;
  const hoursDelivery = loads * hoursPerTruck;
  const hoursApronUsed = apron ? hoursApron : 0;
  const hoursCulvertUsed = culvert ? hoursCulvert : 0;
  const totalHours = hoursTrip + hoursGrade + hoursSpread + hoursDelivery
    + hoursApronUsed + hoursCulvertUsed + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const stoneMaterial = paidTons * stonePerTon;
  const fabricMaterial = fabricYards * fabricEachSqYd;
  const apronMaterial = apron ? apronEach : 0;
  const culvertMaterial = culvert ? culvertEach : 0;
  const dumpMaterial = dumpTickets * dumpTicketEach;
  const deliveryMaterial = loads * truckTripEach;
  const extraHardware = fabricMaterial + apronMaterial + culvertMaterial
    + dumpMaterial + deliveryMaterial;
  const materialCost = stoneMaterial + extraHardware;

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
  const extraCost = extraHardware + hoursGrade * loadedWage + hoursApronUsed * loadedWage
    + hoursCulvertUsed * loadedWage;

  return {
    stone,
    prep,
    delivery,
    lengthFt,
    widthFt,
    depthIn,
    compactionPercent,
    slope,
    fabric,
    apron,
    culvert,
    areaSqFt,
    looseCy,
    orderedCy,
    neededTons,
    paidTons,
    leftoverTons,
    loads,
    fabricYards,
    loadedWage,
    hoursTrip,
    hoursGrade,
    hoursSpread,
    hoursDelivery,
    hoursApron: hoursApronUsed,
    hoursCulvert: hoursCulvertUsed,
    siteHours,
    totalHours,
    laborCost,
    stoneMaterial,
    fabricMaterial,
    apronMaterial,
    culvertMaterial,
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
    pricePerTon: paidTons === 0 ? null : price / paidTons,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      stone: costShare(stoneMaterial),
      extra: costShare(extraCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(hoursTrip),
      grade: hourShare(hoursGrade),
      spread: hourShare(hoursSpread),
      delivery: hourShare(hoursDelivery),
      apron: hourShare(hoursApronUsed),
      culvert: hourShare(hoursCulvertUsed),
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
 * Price the same drive four ways — crusher-run, clean stone, recycled,
 * pea gravel — from the suggested kits so the shop can see when 8-inch
 * recycled plus excavate-and-haul flips the cheaper dump. User-typed
 * stone rates are not reused here: the comparison is apples-to-apples
 * on the starting figures. Prep and delivery kits stay with the current
 * job.
 */
export function compareStone(input) {
  const prepKit = suggestedPrepKit(String(input.prep ?? 'none'));
  const deliveryKit = suggestedDeliveryKit(String(input.delivery ?? 'pickup'));
  const rows = STONE_PRESETS.map((preset) => {
    const kit = suggestedStoneKit(preset.id);
    const bid = calculateBid({
      ...input,
      stone: preset.id,
      ...kit,
      ...prepKit,
      ...deliveryKit,
    });
    return {
      stone: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerSqFt: bid.pricePerSqFt,
      paidTons: bid.paidTons,
      stoneMaterial: bid.stoneMaterial,
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
export function formatBidSummary(result, jobLabel = 'Gravel driveway') {
  const perFt = result.pricePerSqFt === null
    ? 'n/a'
    : `${money(result.pricePerSqFt)} / sq ft`;
  const stone = STONE_PRESETS.find((item) => item.id === result.stone)?.label ?? result.stone;
  const prep = PREP_PRESETS.find((item) => item.id === result.prep)?.label ?? result.prep;
  const delivery = DELIVERY_PRESETS.find((item) => item.id === result.delivery)?.label ?? result.delivery;
  const extras = [
    `${result.depthIn}" compacted depth`,
    `${result.compactionPercent}% compaction allowance`,
    result.fabric ? 'geotextile fabric included' : 'no fabric',
    result.apron ? 'street apron included' : null,
    result.culvert ? 'culvert included' : null,
    result.slope ? 'sloped site' : null,
  ].filter(Boolean).join('; ');
  return [
    'GRAVEL DRIVEWAY BID',
    '',
    `Proposed driveway price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${stone}`,
    `Price per square foot: ${perFt}`,
    `Stone: ${result.paidTons.toFixed(1)} tons paid (${result.neededTons.toFixed(1)} tons ordered after compaction; ${result.loads} truckload${result.loads === 1 ? '' : 's'})`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.lengthFt} ft × ${result.widthFt} ft drive (${result.areaSqFt.toLocaleString('en-US')} sq ft)`,
    `- ${prep}; ${delivery}`,
    `- ${extras}`,
    `- Grade: ${result.hoursGrade.toFixed(1)} h; spread: ${result.hoursSpread.toFixed(1)} h; apron / culvert: ${(result.hoursApron + result.hoursCulvert).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm drive size, depth, stone, soil prep, delivery, fabric, apron, culvert, and all pricing before sending. It is not a civil specification, a drainage design, a compaction test, or an engineering stamp.',
  ].join('\n');
}
