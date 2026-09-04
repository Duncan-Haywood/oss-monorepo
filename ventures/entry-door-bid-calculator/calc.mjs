// Pure bid arithmetic for entry-door *replacement* (not garage doors,
// not window replacement, not a storm-door-only hang). No network, no
// state: every unit, sidelight, rot foot, wage, and storm door is an
// input, so the result stays a transparent calculation the shop can
// check against their own invoices rather than a claim about what any
// opening "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$1,200 installed" steel-entry-door special treats a 36-inch prehung
// steel unit in a square, rot-free one-story opening as the same job as
// a fiberglass unit with two sidelights, a transom, eight feet of jamb
// rot, brickmold, a storm door, and a second-story porch roof. Homeowners
// (and a lot of estimator sheets) count "a door." Sidelights, an out-of-
// square rough opening, rot in the sill, painting, and a storm door do
// not live in that number. Matching a cheaper special written for the
// brochure 36-inch steel hang is how a sold sidelight-and-rot job
// becomes a two-day loss after the first out-of-square shim.
//
// Distinct from garage-door replacement (springs, torsion, opener) and
// from window replacement (united inches, flashing, interior stops).
// This prices a pedestrian entry unit: the door, the lights, the
// opening, and the extras that are not in the coupon.

export const CONFIG_PRESETS = Object.freeze([
  { id: 'single-36', label: '36" single prehung' },
  { id: 'single-42', label: '42" single prehung' },
  { id: 'double', label: 'Double / 6-foot pair' },
  { id: 'sidelite-one', label: '36" + one sidelight' },
  { id: 'sidelite-two', label: '36" + two sidelights' },
]);

export const MATERIAL_PRESETS = Object.freeze([
  { id: 'steel', label: 'Steel' },
  { id: 'fiberglass', label: 'Fiberglass' },
  { id: 'wood', label: 'Wood / stain-grade' },
]);

export const HANG_PRESETS = Object.freeze([
  { id: 'prehung', label: 'Full prehung unit' },
  { id: 'slab', label: 'Slab only (existing jamb)' },
]);

