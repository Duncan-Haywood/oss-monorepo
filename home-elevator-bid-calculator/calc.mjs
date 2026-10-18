// Pure bid arithmetic for residential home-elevator / residential-elevator
// install. No network, no state: every stop, travel foot, drive, hoistway,
// wage, and fixture invoice is an input, so the result stays a transparent
// calculation the contractor can check against their own tickets rather
// than a claim about what any house "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$18,995 pneumatic home elevator installed" special treats a two-stop
// through-floor vacuum unit with no shaft and no pit as the same job as
// a three-stop hydraulic in a new wood hoistway, a pit, a machine closet,
// a 240 V feeder, auto doors, battery lowering, and a state inspection.
// Homeowners (and a lot of estimator sheets) count the same kind of
// number. The shaft, the pit, the feeder, and the inspection do not live
// in that dump. Matching the cheap pneumatic special on a hydraulic-
// plus-shaft job is how a sold aging-in-place install becomes a loss
// when the hoistway and the extras eat the margin.
//
// Distinct from *stair lift* (a chair on a rail — no shaft, no pit, no
// cab, and a $485 next-day rail ticket rather than air freight on a
// 400–1,400 lb unit plus a weekend inspector), *wheelchair ramp*
// (carpentry: rise-to-run, landings — a platform), *walk-in tub*
// (alcove plumbing), *walk-in shower* (tile, slope, glass), and
// *entry door*. This prices a home elevator: the stops, the drive,
// the hoistway, and the extras.

export const DRIVE_PRESETS = Object.freeze([
  { id: 'pneumatic', label: 'Pneumatic vacuum — through-floor, no shaft (the cheap special)' },
  { id: 'winding-drum', label: 'Winding drum / cable — compact, no machine room' },
  { id: 'hydraulic', label: 'Hydraulic — pit and a machine closet' },
  { id: 'traction-mrl', label: 'Traction MRL — machine-room-less, taller travel' },
]);

export const HOISTWAY_PRESETS = Object.freeze([
  { id: 'through-floor', label: 'Through-floor cut — no hoistway (the cheap special)' },
  { id: 'existing-shaft', label: 'Existing shaft — reuse' },
  { id: 'new-wood', label: 'New wood shaft' },
  { id: 'new-masonry', label: 'New masonry / CMU shaft' },
  { id: 'glass', label: 'Glass hoistway' },
]);

