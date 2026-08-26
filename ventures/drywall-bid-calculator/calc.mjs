// Pure bid arithmetic for a residential drywall hang-and-finish job. No
// network, no state: every room, finish level, wage, and waste factor is an
// input, so the result stays a transparent calculation the contractor can
// check against their own sheet invoices and payroll rather than a claim
// about what any room "should" cost or whether a wall is fire-rated.
//
// The method is the one the trade actually loses money on when they skip it:
// a flat price-per-square-foot cannot see that hanging is the cheap half.
// Gypsum Association finish levels 0–5 and texture are different jobs from
// the same hang. Rooms with 12-ft ceilings, lots of openings, and a Level 5
// skim are not a basement hang-and-texture special. Sheets come from net
// area plus waste, then hang, tape, finish, texture, height, tear-out, and
// openings layer on. That is what separates a defensible quote from a
// "$1.50 a foot" neighborhood special.

export const BOARD_PRESETS = Object.freeze([
  { id: 'half-4x8', label: '1/2" regular 4×8', wastePercent: 10, hangHoursPer100: 1.15, materialPer100: 48, sheetSqFt: 32, tapeLfPerSqFt: 0.42 },
  { id: 'typex-4x8', label: '5/8" Type X 4×8', wastePercent: 12, hangHoursPer100: 1.45, materialPer100: 68, sheetSqFt: 32, tapeLfPerSqFt: 0.42 },
  { id: 'green-4x8', label: 'Moisture-resistant 4×8', wastePercent: 12, hangHoursPer100: 1.3, materialPer100: 64, sheetSqFt: 32, tapeLfPerSqFt: 0.42 },
  { id: 'half-4x12', label: '1/2" regular 4×12', wastePercent: 8, hangHoursPer100: 1.0, materialPer100: 56, sheetSqFt: 48, tapeLfPerSqFt: 0.32 },
]);

// Finish hours per 100 sq ft of hung surface. Level 0 is hang-only; Level 4
// is the usual paint-ready residential job; Level 5 is a full skim for
// critical lighting. These are ballpark starting points, not a Gypsum
// Association production table or a guarantee.
export const FINISH_LEVELS = Object.freeze([
  { level: 0, label: '0 — hang only', hoursPer100: 0, mudPer100: 4 },
  { level: 1, label: '1 — fire-tape / joints covered', hoursPer100: 0.85, mudPer100: 10 },
  { level: 2, label: '2 — thin coat (under tile)', hoursPer100: 1.4, mudPer100: 16 },
  { level: 3, label: '3 — two coats (heavy texture)', hoursPer100: 2.2, mudPer100: 22 },
  { level: 4, label: '4 — paint-ready (most houses)', hoursPer100: 3.6, mudPer100: 30 },
  { level: 5, label: '5 — full skim / critical lighting', hoursPer100: 5.8, mudPer100: 48 },
]);

export const TEXTURE_PRESETS = Object.freeze([
  { id: 'none', label: 'Smooth (no texture)', hoursPer100: 0, materialPer100: 0 },
  { id: 'orange-peel', label: 'Orange peel', hoursPer100: 0.55, materialPer100: 8 },
  { id: 'knockdown', label: 'Knockdown', hoursPer100: 0.85, materialPer100: 11 },
  { id: 'skip-trowel', label: 'Skip trowel', hoursPer100: 1.2, materialPer100: 14 },
]);

export const ADD_ON_PRESETS = Object.freeze([
  { id: 'stilts', label: 'Stilts / scaffold for this job', hours: 2.5, parts: 120 },
  { id: 'cornerBead', label: 'Corner bead beyond a typical takeoff', hours: 2, parts: 85 },
]);

export const HOURS_PER_OPENING = 0.28;
export const TAPE_LF_PER_OPENING = 18;
export const TEAR_OFF_HOURS_PER_100 = 1.6;
export const TAPE_MATERIAL_PER_LF = 0.09;

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

export function heightMultiplier(heightFt) {
  const height = number(heightFt ?? 8, 'Ceiling height');
  if (height > 12) return 1.7;
  if (height > 10) return 1.4;
  if (height > 8) return 1.15;
  return 1.0;
}