export const STORY_PRESETS = Object.freeze([
  { id: 'one', label: 'One story / ground porch' },
  { id: 'two', label: 'Second-story / hard access' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '36" steel prehung, square opening, one story (the $1,200 installed special)',
    config: 'single-36',
    material: 'steel',
    hangStyle: 'prehung',
    stories: 'one',
    rotFeet: 0,
    outOfSquare: false,
    addTransom: false,
    addBrickmold: false,
    addStormDoor: false,
    addSmartLock: false,
    addPaint: false,
    tearOut: true,
  },
  {
    label: '36" steel prehung, tear-out, paint, one story',
    config: 'single-36',
    material: 'steel',
    hangStyle: 'prehung',
    stories: 'one',
    rotFeet: 0,
    outOfSquare: false,
    addTransom: false,
    addBrickmold: false,
    addStormDoor: false,
    addSmartLock: false,
    addPaint: true,
    tearOut: true,
  },
  {
    label: 'Fiberglass + two sidelights + transom, 8 ft rot, brickmold, storm, paint, 2nd-story porch',
    config: 'sidelite-two',
    material: 'fiberglass',
    hangStyle: 'prehung',
    stories: 'two',
    rotFeet: 8,
    outOfSquare: true,
    addTransom: true,
    addBrickmold: true,
    addStormDoor: true,
    addSmartLock: true,
    addPaint: true,
    tearOut: true,
  },
  {
    label: 'Wood stain-grade 36", 4 ft rot, out-of-square, paint, tear-out',
    config: 'single-36',
    material: 'wood',
    hangStyle: 'prehung',
    stories: 'one',
    rotFeet: 4,
    outOfSquare: true,
    addTransom: false,
    addBrickmold: true,
    addStormDoor: false,
    addSmartLock: false,
    addPaint: true,
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
 * Starting hang hours, paint hours, and unit-cost multiplier from the
 * opening. These are ballpark shop figures, not a catalog. Picking a
 * config never overwrites a cost the shop has already typed.
 */
export function suggestedConfigKit(config) {
  const id = String(config);
  if (id === 'single-36') {
    return { hoursHang: 2.5, hoursPaint: 2.0, unitCostMultiplier: 1 };
  }
  if (id === 'single-42') {
    return { hoursHang: 3.1, hoursPaint: 2.3, unitCostMultiplier: 1.15 };
  }
  if (id === 'double') {
    return { hoursHang: 4.8, hoursPaint: 3.6, unitCostMultiplier: 1.95 };
  }
  if (id === 'sidelite-one') {
    return { hoursHang: 3.8, hoursPaint: 2.9, unitCostMultiplier: 1.55 };
  }
  if (id === 'sidelite-two') {
    return { hoursHang: 4.6, hoursPaint: 3.4, unitCostMultiplier: 2.15 };
  }
  throw new Error('Unknown door configuration');
}

/**
 * Starting unit cost and hang-hour premium from the skin.
 */
export function suggestedMaterialKit(material) {
  const id = String(material);
  if (id === 'steel') return { unitCost: 420, hoursHangPremium: 0 };
  if (id === 'fiberglass') return { unitCost: 980, hoursHangPremium: 0.3 };
  if (id === 'wood') return { unitCost: 1680, hoursHangPremium: 0.55 };
  throw new Error('Unknown door material');
}

/**
 * Slab-only hangs the leaf in an existing jamb. Hang hours and the
 * unit cost drop; rot and brickmold still apply to the opening.
 */
export function suggestedHangStyleKit(hangStyle) {
  const id = String(hangStyle);
  if (id === 'prehung') return { hangHourFactor: 1, unitCostFactor: 1 };
  if (id === 'slab') return { hangHourFactor: 0.48, unitCostFactor: 0.42 };
  throw new Error('Unknown hang style');
}

/**
 * Starting story hours. A ground-porch hang is not a second-story
 * porch roof.
 */
export function suggestedStoryKit(stories) {
  const id = String(stories);
  if (id === 'one') return { hoursStory: 0 };
  if (id === 'two') return { hoursStory: 0.9 };
  throw new Error('Unknown story count');
}

/**
 * Price an entry-door replacement from the opening, the extras past a
 * brochure 36-inch steel hang, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const rotFeet = number(input.rotFeet ?? 0, 'Rot footage');

  const config = String(input.config ?? 'single-36');
  if (!CONFIG_PRESETS.some((item) => item.id === config)) {
    throw new Error('Unknown door configuration');
  }
  const material = String(input.material ?? 'steel');
  if (!MATERIAL_PRESETS.some((item) => item.id === material)) {
    throw new Error('Unknown door material');
  }
  const hangStyle = String(input.hangStyle ?? 'prehung');
  if (!HANG_PRESETS.some((item) => item.id === hangStyle)) {
    throw new Error('Unknown hang style');
  }
  const stories = String(input.stories ?? 'one');
  if (!STORY_PRESETS.some((item) => item.id === stories)) {
    throw new Error('Unknown story count');
  }

  const outOfSquare = flag(input.outOfSquare);
  const addTransom = flag(input.addTransom);
  const addBrickmold = flag(input.addBrickmold);
  const addStormDoor = flag(input.addStormDoor);
  const addSmartLock = flag(input.addSmartLock);
  const addPaint = flag(input.addPaint);
  const tearOut = flag(input.tearOut);

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursHang = number(input.hoursHang ?? 0, 'Hours to hang the unit');
  const hoursHangPremium = number(input.hoursHangPremium ?? 0, 'Material hang-hour premium');
  const hangHourFactor = number(input.hangHourFactor ?? 1, 'Hang-hour factor');
  const hoursStory = number(input.hoursStory ?? 0, 'Second-story hours');
  const hoursOutOfSquare = number(input.hoursOutOfSquare ?? 0, 'Hours for an out-of-square opening');
  const hoursPerRotFoot = number(input.hoursPerRotFoot ?? 0, 'Hours per rot foot');
  const hoursTransom = number(input.hoursTransom ?? 0, 'Hours for a transom');
  const hoursBrickmold = number(input.hoursBrickmold ?? 0, 'Hours for brickmold');
  const hoursStormDoor = number(input.hoursStormDoor ?? 0, 'Hours for a storm door');
  const hoursSmartLock = number(input.hoursSmartLock ?? 0, 'Hours for lock / smart-lock prep');
  const hoursPaint = number(input.hoursPaint ?? 0, 'Hours to paint or stain');
  const hoursTearOut = number(input.hoursTearOut ?? 0, 'Hours to tear out the old unit');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const unitCost = number(input.unitCost ?? 0, 'Door unit cost');
  const unitCostMultiplier = number(input.unitCostMultiplier ?? 1, 'Unit-cost multiplier');
  const unitCostFactor = number(input.unitCostFactor ?? 1, 'Hang-style unit-cost factor');
  const transomCost = number(input.transomCost ?? 0, 'Transom');
  const brickmoldCost = number(input.brickmoldCost ?? 0, 'Brickmold');
  const stormDoorCost = number(input.stormDoorCost ?? 0, 'Storm door');
  const lockCost = number(input.lockCost ?? 0, 'Lock / smart lock');
  const paintMaterial = number(input.paintMaterial ?? 0, 'Paint / stain material');
  const rotPerFoot = number(input.rotPerFoot ?? 0, 'Rot repair per foot');
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
  const hangHours = (hoursHang + hoursHangPremium) * hangHourFactor;
  const storyHours = hoursStory;
  const openingHours = (outOfSquare ? hoursOutOfSquare : 0) + rotFeet * hoursPerRotFoot;
  const packageHours = (addTransom ? hoursTransom : 0)
    + (addBrickmold ? hoursBrickmold : 0)
    + (addStormDoor ? hoursStormDoor : 0)
    + (addSmartLock ? hoursSmartLock : 0)
    + (addPaint ? hoursPaint : 0)
    + (tearOut ? hoursTearOut : 0);
  const totalHours = tripHours + hangHours + storyHours + openingHours + packageHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const doorMaterial = unitCost * unitCostMultiplier * unitCostFactor;
  const transomMaterial = addTransom ? transomCost : 0;
  const brickmoldMaterial = addBrickmold ? brickmoldCost : 0;
  const stormMaterial = addStormDoor ? stormDoorCost : 0;
  const lockMaterial = addSmartLock ? lockCost : 0;
  const paintMat = addPaint ? paintMaterial : 0;
  const rotMaterial = rotFeet * rotPerFoot;
  const dumpMaterial = tearOut ? dumpFee : 0;
  const permitMaterial = permitFee;
  const materialCost = doorMaterial + transomMaterial + brickmoldMaterial + stormMaterial
    + lockMaterial + paintMat + rotMaterial + dumpMaterial + permitMaterial;
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
    material,
    hangStyle,
    stories,
    rotFeet,
    outOfSquare,
    addTransom,
    addBrickmold,
    addStormDoor,
    addSmartLock,
    addPaint,
    tearOut,
    loadedWage,
    tripHours,
    hangHours,
    storyHours,
    openingHours,
    packageHours,
    siteHours,
    totalHours,
    laborCost,
    doorMaterial,
    transomMaterial,
    brickmoldMaterial,
    stormMaterial,
    lockMaterial,
    paintMat,
    rotMaterial,
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
      hang: hourShare(hangHours),
      access: hourShare(storyHours),
      opening: hourShare(openingHours),
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
export function formatBidSummary(result, jobLabel = 'Entry door replacement') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const config = CONFIG_PRESETS.find((item) => item.id === result.config)?.label ?? result.config;
  const material = MATERIAL_PRESETS.find((item) => item.id === result.material)?.label ?? result.material;
  const hang = HANG_PRESETS.find((item) => item.id === result.hangStyle)?.label ?? result.hangStyle;
  const stories = STORY_PRESETS.find((item) => item.id === result.stories)?.label ?? result.stories;
  const extras = [
    result.outOfSquare ? 'out-of-square opening shim / plane' : null,
    result.rotFeet ? `${result.rotFeet} ft of jamb / sill rot repair` : null,
    result.addTransom ? 'transom included' : null,
    result.addBrickmold ? 'brickmold / exterior trim included' : null,
    result.addStormDoor ? 'storm door included' : null,
    result.addSmartLock ? 'lock / smart-lock prep included' : null,
    result.addPaint ? 'paint / stain included' : null,
    result.tearOut ? 'tear-out of the old unit included' : 'no tear-out this bid',
  ].filter(Boolean);
  return [
    'ENTRY DOOR REPLACEMENT BID',
    '',
    `Proposed entry-door price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${config}; ${material}; ${hang}`,
    `Access: ${stories}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${config}; ${material}; ${hang}; ${stories}`,
    `- Hang labor: ${result.hangHours.toFixed(1)} h; stories / access: ${result.storyHours.toFixed(1)} h; opening (square / rot): ${result.openingHours.toFixed(1)} h; extras: ${result.packageHours.toFixed(1)} h`,
    `- ${extras.join('; ') || 'standard brochure hang'}`,
    '',
    'This is a draft for review. Confirm the opening, the unit, rot, trim, storm door, finish, and all pricing before sending. It is not a door design, a building-code determination, a permit, or an engineering stamp.',
  ].join('\n');
}
