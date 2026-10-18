// Pure bid arithmetic for a residential siding job. No network, no state:
// every square, waste factor, linear foot, and wage is an input, so the
// result stays a transparent calculation the contractor can check against
// their own material invoices and payroll rather than a claim about what
// any house "should" cost or whether a wall is weathertight.
//
// The method is the one the trade actually loses money on when they skip it:
// a flat price-per-square-foot cannot see that waste, openings, two-story
// work, tear-off, and linear trim are different jobs from a one-story vinyl
// wrap with no windows. Squares come from net wall area plus waste, then
// height, tear-off, wrap, openings, and trim layer on. That is what
// separates a defensible quote from a "$8 a foot" neighborhood special.

export const MATERIAL_PRESETS = Object.freeze([
  { id: 'vinyl', label: 'Vinyl siding', wastePercent: 10, hoursPerSquare: 4.5, materialPerSquare: 185, tearOffHoursPerSquare: 2.0 },
  { id: 'fiber-cement', label: 'Fiber cement', wastePercent: 12, hoursPerSquare: 7.0, materialPerSquare: 340, tearOffHoursPerSquare: 2.5 },
  { id: 'engineered-wood', label: 'Engineered wood', wastePercent: 12, hoursPerSquare: 6.0, materialPerSquare: 295, tearOffHoursPerSquare: 2.25 },
  { id: 'aluminum', label: 'Aluminum siding', wastePercent: 10, hoursPerSquare: 5.0, materialPerSquare: 250, tearOffHoursPerSquare: 2.1 },
]);

// Applied to install hours only. Carrying siding up a 3-story is not a
// 1-story job; the extra is height and staging, not "a bigger house".
export const STORY_MULTIPLIERS = Object.freeze({
  1: 1.0,
  2: 1.35,
  3: 1.7,
});

export const ACCESSORY_PRESETS = Object.freeze([
  { id: 'starter', label: 'Starter strip', hoursPer100Lf: 0.4, materialPerLf: 1.15 },
  { id: 'outsideCorner', label: 'Outside corners', hoursPer100Lf: 0.65, materialPerLf: 4.75 },
  { id: 'insideCorner', label: 'Inside corners', hoursPer100Lf: 0.5, materialPerLf: 3.9 },
  { id: 'jChannel', label: 'J-channel / window wrap', hoursPer100Lf: 0.5, materialPerLf: 1.45 },
  { id: 'undersill', label: 'Undersill / utility trim', hoursPer100Lf: 0.4, materialPerLf: 1.3 },
]);

export const ADD_ON_PRESETS = Object.freeze([
  { id: 'scaffold', label: 'Scaffold / pump jacks', hours: 3, parts: 380 },
  { id: 'soffitFascia', label: 'Soffit and fascia (this elevation set)', hours: 6, parts: 420 },
]);