function finishSpec(level) {
  const parsed = number(level ?? 4, 'Finish level');
  const spec = FINISH_LEVELS.find(item => item.level === parsed);
  if (!spec) throw new Error('Finish level must be an integer from 0 to 5');
  return spec;
}

/**
 * Price a drywall job from its rooms, finish level, and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, lengthFt: number, widthFt: number, heightFt: number, includeCeiling?: boolean}>} input.rooms
 * @param {number} input.openingSqFt
 * @param {number} input.openingCount
 * @param {number} input.wastePercent
 * @param {number} input.hangHoursPer100
 * @param {number} input.materialPer100
 * @param {number} input.sheetSqFt
 * @param {number} input.tapeLfPerSqFt
 * @param {number} input.finishLevel
 * @param {number} input.textureHoursPer100
 * @param {number} input.textureMaterialPer100
 * @param {boolean} input.tearOff
 * @param {number} input.tearOffHoursPer100
 * @param {Array<{id?: string, label?: string, hours: number, parts: number, enabled?: boolean}>} [input.addOns]
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate
 * @param {number} input.milesOneWay
 * @param {number} input.speedMph
 * @param {number} input.setupHours
 * @param {number} input.minOnSiteHours
 * @param {number} input.tripFee
 * @param {number} input.dumpsterCost
 * @param {number} input.otherCost
 * @param {number} input.overheadRate
 * @param {number} input.targetMargin
 * @param {number|null} input.proposedPrice
 */
