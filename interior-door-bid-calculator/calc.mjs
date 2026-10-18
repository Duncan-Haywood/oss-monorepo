// Pure bid arithmetic for residential interior-door replacement.
// No network, no state: every door, size, casing, wage, and
// millwork invoice is an input, so the result stays a transparent
// calculation the carpenter can check against their own tickets
// rather than a claim about what any opening "should" cost.
//
// The method is the one the trade actually loses money on: a
// published "$150 a door installed" Facebook special treats a
// hollow-core slab hung on an existing jamb as the same job as a
// solid-core prehung in a new opening with paint-grade casing,
// new privacy hardware, and a haul-away. Homeowners (and a lot of
// estimator sheets) count the same kind of number. Framing a new
// doorway, pocket conversion, 8-foot leaves, and a French pair do
// not live in that dump. Matching the cheap hang special on a
// pocket-conversion job is how a sold door becomes a loss when
// the header and the extra trip eat the margin.
//
// Distinct from *entry-door / front-door* (weather, sidelights,
// transom, jamb-rot, a storm door), *patio-door / slider*
// (panels and impact glass), *garage-door* (springs and a
// header), *plantation shutter* (louvered panels in an opening),
// *crown molding* (a run of trim), and *interior painting* (a
// coat). This prices an interior door replacement: the leaf, the
// opening, the casing, and the extras.

export const SCOPE_PRESETS = Object.freeze([
  { id: 'hang-only', label: 'Hang only — slab on the existing jamb (the cheap special)' },
  { id: 'prehung-swap', label: 'Prehung swap — pull the old unit and set a new prehung' },
  { id: 'new-opening', label: 'New opening — frame the doorway, hang, and case both sides' },
  { id: 'pocket-conversion', label: 'Pocket conversion — frame a pocket and hang the leaf' },
]);

export const DOOR_PRESETS = Object.freeze([
  { id: 'hollow-slab', label: 'Hollow-core slab — the cheap special' },
  { id: 'hollow-prehung', label: 'Hollow-core prehung — builder-grade unit' },
  { id: 'solid-core', label: 'Solid-core prehung — sound, bedroom, or fire-rated' },
  { id: 'french-or-barn', label: 'French pair or barn — heavier leaf and hardware' },
]);

