// Pure bid arithmetic for residential carpet installation.
// No network, no state: every floor, stair, waste factor, wage,
// and mill invoice is an input, so the result stays a transparent
// calculation the installer can check against their own tickets rather
// than a claim about what any house "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$2 a yard installed" Facebook special treats a flat living-room
// stretch as the same job as a patterned glue-down with fourteen
// stairs, a tear-out, and a furniture move. Homeowners (and a lot of
// estimator sheets) count the same kind of number. Stairs are not
// yards. Pattern match is not "a little more waste." Matching the
// cheap living-room special on a stair house is how a sold carpet
// becomes a loss when the wraps and the dump ticket eat the margin.
//
// Distinct from *carpet cleaning* (steam, rooms, pet urine),
// *flooring install* (LVP, hardwood, and tile as hard-surface waste
// and tear-out), *epoxy garage floor* (grind and flake), *hardwood
// refinishing* (sand and finish), *kitchen tile backsplash* (a wall),
// and *walk-in shower* (wet-area tile). This prices a carpet
// installation: the floor yards, the stairs, the stretch-versus-glue
// scope, and the extras.

export const SCOPE_PRESETS = Object.freeze([
  { id: 'stretch-in', label: 'Stretch-in over pad — the cheap living-room special' },
  { id: 'glue-down', label: 'Glue-down — carpet glued to the slab or subfloor' },
  { id: 'double-stick', label: 'Double-stick — pad and carpet both glued' },
  { id: 'carpet-tile', label: 'Carpet tile — modular squares, less waste' },
]);

export const PATTERN_PRESETS = Object.freeze([
  { id: 'solid', label: 'Solid / no match — the cheap-special assumption' },
  { id: 'textured', label: 'Textured — slight extra waste and seaming' },
  { id: 'patterned', label: 'Patterned — match the pattern across seams' },
  { id: 'berber', label: 'Berber / loop — extra care on seams and stairs' },
]);

