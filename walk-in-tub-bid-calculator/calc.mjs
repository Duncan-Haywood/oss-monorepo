// Pure bid arithmetic for residential walk-in tub install.
// No network, no state: every alcove, tub, door, wage, and
// fixture invoice is an input, so the result stays a transparent
// calculation the contractor can check against their own tickets
// rather than a claim about what any bath "should" cost.
//
// The method is the one the trade actually loses money on: a
// published "$3,499 walk-in tub installed" special treats an
// acrylic soaker into an existing alcove with an inward door as
// the same job as a whirlpool or extra-wide unit, an outward
// door, a cast-iron demo, a tile surround, a drain relocate,
// and sistering the floor. Homeowners (and a lot of estimator
// sheets) count the same kind of number. The demo, the jets,
// the surround, and the floor do not live in that dump. Matching
// the cheap alcove-swap special on a relocate-plus-tile job is
// how a sold aging-in-place install becomes a loss when the
// plumbing and the surround eat the margin.
//
// Distinct from *walk-in shower* (tile, slope, glass — a wet
// area, not a tub with a door), *hot-tub / spa* (outdoor crane
// and a pad), *toilet replacement* (a commode swap), and
// *water-heater* (a tank). This prices a walk-in tub: the
// alcove, the unit, the door, and the extras.
//
// Owners also shop a second special: “I already bought one
// on Amazon — just install it for $995.” Zeroing the tub
// invoice is not a free set. Setting their unit still takes
// hours. A drain that does not line up, a missing overflow
// kit, or a door seal they expect you to eat is a second
// trip plus hardware.
//
// Families also call after a fall: “Can you start Saturday
// so she is not climbing the old tub?” A weekday $3,499
// number is not a Saturday bid. Occupied is the same wage
// on a slower set. After-hours is time-and-a-half plus a
// second evening trip — you cannot leave the alcove open
// overnight in the only bath.

export const SCOPE_PRESETS = Object.freeze([
  { id: 'alcove-swap', label: 'Alcove swap — same footprint, existing drain (the cheap special)' },
  { id: 'alcove-relocate', label: 'Alcove relocate — move the drain or the supply' },
  { id: 'new-construction', label: 'New construction — new bath, no demo' },
  { id: 'custom-opening', label: 'Custom opening — widen the alcove or convert a shower' },
]);

export const TUB_PRESETS = Object.freeze([
  { id: 'soaker-acrylic', label: 'Acrylic soaker — the cheap special' },
  { id: 'soaker-cast', label: 'Cast / heavier soaker — more handling' },
  { id: 'whirlpool', label: 'Whirlpool jets — pump, GFCI, extra set time' },
  { id: 'air-jet', label: 'Air-jet / blower — quieter, extra set time' },
  { id: 'bariatric', label: 'Extra-wide / bariatric — weight and floor work' },
]);

