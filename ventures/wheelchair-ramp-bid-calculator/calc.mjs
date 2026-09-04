// Pure bid arithmetic for *building a residential wheelchair ramp*,
// not building a deck and not installing a walk-in shower. No network,
// no state: every rise, slope, landing, rail, surface, wage, and extra
// is an input, so the result stays a transparent calculation the shop
// can check against their own invoices rather than a claim about what
// any ramp "should" cost, or whether any layout is code-compliant.
//
// The method is the one the trade actually loses money on: a flat
// "$85 / lineal foot" special treats a 24-inch rise with no mid-landing
// as the same job as a 36-inch rise that must rest, a switchback that
// adds a 5×5 turn, and a pair of 5×5 landings that never appear in the
// lineal-foot coupon. Homeowners (and a lot of estimator sheets) count
// run length. Landings, both-side handrails, and footings are walking
// surface and labor that never appear in that number. Matching a cheaper
// special written for the run is how a sold 36-inch wood switchback
// becomes a two-day loss after the first rest landing.
//
// Distinct from a deck *build* (posts, joists, railing as a platform)
// and from a walk-in shower (tile, slope-to-drain, glass). This prices
// the ramp: rise-to-run, landings the coupon cannot see, both-side
// rails, surface, demo, permit, and the extras that are not in the lf
// special.
//
// Slope ratios, landing sizes, and rest-interval figures shipped here
// are common starting points used on residential bids. They are not an
// ADA determination, a building-code opinion, a permit, or an
// engineering stamp. Confirm the jurisdiction, the occupant, and a
// qualified professional before sending a price.

export const SLOPE_PRESETS = Object.freeze([
  { id: 'ada_1_12', label: '1:12 (common new-construction starting point)', runPerRise: 12 },
  { id: 'residential_1_10', label: '1:10 (steeper residential starting point)', runPerRise: 10 },
  { id: 'existing_1_8', label: '1:8 (steeper existing-building starting point)', runPerRise: 8 },
]);

export const SURFACE_PRESETS = Object.freeze([
  { id: 'wood', label: 'Pressure-treated wood' },
  { id: 'composite', label: 'Composite decking' },
  { id: 'aluminum', label: 'Modular aluminum kit' },
  { id: 'concrete', label: 'Poured concrete' },
]);

