// Pure bid arithmetic for a residential window-replacement job. No network,
// no state: every opening size, story, tear-out condition, and wage is an
// input, so the result stays a transparent calculation the contractor can
// check against their own unit invoices and payroll rather than a claim about
// what any house "should" cost to re-window.
//
// The method is the one the trade actually loses money on when they skip it:
// a flat price-per-window cannot see United Inches, the second story, or rot.
// A 3040 double-hung (70 UI) is not a 6048 picture window (108 UI), a second-
// floor bedroom is not a first-floor insert, and a rotten sill is a carpentry
// job hiding inside a "window" line. That is what separates a defensible quote
// from a "$550 a window" postcard special.

export const BASE_UI = 70;
export const LARGE_UI = 90;
export const OVERSIZE_UI = 120;
export const LARGE_HOURS_ADD = 0.45;
export const OVERSIZE_HOURS_ADD = 1.1;
export const TRIM_HOURS = 0.35;
export const TRIM_PARTS = 42;
export const DEFAULT_DISPOSAL_PER_OPENING = 18;

export const UNIT_TYPE_PRESETS = Object.freeze([
  { id: 'double-hung', label: 'Double-hung', hours: 1.8, materialBase: 245, uiMaterial: 2.1 },
  { id: 'casement', label: 'Casement', hours: 2.1, materialBase: 310, uiMaterial: 2.6 },
  { id: 'slider', label: 'Horizontal slider', hours: 1.6, materialBase: 230, uiMaterial: 2.0 },
  { id: 'picture', label: 'Picture / fixed', hours: 1.4, materialBase: 210, uiMaterial: 2.8 },
  { id: 'awning', label: 'Awning', hours: 1.9, materialBase: 280, uiMaterial: 2.3 },
  { id: 'hopper', label: 'Hopper / basement', hours: 1.5, materialBase: 195, uiMaterial: 1.7 },
  { id: 'bay', label: 'Bay / bow', hours: 6.5, materialBase: 1650, uiMaterial: 9.5 },
]);

export const FRAME_PRESETS = Object.freeze([
  { id: 'vinyl', label: 'Vinyl', materialMult: 1.0, hoursMult: 1.0 },
  { id: 'fiberglass', label: 'Fiberglass', materialMult: 1.65, hoursMult: 1.05 },
  { id: 'wood', label: 'Wood / clad-wood', materialMult: 2.25, hoursMult: 1.2 },
  { id: 'aluminum', label: 'Aluminum', materialMult: 0.95, hoursMult: 0.95 },
]);

export const INSTALL_PRESETS = Object.freeze([
  { id: 'insert', label: 'Insert / pocket (frame stays)', hoursAdd: 0, materialAdd: 0 },
  { id: 'fullframe', label: 'Full-frame / tear-out to studs', hoursAdd: 1.4, materialAdd: 55 },
  { id: 'newconst', label: 'New-construction nail-fin', hoursAdd: 0.35, materialAdd: 28 },
]);

export const CONDITION_PRESETS = Object.freeze([
  { id: 'clean', label: 'Clean opening, no rot', hoursAdd: 0, parts: 0 },
  { id: 'rot', label: 'Sill / jamb rot repair', hoursAdd: 1.8, parts: 65 },
  { id: 'masonry', label: 'Masonry / brickmold cut-in', hoursAdd: 1.6, parts: 40 },
  { id: 'lead', label: 'Pre-1978 lead-safe work', hoursAdd: 0.9, parts: 48 },
]);

