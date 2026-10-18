// Pure bid arithmetic for backyard shed installation.
// No network, no state: every pad yard, delivery mile, ramp, wage, and
// kit invoice is an input, so the result stays a transparent calculation
// the shed dealer can check against their own tickets rather than a
// claim about what any shed "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$2,499 installed 10×12" Facebook special treats a factory-built
// drop-and-set onto an existing level pad with a forklift as the same
// job as a 12×16 lofted kit, a new gravel pad, a 40-mile crane set,
// a ramp, extra windows, and old-shed haul-away. Homeowners (and a lot
// of estimator sheets) count the same kind of number. Pad, delivery,
// and extras do not scale with that drop-and-set dump. Matching a cheap
// existing-pad special on a kit-plus-pad job is how a sold shed becomes
// a two-day loss after the first gravel ticket.
//
// Distinct from *pole barn* (post-frame 30×40+ with bays, eave, and
// trusses), *gravel driveway* (a driveway, not a shed pad), *concrete
// pours* (the slab only), *pergola* (open shade), *garage-door* (the
// door on an existing opening), and *hot-tub* (crane and a pad for a
// spa). This prices a backyard shed: the pad, the delivery, and the
// extras.

export const FULFILLMENT_PRESETS = Object.freeze([
  { id: 'dropset', label: 'Factory-built drop-and-set' },
  { id: 'kit', label: 'Kit assembled on site' },
  { id: 'stick', label: 'Stick-built on site' },
]);

export const PAD_PRESETS = Object.freeze([
  { id: 'existing', label: 'Existing pad — set only' },
  { id: 'gravel', label: 'New crushed-stone pad' },
  { id: 'slab', label: 'New concrete pad' },
]);

export const ACCESS_PRESETS = Object.freeze([
  { id: 'forklift', label: 'Forklift / trailer access' },
  { id: 'crane', label: 'Crane set (tight access)' },
]);

