// Pure bid arithmetic for popcorn / acoustic-ceiling removal.
// No network, no state: every ceiling foot, scrape hour, skim coat,
// wage, and dump bag is an input, so the result stays a
// transparent calculation the contractor can check against their own
// invoices rather than a claim about what any ceiling "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$1.50 / sq ft popcorn removal special" treats an 8-foot first-floor
// light scrape-and-prime as the same job as a two-story painted-over
// heavy cottage-cheese with a Level 5 skim, two coats of paint, an
// asbestos test, and interior scaffolding. Homeowners (and a lot of
// estimator sheets) count the same kind of number. Height, texture,
// and extras do not scale with that scrape dump. Matching a cheap
// ranch special on a painted two-story skim-and-paint job is how a
// sold ceiling becomes a three-day loss after the first containment.
//
// Distinct from *interior painting* (walls and a flat ceiling as a
// coat, not scraping texture), *drywall hang-and-finish* (new gypsum
// and a Level 5 on new board), *exterior painting* (house elevations),
// *cabinet refinishing*, and *hardwood refinishing*. This prices
// popcorn ceiling removal: the scrape, the skim, and the extras.

export const SCOPE_PRESETS = Object.freeze([
  { id: 'scrape-prime', label: 'Scrape and prime only (the cheap special)' },
  { id: 'scrape-skim', label: 'Scrape, Level 4 skim, prime' },
  { id: 'scrape-skim-paint', label: 'Scrape, Level 5 skim, prime, two coats' },
]);

export const HEIGHT_PRESETS = Object.freeze([
  { id: 'eight', label: '8-foot first-floor — walkable, no lift' },
  { id: 'vaulted', label: 'Vaulted / cathedral / 12+ ft — lift required' },
  { id: 'two-story', label: 'Two-story interior / stairwell — scaffolding' },
]);