export const ADD_ON_PRESETS = Object.freeze([
  { id: 'interiorCasing', label: 'Interior casing / returns', hoursPerOpening: 0.4, partsPerOpening: 38 },
  { id: 'exteriorCapping', label: 'Exterior vinyl / aluminum capping', hoursPerOpening: 0.25, partsPerOpening: 28 },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function presetById(list, id, fallbackId) {
  return list.find(item => item.id === id) || list.find(item => item.id === fallbackId) || list[0];
}

/** Width + height in inches — the unit the glass shop actually prices. */
export function unitedInches(widthIn, heightIn) {
  return number(widthIn ?? 0, 'Width') + number(heightIn ?? 0, 'Height');
}

/**
 * Extra set-and-flash time once the unit is no longer a stock 3040.
 * These are ballpark starting points, not a manufacturer size chart.
 */
export function sizeHoursAdd(ui) {
  const inches = number(ui ?? 0, 'United inches');
  if (inches > OVERSIZE_UI) return OVERSIZE_HOURS_ADD;
  if (inches > LARGE_UI) return LARGE_HOURS_ADD;
  return 0;
}

/** Extra labor for the ladder, the lift, or the third-floor carry. */
export function storyHoursAdd(story) {
  const level = number(story ?? 1, 'Story', { min: 1, allowZero: false });
  if (level <= 1) return 0;
  if (level === 2) return 0.75;
  return 2.1;
}

/**
 * Price a window-replacement job from its openings and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, type?: string, widthIn: number, heightIn: number, quantity?: number, story?: number, frame?: string, install?: string, condition?: string, trim?: boolean}>} input.openings
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate
 * @param {number} input.milesOneWay
 * @param {number} input.speedMph
 * @param {number} input.setupHours
 * @param {number} input.minOnSiteHours
 * @param {number} input.tripFee
 * @param {number} input.scaffoldingCost
 * @param {number} input.disposalPerOpening
 * @param {number} input.permitCost
 * @param {number} input.otherCost
 * @param {number} input.overheadRate
 * @param {number} input.targetMargin
 * @param {Array<{id?: string, label?: string, hoursPerOpening: number, partsPerOpening: number, enabled?: boolean}>} [input.addOns]
 * @param {number|null} input.proposedPrice
 */
export function calculateBid(input) {
  const openingsInput = Array.isArray(input.openings) ? input.openings : [];
  if (openingsInput.length === 0) throw new Error('Add at least one opening to price');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const milesOneWay = number(input.milesOneWay ?? 0, 'Miles one way');
  const speedMph = number(input.speedMph ?? 0, 'Travel speed', { allowZero: false });
  const setupHours = number(input.setupHours ?? 0, 'Setup hours');
  const minOnSiteHours = number(input.minOnSiteHours ?? 0, 'Minimum on-site hours');
  const tripFee = number(input.tripFee ?? 0, 'Trip / truck fee');
  const scaffoldingCost = number(input.scaffoldingCost ?? 0, 'Scaffolding / lift');
  const disposalPerOpening = number(
    input.disposalPerOpening ?? DEFAULT_DISPOSAL_PER_OPENING,
    'Disposal per opening',
  );
  const permitCost = number(input.permitCost ?? 0, 'Permit');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const openings = openingsInput.map((opening, index) => {
    const label = opening.name?.trim() || `Opening ${index + 1}`;
    const type = presetById(UNIT_TYPE_PRESETS, opening.type, 'double-hung');
    const frame = presetById(FRAME_PRESETS, opening.frame, 'vinyl');
    const install = presetById(INSTALL_PRESETS, opening.install, 'insert');
    const condition = presetById(CONDITION_PRESETS, opening.condition, 'clean');
    const widthIn = number(opening.widthIn ?? 0, `${label}: width`);
    const heightIn = number(opening.heightIn ?? 0, `${label}: height`);
    const quantity = number(opening.quantity ?? 1, `${label}: quantity`);
    const story = number(opening.story ?? 1, `${label}: story`, { min: 1, allowZero: false });
    const trim = Boolean(opening.trim);
    const ui = widthIn + heightIn;
    const sizeAdd = sizeHoursAdd(ui);
    const storyAdd = storyHoursAdd(story);
    const extraUi = Math.max(0, ui - BASE_UI);
    const unitMaterial = (type.materialBase + type.uiMaterial * extraUi) * frame.materialMult
      + install.materialAdd
      + condition.parts
      + (trim ? TRIM_PARTS : 0);
    const unitHours = (type.hours + install.hoursAdd + storyAdd + condition.hoursAdd + sizeAdd) * frame.hoursMult
      + (trim ? TRIM_HOURS : 0);
    return {
      name: label,
      type: type.id,
      typeLabel: type.label,
      frame: frame.id,
      frameLabel: frame.label,
      install: install.id,
      installLabel: install.label,
      condition: condition.id,
      conditionLabel: condition.label,
      widthIn,
      heightIn,
      quantity,
      story,
      trim,
      ui,
      extraUi,
      sizeHoursAdd: sizeAdd,
      storyHoursAdd: storyAdd,
      unitMaterial,
      unitHours,
      material: unitMaterial * quantity,
      hours: unitHours * quantity,
    };
  });

  const openingCount = openings.reduce((sum, row) => sum + row.quantity, 0);
  const installHours = openings.reduce((sum, row) => sum + row.hours, 0);
  const unitMaterial = openings.reduce((sum, row) => sum + row.material, 0);
  const maxStory = openings.reduce((sum, row) => Math.max(sum, row.quantity > 0 ? row.story : 1), 1);
  const needsAccess = openings.some(row => row.quantity > 0 && row.story >= 2);
  const disposal = openingCount * disposalPerOpening;

  const addOnsInput = Array.isArray(input.addOns) ? input.addOns : [];
  const addOns = addOnsInput
    .filter(item => item && item.enabled !== false)
    .map((item, index) => {
      const label = item.label?.trim() || item.id || `Add-on ${index + 1}`;
      const hoursPerOpening = number(item.hoursPerOpening ?? 0, `${label}: hours per opening`);
      const partsPerOpening = number(item.partsPerOpening ?? 0, `${label}: parts per opening`);
      return {
        id: item.id || `addon-${index + 1}`,
        label,
        hoursPerOpening,
        partsPerOpening,
        hours: hoursPerOpening * openingCount,
        parts: partsPerOpening * openingCount,
      };
    });
  const addOnHours = addOns.reduce((sum, item) => sum + item.hours, 0);
  const addOnParts = addOns.reduce((sum, item) => sum + item.parts, 0);

  const rawOnSite = installHours + addOnHours + setupHours;
  const hasScope = openingCount > 0;
  const minimumApplied = rawOnSite < minOnSiteHours && hasScope;
  const onSiteHours = minimumApplied ? minOnSiteHours : rawOnSite;
  const travelHours = (2 * milesOneWay) / speedMph;
  const totalHours = onSiteHours + travelHours;

  const laborCost = totalHours * loadedWage;
  const scaffolding = needsAccess ? scaffoldingCost : 0;
  const directCost = laborCost + unitMaterial + addOnParts + disposal + scaffolding + tripFee + permitCost + otherCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;
  const productiveHours = installHours + addOnHours;

  return {
    openings: openings.map(row => ({
      ...row,
      hoursShare: productiveHours === 0 ? 0 : row.hours / productiveHours * 100,
      materialShare: unitMaterial === 0 ? 0 : row.material / unitMaterial * 100,
    })),
    openingCount,
    maxStory,
    needsAccess,
    loadedWage,
    installHours,
    addOnHours,
    addOnParts,
    addOns,
    unitMaterial,
    disposal,
    scaffolding,
    setupHours,
    rawOnSiteHours: rawOnSite,
    onSiteHours,
    minimumApplied,
    minOnSiteHours,
    travelHours,
    totalHours,
    laborCost,
    tripFee,
    permitCost,
    otherCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerOpening: openingCount === 0 ? null : price / openingCount,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    secondStoryShareOfLabor: productiveHours === 0
      ? null
      : openings
        .filter(row => row.story >= 2)
        .reduce((sum, row) => sum + row.hours, 0) / productiveHours * 100,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      pricePerOpening: openingCount === 0 ? null : proposedPrice / openingCount,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}