export const SIZE_PRESETS = Object.freeze([
  { id: '80-single', label: '80-inch single — the common interior door' },
  { id: '96-single', label: '96-inch / 8-foot single — taller leaf and more casing' },
  { id: 'double', label: 'Double / pair — two leaves in one opening' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Cheap special: 1 hollow slab, 80-inch, hang-only',
    doorCount: 1,
    scope: 'hang-only',
    door: 'hollow-slab',
    size: '80-single',
    travelMiles: 6,
    includePaint: false,
    includeHaul: false,
    includeHardware: false,
  },
  {
    label: 'Typical remodel: 3 hollow prehung, 80-inch, swap, paint, haul',
    doorCount: 3,
    scope: 'prehung-swap',
    door: 'hollow-prehung',
    size: '80-single',
    travelMiles: 12,
    includePaint: true,
    includeHaul: true,
    includeHardware: false,
  },
  {
    label: 'Losing job: 1 French pair, 96-inch, pocket conversion, paint, haul, hardware',
    doorCount: 1,
    scope: 'pocket-conversion',
    door: 'french-or-barn',
    size: '96-single',
    travelMiles: 18,
    includePaint: true,
    includeHaul: true,
    includeHardware: true,
  },
  {
    label: 'Whole-house: 8 solid-core, 80-inch, prehung swap, paint, haul, hardware',
    doorCount: 8,
    scope: 'prehung-swap',
    door: 'solid-core',
    size: '80-single',
    travelMiles: 22,
    includePaint: true,
    includeHaul: true,
    includeHardware: true,
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
 * Starting hang, frame, and casing hours from how much of the
 * opening is actually sold. Hang-only on an existing jamb is the
 * cheap special. Prehung-swap is a unit pull. New-opening is a
 * header. Pocket-conversion is a wall pocket.
 */
export function suggestedScopeKit(scope) {
  const id = String(scope);
  if (id === 'hang-only') {
    return {
      hoursHangPerDoor: 0.75,
      hoursFramePerDoor: 0,
      hoursCasingPerDoor: 0.2,
      casingEach: 0,
      frameKitEach: 0,
    };
  }
  if (id === 'prehung-swap') {
    return {
      hoursHangPerDoor: 1.4,
      hoursFramePerDoor: 0.3,
      hoursCasingPerDoor: 0.65,
      casingEach: 32,
      frameKitEach: 0,
    };
  }
  if (id === 'new-opening') {
    return {
      hoursHangPerDoor: 1.5,
      hoursFramePerDoor: 2.2,
      hoursCasingPerDoor: 1.1,
      casingEach: 52,
      frameKitEach: 95,
    };
  }
  if (id === 'pocket-conversion') {
    return {
      hoursHangPerDoor: 1.8,
      hoursFramePerDoor: 3.4,
      hoursCasingPerDoor: 1.4,
      casingEach: 68,
      frameKitEach: 240,
    };
  }
  throw new Error('Unknown scope');
}

/**
 * Hollow slab is the cheap-special assumption.
 * Hollow prehung is a builder unit. Solid-core is weight and a
 * closer fit. French-or-barn is a pair of leaves or a track.
 */
export function suggestedDoorKit(door) {
  const id = String(door);
  if (id === 'hollow-slab') {
    return { hoursTypePerDoor: 0, doorInvoice: 48 };
  }
  if (id === 'hollow-prehung') {
    return { hoursTypePerDoor: 0.15, doorInvoice: 175 };
  }
  if (id === 'solid-core') {
    return { hoursTypePerDoor: 0.5, doorInvoice: 340 };
  }
  if (id === 'french-or-barn') {
    return { hoursTypePerDoor: 1.15, doorInvoice: 720 };
  }
  throw new Error('Unknown door');
}

/**
 * 80-inch single is the opening the cheap special assumes.
 * 96-inch is a taller leaf. Double is two leaves.
 */
export function suggestedSizeKit(size) {
  const id = String(size);
  if (id === '80-single') {
    return { hoursSizePerDoor: 0, extraLeafEach: 0 };
  }
  if (id === '96-single') {
    return { hoursSizePerDoor: 0.55, extraLeafEach: 95 };
  }
  if (id === 'double') {
    return { hoursSizePerDoor: 0.9, extraLeafEach: 175 };
  }
  throw new Error('Unknown size');
}

/**
 * Starting extras that do not live in a $150-a-door special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 0.8,
    hoursPerMile: 0.035,
    hoursPaintPerDoor: 0.7,
    hoursHaulPerDoor: 0.2,
    hoursHardwarePerDoor: 0.3,
    siteHours: 0.35,
    paintEach: 24,
    haulEach: 18,
    hardwareEach: 48,
    travelPerMile: 2.8,
  };
}

/**
 * Price an interior-door replacement from the count, the leaf,
 * the opening, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const scope = requirePreset(SCOPE_PRESETS, input.scope, 'scope').id;
  const door = requirePreset(DOOR_PRESETS, input.door, 'door').id;
  const size = requirePreset(SIZE_PRESETS, input.size, 'size').id;

  const doorCount = number(input.doorCount ?? 0, 'Door count');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const includePaint = flag(input.includePaint);
  const includeHaul = flag(input.includeHaul);
  const includeHardware = flag(input.includeHardware);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursHangPerDoor = number(input.hoursHangPerDoor ?? 0, 'Hang hours per door');
  const hoursFramePerDoor = number(input.hoursFramePerDoor ?? 0, 'Frame hours per door');
  const hoursCasingPerDoor = number(input.hoursCasingPerDoor ?? 0, 'Casing hours per door');
  const hoursTypePerDoor = number(input.hoursTypePerDoor ?? 0, 'Type hours per door');
  const hoursSizePerDoor = number(input.hoursSizePerDoor ?? 0, 'Size hours per door');
  const hoursPaintPerDoor = number(input.hoursPaintPerDoor ?? 0, 'Paint hours per door');
  const hoursHaulPerDoor = number(input.hoursHaulPerDoor ?? 0, 'Haul hours per door');
  const hoursHardwarePerDoor = number(input.hoursHardwarePerDoor ?? 0, 'Hardware hours per door');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const doorInvoice = number(input.doorInvoice ?? 0, 'Door invoice');
  const extraLeafEach = number(input.extraLeafEach ?? 0, 'Extra leaf each');
  const casingEach = number(input.casingEach ?? 0, 'Casing each');
  const frameKitEach = number(input.frameKitEach ?? 0, 'Frame kit each');
  const paintEach = number(input.paintEach ?? 0, 'Paint each');
  const haulEach = number(input.haulEach ?? 0, 'Haul each');
  const hardwareEach = number(input.hardwareEach ?? 0, 'Hardware each');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');

  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursHang = doorCount * hoursHangPerDoor;
  const hoursFrame = doorCount * hoursFramePerDoor;
  const hoursCasing = doorCount * hoursCasingPerDoor;
  const hoursType = doorCount * hoursTypePerDoor;
  const hoursSize = doorCount * hoursSizePerDoor;
  const hoursPaintApplied = includePaint ? doorCount * hoursPaintPerDoor : 0;
  const hoursHaulApplied = includeHaul ? doorCount * hoursHaulPerDoor : 0;
  const hoursHardwareApplied = includeHardware ? doorCount * hoursHardwarePerDoor : 0;
  const extraWorkHours = hoursFrame + hoursCasing + hoursType + hoursSize
    + hoursPaintApplied + hoursHaulApplied + hoursHardwareApplied;
  const totalHours = hoursTravel + hoursHang + extraWorkHours + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const leafMaterial = doorCount * doorInvoice;
  const extraLeafMaterial = doorCount * extraLeafEach;
  const casingMaterial = doorCount * casingEach;
  const frameMaterial = doorCount * frameKitEach;
  const paintMaterial = includePaint ? doorCount * paintEach : 0;
  const haulMaterial = includeHaul ? doorCount * haulEach : 0;
  const hardwareMaterial = includeHardware ? doorCount * hardwareEach : 0;
  const travelInvoice = travelMiles * travelPerMile;
  const finishMaterial = leafMaterial + extraLeafMaterial;
  const extraHardware = casingMaterial + frameMaterial + paintMaterial
    + haulMaterial + hardwareMaterial + travelInvoice;
  const materialCost = finishMaterial + extraHardware;

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
    door,
    size,
    doorCount,
    travelMiles,
    includePaint,
    includeHaul,
    includeHardware,
    loadedWage,
    hoursTravel,
    hoursHang,
    hoursFrame,
    hoursCasing,
    hoursType,
    hoursSize,
    hoursPaint: hoursPaintApplied,
    hoursHaul: hoursHaulApplied,
    hoursHardware: hoursHardwareApplied,
    siteHours,
    totalHours,
    laborCost,
    leafMaterial,
    extraLeafMaterial,
    casingMaterial,
    frameMaterial,
    paintMaterial,
    haulMaterial,
    hardwareMaterial,
    travelInvoice,
    extraHardware,
    extraCost,
    finishMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerDoor: doorCount === 0 ? null : price / doorCount,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      finish: costShare(finishMaterial),
      extra: costShare(extraCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      travel: hourShare(hoursTravel),
      hang: hourShare(hoursHang),
      frame: hourShare(hoursFrame),
      casing: hourShare(hoursCasing),
      type: hourShare(hoursType),
      size: hourShare(hoursSize),
      paint: hourShare(hoursPaintApplied),
      haul: hourShare(hoursHaulApplied),
      hardware: hourShare(hoursHardwareApplied),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perDoor: doorCount === 0 ? null : proposedPrice / doorCount,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same opening four ways — hang-only, prehung-swap,
 * new-opening, pocket-conversion — from the suggested scope kits
 * so the carpenter can see when a pocket frame flips the cheap
 * $150 special. User-typed scope rates are not reused here: the
 * comparison is apples-to-apples on the starting figures. Door
 * and size kits stay with the current job.
 */
export function compareScope(input) {
  const doorKit = suggestedDoorKit(String(input.door ?? 'hollow-slab'));
  const sizeKit = suggestedSizeKit(String(input.size ?? '80-single'));
  const extraKit = suggestedExtraKit();
  const rows = SCOPE_PRESETS.map((preset) => {
    const kit = suggestedScopeKit(preset.id);
    const bid = calculateBid({
      ...input,
      scope: preset.id,
      ...doorKit,
      ...sizeKit,
      ...extraKit,
      ...kit,
    });
    return {
      scope: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerDoor: bid.pricePerDoor,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursHang: bid.hoursHang,
      hoursFrame: bid.hoursFrame,
      hoursCasing: bid.hoursCasing,
      casingMaterial: bid.casingMaterial,
      frameMaterial: bid.frameMaterial,
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
 * Price the same opening four ways — hollow slab, hollow
 * prehung, solid-core, French-or-barn — from the suggested door
 * kits so the carpenter can see the upgrade a homeowner is
 * actually asking for. User-typed door rates are not reused
 * here. Scope and size kits stay with the current job.
 */
export function compareDoor(input) {
  const scopeKit = suggestedScopeKit(String(input.scope ?? 'hang-only'));
  const sizeKit = suggestedSizeKit(String(input.size ?? '80-single'));
  const extraKit = suggestedExtraKit();
  const rows = DOOR_PRESETS.map((preset) => {
    const kit = suggestedDoorKit(preset.id);
    const bid = calculateBid({
      ...input,
      door: preset.id,
      ...scopeKit,
      ...sizeKit,
      ...extraKit,
      ...kit,
    });
    return {
      door: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerDoor: bid.pricePerDoor,
      hoursType: bid.hoursType,
      leafMaterial: bid.leafMaterial,
      extraCost: bid.extraCost,
      breakEvenPrice: bid.breakEvenPrice,
    };
  });
  const cheapest = Math.min(...rows.map((row) => row.price));
  const slab = rows.find((row) => row.door === 'hollow-slab');
  return rows
    .map((row) => ({
      ...row,
      cheapest: row.price === cheapest,
      delta: row.price - cheapest,
      upgradeFromSlab: slab ? row.price - slab.price : 0,
    }))
    .sort((a, b) => a.price - b.price);
}

export const SUPPLY_PRESETS = Object.freeze([
  {
    id: 'carpenter-supplied',
    label: 'You supply the leaf',
    detail: 'Millwork invoice stays in the bid',
  },
  {
    id: 'owner-fits',
    label: 'Owner supplies — it hangs',
    detail: 'No leaf invoice, same hang hours',
  },
  {
    id: 'owner-wrong',
    label: 'Owner supplies — wrong size / binds',
    detail: 'Second trip plus plane and shim',
  },
]);

/**
 * Starting callback hours and plane/shim material when the
 * owner's store-bought slab is the wrong height or binds in
 * the jamb. Taken from the extra-kit trip plus a plane pass
 * so a typed 9-hour hang does not inflate the callback.
 */
export function suggestedOwnerCallbackKit() {
  const extra = suggestedExtraKit();
  return {
    hoursCallbackTrip: extra.hoursTrip,
    hoursPlanePerDoor: 0.45,
    planeKitEach: 18,
  };
}

function scoreHangOnly(bid, hangPrice) {
  if (hangPrice === null) return null;
  return {
    price: hangPrice,
    profit: hangPrice - bid.totalCost,
    margin: hangPrice === 0 ? 0 : (hangPrice - bid.totalCost) / hangPrice * 100,
    hourlyRate: bid.totalHours === 0 ? null : hangPrice / bid.totalHours,
    belowBreakEven: hangPrice < bid.totalCost,
  };
}

/**
 * Price the same opening three ways: you supply the leaf, the
 * owner supplies one that hangs, or the owner supplies one that
 * does not fit and costs a second trip.
 *
 * Owner rows zero the millwork invoice and keep the current hang
 * hours — pulling a Home Depot slab is still a hang. The
 * wrong-size row adds a starting callback trip and a plane/shim
 * kit on top of the current rates so a typed invoice does not
 * leak into the "they bought it" case.
 *
 * A hang-only price (options.hangOnlyPrice, else the proposed
 * price on the bid) is scored against each cost base. That is
 * the $150 "just hang what I bought" number carpenters actually
 * get shopped on.
 */
export function compareOwnerSupply(input, options = {}) {
  const callback = suggestedOwnerCallbackKit();
  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursSizePerDoor = number(input.hoursSizePerDoor ?? 0, 'Size hours per door');
  const extraLeafEach = number(input.extraLeafEach ?? 0, 'Extra leaf each');

  let hangPrice = null;
  const rawHang = options.hangOnlyPrice !== undefined
    ? options.hangOnlyPrice
    : input.proposedPrice;
  if (rawHang !== null && rawHang !== undefined && rawHang !== '') {
    hangPrice = number(rawHang, 'Hang-only price');
  }

  const carpenter = calculateBid(input);
  const ownerFits = calculateBid({ ...input, doorInvoice: 0 });
  const ownerWrong = calculateBid({
    ...input,
    doorInvoice: 0,
    hoursTrip: hoursTrip + callback.hoursCallbackTrip,
    hoursSizePerDoor: hoursSizePerDoor + callback.hoursPlanePerDoor,
    extraLeafEach: extraLeafEach + callback.planeKitEach,
  });

  const rows = [
    {
      supply: 'carpenter-supplied',
      label: SUPPLY_PRESETS[0].label,
      detail: SUPPLY_PRESETS[0].detail,
      bid: carpenter,
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
    leafMaterial: row.bid.leafMaterial,
    extraLeafMaterial: row.bid.extraLeafMaterial,
    hoursTravel: row.bid.hoursTravel,
    hoursSize: row.bid.hoursSize,
    breakEvenPrice: row.bid.breakEvenPrice,
    hangOnly: scoreHangOnly(row.bid, hangPrice),
    savedVsCarpenter: carpenter.price - row.bid.price,
  }));

  const cheapest = Math.min(...rows.map((row) => row.price));
  return rows.map((row) => ({
    ...row,
    cheapest: row.price === cheapest,
    delta: row.price - cheapest,
    hangOnlyPrice: hangPrice,
  }));
}

/**
 * One-line verdict for the owner-supplied table. Names the
 * hang-only loss when that number is on the table; otherwise
 * names the bid drop from zeroing the leaf.
 */
export function ownerSupplyNote(rows) {
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new Error('Owner-supply comparison is missing rows');
  }
  const carpenter = rows.find((row) => row.supply === 'carpenter-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  if (!carpenter || !fits || !wrong) {
    throw new Error('Owner-supply comparison is missing a supply row');
  }

  const drop = carpenter.price - fits.price;
  const callbackLift = wrong.price - fits.price;
  if (carpenter.hangOnly && fits.hangOnly) {
    const asked = carpenter.hangOnly.price;
    if (carpenter.hangOnly.belowBreakEven && fits.hangOnly.belowBreakEven) {
      return `At ${money(asked)} hang-only you lose money even when they bought the leaf. Walk-away on the owner-supplied hang is ${money(fits.breakEvenPrice)}.`;
    }
    if (carpenter.hangOnly.belowBreakEven && !fits.hangOnly.belowBreakEven) {
      return `At ${money(asked)} the carpenter-supplied job loses ${money(Math.abs(carpenter.hangOnly.profit))}. The same hang-only number covers the set if their slab actually hangs.`;
    }
    if (wrong.hangOnly?.belowBreakEven) {
      return `At ${money(asked)} the hang covers if their slab fits. A wrong-size callback still loses ${money(Math.abs(wrong.hangOnly.profit))} — walk-away then is ${money(wrong.breakEvenPrice)}.`;
    }
    return `At ${money(asked)} both supply paths hold a margin. A wrong-size callback still adds ${money(callbackLift)} to the bid.`;
  }
  return `Zeroing the leaf invoice drops the bid ${money(drop)}. A wrong-size callback puts ${money(callbackLift)} back on.`;
}

export const ACCESS_PRESETS = Object.freeze([
  {
    id: 'weekday-empty',
    label: 'Weekday, they leave',
    detail: 'Empty house; you book the day',
  },
  {
    id: 'occupied-stay',
    label: 'Weekday, they stay',
    detail: 'Same wage, slower hang and punch-list',
  },
  {
    id: 'after-hours',
    label: 'After-hours / Saturday',
    detail: 'Overtime wage plus a second dispatch',
  },
]);

/**
 * Starting pace and overtime when they will not leave you the
 * house on a weekday, or want Saturday / after 5pm because they
 * work. Occupied pace is a multiplier on the typed hang and
 * punch-list hours — working around furniture, pets, and a
 * homeowner who "just wants to watch" is slower, not a different
 * wage. After-hours is time-and-a-half on the typed wage plus a
 * second Saturday dispatch from the extra-kit trip, so a typed
 * 9-hour hang does not inflate the extra trip.
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
 * Price the same opening three ways: weekday they leave,
 * weekday they stay home, or after-hours / Saturday.
 *
 * Occupied keeps the typed wage and adds clock hours on the
 * hang and punch-list. After-hours keeps the typed hours and
 * raises the wage, then adds a starting second dispatch
 * because a Saturday hang is not a stop you combine with a
 * weekday route. Leaf, scope, millwork invoice, and extras
 * stay.
 *
 * A hang-only price (options.hangOnlyPrice, else the proposed
 * price on the bid) is scored against each cost base. That is
 * the "$150 Saturday" number carpenters actually get shopped
 * on.
 */
export function compareAccess(input, options = {}) {
  const kit = suggestedAccessKit();
  const hoursHangPerDoor = number(input.hoursHangPerDoor ?? 0, 'Hang hours per door');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');
  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');

  let hangPrice = null;
  const rawHang = options.hangOnlyPrice !== undefined
    ? options.hangOnlyPrice
    : input.proposedPrice;
  if (rawHang !== null && rawHang !== undefined && rawHang !== '') {
    hangPrice = number(rawHang, 'Hang-only price');
  }

  const weekday = calculateBid(input);
  const occupied = calculateBid({
    ...input,
    hoursHangPerDoor: hoursHangPerDoor * kit.occupiedPaceMultiplier,
    siteHours: siteHours * kit.occupiedPaceMultiplier,
  });
  const afterHours = calculateBid({
    ...input,
    hourlyWage: hourlyWage * kit.afterHoursWageMultiplier,
    hoursTrip: hoursTrip + kit.afterHoursExtraTripHours,
  });

  const rows = [
    {
      access: 'weekday-empty',
      label: ACCESS_PRESETS[0].label,
      detail: ACCESS_PRESETS[0].detail,
      bid: weekday,
    },
    {
      access: 'occupied-stay',
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
    hoursTravel: row.bid.hoursTravel,
    hoursHang: row.bid.hoursHang,
    siteHours: row.bid.siteHours,
    laborCost: row.bid.laborCost,
    breakEvenPrice: row.bid.breakEvenPrice,
    hangOnly: scoreHangOnly(row.bid, hangPrice),
    liftFromWeekday: row.bid.price - weekday.price,
  }));

  const cheapest = Math.min(...rows.map((row) => row.price));
  return rows.map((row) => ({
    ...row,
    cheapest: row.price === cheapest,
    delta: row.price - cheapest,
    hangOnlyPrice: hangPrice,
  }));
}

/**
 * One-line verdict for the access table. Names the Saturday
 * / after-hours loss when that number is on the table;
 * otherwise names the bid lift from a weekday they-leave slot.
 */
export function accessNote(rows) {
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new Error('Access comparison is missing rows');
  }
  const weekday = rows.find((row) => row.access === 'weekday-empty');
  const occupied = rows.find((row) => row.access === 'occupied-stay');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  if (!weekday || !occupied || !afterHours) {
    throw new Error('Access comparison is missing an access row');
  }

  const occupiedLift = occupied.price - weekday.price;
  const afterHoursLift = afterHours.price - weekday.price;
  if (weekday.hangOnly && afterHours.hangOnly) {
    const asked = weekday.hangOnly.price;
    if (weekday.hangOnly.belowBreakEven && afterHours.hangOnly.belowBreakEven) {
      return `At ${money(asked)} you lose money even on a weekday they-leave slot. Walk-away after-hours is ${money(afterHours.breakEvenPrice)}.`;
    }
    if (!weekday.hangOnly.belowBreakEven && afterHours.hangOnly.belowBreakEven) {
      return `At ${money(asked)} the weekday hang covers. The same Saturday / after-hours number loses ${money(Math.abs(afterHours.hangOnly.profit))} — walk-away then is ${money(afterHours.breakEvenPrice)}.`;
    }
    if (occupied.hangOnly?.belowBreakEven) {
      return `At ${money(asked)} a weekday they-leave slot covers. Weekday while they stay home still loses ${money(Math.abs(occupied.hangOnly.profit))} — walk-away then is ${money(occupied.breakEvenPrice)}.`;
    }
    return `At ${money(asked)} every access window still holds a margin. After-hours still adds ${money(afterHoursLift)} to the bid.`;
  }
  return `Weekday while they stay home adds ${money(occupiedLift)} to the bid. After-hours / Saturday adds ${money(afterHoursLift)}.`;
}

function money(value) {
  const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Format a bid as a plain-text draft the carpenter can paste
 * into a proposal. Costs, wages, and invoices are omitted on
 * purpose — this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Interior door replacement') {
  const perDoor = result.pricePerDoor === null
    ? 'n/a'
    : `${money(result.pricePerDoor)} / door`;
  const scope = SCOPE_PRESETS.find((item) => item.id === result.scope)?.label ?? result.scope;
  const door = DOOR_PRESETS.find((item) => item.id === result.door)?.label ?? result.door;
  const size = SIZE_PRESETS.find((item) => item.id === result.size)?.label ?? result.size;
  const extras = [
    `${result.travelMiles} travel miles`,
    door,
    size,
    `${result.doorCount} door${result.doorCount === 1 ? '' : 's'}`,
    result.includePaint ? 'paint both sides included' : 'no paint',
    result.includeHaul ? 'haul-away included' : 'no haul-away',
    result.includeHardware ? 'new lockset included' : 'reuse existing hardware',
  ].join('; ');
  return [
    'INTERIOR DOOR REPLACEMENT BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${scope}`,
    `Price per door: ${perDoor}`,
    `Doors: ${result.doorCount.toLocaleString('en-US')}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.doorCount} door${result.doorCount === 1 ? '' : 's'}; ${door}; ${scope}; ${size}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; hang: ${result.hoursHang.toFixed(1)} h; extras: ${(result.hoursFrame + result.hoursCasing + result.hoursType + result.hoursSize + result.hoursPaint + result.hoursHaul + result.hoursHardware).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm door count, leaf, opening, casing, extras, and all pricing before sending. It is not a building-code determination, a fire-rating specification, an entry-door, a patio slider, a garage door, or a product warranty.',
  ].join('\n');
}
