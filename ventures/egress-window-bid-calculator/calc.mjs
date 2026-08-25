// Pure bid arithmetic for residential egress-window install.
// No network, no state: every opening, cut, well, wage, and
// window invoice is an input, so the result stays a transparent
// calculation the contractor can check against their own tickets
// rather than a claim about what any basement "should" cost.
//
// The method is the one the trade actually loses money on: a
// published "$1,800 egress window installed" special treats a
// vinyl hopper into an existing hole with a plastic well as the
// same job as sawing a new opening in poured concrete, setting a
// steel well, adding a drain, a cover, a ladder, hauling the dirt,
// and finishing the inside. Homeowners (and a lot of estimator
// sheets) count the same kind of number. The cut, the well, the
// drain, and the dirt do not live in that dump. Matching the cheap
// retrofit special on a poured-wall new-cut is how a sold legal
// bedroom becomes a loss when the saw and the haul eat the margin.
//
// Distinct from *window replacement* (wall openings, united inches,
// nailing flange — no excavation), *basement finishing* (framing a
// rec room), *skylight* (a roof cut), *basement waterproofing*
// (interior drain, wells as a waterproofing add-on, a sump pit),
// and *foundation repair* (piers). This prices an egress window:
// the opening, the cut, the well, and the extras.

export const SCOPE_PRESETS = Object.freeze([
  { id: 'retrofit-existing', label: 'Retrofit existing opening — swap the sash and the well (the cheap special)' },
  { id: 'new-cut-wood', label: 'New cut — wood-framed wall, header and flashing' },
  { id: 'new-cut-masonry', label: 'New cut — CMU / block, lintel and saw' },
  { id: 'new-cut-poured', label: 'New cut — poured concrete, saw, core, and lintel' },
]);

export const WINDOW_PRESETS = Object.freeze([
  { id: 'vinyl-hopper', label: 'Vinyl hopper / awning — the cheap special' },
  { id: 'vinyl-slider', label: 'Vinyl slider — common legal-bedroom sash' },
  { id: 'vinyl-casement', label: 'Vinyl casement — easier clear-opening' },
  { id: 'fiberglass', label: 'Fiberglass — heavier sash, more careful set' },
]);

