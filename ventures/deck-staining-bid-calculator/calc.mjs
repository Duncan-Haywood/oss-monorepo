// Pure bid arithmetic for *staining or sealing an existing deck*,
// not building a new deck and not painting the house. No network, no
// state: every area, rail, stair, prep, finish, wage, and extra is an
// input, so the result stays a transparent calculation the crew can
// check against their own invoices rather than a claim about what any
// deck "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$2.50 / sq ft" special treats a 200-square-foot platform with no
// rail as the same job as a 192-square-foot 12x16 with 40 lineal feet
// of picket rail and a stair run. Homeowners (and a lot of estimator
// sheets) count walking-surface square feet. Picket rails and stairs
// are stainable surface that never appears in that number. Matching a
// cheaper special written for the platform is how a sold oil two-coat
// picket job becomes a two-day loss after the first stair.
//
// Distinct from a deck *build* (posts, joists, railing as construction)
// and from exterior house painting (elevations, scrape-and-prime). This
// prices the stain: stainable surface, prep, coats, access, furniture,
// and the extras that are not in the coupon.

export const PREP_PRESETS = Object.freeze([
  { id: 'wash', label: 'Wash / brighten only' },
  { id: 'sand', label: 'Wash and light sand' },
  { id: 'strip', label: 'Strip peeling stain, then wash and sand' },
]);

export const FINISH_PRESETS = Object.freeze([
  { id: 'water', label: 'Water-based stain (typically 1 coat)' },
  { id: 'oil', label: 'Oil-based stain (typically 2 coats)' },
  { id: 'composite', label: 'Composite clean and seal (do not stain like wood)' },
]);

