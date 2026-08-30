// Pure bid arithmetic for residential kitchen tile backsplash.
// No network, no state: every square foot, pattern, outlet, wage,
// and tile invoice is an input, so the result stays a transparent
// calculation the setter can check against their own tickets rather
// than a claim about what any kitchen "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$35 a square foot installed" special treats 30 SF of subway
// running-bond on painted drywall as the same job as 48 SF of
// herringbone mosaic with eight outlets, a cooktop cutout, Schluter
// edge, and demo of existing 4x4. Homeowners (and a lot of estimator
// sheets) count the same kind of number. Pattern waste, outlet cuts,
// cooktop, edge trim, and demo do not scale with that square-foot
// dump. Matching a cheap subway special on a herringbone demo job is
// how a sold splash becomes a loss when the cuts and the pull eat
// the margin.
//
// Distinct from *walk-in shower* (wet area, slope, glass), *flooring*
// (floor waste and tear-out), *countertop* (slabs and sink cutouts),
// *interior painting* (a coat), *cabinet refinishing* (doors), and
// *drywall* (hang and finish gypsum). This prices a kitchen tile
// backsplash: wall SF, pattern, scope, and the extras.

export const SCOPE_PRESETS = Object.freeze([
  { id: 'tile-only', label: 'Tile only — wall is ready (the cheap special)' },
  { id: 'new-prep', label: 'New prep — cement board or membrane, then tile' },
  { id: 'demo-and-replace', label: 'Demo and replace — pull the old splash first' },
]);

export const PATTERN_PRESETS = Object.freeze([
  { id: 'subway-running', label: 'Subway running-bond — the cheap special' },
  { id: 'herringbone', label: 'Herringbone — more cuts, more waste' },
  { id: 'mosaic', label: 'Mosaic sheets — grout-heavy' },
  { id: 'large-format', label: 'Large-format — fewer joints, more leveling' },
]);

