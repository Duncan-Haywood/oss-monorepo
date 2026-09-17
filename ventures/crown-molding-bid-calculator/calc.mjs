// Pure bid arithmetic for residential crown-molding install.
// No network, no state: every linear foot, corner, grade, wage,
// and millwork invoice is an input, so the result stays a
// transparent calculation the finish carpenter can check against
// their own tickets rather than a claim about what any room
// "should" cost.
//
// The method is the one the trade actually loses money on: a
// published "$8 a foot installed" treats 80 lf of paint-grade
// simple cove in one 8-ft room as the same job as 80 lf of
// stain-grade built-up crown in a 2-story foyer with 14 coped
// inside corners and an LED cove. Homeowners (and a lot of
// estimator sheets) count the same kind of number. Copes,
// stain-grade, cathedral ceilings, and foyer scaffolding do
// not live in that dump. Matching a cheap paint-grade special
// on a stain-grade foyer is how a sold crown job becomes a
// loss when the corners and the access eat the margin.
//
// Distinct from *interior painting* (a coat on walls),
// *drywall* (gypsum hang-and-finish), *cabinet refinishing*
// (doors), *popcorn-ceiling* (a scrape and skim), and
// *plantation shutters* (louvered panels in an opening). This
// prices a crown-molding run: linear feet, corners, grade,
// profile, and the extras.

export const GRADE_PRESETS = Object.freeze([
  { id: 'paint-grade', label: 'Paint-grade — miters, caulk, then paint' },
  { id: 'stain-grade', label: 'Stain-grade — coped insides, no caulk hiding' },
]);

export const PROFILE_PRESETS = Object.freeze([
  { id: 'simple-cove', label: 'Simple cove — the cheap $8/ft special' },
  { id: 'colonial', label: 'Colonial / dentil — one-piece, more cuts' },
  { id: 'built-up', label: 'Built-up — two or three stacked pieces' },
]);

export const CEILING_PRESETS = Object.freeze([
  { id: 'flat', label: 'Flat — the cheap-special assumption' },
  { id: 'cathedral', label: 'Cathedral / vaulted — spring angle changes' },
  { id: 'tray', label: 'Tray / coffer — extra returns and steps' },
]);

