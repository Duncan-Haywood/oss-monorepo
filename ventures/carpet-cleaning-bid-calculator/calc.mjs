// Pure bid arithmetic for a carpet-cleaning job. No network, no state: every
// rate, wage, and production figure is an input, so the result stays a
// transparent calculation the technician can check against their own tickets
// rather than a claim about what any house "should" cost.
//
// The method is the one the trade actually loses money on when it skips it:
// square feet divided by a soil-specific extraction rate, plus the work that
// never appears in a "3 bedroom special" — stairs, a second pass for pet
// urine, upholstery, furniture moving, and the drive. A posted per-room
// special assumes vacant, light-soil rooms and no deadheading. That is not
// the job that shows up.

export const SOIL_PRESETS = Object.freeze([
  { id: 'light', label: 'Light soil / vacant', rate: 400 },
  { id: 'normal', label: 'Normal household soil', rate: 280 },
  { id: 'heavy', label: 'Heavy soil / restoration', rate: 160 },
]);

export const ROOM_NAME_PRESETS = Object.freeze([
  'Living room',
  'Family room',
  'Dining room',
  'Bedroom',
  'Hall / landing',
  'Stairs landing',
  'Office',
  'Basement rec room',
  'Other room',
]);

export const UPHOLSTERY_PRESETS = Object.freeze([
  { label: 'Sofa (3-seat)', minutes: 75 },
  { label: 'Loveseat', minutes: 50 },
  { label: 'Armchair', minutes: 30 },
  { label: 'Dining chair', minutes: 12 },
  { label: 'Ottoman', minutes: 15 },
  { label: 'Sectional seat', minutes: 25 },
]);

// Minutes one technician typically spends on a standard residential flight.
// Not a standard or a guarantee — replace with a time from your own stops.
export const DEFAULT_MINUTES_PER_FLIGHT = 12;

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function truthy(value) {
  return value === true || value === 'true' || value === 'on' || value === 1 || value === '1';
}

function hoursShare(hours, totalHours) {
  return totalHours === 0 ? 0 : (hours / totalHours) * 100;
}

/**
 * Price a single carpet-cleaning stop from rooms, add-ons, and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, squareFeet: number, productionRate: number, petTreatment?: boolean}>} input.rooms
 * @param {Array<{name?: string, minutes: number}>} [input.upholstery]
 * @param {number} [input.stairFlights]
 * @param {number} [input.minutesPerFlight]
 * @param {number} [input.extraPassMultiplier] Extra extraction passes on pet rooms (1 = one full extra pass).
 * @param {number} [input.furnitureMoveMinutes]
 * @param {number} [input.travelMinutes] Round-trip drive, both ways.
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate Payroll burden as a % on top of wage.
 * @param {number} input.chemicalsPerSqFt Extraction chemistry on all carpet sq ft.
 * @param {number} input.petChemistryPerRoom Extra chemistry on each pet-treated room.
 * @param {number} input.otherJobCost Water, disposal, fuel, parking for this stop.
 * @param {number} input.overheadRate Business overhead as a % on direct cost.
 * @param {number} input.targetMargin Net profit as a % of the final price.
 * @param {number} [input.minimumCharge] Posted floor ("$149 to roll the truck").
 * @param {number|null} [input.proposedPrice] A special already on the table.
 */