export function calculateBid(input) {
  const roomsInput = Array.isArray(input.rooms) ? input.rooms : [];
  if (roomsInput.length === 0) throw new Error('Add at least one room to price');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const milesOneWay = number(input.milesOneWay ?? 0, 'Miles one way');
  const speedMph = number(input.speedMph ?? 0, 'Travel speed', { allowZero: false });
  const setupHours = number(input.setupHours ?? 0, 'Setup hours');
  const minOnSiteHours = number(input.minOnSiteHours ?? 0, 'Minimum on-site hours');
  const tripFee = number(input.tripFee ?? 0, 'Trip / truck fee');
  const dumpsterCost = number(input.dumpsterCost ?? 0, 'Dumpster');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const openingSqFt = number(input.openingSqFt ?? 0, 'Opening square feet');
  const openingCount = number(input.openingCount ?? 0, 'Opening count');
  const wastePercent = number(input.wastePercent ?? 0, 'Waste');
  const hangHoursPer100 = number(input.hangHoursPer100 ?? 0, 'Hang hours per 100 sq ft');
  const materialPer100 = number(input.materialPer100 ?? 0, 'Board material per 100 sq ft');
  const sheetSqFt = number(input.sheetSqFt ?? 32, 'Sheet size', { min: 1, allowZero: false });
  const tapeLfPerSqFt = number(input.tapeLfPerSqFt ?? 0, 'Tape feet per sq ft');
  const textureHoursPer100 = number(input.textureHoursPer100 ?? 0, 'Texture hours per 100 sq ft');
  const textureMaterialPer100 = number(input.textureMaterialPer100 ?? 0, 'Texture material per 100 sq ft');
  const tearOffHoursPer100 = number(input.tearOffHoursPer100 ?? TEAR_OFF_HOURS_PER_100, 'Tear-out hours per 100 sq ft');
  const finish = finishSpec(input.finishLevel);
  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const tearOff = Boolean(input.tearOff);

  const rooms = roomsInput.map((room, index) => {
    const label = room.name?.trim() || `Room ${index + 1}`;
    const lengthFt = number(room.lengthFt ?? 0, `${label}: length`);
    const widthFt = number(room.widthFt ?? 0, `${label}: width`);
    const heightFt = number(room.heightFt ?? 0, `${label}: height`);
    const includeCeiling = room.includeCeiling !== false;
    const wallSqFt = 2 * (lengthFt + widthFt) * heightFt;
    const ceilingSqFt = includeCeiling ? lengthFt * widthFt : 0;
    const multiplier = heightMultiplier(heightFt);
    return {
      name: label,
      lengthFt,
      widthFt,
      heightFt,
      includeCeiling,
      wallSqFt,
      ceilingSqFt,
      hungSqFt: wallSqFt + ceilingSqFt,
      heightMultiplier: multiplier,
    };
  });

  const grossWallSqFt = rooms.reduce((sum, room) => sum + room.wallSqFt, 0);
  const ceilingSqFt = rooms.reduce((sum, room) => sum + room.ceilingSqFt, 0);
  if (openingSqFt > grossWallSqFt) {
    throw new Error('Opening square feet cannot exceed the wall area');
  }
  const netWallSqFt = grossWallSqFt - openingSqFt;
  const netHungSqFt = netWallSqFt + ceilingSqFt;
  const billableSqFt = netHungSqFt * (1 + wastePercent / 100);
  const estimatedSheets = billableSqFt === 0 ? 0 : Math.ceil(billableSqFt / sheetSqFt);

  // Height is applied room-by-room so a 12-ft great room does not inflate a
  // closet, then openings and waste sit on the job total.
  const hangHours = rooms.reduce((sum, room) => {
    const share = netHungSqFt === 0 ? 0 : room.hungSqFt / (grossWallSqFt + ceilingSqFt || 1);
    return sum + (billableSqFt * share / 100) * hangHoursPer100 * room.heightMultiplier;
  }, 0);
  const finishHours = rooms.reduce((sum, room) => {
    const share = netHungSqFt === 0 ? 0 : room.hungSqFt / (grossWallSqFt + ceilingSqFt || 1);
    return sum + (billableSqFt * share / 100) * finish.hoursPer100 * room.heightMultiplier;
  }, 0);
  const textureHours = rooms.reduce((sum, room) => {
    const share = netHungSqFt === 0 ? 0 : room.hungSqFt / (grossWallSqFt + ceilingSqFt || 1);
    return sum + (billableSqFt * share / 100) * textureHoursPer100 * room.heightMultiplier;
  }, 0);
  const tearOffHours = tearOff ? (netHungSqFt / 100) * tearOffHoursPer100 : 0;
  const openingHours = openingCount * HOURS_PER_OPENING;

  const tapeLf = netHungSqFt * tapeLfPerSqFt + openingCount * TAPE_LF_PER_OPENING;
  const tapeMudMaterial = tapeLf * TAPE_MATERIAL_PER_LF + (billableSqFt / 100) * finish.mudPer100;
  const boardMaterial = (billableSqFt / 100) * materialPer100;
  const textureMaterial = (billableSqFt / 100) * textureMaterialPer100;

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

  const rawOnSite = hangHours + finishHours + textureHours + tearOffHours + openingHours + addOnHours + setupHours;
  const minimumApplied = rawOnSite < minOnSiteHours && netHungSqFt > 0;
  const onSiteHours = minimumApplied ? minOnSiteHours : rawOnSite;
  const travelHours = (2 * milesOneWay) / speedMph;
  const totalHours = onSiteHours + travelHours;

  const laborCost = totalHours * loadedWage;
  const dumpster = tearOff ? dumpsterCost : 0;
  const directCost = laborCost + boardMaterial + tapeMudMaterial + textureMaterial + addOnParts + dumpster + tripFee + otherCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;
  const hungTotal = grossWallSqFt + ceilingSqFt;

  return {
    rooms: rooms.map(room => ({
      ...room,
      areaShare: hungTotal === 0 ? 0 : room.hungSqFt / hungTotal * 100,
    })),
    finishLevel: finish.level,
    finishLabel: finish.label,
    grossWallSqFt,
    ceilingSqFt,
    openingSqFt,
    openingCount,
    netWallSqFt,
    netHungSqFt,
    wastePercent,
    billableSqFt,
    estimatedSheets,
    sheetSqFt,
    tapeLf,
    tearOff,
    addOns,
    loadedWage,
    hangHours,
    finishHours,
    textureHours,
    tearOffHours,
    openingHours,
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
    boardMaterial,
    tapeMudMaterial,
    textureMaterial,
    dumpster,
    tripFee,
    otherCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerHungSqFt: netHungSqFt === 0 ? null : price / netHungSqFt,
    pricePerBillableSqFt: billableSqFt === 0 ? null : price / billableSqFt,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    finishShareOfLabor: (hangHours + finishHours + textureHours) === 0
      ? null
      : finishHours / (hangHours + finishHours + textureHours) * 100,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}