export const ACCESS_PRESETS = Object.freeze([
  { id: 'ground', label: 'Ground-level / easy carry' },
  { id: 'second', label: 'Second-story / staging and carry' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Platform 200 sf, no rail, wash, 1-coat water (the $2.50/sf special)',
    prep: 'wash',
    finish: 'water',
    access: 'ground',
    deckSqFt: 200,
    railLinealFeet: 0,
    stairRuns: 0,
    moveFurniture: false,
  },
  {
    label: '12x16 192 sf, 40 lf picket rail, 1 stair, wash, 2-coat oil',
    prep: 'wash',
    finish: 'oil',
    access: 'ground',
    deckSqFt: 192,
    railLinealFeet: 40,
    stairRuns: 1,
    moveFurniture: false,
  },
  {
    label: '400 sf, 80 lf picket, 2 stairs, strip, 2-coat oil, second story, furniture',
    prep: 'strip',
    finish: 'oil',
    access: 'second',
    deckSqFt: 400,
    railLinealFeet: 80,
    stairRuns: 2,
    moveFurniture: true,
  },
  {
    label: 'Composite 300 sf, 50 lf rail, 1 stair, wash, clean-and-seal',
    prep: 'wash',
    finish: 'composite',
    access: 'ground',
    deckSqFt: 300,
    railLinealFeet: 50,
    stairRuns: 1,
    moveFurniture: false,
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

/**
 * Starting prep hours-per-100-sf and material-per-100-sf. These are
 * ballpark crew figures, not a catalog. Picking a prep never
 * overwrites a cost the shop has already typed.
 */
export function suggestedPrepKit(prep) {
  const id = String(prep);
  if (id === 'wash') return { hoursPer100SfPrep: 0.55, prepMaterialPer100Sf: 3.5 };
  if (id === 'sand') return { hoursPer100SfPrep: 1.35, prepMaterialPer100Sf: 6 };
  if (id === 'strip') return { hoursPer100SfPrep: 2.7, prepMaterialPer100Sf: 24 };
  throw new Error('Unknown prep method');
}

/**
 * Starting coat count, hours-per-100-sf per coat, and stain coverage.
 * Composite is a cleaner/sealer, not a wood stain.
 */
export function suggestedFinishKit(finish) {
  const id = String(finish);
  if (id === 'water') {
    return { coats: 1, hoursPer100SfCoat: 0.65, stainPerGallon: 46, coverageSfPerGallon: 225 };
  }
  if (id === 'oil') {
    return { coats: 2, hoursPer100SfCoat: 0.8, stainPerGallon: 58, coverageSfPerGallon: 150 };
  }
  if (id === 'composite') {
    return { coats: 1, hoursPer100SfCoat: 0.5, stainPerGallon: 52, coverageSfPerGallon: 275 };
  }
  throw new Error('Unknown finish');
}

/**
 * Starting access hours that are not the walking surface. Ground-level
 * is not a second-story carry with staging.
 */
export function suggestedAccessKit(access) {
  const id = String(access);
  if (id === 'ground') return { hoursAccess: 0 };
  if (id === 'second') return { hoursAccess: 1.6 };
  throw new Error('Unknown access path');
}

/**
 * Stainable surface in square feet: the number a per-square-foot
 * special cannot see. A 192 sf deck with 40 lf of picket rail at 9 sf
 * per foot and one 40-sf stair is 592 sf of stain work, not "192
 * square feet of deck."
 */
export function stainableSurface(deckSqFt, railLinealFeet, railSfPerLf, stairRuns, stairSf) {
  return number(deckSqFt, 'Deck square feet')
    + number(railLinealFeet, 'Rail lineal feet') * number(railSfPerLf, 'Rail square feet per lineal foot')
    + number(stairRuns, 'Stair runs') * number(stairSf, 'Square feet per stair run');
}

/**
 * Price a deck-staining job from the stainable surface, the extras
 * past a platform special, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const deckSqFt = number(input.deckSqFt ?? 0, 'Deck square feet');
  const railLinealFeet = number(input.railLinealFeet ?? 0, 'Rail lineal feet');
  const railSfPerLf = number(input.railSfPerLf ?? 0, 'Rail square feet per lineal foot');
  const stairRuns = number(input.stairRuns ?? 0, 'Stair runs');
  const stairSf = number(input.stairSf ?? 0, 'Square feet per stair run');

  const prep = String(input.prep ?? 'wash');
  if (!PREP_PRESETS.some((item) => item.id === prep)) {
    throw new Error('Unknown prep method');
  }
  const finish = String(input.finish ?? 'water');
  if (!FINISH_PRESETS.some((item) => item.id === finish)) {
    throw new Error('Unknown finish');
  }
  const access = String(input.access ?? 'ground');
  if (!ACCESS_PRESETS.some((item) => item.id === access)) {
    throw new Error('Unknown access path');
  }

  const moveFurniture = flag(input.moveFurniture);

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursPer100SfPrep = number(input.hoursPer100SfPrep ?? 0, 'Hours per 100 sf of prep');
  const hoursPer100SfCoat = number(input.hoursPer100SfCoat ?? 0, 'Hours per 100 sf per coat');
  const coats = number(input.coats ?? 0, 'Coats');
  const hoursAccess = number(input.hoursAccess ?? 0, 'Second-story / staging hours');
  const hoursFurniture = number(input.hoursFurniture ?? 0, 'Hours to move furniture');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const prepMaterialPer100Sf = number(input.prepMaterialPer100Sf ?? 0, 'Prep material per 100 sf');
  const stainPerGallon = number(input.stainPerGallon ?? 0, 'Stain / sealer per gallon');
  const coverageSfPerGallon = number(input.coverageSfPerGallon ?? 0, 'Coverage square feet per gallon');
  const furnitureFee = number(input.furnitureFee ?? 0, 'Furniture-move fee');
  const mobilizationFee = number(input.mobilizationFee ?? 0, 'Mobilization');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const railSf = railLinealFeet * railSfPerLf;
  const stairSfTotal = stairRuns * stairSf;
  const stainableSf = stainableSurface(deckSqFt, railLinealFeet, railSfPerLf, stairRuns, stairSf);
  const hundreds = stainableSf / 100;

  const tripHours = hoursTrip;
  const prepHours = hundreds * hoursPer100SfPrep;
  const coatHours = hundreds * hoursPer100SfCoat * coats;
  const accessHours = hoursAccess;
  const furnitureHours = moveFurniture ? hoursFurniture : 0;
  const totalHours = tripHours + prepHours + coatHours + accessHours + furnitureHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const stainGallons = coverageSfPerGallon === 0 ? 0 : (stainableSf * coats) / coverageSfPerGallon;
  const stainMaterial = stainGallons * stainPerGallon;
  const prepMaterial = hundreds * prepMaterialPer100Sf;
  const furnitureMaterial = moveFurniture ? furnitureFee : 0;
  const mobilizationMaterial = mobilizationFee;
  const permitMaterial = permitFee;
  const materialCost = stainMaterial + prepMaterial + furnitureMaterial
    + mobilizationMaterial + permitMaterial;
  const softCost = travelAndEquipment;

  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);
  const hourShare = (amount) => (totalHours === 0 ? 0 : amount / totalHours * 100);
  const surfaceHours = prepHours + coatHours;
  const surfaceShare = (partSf) => (stainableSf === 0 ? 0 : partSf / stainableSf * surfaceHours);

  const deckSurfaceHours = surfaceShare(deckSqFt);
  const railHours = surfaceShare(railSf);
  const stairHours = surfaceShare(stairSfTotal);

  return {
    prep,
    finish,
    access,
    deckSqFt,
    railLinealFeet,
    railSfPerLf,
    stairRuns,
    stairSf,
    moveFurniture,
    coats,
    railSf,
    stairSfTotal,
    stainableSf,
    stainGallons,
    loadedWage,
    tripHours,
    prepHours,
    coatHours,
    accessHours,
    furnitureHours,
    siteHours,
    deckSurfaceHours,
    railHours,
    stairHours,
    totalHours,
    laborCost,
    stainMaterial,
    prepMaterial,
    furnitureMaterial,
    mobilizationMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerWalkingSf: deckSqFt === 0 ? null : price / deckSqFt,
    pricePerStainableSf: stainableSf === 0 ? null : price / stainableSf,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(tripHours),
      deck: hourShare(deckSurfaceHours),
      rails: hourShare(railHours),
      stairs: hourShare(stairHours),
      access: hourShare(accessHours),
      furniture: hourShare(furnitureHours),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the shop can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this is
 * the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Deck staining') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const prep = PREP_PRESETS.find((item) => item.id === result.prep)?.label ?? result.prep;
  const finish = FINISH_PRESETS.find((item) => item.id === result.finish)?.label ?? result.finish;
  const access = ACCESS_PRESETS.find((item) => item.id === result.access)?.label ?? result.access;
  const extras = [
    `${result.stainableSf.toFixed(0)} sf of stainable surface (${result.deckSqFt} sf walking)`,
    result.railLinealFeet ? `${result.railLinealFeet} lf of rail (${result.railSf.toFixed(0)} sf)` : 'no rail this bid',
    result.stairRuns ? `${result.stairRuns} stair run${result.stairRuns === 1 ? '' : 's'} (${result.stairSfTotal.toFixed(0)} sf)` : 'no stairs this bid',
    `${result.coats} coat${result.coats === 1 ? '' : 's'}`,
    result.access === 'second' ? 'second-story staging included' : null,
    result.moveFurniture ? 'furniture move included' : 'no furniture move this bid',
  ].filter(Boolean);
  return [
    'DECK STAINING BID',
    '',
    `Proposed stain price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${prep}; ${finish}`,
    `Access: ${access}; walking surface: ${result.deckSqFt} sf`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    result.pricePerWalkingSf === null ? null : `Effective: ${money(result.pricePerWalkingSf)} / walking sf`,
    '',
    'SCOPE BASIS',
    `- ${prep}; ${finish}; ${access}`,
    `- ${result.deckSqFt} sf walking + ${result.railSf.toFixed(0)} sf rail + ${result.stairSfTotal.toFixed(0)} sf stairs = ${result.stainableSf.toFixed(0)} sf stainable`,
    `- Setup: ${result.tripHours.toFixed(1)} h; prep: ${result.prepHours.toFixed(1)} h; coats: ${result.coatHours.toFixed(1)} h; rails: ${result.railHours.toFixed(1)} h; stairs: ${result.stairHours.toFixed(1)} h; access: ${result.accessHours.toFixed(1)} h`,
    `- ${extras.join('; ')}`,
    '',
    'This is a draft for review. Confirm the walking surface, rail lineal feet, stairs, prep, finish, access, furniture, and all pricing before sending. It is not a construction specification, a coating warranty, a permit, or an engineering stamp.',
  ].filter((line) => line !== null).join('\n');
}
