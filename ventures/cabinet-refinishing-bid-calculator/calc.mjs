// Pure bid arithmetic for kitchen cabinet refinishing / cabinet painting.
// No network, no state: every piece count, wage, and adder is an input,
// so the result stays a transparent calculation the contractor can check
// against their own invoices rather than a claim about what any kitchen
// "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "price per door" or "price the kitchen" quote treats a 10-door galley
// with eight drawer fronts, a greasy range wall, and new hardware as the
// same job as ten doors sprayed in a booth with the existing pulls left
// on. Drawer fronts, face frames, hardware remove-and-rehang, degrease,
// and a dark-to-light extra coat do not scale with the door count the
// homeowner counts. Matching a cheaper per-door quote written for a
// shop-sprayed same-color job is how a sold kitchen becomes a loss.

// Finish-method labor. These are ballpark figures to start from, NOT an
// industry standard: real hours depend on the spray booth, the masking,
// and how many times the crew walks back to a piece.
export const FINISH_PRESETS = Object.freeze([
  { id: 'shop', label: 'Shop spray (doors off, booth)', laborFactor: 1.0 },
  { id: 'onsite_spray', label: 'On-site spray (containment)', laborFactor: 1.28 },
  { id: 'onsite_brush', label: 'On-site brush / roll', laborFactor: 1.55 },
]);