export const LAYOUT_PRESETS = Object.freeze([
  { id: 'straight', label: 'Straight run' },
  { id: 'switchback', label: 'Switchback / 180° turn' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '24" rise, 1:12, straight wood, 4 ft wide (the $85/lf special)',
    slope: 'ada_1_12',
    surface: 'wood',
    layout: 'straight',
    riseInches: 24,
    widthFeet: 4,
    demoExistingStairs: false,
    includePermit: false,
  },
  {
    label: '36" rise, 1:12, straight wood — rest landing required',
    slope: 'ada_1_12',
    surface: 'wood',
    layout: 'straight',
    riseInches: 36,
    widthFeet: 4,
    demoExistingStairs: false,
    includePermit: true,
  },
  {
    label: '36" rise, 1:12, switchback wood, 4 ft wide',
    slope: 'ada_1_12',
    surface: 'wood',
    layout: 'switchback',
    riseInches: 36,
    widthFeet: 4,
    demoExistingStairs: false,
    includePermit: true,
  },
  {
    label: '48" rise, 1:12, switchback composite, demo stairs, permit',
    slope: 'ada_1_12',
    surface: 'composite',
    layout: 'switchback',
    riseInches: 48,
    widthFeet: 4,
    demoExistingStairs: true,
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

/**
 * Starting hours-per-100-sf and material-per-sf for the walking
 * surface. These are ballpark crew figures, not a catalog. Picking a
 * surface never overwrites a cost the shop has already typed.
 */
export function suggestedSurfaceKit(surface) {
  const id = String(surface);
  if (id === 'wood') {
    return { hoursPer100Sf: 3.2, deckingPerSf: 4.5, framingPerSf: 6 };
  }
  if (id === 'composite') {
    return { hoursPer100Sf: 3.6, deckingPerSf: 9, framingPerSf: 6 };
  }
  if (id === 'aluminum') {
    return { hoursPer100Sf: 1.8, deckingPerSf: 28, framingPerSf: 0 };
  }
  if (id === 'concrete') {
    return { hoursPer100Sf: 4.5, deckingPerSf: 8, framingPerSf: 4 };
  }
  throw new Error('Unknown surface');
}

/**
 * Starting run-per-rise. 1:12 means twelve inches of run for each inch
 * of rise. The labels are starting points, not a code opinion.
 */
export function suggestedSlopeKit(slope) {
  const preset = SLOPE_PRESETS.find((item) => item.id === slope);
  if (!preset) throw new Error('Unknown slope');
  return { runPerRise: preset.runPerRise };
}

/**
 * Intermediate rest landings required by a maximum rise between
 * landings. Top and bottom landings are always counted separately.
 * A 30-inch rise needs no intermediate; a 31-inch rise needs one.
 */
export function intermediateLandingCount(riseInches, maxRiseBetweenLandings) {
  const rise = number(riseInches, 'Rise (inches)', { allowZero: false });
  const maxRise = number(maxRiseBetweenLandings, 'Max rise between landings (inches)', { allowZero: false });
  return Math.max(0, Math.ceil(rise / maxRise) - 1);
}

/**
 * Extra turn landing a switchback adds when the rise does not already
 * force a rest landing. A 36-inch straight run already rests; a
 * 24-inch switchback needs a 5×5 the lineal-foot coupon never saw.
 */
export function switchbackExtraLandings(layout, intermediateLandings) {
  const id = String(layout);
  if (id !== 'straight' && id !== 'switchback') throw new Error('Unknown layout');
  const mids = number(intermediateLandings, 'Intermediate landings');
  return id === 'switchback' && mids === 0 ? 1 : 0;
}

/**
 * Walking surface the "$85 / lf" special cannot see: the sloped run
 * plus every landing. A 24-inch 1:12, 4-foot-wide straight ramp is
 * 24 lf of run (96 sf) plus two 5×5 landings (50 sf) — 146 sf of
 * walking surface, not "24 feet of ramp."
 */
export function walkingSurface(runFeet, widthFeet, landingCount, landingSideFeet) {
  const run = number(runFeet, 'Run (feet)');
  const width = number(widthFeet, 'Width (feet)', { allowZero: false });
  const landings = number(landingCount, 'Landing count');
  const side = number(landingSideFeet, 'Landing side (feet)', { allowZero: false });
  const rampSf = run * width;
  const landingSf = landings * side * side;
  return { rampSf, landingSf, walkingSf: rampSf + landingSf };
}

/**
 * Both-side handrail lineal feet when the rise is above the common
 * 6-inch starting threshold. Below that, rails are still editable —
 * the shop types the hours — but the starting suggestion is zero.
 */
export function suggestedHandrailLf(riseInches, runFeet, landingCount, landingSideFeet, railThresholdInches = 6) {
  const rise = number(riseInches, 'Rise (inches)', { allowZero: false });
  const run = number(runFeet, 'Run (feet)');
  const landings = number(landingCount, 'Landing count');
  const side = number(landingSideFeet, 'Landing side (feet)', { allowZero: false });
  const threshold = number(railThresholdInches, 'Handrail threshold (inches)');
  if (rise <= threshold) return 0;
  return run * 2 + landings * side;
}

/**
 * Starting footing count: a pair at the house, a pair per landing, and
 * posts along the run. Ballpark only — soil, frost, and the inspector
 * decide the real number.
 */
export function suggestedFootingCount(runFeet, landingCount, postSpacingFeet = 8) {
  const run = number(runFeet, 'Run (feet)');
  const landings = number(landingCount, 'Landing count');
  const spacing = number(postSpacingFeet, 'Post spacing (feet)', { allowZero: false });
  const alongRun = Math.ceil(run / spacing) * 2;
  return 4 + landings * 2 + alongRun;
}

/**
 * Price a wheelchair-ramp job from the rise, the landings the coupon
 * cannot see, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const riseInches = number(input.riseInches ?? 0, 'Rise (inches)', { allowZero: false });
  const widthFeet = number(input.widthFeet ?? 0, 'Width (feet)', { allowZero: false });
  const landingSideFeet = number(input.landingSideFeet ?? 0, 'Landing side (feet)', { allowZero: false });
  const maxRiseBetweenLandings = number(
    input.maxRiseBetweenLandings ?? 0,
    'Max rise between landings (inches)',
    { allowZero: false },
  );

  const slope = String(input.slope ?? 'ada_1_12');
  if (!SLOPE_PRESETS.some((item) => item.id === slope)) {
    throw new Error('Unknown slope');
  }
  const surface = String(input.surface ?? 'wood');
  if (!SURFACE_PRESETS.some((item) => item.id === surface)) {
    throw new Error('Unknown surface');
  }
  const layout = String(input.layout ?? 'straight');
  if (!LAYOUT_PRESETS.some((item) => item.id === layout)) {
    throw new Error('Unknown layout');
  }

  const demoExistingStairs = flag(input.demoExistingStairs);
  const includePermit = flag(input.includePermit);

  const runPerRise = number(input.runPerRise ?? 0, 'Run per inch of rise', { allowZero: false });
  const runFeet = (riseInches * runPerRise) / 12;

  const intermediateLandings = intermediateLandingCount(riseInches, maxRiseBetweenLandings);
  const extraTurnLandings = switchbackExtraLandings(layout, intermediateLandings);
  const landingCount = 2 + intermediateLandings + extraTurnLandings;
  const { rampSf, landingSf, walkingSf } = walkingSurface(
    runFeet,
    widthFeet,
    landingCount,
    landingSideFeet,
  );

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursPer100Sf = number(input.hoursPer100Sf ?? 0, 'Hours per 100 sf of walking surface');
  const hoursPerHandrailLf = number(input.hoursPerHandrailLf ?? 0, 'Hours per lineal foot of handrail');
  const hoursPerFooting = number(input.hoursPerFooting ?? 0, 'Hours per footing');
  const hoursDemo = number(input.hoursDemo ?? 0, 'Hours to demo existing stairs');
  const hoursSite = number(input.hoursSite ?? 0, 'Site / grade hours');
  const siteHours = number(input.siteHours ?? 0, 'Travel / site hours');

  const handrailLf = number(input.handrailLf ?? 0, 'Handrail lineal feet');
  const footingCount = number(input.footingCount ?? 0, 'Footing count');

  const deckingPerSf = number(input.deckingPerSf ?? 0, 'Decking / surface per sf');
  const framingPerSf = number(input.framingPerSf ?? 0, 'Framing / structure per sf');
  const handrailPerLf = number(input.handrailPerLf ?? 0, 'Handrail per lineal foot');
  const footingEach = number(input.footingEach ?? 0, 'Cost per footing');
  const demoFee = number(input.demoFee ?? 0, 'Stair-demo fee');
  const mobilizationFee = number(input.mobilizationFee ?? 0, 'Mobilization');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const tripHours = hoursTrip;
  const surfaceHours = walkingSf * hoursPer100Sf / 100;
  const railHours = handrailLf * hoursPerHandrailLf;
  const footingHours = footingCount * hoursPerFooting;
  const demoHours = demoExistingStairs ? hoursDemo : 0;
  const gradeHours = hoursSite;
  const travelHours = siteHours;
  const totalHours = tripHours + surfaceHours + railHours + footingHours + demoHours + gradeHours + travelHours;

  const laborCost = totalHours * loadedWage;
  const deckingMaterial = walkingSf * deckingPerSf;
  const framingMaterial = walkingSf * framingPerSf;
  const railMaterial = handrailLf * handrailPerLf;
  const footingMaterial = footingCount * footingEach;
  const demoMaterial = demoExistingStairs ? demoFee : 0;
  const mobilizationMaterial = mobilizationFee;
  const permitMaterial = includePermit ? permitFee : 0;
  const materialCost = deckingMaterial + framingMaterial + railMaterial + footingMaterial + demoMaterial;
  const softCost = travelAndEquipment + mobilizationMaterial + permitMaterial;
  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);
  const hourShare = (amount) => (totalHours === 0 ? 0 : amount / totalHours * 100);

  return {
    slope,
    surface,
    layout,
    riseInches,
    widthFeet,
    landingSideFeet,
    maxRiseBetweenLandings,
    runPerRise,
    runFeet,
    intermediateLandings,
    extraTurnLandings,
    landingCount,
    rampSf,
    landingSf,
    walkingSf,
    demoExistingStairs,
    includePermit,
    handrailLf,
    footingCount,
    loadedWage,
    tripHours,
    surfaceHours,
    railHours,
    footingHours,
    demoHours,
    gradeHours,
    travelHours,
    landingHours: walkingSf === 0 ? 0 : surfaceHours * (landingSf / walkingSf),
    rampHours: walkingSf === 0 ? 0 : surfaceHours * (rampSf / walkingSf),
    totalHours,
    laborCost,
    deckingMaterial,
    framingMaterial,
    railMaterial,
    footingMaterial,
    demoMaterial,
    mobilizationMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerRunLf: runFeet === 0 ? null : price / runFeet,
    pricePerWalkingSf: walkingSf === 0 ? null : price / walkingSf,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    landingShareOfWalking: walkingSf === 0 ? 0 : landingSf / walkingSf * 100,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(tripHours),
      ramp: hourShare(walkingSf === 0 ? 0 : surfaceHours * (rampSf / walkingSf)),
      landings: hourShare(walkingSf === 0 ? 0 : surfaceHours * (landingSf / walkingSf)),
      rails: hourShare(railHours),
      footings: hourShare(footingHours),
      demo: hourShare(demoHours),
      grade: hourShare(gradeHours),
      site: hourShare(travelHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the shop can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this is
 * the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Wheelchair ramp') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const slope = SLOPE_PRESETS.find((item) => item.id === result.slope)?.label ?? result.slope;
  const surface = SURFACE_PRESETS.find((item) => item.id === result.surface)?.label ?? result.surface;
  const layout = LAYOUT_PRESETS.find((item) => item.id === result.layout)?.label ?? result.layout;
  const extras = [
    `${result.riseInches}" rise → ${result.runFeet.toFixed(1)} lf of run at 1:${result.runPerRise}`,
    `${result.landingCount} landing${result.landingCount === 1 ? '' : 's'} (${result.landingSf.toFixed(0)} sf) — ${result.landingShareOfWalking.toFixed(0)}% of walking surface`,
    `${result.walkingSf.toFixed(0)} sf walking surface (${result.rampSf.toFixed(0)} sf sloped + ${result.landingSf.toFixed(0)} sf landings)`,
    result.handrailLf ? `${result.handrailLf.toFixed(0)} lf of handrail` : 'no handrail this bid',
    `${result.footingCount} footings`,
    result.demoExistingStairs ? 'existing-stair demo included' : 'no stair demo this bid',
    result.includePermit ? 'permit allowance included' : 'no permit allowance this bid',
  ];
  return [
    'WHEELCHAIR RAMP BID',
    '',
    `Proposed ramp price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${surface}; ${layout}`,
    `Slope starting point: ${slope}; rise: ${result.riseInches}"`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    result.pricePerRunLf === null ? null : `Effective: ${money(result.pricePerRunLf)} / lf of run`,
    '',
    'SCOPE BASIS',
    `- ${surface}; ${layout}; 1:${result.runPerRise} starting slope`,
    `- ${result.runFeet.toFixed(1)} lf run × ${result.widthFeet} ft wide = ${result.rampSf.toFixed(0)} sf sloped`,
    `- ${result.landingCount} landings (${result.intermediateLandings} rest + ${result.extraTurnLandings} extra turn + top/bottom) = ${result.landingSf.toFixed(0)} sf`,
    `- Setup: ${result.tripHours.toFixed(1)} h; surface: ${result.surfaceHours.toFixed(1)} h; rails: ${result.railHours.toFixed(1)} h; footings: ${result.footingHours.toFixed(1)} h; demo: ${result.demoHours.toFixed(1)} h`,
    `- ${extras.join('; ')}`,
    '',
    'This is a draft for review. Confirm the rise, slope, landings, width, surface, rails, footings, demo, permit, and all pricing before sending. It is not a construction specification, an ADA determination, a building-code opinion, a permit, or an engineering stamp.',
  ].filter((line) => line !== null).join('\n');
}
