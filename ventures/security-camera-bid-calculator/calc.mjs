// Pure bid arithmetic for a residential or small-commercial IP security camera
// install. No network, no state: every camera, foot of cable, wage, and
// material figure is an input, so the result stays a transparent calculation a
// low-voltage installer can check against their own takeoff rather than a
// claim about what any building "should" cost.
//
// Why this is not a generic job-costing spreadsheet
// ------------------------------------------------
// Three numbers decide whether a camera bid is defensible, and all three are
// arithmetic the trade routinely does by feel:
//
//   * **Storage.** The customer asks for "30 days". Recording days are a
//     function of bitrate, camera count, hours recorded per day, and the drive
//     actually purchased -- and drives come in sizes you can buy, not in the
//     size the math wanted. Quoting 30 days and handing over a system that
//     holds 11 is the single most common failed handover in this trade.
//   * **PoE budget.** Cameras draw watts from the switch. A switch whose
//     budget is under the load does not fail cleanly; it drops cameras
//     intermittently, months later, and every one of those is a callback the
//     bid never priced.
//   * **Run length.** Ethernet stops at 100 m / 328 ft. A run past it needs a
//     switch, an extender, or a different path, and finding that out on
//     install day is a change order the customer did not agree to.
//
// So this computes all three as required, explained outputs rather than leaving
// them to the walkthrough. The money numbers (cost floor, walk-away price,
// margin) are the same arithmetic every bid calculator here does; the three
// above are what make the bid one an installer can stand behind.
//
// Nothing here is a manufacturer specification, an ONVIF profile, a fire or
// building code ruling, or a guarantee that a given camera hits a given
// bitrate. Bitrates especially are typical figures for planning; a scene full
// of moving foliage will exceed them and a static hallway will beat them.

export const INPUT_FIELDS = Object.freeze([
  'cameraCount',
  'resolution',
  'codec',
  'recordingMode',
  'motionPercent',
  'recordHoursPerDay',
  'retentionDays',
  'driveSizeTb',
  'driveCount',
  'switchPoeBudgetWatts',
  'cameraWatts',
  'construction',
  'avgCableFeet',
  'longestRunFeet',
  'liftRequired',
  'cameraHardware',
  'nvrHardware',
  'switchHardware',
  'drivePricePerTb',
  'cablePricePerFoot',
  'otherMaterials',
  'hoursPerDrop',
  'commissioningHours',
  'otherHours',
  'hourlyWage',
  'burdenRate',
  'overheadRate',
  'targetMargin',
  'permitFee',
  'proposedPrice',
]);

// Typical planning bitrates in megabits per second at 15 fps, the frame rate
// most installs are actually configured to. These are planning figures, not a
// manufacturer promise -- see the note at the top of this file.
//
// H.265 is roughly half of H.264 for the same scene; "H.265+"/"Smart codec"
// vendors' extra saving only materialises on static scenes, so it is credited
// conservatively rather than at the marketing number.
export const RESOLUTIONS = Object.freeze([
  { label: '2 MP (1080p)', resolution: '2mp', h264Mbps: 4 },
  { label: '4 MP (2K)', resolution: '4mp', h264Mbps: 8 },
  { label: '5 MP', resolution: '5mp', h264Mbps: 10 },
  { label: '8 MP (4K)', resolution: '8mp', h264Mbps: 16 },
  { label: '12 MP (multisensor / fisheye)', resolution: '12mp', h264Mbps: 24 },
]);

export const CODECS = Object.freeze([
  { label: 'H.264', codec: 'h264', factor: 1 },
  { label: 'H.265 / HEVC', codec: 'h265', factor: 0.5 },
  { label: 'H.265+ / smart codec', codec: 'h265plus', factor: 0.35 },
]);

// Hours to pull, terminate, mount and aim one camera, by what the installer is
// working through. These are starting points a shop is expected to overwrite
// with its own numbers -- `hoursPerDrop` is an input for exactly that reason.
export const CONSTRUCTION_TYPES = Object.freeze([
  { label: 'Open ceiling / new construction', construction: 'open', hoursPerDrop: 1.2 },
  { label: 'Finished drywall, accessible attic', construction: 'attic', hoursPerDrop: 2 },
  { label: 'Finished drywall, no attic access', construction: 'finished', hoursPerDrop: 3.2 },
  { label: 'Masonry / concrete', construction: 'masonry', hoursPerDrop: 4 },
  { label: 'Exterior soffit, two storey', construction: 'soffit', hoursPerDrop: 3 },
]);

