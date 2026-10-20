// Pure bid arithmetic for residential basement finishing.
// No network, no state: every square foot, scope, ceiling, floor,
// bath, wage, and invoice is an input, so the result stays a
// transparent calculation the remodeler can check against their own
// tickets rather than a claim about what any basement "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$30 a square foot finished basement" special treats 800 SF of
// rec-room paint, drop ceiling, and carpet as the same job as 1,000 SF
// of legal living with a full bath, two bedrooms, two egress windows,
// HVAC, and a permit. Homeowners (and a lot of estimator sheets) count
// the same kind of number. Bath, egress, stairs, HVAC, and legal-sleeping
// extras do not scale with that square-foot dump. Matching a cheap rec-room
// special on a bedroom-suite finish is how a sold basement becomes a
// loss when the wet work and the egress eat the margin.
//
// Distinct from *basement waterproofing* (interior drain, window wells,
// sump pit), *crawl-space encapsulation* (liner and access), *drywall*
// (hang and finish gypsum as the job), *flooring* (floor waste and
// tear-out), *interior painting* (a coat), and *walk-in shower* (wet
// area, slope, glass). This prices a basement finish: finished SF,
// rec-room versus framed versus legal-living, ceiling, floor, and extras.

export const SCOPE_PRESETS = Object.freeze([
  { id: 'rec-room', label: 'Rec room — paint, drop ceiling, carpet (the cheap special)' },
  { id: 'framed-finish', label: 'Framed finish — frame, insulate, drywall, no bath' },
  { id: 'legal-living', label: 'Legal living — habitable space, bedrooms, code extras' },
]);

export const CEILING_PRESETS = Object.freeze([
  { id: 'drop-ceiling', label: 'Drop ceiling — the cheap special' },
  { id: 'drywall-ceiling', label: 'Drywall ceiling — hang and finish' },
  { id: 'already-finished', label: 'Ceiling already finished' },
]);

export const FLOOR_PRESETS = Object.freeze([
  { id: 'carpet', label: 'Carpet — the cheap special' },
  { id: 'lvp', label: 'LVP / vinyl plank' },
  { id: 'already-done', label: 'Floor already done' },
]);

