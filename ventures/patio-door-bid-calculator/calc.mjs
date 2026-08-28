// Pure bid arithmetic for sliding-glass / patio-door *replacement*
// (not a pedestrian entry door, not a window replacement, not a
// garage door). No network, no state: every panel, frame, glazing,
// wage, and extra is an input, so the result stays a transparent
// calculation the shop can check against their own invoices rather
// than a claim about what any opening "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$1,800 installed" 6-foot vinyl 2-panel special treats a ground-
// floor retrofit pocket replacement as the same job as a 16-foot
// 4-panel impact-rated new-construction unit with a transom, a new
// sill pan, interior trim, and second-story balcony access.
// Homeowners (and a lot of estimator sheets) count "a patio door."
// Extra panels, impact glass, a full-frame new-construction wrap,
// a transom, and a balcony do not live in that number. Matching a
// cheaper special written for the brochure 6-foot vinyl hang is how
// a sold 4-panel impact balcony job becomes a two-day loss after
// the first sill-pan rebuild.
//
// Distinct from entry-door replacement (prehung, sidelights, jamb
// rot, storm door) and from window replacement (united inches,
// flashing, interior stops). This prices a sliding or patio unit:
// the panels, the glass, the install method, and the extras that
// are not in the coupon.

export const CONFIG_PRESETS = Object.freeze([
  { id: 'two-6', label: '6-foot 2-panel' },
  { id: 'two-8', label: '8-foot 2-panel' },
  { id: 'three-9', label: '9-foot 3-panel' },
  { id: 'three-12', label: '12-foot 3-panel' },
  { id: 'four-12', label: '12-foot 4-panel' },
  { id: 'four-16', label: '16-foot 4-panel' },
]);

export const FRAME_PRESETS = Object.freeze([
  { id: 'vinyl', label: 'Vinyl' },
  { id: 'aluminum', label: 'Aluminum' },
  { id: 'fiberglass', label: 'Fiberglass' },
  { id: 'wood-clad', label: 'Wood-clad' },
]);

export const GLAZING_PRESETS = Object.freeze([
  { id: 'dual', label: 'Dual-pane Low-E' },
  { id: 'triple', label: 'Triple-pane' },
  { id: 'impact', label: 'Impact / hurricane' },
]);

export const INSTALL_PRESETS = Object.freeze([
  { id: 'retrofit', label: 'Retrofit / pocket (existing frame)' },
  { id: 'newcon', label: 'New-construction (full frame + wrap)' },
]);

