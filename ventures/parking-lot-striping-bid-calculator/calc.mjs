// Pure bid arithmetic for parking-lot striping / pavement marking.
// No network, no state: every stall, ADA aisle, arrow, gallon, and wage
// is an input, so the result stays a transparent calculation the
// striping contractor can check against their own paint tickets rather
// than a claim about what any lot "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$8 a stall" or "$400 for a 50-space lot" Facebook special treats a
// restripe of faded 4-inch lines as the same job as a new layout with
// ADA hash aisles, arrows, stop bars, a fire lane, and a second coat.
// Property managers (and a lot of estimator sheets) count the same
// kind of number. ADA stalls, stencils, and a new string-line layout
// do not scale with that per-stall dump. Matching a cheap restripe
// special on a new-layout / ADA-heavy job is how a sold lot becomes a
// Saturday loss after the first paint ticket.
//
// Distinct from *sealcoat* (coats and cracks on asphalt), *asphalt
// paving* (tons of mix, mill, overlay), *gravel driveway* (trucks and
// depth), *concrete pours* (cubic yards of slab), *epoxy garage floor*
// (flake and polyaspartic on a slab), and *paver patio* (interlocking
// units). This prices painted pavement marking: the stall lines, the
// ADA hash, the stencils, and the coats.

export const LAYOUT_PRESETS = Object.freeze([
  { id: 'restripe', label: 'Restripe existing lines' },
  { id: 'new', label: 'New layout (measure and string)' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '50-stall retail restripe, 1 coat, 2 ADA, 8 arrows (the cheap special)',
    standardStalls: 48,
    adaStalls: 2,
    arrows: 8,
    stopBars: 2,
    crosswalks: 0,
    handicapSymbols: 2,
    fireLaneFeet: 0,
    curbPaintFeet: 0,
    coats: 1,
    layout: 'restripe',
    nightWork: false,
  },
  {
    label: '80-stall grocery restripe, 2 coats, 4 ADA, 16 arrows, fire lane',
    standardStalls: 76,
    adaStalls: 4,
    arrows: 16,
    stopBars: 4,
    crosswalks: 1,
    handicapSymbols: 4,
    fireLaneFeet: 180,
    curbPaintFeet: 80,
    coats: 2,
    layout: 'restripe',
    nightWork: false,
  },
  {
    label: '120-stall new layout, 2 coats, 6 ADA, 24 arrows, 2 crosswalks (where the special loses)',
    standardStalls: 114,
    adaStalls: 6,
    arrows: 24,
    stopBars: 6,
    crosswalks: 2,
    handicapSymbols: 6,
    fireLaneFeet: 240,
    curbPaintFeet: 200,
    coats: 2,
    layout: 'new',
    nightWork: true,
  },
  {
    label: '24-stall office restripe, 1 coat, 1 ADA',
    standardStalls: 23,
    adaStalls: 1,
    arrows: 4,
    stopBars: 1,
    crosswalks: 0,
    handicapSymbols: 1,
    fireLaneFeet: 0,
    curbPaintFeet: 0,
    coats: 1,
    layout: 'restripe',
    nightWork: false,
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
 * Shared stall-line footage. A typical 90-degree stall is two 18-ft
 * side lines plus a 9-ft head, but adjacent stalls share a side, so
 * the starting figure is ~18 lineal feet of 4-inch line per stall.
 * Zero stalls is a zero-line lot, not a missing input.
 */
export function stallLineLf(stalls, lfPerStall) {
  return number(stalls, 'Stalls') * number(lfPerStall, 'Lineal feet per stall');
}

/**
 * Extra 4-inch line that an ADA stall adds beyond a regular stall:
 * the wider outline plus the hashed access aisle. This is the line
 * a per-stall special never sees. Hash of zero is "no extra aisle",
 * not a missing input.
 */
export function adaExtraLineLf(adaStalls, hashLfPerAda) {
  return number(adaStalls, 'ADA stalls') * number(hashLfPerAda, 'Hash feet per ADA stall');
}

/**
 * Painted area of continental-bar crosswalks. Bars × width × crossing
 * length. Any dimension at zero is a zero-area crossing, not missing.
 */
export function crosswalkAreaSqFt(crosswalks, barCount, barWidthFt, crossingFt) {
  return number(crosswalks, 'Crosswalks')
    * number(barCount, 'Bars per crosswalk')
    * number(barWidthFt, 'Bar width')
    * number(crossingFt, 'Crossing length');
}

/**
 * Solid-fill stencil area (arrows, handicap symbols). Count of zero
 * is no stencil, not a missing input.
 */
export function stencilAreaSqFt(count, areaEach, name) {
  return number(count, name) * number(areaEach, `${name} area`);
}

/**
 * Gallons of 4-inch line paint. Coverage of zero is rejected — a
 * free gallon would hide a missing yield. Coats of zero is rejected
 * for the same reason.
 */
export function gallonsForLines(linealFeet, lfPerGallon, coats) {
  const lf = number(linealFeet, 'Lineal feet');
  const coverage = number(lfPerGallon, 'Lineal feet per gallon', { allowZero: false });
  const coatCount = number(coats, 'Coats', { allowZero: false });
  return (lf / coverage) * coatCount;
}

/**
 * Gallons of solid-fill paint for arrows, symbols, and crosswalks.
 */
export function gallonsForArea(areaSqFt, sqFtPerGallon, coats) {
  const area = number(areaSqFt, 'Painted area');
  const coverage = number(sqFtPerGallon, 'Square feet per gallon', { allowZero: false });
  const coatCount = number(coats, 'Coats', { allowZero: false });
  return (area / coverage) * coatCount;
}

/**
 * Starting hours, coverage, and invoice figures from the layout.
 * These are ballpark crew figures, not a traffic-paint catalog.
 * Picking a layout never overwrites a rate the contractor has
 * already typed.
 */
export function suggestedKit(layout) {
  const id = String(layout);
  if (id !== 'restripe' && id !== 'new') throw new Error('Unknown layout');
  return {
    lfPerStall: 18,
    hashLfPerAda: 70,
    arrowAreaSqFt: 6,
    stopBarLf: 16,
    handicapAreaSqFt: 8,
    crosswalkBars: 8,
    crosswalkBarWidthFt: 2,
    crosswalkLengthFt: 24,
    lfPerGallon: 360,
    sqFtPerGallon: 110,
    hoursTrip: id === 'new' ? 2.5 : 1.5,
    hoursLayoutPerStall: id === 'new' ? 0.08 : 0.012,
    hoursPerHundredLf: 0.25,
    hoursPerAdaExtra: 0.35,
    hoursPerArrow: 0.12,
    hoursPerStopBar: 0.15,
    hoursPerCrosswalk: 0.55,
    hoursPerSymbol: 0.2,
    hoursPerHundredFireLane: 0.4,
    hoursPerHundredCurb: 1.25,
    paintPerGallon: 42,
    signEach: 85,
    mobilization: 175,
  };
}

/**
 * Price a parking-lot striping job from the stalls, the ADA hash,
 * the stencils, and the coats.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const layout = requirePreset(LAYOUT_PRESETS, input.layout, 'layout').id;

  const standardStalls = number(input.standardStalls ?? 0, 'Standard stalls');
  const adaStalls = number(input.adaStalls ?? 0, 'ADA stalls');
  const arrows = number(input.arrows ?? 0, 'Arrows');
  const stopBars = number(input.stopBars ?? 0, 'Stop bars');
  const crosswalks = number(input.crosswalks ?? 0, 'Crosswalks');
  const handicapSymbols = number(input.handicapSymbols ?? 0, 'Handicap symbols');
  const fireLaneFeet = number(input.fireLaneFeet ?? 0, 'Fire-lane feet');
  const curbPaintFeet = number(input.curbPaintFeet ?? 0, 'Curb-paint feet');
  const coats = number(input.coats ?? 1, 'Coats', { allowZero: false });
  if (coats !== 1 && coats !== 2) throw new Error('Coats must be 1 or 2');
  const nightWork = flag(input.nightWork);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const lfPerStall = number(input.lfPerStall ?? 18, 'Lineal feet per stall');
  const hashLfPerAda = number(input.hashLfPerAda ?? 0, 'Hash feet per ADA stall');
  const arrowAreaEach = number(input.arrowAreaSqFt ?? 6, 'Arrow area');
  const stopBarLf = number(input.stopBarLf ?? 16, 'Stop-bar feet');
  const handicapAreaEach = number(input.handicapAreaSqFt ?? 8, 'Handicap-symbol area');
  const crosswalkBars = number(input.crosswalkBars ?? 8, 'Bars per crosswalk');
  const crosswalkBarWidthFt = number(input.crosswalkBarWidthFt ?? 2, 'Bar width');
  const crosswalkLengthFt = number(input.crosswalkLengthFt ?? 24, 'Crossing length');
  const lfPerGallon = number(input.lfPerGallon ?? 360, 'Lineal feet per gallon', { allowZero: false });
  const sqFtPerGallon = number(input.sqFtPerGallon ?? 110, 'Square feet per gallon', { allowZero: false });

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursLayoutPerStall = number(input.hoursLayoutPerStall ?? 0, 'Layout hours per stall');
  const hoursPerHundredLf = number(input.hoursPerHundredLf ?? 0, 'Hours per 100 stall-line feet');
  const hoursPerAdaExtra = number(input.hoursPerAdaExtra ?? 0, 'Hours per ADA extra');
  const hoursPerArrow = number(input.hoursPerArrow ?? 0, 'Hours per arrow');
  const hoursPerStopBar = number(input.hoursPerStopBar ?? 0, 'Hours per stop bar');
  const hoursPerCrosswalk = number(input.hoursPerCrosswalk ?? 0, 'Hours per crosswalk');
  const hoursPerSymbol = number(input.hoursPerSymbol ?? 0, 'Hours per symbol');
  const hoursPerHundredFireLane = number(input.hoursPerHundredFireLane ?? 0, 'Hours per 100 fire-lane feet');
  const hoursPerHundredCurb = number(input.hoursPerHundredCurb ?? 0, 'Hours per 100 curb feet');

  // A second coat buys almost another paint ticket but not another
  // setup day. Default 0.7 of first-coat paint labor when coats is 2;
  // the contractor can type a different factor.
  const secondCoatLaborFactor = input.secondCoatLaborFactor !== undefined && input.secondCoatLaborFactor !== ''
    ? number(input.secondCoatLaborFactor, 'Second-coat labor factor')
    : (coats === 2 ? 0.7 : 0);
  const nightPremium = input.nightPremium !== undefined && input.nightPremium !== ''
    ? number(input.nightPremium, 'Night premium')
    : (nightWork ? 25 : 0);

  const paintPerGallon = number(input.paintPerGallon ?? 0, 'Paint per gallon');
  const signEach = number(input.signEach ?? 0, 'ADA sign each');
  const mobilization = number(input.mobilization ?? 0, 'Mobilization');

  const totalStalls = standardStalls + adaStalls;
  const stallLf = stallLineLf(totalStalls, lfPerStall);
  const adaHashLf = adaExtraLineLf(adaStalls, hashLfPerAda);
  const stopLf = stopBars * stopBarLf;
  const lineLf = stallLf + adaHashLf + fireLaneFeet + stopLf + curbPaintFeet;
  const arrowArea = stencilAreaSqFt(arrows, arrowAreaEach, 'Arrows');
  const symbolArea = stencilAreaSqFt(handicapSymbols, handicapAreaEach, 'Handicap symbols');
  const walkArea = crosswalkAreaSqFt(crosswalks, crosswalkBars, crosswalkBarWidthFt, crosswalkLengthFt);
  const fillArea = arrowArea + symbolArea + walkArea;

  const lineGallons = gallonsForLines(lineLf, lfPerGallon, coats);
  const fillGallons = gallonsForArea(fillArea, sqFtPerGallon, coats);
  const totalGallons = lineGallons + fillGallons;

  const hoursLayout = totalStalls * hoursLayoutPerStall;
  const hoursLines = (stallLf / 100) * hoursPerHundredLf;
  const hoursAda = adaStalls * hoursPerAdaExtra;
  const hoursArrows = arrows * hoursPerArrow;
  const hoursStop = stopBars * hoursPerStopBar;
  const hoursCross = crosswalks * hoursPerCrosswalk;
  const hoursSymbols = handicapSymbols * hoursPerSymbol;
  const hoursFire = (fireLaneFeet / 100) * hoursPerHundredFireLane;
  const hoursCurb = (curbPaintFeet / 100) * hoursPerHundredCurb;
  const hoursPaint = hoursLines + hoursAda + hoursArrows + hoursStop
    + hoursCross + hoursSymbols + hoursFire + hoursCurb;
  const hoursSecondCoat = hoursPaint * secondCoatLaborFactor;
  const hoursBeforeNight = hoursTrip + hoursLayout + hoursPaint + hoursSecondCoat;
  const hoursNight = hoursBeforeNight * (nightPremium / 100);
  const totalHours = hoursBeforeNight + hoursNight;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;
  const paintCost = totalGallons * paintPerGallon;
  const signCost = adaStalls * signEach;
  const materialCost = paintCost + signCost;
  const softCost = mobilization + otherCost;
  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);
  const hourShare = (amount) => (totalHours === 0 ? 0 : amount / totalHours * 100);

  // Extra the cheap per-stall special never prices: ADA hash and
  // signs, stencils, fire lane, curb, second-coat labor, night
  // premium, and new-layout hours. Stall-line paint and first-coat
  // stall-line labor stay in the "regular stall" bucket.
  const extraLaborHours = hoursAda + hoursArrows + hoursStop + hoursCross
    + hoursSymbols + hoursFire + hoursCurb + hoursSecondCoat + hoursNight
    + (layout === 'new' ? hoursLayout : 0);
  const stallLineGallons = gallonsForLines(stallLf, lfPerGallon, coats);
  const extraPaintCost = (totalGallons - stallLineGallons) * paintPerGallon;
  const extraCost = extraLaborHours * loadedWage + extraPaintCost + signCost;

  return {
    layout,
    standardStalls,
    adaStalls,
    totalStalls,
    arrows,
    stopBars,
    crosswalks,
    handicapSymbols,
    fireLaneFeet,
    curbPaintFeet,
    coats,
    nightWork,
    nightPremium,
    stallLf,
    adaHashLf,
    stopLf,
    lineLf,
    arrowArea,
    symbolArea,
    walkArea,
    fillArea,
    lineGallons,
    fillGallons,
    totalGallons,
    loadedWage,
    hoursTrip,
    hoursLayout,
    hoursLines,
    hoursAda,
    hoursArrows,
    hoursStop,
    hoursCross,
    hoursSymbols,
    hoursFire,
    hoursCurb,
    hoursPaint,
    hoursSecondCoat,
    hoursNight,
    totalHours,
    laborCost,
    paintCost,
    signCost,
    materialCost,
    mobilization,
    softCost,
    overhead,
    directCost,
    totalCost,
    extraCost,
    extraLaborHours,
    price,
    profit,
    pricePerStall: totalStalls === 0 ? null : price / totalStalls,
    pricePerLineLf: lineLf === 0 ? null : price / lineLf,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      paint: costShare(paintCost),
      signs: costShare(signCost),
      extra: costShare(Math.max(0, extraCost)),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(hoursTrip),
      layout: hourShare(hoursLayout),
      lines: hourShare(hoursLines),
      ada: hourShare(hoursAda),
      stencils: hourShare(hoursArrows + hoursStop + hoursCross + hoursSymbols),
      fire: hourShare(hoursFire),
      curb: hourShare(hoursCurb),
      secondCoat: hourShare(hoursSecondCoat),
      night: hourShare(hoursNight),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perStall: totalStalls === 0 ? null : proposedPrice / totalStalls,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same lot as a restripe and as a new layout from the
 * suggested kits so the shop can see when string-line hours flip
 * the cheap special. User-typed layout rates are not reused here:
 * the comparison is apples-to-apples on the starting figures.
 */
export function compareLayout(input) {
  const rows = LAYOUT_PRESETS.map((preset) => {
    const kit = suggestedKit(preset.id);
    const bid = calculateBid({
      ...input,
      layout: preset.id,
      ...kit,
    });
    return {
      layout: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      hoursLayout: bid.hoursLayout,
      pricePerStall: bid.pricePerStall,
      extraCost: bid.extraCost,
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

/**
 * Price the same lot treating ADA stalls as regular stalls (no hash,
 * no extra hours, no symbols, no signs) versus pricing the aisle and
 * stencil work. That is the difference a "$8 a stall" special hides.
 */
export function compareAda(input) {
  const kit = suggestedKit(String(input.layout ?? 'restripe'));
  const full = calculateBid({ ...input, ...kit });
  const asRegular = calculateBid({
    ...input,
    ...kit,
    hashLfPerAda: 0,
    hoursPerAdaExtra: 0,
    handicapSymbols: 0,
    signEach: 0,
  });
  return {
    full,
    asRegular,
    extraPrice: full.price - asRegular.price,
    extraHours: full.totalHours - asRegular.totalHours,
    extraGallons: full.totalGallons - asRegular.totalGallons,
    extraSigns: full.signCost,
  };
}

/**
 * Price the same lot at one coat and two coats so the shop can see
 * that a second coat is almost another paint ticket, not another
 * setup day.
 */
export function compareCoats(input) {
  const kit = suggestedKit(String(input.layout ?? 'restripe'));
  const rows = [1, 2].map((coats) => {
    const bid = calculateBid({
      ...input,
      ...kit,
      coats,
      secondCoatLaborFactor: coats === 2 ? 0.7 : 0,
    });
    return {
      coats,
      label: coats === 1 ? 'One coat' : 'Two coats',
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      totalGallons: bid.totalGallons,
      paintCost: bid.paintCost,
      hoursSecondCoat: bid.hoursSecondCoat,
      pricePerStall: bid.pricePerStall,
    };
  });
  const cheapest = Math.min(...rows.map((row) => row.price));
  return rows.map((row) => ({
    ...row,
    cheapest: row.price === cheapest,
    delta: row.price - cheapest,
  }));
}

function money(value) {
  const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Format a bid as a plain-text draft the shop can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this
 * is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Parking lot striping') {
  const perStall = result.pricePerStall === null
    ? 'n/a'
    : `${money(result.pricePerStall)} / stall`;
  const layout = LAYOUT_PRESETS.find((item) => item.id === result.layout)?.label ?? result.layout;
  const extras = [
    `${result.coats} coat${result.coats === 1 ? '' : 's'}`,
    `${result.adaStalls} ADA stall${result.adaStalls === 1 ? '' : 's'}`,
    `${result.arrows} arrow${result.arrows === 1 ? '' : 's'}`,
    `${result.stopBars} stop bar${result.stopBars === 1 ? '' : 's'}`,
    `${result.crosswalks} crosswalk${result.crosswalks === 1 ? '' : 's'}`,
    result.fireLaneFeet > 0 ? `${result.fireLaneFeet} ft fire lane` : 'no fire lane',
    result.curbPaintFeet > 0 ? `${result.curbPaintFeet} ft curb paint` : 'no curb paint',
    result.nightWork ? 'night work' : 'day work',
  ].join('; ');
  return [
    'PARKING LOT STRIPING / PAVEMENT MARKING BID',
    '',
    `Proposed striping price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${layout}`,
    `Price per stall: ${perStall}`,
    `Marking: ${result.totalStalls} stalls, ${result.lineLf.toFixed(0)} lineal ft of line, ${result.totalGallons.toFixed(1)} gal`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.standardStalls} standard stalls + ${result.adaStalls} ADA stalls (${result.totalStalls} total)`,
    `- ${layout}; ${extras}`,
    `- Stall lines: ${result.hoursLines.toFixed(1)} h; ADA extra: ${result.hoursAda.toFixed(1)} h; stencils / bars: ${(result.hoursArrows + result.hoursStop + result.hoursCross + result.hoursSymbols).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm stall count, ADA layout, arrows, fire lanes, coats, night work, and all pricing before sending. It is not a traffic-engineering specification, an ADA determination, a MUTCD plan, a permit set, or a pavement-condition report.',
  ].join('\n');
}
