// Pure bid arithmetic for residential skylight install.
// No network, no state: every unit count, type, roof, wage,
// and flashing invoice is an input, so the result stays a transparent
// calculation the roofer or window crew can check against their own
// tickets rather than a claim about what any opening "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$800 a skylight installed" special treats one tubular sun tunnel
// dropped into an existing chase as the same job as two solar-venting
// glass units with new roof cut-ins, tile flashing, drywall light
// shafts, and a second-story ladder. Homeowners (and a lot of
// estimator sheets) count the same kind of number. The unit, the
// cut-in, the roof, and the shaft do not scale with that per-unit
// dump. Matching a cheap tube quote on a venting cut-in is how a
// sold opening becomes a loss when the shaft and the flashing eat
// the margin.
//
// Distinct from *window replacement* (wall openings, united inches),
// *asphalt shingle reroof* (squares, pitch factor, tear-off bags),
// *metal roof* (standing-seam panels), *solar PV* (dollars per watt),
// *sunroom* (glazed walls), and *screened porch* (mesh panels). This
// prices a skylight: unit count, type, scope, roof, and the extras.

export const TYPE_PRESETS = Object.freeze([
  { id: 'tubular', label: 'Tubular sun tunnel — the cheap $800 special' },
  { id: 'fixed', label: 'Fixed glass — no vent, a real curb unit' },
  { id: 'venting-solar', label: 'Solar / electric venting — rain sensor, remote' },
]);

export const SCOPE_PRESETS = Object.freeze([
  { id: 'replace-existing', label: 'Replace existing — pull the old unit, reuse the curb if sound' },
  { id: 'new-cut-in', label: 'New cut-in — open the roof and the ceiling' },
]);