export const TEXTURE_PRESETS = Object.freeze([
  { id: 'light', label: 'Light popcorn / acoustic spray' },
  { id: 'heavy', label: 'Heavy cottage-cheese' },
  { id: 'painted', label: 'Painted-over popcorn (harder scrape)' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Ranch, 8-ft, light scrape-and-prime (the cheap special)',
    lengthFt: 40,
    widthFt: 30,
    scope: 'scrape-prime',
    height: 'eight',
    texture: 'light',
    travelMiles: 10,
    closetCeilings: 0,
    stainRepairs: 0,
    asbestosTest: false,
    containment: false,
    furnitureMove: false,
  },
  {
    label: 'Typical ranch, Level 4 skim, light texture, furniture covered',
    lengthFt: 42,
    widthFt: 32,
    scope: 'scrape-skim',
    height: 'eight',
    texture: 'light',
    travelMiles: 14,
    closetCeilings: 3,
    stainRepairs: 2,
    asbestosTest: false,
    containment: true,
    furnitureMove: true,
  },
  {
    label: 'Two-story painted-over heavy, Level 5 + paint, asbestos (where the special loses)',
    lengthFt: 36,
    widthFt: 28,
    scope: 'scrape-skim-paint',
    height: 'two-story',
    texture: 'painted',
    travelMiles: 22,
    closetCeilings: 6,
    stainRepairs: 4,
    asbestosTest: true,
    containment: true,
    furnitureMove: true,
  },
  {
    label: 'Vaulted family room, scrape-skim, light, no paint',
    lengthFt: 22,
    widthFt: 18,
    scope: 'scrape-skim',
    height: 'vaulted',
    texture: 'light',
    travelMiles: 8,
    closetCeilings: 0,
    stainRepairs: 1,
    asbestosTest: false,
    containment: true,
    furnitureMove: false,
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
 * Ceiling area. Either dimension at zero is a zero-area room,
 * not a missing input — the contractor can still price rates
 * without a shape.
 */
export function ceilingAreaSqFt(lengthFt, widthFt) {
  return number(lengthFt, 'Length') * number(widthFt, 'Width');
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
 * Starting hours and material invoices from how much of the
 * ceiling is actually finished. Scrape-and-prime is the cheap
 * special. Level 4 skim is a different crew day. Level 5 plus
 * two coats is another one still.
 */
export function suggestedScopeKit(scope) {
  const id = String(scope);
  if (id === 'scrape-prime') {
    return {
      hoursPerSqFtScrape: 0.022,
      hoursPerSqFtSkim: 0,
      hoursPerSqFtPaint: 0,
      mudPerSqFt: 0,
      primerPerSqFt: 0.18,
      paintPerSqFt: 0,
    };
  }
  if (id === 'scrape-skim') {
    return {
      hoursPerSqFtScrape: 0.022,
      hoursPerSqFtSkim: 0.018,
      hoursPerSqFtPaint: 0,
      mudPerSqFt: 0.35,
      primerPerSqFt: 0.22,
      paintPerSqFt: 0,
    };
  }
  if (id === 'scrape-skim-paint') {
    return {
      hoursPerSqFtScrape: 0.022,
      hoursPerSqFtSkim: 0.028,
      hoursPerSqFtPaint: 0.012,
      mudPerSqFt: 0.48,
      primerPerSqFt: 0.22,
      paintPerSqFt: 0.42,
    };
  }
  throw new Error('Unknown scope');
}

/**
 * Eight-foot is a walkable day. Vaulted is a lift. Two-story
 * is interior scaffolding and a stairwell.
 */
export function suggestedHeightKit(height) {
  const id = String(height);
  if (id === 'eight') {
    return { hoursAccess: 0.6, accessPremiumPerSqFt: 0, scaffoldInvoice: 0 };
  }
  if (id === 'vaulted') {
    return { hoursAccess: 2.4, accessPremiumPerSqFt: 0.008, scaffoldInvoice: 185 };
  }
  if (id === 'two-story') {
    return { hoursAccess: 4.2, accessPremiumPerSqFt: 0.014, scaffoldInvoice: 420 };
  }
  throw new Error('Unknown height');
}

/**
 * Light popcorn is the cheap-special texture. Heavy is more
 * bags and a slower scrape. Painted-over is slower still —
 * the special assumes you can scrape it dry.
 */
export function suggestedTextureKit(texture) {
  const id = String(texture);
  if (id === 'light') {
    return { hoursTexturePremiumPerSqFt: 0, bagsPerSqFt: 0.004, bagEach: 4.5 };
  }
  if (id === 'heavy') {
    return { hoursTexturePremiumPerSqFt: 0.006, bagsPerSqFt: 0.008, bagEach: 4.5 };
  }
  if (id === 'painted') {
    return { hoursTexturePremiumPerSqFt: 0.010, bagsPerSqFt: 0.006, bagEach: 4.5 };
  }
  throw new Error('Unknown texture');
}

/**
 * Starting extras that do not live in a $1.50 / sq ft scrape special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 1.5,
    hoursPerMile: 0.035,
    hoursAsbestos: 1.8,
    hoursContainment: 2.2,
    hoursFurniture: 1.6,
    hoursPerCloset: 0.45,
    hoursPerStain: 0.55,
    siteHours: 1.4,
    asbestosInvoice: 185,
    containmentInvoice: 95,
    stainEach: 18,
    travelPerMile: 2.8,
  };
}

/**
 * Price popcorn ceiling removal from the scrape, the skim,
 * and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const scope = requirePreset(SCOPE_PRESETS, input.scope, 'scope').id;
  const height = requirePreset(HEIGHT_PRESETS, input.height, 'height').id;
  const texture = requirePreset(TEXTURE_PRESETS, input.texture, 'texture').id;

  const lengthFt = number(input.lengthFt ?? 0, 'Length');
  const widthFt = number(input.widthFt ?? 0, 'Width');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const closetCeilings = number(input.closetCeilings ?? 0, 'Closet ceilings');
  const stainRepairs = number(input.stainRepairs ?? 0, 'Stain repairs');
  const asbestosTest = flag(input.asbestosTest);
  const containment = flag(input.containment);
  const furnitureMove = flag(input.furnitureMove);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursPerSqFtScrape = number(input.hoursPerSqFtScrape ?? 0, 'Scrape hours per sq ft');
  const hoursPerSqFtSkim = number(input.hoursPerSqFtSkim ?? 0, 'Skim hours per sq ft');
  const hoursPerSqFtPaint = number(input.hoursPerSqFtPaint ?? 0, 'Paint hours per sq ft');
  const hoursAccess = number(input.hoursAccess ?? 0, 'Access hours');
  const accessPremiumPerSqFt = number(input.accessPremiumPerSqFt ?? 0, 'Access premium per sq ft');
  const hoursTexturePremiumPerSqFt = number(input.hoursTexturePremiumPerSqFt ?? 0, 'Texture hours per sq ft');
  const hoursAsbestos = number(input.hoursAsbestos ?? 0, 'Asbestos hours');
  const hoursContainment = number(input.hoursContainment ?? 0, 'Containment hours');
  const hoursFurniture = number(input.hoursFurniture ?? 0, 'Furniture hours');
  const hoursPerCloset = number(input.hoursPerCloset ?? 0, 'Hours per closet');
  const hoursPerStain = number(input.hoursPerStain ?? 0, 'Hours per stain');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const mudPerSqFt = number(input.mudPerSqFt ?? 0, 'Mud per sq ft');
  const primerPerSqFt = number(input.primerPerSqFt ?? 0, 'Primer per sq ft');
  const paintPerSqFt = number(input.paintPerSqFt ?? 0, 'Paint per sq ft');
  const bagsPerSqFt = number(input.bagsPerSqFt ?? 0, 'Bags per sq ft');
  const bagEach = number(input.bagEach ?? 0, 'Bag each');
  const scaffoldInvoice = number(input.scaffoldInvoice ?? 0, 'Scaffold invoice');
  const asbestosInvoice = number(input.asbestosInvoice ?? 0, 'Asbestos invoice');
  const containmentInvoice = number(input.containmentInvoice ?? 0, 'Containment invoice');
  const stainEach = number(input.stainEach ?? 0, 'Stain each');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');

  const ceilingSqFt = ceilingAreaSqFt(lengthFt, widthFt);

  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursScrape = ceilingSqFt * hoursPerSqFtScrape;
  const hoursSkim = ceilingSqFt * hoursPerSqFtSkim;
  const hoursPaint = ceilingSqFt * hoursPerSqFtPaint;
  const hoursAccessPremium = ceilingSqFt * accessPremiumPerSqFt;
  const hoursTexture = ceilingSqFt * hoursTexturePremiumPerSqFt;
  const hoursAsbestosApplied = asbestosTest ? hoursAsbestos : 0;
  const hoursContainmentApplied = containment ? hoursContainment : 0;
  const hoursFurnitureApplied = furnitureMove ? hoursFurniture : 0;
  const hoursClosets = closetCeilings * hoursPerCloset;
  const hoursStains = stainRepairs * hoursPerStain;
  const totalHours = hoursTravel + hoursScrape + hoursSkim + hoursPaint
    + hoursAccess + hoursAccessPremium + hoursTexture
    + hoursAsbestosApplied + hoursContainmentApplied + hoursFurnitureApplied
    + hoursClosets + hoursStains + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const mudMaterial = ceilingSqFt * mudPerSqFt;
  const primerMaterial = ceilingSqFt * primerPerSqFt;
  const paintMaterial = ceilingSqFt * paintPerSqFt;
  const bagCount = ceilingSqFt * bagsPerSqFt;
  const dumpMaterial = bagCount * bagEach;
  const scaffoldMaterial = scaffoldInvoice;
  const asbestosMaterial = asbestosTest ? asbestosInvoice : 0;
  const containmentMaterial = containment ? containmentInvoice : 0;
  const stainMaterial = stainRepairs * stainEach;
  const travelInvoice = travelMiles * travelPerMile;
  const extraHardware = dumpMaterial + scaffoldMaterial + asbestosMaterial
    + containmentMaterial + stainMaterial + travelInvoice;
  const finishMaterial = mudMaterial + primerMaterial + paintMaterial;
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
    + hoursAccess * loadedWage
    + hoursAccessPremium * loadedWage
    + hoursTexture * loadedWage
    + hoursAsbestosApplied * loadedWage
    + hoursContainmentApplied * loadedWage
    + hoursFurnitureApplied * loadedWage
    + hoursClosets * loadedWage
    + hoursStains * loadedWage
    + hoursTravel * loadedWage
    + hoursSkim * loadedWage
    + hoursPaint * loadedWage;

  return {
    scope,
    height,
    texture,
    lengthFt,
    widthFt,
    travelMiles,
    closetCeilings,
    stainRepairs,
    asbestosTest,
    containment,
    furnitureMove,
    ceilingSqFt,
    bagCount,
    loadedWage,
    hoursTravel,
    hoursScrape,
    hoursSkim,
    hoursPaint,
    hoursAccess,
    hoursAccessPremium,
    hoursTexture,
    hoursAsbestos: hoursAsbestosApplied,
    hoursContainment: hoursContainmentApplied,
    hoursFurniture: hoursFurnitureApplied,
    hoursClosets,
    hoursStains,
    siteHours,
    totalHours,
    laborCost,
    mudMaterial,
    primerMaterial,
    paintMaterial,
    dumpMaterial,
    scaffoldMaterial,
    asbestosMaterial,
    containmentMaterial,
    stainMaterial,
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
    pricePerSqFt: ceilingSqFt === 0 ? null : price / ceilingSqFt,
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
      scrape: hourShare(hoursScrape),
      skim: hourShare(hoursSkim),
      paint: hourShare(hoursPaint),
      access: hourShare(hoursAccess + hoursAccessPremium),
      texture: hourShare(hoursTexture),
      asbestos: hourShare(hoursAsbestosApplied),
      containment: hourShare(hoursContainmentApplied),
      furniture: hourShare(hoursFurnitureApplied),
      closets: hourShare(hoursClosets),
      stains: hourShare(hoursStains),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perSqFt: ceilingSqFt === 0 ? null : proposedPrice / ceilingSqFt,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same ceiling three ways — scrape-and-prime, Level 4
 * skim, Level 5 plus paint — from the suggested scope kits so
 * the contractor can see when a skim-and-paint job flips the
 * cheap $1.50 / sq ft special. User-typed scope rates are not
 * reused here: the comparison is apples-to-apples on the
 * starting figures. Height and texture kits stay with the
 * current job.
 */
export function compareScope(input) {
  const heightKit = suggestedHeightKit(String(input.height ?? 'eight'));
  const textureKit = suggestedTextureKit(String(input.texture ?? 'light'));
  const extraKit = suggestedExtraKit();
  const rows = SCOPE_PRESETS.map((preset) => {
    const kit = suggestedScopeKit(preset.id);
    const bid = calculateBid({
      ...input,
      scope: preset.id,
      ...heightKit,
      ...textureKit,
      ...extraKit,
      ...kit,
    });
    return {
      scope: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerSqFt: bid.pricePerSqFt,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursSkim: bid.hoursSkim,
      hoursPaint: bid.hoursPaint,
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
 * Format a bid as a plain-text draft the contractor can paste into
 * a proposal. Costs, wages, and invoices are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Popcorn ceiling removal') {
  const perFt = result.pricePerSqFt === null
    ? 'n/a'
    : `${money(result.pricePerSqFt)} / sq ft`;
  const scope = SCOPE_PRESETS.find((item) => item.id === result.scope)?.label ?? result.scope;
  const height = HEIGHT_PRESETS.find((item) => item.id === result.height)?.label ?? result.height;
  const texture = TEXTURE_PRESETS.find((item) => item.id === result.texture)?.label ?? result.texture;
  const extras = [
    `${result.travelMiles} travel miles`,
    height,
    texture,
    `${result.closetCeilings} closet ceiling${result.closetCeilings === 1 ? '' : 's'}`,
    `${result.stainRepairs} stain repair${result.stainRepairs === 1 ? '' : 's'}`,
    result.asbestosTest ? 'asbestos test included' : 'no asbestos test',
    result.containment ? 'plastic containment included' : 'no containment',
    result.furnitureMove ? 'furniture move / cover included' : 'no furniture move',
  ].join('; ');
  return [
    'POPCORN CEILING REMOVAL BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${scope}`,
    `Price per square foot of ceiling: ${perFt}`,
    `Ceiling: ${result.ceilingSqFt.toLocaleString('en-US')} sq ft`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.lengthFt} ft × ${result.widthFt} ft ceiling (${result.ceilingSqFt.toLocaleString('en-US')} sq ft)`,
    `- ${scope}; ${height}; ${texture}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; scrape: ${result.hoursScrape.toFixed(1)} h; skim: ${result.hoursSkim.toFixed(1)} h; paint: ${result.hoursPaint.toFixed(1)} h; extras: ${(result.hoursAsbestos + result.hoursContainment + result.hoursFurniture + result.hoursClosets + result.hoursStains).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm ceiling area, scope, height, texture, extras, and all pricing before sending. It is not a drywall specification, an asbestos clearance, a lead-paint determination, a building-code determination, or a finish guarantee.',
  ].join('\n');
}