export const HEIGHT_PRESETS = Object.freeze([
  { id: 'standard-8', label: 'Standard 8-ft — ladder only' },
  { id: 'tall-10', label: '9–10 ft — stilts or a rolling scaffold' },
  { id: 'two-story-foyer', label: 'Two-story foyer — scaffold is the job' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Cheap special: 80 lf paint-grade cove, 8 insides, one 8-ft room',
    linearFeet: 80,
    insideCorners: 8,
    outsideCorners: 0,
    rooms: 1,
    travelMiles: 8,
    grade: 'paint-grade',
    profile: 'simple-cove',
    ceiling: 'flat',
    height: 'standard-8',
    includeDemo: false,
    includeBlocking: false,
    includeLedCove: false,
    includeCasingMatch: false,
  },
  {
    label: 'Typical colonial: 180 lf paint-grade, 16 insides, 3 rooms',
    linearFeet: 180,
    insideCorners: 16,
    outsideCorners: 4,
    rooms: 3,
    travelMiles: 12,
    grade: 'paint-grade',
    profile: 'colonial',
    ceiling: 'flat',
    height: 'standard-8',
    includeDemo: false,
    includeBlocking: false,
    includeLedCove: false,
    includeCasingMatch: false,
  },
  {
    label: 'Stain dining: 120 lf stain-grade colonial, tray, 10-ft',
    linearFeet: 120,
    insideCorners: 12,
    outsideCorners: 2,
    rooms: 1,
    travelMiles: 14,
    grade: 'stain-grade',
    profile: 'colonial',
    ceiling: 'tray',
    height: 'tall-10',
    includeDemo: false,
    includeBlocking: true,
    includeLedCove: false,
    includeCasingMatch: false,
  },
  {
    label: 'Losing job: 80 lf stain-grade built-up, cathedral foyer, LED',
    linearFeet: 80,
    insideCorners: 14,
    outsideCorners: 4,
    rooms: 1,
    travelMiles: 18,
    grade: 'stain-grade',
    profile: 'built-up',
    ceiling: 'cathedral',
    height: 'two-story-foyer',
    includeDemo: true,
    includeBlocking: true,
    includeLedCove: true,
    includeCasingMatch: true,
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
 * Starting run hours from how much of the crown is actually
 * sold. Simple cove is the cheap special. Colonial is more
 * cuts. Built-up is two or three stacked pieces.
 */
export function suggestedProfileKit(profile) {
  const id = String(profile);
  if (id === 'simple-cove') {
    return {
      hoursPerLf: 0.08,
      moldingPerLf: 3.2,
      hoursPerPiece: 0,
    };
  }
  if (id === 'colonial') {
    return {
      hoursPerLf: 0.11,
      moldingPerLf: 5.8,
      hoursPerPiece: 0,
    };
  }
  if (id === 'built-up') {
    return {
      hoursPerLf: 0.18,
      moldingPerLf: 11.5,
      hoursPerPiece: 0.35,
    };
  }
  throw new Error('Unknown profile');
}

/**
 * Stain-grade is a different trade than paint-grade. Miters and
 * caulk hide paint-grade joints; stain-grade insides are coped
 * and the stock costs more.
 */
export function suggestedGradeKit(grade) {
  const id = String(grade);
  if (id === 'paint-grade') {
    return {
      hoursPerInside: 0.25,
      hoursPerOutside: 0.18,
      gradeHourFactor: 1,
      gradeMaterialFactor: 1,
      finishInvoice: 45,
    };
  }
  if (id === 'stain-grade') {
    return {
      hoursPerInside: 0.55,
      hoursPerOutside: 0.22,
      gradeHourFactor: 1.4,
      gradeMaterialFactor: 2.05,
      finishInvoice: 95,
    };
  }
  throw new Error('Unknown grade');
}

/**
 * Ceiling shape changes spring angle and returns. Flat is the
 * cheap-special assumption.
 */
export function suggestedCeilingKit(ceiling) {
  const id = String(ceiling);
  if (id === 'flat') {
    return { hoursCeilingPerLf: 0, ceilingHardware: 0 };
  }
  if (id === 'cathedral') {
    return { hoursCeilingPerLf: 0.045, ceilingHardware: 28 };
  }
  if (id === 'tray') {
    return { hoursCeilingPerLf: 0.035, ceilingHardware: 42 };
  }
  throw new Error('Unknown ceiling');
}

/**
 * Access is its own ticket once the room is taller than a
 * stepladder.
 */
export function suggestedHeightKit(height) {
  const id = String(height);
  if (id === 'standard-8') {
    return { hoursAccess: 0, accessInvoice: 0 };
  }
  if (id === 'tall-10') {
    return { hoursAccess: 1.6, accessInvoice: 55 };
  }
  if (id === 'two-story-foyer') {
    return { hoursAccess: 4.8, accessInvoice: 180 };
  }
  throw new Error('Unknown height');
}

/**
 * Starting extras that do not live in an $8/ft special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 1.1,
    hoursPerMile: 0.032,
    hoursDemoPerLf: 0.04,
    hoursBlockingPerLf: 0.055,
    hoursLedPerLf: 0.08,
    hoursCasingMatch: 2.4,
    siteHours: 0.9,
    hoursPerRoom: 0.35,
    demoPerLf: 0.4,
    blockingPerLf: 1.1,
    ledPerLf: 8.5,
    casingMatchInvoice: 85,
    travelPerMile: 2.4,
    wasteFactor: 8,
    wastePerInside: 0.5,
    wastePerOutside: 0.4,
  };
}

/**
 * Price a crown-molding install from the run, the grade, the
 * profile, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const grade = requirePreset(GRADE_PRESETS, input.grade, 'grade').id;
  const profile = requirePreset(PROFILE_PRESETS, input.profile, 'profile').id;
  const ceiling = requirePreset(CEILING_PRESETS, input.ceiling, 'ceiling').id;
  const height = requirePreset(HEIGHT_PRESETS, input.height, 'height').id;

  const linearFeet = number(input.linearFeet ?? 0, 'Linear feet');
  const insideCorners = number(input.insideCorners ?? 0, 'Inside corners');
  const outsideCorners = number(input.outsideCorners ?? 0, 'Outside corners');
  const rooms = number(input.rooms ?? 0, 'Rooms');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const includeDemo = flag(input.includeDemo);
  const includeBlocking = flag(input.includeBlocking);
  const includeLedCove = flag(input.includeLedCove);
  const includeCasingMatch = flag(input.includeCasingMatch);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursPerLf = number(input.hoursPerLf ?? 0, 'Hours per linear foot');
  const hoursPerInside = number(input.hoursPerInside ?? 0, 'Hours per inside corner');
  const hoursPerOutside = number(input.hoursPerOutside ?? 0, 'Hours per outside corner');
  const hoursPerPiece = number(input.hoursPerPiece ?? 0, 'Hours per stacked piece');
  const hoursCeilingPerLf = number(input.hoursCeilingPerLf ?? 0, 'Ceiling hours per foot');
  const hoursAccess = number(input.hoursAccess ?? 0, 'Access hours');
  const hoursDemoPerLf = number(input.hoursDemoPerLf ?? 0, 'Demo hours per foot');
  const hoursBlockingPerLf = number(input.hoursBlockingPerLf ?? 0, 'Blocking hours per foot');
  const hoursLedPerLf = number(input.hoursLedPerLf ?? 0, 'LED hours per foot');
  const hoursCasingMatch = number(input.hoursCasingMatch ?? 0, 'Casing-match hours');
  const hoursPerRoom = number(input.hoursPerRoom ?? 0, 'Hours per room');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');
  const gradeHourFactor = number(input.gradeHourFactor ?? 1, 'Grade hour factor', { min: 0, allowZero: false });

  const moldingPerLf = number(input.moldingPerLf ?? 0, 'Molding per foot');
  const gradeMaterialFactor = number(input.gradeMaterialFactor ?? 1, 'Grade material factor', { min: 0, allowZero: false });
  const finishInvoice = number(input.finishInvoice ?? 0, 'Finish invoice');
  const ceilingHardware = number(input.ceilingHardware ?? 0, 'Ceiling hardware');
  const accessInvoice = number(input.accessInvoice ?? 0, 'Access invoice');
  const demoPerLf = number(input.demoPerLf ?? 0, 'Demo per foot');
  const blockingPerLf = number(input.blockingPerLf ?? 0, 'Blocking per foot');
  const ledPerLf = number(input.ledPerLf ?? 0, 'LED per foot');
  const casingMatchInvoice = number(input.casingMatchInvoice ?? 0, 'Casing-match invoice');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');
  const wasteFactor = number(input.wasteFactor ?? 0, 'Waste factor');
  const wastePerInside = number(input.wastePerInside ?? 0, 'Waste per inside');
  const wastePerOutside = number(input.wastePerOutside ?? 0, 'Waste per outside');

  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursRun = linearFeet * hoursPerLf * gradeHourFactor;
  const hoursInside = insideCorners * hoursPerInside;
  const hoursOutside = outsideCorners * hoursPerOutside;
  const hoursStacked = profile === 'built-up' ? hoursPerPiece * 2 : 0;
  const hoursCeiling = linearFeet * hoursCeilingPerLf;
  const hoursRooms = rooms * hoursPerRoom;
  const hoursDemoApplied = includeDemo ? linearFeet * hoursDemoPerLf : 0;
  const hoursBlockingApplied = includeBlocking ? linearFeet * hoursBlockingPerLf : 0;
  const hoursLedApplied = includeLedCove ? linearFeet * hoursLedPerLf : 0;
  const hoursCasingApplied = includeCasingMatch ? hoursCasingMatch : 0;
  const extraWorkHours = hoursInside + hoursOutside + hoursStacked + hoursCeiling
    + hoursAccess + hoursRooms + hoursDemoApplied + hoursBlockingApplied
    + hoursLedApplied + hoursCasingApplied;
  const totalHours = hoursTravel + hoursRun + extraWorkHours + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const billedFeet = linearFeet * (1 + wasteFactor / 100)
    + insideCorners * wastePerInside
    + outsideCorners * wastePerOutside;
  const moldingMaterial = billedFeet * moldingPerLf * gradeMaterialFactor;
  const finishMaterial = finishInvoice;
  const ceilingMaterial = ceilingHardware;
  const accessMaterial = accessInvoice;
  const demoMaterial = includeDemo ? linearFeet * demoPerLf : 0;
  const blockingMaterial = includeBlocking ? linearFeet * blockingPerLf : 0;
  const ledMaterial = includeLedCove ? linearFeet * ledPerLf : 0;
  const casingMaterial = includeCasingMatch ? casingMatchInvoice : 0;
  const travelInvoice = travelMiles * travelPerMile;
  const runMaterial = moldingMaterial + finishMaterial;
  const extraHardware = ceilingMaterial + accessMaterial + demoMaterial
    + blockingMaterial + ledMaterial + casingMaterial + travelInvoice;
  const materialCost = runMaterial + extraHardware;

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
    grade,
    profile,
    ceiling,
    height,
    linearFeet,
    billedFeet,
    insideCorners,
    outsideCorners,
    rooms,
    travelMiles,
    includeDemo,
    includeBlocking,
    includeLedCove,
    includeCasingMatch,
    loadedWage,
    hoursTravel,
    hoursRun,
    hoursInside,
    hoursOutside,
    hoursStacked,
    hoursCeiling,
    hoursAccess,
    hoursRooms,
    hoursDemo: hoursDemoApplied,
    hoursBlocking: hoursBlockingApplied,
    hoursLed: hoursLedApplied,
    hoursCasing: hoursCasingApplied,
    siteHours,
    totalHours,
    laborCost,
    moldingMaterial,
    finishMaterial,
    ceilingMaterial,
    accessMaterial,
    demoMaterial,
    blockingMaterial,
    ledMaterial,
    casingMaterial,
    travelInvoice,
    extraHardware,
    extraCost,
    runMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerLf: linearFeet === 0 ? null : price / linearFeet,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      run: costShare(runMaterial),
      extra: costShare(extraCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      travel: hourShare(hoursTravel),
      run: hourShare(hoursRun),
      inside: hourShare(hoursInside),
      outside: hourShare(hoursOutside),
      stacked: hourShare(hoursStacked),
      ceiling: hourShare(hoursCeiling),
      access: hourShare(hoursAccess),
      rooms: hourShare(hoursRooms),
      demo: hourShare(hoursDemoApplied),
      blocking: hourShare(hoursBlockingApplied),
      led: hourShare(hoursLedApplied),
      casing: hourShare(hoursCasingApplied),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perLf: linearFeet === 0 ? null : proposedPrice / linearFeet,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same run three ways — simple cove, colonial,
 * built-up — from the suggested profile kits so the carpenter
 * can see when stacked pieces flip the cheap $8/ft special.
 * User-typed profile rates are not reused here: the comparison
 * is apples-to-apples on the starting figures. Grade, ceiling,
 * and height kits stay with the current job.
 */
export function compareProfile(input) {
  const gradeKit = suggestedGradeKit(String(input.grade ?? 'paint-grade'));
  const ceilingKit = suggestedCeilingKit(String(input.ceiling ?? 'flat'));
  const heightKit = suggestedHeightKit(String(input.height ?? 'standard-8'));
  const extraKit = suggestedExtraKit();
  const rows = PROFILE_PRESETS.map((preset) => {
    const kit = suggestedProfileKit(preset.id);
    const bid = calculateBid({
      ...input,
      profile: preset.id,
      ...gradeKit,
      ...ceilingKit,
      ...heightKit,
      ...extraKit,
      ...kit,
    });
    return {
      profile: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerLf: bid.pricePerLf,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursRun: bid.hoursRun,
      hoursStacked: bid.hoursStacked,
      runMaterial: bid.runMaterial,
      breakEvenPrice: bid.breakEvenPrice,
    };
  });
  const cheapest = Math.min(...rows.map((row) => row.price));
  return rows
    .map((row) => ({
      ...row,
      cheapest: row.price === cheapest,
      delta: row.price - cheapest,
    }))
    .sort((a, b) => a.price - b.price);
}

function money(value) {
  const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Format a bid as a plain-text draft the carpenter can paste
 * into a proposal. Costs, wages, and invoices are omitted on
 * purpose — this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Crown molding') {
  const perLf = result.pricePerLf === null
    ? 'n/a'
    : `${money(result.pricePerLf)} / lf`;
  const grade = GRADE_PRESETS.find((item) => item.id === result.grade)?.label ?? result.grade;
  const profile = PROFILE_PRESETS.find((item) => item.id === result.profile)?.label ?? result.profile;
  const ceiling = CEILING_PRESETS.find((item) => item.id === result.ceiling)?.label ?? result.ceiling;
  const height = HEIGHT_PRESETS.find((item) => item.id === result.height)?.label ?? result.height;
  const extras = [
    `${result.travelMiles} travel miles`,
    `${result.rooms} room${result.rooms === 1 ? '' : 's'}`,
    `${result.insideCorners} inside / ${result.outsideCorners} outside corners`,
    ceiling,
    height,
    result.includeDemo ? 'existing crown demo included' : 'no demo',
    result.includeBlocking ? 'blocking included' : 'no blocking',
    result.includeLedCove ? 'LED cove included' : 'no LED cove',
    result.includeCasingMatch ? 'casing match included' : 'no casing match',
  ].join('; ');
  return [
    'CROWN MOLDING BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${profile}`,
    `Price per linear foot: ${perLf}`,
    `Run: ${result.linearFeet.toLocaleString('en-US')} lf (${result.billedFeet.toFixed(1)} lf billed with waste)`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.linearFeet} lf; ${grade}; ${profile}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; run: ${result.hoursRun.toFixed(1)} h; extras: ${(result.hoursInside + result.hoursOutside + result.hoursStacked + result.hoursCeiling + result.hoursAccess + result.hoursRooms + result.hoursDemo + result.hoursBlocking + result.hoursLed + result.hoursCasing).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm linear feet, corners, grade, profile, extras, and all pricing before sending. It is not a millwork shop drawing, a structural opinion, a paint specification, or a product warranty.',
  ].join('\n');
}
