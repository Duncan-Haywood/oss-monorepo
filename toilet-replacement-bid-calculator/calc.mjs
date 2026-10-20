// Pure bid arithmetic for residential toilet replacement.
// No network, no state: every toilet, rough-in, flange, wage,
// and fixture invoice is an input, so the result stays a transparent
// calculation the plumber can check against their own tickets rather
// than a claim about what any bathroom "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$249 installed" Facebook special treats a two-piece 12-inch swap
// on a good flange as the same job as a one-piece comfort-height on a
// 10-inch rough-in with a rotten closet flange, a new shutoff, a bidet
// seat, and a haul-away. Homeowners (and a lot of estimator sheets)
// count the same kind of number. Flange repair, offset rough-in, a
// heavier bowl, and a bidet seat do not live in that dump. Matching
// the cheap swap special on a flange-repair job is how a sold toilet
// becomes a loss when the closet bolts and the extra trip eat the
// margin.
//
// Distinct from *walk-in shower* (tile, slope, glass), *water-heater*
// (a tank), *hydro-jet / sewer camera* (cleaning a line), *sewer-line
// replace* (the lateral), *septic pumping* (a tank lid), *well-pump*
// (a well), *water-softener* (salt), and *sump-pump* (a pit). This
// prices a toilet replacement: the bowl, the rough-in, the flange,
// and the extras.

export const SCOPE_PRESETS = Object.freeze([
  { id: 'swap-only', label: 'Swap only — wax, set, hook the existing supply (the cheap special)' },
  { id: 'new-supply', label: 'New supply — swap plus a new shutoff and supply line' },
  { id: 'flange-repair', label: 'Flange repair — swap plus a repair flange or extender' },
  { id: 'full-reset', label: 'Full reset — new flange, new supply, set, and haul' },
]);

export const TOILET_PRESETS = Object.freeze([
  { id: 'two-piece-standard', label: 'Two-piece standard — the cheap special' },
  { id: 'comfort-height', label: 'Comfort-height / chair-height — taller bowl' },
  { id: 'one-piece', label: 'One-piece — heavier, more careful set' },
  { id: 'bidet-combo', label: 'Bidet combo — toilet plus a bidet seat' },
]);