export const ELECTRICAL_PRESETS = Object.freeze([
  { id: 'none', label: 'Shell only — no electrical' },
  { id: 'lights', label: 'Lights and outlets' },
  { id: 'workshop', label: 'Workshop circuit' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '10×12 drop-and-set on an existing pad (the cheap special)',
    lengthFt: 12,
    widthFt: 10,
    fulfillment: 'dropset',
    pad: 'existing',
    access: 'forklift',
    electrical: 'none',
    deliveryMiles: 15,
    extraWindows: 0,
    extraDoors: 0,
    ramp: false,
    loft: false,
    haulAway: false,
  },
  {
    label: '10×16 kit on a new gravel pad, one ramp, forklift',
    lengthFt: 16,
    widthFt: 10,
    fulfillment: 'kit',
    pad: 'gravel',
    access: 'forklift',
    electrical: 'none',
    deliveryMiles: 22,
    extraWindows: 1,
    extraDoors: 0,
    ramp: true,
    loft: false,
    haulAway: false,
  },
  {
    label: '12×16 lofted kit, new gravel, crane, ramp, haul-away (where the special loses)',
    lengthFt: 16,
    widthFt: 12,
    fulfillment: 'kit',
    pad: 'gravel',
    access: 'crane',
    electrical: 'lights',
    deliveryMiles: 40,
    extraWindows: 2,
    extraDoors: 1,
    ramp: true,
    loft: true,
    haulAway: true,
  },
  {
    label: '8×12 garden shed, stick-built, new slab, forklift',
    lengthFt: 12,
    widthFt: 8,
    fulfillment: 'stick',
    pad: 'slab',
    access: 'forklift',
    electrical: 'none',
    deliveryMiles: 12,
    extraWindows: 1,
    extraDoors: 0,
    ramp: true,
    loft: false,
    haulAway: false,
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
 * Shed footprint. Either dimension at zero is a zero-area shed,
 * not a missing input — the dealer can still price rates without
 * a shape.
 */
export function shedAreaSqFt(lengthFt, widthFt) {
  return number(lengthFt, 'Length') * number(widthFt, 'Width');
}

/**
 * Pad is the shed plus an overhang on every side. Overhang of
 * zero is a pad the same size as the shed, not a missing input.
 */
export function padAreaSqFt(lengthFt, widthFt, overhangFt) {
  const length = number(lengthFt, 'Length');
  const width = number(widthFt, 'Width');
  const overhang = number(overhangFt, 'Pad overhang');
  return (length + 2 * overhang) * (width + 2 * overhang);
}

/**
 * Cubic yards from area and thickness. Thickness of zero is a
 * zero-volume pad, not a missing input.
 */
export function cubicYards(areaSqFt, thicknessIn) {
  const area = number(areaSqFt, 'Pad area');
  const thickness = number(thicknessIn, 'Thickness');
  return area * (thickness / 12) / 27;
}

/**
 * Delivery hours from a trip plus miles. Miles of zero is a
 * local drop, not a missing input.
 */
export function deliveryHours(hoursTrip, deliveryMiles, hoursPerMile) {
  return number(hoursTrip, 'Trip hours')
    + number(deliveryMiles, 'Delivery miles') * number(hoursPerMile, 'Hours per mile');
}

/**
 * Starting hours and invoices from how the shed arrives. Drop-and-
 * set is a unit invoice plus a short set. Kit and stick build the
 * same footprint with different hours and material.
 */
export function suggestedFulfillmentKit(fulfillment) {
  const id = String(fulfillment);
  if (id === 'dropset') {
    return {
      hoursPerSqFtBuild: 1 / 80,
      hoursSet: 2.5,
      shedUnit: 2400,
      lumberPerSqFt: 0,
    };
  }
  if (id === 'kit') {
    return {
      hoursPerSqFtBuild: 1 / 22,
      hoursSet: 0.8,
      shedUnit: 1850,
      lumberPerSqFt: 2.4,
    };
  }
  if (id === 'stick') {
    return {
      hoursPerSqFtBuild: 1 / 14,
      hoursSet: 0,
      shedUnit: 0,
      lumberPerSqFt: 9.5,
    };
  }
  throw new Error('Unknown fulfillment');
}

/**
 * Starting pad hours and material. Existing pad is zero yards.
 * Picking a pad never overwrites a rate the dealer has already typed.
 */
export function suggestedPadKit(pad) {
  const id = String(pad);
  if (id === 'existing') {
    return {
      hoursPerSqFtPad: 0,
      padThicknessIn: 0,
      gravelPerCy: 0,
      concretePerCy: 0,
      usesGravel: 0,
      usesConcrete: 0,
    };
  }
  if (id === 'gravel') {
    return {
      hoursPerSqFtPad: 1 / 90,
      padThicknessIn: 4,
      gravelPerCy: 42,
      concretePerCy: 0,
      usesGravel: 1,
      usesConcrete: 0,
    };
  }
  if (id === 'slab') {
    return {
      hoursPerSqFtPad: 1 / 45,
      padThicknessIn: 4,
      gravelPerCy: 0,
      concretePerCy: 168,
      usesGravel: 0,
      usesConcrete: 1,
    };
  }
  throw new Error('Unknown pad');
}

/**
 * Forklift is a short set. Crane is a dedicated lift plus the
 * crane invoice.
 */
export function suggestedAccessKit(access) {
  const id = String(access);
  if (id === 'forklift') {
    return { hoursAccess: 0.6, accessEquipment: 0 };
  }
  if (id === 'crane') {
    return { hoursAccess: 3.5, accessEquipment: 650 };
  }
  throw new Error('Unknown access');
}

/**
 * Electrical package. Lights is a half-day. A workshop circuit is
 * a dedicated run plus the panel invoice.
 */
export function suggestedElectricalKit(electrical) {
  const id = String(electrical);
  if (id === 'none') {
    return { hoursElectrical: 0, electricalPackage: 0 };
  }
  if (id === 'lights') {
    return { hoursElectrical: 3.5, electricalPackage: 280 };
  }
  if (id === 'workshop') {
    return { hoursElectrical: 7, electricalPackage: 720 };
  }
  throw new Error('Unknown electrical');
}

/**
 * Starting extras that do not live in a drop-and-set special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 2.2,
    hoursPerMile: 0.04,
    hoursPerWindow: 0.7,
    hoursPerDoor: 1.4,
    hoursRamp: 1.6,
    hoursLoft: 3.2,
    hoursHaulAway: 2.8,
    siteHours: 1.4,
    deliveryPerMile: 3.4,
    windowEach: 95,
    doorEach: 220,
    rampEach: 185,
    loftPackage: 340,
    haulAwayInvoice: 275,
    padOverhangFt: 1,
  };
}

/**
 * Price a backyard shed from the pad, the delivery, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const fulfillment = requirePreset(FULFILLMENT_PRESETS, input.fulfillment, 'fulfillment').id;
  const pad = requirePreset(PAD_PRESETS, input.pad, 'pad').id;
  const access = requirePreset(ACCESS_PRESETS, input.access, 'access').id;
  const electrical = requirePreset(ELECTRICAL_PRESETS, input.electrical, 'electrical').id;

  const lengthFt = number(input.lengthFt ?? 0, 'Length');
  const widthFt = number(input.widthFt ?? 0, 'Width');
  const deliveryMiles = number(input.deliveryMiles ?? 0, 'Delivery miles');
  const extraWindows = number(input.extraWindows ?? 0, 'Extra windows');
  const extraDoors = number(input.extraDoors ?? 0, 'Extra doors');
  const ramp = flag(input.ramp);
  const loft = flag(input.loft);
  const haulAway = flag(input.haulAway);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursPerSqFtBuild = number(input.hoursPerSqFtBuild ?? 0, 'Build hours per sq ft');
  const hoursSet = number(input.hoursSet ?? 0, 'Set hours');
  const hoursPerSqFtPad = number(input.hoursPerSqFtPad ?? 0, 'Pad hours per sq ft');
  const hoursAccess = number(input.hoursAccess ?? 0, 'Access hours');
  const hoursPerWindow = number(input.hoursPerWindow ?? 0, 'Hours per window');
  const hoursPerDoor = number(input.hoursPerDoor ?? 0, 'Hours per door');
  const hoursRamp = number(input.hoursRamp ?? 0, 'Ramp hours');
  const hoursLoft = number(input.hoursLoft ?? 0, 'Loft hours');
  const hoursHaulAway = number(input.hoursHaulAway ?? 0, 'Haul-away hours');
  const hoursElectrical = number(input.hoursElectrical ?? 0, 'Electrical hours');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const shedUnit = number(input.shedUnit ?? 0, 'Shed unit');
  const lumberPerSqFt = number(input.lumberPerSqFt ?? 0, 'Lumber per sq ft');
  const gravelPerCy = number(input.gravelPerCy ?? 0, 'Gravel per cubic yard');
  const concretePerCy = number(input.concretePerCy ?? 0, 'Concrete per cubic yard');
  const padThicknessIn = number(input.padThicknessIn ?? 0, 'Pad thickness');
  const usesGravel = number(input.usesGravel ?? 0, 'Uses gravel');
  const usesConcrete = number(input.usesConcrete ?? 0, 'Uses concrete');
  const accessEquipment = number(input.accessEquipment ?? 0, 'Access equipment');
  const deliveryPerMile = number(input.deliveryPerMile ?? 0, 'Delivery per mile');
  const windowEach = number(input.windowEach ?? 0, 'Window each');
  const doorEach = number(input.doorEach ?? 0, 'Door each');
  const rampEach = number(input.rampEach ?? 0, 'Ramp each');
  const loftPackage = number(input.loftPackage ?? 0, 'Loft package');
  const haulAwayInvoice = number(input.haulAwayInvoice ?? input.haulAwayCost ?? 0, 'Haul-away');
  const electricalPackage = number(input.electricalPackage ?? 0, 'Electrical package');
  const padOverhangFt = number(input.padOverhangFt ?? 0, 'Pad overhang');

  const areaSqFt = shedAreaSqFt(lengthFt, widthFt);
  const padSqFt = padAreaSqFt(lengthFt, widthFt, padOverhangFt);
  const billedPadSqFt = pad === 'existing' ? 0 : padSqFt;
  const padCy = cubicYards(billedPadSqFt, padThicknessIn);
  const gravelCy = usesGravel ? padCy : 0;
  const slabCy = usesConcrete ? padCy : 0;

  const hoursDelivery = deliveryHours(hoursTrip, deliveryMiles, hoursPerMile);
  const hoursBuild = areaSqFt * hoursPerSqFtBuild;
  const hoursPad = billedPadSqFt * hoursPerSqFtPad;
  const hoursWindows = extraWindows * hoursPerWindow;
  const hoursDoors = extraDoors * hoursPerDoor;
  const hoursRampWork = ramp ? hoursRamp : 0;
  const hoursLoftWork = loft ? hoursLoft : 0;
  const hoursHaul = haulAway ? hoursHaulAway : 0;
  const totalHours = hoursDelivery + hoursBuild + hoursSet + hoursPad + hoursAccess
    + hoursWindows + hoursDoors + hoursRampWork + hoursLoftWork + hoursHaul
    + hoursElectrical + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const shedMaterial = shedUnit + areaSqFt * lumberPerSqFt;
  const gravelMaterial = gravelCy * gravelPerCy;
  const concreteMaterial = slabCy * concretePerCy;
  const padMaterial = gravelMaterial + concreteMaterial;
  const windowMaterial = extraWindows * windowEach;
  const doorMaterial = extraDoors * doorEach;
  const rampMaterial = ramp ? rampEach : 0;
  const loftMaterial = loft ? loftPackage : 0;
  const haulMaterial = haulAway ? haulAwayInvoice : 0;
  const deliveryInvoice = deliveryMiles * deliveryPerMile;
  const extraHardware = padMaterial + windowMaterial + doorMaterial + rampMaterial
    + loftMaterial + haulMaterial + electricalPackage + accessEquipment + deliveryInvoice;
  const materialCost = shedMaterial + extraHardware;

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
  // "Pad, delivery, extras" on the result panel, shown beside "Loaded labor",
  // "Shed / lumber", "Travel & other", and "Overhead" as a breakdown of
  // total cost. Those five lines have to sum to totalCost, the way
  // directCost + overhead does above — a dealer reading a cost breakdown
  // expects the parts to add to the total printed right under them.
  // extraCost is the pad/delivery/extras MATERIAL and invoice spend only
  // (extraHardware); the labor to install them is already inside laborCost,
  // which is every crew-hour (build, set, pad, access, windows, doors, ramp,
  // loft, haul-away, electrical, delivery, site) at the loaded wage. Adding
  // those same hours' cost into extraCost again — as this used to — double
  // counted them: "Loaded labor" already paid for the pad and delivery
  // hours, and "Pad, delivery, extras" paid for them a second time, so the
  // five displayed lines summed to more than the total cost shown below
  // them and the extras category looked bigger than it actually is.
  const extraCost = extraHardware;

  return {
    fulfillment,
    pad,
    access,
    electrical,
    lengthFt,
    widthFt,
    deliveryMiles,
    extraWindows,
    extraDoors,
    ramp,
    loft,
    haulAway,
    areaSqFt,
    padSqFt,
    billedPadSqFt,
    padCy,
    gravelCy,
    slabCy,
    loadedWage,
    hoursDelivery,
    hoursBuild,
    hoursSet,
    hoursPad,
    hoursAccess,
    hoursWindows,
    hoursDoors,
    hoursRamp: hoursRampWork,
    hoursLoft: hoursLoftWork,
    hoursHaulAway: hoursHaul,
    hoursElectrical,
    siteHours,
    totalHours,
    laborCost,
    shedMaterial,
    padMaterial,
    windowMaterial,
    doorMaterial,
    rampMaterial,
    loftMaterial,
    haulMaterial,
    deliveryInvoice,
    accessEquipment,
    electricalPackage,
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
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      shed: costShare(shedMaterial),
      extra: costShare(extraCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      delivery: hourShare(hoursDelivery),
      build: hourShare(hoursBuild),
      set: hourShare(hoursSet),
      pad: hourShare(hoursPad),
      access: hourShare(hoursAccess),
      windows: hourShare(hoursWindows),
      doors: hourShare(hoursDoors),
      ramp: hourShare(hoursRampWork),
      loft: hourShare(hoursLoftWork),
      haulAway: hourShare(hoursHaul),
      electrical: hourShare(hoursElectrical),
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
 * Price the same shed three ways — existing pad, new gravel, new
 * slab — from the suggested pad kits so the dealer can see when a
 * new pad flips the cheap drop-and-set special. User-typed pad
 * rates are not reused here: the comparison is apples-to-apples
 * on the starting figures. Fulfillment, access, and electrical
 * kits stay with the current job.
 */
export function comparePad(input) {
  const fulfillmentKit = suggestedFulfillmentKit(String(input.fulfillment ?? 'dropset'));
  const accessKit = suggestedAccessKit(String(input.access ?? 'forklift'));
  const electricalKit = suggestedElectricalKit(String(input.electrical ?? 'none'));
  const extraKit = suggestedExtraKit();
  const rows = PAD_PRESETS.map((preset) => {
    const kit = suggestedPadKit(preset.id);
    const bid = calculateBid({
      ...input,
      pad: preset.id,
      ...fulfillmentKit,
      ...accessKit,
      ...electricalKit,
      ...extraKit,
      ...kit,
    });
    return {
      pad: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerSqFt: bid.pricePerSqFt,
      padMaterial: bid.padMaterial,
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
 * Format a bid as a plain-text draft the dealer can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this
 * is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Shed install') {
  const perFt = result.pricePerSqFt === null
    ? 'n/a'
    : `${money(result.pricePerSqFt)} / sq ft`;
  const fulfillment = FULFILLMENT_PRESETS.find((item) => item.id === result.fulfillment)?.label ?? result.fulfillment;
  const pad = PAD_PRESETS.find((item) => item.id === result.pad)?.label ?? result.pad;
  const access = ACCESS_PRESETS.find((item) => item.id === result.access)?.label ?? result.access;
  const electrical = ELECTRICAL_PRESETS.find((item) => item.id === result.electrical)?.label ?? result.electrical;
  const extras = [
    `${result.deliveryMiles} delivery miles`,
    access,
    `${result.extraWindows} extra window${result.extraWindows === 1 ? '' : 's'}`,
    `${result.extraDoors} extra door${result.extraDoors === 1 ? '' : 's'}`,
    result.ramp ? 'ramp included' : 'no ramp',
    result.loft ? 'loft included' : 'no loft',
    result.haulAway ? 'old-shed haul-away included' : 'no haul-away',
  ].join('; ');
  return [
    'BACKYARD SHED INSTALL BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${fulfillment}; ${pad}`,
    `Price per square foot: ${perFt}`,
    `Pad: ${result.billedPadSqFt.toLocaleString('en-US')} sq ft billed (${result.padCy.toFixed(1)} cy)`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.lengthFt} ft × ${result.widthFt} ft shed (${result.areaSqFt.toLocaleString('en-US')} sq ft)`,
    `- ${fulfillment}; ${pad}; ${electrical}`,
    `- ${extras}`,
    `- Delivery: ${result.hoursDelivery.toFixed(1)} h; build / set: ${(result.hoursBuild + result.hoursSet).toFixed(1)} h; pad: ${result.hoursPad.toFixed(1)} h; extras: ${(result.hoursWindows + result.hoursDoors + result.hoursRamp + result.hoursLoft + result.hoursHaulAway).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm shed size, fulfillment, pad, access, extras, and all pricing before sending. It is not a structural specification, an engineered stamp, a permit set, or a building-code determination.',
  ].join('\n');
}