export function calculateJob(input) {
  const roomsInput = Array.isArray(input.rooms) ? input.rooms : [];
  if (roomsInput.length === 0) throw new Error('Add at least one room to price');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const chemicalsPerSqFt = number(input.chemicalsPerSqFt ?? 0, 'Chemicals per sq ft');
  const petChemistryPerRoom = number(input.petChemistryPerRoom ?? 0, 'Pet chemistry per room');
  const otherJobCost = number(input.otherJobCost ?? 0, 'Other job cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const extraPassMultiplier = number(input.extraPassMultiplier ?? 1, 'Extra pass multiplier');
  const stairFlights = number(input.stairFlights ?? 0, 'Stair flights');
  const minutesPerFlight = number(
    input.minutesPerFlight ?? DEFAULT_MINUTES_PER_FLIGHT,
    'Minutes per flight',
  );
  const furnitureMoveMinutes = number(input.furnitureMoveMinutes ?? 0, 'Furniture-moving minutes');
  const travelMinutes = number(input.travelMinutes ?? 0, 'Travel minutes');
  const minimumCharge = number(input.minimumCharge ?? 0, 'Minimum charge');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const rooms = roomsInput.map((room, index) => {
    const label = room.name?.trim() || `Room ${index + 1}`;
    const squareFeet = number(room.squareFeet ?? 0, `${label}: square feet`);
    const productionRate = number(room.productionRate ?? 0, `${label}: production rate`, {
      allowZero: false,
    });
    const petTreatment = truthy(room.petTreatment);
    const extractionHours = squareFeet / productionRate;
    const petExtraHours = petTreatment ? extractionHours * extraPassMultiplier : 0;
    return {
      name: label,
      squareFeet,
      productionRate,
      petTreatment,
      extractionHours,
      petExtraHours,
      hours: extractionHours + petExtraHours,
    };
  });

  const upholsteryInput = Array.isArray(input.upholstery) ? input.upholstery : [];
  const upholstery = upholsteryInput.map((piece, index) => {
    const label = piece.name?.trim() || `Piece ${index + 1}`;
    const minutes = number(piece.minutes ?? 0, `${label}: minutes`);
    return { name: label, minutes, hours: minutes / 60 };
  });

  const extractionHours = rooms.reduce((sum, room) => sum + room.extractionHours, 0);
  const petExtraHours = rooms.reduce((sum, room) => sum + room.petExtraHours, 0);
  const stairHours = (stairFlights * minutesPerFlight) / 60;
  const upholsteryHours = upholstery.reduce((sum, piece) => sum + piece.hours, 0);
  const furnitureHours = furnitureMoveMinutes / 60;
  const travelHours = travelMinutes / 60;

  const buckets = [
    { id: 'extraction', label: 'Carpet extraction', hours: extractionHours },
    { id: 'pet', label: 'Pet treatment extra passes', hours: petExtraHours },
    { id: 'stairs', label: 'Stairs', hours: stairHours },
    { id: 'upholstery', label: 'Upholstery', hours: upholsteryHours },
    { id: 'furniture', label: 'Furniture moving', hours: furnitureHours },
    { id: 'travel', label: 'Drive time', hours: travelHours },
  ];

  const totalHours = buckets.reduce((sum, bucket) => sum + bucket.hours, 0);
  const onSiteHours = totalHours - travelHours;
  const hiddenHours = totalHours - extractionHours;
  const totalSquareFeet = rooms.reduce((sum, room) => sum + room.squareFeet, 0);
  const roomCount = rooms.filter((room) => room.squareFeet > 0).length;
  const petRoomCount = rooms.filter((room) => room.petTreatment).length;

  const laborCost = totalHours * loadedWage;
  const chemicalCost = totalSquareFeet * chemicalsPerSqFt + petRoomCount * petChemistryPerRoom;
  const directCost = laborCost + chemicalCost + otherJobCost;
  const overhead = directCost * (overheadRate / 100);
  const jobCost = directCost + overhead;

  // Margin is a share of price, not a markup on cost — that is how a
  // technician's posted special and their P&L both read the number.
  const targetPrice = jobCost / (1 - targetMargin / 100);
  const minimumApplied = minimumCharge > targetPrice;
  const quotedPrice = Math.max(targetPrice, minimumCharge);
  const profit = quotedPrice - jobCost;

  const hasProposed =
    input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    rooms,
    upholstery,
    buckets: buckets.map((bucket) => ({
      ...bucket,
      hoursShare: hoursShare(bucket.hours, totalHours),
    })),
    loadedWage,
    extractionHours,
    petExtraHours,
    stairHours,
    upholsteryHours,
    furnitureHours,
    travelHours,
    hiddenHours,
    hiddenHoursShare: hoursShare(hiddenHours, totalHours),
    totalHours,
    onSiteHours,
    totalSquareFeet,
    roomCount,
    petRoomCount,
    stairFlights,
    laborCost,
    chemicalCost,
    otherJobCost,
    overhead,
    directCost,
    jobCost,
    targetPrice,
    minimumCharge,
    minimumApplied,
    quotedPrice,
    profit,
    // What the special works out to per room and per foot — the two numbers
    // customers argue about, and the ones a $99 three-bed special silently
    // understates once stairs and the drive are on the clock.
    pricePerSqFt: totalSquareFeet === 0 ? null : quotedPrice / totalSquareFeet,
    pricePerRoom: roomCount === 0 ? null : quotedPrice / roomCount,
    effectiveHourlyRate: totalHours === 0 ? null : quotedPrice / totalHours,
    onSiteHourlyRate: onSiteHours === 0 ? null : quotedPrice / onSiteHours,
    // Cost is the walk-away: below this the stop loses money even if a
    // posted minimum would have made the quote look "full."
    breakEvenPrice: jobCost,
    proposed:
      proposedPrice === null
        ? null
        : {
            price: proposedPrice,
            profit: proposedPrice - jobCost,
            margin: proposedPrice === 0 ? 0 : ((proposedPrice - jobCost) / proposedPrice) * 100,
            hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
            belowBreakEven: proposedPrice < jobCost,
            belowMinimum: minimumCharge > 0 && proposedPrice < minimumCharge,
          },
  };
}
