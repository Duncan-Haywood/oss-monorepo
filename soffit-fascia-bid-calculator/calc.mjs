// Pure bid arithmetic for soffit and fascia wrap / replace.
// No network, no state: every eave foot, wrap hour, rot repair,
// wage, and coil invoice is an input, so the result stays a
// transparent calculation the contractor can check against their own
// tickets rather than a claim about what any eave "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$12 / lineal foot soffit and fascia wrap special" treats a 1-story
// ranch wrap-over-existing as the same job as a two-story wood
// replace with rot, gutter detach, extra corners, and pump jacks.
// Homeowners (and a lot of estimator sheets) count the same kind of
// number. Stories, wrap versus replace, and extras do not scale with
// that wrap dump. Matching a cheap ranch special on a two-story
// wood-replace job is how a sold eave becomes a three-day loss after
// the first rotten rafter tail.
//
// Distinct from *gutter install* (K-style trough, miters, drops),
// *gutter cleaning*, *gutter guards*, *siding* (squares of wall),
// and *exterior painting* (a coat on elevations). This prices soffit
// and fascia: the lineal feet of eave, the wrap versus replace, and
// the extras.

export const SCOPE_PRESETS = Object.freeze([
  { id: 'wrap', label: 'Aluminum wrap over existing (the cheap special)' },
  { id: 'vinyl-replace', label: 'Tear-off, new vinyl soffit + aluminum fascia' },
  { id: 'wood-replace', label: 'New wood fascia and soffit, then wrap' },
]);

export const STORY_PRESETS = Object.freeze([
  { id: 'one', label: '1-story ranch — extension ladder' },
  { id: 'two', label: '2-story — pump jacks / staging' },
  { id: 'three', label: '3-story / steep — scaffolding' },
]);