export const ROOF_PRESETS = Object.freeze([
  { id: 'asphalt', label: 'Asphalt shingle — standard flashing kit' },
  { id: 'tile-or-metal', label: 'Tile or metal — specialty flashing' },
  { id: 'low-slope', label: 'Low-slope — curb and extra waterproofing' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Cheap special: 1 tubular, replace existing, asphalt, 1 story',
    units: 1,
    shafts: 0,
    stories: 1,
    type: 'tubular',
    scope: 'replace-existing',
    roof: 'asphalt',
    travelMiles: 8,
    includeIceWater: false,
    includeLaminated: false,
    includePaint: false,
  },
  {
    label: 'Typical: 2 fixed 22x46, new cut-in, 2 shafts, asphalt, 1 story',
    units: 2,
    shafts: 2,
    stories: 1,
    type: 'fixed',
    scope: 'new-cut-in',
    roof: 'asphalt',
    travelMiles: 12,
    includeIceWater: true,
    includeLaminated: false,
    includePaint: true,
  },
  {
    label: 'Venting: 1 solar venting, new cut-in, 1 shaft, steep asphalt, 2 stories',
    units: 1,
    shafts: 1,
    stories: 2,
    type: 'venting-solar',
    scope: 'new-cut-in',
    roof: 'asphalt',
    travelMiles: 16,
    includeIceWater: true,
    includeLaminated: false,
    includePaint: true,
  },
  {
    label: 'Heavy: 3 venting units, tile roof, 3 shafts, laminated, 2 stories',
    units: 3,
    shafts: 3,
    stories: 2,
    type: 'venting-solar',
    scope: 'new-cut-in',
    roof: 'tile-or-metal',
    travelMiles: 22,
    includeIceWater: true,
    includeLaminated: true,
    includePaint: true,
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
 * Tubular is the cheap-special assumption — a 10–14" sun tunnel
 * dropped into a chase. Fixed is a glass curb unit. Venting-solar
 * is the remote, the rain sensor, and a heavier curb.
 */
export function suggestedTypeKit(type) {
  const id = String(type);
  if (id === 'tubular') {
    return { hoursPerUnit: 2.5, unitInvoice: 380, flashingInvoice: 85 };
  }
  if (id === 'fixed') {
    return { hoursPerUnit: 4.5, unitInvoice: 720, flashingInvoice: 140 };
  }
  if (id === 'venting-solar') {
    return { hoursPerUnit: 5.8, unitInvoice: 1450, flashingInvoice: 160 };
  }
  throw new Error('Unknown type');
}

/**
 * Replace-existing pulls the old unit and reuses a sound curb.
 * New cut-in opens the roof and the ceiling and frames the hole.
 */
export function suggestedScopeKit(scope) {
  const id = String(scope);
  if (id === 'replace-existing') {
    return { cutHoursPerUnit: 0.4, pullHoursPerUnit: 0.8, framingHoursPerUnit: 0.3 };
  }
  if (id === 'new-cut-in') {
    return { cutHoursPerUnit: 1.6, pullHoursPerUnit: 0, framingHoursPerUnit: 1.4 };
  }
  throw new Error('Unknown scope');
}

/**
 * Asphalt takes a standard kit. Tile or metal is specialty flashing.
 * Low-slope is a built curb and extra waterproofing.
 */
export function suggestedRoofKit(roof) {
  const id = String(roof);
  if (id === 'asphalt') {
    return { roofHoursPerUnit: 0.6, roofFlashInvoice: 0 };
  }
  if (id === 'tile-or-metal') {
    return { roofHoursPerUnit: 1.8, roofFlashInvoice: 220 };
  }
  if (id === 'low-slope') {
    return { roofHoursPerUnit: 2.2, roofFlashInvoice: 280 };
  }
  throw new Error('Unknown roof');
}

/**
 * Starting extras that do not live in an $800 / unit special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 1.4,
    hoursPerMile: 0.035,
    hoursPerShaft: 2.8,
    hoursIceWater: 0.7,
    hoursLaminated: 0.3,
    hoursPaintPerShaft: 1.1,
    hoursPerStoryAboveFirst: 0.8,
    siteHours: 1.0,
    shaftInvoice: 95,
    iceWaterInvoice: 45,
    laminatedInvoice: 180,
    paintInvoice: 55,
    travelPerMile: 2.8,
  };
}

/**
 * Price a skylight install from the units, the type, the scope,
 * the roof, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const type = requirePreset(TYPE_PRESETS, input.type, 'type').id;
  const scope = requirePreset(SCOPE_PRESETS, input.scope, 'scope').id;
  const roof = requirePreset(ROOF_PRESETS, input.roof, 'roof').id;

  const units = number(input.units ?? 0, 'Units');
  const shafts = number(input.shafts ?? 0, 'Shafts');
  const stories = number(input.stories ?? 1, 'Stories', { min: 1 });
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const includeIceWater = flag(input.includeIceWater);
  const includeLaminated = flag(input.includeLaminated);
  const includePaint = flag(input.includePaint);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursPerUnit = number(input.hoursPerUnit ?? 0, 'Hours per unit');
  const cutHoursPerUnit = number(input.cutHoursPerUnit ?? 0, 'Cut hours per unit');
  const pullHoursPerUnit = number(input.pullHoursPerUnit ?? 0, 'Pull hours per unit');
  const framingHoursPerUnit = number(input.framingHoursPerUnit ?? 0, 'Framing hours per unit');
  const roofHoursPerUnit = number(input.roofHoursPerUnit ?? 0, 'Roof hours per unit');
  const hoursPerShaft = number(input.hoursPerShaft ?? 0, 'Hours per shaft');
  const hoursIceWater = number(input.hoursIceWater ?? 0, 'Ice-and-water hours');
  const hoursLaminated = number(input.hoursLaminated ?? 0, 'Laminated hours');
  const hoursPaintPerShaft = number(input.hoursPaintPerShaft ?? 0, 'Paint hours per shaft');
  const hoursPerStoryAboveFirst = number(input.hoursPerStoryAboveFirst ?? 0, 'Hours per story above first');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const unitInvoice = number(input.unitInvoice ?? 0, 'Unit invoice');
  const flashingInvoice = number(input.flashingInvoice ?? 0, 'Flashing invoice');
  const roofFlashInvoice = number(input.roofFlashInvoice ?? 0, 'Roof flashing invoice');
  const shaftInvoice = number(input.shaftInvoice ?? 0, 'Shaft invoice');
  const iceWaterInvoice = number(input.iceWaterInvoice ?? 0, 'Ice-and-water invoice');
  const laminatedInvoice = number(input.laminatedInvoice ?? 0, 'Laminated invoice');
  const paintInvoice = number(input.paintInvoice ?? 0, 'Paint invoice');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');

  const storySteps = Math.max(0, stories - 1);
  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursUnits = units * hoursPerUnit;
  const hoursCut = units * cutHoursPerUnit;
  const hoursPull = units * pullHoursPerUnit;
  const hoursFraming = units * framingHoursPerUnit;
  const hoursRoof = units * roofHoursPerUnit;
  const hoursShafts = shafts * hoursPerShaft;
  const hoursIceWaterApplied = includeIceWater ? units * hoursIceWater : 0;
  const hoursLaminatedApplied = includeLaminated ? units * hoursLaminated : 0;
  const hoursPaintApplied = includePaint ? shafts * hoursPaintPerShaft : 0;
  const hoursStories = units * storySteps * hoursPerStoryAboveFirst;
  const extraWorkHours = hoursCut + hoursPull + hoursFraming + hoursRoof
    + hoursShafts + hoursIceWaterApplied + hoursLaminatedApplied
    + hoursPaintApplied + hoursStories;
  const totalHours = hoursTravel + hoursUnits + extraWorkHours + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const unitMaterial = units * unitInvoice;
  const flashingMaterial = units * flashingInvoice;
  const roofFlashMaterial = units * roofFlashInvoice;
  const shaftMaterial = shafts * shaftInvoice;
  const iceWaterMaterial = includeIceWater ? units * iceWaterInvoice : 0;
  const laminatedMaterial = includeLaminated ? units * laminatedInvoice : 0;
  const paintMaterial = includePaint ? shafts * paintInvoice : 0;
  const travelInvoice = travelMiles * travelPerMile;
  const finishMaterial = unitMaterial + flashingMaterial;
  const extraHardware = roofFlashMaterial + shaftMaterial + iceWaterMaterial
    + laminatedMaterial + paintMaterial + travelInvoice;
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
  const extraCost = extraHardware
    + hoursCut * loadedWage
    + hoursPull * loadedWage
    + hoursFraming * loadedWage
    + hoursRoof * loadedWage
    + hoursShafts * loadedWage
    + hoursIceWaterApplied * loadedWage
    + hoursLaminatedApplied * loadedWage
    + hoursPaintApplied * loadedWage
    + hoursStories * loadedWage
    + hoursTravel * loadedWage;

  return {
    type,
    scope,
    roof,
    units,
    shafts,
    stories,
    travelMiles,
    includeIceWater,
    includeLaminated,
    includePaint,
    loadedWage,
    hoursTravel,
    hoursUnits,
    hoursCut,
    hoursPull,
    hoursFraming,
    hoursRoof,
    hoursShafts,
    hoursIceWater: hoursIceWaterApplied,
    hoursLaminated: hoursLaminatedApplied,
    hoursPaint: hoursPaintApplied,
    hoursStories,
    siteHours,
    totalHours,
    laborCost,
    unitMaterial,
    flashingMaterial,
    roofFlashMaterial,
    shaftMaterial,
    iceWaterMaterial,
    laminatedMaterial,
    paintMaterial,
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
    pricePerUnit: units === 0 ? null : price / units,
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
      units: hourShare(hoursUnits),
      cut: hourShare(hoursCut),
      pull: hourShare(hoursPull),
      framing: hourShare(hoursFraming),
      roof: hourShare(hoursRoof),
      shafts: hourShare(hoursShafts),
      iceWater: hourShare(hoursIceWaterApplied),
      laminated: hourShare(hoursLaminatedApplied),
      paint: hourShare(hoursPaintApplied),
      stories: hourShare(hoursStories),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perUnit: units === 0 ? null : proposedPrice / units,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same openings three ways — tubular, fixed,
 * venting-solar — from the suggested type kits so the
 * crew can see when a cheap $800 / unit special is a
 * tube number applied to a glass cut-in. User-typed type
 * rates are not reused here: the comparison is
 * apples-to-apples on the starting figures. Scope and
 * roof kits stay with the current job.
 */
export function compareType(input) {
  const scopeKit = suggestedScopeKit(String(input.scope ?? 'replace-existing'));
  const roofKit = suggestedRoofKit(String(input.roof ?? 'asphalt'));
  const extraKit = suggestedExtraKit();
  const rows = TYPE_PRESETS.map((preset) => {
    const kit = suggestedTypeKit(preset.id);
    const bid = calculateBid({
      ...input,
      type: preset.id,
      ...scopeKit,
      ...roofKit,
      ...extraKit,
      ...kit,
    });
    return {
      type: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerUnit: bid.pricePerUnit,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursUnits: bid.hoursUnits,
      unitMaterial: bid.unitMaterial,
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
 * Format a bid as a plain-text draft the crew can paste into
 * a proposal. Costs, wages, and invoices are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Skylight install') {
  const perUnit = result.pricePerUnit === null
    ? 'n/a'
    : `${money(result.pricePerUnit)} / unit`;
  const type = TYPE_PRESETS.find((item) => item.id === result.type)?.label ?? result.type;
  const scope = SCOPE_PRESETS.find((item) => item.id === result.scope)?.label ?? result.scope;
  const roof = ROOF_PRESETS.find((item) => item.id === result.roof)?.label ?? result.roof;
  const extras = [
    `${result.travelMiles} travel miles`,
    type,
    scope,
    roof,
    `${result.shafts} drywall shaft${result.shafts === 1 ? '' : 's'}`,
    `${result.stories} stor${result.stories === 1 ? 'y' : 'ies'}`,
    result.includeIceWater ? 'ice-and-water shield included' : 'no ice-and-water',
    result.includeLaminated ? 'laminated / impact glass included' : 'no laminated glass',
    result.includePaint ? 'interior shaft paint included' : 'no shaft paint',
  ].join('; ');
  return [
    'SKYLIGHT INSTALL BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${scope}`,
    `Price per unit: ${perUnit}`,
    `Units: ${result.units.toLocaleString('en-US')} skylight${result.units === 1 ? '' : 's'}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.units} unit${result.units === 1 ? '' : 's'}; ${type}; ${scope}; ${roof}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; units: ${result.hoursUnits.toFixed(1)} h; extras: ${(result.hoursCut + result.hoursPull + result.hoursFraming + result.hoursRoof + result.hoursShafts + result.hoursIceWater + result.hoursLaminated + result.hoursPaint + result.hoursStories).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm unit count, type, scope, roof, shafts, extras, and all pricing before sending. It is not a roofing specification, a flashing design, a building-code determination, a window replacement, a reroof, a solar array, or a product warranty.',
  ].join('\n');
}
