// Pure bid arithmetic for residential landscape / low-voltage lighting.
// No network, no state: every fixture count, trench foot, transformer,
// wage, and light invoice is an input, so the result stays a
// transparent calculation the contractor can check against their own
// tickets rather than a claim about what any yard "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$150 a light installed" special treats six path lights on an
// existing transformer as the same job as an 18-fixture architectural
// install with well lights, a new 300W transformer, 180 feet of trench
// through irrigated turf, and a driveway saw-cut. Homeowners (and a
// lot of estimator sheets) count the same kind of number. Trench,
// transformer, soil, and extras do not scale with that fixture dump.
// Matching a cheap walkway special on a new-system job is how a sold
// lighting job becomes a loss when the home-run and the well lights
// eat the margin.
//
// Distinct from *holiday lights* (seasonal C9 hang / take-down),
// *electrical panel* (service amps), *irrigation install* (water
// zones and a backflow), *pergola* (open shade), and *exterior
// painting* (a coat). This prices landscape lighting: fixtures,
// trench, transformer, and the extras.

export const SCOPE_PRESETS = Object.freeze([
  { id: 'fixtures-only', label: 'Fixtures only — existing transformer (the cheap special)' },
  { id: 'new-system', label: 'New system — trench, wire, and transformer' },
  { id: 'existing-add-on', label: 'Add-on — tie into an existing system' },
]);

export const SOIL_PRESETS = Object.freeze([
  { id: 'easy', label: 'Easy lawn / sandy — shovel trench' },
  { id: 'irrigated', label: 'Irrigated turf — repair the sod' },
  { id: 'rocky', label: 'Rocky / rooted — slow trench' },
]);