export const BATH_PRESETS = Object.freeze([
  { id: 'none', label: 'No bathroom' },
  { id: 'half', label: 'Half bath — toilet and sink' },
  { id: 'full', label: 'Full bath — toilet, sink, shower' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Cheap special: 800 SF rec room, drop ceiling, carpet, no bath',
    finishedSf: 800,
    ceilingHeightFt: 8,
    egressWindows: 0,
    bedrooms: 0,
    scope: 'rec-room',
    ceiling: 'drop-ceiling',
    floor: 'carpet',
    bath: 'none',
    travelMiles: 12,
    includeStairsRebuild: false,
    includeWetBar: false,
    includeHvacExtend: false,
    includePermit: false,
  },
  {
    label: 'Typical framed: 900 SF framed finish, drop ceiling, LVP, no bath',
    finishedSf: 900,
    ceilingHeightFt: 8,
    egressWindows: 0,
    bedrooms: 0,
    scope: 'framed-finish',
    ceiling: 'drop-ceiling',
    floor: 'lvp',
    bath: 'none',
    travelMiles: 16,
    includeStairsRebuild: false,
    includeWetBar: false,
    includeHvacExtend: true,
    includePermit: false,
  },
  {
    label: 'Legal suite: 1,000 SF, drywall ceiling, LVP, full bath, 2 bedrooms, 2 egress',
    finishedSf: 1000,
    ceilingHeightFt: 8,
    egressWindows: 2,
    bedrooms: 2,
    scope: 'legal-living',
    ceiling: 'drywall-ceiling',
    floor: 'lvp',
    bath: 'full',
    travelMiles: 20,
    includeStairsRebuild: false,
    includeWetBar: false,
    includeHvacExtend: true,
    includePermit: true,
  },
  {
    label: 'Heavy finish: 1,200 SF legal living, 9 ft, full bath, stairs, wet bar, HVAC',
    finishedSf: 1200,
    ceilingHeightFt: 9,
    egressWindows: 2,
    bedrooms: 2,
    scope: 'legal-living',
    ceiling: 'drywall-ceiling',
    floor: 'lvp',
    bath: 'full',
    travelMiles: 28,
    includeStairsRebuild: true,
    includeWetBar: true,
    includeHvacExtend: true,
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
 * Taller walls take more hang and finish. 8 ft is the cheap-special
 * assumption. A 7 ft basement is less skin; 9 ft is more.
 */
export function heightFactor(ceilingHeightFt) {
  const height = number(ceilingHeightFt, 'Ceiling height');
  return height / 8;
}

/**
 * Rec-room is paint and light carpentry on walls that already stand.
 * Framed-finish is studs, insulation, and drywall. Legal-living adds
 * the habitable-space extras (bedroom circuits, smoke, egress path)
 * that a $30 / SF special never prices.
 */
export function suggestedScopeKit(scope) {
  const id = String(scope);
  if (id === 'rec-room') {
    return {
      hoursShellPerSf: 0.12,
      framePerSf: 0,
      insulationPerSf: 0,
      drywallPerSf: 0.4,
      shellInvoicePerSf: 3.5,
    };
  }
  if (id === 'framed-finish') {
    return {
      hoursShellPerSf: 0.38,
      framePerSf: 4.8,
      insulationPerSf: 1.9,
      drywallPerSf: 3.4,
      shellInvoicePerSf: 2.2,
    };
  }
  if (id === 'legal-living') {
    return {
      hoursShellPerSf: 0.48,
      framePerSf: 5.4,
      insulationPerSf: 2.1,
      drywallPerSf: 3.6,
      shellInvoicePerSf: 2.6,
    };
  }
  throw new Error('Unknown scope');
}

/**
 * Drop ceiling is the cheap-special assumption. Drywall ceiling is
 * hang and finish. Already-finished skips the plane.
 */
export function suggestedCeilingKit(ceiling) {
  const id = String(ceiling);
  if (id === 'drop-ceiling') {
    return { hoursCeilingPerSf: 0.06, ceilingPerSf: 2.8 };
  }
  if (id === 'drywall-ceiling') {
    return { hoursCeilingPerSf: 0.14, ceilingPerSf: 3.6 };
  }
  if (id === 'already-finished') {
    return { hoursCeilingPerSf: 0, ceilingPerSf: 0 };
  }
  throw new Error('Unknown ceiling');
}

/**
 * Carpet is the cheap special. LVP is more hours and a higher
 * invoice. Already-done skips the floor.
 */
export function suggestedFloorKit(floor) {
  const id = String(floor);
  if (id === 'carpet') {
    return { hoursFloorPerSf: 0.05, floorPerSf: 3.2, wasteRate: 0.08 };
  }
  if (id === 'lvp') {
    return { hoursFloorPerSf: 0.08, floorPerSf: 4.8, wasteRate: 0.1 };
  }
  if (id === 'already-done') {
    return { hoursFloorPerSf: 0, floorPerSf: 0, wasteRate: 0 };
  }
  throw new Error('Unknown floor');
}

/**
 * No bath is the cheap-special assumption. A half bath is a toilet
 * and a sink. A full bath is a shower too — not a walk-in shower
 * remodel on its own, just the wet room inside a basement finish.
 */
export function suggestedBathKit(bath) {
  const id = String(bath);
  if (id === 'none') {
    return { hoursBath: 0, bathInvoice: 0 };
  }
  if (id === 'half') {
    return { hoursBath: 18, bathInvoice: 2200 };
  }
  if (id === 'full') {
    return { hoursBath: 42, bathInvoice: 5800 };
  }
  throw new Error('Unknown bath');
}

/**
 * Starting extras that do not live in a $30 / SF special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 1.4,
    hoursPerMile: 0.035,
    hoursPerEgress: 8,
    hoursPerBedroom: 6,
    hoursStairs: 14,
    hoursWetBar: 10,
    hoursHvac: 12,
    hoursPermit: 3,
    siteHours: 8,
    egressEach: 950,
    bedroomEach: 380,
    stairsInvoice: 2400,
    wetBarInvoice: 1600,
    hvacInvoice: 3200,
    permitInvoice: 450,
    travelPerMile: 2.8,
  };
}

/**
 * Price a basement finish from the finished SF, the scope,
 * the ceiling, the floor, the bath, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const scope = requirePreset(SCOPE_PRESETS, input.scope, 'scope').id;
  const ceiling = requirePreset(CEILING_PRESETS, input.ceiling, 'ceiling').id;
  const floor = requirePreset(FLOOR_PRESETS, input.floor, 'floor').id;
  const bath = requirePreset(BATH_PRESETS, input.bath, 'bath').id;

  const finishedSf = number(input.finishedSf ?? 0, 'Finished square feet');
  const ceilingHeightFt = number(input.ceilingHeightFt ?? 0, 'Ceiling height');
  const egressWindows = number(input.egressWindows ?? 0, 'Egress windows');
  const bedrooms = number(input.bedrooms ?? 0, 'Bedrooms');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const includeStairsRebuild = flag(input.includeStairsRebuild);
  const includeWetBar = flag(input.includeWetBar);
  const includeHvacExtend = flag(input.includeHvacExtend);
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
  const hoursShellPerSf = number(input.hoursShellPerSf ?? 0, 'Shell hours per SF');
  const hoursCeilingPerSf = number(input.hoursCeilingPerSf ?? 0, 'Ceiling hours per SF');
  const hoursFloorPerSf = number(input.hoursFloorPerSf ?? 0, 'Floor hours per SF');
  const hoursBath = number(input.hoursBath ?? 0, 'Bath hours');
  const hoursPerEgress = number(input.hoursPerEgress ?? 0, 'Hours per egress');
  const hoursPerBedroom = number(input.hoursPerBedroom ?? 0, 'Hours per bedroom');
  const hoursStairs = number(input.hoursStairs ?? 0, 'Stairs hours');
  const hoursWetBar = number(input.hoursWetBar ?? 0, 'Wet-bar hours');
  const hoursHvac = number(input.hoursHvac ?? 0, 'HVAC hours');
  const hoursPermit = number(input.hoursPermit ?? 0, 'Permit hours');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const wasteRate = number(input.wasteRate ?? 0, 'Waste rate');
  const framePerSf = number(input.framePerSf ?? 0, 'Frame per SF');
  const insulationPerSf = number(input.insulationPerSf ?? 0, 'Insulation per SF');
  const drywallPerSf = number(input.drywallPerSf ?? 0, 'Drywall per SF');
  const shellInvoicePerSf = number(input.shellInvoicePerSf ?? 0, 'Shell invoice per SF');
  const ceilingPerSf = number(input.ceilingPerSf ?? 0, 'Ceiling per SF');
  const floorPerSf = number(input.floorPerSf ?? 0, 'Floor per SF');
  const bathInvoice = number(input.bathInvoice ?? 0, 'Bath invoice');
  const egressEach = number(input.egressEach ?? 0, 'Egress each');
  const bedroomEach = number(input.bedroomEach ?? 0, 'Bedroom each');
  const stairsInvoice = number(input.stairsInvoice ?? 0, 'Stairs invoice');
  const wetBarInvoice = number(input.wetBarInvoice ?? 0, 'Wet-bar invoice');
  const hvacInvoice = number(input.hvacInvoice ?? 0, 'HVAC invoice');
  const permitInvoice = number(input.permitInvoice ?? 0, 'Permit invoice');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');

  const factor = heightFactor(ceilingHeightFt);
  const buySf = finishedSf * (1 + wasteRate);
  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursShell = finishedSf * hoursShellPerSf * factor;
  const hoursCeiling = finishedSf * hoursCeilingPerSf * factor;
  const hoursFloor = finishedSf * hoursFloorPerSf;
  const hoursBathApplied = bath === 'none' ? 0 : hoursBath;
  const hoursEgress = egressWindows * hoursPerEgress;
  const hoursBedrooms = bedrooms * hoursPerBedroom;
  const hoursStairsApplied = includeStairsRebuild ? hoursStairs : 0;
  const hoursWetBarApplied = includeWetBar ? hoursWetBar : 0;
  const hoursHvacApplied = includeHvacExtend ? hoursHvac : 0;
  const hoursPermitApplied = includePermit ? hoursPermit : 0;
  const extraWorkHours = hoursCeiling + hoursFloor + hoursBathApplied
    + hoursEgress + hoursBedrooms + hoursStairsApplied
    + hoursWetBarApplied + hoursHvacApplied + hoursPermitApplied;
  const totalHours = hoursTravel + hoursShell + extraWorkHours + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const frameMaterial = finishedSf * framePerSf;
  const insulationMaterial = finishedSf * insulationPerSf;
  const drywallMaterial = finishedSf * drywallPerSf;
  const shellMaterial = finishedSf * shellInvoicePerSf;
  const ceilingMaterial = finishedSf * ceilingPerSf;
  const floorMaterial = buySf * floorPerSf;
  const bathMaterial = bath === 'none' ? 0 : bathInvoice;
  const egressMaterial = egressWindows * egressEach;
  const bedroomMaterial = bedrooms * bedroomEach;
  const stairsMaterial = includeStairsRebuild ? stairsInvoice : 0;
  const wetBarMaterial = includeWetBar ? wetBarInvoice : 0;
  const hvacMaterial = includeHvacExtend ? hvacInvoice : 0;
  const permitMaterial = includePermit ? permitInvoice : 0;
  const travelInvoice = travelMiles * travelPerMile;
  const finishMaterial = frameMaterial + insulationMaterial + drywallMaterial
    + shellMaterial + ceilingMaterial + floorMaterial;
  const extraHardware = bathMaterial + egressMaterial + bedroomMaterial
    + stairsMaterial + wetBarMaterial + hvacMaterial
    + permitMaterial + travelInvoice;
  const materialCost = finishMaterial + extraHardware;

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
    scope,
    ceiling,
    floor,
    bath,
    finishedSf,
    buySf,
    ceilingHeightFt,
    heightFactor: factor,
    egressWindows,
    bedrooms,
    travelMiles,
    includeStairsRebuild,
    includeWetBar,
    includeHvacExtend,
    includePermit,
    loadedWage,
    hoursTravel,
    hoursShell,
    hoursCeiling,
    hoursFloor,
    hoursBath: hoursBathApplied,
    hoursEgress,
    hoursBedrooms,
    hoursStairs: hoursStairsApplied,
    hoursWetBar: hoursWetBarApplied,
    hoursHvac: hoursHvacApplied,
    hoursPermit: hoursPermitApplied,
    siteHours,
    totalHours,
    laborCost,
    frameMaterial,
    insulationMaterial,
    drywallMaterial,
    shellMaterial,
    ceilingMaterial,
    floorMaterial,
    bathMaterial,
    egressMaterial,
    bedroomMaterial,
    stairsMaterial,
    wetBarMaterial,
    hvacMaterial,
    permitMaterial,
    travelInvoice,
    extraHardware,
    extraCost,
    finishMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSf: finishedSf === 0 ? null : price / finishedSf,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      finish: costShare(finishMaterial),
      extra: costShare(extraCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      travel: hourShare(hoursTravel),
      shell: hourShare(hoursShell),
      ceiling: hourShare(hoursCeiling),
      floor: hourShare(hoursFloor),
      bath: hourShare(hoursBathApplied),
      egress: hourShare(hoursEgress),
      bedrooms: hourShare(hoursBedrooms),
      stairs: hourShare(hoursStairsApplied),
      wetBar: hourShare(hoursWetBarApplied),
      hvac: hourShare(hoursHvacApplied),
      permit: hourShare(hoursPermitApplied),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perSf: finishedSf === 0 ? null : proposedPrice / finishedSf,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same basement three ways — rec-room, framed-finish,
 * legal-living — from the suggested scope kits so the remodeler can
 * see when a bath, egress, and habitable extras flip the cheap
 * $30 / SF special. User-typed scope rates are not reused here: the
 * comparison is apples-to-apples on the starting figures. Ceiling,
 * floor, and bath kits stay with the current job.
 */
export function compareScope(input) {
  const ceilingKit = suggestedCeilingKit(String(input.ceiling ?? 'drop-ceiling'));
  const floorKit = suggestedFloorKit(String(input.floor ?? 'carpet'));
  const bathKit = suggestedBathKit(String(input.bath ?? 'none'));
  const extraKit = suggestedExtraKit();
  const rows = SCOPE_PRESETS.map((preset) => {
    const kit = suggestedScopeKit(preset.id);
    const bid = calculateBid({
      ...input,
      scope: preset.id,
      ...ceilingKit,
      ...floorKit,
      ...bathKit,
      ...extraKit,
      ...kit,
    });
    return {
      scope: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerSf: bid.pricePerSf,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursShell: bid.hoursShell,
      frameMaterial: bid.frameMaterial,
      drywallMaterial: bid.drywallMaterial,
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
 * Format a bid as a plain-text draft the remodeler can paste into
 * a proposal. Costs, wages, and invoices are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Basement finish') {
  const perSf = result.pricePerSf === null
    ? 'n/a'
    : `${money(result.pricePerSf)} / SF`;
  const scope = SCOPE_PRESETS.find((item) => item.id === result.scope)?.label ?? result.scope;
  const ceiling = CEILING_PRESETS.find((item) => item.id === result.ceiling)?.label ?? result.ceiling;
  const floor = FLOOR_PRESETS.find((item) => item.id === result.floor)?.label ?? result.floor;
  const bath = BATH_PRESETS.find((item) => item.id === result.bath)?.label ?? result.bath;
  const extras = [
    `${result.travelMiles} travel miles`,
    `${result.ceilingHeightFt} ft ceiling`,
    ceiling,
    floor,
    bath,
    `${result.egressWindows} egress window${result.egressWindows === 1 ? '' : 's'}`,
    `${result.bedrooms} bedroom${result.bedrooms === 1 ? '' : 's'}`,
    result.includeStairsRebuild ? 'stair rebuild included' : 'existing stairs',
    result.includeWetBar ? 'wet bar included' : 'no wet bar',
    result.includeHvacExtend ? 'HVAC extend included' : 'no HVAC extend',
    result.includePermit ? 'permit coordination included' : 'no permit line',
  ].join('; ');
  return [
    'BASEMENT FINISHING BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${scope}`,
    `Price per square foot: ${perSf}`,
    `Finished area: ${result.finishedSf.toLocaleString('en-US')} SF (buy ${result.buySf.toLocaleString('en-US')} SF of floor with waste)`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.finishedSf} SF finished; ${scope}; ${ceiling}; ${floor}; ${bath}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; shell: ${result.hoursShell.toFixed(1)} h; extras: ${(result.hoursCeiling + result.hoursFloor + result.hoursBath + result.hoursEgress + result.hoursBedrooms + result.hoursStairs + result.hoursWetBar + result.hoursHvac + result.hoursPermit).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm finished SF, scope, ceiling, floor, bath, extras, and all pricing before sending. It is not a building-code determination, a waterproofing design, a habitable-space certificate, an egress design, a walk-in shower, a drywall-only job, a floor install, or a product warranty.',
  ].join('\n');
}
