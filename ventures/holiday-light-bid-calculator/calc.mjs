// Pure bid arithmetic for residential holiday / Christmas light hanging.
// No network, no state: every eave foot, clip hour, take-down ratio,
// wage, and light invoice is an input, so the result stays a
// transparent calculation the contractor can check against their own
// tickets rather than a claim about what any house "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$3 / lineal foot Christmas light hang special" treats a 1-story
// ranch C9 hang-only (customer-owned lights) as the same job as a
// two-story Victorian with icicles, tree wraps, January take-down,
// and off-season storage. Homeowners (and a lot of estimator sheets)
// count the same kind of number. Stories, take-down, and extras do
// not scale with that hang dump. Matching a cheap ranch special on a
// full-service two-story job is how a sold light job becomes a
// January loss when take-down eats the margin.
//
// Distinct from *soffit and fascia* (wrap / replace the eave board),
// *gutter install* (K-style trough), *landscape lighting* (low-voltage
// path and uplights), *electrical panel* (service amps), and
// *exterior painting* (a coat). This prices holiday lights: the
// lineal feet of roofline, hang versus take-down versus store, and
// the extras.

export const SCOPE_PRESETS = Object.freeze([
  { id: 'hang-only', label: 'Hang only — customer owns the lights (the cheap special)' },
  { id: 'hang-and-takedown', label: 'Hang now, take down in January' },
  { id: 'full-service', label: 'Full service — hang, take down, and store' },
]);

export const STORY_PRESETS = Object.freeze([
  { id: 'one', label: '1-story ranch — extension ladder' },
  { id: 'two', label: '2-story — taller ladders / lift' },
  { id: 'three', label: '3-story / steep — lift required' },
]);