export const STAIR_COMPARE_COUNTS = Object.freeze([0, 7, 13, 21]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Cheap special: 400 sq ft living room, stretch-in, solid, no stairs',
    floorSqft: 400,
    stairCount: 0,
    transitionCount: 2,
    scope: 'stretch-in',
    pattern: 'solid',
    travelMiles: 8,
    includeTearOut: false,
    includeFurniture: false,
    includeHaul: false,
  },
  {
    label: 'Typical house: 900 sq ft, stretch-in, solid, 13 stairs, tear-out, furniture',
    floorSqft: 900,
    stairCount: 13,
    transitionCount: 6,
    scope: 'stretch-in',
    pattern: 'solid',
    travelMiles: 14,
    includeTearOut: true,
    includeFurniture: true,
    includeHaul: true,
  },
  {
    label: 'Losing job: 400 sq ft + 14 stairs, patterned glue-down, tear-out, haul',
    floorSqft: 400,
    stairCount: 14,
    transitionCount: 4,
    scope: 'glue-down',
    pattern: 'patterned',
    travelMiles: 18,
    includeTearOut: true,
    includeFurniture: true,
    includeHaul: true,
  },
  {
    label: 'Whole house: 1,600 sq ft, 21 stairs, patterned, tear-out, furniture, haul',
    floorSqft: 1600,
    stairCount: 21,
    transitionCount: 10,
    scope: 'stretch-in',
    pattern: 'patterned',
    travelMiles: 22,
    includeTearOut: true,
    includeFurniture: true,
    includeHaul: true,
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
 * Net floor yards from measured square feet. Carpet is sold and
 * bid in square yards; rooms are measured in square feet.
 * Nine square feet is one square yard.
 */
export function floorYardsFromSqft(floorSqft) {
  return number(floorSqft, 'Floor square feet') / 9;
}

/**
 * Starting stretch, glue, pad, and adhesive hours from how the
 * carpet is actually sold. Stretch-in on a flat living room is
 * the cheap special. Glue-down is adhesive on a slab.
 * Double-stick is both. Carpet tile wastes less roll.
 */
export function suggestedScopeKit(scope) {
  const id = String(scope);
  if (id === 'stretch-in') {
    return {
      hoursFloorPerYard: 0.11,
      padEach: 6,
      adhesiveEach: 0,
      tackStripEach: 0.85,
    };
  }
  if (id === 'glue-down') {
    return {
      hoursFloorPerYard: 0.18,
      padEach: 0,
      adhesiveEach: 3.5,
      tackStripEach: 0,
    };
  }
  if (id === 'double-stick') {
    return {
      hoursFloorPerYard: 0.22,
      padEach: 7,
      adhesiveEach: 6,
      tackStripEach: 0,
    };
  }
  if (id === 'carpet-tile') {
    return {
      hoursFloorPerYard: 0.14,
      padEach: 0,
      adhesiveEach: 2.2,
      tackStripEach: 0,
    };
  }
  throw new Error('Unknown scope');
}

/**
 * Solid is the cheap-special assumption. Patterned is match
 * waste and extra seaming. Berber is loop care on stairs.
 */
export function suggestedPatternKit(pattern) {
  const id = String(pattern);
  if (id === 'solid') {
    return { wastePercent: 10, hoursPatternPerYard: 0 };
  }
  if (id === 'textured') {
    return { wastePercent: 12, hoursPatternPerYard: 0.02 };
  }
  if (id === 'patterned') {
    return { wastePercent: 18, hoursPatternPerYard: 0.05 };
  }
  if (id === 'berber') {
    return { wastePercent: 14, hoursPatternPerYard: 0.04 };
  }
  throw new Error('Unknown pattern');
}

/**
 * Starting extras that do not live in a $2-a-yard installed special.
 * Stairs are priced per step, not folded into floor yards.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 0.9,
    hoursPerMile: 0.035,
    hoursPerStair: 0.4,
    hoursTearOutPerYard: 0.06,
    hoursFurnitureMove: 1.6,
    hoursTransitionEach: 0.12,
    hoursHaulPerYard: 0.03,
    siteHours: 0.5,
    stairYardsEach: 1,
    carpetInvoice: 22,
    stairWrapEach: 14,
    tearOutDumpEach: 0.45,
    transitionEach: 18,
    haulEach: 0.55,
    travelPerMile: 2.8,
  };
}

/**
 * Price a carpet installation from the floor, the stairs, the
 * stretch-versus-glue scope, the pattern, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const scope = requirePreset(SCOPE_PRESETS, input.scope, 'scope').id;
  const pattern = requirePreset(PATTERN_PRESETS, input.pattern, 'pattern').id;

  const floorSqft = number(input.floorSqft ?? 0, 'Floor square feet');
  const stairCount = number(input.stairCount ?? 0, 'Stair count');
  const transitionCount = number(input.transitionCount ?? 0, 'Transition count');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const includeTearOut = flag(input.includeTearOut);
  const includeFurniture = flag(input.includeFurniture);
  const includeHaul = flag(input.includeHaul);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursFloorPerYard = number(input.hoursFloorPerYard ?? 0, 'Floor hours per yard');
  const hoursPatternPerYard = number(input.hoursPatternPerYard ?? 0, 'Pattern hours per yard');
  const hoursPerStair = number(input.hoursPerStair ?? 0, 'Hours per stair');
  const hoursTearOutPerYard = number(input.hoursTearOutPerYard ?? 0, 'Tear-out hours per yard');
  const hoursFurnitureMove = number(input.hoursFurnitureMove ?? 0, 'Furniture-move hours');
  const hoursTransitionEach = number(input.hoursTransitionEach ?? 0, 'Hours per transition');
  const hoursHaulPerYard = number(input.hoursHaulPerYard ?? 0, 'Haul hours per yard');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const wastePercent = number(input.wastePercent ?? 0, 'Waste percent');
  const stairYardsEach = number(input.stairYardsEach ?? 0, 'Stair yards each');
  const carpetInvoice = number(input.carpetInvoice ?? 0, 'Carpet invoice');
  const padEach = number(input.padEach ?? 0, 'Pad each');
  const adhesiveEach = number(input.adhesiveEach ?? 0, 'Adhesive each');
  const tackStripEach = number(input.tackStripEach ?? 0, 'Tack strip each');
  const stairWrapEach = number(input.stairWrapEach ?? 0, 'Stair wrap each');
  const tearOutDumpEach = number(input.tearOutDumpEach ?? 0, 'Tear-out dump each');
  const transitionEach = number(input.transitionEach ?? 0, 'Transition each');
  const haulEach = number(input.haulEach ?? 0, 'Haul each');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');

  const netYards = floorYardsFromSqft(floorSqft);
  const wasteYards = netYards * (wastePercent / 100);
  const floorYards = netYards + wasteYards;
  const stairYards = stairCount * stairYardsEach;
  const billYards = floorYards + stairYards;

  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursFloor = floorYards * hoursFloorPerYard;
  const hoursPattern = floorYards * hoursPatternPerYard;
  const hoursStairs = stairCount * hoursPerStair;
  const hoursTearOutApplied = includeTearOut ? floorYards * hoursTearOutPerYard : 0;
  const hoursFurnitureApplied = includeFurniture ? hoursFurnitureMove : 0;
  const hoursTransitions = transitionCount * hoursTransitionEach;
  const hoursHaulApplied = includeHaul ? billYards * hoursHaulPerYard : 0;
  const extraWorkHours = hoursPattern + hoursStairs + hoursTearOutApplied
    + hoursFurnitureApplied + hoursTransitions + hoursHaulApplied;
  const totalHours = hoursTravel + hoursFloor + extraWorkHours + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const carpetMaterial = billYards * carpetInvoice;
  const padMaterial = floorYards * padEach;
  const adhesiveMaterial = floorYards * adhesiveEach;
  const tackMaterial = floorYards * tackStripEach;
  const stairMaterial = stairCount * stairWrapEach;
  const tearOutMaterial = includeTearOut ? floorYards * tearOutDumpEach : 0;
  const transitionMaterial = transitionCount * transitionEach;
  const haulMaterial = includeHaul ? billYards * haulEach : 0;
  const travelInvoice = travelMiles * travelPerMile;
  const finishMaterial = carpetMaterial + padMaterial + adhesiveMaterial + tackMaterial;
  const extraHardware = stairMaterial + tearOutMaterial + transitionMaterial
    + haulMaterial + travelInvoice;
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
    pattern,
    floorSqft,
    stairCount,
    transitionCount,
    travelMiles,
    includeTearOut,
    includeFurniture,
    includeHaul,
    wastePercent,
    netYards,
    wasteYards,
    floorYards,
    stairYards,
    billYards,
    loadedWage,
    hoursTravel,
    hoursFloor,
    hoursPattern,
    hoursStairs,
    hoursTearOut: hoursTearOutApplied,
    hoursFurniture: hoursFurnitureApplied,
    hoursTransitions,
    hoursHaul: hoursHaulApplied,
    siteHours,
    totalHours,
    laborCost,
    carpetMaterial,
    padMaterial,
    adhesiveMaterial,
    tackMaterial,
    stairMaterial,
    tearOutMaterial,
    transitionMaterial,
    haulMaterial,
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
    pricePerYard: billYards === 0 ? null : price / billYards,
    pricePerSqft: floorSqft === 0 ? null : price / floorSqft,
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
      floor: hourShare(hoursFloor),
      pattern: hourShare(hoursPattern),
      stairs: hourShare(hoursStairs),
      tearOut: hourShare(hoursTearOutApplied),
      furniture: hourShare(hoursFurnitureApplied),
      transitions: hourShare(hoursTransitions),
      haul: hourShare(hoursHaulApplied),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perYard: billYards === 0 ? null : proposedPrice / billYards,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same floor four ways — stretch-in, glue-down,
 * double-stick, carpet-tile — from the suggested scope kits so
 * the installer can see when a slab glue-down flips the cheap
 * $2-a-yard special. User-typed scope rates are not reused here:
 * the comparison is apples-to-apples on the starting figures.
 * Pattern and stair counts stay with the current job.
 */
export function compareScope(input) {
  const patternKit = suggestedPatternKit(String(input.pattern ?? 'solid'));
  const extraKit = suggestedExtraKit();
  const rows = SCOPE_PRESETS.map((preset) => {
    const kit = suggestedScopeKit(preset.id);
    const bid = calculateBid({
      ...input,
      scope: preset.id,
      ...patternKit,
      ...extraKit,
      ...kit,
    });
    return {
      scope: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerYard: bid.pricePerYard,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursFloor: bid.hoursFloor,
      padMaterial: bid.padMaterial,
      adhesiveMaterial: bid.adhesiveMaterial,
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
 * Price the same floor four ways — 0, 7, 13, 21 stairs — from
 * the suggested extra kit so the installer can see that stairs
 * are not yards. User-typed stair rates are not reused here:
 * the comparison is apples-to-apples on the starting figures.
 * Scope and pattern kits stay with the current job.
 */
export function compareStairs(input) {
  const scopeKit = suggestedScopeKit(String(input.scope ?? 'stretch-in'));
  const patternKit = suggestedPatternKit(String(input.pattern ?? 'solid'));
  const extraKit = suggestedExtraKit();
  const rows = STAIR_COMPARE_COUNTS.map((stairCount) => {
    const bid = calculateBid({
      ...input,
      stairCount,
      ...scopeKit,
      ...patternKit,
      ...extraKit,
    });
    return {
      stairCount,
      label: stairCount === 0
        ? 'No stairs — the cheap special'
        : `${stairCount} stairs`,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      hoursStairs: bid.hoursStairs,
      stairMaterial: bid.stairMaterial,
      stairYards: bid.stairYards,
      extraCost: bid.extraCost,
      breakEvenPrice: bid.breakEvenPrice,
    };
  });
  const none = rows.find((row) => row.stairCount === 0);
  const cheapest = Math.min(...rows.map((row) => row.price));
  return rows
    .map((row) => ({
      ...row,
      cheapest: row.price === cheapest,
      delta: row.price - cheapest,
      upgradeFromFlat: none ? row.price - none.price : 0,
    }));
}

function money(value) {
  const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Format a bid as a plain-text draft the installer can paste into
 * a proposal. Costs, wages, and invoices are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Carpet installation') {
  const perYard = result.pricePerYard === null
    ? 'n/a'
    : `${money(result.pricePerYard)} / yd²`;
  const scope = SCOPE_PRESETS.find((item) => item.id === result.scope)?.label ?? result.scope;
  const pattern = PATTERN_PRESETS.find((item) => item.id === result.pattern)?.label ?? result.pattern;
  const extras = [
    `${result.travelMiles} travel miles`,
    pattern,
    `${result.stairCount} stair${result.stairCount === 1 ? '' : 's'}`,
    `${result.transitionCount} transition${result.transitionCount === 1 ? '' : 's'}`,
    result.includeTearOut ? 'tear-out included' : 'no tear-out',
    result.includeFurniture ? 'furniture move included' : 'no furniture move',
    result.includeHaul ? 'haul-away included' : 'no haul-away',
  ].join('; ');
  return [
    'CARPET INSTALLATION BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${scope}`,
    `Price per yard: ${perYard}`,
    `Floor: ${result.floorSqft.toLocaleString('en-US')} sq ft (${result.billYards.toFixed(1)} yd² billed, including ${result.wastePercent}% waste and stairs)`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.floorSqft.toLocaleString('en-US')} sq ft; ${result.stairCount} stairs; ${scope}; ${pattern}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; floor: ${result.hoursFloor.toFixed(1)} h; stairs: ${result.hoursStairs.toFixed(1)} h; extras: ${(result.hoursPattern + result.hoursTearOut + result.hoursFurniture + result.hoursTransitions + result.hoursHaul).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm floor measure, stairs, waste, stretch-versus-glue, extras, and all pricing before sending. It is not a flooring-spec determination, a moisture test, a carpet-cleaning, an LVP/hardwood/tile install, or a product warranty.',
  ].join('\n');
}
