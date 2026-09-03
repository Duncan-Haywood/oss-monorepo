// Pure bid arithmetic for a residential flooring install. No network, no
// state: every waste factor, tear-out rate, wage, and material figure is an
// input, so the result stays a transparent calculation the installer can
// check against their own invoices rather than a claim about what any house
// "should" cost.
//
// The method is the one the trade actually loses money on when they skip it:
// purchased material is installed square footage plus waste, tear-out is a
// different job from the install, and stairs are priced per tread — not as
// another room. A flat price-per-square-foot on the finished floor cannot
// see any of those three, which is how a kitchen of tile tear-out plus
// thirteen treads eats a bid that looked fine on the living-room number.

// Common starting points for waste and install production. These are
// ballpark figures to start from, NOT an industry standard or a guarantee:
// real waste depends on layout, pattern, and how many odd cuts the rooms
// force; real production depends on crew, substrate, and how much furniture
// is still in the way. Installers should replace them with numbers from
// their own last few jobs.
export const MATERIAL_PRESETS = Object.freeze([
  { label: 'LVP / vinyl plank (straight lay)', wastePct: 8, installSqFtPerHour: 80 },
  { label: 'LVP / vinyl plank (diagonal)', wastePct: 12, installSqFtPerHour: 65 },
  { label: 'Laminate (straight lay)', wastePct: 8, installSqFtPerHour: 90 },
  { label: 'Engineered hardwood (straight)', wastePct: 10, installSqFtPerHour: 50 },
  { label: 'Solid hardwood (nail-down)', wastePct: 12, installSqFtPerHour: 35 },
  { label: 'Ceramic tile (standard)', wastePct: 12, installSqFtPerHour: 25 },
  { label: 'Porcelain / large-format tile', wastePct: 15, installSqFtPerHour: 18 },
  { label: 'Carpet and pad', wastePct: 8, installSqFtPerHour: 100 },
  { label: 'Sheet vinyl', wastePct: 10, installSqFtPerHour: 70 },
]);

