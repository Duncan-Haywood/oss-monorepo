// Pure bid arithmetic for residential stair-lift / chair-lift install.
// No network, no state: every rail, chair, attach, wage, and
// fixture invoice is an input, so the result stays a transparent
// calculation the contractor can check against their own tickets
// rather than a claim about what any stair "should" cost.
//
// The method is the one the trade actually loses money on: a
// published "$3,995 stair lift installed" special treats a
// straight indoor rail, a standard seated chair, and wood
// treads as the same job as a curved custom-bent rail, a
// heavy-duty power-swivel chair, open-riser attach, a folding
// rail for the door, a dedicated circuit, and pulling the old
// lift. Homeowners (and a lot of estimator sheets) count the
// same kind of number. The bend, the swivel, the fold, and the
// electrician do not live in that dump. Matching the cheap
// straight-rail special on a curved-plus-circuit job is how a
// sold aging-in-place install becomes a loss when the custom
// rail and the extras eat the margin.
//
// Distinct from *wheelchair ramp* (carpentry: rise-to-run,
// landings, slope — a platform, not a chair on a rail),
// *walk-in tub* (bathroom plumbing and an alcove), *walk-in
// shower* (tile, slope, glass), *entry door*, and *home
// elevator* (a shaft). This prices a stair lift: the rail,
// the chair, the attach, and the extras.
//
// Owners also shop a second special: “I already bought one
// on Facebook — just install it for $795.” Zeroing the rail
// and chair invoices is not a free set. Templating their
// used rail still takes hours. Missing brackets, a rail that
// is too short, or an indoor unit on an outdoor stair is a
// second trip plus hardware they expect you to eat.

export const RAIL_PRESETS = Object.freeze([
  { id: 'straight-one', label: 'Straight one-flight — the cheap special' },
  { id: 'straight-landing', label: 'Straight with mid-landing / two-piece' },
  { id: 'outdoor-straight', label: 'Outdoor straight — weatherized rail' },
  { id: 'curved', label: 'Curved / custom-bent rail' },
]);

export const CHAIR_PRESETS = Object.freeze([
  { id: 'perch', label: 'Perch / standing — cheaper, less common' },
  { id: 'standard', label: 'Standard seated — the cheap special' },
  { id: 'power-swivel', label: 'Power swivel seat' },
  { id: 'power-pack', label: 'Power swivel + powered footrest' },
  { id: 'heavy-duty', label: 'Heavy-duty / 350–400 lb' },
]);