// Drive sizes a distributor actually stocks in surveillance-rated units. The
// bid has to land on one of these, which is the whole reason "days you asked
// for" and "days you get" are different outputs.
export const DRIVE_SIZES_TB = Object.freeze([1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);

// 802.3af is 15.4 W at the switch port, 802.3at ("PoE+") is 30 W. Cameras with
// heaters and PTZs are the ones that push a budget over.
export const CAMERA_WATT_PRESETS = Object.freeze([
  { label: 'Fixed dome / turret (no heater)', cameraWatts: 6 },
  { label: 'Bullet with IR', cameraWatts: 9 },
  { label: 'Bullet with heater', cameraWatts: 13 },
  { label: 'PTZ (PoE+)', cameraWatts: 25 },
]);

// The 100 m / 328 ft limit is the Ethernet standard's, not a vendor's. Bid a
// run past it with a remedy in the scope, not as a surprise on install day.
export const MAX_ETHERNET_FEET = 328;

const number = (value, name, { min = 0, allowZero = true } = {}) => {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
};

const round2 = (value) => Math.round(value * 100) / 100;
// Storage figures are small numbers with large consequences: a single camera
// can be 0.0864 TB/day, which two decimals rounds to 0.09 — a 4% error that
// lands straight on the retention the customer is quoted. Money rounds to
// cents; storage does not.
const round4 = (value) => Math.round(value * 10000) / 10000;

/** The planning bitrate for one camera, in Mbps, before recording mode. */
export function cameraBitrateMbps(resolution, codec) {
  const res = RESOLUTIONS.find((r) => r.resolution === resolution);
  if (!res) throw new Error(`Unknown resolution: ${resolution}`);
  const cod = CODECS.find((c) => c.codec === codec);
  if (!cod) throw new Error(`Unknown codec: ${codec}`);
  return round2(res.h264Mbps * cod.factor);
}

/**
 * Storage the system needs, and — separately — the retention the drives you
 * actually buy will deliver.
 *
 * These are two different numbers and the gap between them is the point. The
 * arithmetic wants 17.3 TB; you can buy 16 or 18; whichever you put in the
 * quote decides whether the customer gets the 30 days you wrote down. So the
 * caller gets `terabytesRequired` (what the retention asked for) and
 * `actualRetentionDays` (what the purchased drives hold), and the page shows
 * both rather than quietly rounding one into the other.
 *
 * Motion-only recording multiplies by the share of the day that actually has
 * motion. It is a planning estimate and a busy street will beat it, which is
 * why the page says so next to the field.
 */
export function calculateStorage(input) {
  const cameraCount = number(input.cameraCount ?? 0, 'Camera count');
  const bitrate = cameraBitrateMbps(input.resolution ?? '4mp', input.codec ?? 'h265');
  const hoursPerDay = number(input.recordHoursPerDay ?? 24, 'Recording hours per day');
  if (hoursPerDay > 24) throw new Error('Recording hours per day cannot exceed 24');
  const retentionDays = number(input.retentionDays ?? 30, 'Retention days');
  const mode = input.recordingMode ?? 'continuous';
  const motionPercent = number(input.motionPercent ?? 100, 'Motion percent');
  if (motionPercent > 100) throw new Error('Motion percent cannot exceed 100');
  const dutyCycle = mode === 'motion' ? motionPercent / 100 : 1;

  // Mbps -> TB: bits/s * seconds / 8 bits per byte / 1e12 bytes per TB.
  // Drive vendors sell decimal terabytes, so the divisor is 1e12 and not 2^40 —
  // using the binary figure here would silently over-promise retention by 10%.
  const secondsRecorded = hoursPerDay * 3600 * retentionDays * dutyCycle;
  const terabytesRequired = round2((bitrate * cameraCount * secondsRecorded) / 8 / 1e6);

  const driveSizeTb = number(input.driveSizeTb ?? 0, 'Drive size');
  const driveCount = number(input.driveCount ?? 0, 'Drive count');
  const purchasedTb = round2(driveSizeTb * driveCount);

  // Usable space is not the label on the drive: the filesystem and the NVR's
  // own overwrite headroom take a slice. 90% is the conservative planning
  // figure, and being conservative here is the correct direction — it makes
  // the quoted retention one the system can actually hold.
  const usableTb = round2(purchasedTb * 0.9);
  // Divided at full precision, then rounded once. Rounding the per-day figure
  // first and dividing by it would put its rounding error into the retention.
  const exactPerDayTb = (bitrate * cameraCount * hoursPerDay * 3600 * dutyCycle) / 8 / 1e6;
  const perDayTb = round4(exactPerDayTb);
  const actualRetentionDays = exactPerDayTb > 0 ? round2(usableTb / exactPerDayTb) : Infinity;

  return {
    // The job's own inputs travel with the figures derived from them. A result
    // that says "41.67 days" without saying "30 quoted, 2 x 8 TB fitted" cannot
    // describe the system to the customer agreeing to it, which is what the
    // proposal's scope has to do. See platform/proposal/README.md.
    retentionDaysQuoted: retentionDays,
    driveSizeTb,
    driveCount,
    bitrateMbpsPerCamera: bitrate,
    aggregateBitrateMbps: round2(bitrate * cameraCount),
    terabytesRequired,
    terabytesPerDay: perDayTb,
    purchasedTb,
    usableTb,
    actualRetentionDays,
    // The bid is short when the drives cannot hold what the customer was told.
    meetsRetention: actualRetentionDays >= retentionDays,
    shortfallDays: actualRetentionDays >= retentionDays ? 0 : round2(retentionDays - actualRetentionDays),
    // The smallest stocked drive that, at this drive count, covers the ask.
    // `null` when even the largest stocked size cannot, which is a real answer:
    // the design needs more bays, not a bigger drive.
    recommendedDriveSizeTb: recommendDriveSize(terabytesRequired, driveCount),
  };
}

/** Smallest stocked drive size that covers `terabytesRequired` across `driveCount` bays. */
export function recommendDriveSize(terabytesRequired, driveCount) {
  if (!(driveCount > 0)) return null;
  // Matches the 90% usable headroom `calculateStorage` plans against, so the
  // recommendation and the retention check cannot disagree.
  const needPerDrive = terabytesRequired / driveCount / 0.9;
  return DRIVE_SIZES_TB.find((size) => size >= needPerDrive) ?? null;
}

/**
 * PoE load against the switch budget.
 *
 * Undersizing here is the defect that does not announce itself: the system
 * passes handover and starts dropping cameras when the last one is aimed or
 * when the heaters come on in November.
 */
export function calculatePoe(input) {
  const cameraCount = number(input.cameraCount ?? 0, 'Camera count');
  const cameraWatts = number(input.cameraWatts ?? 0, 'Watts per camera');
  const budget = number(input.switchPoeBudgetWatts ?? 0, 'Switch PoE budget');
  const load = round2(cameraCount * cameraWatts);
  return {
    loadWatts: load,
    budgetWatts: budget,
    headroomWatts: round2(budget - load),
    withinBudget: load <= budget,
    // A switch run at its rated ceiling has nothing left for the camera added
    // next spring, and heaters push draw up in winter. 80% is the planning
    // ceiling this tool flags against.
    withinComfortableBudget: budget > 0 && load <= budget * 0.8,
  };
}

/** Whether the longest run clears the Ethernet limit. */
export function calculateCabling(input) {
  const cameraCount = number(input.cameraCount ?? 0, 'Camera count');
  const avgCableFeet = number(input.avgCableFeet ?? 0, 'Average cable feet per drop');
  const longestRunFeet = number(input.longestRunFeet ?? 0, 'Longest run');
  // Cable is pulled, not measured to the inch: a 15% waste allowance is what
  // keeps the box count honest against service loops and re-pulls.
  const totalFeet = Math.ceil(cameraCount * avgCableFeet * 1.15);
  return {
    totalCableFeet: totalFeet,
    longestRunFeet,
    exceedsEthernetLimit: longestRunFeet > MAX_ETHERNET_FEET,
    feetOverLimit: longestRunFeet > MAX_ETHERNET_FEET ? round2(longestRunFeet - MAX_ETHERNET_FEET) : 0,
  };
}

/** Hours per drop for a construction type, or null when it is not a known one. */
export function hoursPerDropFor(construction) {
  return CONSTRUCTION_TYPES.find((c) => c.construction === construction)?.hoursPerDrop ?? null;
}

/**
 * The whole bid: engineering checks, then the money.
 *
 * Every rate is an input. Nothing here asserts what a job "should" cost — it
 * costs what this shop's wage, burden, overhead, and margin say it costs.
 */
export function calculateBid(input) {
  const cameraCount = number(input.cameraCount ?? 0, 'Camera count', { min: 1, allowZero: false });
  if (!Number.isInteger(cameraCount)) throw new Error('Camera count must be a whole number');

  const storage = calculateStorage(input);
  const poe = calculatePoe(input);
  const cabling = calculateCabling(input);

  // An explicit hoursPerDrop wins over the construction preset, so a shop that
  // knows its own number is never overridden by ours.
  const presetHours = hoursPerDropFor(input.construction ?? 'attic');
  const hoursPerDrop = input.hoursPerDrop === '' || input.hoursPerDrop == null
    ? (presetHours ?? 2)
    : number(input.hoursPerDrop, 'Hours per drop');

  const commissioningHours = number(input.commissioningHours ?? 0, 'Commissioning hours');
  const otherHours = number(input.otherHours ?? 0, 'Other hours');
  // A lift is a day the crew is not pulling cable anywhere else, and it is
  // billable time the flat "per camera" price forgets.
  const liftHours = input.liftRequired === 'yes' || input.liftRequired === true ? 4 : 0;
  const labourHours = round2(cameraCount * hoursPerDrop + commissioningHours + otherHours + liftHours);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Burden rate');
  const loadedHourlyRate = round2(hourlyWage * (1 + burdenRate / 100));
  const labourCost = round2(labourHours * loadedHourlyRate);

  const cameraHardware = number(input.cameraHardware ?? 0, 'Camera hardware');
  const nvrHardware = number(input.nvrHardware ?? 0, 'NVR hardware');
  const switchHardware = number(input.switchHardware ?? 0, 'Switch hardware');
  const drivePricePerTb = number(input.drivePricePerTb ?? 0, 'Drive price per TB');
  const cablePricePerFoot = number(input.cablePricePerFoot ?? 0, 'Cable price per foot');
  const otherMaterials = number(input.otherMaterials ?? 0, 'Other materials');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const cameraMaterialCost = round2(cameraCount * cameraHardware);
  const driveCost = round2(storage.purchasedTb * drivePricePerTb);
  const cableCost = round2(cabling.totalCableFeet * cablePricePerFoot);
  const materialCost = round2(
    cameraMaterialCost + nvrHardware + switchHardware + driveCost + cableCost + otherMaterials,
  );

  const directCost = round2(labourCost + materialCost + permitFee);
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead rate');
  const overheadCost = round2(directCost * (overheadRate / 100));
  // The walk-away price: below this the job costs the shop money to perform.
  // It is the number to hold when a customer asks you to match a lower bid.
  const costFloor = round2(directCost + overheadCost);

  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be below 100');
  // Margin on revenue, not markup on cost. Quoting cost x 1.3 and calling it a
  // 30% margin is the arithmetic error that makes a shop's year disappear.
  const bidPrice = round2(costFloor / (1 - targetMargin / 100));

  const proposedPrice = input.proposedPrice === '' || input.proposedPrice == null
    ? null
    : number(input.proposedPrice, 'Proposed price');
  const proposedMarginPercent = proposedPrice && proposedPrice > 0
    ? round2(((proposedPrice - costFloor) / proposedPrice) * 100)
    : null;

  return {
    cameraCount,
    storage,
    poe,
    cabling,
    hoursPerDrop,
    labourHours,
    loadedHourlyRate,
    labourCost,
    cameraMaterialCost,
    driveCost,
    cableCost,
    materialCost,
    directCost,
    overheadCost,
    costFloor,
    bidPrice,
    pricePerCamera: round2(bidPrice / cameraCount),
    costFloorPerCamera: round2(costFloor / cameraCount),
    proposedPrice,
    proposedMarginPercent,
    proposedBeatsFloor: proposedPrice == null ? null : proposedPrice >= costFloor,
    // Anything the installer must resolve before the bid is safe to send.
    // Empty means the three engineering checks all cleared.
    warnings: collectWarnings({ storage, poe, cabling, input }),
  };
}

/**
 * The checks that should stop a bid going out, phrased as what to do about it.
 *
 * A warning nobody can act on is noise, so each one names the remedy rather
 * than only the fault.
 */
export function collectWarnings({ storage, poe, cabling, input }) {
  const warnings = [];
  if (!storage.meetsRetention) {
    const want = Number(input.retentionDays ?? 30);
    warnings.push(
      `Storage is short: these drives hold about ${storage.actualRetentionDays} days, not the ${want} you are quoting. `
      + (storage.recommendedDriveSizeTb
        ? `Use ${storage.recommendedDriveSizeTb} TB drives, add bays, or quote the shorter retention.`
        : 'No stocked drive size covers this at that bay count — the design needs more bays or lower bitrate.'),
    );
  }
  if (!poe.withinBudget) {
    warnings.push(
      `PoE load is ${poe.loadWatts} W against a ${poe.budgetWatts} W switch budget. Cameras will drop intermittently. `
      + 'Move up a switch, split across two, or add a PoE injector for the high-draw cameras.',
    );
  } else if (!poe.withinComfortableBudget && poe.budgetWatts > 0) {
    warnings.push(
      `PoE load is ${poe.loadWatts} W of a ${poe.budgetWatts} W budget — over 80%. It fits today, but leaves nothing `
      + 'for a camera added later or for heaters in winter.',
    );
  }
  if (cabling.exceedsEthernetLimit) {
    warnings.push(
      `Longest run is ${cabling.longestRunFeet} ft, ${cabling.feetOverLimit} ft past the ${MAX_ETHERNET_FEET} ft Ethernet limit. `
      + 'Price a mid-span switch, a PoE extender, or fibre in the scope now, not on install day.',
    );
  }
  return warnings;
}