export const ROUGH_IN_PRESETS = Object.freeze([
  { id: '12-inch', label: '12-inch rough-in — the common closet' },
  { id: '10-inch', label: '10-inch rough-in — offset flange or a 10-inch bowl' },
  { id: '14-inch', label: '14-inch rough-in — 14-inch bowl or offset' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Cheap special: 1 two-piece, 12-inch, swap-only',
    toiletCount: 1,
    scope: 'swap-only',
    toilet: 'two-piece-standard',
    roughIn: '12-inch',
    travelMiles: 6,
    includeHaul: false,
    includeWaxFree: false,
    includeBidetSeat: false,
  },
  {
    label: 'Typical bath: 1 comfort-height, 12-inch, new supply, haul-away',
    toiletCount: 1,
    scope: 'new-supply',
    toilet: 'comfort-height',
    roughIn: '12-inch',
    travelMiles: 12,
    includeHaul: true,
    includeWaxFree: false,
    includeBidetSeat: false,
  },
  {
    label: 'Losing job: 1 one-piece, 10-inch, flange repair, haul, bidet seat',
    toiletCount: 1,
    scope: 'flange-repair',
    toilet: 'one-piece',
    roughIn: '10-inch',
    travelMiles: 18,
    includeHaul: true,
    includeWaxFree: true,
    includeBidetSeat: true,
  },
  {
    label: 'Two-bath reset: 2 bidet-combo, 14-inch, full reset, haul, wax-free',
    toiletCount: 2,
    scope: 'full-reset',
    toilet: 'bidet-combo',
    roughIn: '14-inch',
    travelMiles: 22,
    includeHaul: true,
    includeWaxFree: true,
    includeBidetSeat: false,
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
 * Starting swap, flange, and supply hours from how much of the
 * closet is actually sold. Swap-only on a good 12-inch flange is
 * the cheap special. New-supply is a shutoff. Flange-repair is a
 * rotten closet. Full-reset is both.
 */
export function suggestedScopeKit(scope) {
  const id = String(scope);
  if (id === 'swap-only') {
    return {
      hoursSwapPerToilet: 1.1,
      hoursFlangePerToilet: 0,
      hoursSupplyPerToilet: 0.15,
      flangeKitEach: 0,
      supplyKitEach: 8,
    };
  }
  if (id === 'new-supply') {
    return {
      hoursSwapPerToilet: 1.1,
      hoursFlangePerToilet: 0,
      hoursSupplyPerToilet: 0.55,
      flangeKitEach: 0,
      supplyKitEach: 42,
    };
  }
  if (id === 'flange-repair') {
    return {
      hoursSwapPerToilet: 1.2,
      hoursFlangePerToilet: 0.9,
      hoursSupplyPerToilet: 0.2,
      flangeKitEach: 48,
      supplyKitEach: 12,
    };
  }
  if (id === 'full-reset') {
    return {
      hoursSwapPerToilet: 1.3,
      hoursFlangePerToilet: 1.4,
      hoursSupplyPerToilet: 0.55,
      flangeKitEach: 72,
      supplyKitEach: 42,
    };
  }
  throw new Error('Unknown scope');
}

/**
 * Two-piece standard is the cheap-special assumption.
 * Comfort-height is a taller bowl. One-piece is weight.
 * Bidet-combo is a seat and a nearby GFCI.
 */
export function suggestedToiletKit(toilet) {
  const id = String(toilet);
  if (id === 'two-piece-standard') {
    return { hoursTypePerToilet: 0, toiletInvoice: 165 };
  }
  if (id === 'comfort-height') {
    return { hoursTypePerToilet: 0.15, toiletInvoice: 240 };
  }
  if (id === 'one-piece') {
    return { hoursTypePerToilet: 0.45, toiletInvoice: 420 };
  }
  if (id === 'bidet-combo') {
    return { hoursTypePerToilet: 0.85, toiletInvoice: 680 };
  }
  throw new Error('Unknown toilet');
}

/**
 * 12-inch is the closet the cheap special assumes. 10-inch and
 * 14-inch need an offset flange or a different bowl.
 */
export function suggestedRoughInKit(roughIn) {
  const id = String(roughIn);
  if (id === '12-inch') {
    return { hoursRoughInPerToilet: 0, offsetFlangeEach: 0 };
  }
  if (id === '10-inch') {
    return { hoursRoughInPerToilet: 0.65, offsetFlangeEach: 55 };
  }
  if (id === '14-inch') {
    return { hoursRoughInPerToilet: 0.55, offsetFlangeEach: 55 };
  }
  throw new Error('Unknown rough-in');
}

/**
 * Starting extras that do not live in a $249 installed special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 0.9,
    hoursPerMile: 0.035,
    hoursHaulPerToilet: 0.25,
    hoursBidetPerToilet: 0.55,
    hoursWaxFreePerToilet: 0.1,
    siteHours: 0.4,
    waxEach: 8,
    waxFreeEach: 22,
    haulEach: 35,
    bidetSeatEach: 280,
    travelPerMile: 2.8,
  };
}

/**
 * Price a toilet replacement from the count, the bowl, the
 * rough-in, the flange, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const scope = requirePreset(SCOPE_PRESETS, input.scope, 'scope').id;
  const toilet = requirePreset(TOILET_PRESETS, input.toilet, 'toilet').id;
  const roughIn = requirePreset(ROUGH_IN_PRESETS, input.roughIn, 'rough-in').id;

  const toiletCount = number(input.toiletCount ?? 0, 'Toilet count');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const includeHaul = flag(input.includeHaul);
  const includeWaxFree = flag(input.includeWaxFree);
  const includeBidetSeat = flag(input.includeBidetSeat);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursSwapPerToilet = number(input.hoursSwapPerToilet ?? 0, 'Swap hours per toilet');
  const hoursFlangePerToilet = number(input.hoursFlangePerToilet ?? 0, 'Flange hours per toilet');
  const hoursSupplyPerToilet = number(input.hoursSupplyPerToilet ?? 0, 'Supply hours per toilet');
  const hoursTypePerToilet = number(input.hoursTypePerToilet ?? 0, 'Type hours per toilet');
  const hoursRoughInPerToilet = number(input.hoursRoughInPerToilet ?? 0, 'Rough-in hours per toilet');
  const hoursHaulPerToilet = number(input.hoursHaulPerToilet ?? 0, 'Haul hours per toilet');
  const hoursBidetPerToilet = number(input.hoursBidetPerToilet ?? 0, 'Bidet hours per toilet');
  const hoursWaxFreePerToilet = number(input.hoursWaxFreePerToilet ?? 0, 'Wax-free hours per toilet');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const toiletInvoice = number(input.toiletInvoice ?? 0, 'Toilet invoice');
  const waxEach = number(input.waxEach ?? 0, 'Wax each');
  const waxFreeEach = number(input.waxFreeEach ?? 0, 'Wax-free each');
  const flangeKitEach = number(input.flangeKitEach ?? 0, 'Flange kit each');
  const supplyKitEach = number(input.supplyKitEach ?? 0, 'Supply kit each');
  const offsetFlangeEach = number(input.offsetFlangeEach ?? 0, 'Offset flange each');
  const haulEach = number(input.haulEach ?? 0, 'Haul each');
  const bidetSeatEach = number(input.bidetSeatEach ?? 0, 'Bidet seat each');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');

  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursSwap = toiletCount * hoursSwapPerToilet;
  const hoursFlange = toiletCount * hoursFlangePerToilet;
  const hoursSupply = toiletCount * hoursSupplyPerToilet;
  const hoursType = toiletCount * hoursTypePerToilet;
  const hoursRoughIn = toiletCount * hoursRoughInPerToilet;
  const hoursHaulApplied = includeHaul ? toiletCount * hoursHaulPerToilet : 0;
  const hoursBidetApplied = includeBidetSeat ? toiletCount * hoursBidetPerToilet : 0;
  const hoursWaxFreeApplied = includeWaxFree ? toiletCount * hoursWaxFreePerToilet : 0;
  const extraWorkHours = hoursFlange + hoursSupply + hoursType + hoursRoughIn
    + hoursHaulApplied + hoursBidetApplied + hoursWaxFreeApplied;
  const totalHours = hoursTravel + hoursSwap + extraWorkHours + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const fixtureMaterial = toiletCount * toiletInvoice;
  const waxMaterial = includeWaxFree ? 0 : toiletCount * waxEach;
  const waxFreeMaterial = includeWaxFree ? toiletCount * waxFreeEach : 0;
  const flangeMaterial = toiletCount * flangeKitEach;
  const supplyMaterial = toiletCount * supplyKitEach;
  const offsetMaterial = toiletCount * offsetFlangeEach;
  const haulMaterial = includeHaul ? toiletCount * haulEach : 0;
  const bidetMaterial = includeBidetSeat ? toiletCount * bidetSeatEach : 0;
  const travelInvoice = travelMiles * travelPerMile;
  const finishMaterial = fixtureMaterial + waxMaterial + waxFreeMaterial;
  const extraHardware = flangeMaterial + supplyMaterial + offsetMaterial
    + haulMaterial + bidetMaterial + travelInvoice;
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
    toilet,
    roughIn,
    toiletCount,
    travelMiles,
    includeHaul,
    includeWaxFree,
    includeBidetSeat,
    loadedWage,
    hoursTravel,
    hoursSwap,
    hoursFlange,
    hoursSupply,
    hoursType,
    hoursRoughIn,
    hoursHaul: hoursHaulApplied,
    hoursBidet: hoursBidetApplied,
    hoursWaxFree: hoursWaxFreeApplied,
    siteHours,
    totalHours,
    laborCost,
    fixtureMaterial,
    waxMaterial,
    waxFreeMaterial,
    flangeMaterial,
    supplyMaterial,
    offsetMaterial,
    haulMaterial,
    bidetMaterial,
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
    pricePerToilet: toiletCount === 0 ? null : price / toiletCount,
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
      swap: hourShare(hoursSwap),
      flange: hourShare(hoursFlange),
      supply: hourShare(hoursSupply),
      type: hourShare(hoursType),
      roughIn: hourShare(hoursRoughIn),
      haul: hourShare(hoursHaulApplied),
      bidet: hourShare(hoursBidetApplied),
      waxFree: hourShare(hoursWaxFreeApplied),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perToilet: toiletCount === 0 ? null : proposedPrice / toiletCount,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same closet four ways — swap-only, new-supply,
 * flange-repair, full-reset — from the suggested scope kits so
 * the plumber can see when a rotten flange flips the cheap $249
 * special. User-typed scope rates are not reused here: the
 * comparison is apples-to-apples on the starting figures.
 * Toilet and rough-in kits stay with the current job.
 */
export function compareScope(input) {
  const toiletKit = suggestedToiletKit(String(input.toilet ?? 'two-piece-standard'));
  const roughInKit = suggestedRoughInKit(String(input.roughIn ?? '12-inch'));
  const extraKit = suggestedExtraKit();
  const rows = SCOPE_PRESETS.map((preset) => {
    const kit = suggestedScopeKit(preset.id);
    const bid = calculateBid({
      ...input,
      scope: preset.id,
      ...toiletKit,
      ...roughInKit,
      ...extraKit,
      ...kit,
    });
    return {
      scope: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerToilet: bid.pricePerToilet,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursSwap: bid.hoursSwap,
      hoursFlange: bid.hoursFlange,
      hoursSupply: bid.hoursSupply,
      flangeMaterial: bid.flangeMaterial,
      supplyMaterial: bid.supplyMaterial,
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
 * Price the same closet four ways — two-piece, comfort-height,
 * one-piece, bidet-combo — from the suggested toilet kits so the
 * plumber can see the upgrade a homeowner is actually asking for.
 * User-typed toilet rates are not reused here: the comparison is
 * apples-to-apples on the starting figures. Scope and rough-in
 * kits stay with the current job.
 */
export function compareToilet(input) {
  const scopeKit = suggestedScopeKit(String(input.scope ?? 'swap-only'));
  const roughInKit = suggestedRoughInKit(String(input.roughIn ?? '12-inch'));
  const extraKit = suggestedExtraKit();
  const rows = TOILET_PRESETS.map((preset) => {
    const kit = suggestedToiletKit(preset.id);
    const bid = calculateBid({
      ...input,
      toilet: preset.id,
      ...scopeKit,
      ...roughInKit,
      ...extraKit,
      ...kit,
    });
    return {
      toilet: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerToilet: bid.pricePerToilet,
      hoursType: bid.hoursType,
      fixtureMaterial: bid.fixtureMaterial,
      extraCost: bid.extraCost,
      breakEvenPrice: bid.breakEvenPrice,
    };
  });
  const cheapest = Math.min(...rows.map((row) => row.price));
  const twoPiece = rows.find((row) => row.toilet === 'two-piece-standard');
  return rows
    .map((row) => ({
      ...row,
      cheapest: row.price === cheapest,
      delta: row.price - cheapest,
      upgradeFromTwoPiece: twoPiece ? row.price - twoPiece.price : 0,
    }))
    .sort((a, b) => a.price - b.price);
}

export const SUPPLY_PRESETS = Object.freeze([
  {
    id: 'plumber-supplied',
    label: 'You supply the bowl',
    detail: 'Fixture invoice stays in the bid',
  },
  {
    id: 'owner-fits',
    label: 'Owner supplies — it fits',
    detail: 'No fixture invoice, same set hours',
  },
  {
    id: 'owner-wrong',
    label: 'Owner supplies — wrong rough-in',
    detail: 'Second trip plus an offset flange',
  },
]);

/**
 * Starting callback hours and offset hardware when the
 * owner's store-bought bowl does not match the closet.
 * Taken from the extra-kit trip and the 10-inch rough-in
 * kit so a typed 9-hour swap does not inflate the callback.
 */
export function suggestedOwnerCallbackKit() {
  const extra = suggestedExtraKit();
  const offset = suggestedRoughInKit('10-inch');
  return {
    hoursCallbackTrip: extra.hoursTrip,
    hoursWrongRoughInPerToilet: offset.hoursRoughInPerToilet,
    offsetFlangeEach: offset.offsetFlangeEach,
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
 * Price the same closet three ways: you supply the bowl, the
 * owner supplies one that fits, or the owner supplies one that
 * does not fit and costs a second trip.
 *
 * Owner rows zero the fixture invoice and keep the current set
 * hours — pulling a Home Depot box is still a set. The
 * wrong-rough-in row adds a starting callback trip and a 10-inch
 * offset kit on top of the current rates so a typed invoice does
 * not leak into the "they bought it" case.
 *
 * An install-only price (options.installOnlyPrice, else the
 * proposed price on the bid) is scored against each cost base.
 * That is the $249 "just set what I bought" number plumbers
 * actually get shopped on.
 */
export function compareOwnerSupply(input, options = {}) {
  const callback = suggestedOwnerCallbackKit();
  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursRoughInPerToilet = number(input.hoursRoughInPerToilet ?? 0, 'Rough-in hours per toilet');
  const offsetFlangeEach = number(input.offsetFlangeEach ?? 0, 'Offset flange each');

  let installPrice = null;
  const rawInstall = options.installOnlyPrice !== undefined
    ? options.installOnlyPrice
    : input.proposedPrice;
  if (rawInstall !== null && rawInstall !== undefined && rawInstall !== '') {
    installPrice = number(rawInstall, 'Install-only price');
  }

  const plumber = calculateBid(input);
  const ownerFits = calculateBid({ ...input, toiletInvoice: 0 });
  const ownerWrong = calculateBid({
    ...input,
    toiletInvoice: 0,
    hoursTrip: hoursTrip + callback.hoursCallbackTrip,
    hoursRoughInPerToilet: hoursRoughInPerToilet + callback.hoursWrongRoughInPerToilet,
    offsetFlangeEach: offsetFlangeEach + callback.offsetFlangeEach,
  });

  const rows = [
    {
      supply: 'plumber-supplied',
      label: SUPPLY_PRESETS[0].label,
      detail: SUPPLY_PRESETS[0].detail,
      bid: plumber,
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
    offsetMaterial: row.bid.offsetMaterial,
    hoursTravel: row.bid.hoursTravel,
    hoursRoughIn: row.bid.hoursRoughIn,
    breakEvenPrice: row.bid.breakEvenPrice,
    installOnly: scoreInstallOnly(row.bid, installPrice),
    savedVsPlumber: plumber.price - row.bid.price,
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
 * names the bid drop from zeroing the bowl.
 */
export function ownerSupplyNote(rows) {
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new Error('Owner-supply comparison is missing rows');
  }
  const plumber = rows.find((row) => row.supply === 'plumber-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  if (!plumber || !fits || !wrong) {
    throw new Error('Owner-supply comparison is missing a supply row');
  }

  const drop = plumber.price - fits.price;
  const callbackLift = wrong.price - fits.price;
  if (plumber.installOnly && fits.installOnly) {
    const asked = plumber.installOnly.price;
    if (plumber.installOnly.belowBreakEven && fits.installOnly.belowBreakEven) {
      return `At ${money(asked)} install-only you lose money even when they bought the bowl. Walk-away on the owner-supplied set is ${money(fits.breakEvenPrice)}.`;
    }
    if (plumber.installOnly.belowBreakEven && !fits.installOnly.belowBreakEven) {
      return `At ${money(asked)} the plumber-supplied job loses ${money(Math.abs(plumber.installOnly.profit))}. The same install-only number covers the set if their bowl actually fits.`;
    }
    if (wrong.installOnly?.belowBreakEven) {
      return `At ${money(asked)} the set covers if their bowl fits. A wrong-rough-in callback still loses ${money(Math.abs(wrong.installOnly.profit))} — walk-away then is ${money(wrong.breakEvenPrice)}.`;
    }
    return `At ${money(asked)} both supply paths hold a margin. A wrong-rough-in callback still adds ${money(callbackLift)} to the bid.`;
  }
  return `Zeroing the bowl invoice drops the bid ${money(drop)}. A wrong-rough-in callback puts ${money(callbackLift)} back on.`;
}

export const ACCESS_PRESETS = Object.freeze([
  {
    id: 'weekday-scheduled',
    label: 'Weekday, scheduled',
    detail: 'They can wait; you book the day',
  },
  {
    id: 'same-day-occupied',
    label: 'Same-day, only toilet',
    detail: 'Same wage, slower set and punch-list',
  },
  {
    id: 'after-hours',
    label: 'After-hours / Saturday emergency',
    detail: 'Overtime wage plus a second dispatch',
  },
]);

/**
 * Starting pace and overtime when they will not wait for a
 * weekday slot, or want Saturday / after 5pm because the only
 * toilet is overflowing. Occupied pace is a multiplier on the
 * typed swap and punch-list hours — working around a family
 * that still needs the bath is slower, not a different wage.
 * After-hours is time-and-a-half on the typed wage plus a
 * second emergency dispatch from the extra-kit trip, so a
 * typed 9-hour swap does not inflate the extra trip.
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
 * Price the same closet three ways: weekday scheduled,
 * same-day while they stay home, or after-hours / Saturday.
 *
 * Occupied keeps the typed wage and adds clock hours on the
 * set and punch-list. After-hours keeps the typed hours and
 * raises the wage, then adds a starting second dispatch
 * because an overflowing toilet is not a stop you combine
 * with a weekday route. Bowl, scope, fixture invoice, and
 * extras stay.
 *
 * An install-only price (options.installOnlyPrice, else the
 * proposed price on the bid) is scored against each cost
 * base. That is the "$249 Saturday" number plumbers actually
 * get shopped on.
 */
export function compareAccess(input, options = {}) {
  const kit = suggestedAccessKit();
  const hoursSwapPerToilet = number(input.hoursSwapPerToilet ?? 0, 'Swap hours per toilet');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');
  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');

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
    hoursSwapPerToilet: hoursSwapPerToilet * kit.occupiedPaceMultiplier,
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
      access: 'same-day-occupied',
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
    hoursSwap: row.bid.hoursSwap,
    siteHours: row.bid.siteHours,
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
 * otherwise names the bid lift from a weekday slot.
 */
export function accessNote(rows) {
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new Error('Access comparison is missing rows');
  }
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const occupied = rows.find((row) => row.access === 'same-day-occupied');
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
  return `Same-day while they stay home adds ${money(occupiedLift)} to the bid. After-hours / Saturday adds ${money(afterHoursLift)}.`;
}

function money(value) {
  const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Format a bid as a plain-text draft the plumber can paste into
 * a proposal. Costs, wages, and invoices are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Toilet replacement') {
  const perToilet = result.pricePerToilet === null
    ? 'n/a'
    : `${money(result.pricePerToilet)} / toilet`;
  const scope = SCOPE_PRESETS.find((item) => item.id === result.scope)?.label ?? result.scope;
  const toilet = TOILET_PRESETS.find((item) => item.id === result.toilet)?.label ?? result.toilet;
  const roughIn = ROUGH_IN_PRESETS.find((item) => item.id === result.roughIn)?.label ?? result.roughIn;
  const extras = [
    `${result.travelMiles} travel miles`,
    toilet,
    roughIn,
    `${result.toiletCount} toilet${result.toiletCount === 1 ? '' : 's'}`,
    result.includeHaul ? 'haul-away included' : 'no haul-away',
    result.includeWaxFree ? 'wax-free seal included' : 'standard wax ring',
    result.includeBidetSeat ? 'bidet seat included' : 'no bidet seat',
  ].join('; ');
  return [
    'TOILET REPLACEMENT BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${scope}`,
    `Price per toilet: ${perToilet}`,
    `Toilets: ${result.toiletCount.toLocaleString('en-US')}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.toiletCount} toilet${result.toiletCount === 1 ? '' : 's'}; ${toilet}; ${scope}; ${roughIn}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; swap: ${result.hoursSwap.toFixed(1)} h; extras: ${(result.hoursFlange + result.hoursSupply + result.hoursType + result.hoursRoughIn + result.hoursHaul + result.hoursBidet + result.hoursWaxFree).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm toilet count, bowl, rough-in, flange, extras, and all pricing before sending. It is not a plumbing-code determination, a fixture specification, a water-heater, a sewer-line, a walk-in shower, or a product warranty.',
  ].join('\n');
}