// Extra finish coats on top of the base two-coat system. Dark-to-light
// is the usual miss: the same door count, a whole extra pass.
export const COLOR_PRESETS = Object.freeze([
  { id: 'same', label: 'Same family / similar value', extraCoats: 0 },
  { id: 'stain_to_paint', label: 'Stain or raw to paint', extraCoats: 0 },
  { id: 'dark_to_light', label: 'Dark to light (extra coat)', extraCoats: 1 },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '10-door / 8-drawer galley, shop spray',
    doors: 10,
    drawers: 8,
    openings: 9,
    hardwarePieces: 38,
    finishId: 'shop',
    colorId: 'same',
    replaceHardware: false,
    degreaseHours: 4,
  },
  {
    label: '20-door / 16-drawer U-kitchen, dark to light',
    doors: 20,
    drawers: 16,
    openings: 18,
    hardwarePieces: 76,
    finishId: 'shop',
    colorId: 'dark_to_light',
    replaceHardware: false,
    degreaseHours: 5,
  },
  {
    label: '30-door / 24-drawer large kitchen, on-site brush',
    doors: 30,
    drawers: 24,
    openings: 26,
    hardwarePieces: 114,
    finishId: 'onsite_brush',
    colorId: 'dark_to_light',
    replaceHardware: true,
    degreaseHours: 6.5,
  },
  {
    label: '6-door / 4-drawer vanity, shop spray',
    doors: 6,
    drawers: 4,
    openings: 5,
    hardwarePieces: 22,
    finishId: 'shop',
    colorId: 'same',
    replaceHardware: false,
    degreaseHours: 1.5,
  },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

export function suggestedLaborFactor(finishId) {
  const preset = FINISH_PRESETS.find((item) => item.id === finishId);
  if (!preset) throw new Error('Unknown finish method');
  return preset.laborFactor;
}

export function suggestedExtraCoats(colorId) {
  const preset = COLOR_PRESETS.find((item) => item.id === colorId);
  if (!preset) throw new Error('Unknown color change');
  return preset.extraCoats;
}

/**
 * Material takeoff units: each door and drawer is one piece; a face-frame
 * opening is a fraction of a piece because it is painted in place and
 * usually uses less film than a removed door.
 */
export function pieceEquivalent(doors, drawers, openings, openingWeight = 0.6) {
  const doorCount = number(doors, 'Doors');
  const drawerCount = number(drawers, 'Drawer fronts');
  const openingCount = number(openings, 'Face-frame openings');
  const weight = number(openingWeight, 'Opening weight');
  return doorCount + drawerCount + openingCount * weight;
}

export function gallonCount(pieceEq, coverage) {
  const pieces = number(pieceEq, 'Piece equivalent');
  const perGallon = number(coverage, 'Coverage', { allowZero: false });
  if (pieces === 0) return 0;
  return Math.ceil(pieces / perGallon);
}

/**
 * Price a cabinet refinishing job from doors, drawer fronts, face frames,
 * hardware, finish method, color change, and the contractor's own costs.
 *
 * @param {object} input
 * @param {number} input.doors
 * @param {number} input.drawers
 * @param {number} input.openings
 * @param {number} input.hardwarePieces
 * @param {number} input.hoursPerDoor
 * @param {number} input.hoursPerDrawer
 * @param {number} input.hoursPerOpening
 * @param {number} input.hoursPerHardware
 * @param {number} input.finishLaborFactor
 * @param {number} input.extraCoats
 * @param {number} input.extraCoatHoursPerPiece
 * @param {number} input.degreaseHours
 * @param {number} input.primerCoverage
 * @param {number} input.finishCoverage
 * @param {number} input.primerCost
 * @param {number} input.finishCost
 * @param {number} input.supplies
 * @param {boolean} input.replaceHardware
 * @param {number} input.hardwareCost
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate
 * @param {number} input.travelAndEquipment
 * @param {number} input.overheadRate
 * @param {number} input.targetMargin
 * @param {number|null} [input.proposedPrice]
 */
export function calculateBid(input) {
  const doors = number(input.doors ?? 0, 'Doors');
  const drawers = number(input.drawers ?? 0, 'Drawer fronts');
  const openings = number(input.openings ?? 0, 'Face-frame openings');
  const hardwarePieces = number(input.hardwarePieces ?? 0, 'Hardware pieces');
  if (doors + drawers + openings === 0) {
    throw new Error('Add at least one door, drawer front, or face-frame opening');
  }

  const hoursPerDoor = number(input.hoursPerDoor ?? 0, 'Hours per door', { allowZero: false });
  const hoursPerDrawer = number(input.hoursPerDrawer ?? 0, 'Hours per drawer front');
  const hoursPerOpening = number(input.hoursPerOpening ?? 0, 'Hours per opening');
  const hoursPerHardware = number(input.hoursPerHardware ?? 0, 'Hours per hardware piece');
  const finishLaborFactor = number(input.finishLaborFactor ?? 0, 'Finish labor factor', { allowZero: false });
  const extraCoats = number(input.extraCoats ?? 0, 'Extra coats');
  const extraCoatHoursPerPiece = number(input.extraCoatHoursPerPiece ?? 0, 'Extra-coat hours per piece');
  const degreaseHours = number(input.degreaseHours ?? 0, 'Degrease hours');
  const primerCoverage = number(input.primerCoverage ?? 0, 'Primer coverage', { allowZero: false });
  const finishCoverage = number(input.finishCoverage ?? 0, 'Finish coverage', { allowZero: false });
  const primerCost = number(input.primerCost ?? 0, 'Primer cost');
  const finishCost = number(input.finishCost ?? 0, 'Finish cost');
  const supplies = number(input.supplies ?? 0, 'Supplies');
  const replaceHardware = Boolean(input.replaceHardware);
  const hardwareCost = number(input.hardwareCost ?? 0, 'New hardware cost');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const pieces = pieceEquivalent(doors, drawers, openings);
  const removablePieces = doors + drawers;
  const primerGallons = gallonCount(pieces, primerCoverage);
  const finishGallons = gallonCount(pieces, finishCoverage);

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  // Finish-method factor applies to the painted pieces, not to hardware
  // bag-and-rehang or degrease. Extra coats apply to removable pieces
  // (doors and drawer fronts) — those are the ones that show a color miss.
  const doorHours = doors * hoursPerDoor * finishLaborFactor;
  const drawerHours = drawers * hoursPerDrawer * finishLaborFactor;
  const openingHours = openings * hoursPerOpening * finishLaborFactor;
  const hardwareHours = hardwarePieces * hoursPerHardware;
  const extraCoatHours = removablePieces * extraCoatHoursPerPiece * extraCoats;
  const totalHours = doorHours + drawerHours + openingHours + hardwareHours + degreaseHours + extraCoatHours;
  const laborCost = totalHours * loadedWage;

  const primerTotal = primerGallons * primerCost;
  const finishTotal = finishGallons * finishCost;
  const hardwareTotal = replaceHardware ? hardwarePieces * hardwareCost : 0;
  const materialCost = primerTotal + finishTotal + supplies + hardwareTotal;
  const softCost = travelAndEquipment;

  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;
  const pieceCount = doors + drawers + openings;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);

  return {
    doors,
    drawers,
    openings,
    hardwarePieces,
    pieces,
    removablePieces,
    pieceCount,
    finishLaborFactor,
    extraCoats,
    primerGallons,
    finishGallons,
    replaceHardware,
    loadedWage,
    doorHours,
    drawerHours,
    openingHours,
    hardwareHours,
    degreaseHours,
    extraCoatHours,
    totalHours,
    laborCost,
    primerTotal,
    finishTotal,
    supplies,
    hardwareTotal,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerDoor: doors === 0 ? null : price / doors,
    pricePerPiece: pieceCount === 0 ? null : price / pieceCount,
    costPerDoor: doors === 0 ? null : totalCost / doors,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    breakEvenPerDoor: doors === 0 ? null : totalCost / doors,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perDoor: doors === 0 ? null : proposedPrice / doors,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the contractor can paste into a
 * proposal. Costs and wages are omitted on purpose — this is the
 * customer-facing side.
 */
export function formatBidSummary(result) {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perDoor = result.pricePerDoor === null ? 'n/a (no doors)' : money(result.pricePerDoor);
  return [
    'CABINET REFINISHING / KITCHEN CABINET PAINTING BID',
    '',
    `Proposed refinish price: ${money(result.price)}`,
    `Scope: ${result.doors} door${result.doors === 1 ? '' : 's'}, ${result.drawers} drawer front${result.drawers === 1 ? '' : 's'}, ${result.openings} face-frame opening${result.openings === 1 ? '' : 's'}`,
    `Price per door (door count only): ${perDoor}`,
    `Price per painted piece: ${money(result.pricePerPiece)}`,
    `Refinish labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- Doors: ${result.doors}`,
    `- Drawer fronts: ${result.drawers}`,
    `- Face-frame openings: ${result.openings}`,
    `- Hardware pieces handled: ${result.hardwarePieces}`,
    `- Primer: ${result.primerGallons} gallon${result.primerGallons === 1 ? '' : 's'}`,
    `- Finish: ${result.finishGallons} gallon${result.finishGallons === 1 ? '' : 's'}`,
    result.extraCoats > 0 ? `- Extra finish coat(s) for color change: ${result.extraCoats}` : '- No extra color-change coat',
    result.replaceHardware ? '- New hardware included in this draft' : '- Existing hardware reinstalled',
    '',
    'This is a draft for review. Confirm piece counts, finish system, color change, degrease, hardware, and all pricing before sending. It is not a paint specification or a guarantee of adhesion.',
  ].join('\n');
}