export const ATTACH_PRESETS = Object.freeze([
  { id: 'wood', label: 'Wood treads — the cheap special' },
  { id: 'concrete', label: 'Concrete / masonry stairs' },
  { id: 'open-riser', label: 'Open riser / metal — more hardware' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Cheap special: 1 straight rail, standard chair, wood treads',
    liftCount: 1,
    rail: 'straight-one',
    chair: 'standard',
    attach: 'wood',
    travelMiles: 8,
    includeFoldingRail: false,
    includeExtraCharge: false,
    includeCircuit: false,
    includeRemoveExisting: false,
    includePermit: false,
    includeWeatherKit: false,
  },
  {
    label: 'Typical aging-in-place: 1 straight rail, power swivel, wood, fold, circuit, permit',
    liftCount: 1,
    rail: 'straight-one',
    chair: 'power-swivel',
    attach: 'wood',
    travelMiles: 14,
    includeFoldingRail: true,
    includeExtraCharge: false,
    includeCircuit: true,
    includeRemoveExisting: false,
    includePermit: true,
    includeWeatherKit: false,
  },
  {
    label: 'Losing job: 1 curved rail, heavy-duty, open-riser, fold, circuit, pull existing',
    liftCount: 1,
    rail: 'curved',
    chair: 'heavy-duty',
    attach: 'open-riser',
    travelMiles: 22,
    includeFoldingRail: true,
    includeExtraCharge: true,
    includeCircuit: true,
    includeRemoveExisting: true,
    includePermit: true,
    includeWeatherKit: false,
  },
  {
    label: 'Two-flight house: 2 straight rails, standard chairs, wood, fold on the lower',
    liftCount: 2,
    rail: 'straight-one',
    chair: 'standard',
    attach: 'wood',
    travelMiles: 18,
    includeFoldingRail: true,
    includeExtraCharge: false,
    includeCircuit: true,
    includeRemoveExisting: false,
    includePermit: true,
    includeWeatherKit: false,
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
 * Travel hours from a trip plus miles. Miles of zero is a local
 * stop, not a missing input.
 */
export function travelHours(hoursTrip, travelMiles, hoursPerMile) {
  return number(hoursTrip, 'Trip hours')
    + number(travelMiles, 'Travel miles') * number(hoursPerMile, 'Hours per mile');
}

/**
 * Starting rail and set hours from how much of the stair is
 * actually sold. Straight one-flight is the cheap special.
 * A landing is a second piece. Outdoor is weatherized.
 * Curved is a template and a custom bend.
 */
export function suggestedRailKit(rail) {
  const id = String(rail);
  if (id === 'straight-one') {
    return { hoursRailEach: 3.5, hoursSetBase: 2.5, railInvoice: 2200 };
  }
  if (id === 'straight-landing') {
    return { hoursRailEach: 5.5, hoursSetBase: 4.0, railInvoice: 3100 };
  }
  if (id === 'outdoor-straight') {
    return { hoursRailEach: 5.0, hoursSetBase: 3.5, railInvoice: 3800 };
  }
  if (id === 'curved') {
    return { hoursRailEach: 9.0, hoursSetBase: 6.5, railInvoice: 8200 };
  }
  throw new Error('Unknown rail');
}

/**
 * Standard seated is the cheap-special chair. Perch is cheaper.
 * Power swivel is the upgrade homeowners ask for at the last
 * minute. Power-pack adds a powered footrest. Heavy-duty is
 * weight rating and a heavier chassis.
 */
export function suggestedChairKit(chair) {
  const id = String(chair);
  if (id === 'perch') {
    return { hoursChairEach: 1.4, chairInvoice: 350 };
  }
  if (id === 'standard') {
    return { hoursChairEach: 2.0, chairInvoice: 650 };
  }
  if (id === 'power-swivel') {
    return { hoursChairEach: 2.8, chairInvoice: 1450 };
  }
  if (id === 'power-pack') {
    return { hoursChairEach: 3.4, chairInvoice: 2100 };
  }
  if (id === 'heavy-duty') {
    return { hoursChairEach: 3.8, chairInvoice: 2400 };
  }
  throw new Error('Unknown chair');
}

/**
 * Wood treads are the cheap-special attach. Concrete needs
 * masonry bits. Open-riser / metal needs more hardware.
 */
export function suggestedAttachKit(attach) {
  const id = String(attach);
  if (id === 'wood') {
    return { hoursAttachEach: 1.2, attachInvoice: 80 };
  }
  if (id === 'concrete') {
    return { hoursAttachEach: 2.4, attachInvoice: 220 };
  }
  if (id === 'open-riser') {
    return { hoursAttachEach: 3.0, attachInvoice: 340 };
  }
  throw new Error('Unknown attach');
}

/**
 * Starting extras that do not live in a $3,995 installed special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 1.6,
    hoursPerMile: 0.035,
    hoursFoldEach: 1.8,
    hoursChargeEach: 1.1,
    hoursCircuitEach: 2.2,
    hoursRemoveEach: 2.5,
    hoursPermitEach: 1.2,
    hoursWeatherEach: 1.6,
    siteHours: 1.0,
    foldEach: 480,
    chargeEach: 220,
    circuitEach: 380,
    removeEach: 180,
    permitEach: 225,
    weatherEach: 320,
    travelPerMile: 3.2,
  };
}

/**
 * Price a stair-lift install from the count, the rail, the
 * chair, the attach, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const rail = requirePreset(RAIL_PRESETS, input.rail, 'rail').id;
  const chair = requirePreset(CHAIR_PRESETS, input.chair, 'chair').id;
  const attach = requirePreset(ATTACH_PRESETS, input.attach, 'attach').id;

  const liftCount = number(input.liftCount ?? 0, 'Lift count');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const includeFoldingRail = flag(input.includeFoldingRail);
  const includeExtraCharge = flag(input.includeExtraCharge);
  const includeCircuit = flag(input.includeCircuit);
  const includeRemoveExisting = flag(input.includeRemoveExisting);
  const includePermit = flag(input.includePermit);
  const includeWeatherKit = flag(input.includeWeatherKit);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursRailEach = number(input.hoursRailEach ?? 0, 'Rail hours each');
  const hoursSetBase = number(input.hoursSetBase ?? 0, 'Set-base hours each');
  const hoursChairEach = number(input.hoursChairEach ?? 0, 'Chair hours each');
  const hoursAttachEach = number(input.hoursAttachEach ?? 0, 'Attach hours each');
  const hoursFoldEach = number(input.hoursFoldEach ?? 0, 'Fold hours each');
  const hoursChargeEach = number(input.hoursChargeEach ?? 0, 'Charge-point hours each');
  const hoursCircuitEach = number(input.hoursCircuitEach ?? 0, 'Circuit hours each');
  const hoursRemoveEach = number(input.hoursRemoveEach ?? 0, 'Removal hours each');
  const hoursPermitEach = number(input.hoursPermitEach ?? 0, 'Permit hours each');
  const hoursWeatherEach = number(input.hoursWeatherEach ?? 0, 'Weather-kit hours each');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const railInvoice = number(input.railInvoice ?? 0, 'Rail invoice');
  const chairInvoice = number(input.chairInvoice ?? 0, 'Chair invoice');
  const attachInvoice = number(input.attachInvoice ?? 0, 'Attach invoice');
  const foldEach = number(input.foldEach ?? 0, 'Folding rail each');
  const chargeEach = number(input.chargeEach ?? 0, 'Charge point each');
  const circuitEach = number(input.circuitEach ?? 0, 'Circuit each');
  const removeEach = number(input.removeEach ?? 0, 'Removal each');
  const permitEach = number(input.permitEach ?? 0, 'Permit each');
  const weatherEach = number(input.weatherEach ?? 0, 'Weather kit each');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');

  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursRail = liftCount * hoursRailEach;
  const hoursSet = liftCount * hoursSetBase;
  const hoursChair = liftCount * hoursChairEach;
  const hoursAttach = liftCount * hoursAttachEach;
  const hoursFoldApplied = includeFoldingRail ? liftCount * hoursFoldEach : 0;
  const hoursChargeApplied = includeExtraCharge ? liftCount * hoursChargeEach : 0;
  const hoursCircuitApplied = includeCircuit ? liftCount * hoursCircuitEach : 0;
  const hoursRemoveApplied = includeRemoveExisting ? liftCount * hoursRemoveEach : 0;
  const hoursPermitApplied = includePermit ? liftCount * hoursPermitEach : 0;
  const hoursWeatherApplied = includeWeatherKit ? liftCount * hoursWeatherEach : 0;
  const extraWorkHours = hoursSet + hoursChair + hoursAttach + hoursFoldApplied
    + hoursChargeApplied + hoursCircuitApplied + hoursRemoveApplied
    + hoursPermitApplied + hoursWeatherApplied;
  const totalHours = hoursTravel + hoursRail + extraWorkHours + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const railMaterial = liftCount * railInvoice;
  const chairMaterial = liftCount * chairInvoice;
  const attachMaterial = liftCount * attachInvoice;
  const foldMaterial = includeFoldingRail ? liftCount * foldEach : 0;
  const chargeMaterial = includeExtraCharge ? liftCount * chargeEach : 0;
  const circuitMaterial = includeCircuit ? liftCount * circuitEach : 0;
  const removeMaterial = includeRemoveExisting ? liftCount * removeEach : 0;
  const permitMaterial = includePermit ? liftCount * permitEach : 0;
  const weatherMaterial = includeWeatherKit ? liftCount * weatherEach : 0;
  const travelInvoice = travelMiles * travelPerMile;
  const fixtureMaterial = railMaterial + chairMaterial + attachMaterial;
  const extraHardware = foldMaterial + chargeMaterial + circuitMaterial
    + removeMaterial + permitMaterial + weatherMaterial + travelInvoice;
  const materialCost = fixtureMaterial + extraHardware;

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
  const extraCost = extraHardware
    + hoursSet * loadedWage
    + hoursChair * loadedWage
    + hoursAttach * loadedWage
    + hoursFoldApplied * loadedWage
    + hoursChargeApplied * loadedWage
    + hoursCircuitApplied * loadedWage
    + hoursRemoveApplied * loadedWage
    + hoursPermitApplied * loadedWage
    + hoursWeatherApplied * loadedWage
    + hoursTravel * loadedWage;

  return {
    rail,
    chair,
    attach,
    liftCount,
    travelMiles,
    includeFoldingRail,
    includeExtraCharge,
    includeCircuit,
    includeRemoveExisting,
    includePermit,
    includeWeatherKit,
    loadedWage,
    hoursTravel,
    hoursRail,
    hoursSet,
    hoursChair,
    hoursAttach,
    hoursFold: hoursFoldApplied,
    hoursCharge: hoursChargeApplied,
    hoursCircuit: hoursCircuitApplied,
    hoursRemove: hoursRemoveApplied,
    hoursPermit: hoursPermitApplied,
    hoursWeather: hoursWeatherApplied,
    siteHours,
    totalHours,
    laborCost,
    railMaterial,
    chairMaterial,
    attachMaterial,
    foldMaterial,
    chargeMaterial,
    circuitMaterial,
    removeMaterial,
    permitMaterial,
    weatherMaterial,
    travelInvoice,
    extraHardware,
    extraCost,
    fixtureMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerLift: liftCount === 0 ? null : price / liftCount,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      fixture: costShare(fixtureMaterial),
      extra: costShare(extraCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      travel: hourShare(hoursTravel),
      rail: hourShare(hoursRail),
      set: hourShare(hoursSet),
      chair: hourShare(hoursChair),
      attach: hourShare(hoursAttach),
      fold: hourShare(hoursFoldApplied),
      charge: hourShare(hoursChargeApplied),
      circuit: hourShare(hoursCircuitApplied),
      remove: hourShare(hoursRemoveApplied),
      permit: hourShare(hoursPermitApplied),
      weather: hourShare(hoursWeatherApplied),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perLift: liftCount === 0 ? null : proposedPrice / liftCount,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same stair four ways — straight one-flight, landing,
 * outdoor, curved — from the suggested rail kits so the
 * contractor can see when a custom bend flips the cheap $3,995
 * special. User-typed rail rates are not reused here: the
 * comparison is apples-to-apples on the starting figures. Chair
 * and attach kits stay with the current job.
 */
export function compareRail(input) {
  const chairKit = suggestedChairKit(String(input.chair ?? 'standard'));
  const attachKit = suggestedAttachKit(String(input.attach ?? 'wood'));
  const extraKit = suggestedExtraKit();
  const rows = RAIL_PRESETS.map((preset) => {
    const kit = suggestedRailKit(preset.id);
    const bid = calculateBid({
      ...input,
      rail: preset.id,
      ...chairKit,
      ...attachKit,
      ...extraKit,
      ...kit,
    });
    return {
      rail: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerLift: bid.pricePerLift,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursRail: bid.hoursRail,
      hoursSet: bid.hoursSet,
      fixtureMaterial: bid.fixtureMaterial,
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

/**
 * Price the same stair five ways — perch, standard, power
 * swivel, power-pack, heavy-duty — from the suggested chair
 * kits so the contractor can see the upgrade a homeowner is
 * actually asking for. User-typed chair rates are not reused
 * here. Rail and attach kits stay with the current job.
 */
export function compareChair(input) {
  const railKit = suggestedRailKit(String(input.rail ?? 'straight-one'));
  const attachKit = suggestedAttachKit(String(input.attach ?? 'wood'));
  const extraKit = suggestedExtraKit();
  const rows = CHAIR_PRESETS.map((preset) => {
    const kit = suggestedChairKit(preset.id);
    const bid = calculateBid({
      ...input,
      chair: preset.id,
      ...railKit,
      ...attachKit,
      ...extraKit,
      ...kit,
    });
    return {
      chair: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerLift: bid.pricePerLift,
      hoursChair: bid.hoursChair,
      chairMaterial: bid.chairMaterial,
      extraCost: bid.extraCost,
      breakEvenPrice: bid.breakEvenPrice,
    };
  });
  const cheapest = Math.min(...rows.map((row) => row.price));
  const standard = rows.find((row) => row.chair === 'standard');
  return rows
    .map((row) => ({
      ...row,
      cheapest: row.price === cheapest,
      delta: row.price - cheapest,
      upgradeFromStandard: standard ? row.price - standard.price : 0,
    }))
    .sort((a, b) => a.price - b.price);
}

export const SUPPLY_PRESETS = Object.freeze([
  {
    id: 'contractor-supplied',
    label: 'You supply the lift',
    detail: 'Rail and chair invoices stay in the bid',
  },
  {
    id: 'owner-fits',
    label: 'Owner supplies — it fits',
    detail: 'No rail or chair invoice, same set hours',
  },
  {
    id: 'owner-wrong',
    label: 'Owner supplies — wrong rail / missing hardware',
    detail: 'Inspect trip plus missing brackets',
  },
]);

/**
 * Starting callback hours and missing-hardware cost when the
 * owner's used lift does not match the stair. Taken from the
 * extra-kit trip plus a second attach pass so a typed rail
 * invoice does not leak into the "they bought it" case.
 */
export function suggestedOwnerCallbackKit() {
  const extra = suggestedExtraKit();
  return {
    hoursCallbackTrip: extra.hoursTrip,
    hoursMissingHardwareEach: 2.0,
    missingHardwareEach: 180,
  };
}

function scoreInstallOnly(bid, installPrice) {
  if (installPrice === null) return null;
  return {
    price: installPrice,
    profit: installPrice - bid.totalCost,
    margin: installPrice === 0 ? 0 : (installPrice - bid.totalCost) / installPrice * 100,
    hourlyRate: bid.totalHours === 0 ? null : installPrice / bid.totalHours,
    belowBreakEven: installPrice < bid.totalCost,
  };
}

/**
 * Price the same stair three ways: you supply the lift, the
 * owner supplies one that fits, or the owner supplies one that
 * does not fit and costs a second trip.
 *
 * Owner rows zero the rail and chair invoices and keep the
 * current set hours — bolting their Facebook unit is still a
 * set. The wrong-rail row adds a starting inspect trip and
 * missing-bracket hardware on top of the current rates so a
 * typed invoice does not leak into the "they bought it" case.
 *
 * An install-only price (options.installOnlyPrice, else the
 * proposed price on the bid) is scored against each cost base.
 * That is the $795 "just install what I bought" number
 * contractors actually get shopped on.
 */
export function compareOwnerSupply(input, options = {}) {
  const callback = suggestedOwnerCallbackKit();
  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursAttachEach = number(input.hoursAttachEach ?? 0, 'Attach hours each');
  const attachInvoice = number(input.attachInvoice ?? 0, 'Attach invoice');

  let installPrice = null;
  const rawInstall = options.installOnlyPrice !== undefined
    ? options.installOnlyPrice
    : input.proposedPrice;
  if (rawInstall !== null && rawInstall !== undefined && rawInstall !== '') {
    installPrice = number(rawInstall, 'Install-only price');
  }

  const contractor = calculateBid(input);
  const ownerFits = calculateBid({ ...input, railInvoice: 0, chairInvoice: 0 });
  const ownerWrong = calculateBid({
    ...input,
    railInvoice: 0,
    chairInvoice: 0,
    hoursTrip: hoursTrip + callback.hoursCallbackTrip,
    hoursAttachEach: hoursAttachEach + callback.hoursMissingHardwareEach,
    attachInvoice: attachInvoice + callback.missingHardwareEach,
  });

  const rows = [
    {
      supply: 'contractor-supplied',
      label: SUPPLY_PRESETS[0].label,
      detail: SUPPLY_PRESETS[0].detail,
      bid: contractor,
    },
    {
      supply: 'owner-fits',
      label: SUPPLY_PRESETS[1].label,
      detail: SUPPLY_PRESETS[1].detail,
      bid: ownerFits,
    },
    {
      supply: 'owner-wrong',
      label: SUPPLY_PRESETS[2].label,
      detail: SUPPLY_PRESETS[2].detail,
      bid: ownerWrong,
    },
  ].map((row) => ({
    supply: row.supply,
    label: row.label,
    detail: row.detail,
    price: row.bid.price,
    totalCost: row.bid.totalCost,
    totalHours: row.bid.totalHours,
    fixtureMaterial: row.bid.fixtureMaterial,
    attachMaterial: row.bid.attachMaterial,
    hoursTravel: row.bid.hoursTravel,
    hoursAttach: row.bid.hoursAttach,
    breakEvenPrice: row.bid.breakEvenPrice,
    installOnly: scoreInstallOnly(row.bid, installPrice),
    savedVsContractor: contractor.price - row.bid.price,
  }));

  const cheapest = Math.min(...rows.map((row) => row.price));
  return rows.map((row) => ({
    ...row,
    cheapest: row.price === cheapest,
    delta: row.price - cheapest,
    installOnlyPrice: installPrice,
  }));
}

/**
 * One-line verdict for the owner-supplied table. Names the
 * install-only loss when that number is on the table; otherwise
 * names the bid drop from zeroing the rail and chair.
 */
export function ownerSupplyNote(rows) {
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new Error('Owner-supply comparison is missing rows');
  }
  const contractor = rows.find((row) => row.supply === 'contractor-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  if (!contractor || !fits || !wrong) {
    throw new Error('Owner-supply comparison is missing a supply row');
  }

  const drop = contractor.price - fits.price;
  const callbackLift = wrong.price - fits.price;
  if (contractor.installOnly && fits.installOnly) {
    const asked = contractor.installOnly.price;
    if (contractor.installOnly.belowBreakEven && fits.installOnly.belowBreakEven) {
      return `At ${money(asked)} install-only you lose money even when they bought the lift. Walk-away on the owner-supplied set is ${money(fits.breakEvenPrice)}.`;
    }
    if (contractor.installOnly.belowBreakEven && !fits.installOnly.belowBreakEven) {
      return `At ${money(asked)} the contractor-supplied job loses ${money(Math.abs(contractor.installOnly.profit))}. The same install-only number covers the set if their lift actually fits.`;
    }
    if (wrong.installOnly?.belowBreakEven) {
      return `At ${money(asked)} the set covers if their lift fits. A wrong-rail callback still loses ${money(Math.abs(wrong.installOnly.profit))} — walk-away then is ${money(wrong.breakEvenPrice)}.`;
    }
    return `At ${money(asked)} both supply paths hold a margin. A wrong-rail callback still adds ${money(callbackLift)} to the bid.`;
  }
  return `Zeroing the rail and chair invoices drops the bid ${money(drop)}. A wrong-rail callback puts ${money(callbackLift)} back on.`;
}

export const ACCESS_PRESETS = Object.freeze([
  {
    id: 'weekday-scheduled',
    label: 'Weekday, they leave',
    detail: 'Standard ground freight; empty house',
  },
  {
    id: 'discharge-week',
    label: 'Discharge week, they stay',
    detail: 'Expedite rail freight plus a slower occupied set',
  },
  {
    id: 'after-hours',
    label: 'Saturday / after-hours discharge',
    detail: 'Expedite freight, overtime, and a second dispatch',
  },
]);

/**
 * Starting pace, overtime, and next-day rail freight when the
 * family will not wait for a weekday slot after a hospital
 * discharge. Occupied pace is a multiplier on the typed rail,
 * set, chair, attach, and punch-list hours — working around
 * someone who just came home is slower, not a different wage.
 * After-hours is time-and-a-half on the typed wage plus a
 * second dispatch from the extra-kit trip, so a typed 9-hour
 * trip does not inflate the extra emergency run. Expedite
 * freight is a starting next-day rail ticket on top of the
 * typed other-cost line; weekday ground freight stays in the
 * rail invoice.
 */
export function suggestedAccessKit() {
  const extra = suggestedExtraKit();
  return {
    occupiedPaceMultiplier: 1.2,
    afterHoursWageMultiplier: 1.5,
    afterHoursExtraTripHours: extra.hoursTrip,
    expediteFreightEach: 485,
  };
}

/**
 * Price the same stair three ways: weekday they leave with
 * standard freight, discharge week while they stay home with
 * next-day rail freight, or Saturday / after-hours discharge.
 *
 * Discharge week keeps the typed wage and adds clock hours on
 * the on-stair work plus a starting expedite ticket. After-hours
 * keeps the typed hours, raises the wage, adds a starting
 * second dispatch, and the same expedite ticket — a Friday
 * discharge is not a stop you combine with a weekday route.
 * Rail, chair, attach, and extras stay.
 *
 * A proposed price (options.installOnlyPrice, else the
 * proposed price on the bid) is scored against each cost
 * base. That is the "$3,995 Saturday, mom comes home Friday"
 * number contractors actually get shopped on.
 */
export function compareAccess(input, options = {}) {
  const kit = suggestedAccessKit();
  const liftCount = number(input.liftCount ?? 0, 'Lift count');
  const hoursRailEach = number(input.hoursRailEach ?? 0, 'Rail hours each');
  const hoursSetBase = number(input.hoursSetBase ?? 0, 'Set-base hours each');
  const hoursChairEach = number(input.hoursChairEach ?? 0, 'Chair hours each');
  const hoursAttachEach = number(input.hoursAttachEach ?? 0, 'Attach hours each');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');
  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const expediteFreight = kit.expediteFreightEach * liftCount;

  let installPrice = null;
  const rawInstall = options.installOnlyPrice !== undefined
    ? options.installOnlyPrice
    : input.proposedPrice;
  if (rawInstall !== null && rawInstall !== undefined && rawInstall !== '') {
    installPrice = number(rawInstall, 'Install-only price');
  }

  const weekday = calculateBid(input);
  const discharge = calculateBid({
    ...input,
    hoursRailEach: hoursRailEach * kit.occupiedPaceMultiplier,
    hoursSetBase: hoursSetBase * kit.occupiedPaceMultiplier,
    hoursChairEach: hoursChairEach * kit.occupiedPaceMultiplier,
    hoursAttachEach: hoursAttachEach * kit.occupiedPaceMultiplier,
    siteHours: siteHours * kit.occupiedPaceMultiplier,
    otherCost: otherCost + expediteFreight,
  });
  const afterHours = calculateBid({
    ...input,
    hourlyWage: hourlyWage * kit.afterHoursWageMultiplier,
    hoursTrip: hoursTrip + kit.afterHoursExtraTripHours,
    otherCost: otherCost + expediteFreight,
  });

  const rows = [
    {
      access: 'weekday-scheduled',
      label: ACCESS_PRESETS[0].label,
      detail: ACCESS_PRESETS[0].detail,
      bid: weekday,
      expediteFreight: 0,
    },
    {
      access: 'discharge-week',
      label: ACCESS_PRESETS[1].label,
      detail: ACCESS_PRESETS[1].detail,
      bid: discharge,
      expediteFreight,
    },
    {
      access: 'after-hours',
      label: ACCESS_PRESETS[2].label,
      detail: ACCESS_PRESETS[2].detail,
      bid: afterHours,
      expediteFreight,
    },
  ].map((row) => ({
    access: row.access,
    label: row.label,
    detail: row.detail,
    price: row.bid.price,
    totalCost: row.bid.totalCost,
    totalHours: row.bid.totalHours,
    loadedWage: row.bid.loadedWage,
    hoursTravel: row.bid.hoursTravel,
    hoursRail: row.bid.hoursRail,
    hoursSet: row.bid.hoursSet,
    hoursChair: row.bid.hoursChair,
    hoursAttach: row.bid.hoursAttach,
    siteHours: row.bid.siteHours,
    laborCost: row.bid.laborCost,
    softCost: row.bid.softCost,
    expediteFreight: row.expediteFreight,
    breakEvenPrice: row.bid.breakEvenPrice,
    installOnly: scoreInstallOnly(row.bid, installPrice),
    liftFromWeekday: row.bid.price - weekday.price,
  }));

  const cheapest = Math.min(...rows.map((row) => row.price));
  return rows.map((row) => ({
    ...row,
    cheapest: row.price === cheapest,
    delta: row.price - cheapest,
    installOnlyPrice: installPrice,
  }));
}

/**
 * One-line verdict for the access table. Names the Saturday
 * / discharge loss when that number is on the table;
 * otherwise names the bid lift from a weekday slot.
 */
export function accessNote(rows) {
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new Error('Access comparison is missing rows');
  }
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const discharge = rows.find((row) => row.access === 'discharge-week');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  if (!weekday || !discharge || !afterHours) {
    throw new Error('Access comparison is missing an access row');
  }

  const dischargeLift = discharge.price - weekday.price;
  const afterHoursLift = afterHours.price - weekday.price;
  if (weekday.installOnly && afterHours.installOnly) {
    const asked = weekday.installOnly.price;
    if (weekday.installOnly.belowBreakEven && afterHours.installOnly.belowBreakEven) {
      return `At ${money(asked)} you lose money even on a weekday slot. Walk-away after-hours is ${money(afterHours.breakEvenPrice)}.`;
    }
    if (!weekday.installOnly.belowBreakEven && afterHours.installOnly.belowBreakEven) {
      return `At ${money(asked)} the weekday set covers. The same Saturday / discharge number loses ${money(Math.abs(afterHours.installOnly.profit))} — walk-away then is ${money(afterHours.breakEvenPrice)}.`;
    }
    if (discharge.installOnly?.belowBreakEven) {
      return `At ${money(asked)} a weekday slot covers. Discharge week while they stay home still loses ${money(Math.abs(discharge.installOnly.profit))} — walk-away then is ${money(discharge.breakEvenPrice)}.`;
    }
    return `At ${money(asked)} every access window still holds a margin. After-hours still adds ${money(afterHoursLift)} to the bid.`;
  }
  return `Discharge week while they stay home adds ${money(dischargeLift)} to the bid. After-hours / Saturday adds ${money(afterHoursLift)}.`;
}

function money(value) {
  const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Format a bid as a plain-text draft the contractor can paste
 * into a proposal. Costs, wages, and invoices are omitted on
 * purpose — this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Stair lift install') {
  const perLift = result.pricePerLift === null
    ? 'n/a'
    : `${money(result.pricePerLift)} / lift`;
  const rail = RAIL_PRESETS.find((item) => item.id === result.rail)?.label ?? result.rail;
  const chair = CHAIR_PRESETS.find((item) => item.id === result.chair)?.label ?? result.chair;
  const attach = ATTACH_PRESETS.find((item) => item.id === result.attach)?.label ?? result.attach;
  const extras = [
    `${result.travelMiles} travel miles`,
    rail,
    chair,
    attach,
    `${result.liftCount} lift${result.liftCount === 1 ? '' : 's'}`,
    result.includeFoldingRail ? 'folding rail included' : 'no folding rail',
    result.includeExtraCharge ? 'extra charge point included' : 'no extra charge point',
    result.includeCircuit ? 'dedicated circuit included' : 'no dedicated circuit',
    result.includeRemoveExisting ? 'existing-lift removal included' : 'no existing-lift removal',
    result.includePermit ? 'permit included' : 'no permit',
    result.includeWeatherKit ? 'weather kit included' : 'no weather kit',
  ].join('; ');
  return [
    'STAIR LIFT INSTALL BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${rail}`,
    `Price per lift: ${perLift}`,
    `Lifts: ${result.liftCount.toLocaleString('en-US')}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.liftCount} lift${result.liftCount === 1 ? '' : 's'}; ${rail}; ${chair}; ${attach}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; rail: ${result.hoursRail.toFixed(1)} h; extras: ${(result.hoursSet + result.hoursChair + result.hoursAttach + result.hoursFold + result.hoursCharge + result.hoursCircuit + result.hoursRemove + result.hoursPermit + result.hoursWeather).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm lift count, rail, chair, attach, extras, and all pricing before sending. It is not a building-code determination, an accessibility approval, a medical device prescription, a wheelchair-ramp bid, a walk-in-tub bid, a home-elevator bid, or a product warranty.',
  ].join('\n');
}