export const HOUSEWRAP_HOURS_PER_SQUARE = 0.45;
export const HOURS_PER_OPENING = 0.35;

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
 * Price a siding job from its walls, waste, and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, lengthFt: number, heightFt: number}>} input.walls
 * @param {number} input.openingSqFt
 * @param {number} input.openingCount
 * @param {number} input.wastePercent
 * @param {number} input.hoursPerSquare
 * @param {number} input.materialPerSquare
 * @param {number} input.tearOffHoursPerSquare
 * @param {number} input.stories
 * @param {boolean} input.tearOff
 * @param {boolean} input.housewrap
 * @param {number} input.housewrapPerSqFt
 * @param {Array<{id?: string, label?: string, linearFeet: number, hoursPer100Lf: number, materialPerLf: number}>} [input.accessories]
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
  const wallsInput = Array.isArray(input.walls) ? input.walls : [];
  if (wallsInput.length === 0) throw new Error('Add at least one wall to price');

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
  const hoursPerSquare = number(input.hoursPerSquare ?? 0, 'Hours per square');
  const materialPerSquare = number(input.materialPerSquare ?? 0, 'Material per square');
  const tearOffHoursPerSquare = number(input.tearOffHoursPerSquare ?? 0, 'Tear-off hours per square');
  const housewrapPerSqFt = number(input.housewrapPerSqFt ?? 0, 'Housewrap per square foot');
  const heightMultiplier = storyMultiplier(input.stories);
  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const tearOff = Boolean(input.tearOff);
  const housewrap = Boolean(input.housewrap);

  const walls = wallsInput.map((wall, index) => {
    const label = wall.name?.trim() || `Wall ${index + 1}`;
    const lengthFt = number(wall.lengthFt ?? 0, `${label}: length`);
    const heightFt = number(wall.heightFt ?? 0, `${label}: height`);
    const grossSqFt = lengthFt * heightFt;
    return { name: label, lengthFt, heightFt, grossSqFt };
  });

  const grossWallSqFt = walls.reduce((sum, wall) => sum + wall.grossSqFt, 0);
  if (openingSqFt > grossWallSqFt) {
    throw new Error('Opening square feet cannot exceed the wall area');
  }
  const netWallSqFt = grossWallSqFt - openingSqFt;
  const netSquares = netWallSqFt / 100;
  const billableSquares = netSquares * (1 + wastePercent / 100);

  const installHours = billableSquares * hoursPerSquare * heightMultiplier;
  const tearOffHours = tearOff ? billableSquares * tearOffHoursPerSquare : 0;
  const wrapHours = housewrap ? netSquares * HOUSEWRAP_HOURS_PER_SQUARE : 0;
  const openingHours = openingCount * HOURS_PER_OPENING;

  const accessoriesInput = Array.isArray(input.accessories) ? input.accessories : [];
  const accessories = accessoriesInput.map((item, index) => {
    const label = item.label?.trim() || item.id || `Trim ${index + 1}`;
    const linearFeet = number(item.linearFeet ?? 0, `${label}: linear feet`);
    const hoursPer100Lf = number(item.hoursPer100Lf ?? 0, `${label}: hours per 100 lf`);
    const materialPerLf = number(item.materialPerLf ?? 0, `${label}: material per lf`);
    return {
      id: item.id || `trim-${index + 1}`,
      label,
      linearFeet,
      hoursPer100Lf,
      materialPerLf,
      hours: linearFeet / 100 * hoursPer100Lf,
      material: linearFeet * materialPerLf,
    };
  });
  const accessoryHours = accessories.reduce((sum, item) => sum + item.hours, 0);
  const accessoryMaterial = accessories.reduce((sum, item) => sum + item.material, 0);

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

  const rawOnSite = installHours + tearOffHours + wrapHours + openingHours + accessoryHours + addOnHours + setupHours;
  const minimumApplied = rawOnSite < minOnSiteHours && netWallSqFt > 0;
  const onSiteHours = minimumApplied ? minOnSiteHours : rawOnSite;
  const travelHours = (2 * milesOneWay) / speedMph;
  const totalHours = onSiteHours + travelHours;

  const laborCost = totalHours * loadedWage;
  const sidingMaterial = billableSquares * materialPerSquare;
  const wrapMaterial = housewrap ? netWallSqFt * housewrapPerSqFt : 0;
  const dumpster = tearOff ? dumpsterCost : 0;
  const directCost = laborCost + sidingMaterial + wrapMaterial + accessoryMaterial + addOnParts + dumpster + tripFee + otherCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    walls: walls.map(wall => ({
      ...wall,
      areaShare: grossWallSqFt === 0 ? 0 : wall.grossSqFt / grossWallSqFt * 100,
    })),
    grossWallSqFt,
    openingSqFt,
    openingCount,
    netWallSqFt,
    netSquares,
    wastePercent,
    billableSquares,
    stories: number(input.stories ?? 1, 'Stories', { min: 1, allowZero: false }),
    heightMultiplier,
    tearOff,
    housewrap,
    accessories,
    addOns,
    loadedWage,
    installHours,
    tearOffHours,
    wrapHours,
    openingHours,
    accessoryHours,
    accessoryMaterial,
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
    sidingMaterial,
    wrapMaterial,
    dumpster,
    tripFee,
    otherCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSquare: billableSquares === 0 ? null : price / billableSquares,
    pricePerNetSqFt: netWallSqFt === 0 ? null : price / netWallSqFt,
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