export const ACCESS_PRESETS = Object.freeze([
  { id: 'ground', label: 'Ground patio' },
  { id: 'balcony', label: 'Second-story balcony' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '6-ft vinyl 2-panel, dual-pane, retrofit, ground (the $1,800 installed special)',
    config: 'two-6',
    frame: 'vinyl',
    glazing: 'dual',
    install: 'retrofit',
    access: 'ground',
    addScreen: false,
    addTransom: false,
    addInteriorTrim: false,
    addSillPan: false,
    addThreshold: false,
    tearOut: true,
  },
  {
    label: '6-ft vinyl 2-panel, dual-pane, retrofit, tear-out, screen, interior trim',
    config: 'two-6',
    frame: 'vinyl',
    glazing: 'dual',
    install: 'retrofit',
    access: 'ground',
    addScreen: true,
    addTransom: false,
    addInteriorTrim: true,
    addSillPan: false,
    addThreshold: false,
    tearOut: true,
  },
  {
    label: '16-ft 4-panel fiberglass, impact glass, new-construction, transom, sill pan, balcony',
    config: 'four-16',
    frame: 'fiberglass',
    glazing: 'impact',
    install: 'newcon',
    access: 'balcony',
    addScreen: true,
    addTransom: true,
    addInteriorTrim: true,
    addSillPan: true,
    addThreshold: true,
    tearOut: true,
  },
  {
    label: '12-ft 3-panel vinyl, triple-pane, new-construction, screen, sill pan, ground',
    config: 'three-12',
    frame: 'vinyl',
    glazing: 'triple',
    install: 'newcon',
    access: 'ground',
    addScreen: true,
    addTransom: false,
    addInteriorTrim: true,
    addSillPan: true,
    addThreshold: false,
    tearOut: true,
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
 * Starting set hours, interior-trim hours, and unit-cost multiplier
 * from the panel configuration. These are ballpark shop figures, not
 * a catalog. Picking a config never overwrites a cost the shop has
 * already typed.
 */
export function suggestedConfigKit(config) {
  const id = String(config);
  if (id === 'two-6') {
    return { hoursSet: 4.5, hoursInteriorTrim: 1.2, unitCostMultiplier: 1 };
  }
  if (id === 'two-8') {
    return { hoursSet: 5.4, hoursInteriorTrim: 1.4, unitCostMultiplier: 1.22 };
  }
  if (id === 'three-9') {
    return { hoursSet: 7.2, hoursInteriorTrim: 1.8, unitCostMultiplier: 1.75 };
  }
  if (id === 'three-12') {
    return { hoursSet: 8.6, hoursInteriorTrim: 2.1, unitCostMultiplier: 2.15 };
  }
  if (id === 'four-12') {
    return { hoursSet: 9.8, hoursInteriorTrim: 2.4, unitCostMultiplier: 2.45 };
  }
  if (id === 'four-16') {
    return { hoursSet: 11.5, hoursInteriorTrim: 2.8, unitCostMultiplier: 3.05 };
  }
  throw new Error('Unknown patio-door configuration');
}

/**
 * Starting unit cost and set-hour premium from the frame.
 */
export function suggestedFrameKit(frame) {
  const id = String(frame);
  if (id === 'vinyl') return { unitCost: 980, hoursSetPremium: 0 };
  if (id === 'aluminum') return { unitCost: 1420, hoursSetPremium: 0.35 };
  if (id === 'fiberglass') return { unitCost: 2100, hoursSetPremium: 0.55 };
  if (id === 'wood-clad') return { unitCost: 3200, hoursSetPremium: 0.85 };
  throw new Error('Unknown patio-door frame');
}

/**
 * Starting unit-cost factor and set-hour premium from the glass.
 */
export function suggestedGlazingKit(glazing) {
  const id = String(glazing);
  if (id === 'dual') return { glazingCostFactor: 1, hoursGlazingPremium: 0 };
  if (id === 'triple') return { glazingCostFactor: 1.28, hoursGlazingPremium: 0.25 };
  if (id === 'impact') return { glazingCostFactor: 1.65, hoursGlazingPremium: 0.7 };
  throw new Error('Unknown patio-door glazing');
}

/**
 * Retrofit pockets the new unit in the existing frame. New-
 * construction is a full-frame wrap: flashing, sill pan, and
 * exterior wrap hours sit on top of the set.
 */
export function suggestedInstallKit(install) {
  const id = String(install);
  if (id === 'retrofit') return { setHourFactor: 1, hoursNewcon: 0 };
  if (id === 'newcon') return { setHourFactor: 1.35, hoursNewcon: 2.8 };
  throw new Error('Unknown patio-door install method');
}

/**
 * Starting access hours. A ground patio set is not a second-story
 * balcony hoist.
 */
export function suggestedAccessKit(access) {
  const id = String(access);
  if (id === 'ground') return { hoursAccess: 0 };
  if (id === 'balcony') return { hoursAccess: 1.8 };
  throw new Error('Unknown patio-door access');
}

/**
 * Price a sliding / patio-door replacement from the panels, the
 * extras past a brochure 6-foot vinyl hang, and the contractor's
 * own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const config = String(input.config ?? 'two-6');
  if (!CONFIG_PRESETS.some((item) => item.id === config)) {
    throw new Error('Unknown patio-door configuration');
  }
  const frame = String(input.frame ?? 'vinyl');
  if (!FRAME_PRESETS.some((item) => item.id === frame)) {
    throw new Error('Unknown patio-door frame');
  }
  const glazing = String(input.glazing ?? 'dual');
  if (!GLAZING_PRESETS.some((item) => item.id === glazing)) {
    throw new Error('Unknown patio-door glazing');
  }
  const install = String(input.install ?? 'retrofit');
  if (!INSTALL_PRESETS.some((item) => item.id === install)) {
    throw new Error('Unknown patio-door install method');
  }
  const access = String(input.access ?? 'ground');
  if (!ACCESS_PRESETS.some((item) => item.id === access)) {
    throw new Error('Unknown patio-door access');
  }

  const addScreen = flag(input.addScreen);
  const addTransom = flag(input.addTransom);
  const addInteriorTrim = flag(input.addInteriorTrim);
  const addSillPan = flag(input.addSillPan);
  const addThreshold = flag(input.addThreshold);
  const tearOut = flag(input.tearOut);

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursSet = number(input.hoursSet ?? 0, 'Hours to set the unit');
  const hoursSetPremium = number(input.hoursSetPremium ?? 0, 'Frame set-hour premium');
  const hoursGlazingPremium = number(input.hoursGlazingPremium ?? 0, 'Glazing set-hour premium');
  const setHourFactor = number(input.setHourFactor ?? 1, 'Set-hour factor');
  const hoursNewcon = number(input.hoursNewcon ?? 0, 'New-construction wrap hours');
  const hoursAccess = number(input.hoursAccess ?? 0, 'Balcony / access hours');
  const hoursScreen = number(input.hoursScreen ?? 0, 'Hours for a screen');
  const hoursTransom = number(input.hoursTransom ?? 0, 'Hours for a transom');
  const hoursInteriorTrim = number(input.hoursInteriorTrim ?? 0, 'Hours for interior trim');
  const hoursSillPan = number(input.hoursSillPan ?? 0, 'Hours for a sill pan / flashing');
  const hoursThreshold = number(input.hoursThreshold ?? 0, 'Hours for a threshold rebuild');
  const hoursTearOut = number(input.hoursTearOut ?? 0, 'Hours to tear out the old unit');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const unitCost = number(input.unitCost ?? 0, 'Patio-door unit cost');
  const unitCostMultiplier = number(input.unitCostMultiplier ?? 1, 'Unit-cost multiplier');
  const glazingCostFactor = number(input.glazingCostFactor ?? 1, 'Glazing cost factor');
  const screenCost = number(input.screenCost ?? 0, 'Screen');
  const transomCost = number(input.transomCost ?? 0, 'Transom');
  const trimCost = number(input.trimCost ?? 0, 'Interior trim');
  const sillPanCost = number(input.sillPanCost ?? 0, 'Sill pan / flashing');
  const thresholdCost = number(input.thresholdCost ?? 0, 'Threshold rebuild');
  const dumpFee = number(input.dumpFee ?? 0, 'Dump / haul-away');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const tripHours = hoursTrip;
  const setHours = (hoursSet + hoursSetPremium + hoursGlazingPremium) * setHourFactor;
  const wrapHours = hoursNewcon;
  const accessHours = hoursAccess;
  const packageHours = (addScreen ? hoursScreen : 0)
    + (addTransom ? hoursTransom : 0)
    + (addInteriorTrim ? hoursInteriorTrim : 0)
    + (addSillPan ? hoursSillPan : 0)
    + (addThreshold ? hoursThreshold : 0)
    + (tearOut ? hoursTearOut : 0);
  const totalHours = tripHours + setHours + wrapHours + accessHours + packageHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const doorMaterial = unitCost * unitCostMultiplier * glazingCostFactor;
  const screenMaterial = addScreen ? screenCost : 0;
  const transomMaterial = addTransom ? transomCost : 0;
  const trimMaterial = addInteriorTrim ? trimCost : 0;
  const sillMaterial = addSillPan ? sillPanCost : 0;
  const thresholdMaterial = addThreshold ? thresholdCost : 0;
  const dumpMaterial = tearOut ? dumpFee : 0;
  const permitMaterial = permitFee;
  const materialCost = doorMaterial + screenMaterial + transomMaterial + trimMaterial
    + sillMaterial + thresholdMaterial + dumpMaterial + permitMaterial;
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

  return {
    config,
    frame,
    glazing,
    install,
    access,
    addScreen,
    addTransom,
    addInteriorTrim,
    addSillPan,
    addThreshold,
    tearOut,
    loadedWage,
    tripHours,
    setHours,
    wrapHours,
    accessHours,
    packageHours,
    siteHours,
    totalHours,
    laborCost,
    doorMaterial,
    screenMaterial,
    transomMaterial,
    trimMaterial,
    sillMaterial,
    thresholdMaterial,
    dumpMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerDoor: price,
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
      set: hourShare(setHours),
      wrap: hourShare(wrapHours),
      access: hourShare(accessHours),
      extras: hourShare(packageHours),
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
export function formatBidSummary(result, jobLabel = 'Patio door replacement') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const config = CONFIG_PRESETS.find((item) => item.id === result.config)?.label ?? result.config;
  const frame = FRAME_PRESETS.find((item) => item.id === result.frame)?.label ?? result.frame;
  const glazing = GLAZING_PRESETS.find((item) => item.id === result.glazing)?.label ?? result.glazing;
  const install = INSTALL_PRESETS.find((item) => item.id === result.install)?.label ?? result.install;
  const access = ACCESS_PRESETS.find((item) => item.id === result.access)?.label ?? result.access;
  const extras = [
    result.addScreen ? 'rolling screen included' : null,
    result.addTransom ? 'transom included' : null,
    result.addInteriorTrim ? 'interior trim included' : null,
    result.addSillPan ? 'sill pan / exterior flashing included' : null,
    result.addThreshold ? 'threshold / sill rebuild included' : null,
    result.tearOut ? 'tear-out of the old unit included' : 'no tear-out this bid',
  ].filter(Boolean);
  return [
    'PATIO / SLIDING GLASS DOOR REPLACEMENT BID',
    '',
    `Proposed patio-door price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${config}; ${frame}; ${glazing}`,
    `Install: ${install}; access: ${access}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${config}; ${frame}; ${glazing}; ${install}; ${access}`,
    `- Set labor: ${result.setHours.toFixed(1)} h; new-construction wrap: ${result.wrapHours.toFixed(1)} h; access: ${result.accessHours.toFixed(1)} h; extras: ${result.packageHours.toFixed(1)} h`,
    `- ${extras.join('; ') || 'standard brochure hang'}`,
    '',
    'This is a draft for review. Confirm the opening, the unit, glass, install method, flashing, trim, and all pricing before sending. It is not a door design, a building-code determination, a permit, or an engineering stamp.',
  ].join('\n');
}