// Tear-out hours per 100 installed square feet, plus disposal cost per
// installed square foot. Tile and glue-down are the rows that sink a
// "same price as the living room" quote.
export const TEAROUT_PRESETS = Object.freeze([
  { label: 'None — empty or new construction', hoursPer100: 0, disposalPerSqFt: 0 },
  { label: 'Carpet and pad', hoursPer100: 0.4, disposalPerSqFt: 0.15 },
  { label: 'LVP / laminate float', hoursPer100: 0.6, disposalPerSqFt: 0.25 },
  { label: 'Glue-down vinyl / sheet', hoursPer100: 1.2, disposalPerSqFt: 0.3 },
  { label: 'Ceramic tile', hoursPer100: 2.0, disposalPerSqFt: 0.55 },
  { label: 'Hardwood pry-up', hoursPer100: 1.5, disposalPerSqFt: 0.4 },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function scoreProposed(price, cost, hours) {
  return {
    price,
    profit: price - cost,
    margin: price === 0 ? 0 : (price - cost) / price * 100,
    hourlyRate: hours === 0 ? null : price / hours,
    belowBreakEven: price < cost,
  };
}

/**
 * Price a flooring install from rooms, waste, tear-out, and job extras.
 *
 * @param {object} input
 * @param {Array<{name?: string, squareFeet: number, wastePct: number, installSqFtPerHour: number, tearoutHoursPer100: number, disposalPerSqFt?: number}>} input.rooms
 *   One row per room or floor type. Splitting rooms this way is the point:
 *   a single blended $/sq ft hides the tile tear-out that sinks the job.
 * @param {number} input.materialCostPerSqFt   What the installer pays the supplier.
 * @param {number} input.underlaymentCostPerSqFt  Purchased with the same waste factor.
 * @param {number} input.stairTreads
 * @param {number} input.hoursPerTread
 * @param {number} input.stairMaterialEach
 * @param {number} input.transitionCount
 * @param {number} input.hoursPerTransition
 * @param {number} input.transitionMaterialEach
 * @param {number} input.furnitureRooms
 * @param {number} input.hoursPerFurnitureRoom
 * @param {number} input.levelingSqFt
 * @param {number} input.hoursPer100Leveling
 * @param {number} input.levelingMaterialPerSqFt
 * @param {number} input.baseboardLf
 * @param {number} input.hoursPer100Baseboard
 * @param {number} input.baseboardMaterialPerLf
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate
 * @param {number} input.dumpFee
 * @param {number} input.travelCost
 * @param {number} input.otherCost
 * @param {number} input.overheadRate
 * @param {number} input.targetMargin
 * @param {number|null} input.proposedPrice
 */
export function calculateBid(input) {
  const roomsInput = Array.isArray(input.rooms) ? input.rooms : [];
  if (roomsInput.length === 0) throw new Error('Add at least one room to price');

  const materialCostPerSqFt = number(input.materialCostPerSqFt ?? 0, 'Material cost per sq ft');
  const underlaymentCostPerSqFt = number(input.underlaymentCostPerSqFt ?? 0, 'Underlayment cost per sq ft');
  const stairTreads = number(input.stairTreads ?? 0, 'Stair treads');
  const hoursPerTread = number(input.hoursPerTread ?? 0, 'Hours per tread');
  const stairMaterialEach = number(input.stairMaterialEach ?? 0, 'Stair material each');
  const transitionCount = number(input.transitionCount ?? 0, 'Transitions');
  const hoursPerTransition = number(input.hoursPerTransition ?? 0, 'Hours per transition');
  const transitionMaterialEach = number(input.transitionMaterialEach ?? 0, 'Transition material each');
  const furnitureRooms = number(input.furnitureRooms ?? 0, 'Furniture rooms');
  const hoursPerFurnitureRoom = number(input.hoursPerFurnitureRoom ?? 0, 'Hours per furniture room');
  const levelingSqFt = number(input.levelingSqFt ?? 0, 'Leveling square feet');
  const hoursPer100Leveling = number(input.hoursPer100Leveling ?? 0, 'Leveling hours per 100 sq ft');
  const levelingMaterialPerSqFt = number(input.levelingMaterialPerSqFt ?? 0, 'Leveling material per sq ft');
  const baseboardLf = number(input.baseboardLf ?? 0, 'Baseboard / shoe linear feet');
  const hoursPer100Baseboard = number(input.hoursPer100Baseboard ?? 0, 'Baseboard hours per 100 ft');
  const baseboardMaterialPerLf = number(input.baseboardMaterialPerLf ?? 0, 'Baseboard material per foot');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const dumpFee = number(input.dumpFee ?? 0, 'Dump fee');
  const travelCost = number(input.travelCost ?? 0, 'Travel cost');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const rooms = roomsInput.map((room, index) => {
    const label = room.name?.trim() || `Room ${index + 1}`;
    const squareFeet = number(room.squareFeet ?? 0, `${label}: square feet`);
    const wastePct = number(room.wastePct ?? 0, `${label}: waste`);
    const installSqFtPerHour = number(
      room.installSqFtPerHour ?? 0,
      `${label}: install rate`,
      { allowZero: false },
    );
    const tearoutHoursPer100 = number(room.tearoutHoursPer100 ?? 0, `${label}: tear-out hours`);
    const disposalPerSqFt = number(room.disposalPerSqFt ?? 0, `${label}: disposal`);

    const purchasedSqFt = squareFeet * (1 + wastePct / 100);
    const installHours = squareFeet / installSqFtPerHour;
    const tearoutHours = squareFeet / 100 * tearoutHoursPer100;
    const hours = installHours + tearoutHours;
    const wasteSqFt = purchasedSqFt - squareFeet;
    const flooringMaterial = purchasedSqFt * materialCostPerSqFt;
    const underlayment = purchasedSqFt * underlaymentCostPerSqFt;
    const disposal = squareFeet * disposalPerSqFt;
    const materialCost = flooringMaterial + underlayment + disposal;

    return {
      name: label,
      squareFeet,
      wastePct,
      installSqFtPerHour,
      tearoutHoursPer100,
      disposalPerSqFt,
      purchasedSqFt,
      wasteSqFt,
      installHours,
      tearoutHours,
      hours,
      flooringMaterial,
      underlayment,
      disposal,
      materialCost,
      laborCost: hours * loadedWage,
    };
  });

  const installedSqFt = rooms.reduce((sum, room) => sum + room.squareFeet, 0);
  const purchasedSqFt = rooms.reduce((sum, room) => sum + room.purchasedSqFt, 0);
  const wasteSqFt = purchasedSqFt - installedSqFt;
  const roomInstallHours = rooms.reduce((sum, room) => sum + room.installHours, 0);
  const roomTearoutHours = rooms.reduce((sum, room) => sum + room.tearoutHours, 0);
  const roomHours = roomInstallHours + roomTearoutHours;
  const roomMaterialCost = rooms.reduce((sum, room) => sum + room.materialCost, 0);
  const roomFlooringMaterial = rooms.reduce((sum, room) => sum + room.flooringMaterial, 0);
  const roomUnderlayment = rooms.reduce((sum, room) => sum + room.underlayment, 0);
  const roomDisposal = rooms.reduce((sum, room) => sum + room.disposal, 0);
  const wasteMaterialCost = wasteSqFt * (materialCostPerSqFt + underlaymentCostPerSqFt);

  const extras = {
    stairs: {
      count: stairTreads,
      hours: stairTreads * hoursPerTread,
      material: stairTreads * stairMaterialEach,
    },
    transitions: {
      count: transitionCount,
      hours: transitionCount * hoursPerTransition,
      material: transitionCount * transitionMaterialEach,
    },
    furniture: {
      count: furnitureRooms,
      hours: furnitureRooms * hoursPerFurnitureRoom,
      material: 0,
    },
    leveling: {
      count: levelingSqFt,
      hours: levelingSqFt / 100 * hoursPer100Leveling,
      material: levelingSqFt * levelingMaterialPerSqFt,
    },
    baseboard: {
      count: baseboardLf,
      hours: baseboardLf / 100 * hoursPer100Baseboard,
      material: baseboardLf * baseboardMaterialPerLf,
    },
  };

  const extraHours = Object.values(extras).reduce((sum, item) => sum + item.hours, 0);
  const extraMaterial = Object.values(extras).reduce((sum, item) => sum + item.material, 0);
  const laborHours = roomHours + extraHours;
  const laborCost = laborHours * loadedWage;
  const materials = roomMaterialCost + extraMaterial + dumpFee + travelCost + otherCost;
  const directCost = laborCost + materials;
  const overhead = directCost * overheadRate / 100;
  const jobCost = directCost + overhead;
  const price = jobCost / (1 - targetMargin / 100);
  const profit = price - jobCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    rooms: rooms.map(room => ({
      ...room,
      hoursShare: laborHours === 0 ? 0 : room.hours / laborHours * 100,
      areaShare: installedSqFt === 0 ? 0 : room.squareFeet / installedSqFt * 100,
    })),
    extras,
    installedSqFt,
    purchasedSqFt,
    wasteSqFt,
    wasteMaterialCost,
    roomInstallHours,
    roomTearoutHours,
    roomHours,
    extraHours,
    laborHours,
    loadedWage,
    laborCost,
    roomFlooringMaterial,
    roomUnderlayment,
    roomDisposal,
    extraMaterial,
    dumpFee,
    travelCost,
    otherCost,
    materials,
    overhead,
    jobCost,
    price,
    profit,
    pricePerInstalledSqFt: installedSqFt === 0 ? null : price / installedSqFt,
    effectiveHourlyRate: laborHours === 0 ? null : price / laborHours,
    breakEvenPrice: jobCost,
    tearoutHoursShare: laborHours === 0 ? 0 : roomTearoutHours / laborHours * 100,
    stairHoursShare: laborHours === 0 ? 0 : extras.stairs.hours / laborHours * 100,
    proposed: proposedPrice === null ? null : scoreProposed(proposedPrice, jobCost, laborHours),
  };
}