export const DOOR_PRESETS = Object.freeze([
  { id: 'inward', label: 'Inward-swing door — the cheap special' },
  { id: 'outward', label: 'Outward-swing — safer egress, more hardware' },
  { id: 'walk-through', label: 'Walk-through / low threshold — no swing door' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Cheap special: 1 acrylic soaker, alcove swap, inward door',
    tubCount: 1,
    scope: 'alcove-swap',
    tub: 'soaker-acrylic',
    door: 'inward',
    travelMiles: 8,
    includeDemoCastIron: false,
    includeTileSurround: false,
    includeGrabBars: false,
    includeHandheld: false,
    includeFloorSister: false,
    includePermit: false,
  },
  {
    label: 'Typical aging-in-place: 1 whirlpool, alcove swap, outward door, grab bars, handheld',
    tubCount: 1,
    scope: 'alcove-swap',
    tub: 'whirlpool',
    door: 'outward',
    travelMiles: 14,
    includeDemoCastIron: false,
    includeTileSurround: false,
    includeGrabBars: true,
    includeHandheld: true,
    includeFloorSister: false,
    includePermit: true,
  },
  {
    label: 'Losing job: 1 extra-wide, drain relocate, tile surround, cast-iron demo, floor sister',
    tubCount: 1,
    scope: 'alcove-relocate',
    tub: 'bariatric',
    door: 'walk-through',
    travelMiles: 22,
    includeDemoCastIron: true,
    includeTileSurround: true,
    includeGrabBars: true,
    includeHandheld: true,
    includeFloorSister: true,
    includePermit: true,
  },
  {
    label: 'Two-bath: 2 acrylic soakers, alcove swap, outward doors, grab bars',
    tubCount: 2,
    scope: 'alcove-swap',
    tub: 'soaker-acrylic',
    door: 'outward',
    travelMiles: 18,
    includeDemoCastIron: false,
    includeTileSurround: false,
    includeGrabBars: true,
    includeHandheld: false,
    includeFloorSister: false,
    includePermit: true,
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
 * Starting demo and set hours from how much of the alcove is
 * actually sold. Alcove swap is the cheap special. Relocate
 * moves the drain. New construction has no demo. Custom
 * opening widens the alcove or converts a shower.
 */
export function suggestedScopeKit(scope) {
  const id = String(scope);
  if (id === 'alcove-swap') {
    return { hoursDemoEach: 2.5, hoursSetBase: 3.0 };
  }
  if (id === 'alcove-relocate') {
    return { hoursDemoEach: 3.5, hoursSetBase: 6.5 };
  }
  if (id === 'new-construction') {
    return { hoursDemoEach: 0, hoursSetBase: 4.5 };
  }
  if (id === 'custom-opening') {
    return { hoursDemoEach: 5.0, hoursSetBase: 8.0 };
  }
  throw new Error('Unknown scope');
}

/**
 * Acrylic soaker is the cheap-special assumption. Cast is
 * weight. Whirlpool is a pump and a GFCI. Air-jet is a
 * blower. Extra-wide is handling and often a floor.
 */
export function suggestedTubKit(tub) {
  const id = String(tub);
  if (id === 'soaker-acrylic') {
    return { hoursTubEach: 2.2, tubInvoice: 1850 };
  }
  if (id === 'soaker-cast') {
    return { hoursTubEach: 3.8, tubInvoice: 2800 };
  }
  if (id === 'whirlpool') {
    return { hoursTubEach: 5.5, tubInvoice: 4200 };
  }
  if (id === 'air-jet') {
    return { hoursTubEach: 5.0, tubInvoice: 3900 };
  }
  if (id === 'bariatric') {
    return { hoursTubEach: 6.5, tubInvoice: 5400 };
  }
  throw new Error('Unknown tub');
}

/**
 * Inward swing is the cheap-special door. Outward is safer
 * egress. Walk-through is a low threshold and more finish.
 */
export function suggestedDoorKit(door) {
  const id = String(door);
  if (id === 'inward') {
    return { hoursDoorEach: 1.2, doorInvoice: 0 };
  }
  if (id === 'outward') {
    return { hoursDoorEach: 1.6, doorInvoice: 180 };
  }
  if (id === 'walk-through') {
    return { hoursDoorEach: 2.4, doorInvoice: 420 };
  }
  throw new Error('Unknown door');
}

/**
 * Starting extras that do not live in a $3,499 installed special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 1.6,
    hoursPerMile: 0.035,
    hoursDemoCastEach: 3.5,
    hoursTileEach: 8.0,
    hoursGrabEach: 1.1,
    hoursHandheldEach: 0.8,
    hoursFloorEach: 4.5,
    hoursPermitEach: 1.2,
    siteHours: 1.0,
    demoCastEach: 280,
    tileEach: 650,
    grabEach: 145,
    handheldEach: 95,
    floorEach: 380,
    permitEach: 225,
    travelPerMile: 3.2,
  };
}

/**
 * Price a walk-in tub install from the count, the alcove, the
 * unit, the door, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const scope = requirePreset(SCOPE_PRESETS, input.scope, 'scope').id;
  const tub = requirePreset(TUB_PRESETS, input.tub, 'tub').id;
  const door = requirePreset(DOOR_PRESETS, input.door, 'door').id;

  const tubCount = number(input.tubCount ?? 0, 'Tub count');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const includeDemoCastIron = flag(input.includeDemoCastIron);
  const includeTileSurround = flag(input.includeTileSurround);
  const includeGrabBars = flag(input.includeGrabBars);
  const includeHandheld = flag(input.includeHandheld);
  const includeFloorSister = flag(input.includeFloorSister);
  const includePermit = flag(input.includePermit);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursTubEach = number(input.hoursTubEach ?? 0, 'Tub hours each');
  const hoursDemoEach = number(input.hoursDemoEach ?? 0, 'Demo hours each');
  const hoursSetBase = number(input.hoursSetBase ?? 0, 'Set-base hours each');
  const hoursDoorEach = number(input.hoursDoorEach ?? 0, 'Door hours each');
  const hoursDemoCastEach = number(input.hoursDemoCastEach ?? 0, 'Cast-iron demo hours each');
  const hoursTileEach = number(input.hoursTileEach ?? 0, 'Tile hours each');
  const hoursGrabEach = number(input.hoursGrabEach ?? 0, 'Grab-bar hours each');
  const hoursHandheldEach = number(input.hoursHandheldEach ?? 0, 'Handheld hours each');
  const hoursFloorEach = number(input.hoursFloorEach ?? 0, 'Floor hours each');
  const hoursPermitEach = number(input.hoursPermitEach ?? 0, 'Permit hours each');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const tubInvoice = number(input.tubInvoice ?? 0, 'Tub invoice');
  const doorInvoice = number(input.doorInvoice ?? 0, 'Door invoice');
  const demoCastEach = number(input.demoCastEach ?? 0, 'Cast-iron demo each');
  const tileEach = number(input.tileEach ?? 0, 'Tile surround each');
  const grabEach = number(input.grabEach ?? 0, 'Grab bars each');
  const handheldEach = number(input.handheldEach ?? 0, 'Handheld each');
  const floorEach = number(input.floorEach ?? 0, 'Floor sister each');
  const permitEach = number(input.permitEach ?? 0, 'Permit each');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');

  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursTub = tubCount * hoursTubEach;
  const hoursDemo = tubCount * hoursDemoEach;
  const hoursSet = tubCount * hoursSetBase;
  const hoursDoor = tubCount * hoursDoorEach;
  const hoursDemoCastApplied = includeDemoCastIron ? tubCount * hoursDemoCastEach : 0;
  const hoursTileApplied = includeTileSurround ? tubCount * hoursTileEach : 0;
  const hoursGrabApplied = includeGrabBars ? tubCount * hoursGrabEach : 0;
  const hoursHandheldApplied = includeHandheld ? tubCount * hoursHandheldEach : 0;
  const hoursFloorApplied = includeFloorSister ? tubCount * hoursFloorEach : 0;
  const hoursPermitApplied = includePermit ? tubCount * hoursPermitEach : 0;
  const extraWorkHours = hoursDemo + hoursSet + hoursDoor + hoursDemoCastApplied
    + hoursTileApplied + hoursGrabApplied + hoursHandheldApplied
    + hoursFloorApplied + hoursPermitApplied;
  const totalHours = hoursTravel + hoursTub + extraWorkHours + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const tubMaterial = tubCount * tubInvoice;
  const doorMaterial = tubCount * doorInvoice;
  const demoCastMaterial = includeDemoCastIron ? tubCount * demoCastEach : 0;
  const tileMaterial = includeTileSurround ? tubCount * tileEach : 0;
  const grabMaterial = includeGrabBars ? tubCount * grabEach : 0;
  const handheldMaterial = includeHandheld ? tubCount * handheldEach : 0;
  const floorMaterial = includeFloorSister ? tubCount * floorEach : 0;
  const permitMaterial = includePermit ? tubCount * permitEach : 0;
  const travelInvoice = travelMiles * travelPerMile;
  const fixtureMaterial = tubMaterial + doorMaterial;
  const extraHardware = demoCastMaterial + tileMaterial + grabMaterial
    + handheldMaterial + floorMaterial + permitMaterial + travelInvoice;
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
  const extraCost = extraHardware;

  return {
    scope,
    tub,
    door,
    tubCount,
    travelMiles,
    includeDemoCastIron,
    includeTileSurround,
    includeGrabBars,
    includeHandheld,
    includeFloorSister,
    includePermit,
    loadedWage,
    hoursTravel,
    hoursTub,
    hoursDemo,
    hoursSet,
    hoursDoor,
    hoursDemoCast: hoursDemoCastApplied,
    hoursTile: hoursTileApplied,
    hoursGrab: hoursGrabApplied,
    hoursHandheld: hoursHandheldApplied,
    hoursFloor: hoursFloorApplied,
    hoursPermit: hoursPermitApplied,
    siteHours,
    totalHours,
    laborCost,
    tubMaterial,
    doorMaterial,
    demoCastMaterial,
    tileMaterial,
    grabMaterial,
    handheldMaterial,
    floorMaterial,
    permitMaterial,
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
    pricePerTub: tubCount === 0 ? null : price / tubCount,
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
      tub: hourShare(hoursTub),
      demo: hourShare(hoursDemo),
      set: hourShare(hoursSet),
      door: hourShare(hoursDoor),
      demoCast: hourShare(hoursDemoCastApplied),
      tile: hourShare(hoursTileApplied),
      grab: hourShare(hoursGrabApplied),
      handheld: hourShare(hoursHandheldApplied),
      floor: hourShare(hoursFloorApplied),
      permit: hourShare(hoursPermitApplied),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perTub: tubCount === 0 ? null : proposedPrice / tubCount,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same bath four ways — alcove swap, relocate, new
 * construction, custom opening — from the suggested scope kits
 * so the contractor can see when a drain move flips the cheap
 * $3,499 special. User-typed scope rates are not reused here:
 * the comparison is apples-to-apples on the starting figures.
 * Tub and door kits stay with the current job.
 */
export function compareScope(input) {
  const tubKit = suggestedTubKit(String(input.tub ?? 'soaker-acrylic'));
  const doorKit = suggestedDoorKit(String(input.door ?? 'inward'));
  const extraKit = suggestedExtraKit();
  const rows = SCOPE_PRESETS.map((preset) => {
    const kit = suggestedScopeKit(preset.id);
    const bid = calculateBid({
      ...input,
      scope: preset.id,
      ...tubKit,
      ...doorKit,
      ...extraKit,
      ...kit,
    });
    return {
      scope: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerTub: bid.pricePerTub,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursTub: bid.hoursTub,
      hoursDemo: bid.hoursDemo,
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
 * Price the same bath five ways — acrylic soaker, cast,
 * whirlpool, air-jet, extra-wide — from the suggested tub kits
 * so the contractor can see the upgrade a homeowner is actually
 * asking for. User-typed tub rates are not reused here: the
 * comparison is apples-to-apples on the starting figures. Scope
 * and door kits stay with the current job.
 */
export function compareTub(input) {
  const scopeKit = suggestedScopeKit(String(input.scope ?? 'alcove-swap'));
  const doorKit = suggestedDoorKit(String(input.door ?? 'inward'));
  const extraKit = suggestedExtraKit();
  const rows = TUB_PRESETS.map((preset) => {
    const kit = suggestedTubKit(preset.id);
    const bid = calculateBid({
      ...input,
      tub: preset.id,
      ...scopeKit,
      ...doorKit,
      ...extraKit,
      ...kit,
    });
    return {
      tub: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerTub: bid.pricePerTub,
      hoursTub: bid.hoursTub,
      tubMaterial: bid.tubMaterial,
      extraCost: bid.extraCost,
      breakEvenPrice: bid.breakEvenPrice,
    };
  });
  const cheapest = Math.min(...rows.map((row) => row.price));
  const soaker = rows.find((row) => row.tub === 'soaker-acrylic');
  return rows
    .map((row) => ({
      ...row,
      cheapest: row.price === cheapest,
      delta: row.price - cheapest,
      upgradeFromSoaker: soaker ? row.price - soaker.price : 0,
    }))
    .sort((a, b) => a.price - b.price);
}

export const SUPPLY_PRESETS = Object.freeze([
  {
    id: 'contractor-supplied',
    label: 'You supply the tub',
    detail: 'Tub invoice stays in the bid',
  },
  {
    id: 'owner-fits',
    label: 'Owner supplies — it fits',
    detail: 'No tub invoice, same set hours',
  },
  {
    id: 'owner-wrong',
    label: 'Owner supplies — wrong drain / missing kit',
    detail: 'Inspect trip plus missing drain or overflow',
  },
]);

/**
 * Starting callback hours and missing-kit cost when the
 * owner's Amazon tub does not match the alcove. Taken from
 * the extra-kit trip plus a second door/drain pass so a
 * typed tub invoice does not leak into the "they bought it"
 * case.
 */
export function suggestedOwnerCallbackKit() {
  const extra = suggestedExtraKit();
  return {
    hoursCallbackTrip: extra.hoursTrip,
    hoursMissingHardwareEach: 2.0,
    missingHardwareEach: 220,
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
 * Price the same bath three ways: you supply the tub, the
 * owner supplies one that fits, or the owner supplies one
 * that does not fit and costs a second trip.
 *
 * Owner rows zero the tub invoice and keep the current set
 * hours — setting their Amazon unit is still a set. The
 * wrong-drain row adds a starting inspect trip and missing
 * overflow / drain-kit hardware on top of the current rates
 * so a typed invoice does not leak into the "they bought it"
 * case. Door invoice stays off the owner-row override;
 * missing-kit dollars go on the door line so tubInvoice
 * never appears on an owner row.
 *
 * An install-only price (options.installOnlyPrice, else the
 * proposed price on the bid) is scored against each cost
 * base. That is the $995 "just install what I bought"
 * number contractors actually get shopped on.
 */
export function compareOwnerSupply(input, options = {}) {
  const callback = suggestedOwnerCallbackKit();
  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursDoorEach = number(input.hoursDoorEach ?? 0, 'Door hours each');
  const doorInvoice = number(input.doorInvoice ?? 0, 'Door invoice');

  let installPrice = null;
  const rawInstall = options.installOnlyPrice !== undefined
    ? options.installOnlyPrice
    : input.proposedPrice;
  if (rawInstall !== null && rawInstall !== undefined && rawInstall !== '') {
    installPrice = number(rawInstall, 'Install-only price');
  }

  const contractor = calculateBid(input);
  const ownerFits = calculateBid({ ...input, tubInvoice: 0 });
  const ownerWrong = calculateBid({
    ...input,
    tubInvoice: 0,
    hoursTrip: hoursTrip + callback.hoursCallbackTrip,
    hoursDoorEach: hoursDoorEach + callback.hoursMissingHardwareEach,
    doorInvoice: doorInvoice + callback.missingHardwareEach,
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
    doorMaterial: row.bid.doorMaterial,
    hoursTravel: row.bid.hoursTravel,
    hoursDoor: row.bid.hoursDoor,
    hoursSet: row.bid.hoursSet,
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
 * names the bid drop from zeroing the tub invoice.
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
      return `At ${money(asked)} install-only you lose money even when they bought the tub. Walk-away on the owner-supplied set is ${money(fits.breakEvenPrice)}.`;
    }
    if (contractor.installOnly.belowBreakEven && !fits.installOnly.belowBreakEven) {
      if (wrong.installOnly?.belowBreakEven) {
        return `At ${money(asked)} the contractor-supplied job loses ${money(Math.abs(contractor.installOnly.profit))}. The same install-only number covers the set if their tub actually fits. A wrong-drain callback still loses ${money(Math.abs(wrong.installOnly.profit))} — walk-away then is ${money(wrong.breakEvenPrice)}.`;
      }
      return `At ${money(asked)} the contractor-supplied job loses ${money(Math.abs(contractor.installOnly.profit))}. The same install-only number covers the set if their tub actually fits.`;
    }
    if (wrong.installOnly?.belowBreakEven) {
      return `At ${money(asked)} the set covers if their tub fits. A wrong-drain callback still loses ${money(Math.abs(wrong.installOnly.profit))} — walk-away then is ${money(wrong.breakEvenPrice)}.`;
    }
    return `At ${money(asked)} both supply paths hold a margin. A wrong-drain callback still adds ${money(callbackLift)} to the bid.`;
  }
  return `Zeroing the tub invoice drops the bid ${money(drop)}. A wrong-drain callback puts ${money(callbackLift)} back on.`;
}

export const ACCESS_PRESETS = Object.freeze([
  {
    id: 'weekday-scheduled',
    label: 'Weekday, they leave',
    detail: 'Another bath, or they stay out of this one',
  },
  {
    id: 'occupied-weekday',
    label: 'Weekday, only bath still in use',
    detail: 'Same wage, slower set and punch-list after a fall',
  },
  {
    id: 'after-hours',
    label: 'After-hours / Saturday',
    detail: 'Overtime wage plus a second evening trip',
  },
]);

/**
 * Starting pace and overtime when they will not wait for a
 * weekday slot. Occupied pace is a multiplier on the typed
 * unit, demo, set, and site hours — working around the only
 * tub they still climb is slower, not a different wage.
 * After-hours is time-and-a-half on the typed wage plus a
 * second evening dispatch from the owner-callback trip, so a
 * typed 9-hour site day does not inflate the extra trip.
 */
export function suggestedAccessKit() {
  const extra = suggestedExtraKit();
  return {
    occupiedPaceMultiplier: 1.25,
    afterHoursWageMultiplier: 1.5,
    afterHoursExtraTripHours: extra.hoursTrip,
  };
}

/**
 * Price the same bath three ways: they leave on a weekday,
 * they still bathe around you, or Saturday / after-hours.
 *
 * Occupied keeps the typed wage and adds clock hours on
 * the unit set, demo, alcove set, and punch-list. After-hours
 * keeps the typed hours and raises the wage, then adds a
 * starting second evening trip because you cannot leave the
 * alcove open overnight in the only bath. Scope, tub invoice,
 * and extras stay.
 *
 * A Saturday / install-only price (options.installOnlyPrice,
 * else the proposed price on the bid) is scored against
 * each cost base. That is the "$3,499 Saturday" number
 * aging-in-place shops actually get shopped on after a fall.
 */
export function compareAccess(input, options = {}) {
  const kit = suggestedAccessKit();
  const hoursTubEach = number(input.hoursTubEach ?? 0, 'Tub hours each');
  const hoursDemoEach = number(input.hoursDemoEach ?? 0, 'Demo hours each');
  const hoursSetBase = number(input.hoursSetBase ?? 0, 'Set-base hours each');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');

  let installPrice = null;
  const rawInstall = options.installOnlyPrice !== undefined
    ? options.installOnlyPrice
    : input.proposedPrice;
  if (rawInstall !== null && rawInstall !== undefined && rawInstall !== '') {
    installPrice = number(rawInstall, 'Install-only price');
  }

  const weekday = calculateBid(input);
  const occupied = calculateBid({
    ...input,
    hoursTubEach: hoursTubEach * kit.occupiedPaceMultiplier,
    hoursDemoEach: hoursDemoEach * kit.occupiedPaceMultiplier,
    hoursSetBase: hoursSetBase * kit.occupiedPaceMultiplier,
    siteHours: siteHours * kit.occupiedPaceMultiplier,
  });
  const afterHours = calculateBid({
    ...input,
    hourlyWage: hourlyWage * kit.afterHoursWageMultiplier,
    hoursTrip: hoursTrip + kit.afterHoursExtraTripHours,
  });

  const rows = [
    {
      access: 'weekday-scheduled',
      label: ACCESS_PRESETS[0].label,
      detail: ACCESS_PRESETS[0].detail,
      bid: weekday,
    },
    {
      access: 'occupied-weekday',
      label: ACCESS_PRESETS[1].label,
      detail: ACCESS_PRESETS[1].detail,
      bid: occupied,
    },
    {
      access: 'after-hours',
      label: ACCESS_PRESETS[2].label,
      detail: ACCESS_PRESETS[2].detail,
      bid: afterHours,
    },
  ].map((row) => ({
    access: row.access,
    label: row.label,
    detail: row.detail,
    price: row.bid.price,
    totalCost: row.bid.totalCost,
    totalHours: row.bid.totalHours,
    loadedWage: row.bid.loadedWage,
    siteHours: row.bid.siteHours,
    hoursTub: row.bid.hoursTub,
    hoursDemo: row.bid.hoursDemo,
    hoursSet: row.bid.hoursSet,
    hoursTravel: row.bid.hoursTravel,
    laborCost: row.bid.laborCost,
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
 * / after-hours loss when that number is on the table;
 * otherwise names the bid lift from a weekday they leave.
 */
export function accessNote(rows) {
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new Error('Access comparison is missing rows');
  }
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const occupied = rows.find((row) => row.access === 'occupied-weekday');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  if (!weekday || !occupied || !afterHours) {
    throw new Error('Access comparison is missing an access row');
  }

  const occupiedLift = occupied.price - weekday.price;
  const afterHoursLift = afterHours.price - weekday.price;
  if (weekday.installOnly && afterHours.installOnly) {
    const asked = weekday.installOnly.price;
    if (weekday.installOnly.belowBreakEven && afterHours.installOnly.belowBreakEven) {
      return `At ${money(asked)} you lose money even on a weekday slot. Walk-away after-hours is ${money(afterHours.breakEvenPrice)}.`;
    }
    if (!weekday.installOnly.belowBreakEven && afterHours.installOnly.belowBreakEven) {
      return `At ${money(asked)} the weekday set covers. The same Saturday / after-hours number loses ${money(Math.abs(afterHours.installOnly.profit))} — walk-away then is ${money(afterHours.breakEvenPrice)}.`;
    }
    if (occupied.installOnly?.belowBreakEven) {
      return `At ${money(asked)} a weekday slot covers. Same-day while they stay home still loses ${money(Math.abs(occupied.installOnly.profit))} — walk-away then is ${money(occupied.breakEvenPrice)}.`;
    }
    return `At ${money(asked)} every access window still holds a margin. After-hours still adds ${money(afterHoursLift)} to the bid.`;
  }
  return `Only-bath-still-in-use adds ${money(occupiedLift)} to the bid. After-hours / Saturday adds ${money(afterHoursLift)}.`;
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
export function formatBidSummary(result, jobLabel = 'Walk-in tub install') {
  const perTub = result.pricePerTub === null
    ? 'n/a'
    : `${money(result.pricePerTub)} / tub`;
  const scope = SCOPE_PRESETS.find((item) => item.id === result.scope)?.label ?? result.scope;
  const tub = TUB_PRESETS.find((item) => item.id === result.tub)?.label ?? result.tub;
  const door = DOOR_PRESETS.find((item) => item.id === result.door)?.label ?? result.door;
  const extras = [
    `${result.travelMiles} travel miles`,
    tub,
    door,
    `${result.tubCount} tub${result.tubCount === 1 ? '' : 's'}`,
    result.includeDemoCastIron ? 'cast-iron demo included' : 'no cast-iron demo',
    result.includeTileSurround ? 'tile surround included' : 'no tile surround',
    result.includeGrabBars ? 'grab bars included' : 'no grab bars',
    result.includeHandheld ? 'handheld shower included' : 'no handheld shower',
    result.includeFloorSister ? 'floor sistering included' : 'no floor sistering',
    result.includePermit ? 'permit included' : 'no permit',
  ].join('; ');
  return [
    'WALK-IN TUB INSTALL BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${scope}`,
    `Price per tub: ${perTub}`,
    `Tubs: ${result.tubCount.toLocaleString('en-US')}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.tubCount} tub${result.tubCount === 1 ? '' : 's'}; ${tub}; ${scope}; ${door}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; unit: ${result.hoursTub.toFixed(1)} h; extras: ${(result.hoursDemo + result.hoursSet + result.hoursDoor + result.hoursDemoCast + result.hoursTile + result.hoursGrab + result.hoursHandheld + result.hoursFloor + result.hoursPermit).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm tub count, unit, alcove, door, extras, and all pricing before sending. It is not a building-code determination, an accessibility approval, a plumbing design, a walk-in-shower bid, a hot-tub install, a toilet-replacement bid, or a product warranty.',
  ].join('\n');
}