export const TYPE_PRESETS = Object.freeze([
  { id: 'c9', label: 'C9 / C7 on clips (the usual special)' },
  { id: 'icicle', label: 'Icicle / mini-curtain on the eave' },
  { id: 'commercial-c9', label: 'Commercial-grade LED C9' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Ranch, 1-story C9 hang-only (the cheap special)',
    eaveLf: 140,
    scope: 'hang-only',
    stories: 'one',
    lightType: 'c9',
    travelMiles: 8,
    peaks: 0,
    trees: 0,
    bushes: 0,
    columns: 0,
    includeTimer: false,
    steepPitch: false,
  },
  {
    label: 'Typical ranch hang + take-down, some bushes',
    eaveLf: 160,
    scope: 'hang-and-takedown',
    stories: 'one',
    lightType: 'c9',
    travelMiles: 12,
    peaks: 2,
    trees: 0,
    bushes: 4,
    columns: 0,
    includeTimer: true,
    steepPitch: false,
  },
  {
    label: 'Two-story colonial, C9 + trees + take-down (where the special loses)',
    eaveLf: 180,
    scope: 'hang-and-takedown',
    stories: 'two',
    lightType: 'c9',
    travelMiles: 18,
    peaks: 3,
    trees: 2,
    bushes: 6,
    columns: 2,
    includeTimer: true,
    steepPitch: false,
  },
  {
    label: 'Full-service Victorian: 2-story icicle, peaks, trees, storage',
    eaveLf: 200,
    scope: 'full-service',
    stories: 'two',
    lightType: 'icicle',
    travelMiles: 22,
    peaks: 5,
    trees: 3,
    bushes: 8,
    columns: 4,
    includeTimer: true,
    steepPitch: true,
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
 * Starting hours and product invoices from how much of the
 * job is actually sold. Hang-only on customer lights is the
 * cheap special. Take-down is a second trip in January.
 * Full service is contractor lights plus storage until next year.
 */
export function suggestedScopeKit(scope) {
  const id = String(scope);
  if (id === 'hang-only') {
    return {
      hoursPerLf: 0.032,
      productPerLf: 0,
      takedownRatio: 0,
      storageInvoice: 0,
    };
  }
  if (id === 'hang-and-takedown') {
    return {
      hoursPerLf: 0.032,
      productPerLf: 0,
      takedownRatio: 0.45,
      storageInvoice: 0,
    };
  }
  if (id === 'full-service') {
    return {
      hoursPerLf: 0.038,
      productPerLf: 2.6,
      takedownRatio: 0.5,
      storageInvoice: 95,
    };
  }
  throw new Error('Unknown scope');
}

/**
 * One-story is an extension ladder. Two-story is a taller
 * ladder or a small lift. Three-story is a lift.
 */
export function suggestedStoryKit(stories) {
  const id = String(stories);
  if (id === 'one') {
    return { hoursAccess: 0.4, accessPremiumPerLf: 0, liftInvoice: 0 };
  }
  if (id === 'two') {
    return { hoursAccess: 1.6, accessPremiumPerLf: 0.014, liftInvoice: 165 };
  }
  if (id === 'three') {
    return { hoursAccess: 3.2, accessPremiumPerLf: 0.028, liftInvoice: 390 };
  }
  throw new Error('Unknown stories');
}

/**
 * C9 on clips is the cheap-special run. Icicle is denser.
 * Commercial-grade C9 is a heavier product on the same clips.
 */
export function suggestedTypeKit(lightType) {
  const id = String(lightType);
  if (id === 'c9') {
    return { hoursTypePerLf: 0, typeMaterialPerLf: 0 };
  }
  if (id === 'icicle') {
    return { hoursTypePerLf: 0.02, typeMaterialPerLf: 1.4 };
  }
  if (id === 'commercial-c9') {
    return { hoursTypePerLf: 0.008, typeMaterialPerLf: 3.2 };
  }
  throw new Error('Unknown light type');
}

/**
 * Starting extras that do not live in a $3 / LF hang special.
 */
export function suggestedExtraKit() {
  return {
    hoursTrip: 1.2,
    hoursPerMile: 0.035,
    hoursPerPeak: 0.35,
    hoursPerTree: 0.9,
    hoursPerBush: 0.25,
    hoursPerColumn: 0.2,
    hoursTimer: 0.35,
    hoursSteep: 0.8,
    siteHours: 0.8,
    peakEach: 18,
    treeEach: 42,
    bushEach: 14,
    columnEach: 12,
    timerInvoice: 28,
    travelPerMile: 2.8,
  };
}

/**
 * Price holiday lights from the eave, hang versus take-down
 * versus store, and the extras.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const scope = requirePreset(SCOPE_PRESETS, input.scope, 'scope').id;
  const stories = requirePreset(STORY_PRESETS, input.stories, 'stories').id;
  const lightType = requirePreset(TYPE_PRESETS, input.lightType, 'light type').id;

  const eaveLf = number(input.eaveLf ?? 0, 'Eave lineal feet');
  const travelMiles = number(input.travelMiles ?? 0, 'Travel miles');
  const peaks = number(input.peaks ?? 0, 'Peaks');
  const trees = number(input.trees ?? 0, 'Trees');
  const bushes = number(input.bushes ?? 0, 'Bushes');
  const columns = number(input.columns ?? 0, 'Columns');
  const includeTimer = flag(input.includeTimer);
  const steepPitch = flag(input.steepPitch);

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
  const hoursPerPeak = number(input.hoursPerPeak ?? 0, 'Hours per peak');
  const hoursPerTree = number(input.hoursPerTree ?? 0, 'Hours per tree');
  const hoursPerBush = number(input.hoursPerBush ?? 0, 'Hours per bush');
  const hoursPerColumn = number(input.hoursPerColumn ?? 0, 'Hours per column');
  const hoursTimer = number(input.hoursTimer ?? 0, 'Timer hours');
  const hoursSteep = number(input.hoursSteep ?? 0, 'Steep hours');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');
  const takedownRatio = number(input.takedownRatio ?? 0, 'Take-down ratio');

  const productPerLf = number(input.productPerLf ?? 0, 'Product per LF');
  const typeMaterialPerLf = number(input.typeMaterialPerLf ?? 0, 'Type material per LF');
  const liftInvoice = number(input.liftInvoice ?? 0, 'Lift invoice');
  const storageInvoice = number(input.storageInvoice ?? 0, 'Storage invoice');
  const peakEach = number(input.peakEach ?? 0, 'Peak each');
  const treeEach = number(input.treeEach ?? 0, 'Tree each');
  const bushEach = number(input.bushEach ?? 0, 'Bush each');
  const columnEach = number(input.columnEach ?? 0, 'Column each');
  const timerInvoice = number(input.timerInvoice ?? 0, 'Timer invoice');
  const travelPerMile = number(input.travelPerMile ?? 0, 'Travel per mile');

  const hoursTravel = travelHours(hoursTrip, travelMiles, hoursPerMile);
  const hoursHang = eaveLf * hoursPerLf;
  const hoursAccessPremium = eaveLf * accessPremiumPerLf;
  const hoursType = eaveLf * hoursTypePerLf;
  const hoursPeaks = peaks * hoursPerPeak;
  const hoursTrees = trees * hoursPerTree;
  const hoursBushes = bushes * hoursPerBush;
  const hoursColumns = columns * hoursPerColumn;
  const hoursTimerApplied = includeTimer ? hoursTimer : 0;
  const hoursSteepApplied = steepPitch ? hoursSteep : 0;
  const hangWorkHours = hoursHang + hoursType + hoursAccess + hoursAccessPremium
    + hoursPeaks + hoursTrees + hoursBushes + hoursColumns + hoursSteepApplied;
  const hoursTakedown = hangWorkHours * takedownRatio;
  // Take-down is not a fraction of the same visit — the scope kit says so
  // ("a second crew day in January") and the README promises it. A ratio
  // on hangWorkHours prices the *work* of the second day; it does not put
  // the truck back on the road. Whenever there is a take-down at all, the
  // crew drives the same round trip a second time.
  const hoursTakedownTravel = takedownRatio > 0 ? hoursTravel : 0;
  const totalHours = hoursTravel + hangWorkHours + hoursTimerApplied
    + hoursTakedown + hoursTakedownTravel + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const productMaterial = eaveLf * productPerLf;
  const typeMaterial = eaveLf * typeMaterialPerLf;
  const liftMaterial = liftInvoice;
  const storageMaterial = storageInvoice;
  const peakMaterial = peaks * peakEach;
  const treeMaterial = trees * treeEach;
  const bushMaterial = bushes * bushEach;
  const columnMaterial = columns * columnEach;
  const timerMaterial = includeTimer ? timerInvoice : 0;
  const travelInvoice = travelMiles * travelPerMile;
  // Same reasoning as hoursTakedownTravel: the mileage invoice for that
  // second drive, not a share of the first one.
  const takedownTravelInvoice = takedownRatio > 0 ? travelInvoice : 0;
  const finishMaterial = productMaterial + typeMaterial;
  const extraHardware = liftMaterial + storageMaterial + peakMaterial
    + treeMaterial + bushMaterial + columnMaterial + timerMaterial
    + travelInvoice + takedownTravelInvoice;
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
    + hoursAccess * loadedWage
    + hoursAccessPremium * loadedWage
    + hoursType * loadedWage
    + hoursPeaks * loadedWage
    + hoursTrees * loadedWage
    + hoursBushes * loadedWage
    + hoursColumns * loadedWage
    + hoursTimerApplied * loadedWage
    + hoursSteepApplied * loadedWage
    + hoursTakedown * loadedWage
    + hoursTakedownTravel * loadedWage
    + hoursTravel * loadedWage;

  return {
    scope,
    stories,
    lightType,
    eaveLf,
    travelMiles,
    peaks,
    trees,
    bushes,
    columns,
    includeTimer,
    steepPitch,
    loadedWage,
    hoursTravel,
    hoursHang,
    hoursAccess,
    hoursAccessPremium,
    hoursType,
    hoursPeaks,
    hoursTrees,
    hoursBushes,
    hoursColumns,
    hoursTimer: hoursTimerApplied,
    hoursSteep: hoursSteepApplied,
    hoursTakedown,
    hoursTakedownTravel,
    siteHours,
    totalHours,
    laborCost,
    productMaterial,
    typeMaterial,
    liftMaterial,
    storageMaterial,
    peakMaterial,
    treeMaterial,
    bushMaterial,
    columnMaterial,
    timerMaterial,
    travelInvoice,
    takedownTravelInvoice,
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
      hang: hourShare(hoursHang),
      access: hourShare(hoursAccess + hoursAccessPremium),
      type: hourShare(hoursType),
      peaks: hourShare(hoursPeaks),
      trees: hourShare(hoursTrees),
      bushes: hourShare(hoursBushes),
      columns: hourShare(hoursColumns),
      timer: hourShare(hoursTimerApplied),
      steep: hourShare(hoursSteepApplied),
      takedown: hourShare(hoursTakedown),
      takedownTravel: hourShare(hoursTakedownTravel),
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
 * Price the same house three ways — hang-only, hang-and-takedown,
 * full-service — from the suggested scope kits so the contractor
 * can see when January take-down flips the cheap $3 / LF special.
 * User-typed scope rates are not reused here: the comparison is
 * apples-to-apples on the starting figures. Story and type kits
 * stay with the current job.
 */
export function compareScope(input) {
  const storyKit = suggestedStoryKit(String(input.stories ?? 'one'));
  const typeKit = suggestedTypeKit(String(input.lightType ?? 'c9'));
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
      hoursHang: bid.hoursHang,
      hoursTakedown: bid.hoursTakedown,
      productMaterial: bid.productMaterial,
      storageMaterial: bid.storageMaterial,
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
export function formatBidSummary(result, jobLabel = 'Holiday lights') {
  const perFt = result.pricePerLf === null
    ? 'n/a'
    : `${money(result.pricePerLf)} / LF`;
  const scope = SCOPE_PRESETS.find((item) => item.id === result.scope)?.label ?? result.scope;
  const stories = STORY_PRESETS.find((item) => item.id === result.stories)?.label ?? result.stories;
  const lightType = TYPE_PRESETS.find((item) => item.id === result.lightType)?.label ?? result.lightType;
  const extras = [
    `${result.travelMiles} travel miles`,
    stories,
    lightType,
    `${result.peaks} peak${result.peaks === 1 ? '' : 's'} / gable${result.peaks === 1 ? '' : 's'}`,
    `${result.trees} tree wrap${result.trees === 1 ? '' : 's'}`,
    `${result.bushes} bush / shrub net${result.bushes === 1 ? '' : 's'}`,
    `${result.columns} column wrap${result.columns === 1 ? '' : 's'}`,
    result.includeTimer ? 'timer / photocell included' : 'no timer',
    result.steepPitch ? 'steep-pitch premium included' : 'no steep-pitch premium',
  ].join('; ');
  return [
    'HOLIDAY LIGHT BID',
    '',
    `Proposed installed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${scope}`,
    `Price per lineal foot of eave: ${perFt}`,
    `Eave: ${result.eaveLf.toLocaleString('en-US')} LF`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.eaveLf} LF of roofline`,
    `- ${scope}; ${stories}; ${lightType}`,
    `- ${extras}`,
    `- Travel: ${(result.hoursTravel + result.hoursTakedownTravel).toFixed(1)} h${result.hoursTakedownTravel > 0 ? ' (hang trip + January take-down trip)' : ''}; hang: ${result.hoursHang.toFixed(1)} h; take-down: ${result.hoursTakedown.toFixed(1)} h; extras: ${(result.hoursPeaks + result.hoursTrees + result.hoursBushes + result.hoursColumns + result.hoursTimer + result.hoursSteep).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm eave length, scope, stories, light type, extras, and all pricing before sending. It is not an electrical design, a load calculation, a permit determination, a landscape-lighting design, or a product warranty.',
  ].join('\n');
}