export const WELL_PRESETS = Object.freeze([
  { id: 'plastic', label: 'Plastic well — the cheap special' },
  { id: 'steel', label: 'Steel well — deeper projection, more backfill' },
  { id: 'stone', label: 'Stone / masonry well — built in place' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Cheap special: 1 hopper, existing opening, plastic well',
    windowCount: 1,
    scope: 'retrofit-existing',
    window: 'vinyl-hopper',
    well: 'plastic',
    travelMiles: 8,
    includeCover: false,
    includeLadder: false,
    includeDrain: false,
    includeHaul: false,
    includeInteriorFinish: false,
  },
  {
    label: 'Typical legal bedroom: 1 slider, new-cut masonry, steel well, cover, drain, ladder',
    windowCount: 1,
    scope: 'new-cut-masonry',
    window: 'vinyl-slider',
    well: 'steel',
    travelMiles: 14,
    includeCover: true,
    includeLadder: true,
    includeDrain: true,
    includeHaul: false,
    includeInteriorFinish: false,
  },
  {
    label: 'Losing job: 1 casement, poured cut, stone well, cover, drain, ladder, haul, finish',
    windowCount: 1,
    scope: 'new-cut-poured',
    window: 'vinyl-casement',
    well: 'stone',
    travelMiles: 22,
    includeCover: true,
    includeLadder: true,
    includeDrain: true,
    includeHaul: true,
    includeInteriorFinish: true,
  },
  {
    label: 'Two-bedroom: 2 sliders, new-cut masonry, steel wells, covers, drains, ladders, haul',
    windowCount: 2,
    scope: 'new-cut-masonry',
    window: 'vinyl-slider',
    well: 'steel',
    travelMiles: 18,
    includeCover: true,
    includeLadder: true,
    includeDrain: true,
    includeHaul: true,
    includeInteriorFinish: false,
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
 * Starting cut hours from how much of the wall is actually sold.
 * Retrofit on an existing hole is the cheap special. Wood is a
 * header. Masonry is a saw and a lintel. Poured is a saw, a
 * core, and a lintel.
 */
export function suggestedScopeKit(scope) {
  const id = String(scope);
  if (id === 'retrofit-existing') {
    return { hoursCutEach: 0, hoursWellBase: 1.2 };
  }
  if (id === 'new-cut-wood') {
    return { hoursCutEach: 3.5, hoursWellBase: 2.4 };
  }
  if (id === 'new-cut-masonry') {
    return { hoursCutEach: 6.5, hoursWellBase: 3.2 };
  }
  if (id === 'new-cut-poured') {
    return { hoursCutEach: 10, hoursWellBase: 3.8 };
  }
  throw new Error('Unknown scope');
}

/**
 * Vinyl hopper is the cheap-special assumption. Slider is the
 * common legal-bedroom sash. Casement is a clearer opening.
 * Fiberglass is weight.
 */
export function suggestedWindowKit(window) {
  const id = String(window);
  if (id === 'vinyl-hopper') {
    return { hoursWindowEach: 1.8, windowInvoice: 380 };
  }
  if (id === 'vinyl-slider') {
    return { hoursWindowEach: 2.2, windowInvoice: 520 };
  }
  if (id === 'vinyl-casement') {
    return { hoursWindowEach: 2.6, windowInvoice: 680 };
  }
  if (id === 'fiberglass') {
    return { hoursWindowEach: 3.0, windowInvoice: 980 };
  }
  throw new Error('Unknown window');
}

/**
 * Plastic is the cheap-special well. Steel is projection and
 * backfill. Stone is built in place.
 */
export function suggestedWellKit(well) {
  const id = String(well);
  if (id === 'plastic') {
    return { hoursWellEach: 2.5, wellInvoice: 220 };
  }
  if (id === 'steel') {
    return { hoursWellEach: 3.8, wellInvoice: 480 };
  }
  if (id === 'stone') {
    return { hoursWellEach: 8.5, wellInvoice: 1450 };
  }
  throw new Error('Unknown well');
}

/**
 * Starting extras that do not live in an $1,800 installed special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 1.4,
    hoursPerMile: 0.035,
    hoursCoverEach: 0.6,
    hoursLadderEach: 0.45,
    hoursDrainEach: 2.2,
    hoursHaulEach: 1.8,
    hoursFinishEach: 2.4,
    siteHours: 0.8,
    coverEach: 185,
    ladderEach: 95,
    drainKitEach: 165,
    haulEach: 280,
    finishEach: 140,
    travelPerMile: 3.2,
  };
}

/**
 * Price an egress-window install from the count, the cut, the
 * well, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const scope = requirePreset(SCOPE_PRESETS, input.scope, 'scope').id;
  const window = requirePreset(WINDOW_PRESETS, input.window, 'window').id;
  const well = requirePreset(WELL_PRESETS, input.well, 'well').id;

  const windowCount = number(input.windowCount ?? 0, 'Window count');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const includeCover = flag(input.includeCover);
  const includeLadder = flag(input.includeLadder);
  const includeDrain = flag(input.includeDrain);
  const includeHaul = flag(input.includeHaul);
  const includeInteriorFinish = flag(input.includeInteriorFinish);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursWindowEach = number(input.hoursWindowEach ?? 0, 'Window hours each');
  const hoursCutEach = number(input.hoursCutEach ?? 0, 'Cut hours each');
  const hoursWellBase = number(input.hoursWellBase ?? 0, 'Well-base hours each');
  const hoursWellEach = number(input.hoursWellEach ?? 0, 'Well hours each');
  const hoursCoverEach = number(input.hoursCoverEach ?? 0, 'Cover hours each');
  const hoursLadderEach = number(input.hoursLadderEach ?? 0, 'Ladder hours each');
  const hoursDrainEach = number(input.hoursDrainEach ?? 0, 'Drain hours each');
  const hoursHaulEach = number(input.hoursHaulEach ?? 0, 'Haul hours each');
  const hoursFinishEach = number(input.hoursFinishEach ?? 0, 'Finish hours each');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const windowInvoice = number(input.windowInvoice ?? 0, 'Window invoice');
  const wellInvoice = number(input.wellInvoice ?? 0, 'Well invoice');
  const coverEach = number(input.coverEach ?? 0, 'Cover each');
  const ladderEach = number(input.ladderEach ?? 0, 'Ladder each');
  const drainKitEach = number(input.drainKitEach ?? 0, 'Drain kit each');
  const haulEach = number(input.haulEach ?? 0, 'Haul each');
  const finishEach = number(input.finishEach ?? 0, 'Finish each');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');

  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursWindow = windowCount * hoursWindowEach;
  const hoursCut = windowCount * hoursCutEach;
  const hoursWell = windowCount * (hoursWellBase + hoursWellEach);
  const hoursCoverApplied = includeCover ? windowCount * hoursCoverEach : 0;
  const hoursLadderApplied = includeLadder ? windowCount * hoursLadderEach : 0;
  const hoursDrainApplied = includeDrain ? windowCount * hoursDrainEach : 0;
  const hoursHaulApplied = includeHaul ? windowCount * hoursHaulEach : 0;
  const hoursFinishApplied = includeInteriorFinish ? windowCount * hoursFinishEach : 0;
  const extraWorkHours = hoursCut + hoursWell + hoursCoverApplied + hoursLadderApplied
    + hoursDrainApplied + hoursHaulApplied + hoursFinishApplied;
  const totalHours = hoursTravel + hoursWindow + extraWorkHours + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const windowMaterial = windowCount * windowInvoice;
  const wellMaterial = windowCount * wellInvoice;
  const coverMaterial = includeCover ? windowCount * coverEach : 0;
  const ladderMaterial = includeLadder ? windowCount * ladderEach : 0;
  const drainMaterial = includeDrain ? windowCount * drainKitEach : 0;
  const haulMaterial = includeHaul ? windowCount * haulEach : 0;
  const finishMaterial = includeInteriorFinish ? windowCount * finishEach : 0;
  const travelInvoice = travelMiles * travelPerMile;
  const sashMaterial = windowMaterial + wellMaterial;
  const extraHardware = coverMaterial + ladderMaterial + drainMaterial
    + haulMaterial + finishMaterial + travelInvoice;
  const materialCost = sashMaterial + extraHardware;

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
  const extraCost = extraHardware
    + hoursCut * loadedWage
    + hoursWell * loadedWage
    + hoursCoverApplied * loadedWage
    + hoursLadderApplied * loadedWage
    + hoursDrainApplied * loadedWage
    + hoursHaulApplied * loadedWage
    + hoursFinishApplied * loadedWage
    + hoursTravel * loadedWage;

  return {
    scope,
    window,
    well,
    windowCount,
    travelMiles,
    includeCover,
    includeLadder,
    includeDrain,
    includeHaul,
    includeInteriorFinish,
    loadedWage,
    hoursTravel,
    hoursWindow,
    hoursCut,
    hoursWell,
    hoursCover: hoursCoverApplied,
    hoursLadder: hoursLadderApplied,
    hoursDrain: hoursDrainApplied,
    hoursHaul: hoursHaulApplied,
    hoursFinish: hoursFinishApplied,
    siteHours,
    totalHours,
    laborCost,
    windowMaterial,
    wellMaterial,
    coverMaterial,
    ladderMaterial,
    drainMaterial,
    haulMaterial,
    finishMaterial,
    travelInvoice,
    extraHardware,
    extraCost,
    sashMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerWindow: windowCount === 0 ? null : price / windowCount,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      sash: costShare(sashMaterial),
      extra: costShare(extraCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      travel: hourShare(hoursTravel),
      window: hourShare(hoursWindow),
      cut: hourShare(hoursCut),
      well: hourShare(hoursWell),
      cover: hourShare(hoursCoverApplied),
      ladder: hourShare(hoursLadderApplied),
      drain: hourShare(hoursDrainApplied),
      haul: hourShare(hoursHaulApplied),
      finish: hourShare(hoursFinishApplied),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perWindow: windowCount === 0 ? null : proposedPrice / windowCount,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same opening four ways — retrofit, wood cut, masonry
 * cut, poured cut — from the suggested scope kits so the
 * contractor can see when a new cut flips the cheap $1,800
 * special. User-typed scope rates are not reused here: the
 * comparison is apples-to-apples on the starting figures.
 * Window and well kits stay with the current job.
 */
export function compareScope(input) {
  const windowKit = suggestedWindowKit(String(input.window ?? 'vinyl-hopper'));
  const wellKit = suggestedWellKit(String(input.well ?? 'plastic'));
  const extraKit = suggestedExtraKit();
  const rows = SCOPE_PRESETS.map((preset) => {
    const kit = suggestedScopeKit(preset.id);
    const bid = calculateBid({
      ...input,
      scope: preset.id,
      ...windowKit,
      ...wellKit,
      ...extraKit,
      ...kit,
    });
    return {
      scope: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerWindow: bid.pricePerWindow,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursWindow: bid.hoursWindow,
      hoursCut: bid.hoursCut,
      hoursWell: bid.hoursWell,
      wellMaterial: bid.wellMaterial,
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
 * Price the same opening four ways — hopper, slider, casement,
 * fiberglass — from the suggested window kits so the contractor
 * can see the upgrade a homeowner is actually asking for.
 * User-typed window rates are not reused here: the comparison is
 * apples-to-apples on the starting figures. Scope and well kits
 * stay with the current job.
 */
export function compareWindow(input) {
  const scopeKit = suggestedScopeKit(String(input.scope ?? 'retrofit-existing'));
  const wellKit = suggestedWellKit(String(input.well ?? 'plastic'));
  const extraKit = suggestedExtraKit();
  const rows = WINDOW_PRESETS.map((preset) => {
    const kit = suggestedWindowKit(preset.id);
    const bid = calculateBid({
      ...input,
      window: preset.id,
      ...scopeKit,
      ...wellKit,
      ...extraKit,
      ...kit,
    });
    return {
      window: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerWindow: bid.pricePerWindow,
      hoursWindow: bid.hoursWindow,
      windowMaterial: bid.windowMaterial,
      extraCost: bid.extraCost,
      breakEvenPrice: bid.breakEvenPrice,
    };
  });
  const cheapest = Math.min(...rows.map((row) => row.price));
  const hopper = rows.find((row) => row.window === 'vinyl-hopper');
  return rows
    .map((row) => ({
      ...row,
      cheapest: row.price === cheapest,
      delta: row.price - cheapest,
      upgradeFromHopper: hopper ? row.price - hopper.price : 0,
    }))
    .sort((a, b) => a.price - b.price);
}

function money(value) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a bid as a plain-text draft the contractor can paste
 * into a proposal. Costs, wages, and invoices are omitted on
 * purpose — this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Egress window install') {
  const perWindow = result.pricePerWindow === null
    ? 'n/a'
    : `${money(result.pricePerWindow)} / window`;
  const scope = SCOPE_PRESETS.find((item) => item.id === result.scope)?.label ?? result.scope;
  const window = WINDOW_PRESETS.find((item) => item.id === result.window)?.label ?? result.window;
  const well = WELL_PRESETS.find((item) => item.id === result.well)?.label ?? result.well;
  const extras = [
    `${result.travelMiles} travel miles`,
    window,
    well,
    `${result.windowCount} window${result.windowCount === 1 ? '' : 's'}`,
    result.includeCover ? 'well cover included' : 'no well cover',
    result.includeLadder ? 'escape ladder included' : 'no escape ladder',
    result.includeDrain ? 'well drain included' : 'no well drain',
    result.includeHaul ? 'dirt haul included' : 'no dirt haul',
    result.includeInteriorFinish ? 'interior finish included' : 'no interior finish',
  ].join('; ');
  return [
    'EGRESS WINDOW INSTALL BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${scope}`,
    `Price per window: ${perWindow}`,
    `Windows: ${result.windowCount.toLocaleString('en-US')}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.windowCount} window${result.windowCount === 1 ? '' : 's'}; ${window}; ${scope}; ${well}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; sash: ${result.hoursWindow.toFixed(1)} h; extras: ${(result.hoursCut + result.hoursWell + result.hoursCover + result.hoursLadder + result.hoursDrain + result.hoursHaul + result.hoursFinish).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm window count, sash, cut, well, extras, and all pricing before sending. It is not a building-code determination, an egress-size approval, a foundation design, a waterproofing design, a window-replacement bid, a basement-finishing bid, or a product warranty.',
  ].join('\n');
}
