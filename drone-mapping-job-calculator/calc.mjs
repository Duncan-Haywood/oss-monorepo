// Flight planning and job pricing arithmetic for an aerial mapping sortie.
//
// Everything here is deterministic optics and kinematics. There is no model,
// no lookup service and no network call: a pilot must be able to re-derive
// every number on paper, because the output of this worksheet is a price they
// put in front of a client and then have to live with.
//
// The one modelling choice worth stating up front is the site shape. Acreage
// alone does not determine a flight -- a long thin corridor and a square block
// of the same area fly very differently -- so this assumes a **square** site
// and says so on the page. A square is the shape that minimises perimeter for
// a given area, which makes it the *optimistic* end of the range rather than a
// neutral guess. Reporting an optimistic flight time as if it were exact is
// how a mapping job goes over, so the page labels it and the notes say which
// direction the error runs.

/** Part 107 §107.51(b) ceiling: 400 ft AGL, in metres. */
export const PART_107_CEILING_M = 121.92;

/**
 * Sensor geometry for the aircraft most often flown on commercial mapping
 * work. Only three numbers matter to ground sample distance -- physical
 * sensor width, focal length, and image width in pixels -- so that is all
 * that is carried here.
 *
 * `focalLengthMm` is the **actual** focal length, never the "35 mm
 * equivalent". Using the equivalent with the physical sensor width is the
 * single most common way a hand-rolled GSD spreadsheet comes out wrong, and
 * it fails quietly: the number looks plausible and the flight comes back at
 * the wrong resolution.
 */
export const SENSOR_PRESETS = {
  'mavic-3e': {
    label: 'DJI Mavic 3E (4/3", 20 MP)',
    sensorWidthMm: 17.3,
    focalLengthMm: 12.29,
    imageWidthPx: 5280,
    imageHeightPx: 3956,
  },
  'phantom-4-rtk': {
    label: 'DJI Phantom 4 RTK (1", 20 MP)',
    sensorWidthMm: 13.2,
    focalLengthMm: 8.8,
    imageWidthPx: 5472,
    imageHeightPx: 3648,
  },
  'air-2s': {
    label: 'DJI Air 2S (1", 20 MP)',
    sensorWidthMm: 13.2,
    focalLengthMm: 8.38,
    imageWidthPx: 5472,
    imageHeightPx: 3648,
  },
  'm300-p1-35': {
    label: 'DJI M300 + Zenmuse P1, 35 mm (full frame, 45 MP)',
    sensorWidthMm: 35.9,
    focalLengthMm: 35,
    imageWidthPx: 8192,
    imageHeightPx: 5460,
  },
  'mini-4-pro': {
    label: 'DJI Mini 4 Pro (1/1.3", 48 MP)',
    sensorWidthMm: 9.6,
    focalLengthMm: 6.72,
    imageWidthPx: 8064,
    imageHeightPx: 6048,
  },
};

const SQ_M_PER_ACRE = 4046.8564224;

/**
 * Money, with the sign outside the symbol.
 *
 * `-$9.24`, never `$-9.24`; and a value that rounds to zero prints `$0.00`
 * rather than `-$0.00`, which is a break-even line claiming to be down money.
 * See platform/ci/check_money_sign.py for why this is spelled out in every
 * venture rather than shared.
 */
