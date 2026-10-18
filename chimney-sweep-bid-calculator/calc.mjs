// Pure bid arithmetic for a chimney-sweep / fireplace job. No network, no
// state: every hour, wage, and add-on is an input, so the result stays a
// transparent calculation the sweep can check against their own payroll and
// supply invoices rather than a claim about what any chimney "should" cost
// or whether a flue is safe to use.
//
// The method is the one the trade actually loses money on when they skip it:
// a flat "house sweep" price cannot see that a 3-story wood stove with glazed
// creosote is a different job from a 1-story gas fireplace. Hours come from
// flue type × height × roof access, then inspection, animal, travel, and
// add-ons layer on. That is what separates a defensible quote from a
// neighbourhood special.

export const FLUE_PRESETS = Object.freeze([
  { id: 'wood-fireplace', label: 'Wood-burning fireplace', hoursEach: 1.0 },
  { id: 'wood-stove', label: 'Wood stove / insert', hoursEach: 1.25 },
  { id: 'gas-fireplace', label: 'Gas fireplace', hoursEach: 0.6 },
  { id: 'pellet-stove', label: 'Pellet stove', hoursEach: 0.9 },
  { id: 'furnace-flue', label: 'Furnace / boiler flue', hoursEach: 0.7 },
]);

// Applied to base sweep hours only. Climbing a 3-story with a vacuum and
// rods is not a 1-story job; the extra is height, not "a bigger house".
export const STORY_MULTIPLIERS = Object.freeze({
  1: 1.0,
  2: 1.35,
  3: 1.75,
});

// Extra fraction on every on-site chimney hour. Steep and snow-ice slow
// the whole stop, not just the first climb.
export const ROOF_ACCESS_EXTRA = Object.freeze({
  easy: 0,
  steep: 0.25,
  snow: 0.35,
});

export const CREOSOTE_EXTRA_HOURS = Object.freeze({
  light: 0,
  moderate: 0.25,
  glazed: 0.75,
});

// Extra hours per flue for the inspection that sits on top of the sweep.
// "camera" includes the Level 2 visual plus the camera pass — not a
// CSIA/NFPA determination, just a time budget the sweep can edit.
export const WORK_TYPE_EXTRA_HOURS = Object.freeze({
  sweep: 0,
  level2: 0.5,
  camera: 0.75,
});

export const ADD_ON_PRESETS = Object.freeze([
  { id: 'rainCap', label: 'Rain cap / spark arrestor', hours: 0.4, parts: 45 },
  { id: 'damper', label: 'Damper repair / replacement', hours: 0.5, parts: 35 },
  { id: 'smokeTest', label: 'Smoke / draft test', hours: 0.25, parts: 0 },
]);

export const ANIMAL_HOURS_EACH = 0.6;

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function storyMultiplier(stories) {
  const count = number(stories ?? 1, 'Stories', { min: 1, allowZero: false });
  if (count >= 3) return STORY_MULTIPLIERS[3];
  if (count >= 2) return STORY_MULTIPLIERS[2];
  return STORY_MULTIPLIERS[1];
}

/**
 * Price a chimney-sweep stop from its flues, height, and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, quantity: number, hoursEach: number}>} input.flues
 * @param {number} input.stories
 * @param {'easy'|'steep'|'snow'} input.roofAccess
 * @param {'light'|'moderate'|'glazed'} input.creosote
 * @param {'sweep'|'level2'|'camera'} input.workType
 * @param {boolean} input.animalRemoval
 * @param {Array<{id?: string, label?: string, hours: number, parts: number, enabled?: boolean}>} [input.addOns]
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate
 * @param {number} input.milesOneWay
 * @param {number} input.speedMph
 * @param {number} input.setupHours
 * @param {number} input.minOnSiteHours
 * @param {number} input.tripFee
 * @param {number} input.consumablesPerFlue
 * @param {number} input.chemicalPerGlazedFlue
 * @param {number} input.otherCost
 * @param {number} input.overheadRate
 * @param {number} input.targetMargin
 * @param {number|null} input.proposedPrice
 */