export const TYPE_PRESETS = Object.freeze([
  { id: 'solid', label: 'Solid soffit (no vents)' },
  { id: 'vented', label: 'Vented soffit (the usual)' },
  { id: 'hidden-vent', label: 'Hidden-vent / continuous soffit' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Ranch, 1-story wrap, vented (the cheap special)',
    eaveLf: 160,
    scope: 'wrap',
    stories: 'one',
    soffitType: 'vented',
    travelMiles: 10,
    rotLf: 0,
    porchBeams: 0,
    extraCorners: 0,
    gutterDetach: false,
    pestCleanup: false,
  },
  {
    label: 'Typical ranch wrap, some rot, gutter reset',
    eaveLf: 180,
    scope: 'wrap',
    stories: 'one',
    soffitType: 'vented',
    travelMiles: 14,
    rotLf: 18,
    porchBeams: 0,
    extraCorners: 4,
    gutterDetach: true,
    pestCleanup: false,
  },
  {
    label: 'Two-story wood-replace, rot, gutter reset (where the special loses)',
    eaveLf: 200,
    scope: 'wood-replace',
    stories: 'two',
    soffitType: 'vented',
    travelMiles: 22,
    rotLf: 48,
    porchBeams: 2,
    extraCorners: 8,
    gutterDetach: true,
    pestCleanup: true,
  },
  {
    label: '3-story vinyl-replace, hidden-vent, porch beams',
    eaveLf: 140,
    scope: 'vinyl-replace',
    stories: 'three',
    soffitType: 'hidden-vent',
    travelMiles: 8,
    rotLf: 12,
    porchBeams: 4,
    extraCorners: 6,
    gutterDetach: true,
    pestCleanup: false,
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
 * Starting hours and material invoices from how much of the
 * eave is actually finished. Wrap-over-existing is the cheap
 * special. Vinyl replace is a different crew day. Wood replace
 * is another one still.
 */
export function suggestedScopeKit(scope) {
  const id = String(scope);
  if (id === 'wrap') {
    return {
      hoursPerLf: 0.12,
      wrapMaterialPerLf: 6.2,
      dumpPerLf: 0.15,
      woodPerLf: 0,
    };
  }
  if (id === 'vinyl-replace') {
    return {
      hoursPerLf: 0.18,
      wrapMaterialPerLf: 7.4,
      dumpPerLf: 0.85,
      woodPerLf: 0,
    };
  }
  if (id === 'wood-replace') {
    return {
      hoursPerLf: 0.28,
      wrapMaterialPerLf: 4.8,
      dumpPerLf: 1.4,
      woodPerLf: 10.3,
    };
  }
  throw new Error('Unknown scope');
}

/**
 * One-story is an extension ladder. Two-story is pump jacks.
 * Three-story is scaffolding.
 */
export function suggestedStoryKit(stories) {
  const id = String(stories);
  if (id === 'one') {
    return { hoursAccess: 0.5, accessPremiumPerLf: 0, scaffoldInvoice: 0 };
  }
  if (id === 'two') {
    return { hoursAccess: 2.4, accessPremiumPerLf: 0.028, scaffoldInvoice: 280 };
  }
  if (id === 'three') {
    return { hoursAccess: 5.0, accessPremiumPerLf: 0.048, scaffoldInvoice: 720 };
  }
  throw new Error('Unknown stories');
}

/**
 * Solid soffit is the cheap-special panel. Vented is more
 * pieces. Hidden-vent is a premium run.
 */
export function suggestedTypeKit(soffitType) {
  const id = String(soffitType);
  if (id === 'solid') {
    return { hoursTypePerLf: 0, typeMaterialPerLf: 0 };
  }
  if (id === 'vented') {
    return { hoursTypePerLf: 0.008, typeMaterialPerLf: 1.2 };
  }
  if (id === 'hidden-vent') {
    return { hoursTypePerLf: 0.014, typeMaterialPerLf: 3.6 };
  }
  throw new Error('Unknown soffit type');
}

/**
 * Starting extras that do not live in a $12 / LF wrap special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 1.4,
    hoursPerMile: 0.035,
    hoursPerRotLf: 0.35,
    hoursPerBeam: 0.85,
    hoursPerCorner: 0.18,
    hoursGutterPerLf: 0.08,
    hoursPest: 1.2,
    siteHours: 1.2,
    rotEach: 8.5,
    beamEach: 42,
    cornerEach: 12,
    gutterPerLf: 0.4,
    pestInvoice: 45,
    travelPerMile: 2.8,
  };
}

/**
 * Price soffit and fascia from the eave, the wrap versus
 * replace, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const scope = requirePreset(SCOPE_PRESETS, input.scope, 'scope').id;
  const stories = requirePreset(STORY_PRESETS, input.stories, 'stories').id;
  const soffitType = requirePreset(TYPE_PRESETS, input.soffitType, 'soffit type').id;

  const eaveLf = number(input.eaveLf ?? 0, 'Eave lineal feet');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const rotLf = number(input.rotLf ?? 0, 'Rot lineal feet');
  const porchBeams = number(input.porchBeams ?? 0, 'Porch beams');
  const extraCorners = number(input.extraCorners ?? 0, 'Extra corners');
  const gutterDetach = flag(input.gutterDetach);
  const pestCleanup = flag(input.pestCleanup);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerMile = number(input.hoursPerMile ?? 0, 'Hours per mile');
  const hoursPerLf = number(input.hoursPerLf ?? 0, 'Hours per lineal foot');
  const hoursAccess = number(input.hoursAccess ?? 0, 'Access hours');
  const accessPremiumPerLf = number(input.accessPremiumPerLf ?? 0, 'Access premium per LF');
  const hoursTypePerLf = number(input.hoursTypePerLf ?? 0, 'Type hours per LF');
  const hoursPerRotLf = number(input.hoursPerRotLf ?? 0, 'Hours per rot LF');
  const hoursPerBeam = number(input.hoursPerBeam ?? 0, 'Hours per beam');
  const hoursPerCorner = number(input.hoursPerCorner ?? 0, 'Hours per corner');
  const hoursGutterPerLf = number(input.hoursGutterPerLf ?? 0, 'Gutter hours per LF');
  const hoursPest = number(input.hoursPest ?? 0, 'Pest hours');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const wrapMaterialPerLf = number(input.wrapMaterialPerLf ?? 0, 'Wrap material per LF');
  const dumpPerLf = number(input.dumpPerLf ?? 0, 'Dump per LF');
  const woodPerLf = number(input.woodPerLf ?? 0, 'Wood per LF');
  const typeMaterialPerLf = number(input.typeMaterialPerLf ?? 0, 'Type material per LF');
  const scaffoldInvoice = number(input.scaffoldInvoice ?? 0, 'Scaffold invoice');
  const rotEach = number(input.rotEach ?? 0, 'Rot each');
  const beamEach = number(input.beamEach ?? 0, 'Beam each');
  const cornerEach = number(input.cornerEach ?? 0, 'Corner each');
  const gutterPerLf = number(input.gutterPerLf ?? 0, 'Gutter per LF');
  const pestInvoice = number(input.pestInvoice ?? 0, 'Pest invoice');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');

  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursWrap = eaveLf * hoursPerLf;
  const hoursAccessPremium = eaveLf * accessPremiumPerLf;
  const hoursType = eaveLf * hoursTypePerLf;
  const hoursRot = rotLf * hoursPerRotLf;
  const hoursBeams = porchBeams * hoursPerBeam;
  const hoursCorners = extraCorners * hoursPerCorner;
  const hoursGutter = gutterDetach ? eaveLf * hoursGutterPerLf : 0;
  const hoursPestApplied = pestCleanup ? hoursPest : 0;
  const totalHours = hoursTravel + hoursWrap + hoursAccess + hoursAccessPremium
    + hoursType + hoursRot + hoursBeams + hoursCorners
    + hoursGutter + hoursPestApplied + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const wrapMaterial = eaveLf * wrapMaterialPerLf;
  const dumpMaterial = eaveLf * dumpPerLf;
  const woodMaterial = eaveLf * woodPerLf;
  const typeMaterial = eaveLf * typeMaterialPerLf;
  const scaffoldMaterial = scaffoldInvoice;
  const rotMaterial = rotLf * rotEach;
  const beamMaterial = porchBeams * beamEach;
  const cornerMaterial = extraCorners * cornerEach;
  const gutterMaterial = gutterDetach ? eaveLf * gutterPerLf : 0;
  const pestMaterial = pestCleanup ? pestInvoice : 0;
  const travelInvoice = travelMiles * travelPerMile;
  const finishMaterial = wrapMaterial + dumpMaterial + woodMaterial + typeMaterial;
  const extraHardware = scaffoldMaterial + rotMaterial + beamMaterial
    + cornerMaterial + gutterMaterial + pestMaterial + travelInvoice;
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
    stories,
    soffitType,
    eaveLf,
    travelMiles,
    rotLf,
    porchBeams,
    extraCorners,
    gutterDetach,
    pestCleanup,
    loadedWage,
    hoursTravel,
    hoursWrap,
    hoursAccess,
    hoursAccessPremium,
    hoursType,
    hoursRot,
    hoursBeams,
    hoursCorners,
    hoursGutter,
    hoursPest: hoursPestApplied,
    siteHours,
    totalHours,
    laborCost,
    wrapMaterial,
    dumpMaterial,
    woodMaterial,
    typeMaterial,
    scaffoldMaterial,
    rotMaterial,
    beamMaterial,
    cornerMaterial,
    gutterMaterial,
    pestMaterial,
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
    pricePerLf: eaveLf === 0 ? null : price / eaveLf,
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
      wrap: hourShare(hoursWrap),
      access: hourShare(hoursAccess + hoursAccessPremium),
      type: hourShare(hoursType),
      rot: hourShare(hoursRot),
      beams: hourShare(hoursBeams),
      corners: hourShare(hoursCorners),
      gutter: hourShare(hoursGutter),
      pest: hourShare(hoursPestApplied),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perLf: eaveLf === 0 ? null : proposedPrice / eaveLf,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same eave three ways — wrap, vinyl-replace,
 * wood-replace — from the suggested scope kits so the
 * contractor can see when a wood-replace job flips the cheap
 * $12 / LF special. User-typed scope rates are not reused
 * here: the comparison is apples-to-apples on the starting
 * figures. Story and type kits stay with the current job.
 */
export function compareScope(input) {
  const storyKit = suggestedStoryKit(String(input.stories ?? 'one'));
  const typeKit = suggestedTypeKit(String(input.soffitType ?? 'vented'));
  const extraKit = suggestedExtraKit();
  const rows = SCOPE_PRESETS.map((preset) => {
    const kit = suggestedScopeKit(preset.id);
    const bid = calculateBid({
      ...input,
      scope: preset.id,
      ...storyKit,
      ...typeKit,
      ...extraKit,
      ...kit,
    });
    return {
      scope: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerLf: bid.pricePerLf,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
      hoursWrap: bid.hoursWrap,
      woodMaterial: bid.woodMaterial,
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
export function formatBidSummary(result, jobLabel = 'Soffit and fascia') {
  const perFt = result.pricePerLf === null
    ? 'n/a'
    : `${money(result.pricePerLf)} / LF`;
  const scope = SCOPE_PRESETS.find((item) => item.id === result.scope)?.label ?? result.scope;
  const stories = STORY_PRESETS.find((item) => item.id === result.stories)?.label ?? result.stories;
  const soffitType = TYPE_PRESETS.find((item) => item.id === result.soffitType)?.label ?? result.soffitType;
  const extras = [
    `${result.travelMiles} travel miles`,
    stories,
    soffitType,
    `${result.rotLf} LF rot repair`,
    `${result.porchBeams} porch beam${result.porchBeams === 1 ? '' : 's'}`,
    `${result.extraCorners} extra corner${result.extraCorners === 1 ? '' : 's'}`,
    result.gutterDetach ? 'gutter detach / reset included' : 'no gutter detach',
    result.pestCleanup ? 'bird / wasp cleanup included' : 'no pest cleanup',
  ].join('; ');
  return [
    'SOFFIT AND FASCIA BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${scope}`,
    `Price per lineal foot of eave: ${perFt}`,
    `Eave: ${result.eaveLf.toLocaleString('en-US')} LF`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.eaveLf} LF of eave`,
    `- ${scope}; ${stories}; ${soffitType}`,
    `- ${extras}`,
    `- Travel: ${result.hoursTravel.toFixed(1)} h; wrap / replace: ${result.hoursWrap.toFixed(1)} h; rot: ${result.hoursRot.toFixed(1)} h; extras: ${(result.hoursBeams + result.hoursCorners + result.hoursGutter + result.hoursPest).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm eave length, scope, stories, soffit type, extras, and all pricing before sending. It is not a building-code determination, a ventilation design, a rot-repair specification, a gutter install, or a finish guarantee.',
  ].join('\n');
}