export function money(value) {
  const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const safe = Object.is(rounded, -0) ? 0 : rounded;
  const body = Math.abs(safe).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${safe < 0 ? '-' : ''}$${body}`;
}

function requireFinite(value, label, { min, max, integer = false } = {}) {
  // `Number(null)` and `Number('')` are both 0, and 0 clears most of the
  // floors below. A blank hourly rate would then price the labour on a job at
  // nothing and report a healthy margin on it, which is the quietest way this
  // worksheet could be wrong. Absent is refused before it can become zero.
  if (value === null || value === undefined || value === '') {
    throw new RangeError(`${label} must be a number`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new RangeError(`${label} must be a number`);
  if (integer && !Number.isInteger(n)) throw new RangeError(`${label} must be a whole number`);
  if (min !== undefined && n < min) throw new RangeError(`${label} must be at least ${min}`);
  if (max !== undefined && n > max) throw new RangeError(`${label} must be at most ${max}`);
  return n;
}

/**
 * Ground sample distance, in centimetres per pixel.
 *
 *   GSD = (sensor width mm x altitude m x 100) / (focal length mm x image width px)
 *
 * The 100 converts metres to centimetres. Sensor width and focal length are
 * both in millimetres so their units cancel, which is why the formula takes a
 * physical sensor width rather than a crop factor.
 */
export function computeGsd({ sensorWidthMm, focalLengthMm, imageWidthPx, altitudeM }) {
  const sw = requireFinite(sensorWidthMm, 'Sensor width', { min: 0.1, max: 100 });
  const fl = requireFinite(focalLengthMm, 'Focal length', { min: 0.1, max: 2000 });
  const iw = requireFinite(imageWidthPx, 'Image width', { min: 100, max: 100000 });
  const alt = requireFinite(altitudeM, 'Altitude', { min: 1, max: 1000 });
  return (sw * alt * 100) / (fl * iw);
}

/** The inverse: the altitude that yields a requested GSD on a given camera. */
export function altitudeForGsd({ sensorWidthMm, focalLengthMm, imageWidthPx, gsdCmPx }) {
  const sw = requireFinite(sensorWidthMm, 'Sensor width', { min: 0.1, max: 100 });
  const fl = requireFinite(focalLengthMm, 'Focal length', { min: 0.1, max: 2000 });
  const iw = requireFinite(imageWidthPx, 'Image width', { min: 100, max: 100000 });
  const gsd = requireFinite(gsdCmPx, 'Target GSD', { min: 0.05, max: 50 });
  return (gsd * fl * iw) / (sw * 100);
}

/**
 * The whole flight, from site area and overlap to images and minutes.
 *
 * The quadratic that drives this product: image count scales as
 * 1 / ((1 - front) x (1 - side)). Going 70/70 -> 80/80 sounds like "a bit
 * more overlap" and is 2.25x the photographs.
 */
export function planFlight(input) {
  const {
    areaAcres,
    altitudeM,
    sensorWidthMm,
    focalLengthMm,
    imageWidthPx,
    imageHeightPx,
    frontOverlapPct,
    sideOverlapPct,
    speedMs,
    usableBatteryMin,
    batteryCount,
    turnSeconds,
  } = input;

  const acres = requireFinite(areaAcres, 'Site area', { min: 0.1, max: 100000 });
  const alt = requireFinite(altitudeM, 'Altitude', { min: 1, max: 1000 });
  const front = requireFinite(frontOverlapPct, 'Front overlap', { min: 0, max: 95 });
  const side = requireFinite(sideOverlapPct, 'Side overlap', { min: 0, max: 95 });
  const speed = requireFinite(speedMs, 'Flight speed', { min: 0.5, max: 30 });
  const battMin = requireFinite(usableBatteryMin, 'Usable flight time per battery', { min: 1, max: 120 });
  const batteries = requireFinite(batteryCount, 'Batteries on hand', { min: 1, max: 60, integer: true });
  const turnSec = requireFinite(turnSeconds, 'Turn overhead', { min: 0, max: 120 });
  const ih = requireFinite(imageHeightPx, 'Image height', { min: 100, max: 100000 });

  const gsdCmPx = computeGsd({ sensorWidthMm, focalLengthMm, imageWidthPx, altitudeM: alt });

  // Footprint of one frame on the ground, in metres.
  const footprintWidthM = (gsdCmPx * requireFinite(imageWidthPx, 'Image width', { min: 100 })) / 100;
  const footprintHeightM = (gsdCmPx * ih) / 100;

  const lineSpacingM = footprintWidthM * (1 - side / 100);
  const triggerSpacingM = footprintHeightM * (1 - front / 100);

  const areaM2 = acres * SQ_M_PER_ACRE;
  const sideLengthM = Math.sqrt(areaM2);

  const lines = Math.max(1, Math.ceil(sideLengthM / lineSpacingM));
  // +1 because a line of length L with photos every d needs one frame at each
  // end: floor(L/d) intervals, so floor(L/d)+1 exposures. Ceil is used so a
  // partial interval still gets its closing frame.
  const photosPerLine = Math.max(2, Math.ceil(sideLengthM / triggerSpacingM) + 1);
  const totalPhotos = lines * photosPerLine;

  const alongLineM = lines * sideLengthM;
  const turnTravelM = Math.max(0, lines - 1) * lineSpacingM;
  const pathLengthM = alongLineM + turnTravelM;

  const flightSeconds = pathLengthM / speed + Math.max(0, lines - 1) * turnSec;
  const flightMinutes = flightSeconds / 60;

  const sortiesNeeded = Math.max(1, Math.ceil(flightMinutes / battMin));
  const batterySwaps = sortiesNeeded - 1;

  return {
    gsdCmPx,
    footprintWidthM,
    footprintHeightM,
    lineSpacingM,
    triggerSpacingM,
    areaM2,
    sideLengthM,
    lines,
    photosPerLine,
    totalPhotos,
    pathLengthM,
    flightMinutes,
    sortiesNeeded,
    batterySwaps,
    batteriesShort: Math.max(0, sortiesNeeded - batteries),
  };
}

/**
 * Field hours, processing hours, cost and the price that clears a target
 * margin.
 *
 * Margin is on the *price*, not a markup on cost: price = cost / (1 - margin).
 * A 40% margin means $40 of every $100 invoiced, which is what a pilot means
 * by it, and is not the same as adding 40% to cost.
 */
export function priceJob(input) {
  const flight = planFlight(input);
  const {
    setupMinutes,
    swapMinutes,
    gcpCount,
    gcpMinutesEach,
    travelMinutes,
    travelMiles,
    mileageRate,
    fieldHourlyRate,
    processingHourlyRate,
    secondsPerImage,
    targetMarginPct,
  } = input;

  const setup = requireFinite(setupMinutes, 'Setup and site walk', { min: 0, max: 600 });
  const swapMin = requireFinite(swapMinutes, 'Minutes per battery swap', { min: 0, max: 60 });
  const gcps = requireFinite(gcpCount, 'Ground control points', { min: 0, max: 200, integer: true });
  const gcpEach = requireFinite(gcpMinutesEach, 'Minutes per ground control point', { min: 0, max: 120 });
  const travelMin = requireFinite(travelMinutes, 'Travel time', { min: 0, max: 1440 });
  const miles = requireFinite(travelMiles, 'Travel distance', { min: 0, max: 5000 });
  const perMile = requireFinite(mileageRate, 'Mileage rate', { min: 0, max: 10 });
  const fieldRate = requireFinite(fieldHourlyRate, 'Field rate', { min: 0, max: 2000 });
  const procRate = requireFinite(processingHourlyRate, 'Processing rate', { min: 0, max: 2000 });
  const secPerImg = requireFinite(secondsPerImage, 'Processing seconds per image', { min: 0, max: 600 });
  const margin = requireFinite(targetMarginPct, 'Target margin', { min: 0, max: 95 });

  const gcpMinutes = gcps * gcpEach;
  const onSiteMinutes = setup + flight.flightMinutes + flight.batterySwaps * swapMin + gcpMinutes;
  const billableFieldMinutes = onSiteMinutes + travelMin;
  const processingMinutes = (flight.totalPhotos * secPerImg) / 60;

  const fieldCost = (billableFieldMinutes / 60) * fieldRate;
  const processingCost = (processingMinutes / 60) * procRate;
  const mileageCost = miles * perMile;
  const totalCost = fieldCost + processingCost + mileageCost;
  const price = totalCost / (1 - margin / 100);

  return {
    ...flight,
    gcpMinutes,
    onSiteMinutes,
    billableFieldMinutes,
    processingMinutes,
    fieldCost,
    processingCost,
    mileageCost,
    totalCost,
    price,
    profit: price - totalCost,
    pricePerAcre: price / requireFinite(input.areaAcres, 'Site area', { min: 0.1 }),
  };
}

/**
 * The comparison this tool exists to put in front of a pilot.
 *
 * Quoting by the acre hides the overlap spec, and the overlap spec is the
 * term that moves the job most. This returns the same site flown at two
 * overlap settings so the difference is a number rather than an intuition.
 */
export function compareOverlap(input, altFrontPct, altSidePct) {
  const base = priceJob(input);
  const alt = priceJob({ ...input, frontOverlapPct: altFrontPct, sideOverlapPct: altSidePct });
  return {
    base,
    alt,
    photoRatio: alt.totalPhotos / base.totalPhotos,
    flightRatio: alt.flightMinutes / base.flightMinutes,
    costDelta: alt.totalCost - base.totalCost,
    priceDelta: alt.price - base.price,
  };
}

/**
 * Advisory findings. None of these is an error -- every one describes a legal
 * or operational fact the arithmetic alone would let a pilot quote straight
 * past.
 */
export function reviewPlan(input, result) {
  const notes = [];

  const requiredAlt = altitudeForGsd({
    sensorWidthMm: input.sensorWidthMm,
    focalLengthMm: input.focalLengthMm,
    imageWidthPx: input.imageWidthPx,
    gsdCmPx: input.targetGsdCmPx ?? result.gsdCmPx,
  });

  if (requiredAlt > PART_107_CEILING_M) {
    notes.push({
      severity: 'legal',
      title: 'That GSD needs more altitude than Part 107 allows',
      detail:
        `Reaching ${(input.targetGsdCmPx ?? result.gsdCmPx).toFixed(2)} cm/px on this camera ` +
        `takes ${requiredAlt.toFixed(0)} m, above the 400 ft (121.92 m) ceiling in 14 CFR 107.51(b). ` +
        'Flying at the ceiling instead gives a finer GSD than asked for and covers less ground per ' +
        'pass, so the flight is longer than an unrestricted plan suggests. Price the flight you can ' +
        'legally fly, not the one the optics allow.',
    });
  }

  if (result.batteriesShort > 0) {
    notes.push({
      severity: 'operational',
      title: 'Not enough batteries to finish in one visit',
      detail:
        `The plan needs ${result.sortiesNeeded} sorties and you listed ${input.batteryCount}. ` +
        `That is ${result.batteriesShort} more than you carry, so the job either waits on charging ` +
        'or becomes a second mobilisation — bill it as one, or the second trip is unpaid.',
    });
  }

  if (result.gsdCmPx > 5) {
    notes.push({
      severity: 'quality',
      title: 'Coarse GSD for a survey deliverable',
      detail:
        `At ${result.gsdCmPx.toFixed(2)} cm/px, features under about ${(result.gsdCmPx * 3).toFixed(0)} cm ` +
        'across will not be reliably identifiable. Confirm the client agrees before flying — a ' +
        'resolution dispute after the fact is a reflight at your cost.',
    });
  }

  if (input.gcpCount === 0) {
    notes.push({
      severity: 'accuracy',
      title: 'No ground control points in the plan',
      detail:
        'With no GCPs, absolute accuracy rests entirely on the aircraft position solution. That is ' +
        'a reasonable choice on an RTK/PPK airframe with a good correction source, and it is not ' +
        'one on a standard GNSS aircraft. If the deliverable states an absolute accuracy, say which ' +
        'of the two this flight is.',
    });
  }

  if (input.sideOverlapPct < 65 || input.frontOverlapPct < 70) {
    notes.push({
      severity: 'quality',
      title: 'Overlap below the usual reconstruction floor',
      detail:
        `Front ${input.frontOverlapPct}% / side ${input.sideOverlapPct}% is thin for photogrammetry. ` +
        'It flies fast and it is where holes in a dense cloud come from, especially over vegetation, ' +
        'water and bare uniform surfaces. A reflight costs more than the frames saved.',
    });
  }

  return notes;
}