export function calculateBid(input) {
  const fluesInput = Array.isArray(input.flues) ? input.flues : [];
  if (fluesInput.length === 0) throw new Error('Add at least one flue to price');

  const roofAccess = input.roofAccess || 'easy';
  if (!(roofAccess in ROOF_ACCESS_EXTRA)) throw new Error('Roof access must be easy, steep, or snow');
  const creosote = input.creosote || 'light';
  if (!(creosote in CREOSOTE_EXTRA_HOURS)) throw new Error('Creosote must be light, moderate, or glazed');
  const workType = input.workType || 'sweep';
  if (!(workType in WORK_TYPE_EXTRA_HOURS)) throw new Error('Work type must be sweep, level2, or camera');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const milesOneWay = number(input.milesOneWay ?? 0, 'Miles one way');
  const speedMph = number(input.speedMph ?? 0, 'Travel speed', { allowZero: false });
  const setupHours = number(input.setupHours ?? 0, 'Setup hours');
  const minOnSiteHours = number(input.minOnSiteHours ?? 0, 'Minimum on-site hours');
  const tripFee = number(input.tripFee ?? 0, 'Trip / truck fee');
  const consumablesPerFlue = number(input.consumablesPerFlue ?? 0, 'Consumables per flue');
  const chemicalPerGlazedFlue = number(input.chemicalPerGlazedFlue ?? 0, 'Glazed creosote chemical');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const heightMultiplier = storyMultiplier(input.stories);
  const roofExtra = ROOF_ACCESS_EXTRA[roofAccess];
  const creosoteEach = CREOSOTE_EXTRA_HOURS[creosote];
  const workEach = WORK_TYPE_EXTRA_HOURS[workType];
  const animalEach = input.animalRemoval ? ANIMAL_HOURS_EACH : 0;
  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const flues = fluesInput.map((flue, index) => {
    const label = flue.name?.trim() || `Flue ${index + 1}`;
    const quantity = number(flue.quantity ?? 0, `${label}: quantity`);
    const hoursEach = number(flue.hoursEach ?? 0, `${label}: hours each`);
    const baseHours = hoursEach * quantity;
    const heightHours = baseHours * heightMultiplier;
    return {
      name: label,
      quantity,
      hoursEach,
      baseHours,
      heightHours,
      flueShareHours: heightHours,
    };
  });

  const totalFlues = flues.reduce((sum, flue) => sum + flue.quantity, 0);
  const baseHours = flues.reduce((sum, flue) => sum + flue.baseHours, 0);
  const heightHours = flues.reduce((sum, flue) => sum + flue.heightHours, 0);
  const creosoteHours = creosoteEach * totalFlues;
  const inspectionHours = workEach * totalFlues;
  const animalHours = animalEach * totalFlues;

  const addOnsInput = Array.isArray(input.addOns) ? input.addOns : [];
  const addOns = addOnsInput
    .filter(item => item && item.enabled !== false)
    .map((item, index) => {
      const label = item.label?.trim() || item.id || `Add-on ${index + 1}`;
      return {
        id: item.id || `addon-${index + 1}`,
        label,
        hours: number(item.hours ?? 0, `${label}: hours`),
        parts: number(item.parts ?? 0, `${label}: parts`),
      };
    });
  const addOnHours = addOns.reduce((sum, item) => sum + item.hours, 0);
  const addOnParts = addOns.reduce((sum, item) => sum + item.parts, 0);

  const rawOnSite = heightHours + creosoteHours + inspectionHours + animalHours + addOnHours + setupHours;
  const accessedOnSite = rawOnSite * (1 + roofExtra);
  const minimumApplied = accessedOnSite < minOnSiteHours && totalFlues > 0;
  const onSiteHours = minimumApplied ? minOnSiteHours : accessedOnSite;
  const travelHours = (2 * milesOneWay) / speedMph;
  const totalHours = onSiteHours + travelHours;

  const laborCost = totalHours * loadedWage;
  const consumables = totalFlues * consumablesPerFlue;
  const chemical = creosote === 'glazed' ? totalFlues * chemicalPerGlazedFlue : 0;
  const directCost = laborCost + consumables + chemical + addOnParts + tripFee + otherCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    flues: flues.map(flue => ({
      ...flue,
      hoursShare: heightHours === 0 ? 0 : flue.heightHours / heightHours * 100,
    })),
    totalFlues,
    stories: number(input.stories ?? 1, 'Stories', { min: 1, allowZero: false }),
    heightMultiplier,
    roofAccess,
    roofExtra,
    creosote,
    workType,
    animalRemoval: Boolean(input.animalRemoval),
    addOns,
    loadedWage,
    baseHours,
    heightHours,
    creosoteHours,
    inspectionHours,
    animalHours,
    addOnHours,
    addOnParts,
    setupHours,
    rawOnSiteHours: rawOnSite,
    onSiteHours,
    minimumApplied,
    minOnSiteHours,
    travelHours,
    totalHours,
    laborCost,
    consumables,
    chemical,
    tripFee,
    otherCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerFlue: totalFlues === 0 ? null : price / totalFlues,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}