export const CAB_PRESETS = Object.freeze([
  { id: 'acrylic', label: 'Acrylic / vacuum tube — the cheap special' },
  { id: 'standard', label: 'Standard enclosed cab' },
  { id: 'wood-panel', label: 'Wood-panel cab' },
  { id: 'glass-cab', label: 'Glass cab' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Cheap special: 2-stop pneumatic, through-floor, acrylic tube, 12 ft',
    stops: 2,
    travelFeet: 12,
    capacityLbs: 400,
    drive: 'pneumatic',
    hoistway: 'through-floor',
    cab: 'acrylic',
    travelMiles: 10,
    includePit: false,
    includeMachineRoom: false,
    includeAutoDoors: false,
    includeBattery: false,
    includeFeeder: false,
    includePermit: false,
  },
  {
    label: 'Typical 2-stop hydraulic: new wood shaft, standard cab, pit, 14 ft, feeder, permit',
    stops: 2,
    travelFeet: 14,
    capacityLbs: 750,
    drive: 'hydraulic',
    hoistway: 'new-wood',
    cab: 'standard',
    travelMiles: 16,
    includePit: true,
    includeMachineRoom: true,
    includeAutoDoors: true,
    includeBattery: true,
    includeFeeder: true,
    includePermit: true,
  },
  {
    label: 'Losing job: 3-stop hydraulic, new wood, wood-panel, 28 ft, pit, feeder, permit',
    stops: 3,
    travelFeet: 28,
    capacityLbs: 1000,
    drive: 'hydraulic',
    hoistway: 'new-wood',
    cab: 'wood-panel',
    travelMiles: 22,
    includePit: true,
    includeMachineRoom: true,
    includeAutoDoors: true,
    includeBattery: true,
    includeFeeder: true,
    includePermit: true,
  },
  {
    label: 'Four-stop traction MRL: glass hoistway, glass cab, 42 ft, pit, feeder, permit',
    stops: 4,
    travelFeet: 42,
    capacityLbs: 1400,
    drive: 'traction-mrl',
    hoistway: 'glass',
    cab: 'glass-cab',
    travelMiles: 28,
    includePit: true,
    includeMachineRoom: false,
    includeAutoDoors: true,
    includeBattery: true,
    includeFeeder: true,
    includePermit: true,
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

function requirePreset(presets, id, label) {
  const found = presets.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown ${label}`);
  return found;
}

/**
 * Travel hours from a trip plus miles. Miles of zero is a local
 * stop, not a missing input.
 */
export function travelHours(hoursTrip, travelMiles, hoursPerMile) {
  return number(hoursTrip, 'Trip hours')
    + number(travelMiles, 'Travel miles') * number(hoursPerMile, 'Hours per mile');
}

/**
 * Starting unit and set hours from the drive that is actually sold.
 * Pneumatic vacuum is the cheap special: a tube, two floors, no
 * machine room. Hydraulic is a ram, a pit, and a closet.
 * Winding drum is compact cable. Traction MRL is taller travel.
 */
export function suggestedDriveKit(drive) {
  const id = String(drive);
  if (id === 'pneumatic') {
    return {
      hoursSetBase: 10,
      hoursPerStop: 4,
      hoursPerTravelFt: 0.35,
      unitInvoice: 14500,
    };
  }
  if (id === 'winding-drum') {
    return {
      hoursSetBase: 16,
      hoursPerStop: 7,
      hoursPerTravelFt: 0.7,
      unitInvoice: 18500,
    };
  }
  if (id === 'hydraulic') {
    return {
      hoursSetBase: 22,
      hoursPerStop: 9,
      hoursPerTravelFt: 0.95,
      unitInvoice: 24000,
    };
  }
  if (id === 'traction-mrl') {
    return {
      hoursSetBase: 28,
      hoursPerStop: 11,
      hoursPerTravelFt: 1.15,
      unitInvoice: 34000,
    };
  }
  throw new Error('Unknown drive');
}

/**
 * Through-floor is the cheap-special hoistway: cut two decks,
 * no shaft. Existing shaft is reuse. New wood is framed.
 * Masonry is CMU. Glass is a showpiece and a longer set.
 */
export function suggestedHoistwayKit(hoistway) {
  const id = String(hoistway);
  if (id === 'through-floor') {
    return {
      hoursHoistwayPerFt: 0.55,
      hoursCutPerStop: 5.5,
      hoistwayInvoicePerFt: 95,
    };
  }
  if (id === 'existing-shaft') {
    return {
      hoursHoistwayPerFt: 0.4,
      hoursCutPerStop: 2.0,
      hoistwayInvoicePerFt: 45,
    };
  }
  if (id === 'new-wood') {
    return {
      hoursHoistwayPerFt: 2.2,
      hoursCutPerStop: 3.0,
      hoistwayInvoicePerFt: 210,
    };
  }
  if (id === 'new-masonry') {
    return {
      hoursHoistwayPerFt: 3.1,
      hoursCutPerStop: 3.5,
      hoistwayInvoicePerFt: 360,
    };
  }
  if (id === 'glass') {
    return {
      hoursHoistwayPerFt: 3.6,
      hoursCutPerStop: 4.0,
      hoistwayInvoicePerFt: 580,
    };
  }
  throw new Error('Unknown hoistway');
}

/**
 * Acrylic tube is the cheap-special cab. Standard enclosed is
 * the typical hydraulic cab. Wood-panel is finish. Glass cab
 * is the upgrade homeowners ask for after they have already
 * shopped the pneumatic number.
 */
export function suggestedCabKit(cab) {
  const id = String(cab);
  if (id === 'acrylic') {
    return { hoursCab: 2.0, cabInvoice: 0 };
  }
  if (id === 'standard') {
    return { hoursCab: 4.5, cabInvoice: 1800 };
  }
  if (id === 'wood-panel') {
    return { hoursCab: 6.5, cabInvoice: 3200 };
  }
  if (id === 'glass-cab') {
    return { hoursCab: 8.0, cabInvoice: 5400 };
  }
  throw new Error('Unknown cab');
}

/**
 * Starting extras that do not live in an $18,995 pneumatic special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 3.2,
    hoursPerMile: 0.04,
    hoursPit: 12,
    hoursMachineRoom: 8,
    hoursAutoDoors: 6,
    hoursBattery: 4,
    hoursFeeder: 10,
    hoursPermit: 8,
    siteHours: 5,
    pitInvoice: 2200,
    machineRoomInvoice: 1600,
    autoDoorsInvoice: 2800,
    batteryInvoice: 1650,
    feederInvoice: 2400,
    permitInvoice: 1850,
    travelPerMile: 3.4,
  };
}

/**
 * Price a home-elevator install from the stops, the travel,
 * the drive, the hoistway, the cab, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const drive = requirePreset(DRIVE_PRESETS, input.drive, 'drive').id;
  const hoistway = requirePreset(HOISTWAY_PRESETS, input.hoistway, 'hoistway').id;
  const cab = requirePreset(CAB_PRESETS, input.cab, 'cab').id;

  const stops = number(input.stops ?? 0, 'Stops');
  const travelFeet = number(input.travelFeet ?? 0, 'Travel feet');
  const capacityLbs = number(input.capacityLbs ?? 0, 'Capacity');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const includePit = flag(input.includePit);
  const includeMachineRoom = flag(input.includeMachineRoom);
  const includeAutoDoors = flag(input.includeAutoDoors);
  const includeBattery = flag(input.includeBattery);
  const includeFeeder = flag(input.includeFeeder);
  const includePermit = flag(input.includePermit);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursSetBase = number(input.hoursSetBase ?? 0, 'Set-base hours');
  const hoursPerStop = number(input.hoursPerStop ?? 0, 'Hours per stop');
  const hoursPerTravelFt = number(input.hoursPerTravelFt ?? 0, 'Hours per travel foot');
  const hoursHoistwayPerFt = number(input.hoursHoistwayPerFt ?? 0, 'Hoistway hours per foot');
  const hoursCutPerStop = number(input.hoursCutPerStop ?? 0, 'Cut hours per stop');
  const hoursCab = number(input.hoursCab ?? 0, 'Cab hours');
  const hoursPit = number(input.hoursPit ?? 0, 'Pit hours');
  const hoursMachineRoom = number(input.hoursMachineRoom ?? 0, 'Machine-room hours');
  const hoursAutoDoors = number(input.hoursAutoDoors ?? 0, 'Auto-door hours');
  const hoursBattery = number(input.hoursBattery ?? 0, 'Battery hours');
  const hoursFeeder = number(input.hoursFeeder ?? 0, 'Feeder hours');
  const hoursPermit = number(input.hoursPermit ?? 0, 'Permit hours');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const unitInvoice = number(input.unitInvoice ?? 0, 'Unit invoice');
  const hoistwayInvoicePerFt = number(input.hoistwayInvoicePerFt ?? 0, 'Hoistway invoice per foot');
  const cabInvoice = number(input.cabInvoice ?? 0, 'Cab invoice');
  const pitInvoice = number(input.pitInvoice ?? 0, 'Pit invoice');
  const machineRoomInvoice = number(input.machineRoomInvoice ?? 0, 'Machine-room invoice');
  const autoDoorsInvoice = number(input.autoDoorsInvoice ?? 0, 'Auto-door invoice');
  const batteryInvoice = number(input.batteryInvoice ?? 0, 'Battery invoice');
  const feederInvoice = number(input.feederInvoice ?? 0, 'Feeder invoice');
  const permitInvoice = number(input.permitInvoice ?? 0, 'Permit invoice');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');

  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursUnit = hoursSetBase + (stops * hoursPerStop) + (travelFeet * hoursPerTravelFt);
  const hoursHoistway = (travelFeet * hoursHoistwayPerFt) + (stops * hoursCutPerStop);
  const hoursPitApplied = includePit ? hoursPit : 0;
  const hoursMachineApplied = includeMachineRoom ? hoursMachineRoom : 0;
  const hoursDoorsApplied = includeAutoDoors ? hoursAutoDoors : 0;
  const hoursBatteryApplied = includeBattery ? hoursBattery : 0;
  const hoursFeederApplied = includeFeeder ? hoursFeeder : 0;
  const hoursPermitApplied = includePermit ? hoursPermit : 0;
  const extraWorkHours = hoursHoistway + hoursCab + hoursPitApplied + hoursMachineApplied
    + hoursDoorsApplied + hoursBatteryApplied + hoursFeederApplied + hoursPermitApplied;
  const totalHours = hoursTravel + hoursUnit + extraWorkHours + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const unitMaterial = unitInvoice;
  const hoistwayMaterial = travelFeet * hoistwayInvoicePerFt;
  const cabMaterial = cabInvoice;
  const pitMaterial = includePit ? pitInvoice : 0;
  const machineMaterial = includeMachineRoom ? machineRoomInvoice : 0;
  const doorsMaterial = includeAutoDoors ? autoDoorsInvoice : 0;
  const batteryMaterial = includeBattery ? batteryInvoice : 0;
  const feederMaterial = includeFeeder ? feederInvoice : 0;
  const permitMaterial = includePermit ? permitInvoice : 0;
  const travelInvoice = travelMiles * travelPerMile;
  const fixtureMaterial = unitMaterial + hoistwayMaterial + cabMaterial;
  const extraHardware = pitMaterial + machineMaterial + doorsMaterial
    + batteryMaterial + feederMaterial + permitMaterial + travelInvoice;
  const materialCost = fixtureMaterial + extraHardware;

  const softCost = travelAndEquipment + otherCost;
  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);
  const hourShare = (amount) => (totalHours === 0 ? 0 : amount / totalHours * 100);
  const extraCost = extraHardware;

  return {
    drive,
    hoistway,
    cab,
    stops,
    travelFeet,
    capacityLbs,
    travelMiles,
    includePit,
    includeMachineRoom,
    includeAutoDoors,
    includeBattery,
    includeFeeder,
    includePermit,
    loadedWage,
    hoursTravel,
    hoursUnit,
    hoursHoistway,
    hoursCab,
    hoursPit: hoursPitApplied,
    hoursMachineRoom: hoursMachineApplied,
    hoursAutoDoors: hoursDoorsApplied,
    hoursBattery: hoursBatteryApplied,
    hoursFeeder: hoursFeederApplied,
    hoursPermit: hoursPermitApplied,
    siteHours,
    extraWorkHours,
    totalHours,
    laborCost,
    unitMaterial,
    hoistwayMaterial,
    cabMaterial,
    pitMaterial,
    machineMaterial,
    doorsMaterial,
    batteryMaterial,
    feederMaterial,
    permitMaterial,
    travelInvoice,
    extraHardware,
    extraCost,
    fixtureMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerStop: stops === 0 ? null : price / stops,
    pricePerTravelFt: travelFeet === 0 ? null : price / travelFeet,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      fixture: costShare(fixtureMaterial),
      extra: costShare(extraCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      travel: hourShare(hoursTravel),
      unit: hourShare(hoursUnit),
      hoistway: hourShare(hoursHoistway),
      cab: hourShare(hoursCab),
      pit: hourShare(hoursPitApplied),
      machineRoom: hourShare(hoursMachineApplied),
      autoDoors: hourShare(hoursDoorsApplied),
      battery: hourShare(hoursBatteryApplied),
      feeder: hourShare(hoursFeederApplied),
      permit: hourShare(hoursPermitApplied),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perStop: stops === 0 ? null : proposedPrice / stops,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same house four ways — pneumatic, winding drum,
 * hydraulic, traction MRL — from the suggested drive kits so
 * the contractor can see when a shaft job is not an $18,995
 * special. User-typed drive rates are not reused here: the
 * comparison is apples-to-apples on the starting figures.
 * Hoistway and cab kits stay with the current job.
 */
export function compareDrive(input) {
  const hoistwayKit = suggestedHoistwayKit(String(input.hoistway ?? 'through-floor'));
  const cabKit = suggestedCabKit(String(input.cab ?? 'acrylic'));
  const extraKit = suggestedExtraKit();
  const rows = DRIVE_PRESETS.map((preset) => {
    const kit = suggestedDriveKit(preset.id);
    const bid = calculateBid({
      ...input,
      drive: preset.id,
      ...hoistwayKit,
      ...cabKit,
      ...extraKit,
      ...kit,
    });
    return {
      drive: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerStop: bid.pricePerStop,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursUnit: bid.hoursUnit,
      unitMaterial: bid.unitMaterial,
      breakEvenPrice: bid.breakEvenPrice,
    };
  });
  const cheapest = Math.min(...rows.map((row) => row.price));
  const pneumatic = rows.find((row) => row.drive === 'pneumatic');
  return rows
    .map((row) => ({
      ...row,
      cheapest: row.price === cheapest,
      delta: row.price - cheapest,
      upgradeFromPneumatic: pneumatic ? row.price - pneumatic.price : 0,
    }))
    .sort((a, b) => a.price - b.price);
}

/**
 * Price the same house five ways — through-floor, existing shaft,
 * new wood, new masonry, glass — from the suggested hoistway kits
 * so the contractor can see the shaft a homeowner is actually
 * asking for. User-typed hoistway rates are not reused here.
 * Drive and cab kits stay with the current job.
 */
export function compareHoistway(input) {
  const driveKit = suggestedDriveKit(String(input.drive ?? 'pneumatic'));
  const cabKit = suggestedCabKit(String(input.cab ?? 'acrylic'));
  const extraKit = suggestedExtraKit();
  const rows = HOISTWAY_PRESETS.map((preset) => {
    const kit = suggestedHoistwayKit(preset.id);
    const bid = calculateBid({
      ...input,
      hoistway: preset.id,
      ...driveKit,
      ...cabKit,
      ...extraKit,
      ...kit,
    });
    return {
      hoistway: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      hoursHoistway: bid.hoursHoistway,
      hoistwayMaterial: bid.hoistwayMaterial,
      extraCost: bid.extraCost,
      breakEvenPrice: bid.breakEvenPrice,
    };
  });
  const cheapest = Math.min(...rows.map((row) => row.price));
  const throughFloor = rows.find((row) => row.hoistway === 'through-floor');
  return rows
    .map((row) => ({
      ...row,
      cheapest: row.price === cheapest,
      delta: row.price - cheapest,
      upgradeFromThroughFloor: throughFloor ? row.price - throughFloor.price : 0,
    }))
    .sort((a, b) => a.price - b.price);
}

/**
 * Price the same house four ways — acrylic tube, standard enclosed,
 * wood-panel, glass — from the suggested cab kits so the contractor
 * can see when a glass-cab ask is not the cheap-special acrylic
 * number. User-typed cab rates are not reused here: the comparison
 * is apples-to-apples on the starting figures. Drive and hoistway
 * kits stay with the current job.
 */
export function compareCab(input) {
  const driveKit = suggestedDriveKit(String(input.drive ?? 'pneumatic'));
  const hoistwayKit = suggestedHoistwayKit(String(input.hoistway ?? 'through-floor'));
  const extraKit = suggestedExtraKit();
  const rows = CAB_PRESETS.map((preset) => {
    const kit = suggestedCabKit(preset.id);
    const bid = calculateBid({
      ...input,
      cab: preset.id,
      ...driveKit,
      ...hoistwayKit,
      ...extraKit,
      ...kit,
    });
    return {
      cab: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      hoursCab: bid.hoursCab,
      cabMaterial: bid.cabMaterial,
      extraCost: bid.extraCost,
      breakEvenPrice: bid.breakEvenPrice,
    };
  });
  const cheapest = Math.min(...rows.map((row) => row.price));
  const acrylic = rows.find((row) => row.cab === 'acrylic');
  return rows
    .map((row) => ({
      ...row,
      cheapest: row.price === cheapest,
      delta: row.price - cheapest,
      upgradeFromAcrylic: acrylic ? row.price - acrylic.price : 0,
    }))
    .sort((a, b) => a.price - b.price);
}

/**
 * One-line verdict for the four-cab table. Acrylic is the
 * cheap-special tube; glass is the upgrade they ask for after
 * they have already shopped that number.
 */
export function cabNote(rows) {
  if (!Array.isArray(rows) || rows.length < 4) {
    throw new Error('cab comparison missing rows');
  }
  const acrylic = rows.find((row) => row.cab === 'acrylic');
  const standard = rows.find((row) => row.cab === 'standard');
  const wood = rows.find((row) => row.cab === 'wood-panel');
  const glass = rows.find((row) => row.cab === 'glass-cab');
  if (!acrylic || !standard || !wood || !glass) {
    throw new Error('cab comparison missing rows');
  }
  return [
    `The acrylic tube is the cheap-special cab at ${money(acrylic.price)}.`,
    `A standard enclosed cab adds ${money(standard.upgradeFromAcrylic)}.`,
    `Wood-panel adds ${money(wood.upgradeFromAcrylic)}.`,
    `Glass adds ${money(glass.upgradeFromAcrylic)} (${money(glass.price)}).`,
    'Matching the acrylic number on a glass-cab ask is the losing bid.',
  ].join(' ');
}

export const SUPPLY_PRESETS = Object.freeze([
  {
    id: 'contractor-supplied',
    label: 'You supply the unit',
    detail: 'Unit invoice stays in the bid',
  },
  {
    id: 'owner-fits',
    label: 'Owner supplies — it fits',
    detail: 'No unit invoice, same set hours',
  },
  {
    id: 'owner-wrong',
    label: 'Owner supplies — wrong opening',
    detail: 'Second trip plus an adapter / floor-frame kit',
  },
]);

/**
 * Starting callback hours and opening hardware when the
 * owner's store-bought vacuum unit does not match the
 * hoistway. Taken from the extra-kit trip, the permit
 * hours (re-cut / resubmit), and the pit invoice (adapter
 * plates / floor-frame) so a typed unit invoice does not
 * leak into the "they bought it" case.
 */
export function suggestedOwnerCallbackKit() {
  const extra = suggestedExtraKit();
  return {
    hoursCallbackTrip: extra.hoursTrip,
    hoursWrongOpening: extra.hoursPermit,
    wrongOpeningInvoice: extra.pitInvoice,
  };
}

function scoreInstallOnly(bid, installPrice) {
  if (installPrice === null) return null;
  return {
    price: installPrice,
    profit: installPrice - bid.totalCost,
    margin: installPrice === 0 ? 0 : (installPrice - bid.totalCost) / installPrice * 100,
    hourlyRate: bid.totalHours === 0 ? null : installPrice / bid.totalHours,
    belowBreakEven: installPrice < bid.totalCost,
  };
}

/**
 * Price the same house three ways: you supply the unit, the
 * owner supplies one that fits, or the owner supplies one
 * that does not fit and costs a second trip.
 *
 * Owner rows zero the unit invoice and keep the current set
 * hours — setting their Stiltz / Savaria is still a set. The
 * wrong-opening row adds a starting inspect trip and adapter
 * / floor-frame hardware on top of the current rates so a
 * typed invoice does not leak into the "they bought it"
 * case. Cab invoice stays off the owner-row override except
 * as the callback hardware line so unitInvoice never appears
 * on an owner row.
 *
 * An install-only price (options.installOnlyPrice, else the
 * proposed price on the bid) is scored against each cost
 * base. That is the $4,995 "just install what I bought"
 * number contractors actually get shopped on.
 */
export function compareOwnerSupply(input, options = {}) {
  const callback = suggestedOwnerCallbackKit();
  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursCab = number(input.hoursCab ?? 0, 'Cab hours');
  const cabInvoice = number(input.cabInvoice ?? 0, 'Cab invoice');

  let installPrice = null;
  const rawInstall = options.installOnlyPrice !== undefined
    ? options.installOnlyPrice
    : input.proposedPrice;
  if (rawInstall !== null && rawInstall !== undefined && rawInstall !== '') {
    installPrice = number(rawInstall, 'Install-only price');
  }

  const contractor = calculateBid(input);
  const ownerFits = calculateBid({ ...input, unitInvoice: 0 });
  const ownerWrong = calculateBid({
    ...input,
    unitInvoice: 0,
    hoursTrip: hoursTrip + callback.hoursCallbackTrip,
    hoursCab: hoursCab + callback.hoursWrongOpening,
    cabInvoice: cabInvoice + callback.wrongOpeningInvoice,
  });

  const rows = [
    {
      supply: 'contractor-supplied',
      label: SUPPLY_PRESETS[0].label,
      detail: SUPPLY_PRESETS[0].detail,
      bid: contractor,
    },
    {
      supply: 'owner-fits',
      label: SUPPLY_PRESETS[1].label,
      detail: SUPPLY_PRESETS[1].detail,
      bid: ownerFits,
    },
    {
      supply: 'owner-wrong',
      label: SUPPLY_PRESETS[2].label,
      detail: SUPPLY_PRESETS[2].detail,
      bid: ownerWrong,
    },
  ].map((row) => ({
    supply: row.supply,
    label: row.label,
    detail: row.detail,
    price: row.bid.price,
    totalCost: row.bid.totalCost,
    totalHours: row.bid.totalHours,
    fixtureMaterial: row.bid.fixtureMaterial,
    cabMaterial: row.bid.cabMaterial,
    hoursTravel: row.bid.hoursTravel,
    hoursCab: row.bid.hoursCab,
    hoursUnit: row.bid.hoursUnit,
    breakEvenPrice: row.bid.breakEvenPrice,
    installOnly: scoreInstallOnly(row.bid, installPrice),
    savedVsContractor: contractor.price - row.bid.price,
  }));

  const cheapest = Math.min(...rows.map((row) => row.price));
  return rows.map((row) => ({
    ...row,
    cheapest: row.price === cheapest,
    delta: row.price - cheapest,
    installOnlyPrice: installPrice,
  }));
}

/**
 * One-line verdict for the owner-supplied table. Names the
 * install-only loss when that number is on the table; otherwise
 * names the bid drop from zeroing the unit invoice.
 */
export function ownerSupplyNote(rows) {
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new Error('Owner-supply comparison is missing rows');
  }
  const contractor = rows.find((row) => row.supply === 'contractor-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const wrong = rows.find((row) => row.supply === 'owner-wrong');
  if (!contractor || !fits || !wrong) {
    throw new Error('Owner-supply comparison is missing a supply row');
  }

  const drop = contractor.price - fits.price;
  const callbackLift = wrong.price - fits.price;
  if (contractor.installOnly && fits.installOnly) {
    const asked = contractor.installOnly.price;
    if (contractor.installOnly.belowBreakEven && fits.installOnly.belowBreakEven) {
      return `At ${money(asked)} install-only you lose money even when they bought the unit. Walk-away on the owner-supplied set is ${money(fits.breakEvenPrice)}.`;
    }
    if (contractor.installOnly.belowBreakEven && !fits.installOnly.belowBreakEven) {
      if (wrong.installOnly?.belowBreakEven) {
        return `At ${money(asked)} the contractor-supplied job loses ${money(Math.abs(contractor.installOnly.profit))}. The same install-only number covers the set if their unit actually fits. A wrong-opening callback still loses ${money(Math.abs(wrong.installOnly.profit))} — walk-away then is ${money(wrong.breakEvenPrice)}.`;
      }
      return `At ${money(asked)} the contractor-supplied job loses ${money(Math.abs(contractor.installOnly.profit))}. The same install-only number covers the set if their unit actually fits.`;
    }
    if (wrong.installOnly?.belowBreakEven) {
      return `At ${money(asked)} the set covers if their unit fits. A wrong-opening callback still loses ${money(Math.abs(wrong.installOnly.profit))} — walk-away then is ${money(wrong.breakEvenPrice)}.`;
    }
    return `At ${money(asked)} both supply paths hold a margin. A wrong-opening callback still adds ${money(callbackLift)} to the bid.`;
  }
  return `Zeroing the unit invoice drops the bid ${money(drop)}. A wrong-opening callback puts ${money(callbackLift)} back on.`;
}

export const ACCESS_PRESETS = Object.freeze([
  {
    id: 'weekday-scheduled',
    label: 'Weekday, they leave',
    detail: 'Standard factory freight; empty house; weekday inspector',
  },
  {
    id: 'discharge-week',
    label: 'Discharge week, they stay',
    detail: 'Next-day unit air freight plus a slower occupied set',
  },
  {
    id: 'after-hours',
    label: 'Saturday / after-hours discharge',
    detail: 'Air freight, overtime, a second dispatch, and a weekend inspector',
  },
]);

/**
 * Starting pace, overtime, next-day unit air freight, and a
 * weekend inspector when the family will not wait for a
 * weekday slot after a hospital discharge. Occupied pace is
 * a multiplier on the typed set, hoistway, cab, extras, and
 * punch-list hours — working around someone who just came
 * home, with a hole in the floor, is slower, not a different
 * wage. After-hours is time-and-a-half on the typed wage
 * plus a second dispatch from the extra-kit trip, so a typed
 * 9-hour trip does not inflate the extra emergency run.
 * Expedite freight is a starting next-day air ticket on the
 * unit (hundreds of pounds, not a stair-lift rail) on top of
 * the typed other-cost line; weekday ground freight stays in
 * the unit invoice. After-hours also adds a starting weekend
 * / after-hours inspector ticket — a home elevator still
 * needs an AHJ, and Saturday is not the weekday inspector.
 */
export function suggestedAccessKit() {
  const extra = suggestedExtraKit();
  return {
    occupiedPaceMultiplier: 1.22,
    afterHoursWageMultiplier: 1.5,
    afterHoursExtraTripHours: extra.hoursTrip,
    expediteFreight: 2450,
    rushInspectionInvoice: 925,
  };
}

/**
 * Price the same house three ways: weekday they leave with
 * factory ground freight, discharge week while they stay
 * home with next-day unit air freight, or Saturday /
 * after-hours discharge with overtime and a weekend inspector.
 *
 * Discharge week keeps the typed wage and adds clock hours on
 * the on-house work plus a starting expedite ticket. After-hours
 * keeps the typed hours, raises the wage, adds a starting
 * second dispatch, the same expedite ticket, and a starting
 * weekend inspector — a Friday discharge is not a stop you
 * combine with a weekday route, and the AHJ does not come
 * with the factory crate. Drive, hoistway, cab, and extras stay.
 *
 * A proposed price (options.installOnlyPrice, else the
 * proposed price on the bid) is scored against each cost
 * base. That is the "$18,995 Saturday, mom comes home Friday"
 * number contractors actually get shopped on.
 */
export function compareAccess(input, options = {}) {
  const kit = suggestedAccessKit();
  const hoursSetBase = number(input.hoursSetBase ?? 0, 'Set-base hours');
  const hoursPerStop = number(input.hoursPerStop ?? 0, 'Hours per stop');
  const hoursPerTravelFt = number(input.hoursPerTravelFt ?? 0, 'Hours per travel foot');
  const hoursHoistwayPerFt = number(input.hoursHoistwayPerFt ?? 0, 'Hoistway hours per foot');
  const hoursCutPerStop = number(input.hoursCutPerStop ?? 0, 'Cut hours per stop');
  const hoursCab = number(input.hoursCab ?? 0, 'Cab hours');
  const hoursPit = number(input.hoursPit ?? 0, 'Pit hours');
  const hoursMachineRoom = number(input.hoursMachineRoom ?? 0, 'Machine-room hours');
  const hoursAutoDoors = number(input.hoursAutoDoors ?? 0, 'Auto-door hours');
  const hoursBattery = number(input.hoursBattery ?? 0, 'Battery hours');
  const hoursFeeder = number(input.hoursFeeder ?? 0, 'Feeder hours');
  const hoursPermit = number(input.hoursPermit ?? 0, 'Permit hours');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');
  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const pace = kit.occupiedPaceMultiplier;

  let installPrice = null;
  const rawInstall = options.installOnlyPrice !== undefined
    ? options.installOnlyPrice
    : input.proposedPrice;
  if (rawInstall !== null && rawInstall !== undefined && rawInstall !== '') {
    installPrice = number(rawInstall, 'Install-only price');
  }

  const weekday = calculateBid(input);
  const discharge = calculateBid({
    ...input,
    hoursSetBase: hoursSetBase * pace,
    hoursPerStop: hoursPerStop * pace,
    hoursPerTravelFt: hoursPerTravelFt * pace,
    hoursHoistwayPerFt: hoursHoistwayPerFt * pace,
    hoursCutPerStop: hoursCutPerStop * pace,
    hoursCab: hoursCab * pace,
    hoursPit: hoursPit * pace,
    hoursMachineRoom: hoursMachineRoom * pace,
    hoursAutoDoors: hoursAutoDoors * pace,
    hoursBattery: hoursBattery * pace,
    hoursFeeder: hoursFeeder * pace,
    hoursPermit: hoursPermit * pace,
    siteHours: siteHours * pace,
    otherCost: otherCost + kit.expediteFreight,
  });
  const afterHours = calculateBid({
    ...input,
    hourlyWage: hourlyWage * kit.afterHoursWageMultiplier,
    hoursTrip: hoursTrip + kit.afterHoursExtraTripHours,
    otherCost: otherCost + kit.expediteFreight + kit.rushInspectionInvoice,
  });

  const rows = [
    {
      access: 'weekday-scheduled',
      label: ACCESS_PRESETS[0].label,
      detail: ACCESS_PRESETS[0].detail,
      bid: weekday,
      expediteFreight: 0,
      rushInspection: 0,
    },
    {
      access: 'discharge-week',
      label: ACCESS_PRESETS[1].label,
      detail: ACCESS_PRESETS[1].detail,
      bid: discharge,
      expediteFreight: kit.expediteFreight,
      rushInspection: 0,
    },
    {
      access: 'after-hours',
      label: ACCESS_PRESETS[2].label,
      detail: ACCESS_PRESETS[2].detail,
      bid: afterHours,
      expediteFreight: kit.expediteFreight,
      rushInspection: kit.rushInspectionInvoice,
    },
  ].map((row) => ({
    access: row.access,
    label: row.label,
    detail: row.detail,
    price: row.bid.price,
    totalCost: row.bid.totalCost,
    totalHours: row.bid.totalHours,
    loadedWage: row.bid.loadedWage,
    hoursTravel: row.bid.hoursTravel,
    hoursUnit: row.bid.hoursUnit,
    hoursHoistway: row.bid.hoursHoistway,
    hoursCab: row.bid.hoursCab,
    siteHours: row.bid.siteHours,
    laborCost: row.bid.laborCost,
    softCost: row.bid.softCost,
    expediteFreight: row.expediteFreight,
    rushInspection: row.rushInspection,
    breakEvenPrice: row.bid.breakEvenPrice,
    installOnly: scoreInstallOnly(row.bid, installPrice),
    liftFromWeekday: row.bid.price - weekday.price,
  }));

  const cheapest = Math.min(...rows.map((row) => row.price));
  return rows.map((row) => ({
    ...row,
    cheapest: row.price === cheapest,
    delta: row.price - cheapest,
    installOnlyPrice: installPrice,
  }));
}

/**
 * One-line verdict for the access table. Names the Saturday
 * / discharge loss when that number is on the table;
 * otherwise names the bid lift from a weekday slot.
 */
export function accessNote(rows) {
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new Error('Access comparison is missing rows');
  }
  const weekday = rows.find((row) => row.access === 'weekday-scheduled');
  const discharge = rows.find((row) => row.access === 'discharge-week');
  const afterHours = rows.find((row) => row.access === 'after-hours');
  if (!weekday || !discharge || !afterHours) {
    throw new Error('Access comparison is missing an access row');
  }

  const dischargeLift = discharge.price - weekday.price;
  const afterHoursLift = afterHours.price - weekday.price;
  if (weekday.installOnly && afterHours.installOnly) {
    const asked = weekday.installOnly.price;
    if (weekday.installOnly.belowBreakEven && afterHours.installOnly.belowBreakEven) {
      return `At ${money(asked)} you lose money even on a weekday slot. Walk-away after-hours is ${money(afterHours.breakEvenPrice)}.`;
    }
    if (!weekday.installOnly.belowBreakEven && afterHours.installOnly.belowBreakEven) {
      return `At ${money(asked)} the weekday set covers. The same Saturday / discharge number loses ${money(Math.abs(afterHours.installOnly.profit))} — walk-away then is ${money(afterHours.breakEvenPrice)}.`;
    }
    if (discharge.installOnly?.belowBreakEven) {
      return `At ${money(asked)} a weekday slot covers. Discharge week while they stay home still loses ${money(Math.abs(discharge.installOnly.profit))} — walk-away then is ${money(discharge.breakEvenPrice)}.`;
    }
    return `At ${money(asked)} every access window still holds a margin. After-hours still adds ${money(afterHoursLift)} to the bid.`;
  }
  return `Discharge week while they stay home adds ${money(dischargeLift)} to the bid. After-hours / Saturday adds ${money(afterHoursLift)}.`;
}

function money(value) {
  const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Format a bid as a plain-text draft the contractor can paste
 * into a proposal. Costs, wages, and invoices are omitted on
 * purpose — this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Home elevator') {
  const perStop = result.pricePerStop === null
    ? 'n/a'
    : `${money(result.pricePerStop)} / stop`;
  const drive = DRIVE_PRESETS.find((item) => item.id === result.drive)?.label ?? result.drive;
  const hoistway = HOISTWAY_PRESETS.find((item) => item.id === result.hoistway)?.label ?? result.hoistway;
  const cab = CAB_PRESETS.find((item) => item.id === result.cab)?.label ?? result.cab;
  const extras = [
    `${result.travelMiles} travel miles`,
    drive,
    hoistway,
    cab,
    `${result.capacityLbs} lb capacity`,
    `${result.travelFeet} ft of travel`,
    result.includePit ? 'pit included' : 'no pit',
    result.includeMachineRoom ? 'machine closet included' : 'no machine closet',
    result.includeAutoDoors ? 'auto doors included' : 'no auto doors',
    result.includeBattery ? 'battery lowering included' : 'no battery lowering',
    result.includeFeeder ? '240 V feeder included' : 'no 240 V feeder',
    result.includePermit ? 'permit / inspection included' : 'no permit / inspection',
  ].join('; ');
  return [
    'HOME ELEVATOR BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${drive}`,
    `Price per stop: ${perStop}`,
    `Stops / travel: ${result.stops} stops, ${result.travelFeet.toLocaleString('en-US')} ft`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.stops} stops; ${result.travelFeet} ft travel; ${result.capacityLbs} lb; ${drive}; ${hoistway}; ${cab}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; unit: ${result.hoursUnit.toFixed(1)} h; extras: ${result.extraWorkHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm stops, travel, drive, hoistway, cab, extras, and all pricing before sending. It is not an elevator specification, a structural design, a building-code determination, an accessibility determination, a stair lift, a wheelchair ramp, or a product warranty.',
  ].join('\n');
}