export const WALL_PRESETS = Object.freeze([
  { id: 'painted-drywall', label: 'Painted drywall — prime and tile' },
  { id: 'cement-board', label: 'Cement board already up' },
  { id: 'existing-tile', label: 'Existing tile — pull is in the scope' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Cheap special: 30 SF subway on painted drywall, 2 outlets',
    wallSf: 30,
    edgeLf: 12,
    outlets: 2,
    scope: 'tile-only',
    pattern: 'subway-running',
    wall: 'painted-drywall',
    travelMiles: 8,
    includeCooktop: false,
    includeSchluter: false,
    includeAccent: false,
  },
  {
    label: 'Typical kitchen: 36 SF subway, new prep, 4 outlets, cooktop',
    wallSf: 36,
    edgeLf: 16,
    outlets: 4,
    scope: 'new-prep',
    pattern: 'subway-running',
    wall: 'cement-board',
    travelMiles: 12,
    includeCooktop: true,
    includeSchluter: true,
    includeAccent: false,
  },
  {
    label: 'Herringbone demo: 42 SF, existing 4x4, 6 outlets, cooktop, Schluter',
    wallSf: 42,
    edgeLf: 18,
    outlets: 6,
    scope: 'demo-and-replace',
    pattern: 'herringbone',
    wall: 'existing-tile',
    travelMiles: 16,
    includeCooktop: true,
    includeSchluter: true,
    includeAccent: false,
  },
  {
    label: 'Mosaic full wall: 48 SF, demo, 8 outlets, cooktop, Schluter, accent',
    wallSf: 48,
    edgeLf: 22,
    outlets: 8,
    scope: 'demo-and-replace',
    pattern: 'mosaic',
    wall: 'existing-tile',
    travelMiles: 22,
    includeCooktop: true,
    includeSchluter: true,
    includeAccent: true,
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
 * Starting prep, demo, and board hours from how much of the wall
 * is actually sold. Tile-only on a ready wall is the cheap special.
 * New prep is cement board or membrane. Demo-and-replace is a pull
 * plus the same prep.
 */
export function suggestedScopeKit(scope) {
  const id = String(scope);
  if (id === 'tile-only') {
    return {
      prepHoursPerSf: 0,
      demoHoursPerSf: 0,
      boardPerSf: 0,
    };
  }
  if (id === 'new-prep') {
    return {
      prepHoursPerSf: 0.12,
      demoHoursPerSf: 0,
      boardPerSf: 2.8,
    };
  }
  if (id === 'demo-and-replace') {
    return {
      prepHoursPerSf: 0.1,
      demoHoursPerSf: 0.16,
      boardPerSf: 2.8,
    };
  }
  throw new Error('Unknown scope');
}

/**
 * Subway running-bond is the cheap-special assumption.
 * Herringbone is cuts and waste. Mosaic is grout. Large-format
 * is leveling and fewer joints.
 */
export function suggestedPatternKit(pattern) {
  const id = String(pattern);
  if (id === 'subway-running') {
    return { hoursTilePerSf: 0.18, wasteRate: 0.1, tilePerSf: 4.5 };
  }
  if (id === 'herringbone') {
    return { hoursTilePerSf: 0.38, wasteRate: 0.18, tilePerSf: 6.8 };
  }
  if (id === 'mosaic') {
    return { hoursTilePerSf: 0.42, wasteRate: 0.12, tilePerSf: 9.5 };
  }
  if (id === 'large-format') {
    return { hoursTilePerSf: 0.28, wasteRate: 0.15, tilePerSf: 8.2 };
  }
  throw new Error('Unknown pattern');
}

/**
 * Painted drywall is a prime. Cement board already up is a skim.
 * Existing tile is a wall that still needs the pull in the scope.
 */
export function suggestedWallKit(wall) {
  const id = String(wall);
  if (id === 'painted-drywall') {
    return { hoursWallPerSf: 0.04, wallInvoicePerSf: 0.4 };
  }
  if (id === 'cement-board') {
    return { hoursWallPerSf: 0.06, wallInvoicePerSf: 0.8 };
  }
  if (id === 'existing-tile') {
    return { hoursWallPerSf: 0.02, wallInvoicePerSf: 0 };
  }
  throw new Error('Unknown wall');
}

/**
 * Starting extras that do not live in a $35 / SF special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 1.2,
    hoursPerMile: 0.035,
    hoursPerOutlet: 0.35,
    hoursCooktop: 1.1,
    hoursSchluterPerLf: 0.12,
    hoursAccentPerSf: 0.08,
    siteHours: 0.8,
    groutPerSf: 1.4,
    outletEach: 18,
    cooktopInvoice: 85,
    schluterPerLf: 6.5,
    accentPerSf: 4.2,
    travelPerMile: 2.8,
  };
}

/**
 * Price a kitchen tile backsplash from the wall, the pattern,
 * the scope, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const scope = requirePreset(SCOPE_PRESETS, input.scope, 'scope').id;
  const pattern = requirePreset(PATTERN_PRESETS, input.pattern, 'pattern').id;
  const wall = requirePreset(WALL_PRESETS, input.wall, 'wall').id;

  const wallSf = number(input.wallSf ?? 0, 'Wall square feet');
  const edgeLf = number(input.edgeLf ?? 0, 'Edge lineal feet');
  const outlets = number(input.outlets ?? 0, 'Outlets');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const includeCooktop = flag(input.includeCooktop);
  const includeSchluter = flag(input.includeSchluter);
  const includeAccent = flag(input.includeAccent);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursTilePerSf = number(input.hoursTilePerSf ?? 0, 'Tile hours per SF');
  const prepHoursPerSf = number(input.prepHoursPerSf ?? 0, 'Prep hours per SF');
  const demoHoursPerSf = number(input.demoHoursPerSf ?? 0, 'Demo hours per SF');
  const hoursWallPerSf = number(input.hoursWallPerSf ?? 0, 'Wall hours per SF');
  const hoursPerOutlet = number(input.hoursPerOutlet ?? 0, 'Hours per outlet');
  const hoursCooktop = number(input.hoursCooktop ?? 0, 'Cooktop hours');
  const hoursSchluterPerLf = number(input.hoursSchluterPerLf ?? 0, 'Schluter hours per LF');
  const hoursAccentPerSf = number(input.hoursAccentPerSf ?? 0, 'Accent hours per SF');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const wasteRate = number(input.wasteRate ?? 0, 'Waste rate');
  const tilePerSf = number(input.tilePerSf ?? 0, 'Tile per SF');
  const groutPerSf = number(input.groutPerSf ?? 0, 'Grout per SF');
  const boardPerSf = number(input.boardPerSf ?? 0, 'Board per SF');
  const wallInvoicePerSf = number(input.wallInvoicePerSf ?? 0, 'Wall invoice per SF');
  const outletEach = number(input.outletEach ?? 0, 'Outlet each');
  const cooktopInvoice = number(input.cooktopInvoice ?? 0, 'Cooktop invoice');
  const schluterPerLf = number(input.schluterPerLf ?? 0, 'Schluter per LF');
  const accentPerSf = number(input.accentPerSf ?? 0, 'Accent per SF');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');

  const buySf = wallSf * (1 + wasteRate);
  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursTile = wallSf * hoursTilePerSf;
  const hoursPrep = wallSf * prepHoursPerSf;
  const hoursDemo = wallSf * demoHoursPerSf;
  const hoursWall = wallSf * hoursWallPerSf;
  const hoursOutlets = outlets * hoursPerOutlet;
  const hoursCooktopApplied = includeCooktop ? hoursCooktop : 0;
  const hoursSchluterApplied = includeSchluter ? edgeLf * hoursSchluterPerLf : 0;
  const hoursAccentApplied = includeAccent ? wallSf * hoursAccentPerSf : 0;
  const extraWorkHours = hoursPrep + hoursDemo + hoursWall + hoursOutlets
    + hoursCooktopApplied + hoursSchluterApplied + hoursAccentApplied;
  const totalHours = hoursTravel + hoursTile + extraWorkHours + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const tileMaterial = buySf * tilePerSf;
  const groutMaterial = wallSf * groutPerSf;
  const boardMaterial = wallSf * boardPerSf;
  const wallMaterial = wallSf * wallInvoicePerSf;
  const outletMaterial = outlets * outletEach;
  const cooktopMaterial = includeCooktop ? cooktopInvoice : 0;
  const schluterMaterial = includeSchluter ? edgeLf * schluterPerLf : 0;
  const accentMaterial = includeAccent ? wallSf * accentPerSf : 0;
  const travelInvoice = travelMiles * travelPerMile;
  const finishMaterial = tileMaterial + groutMaterial + boardMaterial;
  const extraHardware = wallMaterial + outletMaterial + cooktopMaterial
    + schluterMaterial + accentMaterial + travelInvoice;
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
  const extraCost = extraHardware
    + hoursPrep * loadedWage
    + hoursDemo * loadedWage
    + hoursWall * loadedWage
    + hoursOutlets * loadedWage
    + hoursCooktopApplied * loadedWage
    + hoursSchluterApplied * loadedWage
    + hoursAccentApplied * loadedWage
    + hoursTravel * loadedWage;

  return {
    scope,
    pattern,
    wall,
    wallSf,
    buySf,
    edgeLf,
    outlets,
    travelMiles,
    includeCooktop,
    includeSchluter,
    includeAccent,
    loadedWage,
    hoursTravel,
    hoursTile,
    hoursPrep,
    hoursDemo,
    hoursWall,
    hoursOutlets,
    hoursCooktop: hoursCooktopApplied,
    hoursSchluter: hoursSchluterApplied,
    hoursAccent: hoursAccentApplied,
    siteHours,
    totalHours,
    laborCost,
    tileMaterial,
    groutMaterial,
    boardMaterial,
    wallMaterial,
    outletMaterial,
    cooktopMaterial,
    schluterMaterial,
    accentMaterial,
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
    pricePerSf: wallSf === 0 ? null : price / wallSf,
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
      tile: hourShare(hoursTile),
      prep: hourShare(hoursPrep),
      demo: hourShare(hoursDemo),
      wall: hourShare(hoursWall),
      outlets: hourShare(hoursOutlets),
      cooktop: hourShare(hoursCooktopApplied),
      schluter: hourShare(hoursSchluterApplied),
      accent: hourShare(hoursAccentApplied),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perSf: wallSf === 0 ? null : proposedPrice / wallSf,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same wall three ways — tile-only, new-prep,
 * demo-and-replace — from the suggested scope kits so the
 * setter can see when prep and demo flip the cheap $35 / SF
 * special. User-typed scope rates are not reused here: the
 * comparison is apples-to-apples on the starting figures.
 * Pattern and wall kits stay with the current job.
 */
export function compareScope(input) {
  const patternKit = suggestedPatternKit(String(input.pattern ?? 'subway-running'));
  const wallKit = suggestedWallKit(String(input.wall ?? 'painted-drywall'));
  const extraKit = suggestedExtraKit();
  const rows = SCOPE_PRESETS.map((preset) => {
    const kit = suggestedScopeKit(preset.id);
    const bid = calculateBid({
      ...input,
      scope: preset.id,
      ...patternKit,
      ...wallKit,
      ...extraKit,
      ...kit,
    });
    return {
      scope: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerSf: bid.pricePerSf,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursTile: bid.hoursTile,
      hoursPrep: bid.hoursPrep,
      hoursDemo: bid.hoursDemo,
      boardMaterial: bid.boardMaterial,
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
 * Price the same wall four ways — subway running-bond, herringbone,
 * mosaic, large-format — from the suggested pattern kits so the
 * setter can see the upgrade a homeowner is actually asking for.
 * User-typed pattern rates are not reused here: the comparison is
 * apples-to-apples on the starting figures. Scope and wall kits
 * stay with the current job.
 */
export function comparePattern(input) {
  const scopeKit = suggestedScopeKit(String(input.scope ?? 'tile-only'));
  const wallKit = suggestedWallKit(String(input.wall ?? 'painted-drywall'));
  const extraKit = suggestedExtraKit();
  const rows = PATTERN_PRESETS.map((preset) => {
    const kit = suggestedPatternKit(preset.id);
    const bid = calculateBid({
      ...input,
      pattern: preset.id,
      ...scopeKit,
      ...wallKit,
      ...extraKit,
      ...kit,
    });
    return {
      pattern: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerSf: bid.pricePerSf,
      buySf: bid.buySf,
      hoursTile: bid.hoursTile,
      tileMaterial: bid.tileMaterial,
      wasteRate: kit.wasteRate,
      extraCost: bid.extraCost,
      breakEvenPrice: bid.breakEvenPrice,
    };
  });
  const cheapest = Math.min(...rows.map((row) => row.price));
  const subway = rows.find((row) => row.pattern === 'subway-running');
  return rows
    .map((row) => ({
      ...row,
      cheapest: row.price === cheapest,
      delta: row.price - cheapest,
      upgradeFromSubway: subway ? row.price - subway.price : 0,
    }))
    .sort((a, b) => a.price - b.price);
}

/**
 * Tile is sold by the box. A 33 SF kitchen buy at 10 SF / box is
 * four boxes (40 SF), not 3.3. Leftover boxes already on the van
 * credit against that buy. After the splash, leftover may or may
 * not cover a laundry / pantry return — matching the kitchen tile
 * invoice on that second wall is how leftover gets wasted or a
 * second supplier trip gets eaten. This does not change the
 * headline bid: leftover is already-paid stock unless the setter
 * decides to credit it.
 *
 * @param {object} input same shape as calculateBid, plus sfPerBox,
 *   leftoverBoxes, and secondWallSf
 */
export function leftoverBoxPlan(input) {
  const bid = calculateBid(input);
  const sfPerBox = number(input.sfPerBox ?? 0, 'Square feet per box', { allowZero: false });
  const leftoverBoxes = number(input.leftoverBoxes ?? 0, 'Leftover boxes');
  const secondWallSf = number(input.secondWallSf ?? 0, 'Second wall square feet');
  const wasteRate = number(input.wasteRate ?? 0, 'Waste rate');
  const tilePerSf = number(input.tilePerSf ?? 0, 'Tile per SF');

  const kitchenNeedSf = bid.buySf;
  const leftoverSf = leftoverBoxes * sfPerBox;
  const usedFromStock = Math.min(leftoverSf, kitchenNeedSf);
  const stillNeedSf = kitchenNeedSf - usedFromStock;
  const boxesToBuy = stillNeedSf <= 1e-9 ? 0 : Math.ceil((stillNeedSf / sfPerBox) - 1e-9);
  const purchasedSf = boxesToBuy * sfPerBox;
  const leftoverAfterKitchen = leftoverSf + purchasedSf - kitchenNeedSf;
  const leftoverAfterKitchenBoxes = leftoverAfterKitchen / sfPerBox;

  const secondNeedSf = secondWallSf * (1 + wasteRate);
  const secondShortfallSf = Math.max(0, secondNeedSf - leftoverAfterKitchen);
  const secondCoveredByLeftover = secondNeedSf <= leftoverAfterKitchen + 1e-9;
  const secondBoxesToBuy = secondShortfallSf <= 1e-9
    ? 0
    : Math.ceil((secondShortfallSf / sfPerBox) - 1e-9);

  const leftoverCredit = usedFromStock * tilePerSf;
  const boxRoundUpSf = purchasedSf - stillNeedSf;
  const boxRoundUpCost = boxRoundUpSf * tilePerSf;
  const naiveTileInvoice = kitchenNeedSf * tilePerSf;
  const tileInvoiceAfterBoxes = purchasedSf * tilePerSf;

  return {
    sfPerBox,
    leftoverBoxes,
    leftoverSf,
    kitchenNeedSf,
    usedFromStock,
    stillNeedSf,
    boxesToBuy,
    purchasedSf,
    leftoverAfterKitchen,
    leftoverAfterKitchenBoxes,
    secondWallSf,
    secondNeedSf,
    secondCoveredByLeftover,
    secondShortfallSf,
    secondBoxesToBuy,
    leftoverCredit,
    boxRoundUpSf,
    boxRoundUpCost,
    naiveTileInvoice,
    tileInvoiceAfterBoxes,
  };
}

function boxesWord(count) {
  return `${count} box${count === 1 ? '' : 'es'}`;
}

/**
 * One-line leftover verdict. Names the laundry-wall miss when a
 * second wall is on the ticket; otherwise names the kitchen
 * round-up the setter is about to eat.
 */
export function leftoverBoxNote(plan) {
  if (!plan || typeof plan !== 'object') {
    throw new Error('Leftover-box plan is missing');
  }
  const leftover = Number(plan.leftoverAfterKitchen);
  const secondNeed = Number(plan.secondNeedSf);
  const secondBoxes = Number(plan.secondBoxesToBuy);
  const buyBoxes = Number(plan.boxesToBuy);
  const roundUp = Number(plan.boxRoundUpSf);
  if (![leftover, secondNeed, secondBoxes, buyBoxes, roundUp].every(Number.isFinite)) {
    throw new Error('Leftover-box plan is missing coverage figures');
  }
  const secondWallSf = Number(plan.secondWallSf);
  if (secondWallSf > 0 && !plan.secondCoveredByLeftover) {
    return `After the kitchen you have ${leftover.toFixed(1)} SF left. The second wall still needs ${boxesWord(secondBoxes)} — leftover does not cover the laundry / pantry return.`;
  }
  if (secondWallSf > 0 && plan.secondCoveredByLeftover) {
    return `Leftover after the kitchen covers the second wall (${secondNeed.toFixed(1)} SF with waste). Do not buy another box for that return.`;
  }
  if (roundUp > 0) {
    return `You buy ${boxesWord(buyBoxes)} and eat ${roundUp.toFixed(1)} SF of round-up. Enter a laundry / pantry wall to see whether that leftover still covers it.`;
  }
  return 'The leftover on the van covers this kitchen buy. No new boxes.';
}

export const SUPPLY_PRESETS = Object.freeze([
  {
    id: 'you-supply',
    label: 'You supply the tile',
    detail: 'Tile invoice stays in the bid',
  },
  {
    id: 'owner-covers',
    label: 'Owner supplies — it covers',
    detail: 'No tile invoice, same set hours',
  },
  {
    id: 'owner-short',
    label: 'Owner supplies — short / wrong lot',
    detail: 'Second trip plus rush tile for the waste they skipped',
  },
]);

/**
 * Starting callback hours and rush-tile multiplier when the
 * owner's store-bought boxes do not cover the wall. They
 * usually buy the measured SF, not the waste, or the lot
 * does not match the leftover from another room. Taken from
 * the extra-kit trip so a typed 9-hour set does not inflate
 * the callback.
 */
export function suggestedOwnerCallbackKit() {
  const extra = suggestedExtraKit();
  return {
    hoursCallbackTrip: extra.hoursTrip,
    rushTileMultiplier: 1.5,
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
 * Price the same splash three ways: you supply the tile, the
 * owner supplies boxes that actually cover (including waste),
 * or the owner supplies a short / wrong-lot buy that costs a
 * second trip and rush tile.
 *
 * Owner rows zero the tile invoice and keep the current set
 * hours — pulling Home Depot boxes is still a set. Outlets,
 * cooktop, and Schluter stay. The short/wrong-lot row adds a
 * starting callback trip and buys the waste they skipped at
 * a rush multiplier so a typed tile invoice does not leak
 * into the "they bought it" case.
 *
 * An install-only price (options.installOnlyPrice, else the
 * proposed price on the bid) is scored against each cost base.
 * That is the $35 / SF "just set what I bought" number setters
 * actually get shopped on.
 */
export function compareOwnerSupply(input, options = {}) {
  const callback = suggestedOwnerCallbackKit();
  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const wallSf = number(input.wallSf ?? 0, 'Wall square feet');
  const wasteRate = number(input.wasteRate ?? 0, 'Waste rate');
  const tilePerSf = number(input.tilePerSf ?? 0, 'Tile per SF');

  let installPrice = null;
  const rawInstall = options.installOnlyPrice !== undefined
    ? options.installOnlyPrice
    : input.proposedPrice;
  if (rawInstall !== null && rawInstall !== undefined && rawInstall !== '') {
    installPrice = number(rawInstall, 'Install-only price');
  }

  const shortfallSf = wallSf * wasteRate;
  const rushBuy = shortfallSf * tilePerSf * callback.rushTileMultiplier;

  const youSupply = calculateBid(input);
  const ownerCovers = calculateBid({ ...input, tilePerSf: 0 });
  const ownerShort = calculateBid({
    ...input,
    tilePerSf: 0,
    hoursTrip: hoursTrip + callback.hoursCallbackTrip,
    otherCost: otherCost + rushBuy,
  });

  const rows = [
    {
      supply: 'you-supply',
      label: SUPPLY_PRESETS[0].label,
      detail: SUPPLY_PRESETS[0].detail,
      bid: youSupply,
      shortfallMaterial: 0,
    },
    {
      supply: 'owner-covers',
      label: SUPPLY_PRESETS[1].label,
      detail: SUPPLY_PRESETS[1].detail,
      bid: ownerCovers,
      shortfallMaterial: 0,
    },
    {
      supply: 'owner-short',
      label: SUPPLY_PRESETS[2].label,
      detail: SUPPLY_PRESETS[2].detail,
      bid: ownerShort,
      shortfallMaterial: rushBuy,
    },
  ].map((row) => ({
    supply: row.supply,
    label: row.label,
    detail: row.detail,
    price: row.bid.price,
    totalCost: row.bid.totalCost,
    totalHours: row.bid.totalHours,
    tileMaterial: row.bid.tileMaterial,
    shortfallMaterial: row.shortfallMaterial,
    hoursTravel: row.bid.hoursTravel,
    breakEvenPrice: row.bid.breakEvenPrice,
    installOnly: scoreInstallOnly(row.bid, installPrice),
    savedVsYou: youSupply.price - row.bid.price,
  }));

  const cheapest = Math.min(...rows.map((row) => row.price));
  return rows.map((row) => ({
    ...row,
    cheapest: row.price === cheapest,
    delta: row.price - cheapest,
    installOnlyPrice: installPrice,
    shortfallSf,
  }));
}

/**
 * One-line verdict for the owner-supplied table. Names the
 * install-only loss when that number is on the table; otherwise
 * names the bid drop from zeroing the tile invoice.
 */
export function ownerSupplyNote(rows) {
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new Error('Owner-supply comparison is missing rows');
  }
  const you = rows.find((row) => row.supply === 'you-supply');
  const covers = rows.find((row) => row.supply === 'owner-covers');
  const short = rows.find((row) => row.supply === 'owner-short');
  if (!you || !covers || !short) {
    throw new Error('Owner-supply comparison is missing a supply row');
  }

  const drop = you.price - covers.price;
  const callbackLift = short.price - covers.price;
  if (you.installOnly && covers.installOnly) {
    const asked = you.installOnly.price;
    if (you.installOnly.belowBreakEven && covers.installOnly.belowBreakEven) {
      return `At ${money(asked)} install-only you lose money even when they bought the tile. Walk-away on the owner-supplied set is ${money(covers.breakEvenPrice)}.`;
    }
    if (you.installOnly.belowBreakEven && !covers.installOnly.belowBreakEven) {
      return `At ${money(asked)} the you-supply job loses ${money(Math.abs(you.installOnly.profit))}. The same install-only number covers the set if their boxes actually cover.`;
    }
    if (short.installOnly?.belowBreakEven) {
      return `At ${money(asked)} the set covers if their boxes cover. A short / wrong-lot callback still loses ${money(Math.abs(short.installOnly.profit))} — walk-away then is ${money(short.breakEvenPrice)}.`;
    }
    return `At ${money(asked)} both supply paths hold a margin. A short / wrong-lot callback still adds ${money(callbackLift)} to the bid.`;
  }
  return `Zeroing the tile invoice drops the bid ${money(drop)}. A short / wrong-lot callback puts ${money(callbackLift)} back on.`;
}

export const ACCESS_PRESETS = Object.freeze([
  {
    id: 'empty-weekday',
    label: 'Weekday, empty kitchen',
    detail: 'They leave; you work the day',
  },
  {
    id: 'occupied-weekday',
    label: 'Weekday, they cook around you',
    detail: 'Same wage, slower set and punch-list',
  },
  {
    id: 'after-hours',
    label: 'After-hours / weekend',
    detail: 'Overtime wage plus a second evening trip',
  },
]);

/**
 * Starting pace and overtime when the owner will not leave
 * the kitchen, or wants Saturday / after 5pm so they can
 * cook during the week. Occupied pace is a multiplier on
 * the typed tile and punch-list hours — working around a
 * cook is slower, not a different wage. After-hours is
 * time-and-a-half on the typed wage plus a second evening
 * dispatch from the extra-kit trip, so a typed 9-hour set
 * does not inflate the extra trip.
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
 * Price the same splash three ways: empty weekday, they
 * cook around you, or after-hours / weekend.
 *
 * Occupied keeps the typed wage and adds clock hours on
 * the set and punch-list. After-hours keeps the typed
 * hours and raises the wage, then adds a starting second
 * evening trip because you cannot leave mud overnight.
 * Pattern, scope, tile invoice, and extras stay.
 *
 * An install-only price (options.installOnlyPrice, else
 * the proposed price on the bid) is scored against each
 * cost base. That is the "$35 / SF Saturday" number
 * setters actually get shopped on.
 */
export function compareAccess(input, options = {}) {
  const kit = suggestedAccessKit();
  const hoursTilePerSf = number(input.hoursTilePerSf ?? 0, 'Tile hours per SF');
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

  const empty = calculateBid(input);
  const occupied = calculateBid({
    ...input,
    hoursTilePerSf: hoursTilePerSf * kit.occupiedPaceMultiplier,
    siteHours: siteHours * kit.occupiedPaceMultiplier,
  });
  const afterHours = calculateBid({
    ...input,
    hourlyWage: hourlyWage * kit.afterHoursWageMultiplier,
    hoursTrip: hoursTrip + kit.afterHoursExtraTripHours,
  });

  const rows = [
    {
      access: 'empty-weekday',
      label: ACCESS_PRESETS[0].label,
      detail: ACCESS_PRESETS[0].detail,
      bid: empty,
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
    hoursTravel: row.bid.hoursTravel,
    hoursTile: row.bid.hoursTile,
    siteHours: row.bid.siteHours,
    laborCost: row.bid.laborCost,
    breakEvenPrice: row.bid.breakEvenPrice,
    installOnly: scoreInstallOnly(row.bid, installPrice),
    liftFromEmpty: row.bid.price - empty.price,
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
 * One-line verdict for the access table. Names the
 * Saturday / after-hours loss when that number is on the
 * table; otherwise names the bid lift from an empty weekday.
 */
export function accessNote(rows) {
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new Error('Access comparison is missing rows');
  }
  const empty = rows.find((row) => row.access === 'empty-weekday');
  const occupied = rows.find((row) => row.access === 'occupied-weekday');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  if (!empty || !occupied || !afterHours) {
    throw new Error('Access comparison is missing an access row');
  }

  const occupiedLift = occupied.price - empty.price;
  const afterHoursLift = afterHours.price - empty.price;
  if (empty.installOnly && afterHours.installOnly) {
    const asked = empty.installOnly.price;
    if (empty.installOnly.belowBreakEven && afterHours.installOnly.belowBreakEven) {
      return `At ${money(asked)} you lose money even on an empty weekday. Walk-away after-hours is ${money(afterHours.breakEvenPrice)}.`;
    }
    if (!empty.installOnly.belowBreakEven && afterHours.installOnly.belowBreakEven) {
      return `At ${money(asked)} the empty-weekday set covers. The same Saturday / after-hours number loses ${money(Math.abs(afterHours.installOnly.profit))} — walk-away then is ${money(afterHours.breakEvenPrice)}.`;
    }
    if (occupied.installOnly?.belowBreakEven) {
      return `At ${money(asked)} an empty weekday covers. They-cook-around-you still loses ${money(Math.abs(occupied.installOnly.profit))} — walk-away then is ${money(occupied.breakEvenPrice)}.`;
    }
    return `At ${money(asked)} every access window still holds a margin. After-hours still adds ${money(afterHoursLift)} to the bid.`;
  }
  return `They-cook-around-you adds ${money(occupiedLift)} to the bid. After-hours / weekend adds ${money(afterHoursLift)}.`;
}

function money(value) {
  const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

function boxWord(count) {
  return count === 1 ? 'box' : 'boxes';
}

/**
 * Setter-facing leftover note. Costs stay out of the customer draft —
 * this is the box count they lose when leftover is only on the screen.
 */
export function formatBoxPlanNote(plan) {
  const lines = [
    'BOX PLAN (internal — leftover does not change the installed price)',
    `- Buy ${plan.boxesToBuy} ${boxWord(plan.boxesToBuy)} (${plan.purchasedSf.toFixed(1)} SF)`,
    `- Leftover after kitchen: ${plan.leftoverAfterKitchen.toFixed(1)} SF`,
  ];
  if (plan.secondWallSf > 0) {
    lines.push(plan.secondCoveredByLeftover
      ? `- Second wall ${plan.secondWallSf} SF: leftover covers it`
      : `- Second wall ${plan.secondWallSf} SF: leftover misses it — still ${plan.secondBoxesToBuy} ${boxWord(plan.secondBoxesToBuy)}`);
  } else {
    lines.push('- No second wall entered');
  }
  return lines.join('\n');
}

/**
 * Format a bid as a plain-text draft the setter can paste into
 * a proposal. Costs, wages, and invoices are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Kitchen tile backsplash') {
  const perSf = result.pricePerSf === null
    ? 'n/a'
    : `${money(result.pricePerSf)} / SF`;
  const scope = SCOPE_PRESETS.find((item) => item.id === result.scope)?.label ?? result.scope;
  const pattern = PATTERN_PRESETS.find((item) => item.id === result.pattern)?.label ?? result.pattern;
  const wall = WALL_PRESETS.find((item) => item.id === result.wall)?.label ?? result.wall;
  const extras = [
    `${result.travelMiles} travel miles`,
    pattern,
    wall,
    `${result.outlets} outlet${result.outlets === 1 ? '' : 's'}`,
    `${result.edgeLf} LF of edge`,
    result.includeCooktop ? 'cooktop / range cutout included' : 'no cooktop cutout',
    result.includeSchluter ? 'Schluter / edge trim included' : 'no Schluter',
    result.includeAccent ? 'accent band included' : 'no accent band',
  ].join('; ');
  return [
    'KITCHEN TILE BACKSPLASH BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${scope}`,
    `Price per square foot: ${perSf}`,
    `Wall: ${result.wallSf.toLocaleString('en-US')} SF (buy ${result.buySf.toLocaleString('en-US')} SF with waste)`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.wallSf} SF of wall; ${pattern}; ${scope}; ${wall}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; tile: ${result.hoursTile.toFixed(1)} h; extras: ${(result.hoursPrep + result.hoursDemo + result.hoursWall + result.hoursOutlets + result.hoursCooktop + result.hoursSchluter + result.hoursAccent).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm wall SF, pattern, scope, wall condition, extras, and all pricing before sending. It is not a tile specification, a waterproofing design, a building-code determination, a walk-in shower, a floor install, a countertop, or a product warranty.',
  ].join('\n');
}