export const TRANSFORMER_PRESETS = Object.freeze([
  { id: 'existing', label: 'Use the existing transformer' },
  { id: '150w', label: 'New 150W transformer' },
  { id: '300w', label: 'New 300W transformer' },
  { id: '600w-dual', label: 'New 600W / dual-tap transformer' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Walkway special: 6 path lights on an existing transformer',
    pathLights: 6,
    uplights: 0,
    wellLights: 0,
    hardscapeLights: 0,
    trenchLf: 0,
    scope: 'fixtures-only',
    soil: 'easy',
    transformer: 'existing',
    travelMiles: 8,
    includePhotocell: false,
    includeSawCut: false,
    includeExtraXfmr: false,
  },
  {
    label: 'Typical new path: 8 path + 2 uplights, 150W, 80 LF trench',
    pathLights: 8,
    uplights: 2,
    wellLights: 0,
    hardscapeLights: 0,
    trenchLf: 80,
    scope: 'new-system',
    soil: 'easy',
    transformer: '150w',
    travelMiles: 12,
    includePhotocell: true,
    includeSawCut: false,
    includeExtraXfmr: false,
  },
  {
    label: 'Architectural: wells, 300W, irrigated turf, driveway saw-cut',
    pathLights: 6,
    uplights: 8,
    wellLights: 4,
    hardscapeLights: 2,
    trenchLf: 180,
    scope: 'new-system',
    soil: 'irrigated',
    transformer: '300w',
    travelMiles: 18,
    includePhotocell: true,
    includeSawCut: true,
    includeExtraXfmr: false,
  },
  {
    label: 'Existing-system add-on: uplights + wells, rocky, extra transformer',
    pathLights: 0,
    uplights: 10,
    wellLights: 4,
    hardscapeLights: 0,
    trenchLf: 120,
    scope: 'existing-add-on',
    soil: 'rocky',
    transformer: 'existing',
    travelMiles: 22,
    includePhotocell: false,
    includeSawCut: false,
    includeExtraXfmr: true,
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
 * Starting trench, wire, and transformer hours from how much of
 * the system is actually sold. Fixtures-only on an existing
 * transformer is the cheap special. A new system is a trench and
 * a transformer. An add-on is a home-run back to what is already
 * on the house.
 */
export function suggestedScopeKit(scope) {
  const id = String(scope);
  if (id === 'fixtures-only') {
    return {
      trenchHoursPerLf: 0,
      wirePerLf: 0,
      hoursXfmrScope: 0,
    };
  }
  if (id === 'new-system') {
    return {
      trenchHoursPerLf: 0.045,
      wirePerLf: 1.8,
      hoursXfmrScope: 0.4,
    };
  }
  if (id === 'existing-add-on') {
    return {
      trenchHoursPerLf: 0.038,
      wirePerLf: 1.4,
      hoursXfmrScope: 0.6,
    };
  }
  throw new Error('Unknown scope');
}

/**
 * Easy lawn is a shovel. Irrigated turf is a sod repair.
 * Rocky / rooted is a slow trench.
 */
export function suggestedSoilKit(soil) {
  const id = String(soil);
  if (id === 'easy') {
    return { hoursSoilPerLf: 0, turfInvoicePerLf: 0 };
  }
  if (id === 'irrigated') {
    return { hoursSoilPerLf: 0.018, turfInvoicePerLf: 2.4 };
  }
  if (id === 'rocky') {
    return { hoursSoilPerLf: 0.035, turfInvoicePerLf: 0.6 };
  }
  throw new Error('Unknown soil');
}

/**
 * Existing transformer is the cheap-special assumption.
 * 150W is a small path. 300W is a typical architectural
 * job. Dual-tap 600W is a large yard or two runs.
 */
export function suggestedTransformerKit(transformer) {
  const id = String(transformer);
  if (id === 'existing') {
    return { hoursXfmr: 0, xfmrInvoice: 0 };
  }
  if (id === '150w') {
    return { hoursXfmr: 1.4, xfmrInvoice: 185 };
  }
  if (id === '300w') {
    return { hoursXfmr: 1.8, xfmrInvoice: 310 };
  }
  if (id === '600w-dual') {
    return { hoursXfmr: 2.6, xfmrInvoice: 540 };
  }
  throw new Error('Unknown transformer');
}

/**
 * Starting extras that do not live in a $150 / light special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 1.4,
    hoursPerMile: 0.035,
    hoursPerPath: 0.28,
    hoursPerUplight: 0.45,
    hoursPerWell: 0.85,
    hoursPerHardscape: 0.7,
    hoursPhotocell: 0.4,
    hoursSawCut: 1.6,
    hoursExtraXfmr: 1.5,
    siteHours: 0.9,
    pathEach: 42,
    uplightEach: 68,
    wellEach: 95,
    hardscapeEach: 78,
    photocellInvoice: 85,
    sawCutInvoice: 240,
    extraXfmrInvoice: 310,
    travelPerMile: 2.8,
  };
}

/**
 * Price landscape lighting from the fixtures, trench,
 * transformer, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const scope = requirePreset(SCOPE_PRESETS, input.scope, 'scope').id;
  const soil = requirePreset(SOIL_PRESETS, input.soil, 'soil').id;
  const transformer = requirePreset(TRANSFORMER_PRESETS, input.transformer, 'transformer').id;

  const pathLights = number(input.pathLights ?? 0, 'Path lights');
  const uplights = number(input.uplights ?? 0, 'Uplights');
  const wellLights = number(input.wellLights ?? 0, 'Well lights');
  const hardscapeLights = number(input.hardscapeLights ?? 0, 'Hardscape lights');
  const trenchLf = number(input.trenchLf ?? 0, 'Trench lineal feet');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const includePhotocell = flag(input.includePhotocell);
  const includeSawCut = flag(input.includeSawCut);
  const includeExtraXfmr = flag(input.includeExtraXfmr);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursPerPath = number(input.hoursPerPath ?? 0, 'Hours per path light');
  const hoursPerUplight = number(input.hoursPerUplight ?? 0, 'Hours per uplight');
  const hoursPerWell = number(input.hoursPerWell ?? 0, 'Hours per well light');
  const hoursPerHardscape = number(input.hoursPerHardscape ?? 0, 'Hours per hardscape light');
  const trenchHoursPerLf = number(input.trenchHoursPerLf ?? 0, 'Trench hours per LF');
  const hoursSoilPerLf = number(input.hoursSoilPerLf ?? 0, 'Soil hours per LF');
  const hoursXfmr = number(input.hoursXfmr ?? 0, 'Transformer hours');
  const hoursXfmrScope = number(input.hoursXfmrScope ?? 0, 'Scope transformer hours');
  const hoursPhotocell = number(input.hoursPhotocell ?? 0, 'Photocell hours');
  const hoursSawCut = number(input.hoursSawCut ?? 0, 'Saw-cut hours');
  const hoursExtraXfmr = number(input.hoursExtraXfmr ?? 0, 'Extra transformer hours');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const pathEach = number(input.pathEach ?? 0, 'Path light each');
  const uplightEach = number(input.uplightEach ?? 0, 'Uplight each');
  const wellEach = number(input.wellEach ?? 0, 'Well light each');
  const hardscapeEach = number(input.hardscapeEach ?? 0, 'Hardscape light each');
  const wirePerLf = number(input.wirePerLf ?? 0, 'Wire per LF');
  const xfmrInvoice = number(input.xfmrInvoice ?? 0, 'Transformer invoice');
  const turfInvoicePerLf = number(input.turfInvoicePerLf ?? 0, 'Turf invoice per LF');
  const photocellInvoice = number(input.photocellInvoice ?? 0, 'Photocell invoice');
  const sawCutInvoice = number(input.sawCutInvoice ?? 0, 'Saw-cut invoice');
  const extraXfmrInvoice = number(input.extraXfmrInvoice ?? 0, 'Extra transformer invoice');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');

  const fixtureCount = pathLights + uplights + wellLights + hardscapeLights;
  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursPath = pathLights * hoursPerPath;
  const hoursUplight = uplights * hoursPerUplight;
  const hoursWell = wellLights * hoursPerWell;
  const hoursHardscape = hardscapeLights * hoursPerHardscape;
  const hoursFixtures = hoursPath + hoursUplight + hoursWell + hoursHardscape;
  const hoursTrench = trenchLf * trenchHoursPerLf;
  const hoursSoil = trenchLf * hoursSoilPerLf;
  const hoursTransformer = hoursXfmr + hoursXfmrScope;
  const hoursPhotocellApplied = includePhotocell ? hoursPhotocell : 0;
  const hoursSawCutApplied = includeSawCut ? hoursSawCut : 0;
  const hoursExtraXfmrApplied = includeExtraXfmr ? hoursExtraXfmr : 0;
  const extraWorkHours = hoursSoil + hoursPhotocellApplied
    + hoursSawCutApplied + hoursExtraXfmrApplied;
  const totalHours = hoursTravel + hoursFixtures + hoursTrench
    + hoursTransformer + extraWorkHours + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const fixtureMaterial = pathLights * pathEach
    + uplights * uplightEach
    + wellLights * wellEach
    + hardscapeLights * hardscapeEach;
  const wireMaterial = trenchLf * wirePerLf;
  const xfmrMaterial = xfmrInvoice;
  const turfMaterial = trenchLf * turfInvoicePerLf;
  const photocellMaterial = includePhotocell ? photocellInvoice : 0;
  const sawCutMaterial = includeSawCut ? sawCutInvoice : 0;
  const extraXfmrMaterial = includeExtraXfmr ? extraXfmrInvoice : 0;
  const travelInvoice = travelMiles * travelPerMile;
  const finishMaterial = fixtureMaterial + wireMaterial + xfmrMaterial;
  const extraHardware = turfMaterial + photocellMaterial
    + sawCutMaterial + extraXfmrMaterial + travelInvoice;
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
    soil,
    transformer,
    pathLights,
    uplights,
    wellLights,
    hardscapeLights,
    fixtureCount,
    trenchLf,
    travelMiles,
    includePhotocell,
    includeSawCut,
    includeExtraXfmr,
    loadedWage,
    hoursTravel,
    hoursPath,
    hoursUplight,
    hoursWell,
    hoursHardscape,
    hoursFixtures,
    hoursTrench,
    hoursSoil,
    hoursTransformer,
    hoursPhotocell: hoursPhotocellApplied,
    hoursSawCut: hoursSawCutApplied,
    hoursExtraXfmr: hoursExtraXfmrApplied,
    siteHours,
    totalHours,
    laborCost,
    fixtureMaterial,
    wireMaterial,
    xfmrMaterial,
    turfMaterial,
    photocellMaterial,
    sawCutMaterial,
    extraXfmrMaterial,
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
    pricePerFixture: fixtureCount === 0 ? null : price / fixtureCount,
    pricePerTrenchLf: trenchLf === 0 ? null : price / trenchLf,
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
      path: hourShare(hoursPath),
      uplight: hourShare(hoursUplight),
      well: hourShare(hoursWell),
      hardscape: hourShare(hoursHardscape),
      trench: hourShare(hoursTrench),
      soil: hourShare(hoursSoil),
      transformer: hourShare(hoursTransformer),
      photocell: hourShare(hoursPhotocellApplied),
      sawCut: hourShare(hoursSawCutApplied),
      extraXfmr: hourShare(hoursExtraXfmrApplied),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perFixture: fixtureCount === 0 ? null : proposedPrice / fixtureCount,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same yard three ways — fixtures-only, new-system,
 * existing-add-on — from the suggested scope kits so the
 * contractor can see when trench and transformer flip the cheap
 * $150 / light special. User-typed scope rates are not reused
 * here: the comparison is apples-to-apples on the starting
 * figures. Soil and transformer kits stay with the current job.
 */
export function compareScope(input) {
  const soilKit = suggestedSoilKit(String(input.soil ?? 'easy'));
  const xfmrKit = suggestedTransformerKit(String(input.transformer ?? 'existing'));
  const extraKit = suggestedExtraKit();
  const rows = SCOPE_PRESETS.map((preset) => {
    const kit = suggestedScopeKit(preset.id);
    const bid = calculateBid({
      ...input,
      scope: preset.id,
      ...soilKit,
      ...xfmrKit,
      ...extraKit,
      ...kit,
    });
    return {
      scope: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerFixture: bid.pricePerFixture,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursFixtures: bid.hoursFixtures,
      hoursTrench: bid.hoursTrench,
      wireMaterial: bid.wireMaterial,
      xfmrMaterial: bid.xfmrMaterial,
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
 * Format a bid as a plain-text draft the contractor can paste into
 * a proposal. Costs, wages, and invoices are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Landscape lighting') {
  const perFixture = result.pricePerFixture === null
    ? 'n/a'
    : `${money(result.pricePerFixture)} / fixture`;
  const scope = SCOPE_PRESETS.find((item) => item.id === result.scope)?.label ?? result.scope;
  const soil = SOIL_PRESETS.find((item) => item.id === result.soil)?.label ?? result.soil;
  const transformer = TRANSFORMER_PRESETS.find((item) => item.id === result.transformer)?.label ?? result.transformer;
  const extras = [
    `${result.travelMiles} travel miles`,
    soil,
    transformer,
    `${result.pathLights} path light${result.pathLights === 1 ? '' : 's'}`,
    `${result.uplights} uplight${result.uplights === 1 ? '' : 's'}`,
    `${result.wellLights} well light${result.wellLights === 1 ? '' : 's'}`,
    `${result.hardscapeLights} hardscape / step light${result.hardscapeLights === 1 ? '' : 's'}`,
    result.includePhotocell ? 'photocell / astronomic timer included' : 'no photocell',
    result.includeSawCut ? 'driveway saw-cut included' : 'no saw-cut',
    result.includeExtraXfmr ? 'extra transformer included' : 'no extra transformer',
  ].join('; ');
  return [
    'LANDSCAPE LIGHTING BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${scope}`,
    `Price per fixture: ${perFixture}`,
    `Fixtures: ${result.fixtureCount.toLocaleString('en-US')}`,
    `Trench: ${result.trenchLf.toLocaleString('en-US')} LF`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.fixtureCount} fixtures (${result.pathLights} path, ${result.uplights} uplight, ${result.wellLights} well, ${result.hardscapeLights} hardscape)`,
    `- ${result.trenchLf} LF of trench; ${scope}; ${soil}; ${transformer}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; fixtures: ${result.hoursFixtures.toFixed(1)} h; trench: ${result.hoursTrench.toFixed(1)} h; extras: ${(result.hoursSoil + result.hoursTransformer + result.hoursPhotocell + result.hoursSawCut + result.hoursExtraXfmr).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm fixture counts, trench length, scope, soil, transformer, extras, and all pricing before sending. It is not an electrical design, a load calculation, a voltage-drop study, a permit determination, a holiday-light hang, or a product warranty.',
  ].join('\n');
}
