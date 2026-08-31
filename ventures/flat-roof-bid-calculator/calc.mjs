// Pure bid arithmetic for *installing a low-slope / flat roof* —
// TPO, EPDM, PVC, or modified bitumen — not an asphalt-shingle
// reroof, not a standing-seam metal roof, and not a solar array. No
// network, no state: every square, membrane kit, tear-off, insulation
// layer, parapet run, drain, wage, and extra is an input, so the
// result stays a transparent calculation the shop can check against
// their own invoices rather than a claim about what any roof "should"
// cost, or whether any assembly is code-compliant.
//
// The method is the one the trade actually loses money on: a flat
// "$650 / square" special treats a 12-square TPO-45 recover on a
// one-story garage as the same job as a 40-square 80-mil TPO tear-off
// with two layers of polyiso, 80 lf of parapet, six drains, and four
// HVAC curbs. Homeowners (and a lot of estimator sheets) count plan
// squares. Membrane mil, recover vs tear-off, wet insulation, parapet
// flashing, drains, and curbs never appear in that number. Matching a
// cheaper special written for the garage recover is how a sold
// commercial tear-off becomes unpaid welding time after the first
// parapet.
//
// Distinct from an asphalt *shingle* reroof (pitch factor, bundles,
// tear-off bags), from a *metal* roof (standing-seam panels, trim,
// snow guards), and from solar (dollars per watt on a roof that is
// already there). This prices the flat roof: membrane squares the
// coupon cannot see, the tear-off, the insulation, the parapet, the
// extras, and the margin that is not in the square special.
//
// Membrane rates, waste, and insulation figures shipped here are
// common starting points used on residential and light-commercial
// bids. They are not a building-code opinion, a permit, a wind-uplift
// rating, or an engineering stamp. Confirm the jurisdiction and a
// qualified professional before sending a price.

export const MEMBRANE_PRESETS = Object.freeze([
  { id: 'tpo-45', label: 'TPO 45-mil (recover / overlay)' },
  { id: 'tpo-60', label: 'TPO 60-mil' },
  { id: 'tpo-80', label: 'TPO 80-mil' },
  { id: 'epdm-60', label: 'EPDM 60-mil' },
  { id: 'modbit-2', label: 'Modified bitumen, 2-ply' },
  { id: 'pvc-60', label: 'PVC 60-mil' },
]);

export const SCOPE_PRESETS = Object.freeze([
  { id: 'recover', label: 'Recover (membrane over existing)' },
  { id: 'tear-off', label: 'Full tear-off to deck' },
  { id: 'tear-off-insul', label: 'Tear-off plus wet insulation' },
]);

export const SLOPE_PRESETS = Object.freeze([
  { id: 'quarter', label: '1/4" per foot' },
  { id: 'half', label: '1/2" per foot' },
  { id: 'one', label: '1" per foot' },
]);

export const STORY_PRESETS = Object.freeze([
  { id: '1', label: 'One story' },
  { id: '2', label: 'Two stories' },
  { id: '3', label: 'Three stories / limited access' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '40×30 garage, TPO 45 recover (the $650/square special)',
    membrane: 'tpo-45',
    scope: 'recover',
    slope: 'quarter',
    stories: '1',
    lengthFeet: 40,
    widthFeet: 30,
    parapetLf: 0,
    drainCount: 2,
    curbCount: 0,
    walkPadSquares: 0,
    insulationLayers: 0,
    includeCoverBoard: false,
    includePermit: false,
  },
  {
    label: '80×50 commercial, TPO 80 tear-off, two polyiso, parapet, drains, curbs',
    membrane: 'tpo-80',
    scope: 'tear-off-insul',
    slope: 'half',
    stories: '2',
    lengthFeet: 80,
    widthFeet: 50,
    parapetLf: 80,
    drainCount: 6,
    curbCount: 4,
    walkPadSquares: 2,
    insulationLayers: 2,
    includeCoverBoard: true,
    includePermit: true,
  },
  {
    label: '50×40 EPDM recover, 40 lf parapet, 3 drains',
    membrane: 'epdm-60',
    scope: 'recover',
    slope: 'quarter',
    stories: '1',
    lengthFeet: 50,
    widthFeet: 40,
    parapetLf: 40,
    drainCount: 3,
    curbCount: 1,
    walkPadSquares: 0.5,
    insulationLayers: 0,
    includeCoverBoard: false,
    includePermit: true,
  },
  {
    label: '60×40 modified-bitumen tear-off, two-story, 4 drains',
    membrane: 'modbit-2',
    scope: 'tear-off',
    slope: 'one',
    stories: '2',
    lengthFeet: 60,
    widthFeet: 40,
    parapetLf: 24,
    drainCount: 4,
    curbCount: 2,
    walkPadSquares: 1,
    insulationLayers: 1,
    includeCoverBoard: true,
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
 * Low-slope area multiplier. A 1/4" per foot is essentially 1.000;
 * a 1" per foot is 1.003. The coupon that quotes "$650 / square"
 * already billed plan squares — or skipped even that and billed a
 * guessed "20 squares."
 */
export function suggestedSlopeMultiplier(slope) {
  const id = String(slope);
  if (id === 'quarter') return 1.000;
  if (id === 'half') return 1.001;
  if (id === 'one') return 1.003;
  throw new Error('Unknown slope');
}

/**
 * Plan square feet the coupon already counted: length × width of the
 * building footprint.
 */
export function suggestedPlanSf(lengthFeet, widthFeet) {
  const length = number(lengthFeet, 'Length (feet)', { allowZero: false });
  const width = number(widthFeet, 'Width (feet)', { allowZero: false });
  return length * width;
}

/**
 * Roof square feet after the low-slope factor. A 40×30 garage at
 * 1/4" per foot is 1,200 sf, not a steep-roof pitch table.
 */
export function suggestedRoofSf(lengthFeet, widthFeet, slope) {
  return suggestedPlanSf(lengthFeet, widthFeet) * suggestedSlopeMultiplier(slope);
}

/**
 * Roofing squares (100 sf). The "$650 / square" special stops here.
 */
export function suggestedSquares(lengthFeet, widthFeet, slope) {
  return suggestedRoofSf(lengthFeet, widthFeet, slope) / 100;
}

/**
 * Extra waste from parapet flashing. Two percent per 20 lf of
 * parapet, capped so a garage without walls stays at the kit waste.
 */
export function suggestedParapetWastePct(parapetLf) {
  const parapet = number(parapetLf, 'Parapet (lineal feet)');
  return Math.min(10, (parapet / 20) * 2);
}

/**
 * Membrane squares the coupon cannot see: roof squares × (1 + kit
 * waste + parapet waste). A 12-square garage at 8% waste is 12.96
 * membrane squares, not "12 squares."
 */
export function suggestedMembraneSquares(squares, wastePct, parapetWastePct) {
  const roofSquares = number(squares, 'Roof squares');
  const waste = number(wastePct, 'Waste (%)');
  const extra = number(parapetWastePct, 'Parapet waste (%)');
  return roofSquares * (1 + (waste + extra) / 100);
}

/**
 * Tear-off squares. Recover is zero — the coupon already assumed
 * that. A full tear-off covers the roof, not the membrane waste.
 * Wet-insulation tear-off covers the same roof plus the wet layers
 * the recover never priced.
 */
export function suggestedTearOffSquares(squares, scope) {
  const roofSquares = number(squares, 'Roof squares');
  const id = String(scope);
  if (id !== 'recover' && id !== 'tear-off' && id !== 'tear-off-insul') {
    throw new Error('Unknown scope');
  }
  return id === 'recover' ? 0 : roofSquares;
}

/**
 * Insulation squares. Recover with zero layers is zero. Each layer
 * covers the roof, not the membrane waste.
 */
export function suggestedInsulationSquares(squares, insulationLayers) {
  const roofSquares = number(squares, 'Roof squares');
  const layers = number(insulationLayers, 'Insulation layers');
  return roofSquares * layers;
}

/**
 * Starting hours-per-square, membrane dollars, and waste. Picking a
 * membrane kit never overwrites a cost the shop has already typed.
 */
export function suggestedMembraneKit(membrane) {
  const id = String(membrane);
  if (id === 'tpo-45') {
    return { hoursPerSquare: 1.4, membranePerSquare: 165, wastePct: 8, weldHours: 0, weldFee: 0 };
  }
  if (id === 'tpo-60') {
    return { hoursPerSquare: 1.7, membranePerSquare: 215, wastePct: 8, weldHours: 0, weldFee: 0 };
  }
  if (id === 'tpo-80') {
    return { hoursPerSquare: 2.1, membranePerSquare: 295, wastePct: 10, weldHours: 4, weldFee: 220 };
  }
  if (id === 'epdm-60') {
    return { hoursPerSquare: 1.8, membranePerSquare: 185, wastePct: 10, weldHours: 0, weldFee: 0 };
  }
  if (id === 'modbit-2') {
    return { hoursPerSquare: 2.4, membranePerSquare: 240, wastePct: 12, weldHours: 0, weldFee: 0 };
  }
  if (id === 'pvc-60') {
    return { hoursPerSquare: 1.9, membranePerSquare: 275, wastePct: 8, weldHours: 3, weldFee: 180 };
  }
  throw new Error('Unknown membrane');
}

/**
 * Starting tear-off hours and dumpster dollars per roof square.
 */
export function suggestedScopeKit(scope) {
  const id = String(scope);
  if (id === 'recover') return { hoursPerSquare: 0, dumpsterPerSquare: 0 };
  if (id === 'tear-off') return { hoursPerSquare: 0.9, dumpsterPerSquare: 28 };
  if (id === 'tear-off-insul') return { hoursPerSquare: 1.4, dumpsterPerSquare: 42 };
  throw new Error('Unknown scope');
}

/**
 * Extra hours per roof square for height / access. A two-story
 * commercial deck is not "the same squares plus a ladder."
 */
export function suggestedStoryKit(stories) {
  const id = String(stories);
  if (id === '1') return { extraHoursPerSquare: 0 };
  if (id === '2') return { extraHoursPerSquare: 0.35 };
  if (id === '3') return { extraHoursPerSquare: 0.75 };
  throw new Error('Unknown stories');
}

/**
 * Price a flat-roof job from the squares the coupon sees and the
 * membrane, tear-off, insulation, parapet, and extras it cannot see.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const lengthFeet = number(input.lengthFeet ?? 0, 'Length (feet)', { allowZero: false });
  const widthFeet = number(input.widthFeet ?? 0, 'Width (feet)', { allowZero: false });

  const membrane = String(input.membrane ?? 'tpo-45');
  if (!MEMBRANE_PRESETS.some((item) => item.id === membrane)) {
    throw new Error('Unknown membrane');
  }
  const scope = String(input.scope ?? 'recover');
  if (!SCOPE_PRESETS.some((item) => item.id === scope)) {
    throw new Error('Unknown scope');
  }
  const slope = String(input.slope ?? 'quarter');
  if (!SLOPE_PRESETS.some((item) => item.id === slope)) {
    throw new Error('Unknown slope');
  }
  const stories = String(input.stories ?? '1');
  if (!STORY_PRESETS.some((item) => item.id === stories)) {
    throw new Error('Unknown stories');
  }

  const includeCoverBoard = flag(input.includeCoverBoard);
  const includePermit = flag(input.includePermit);

  const planSf = lengthFeet * widthFeet;
  const slopeMultiplier = number(input.slopeMultiplier ?? 0, 'Slope multiplier', { allowZero: false });
  const roofSf = number(input.roofSf ?? 0, 'Roof square feet');
  const squares = number(input.squares ?? 0, 'Roof squares');
  const wastePct = number(input.wastePct ?? 0, 'Waste (%)');
  const parapetWastePct = number(input.parapetWastePct ?? 0, 'Parapet waste (%)');
  const membraneSquares = number(input.membraneSquares ?? 0, 'Membrane squares');
  const tearOffSquares = number(input.tearOffSquares ?? 0, 'Tear-off squares');
  const insulationSquares = number(input.insulationSquares ?? 0, 'Insulation squares');

  const parapetLf = number(input.parapetLf ?? 0, 'Parapet (lineal feet)');
  const drainCount = number(input.drainCount ?? 0, 'Drain count');
  const curbCount = number(input.curbCount ?? 0, 'HVAC-curb count');
  const walkPadSquares = number(input.walkPadSquares ?? 0, 'Walk-pad squares');
  const insulationLayers = number(input.insulationLayers ?? 0, 'Insulation layers');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursPerSquare = number(input.hoursPerSquare ?? 0, 'Hours per membrane square');
  const extraHoursPerSquare = number(input.extraHoursPerSquare ?? 0, 'Extra hours per square for stories');
  const hoursTearoffPerSquare = number(input.hoursTearoffPerSquare ?? 0, 'Hours per tear-off square');
  const hoursPerInsulationSquare = number(input.hoursPerInsulationSquare ?? 0, 'Hours per insulation square');
  const hoursPerParapetLf = number(input.hoursPerParapetLf ?? 0, 'Hours per lineal foot of parapet');
  const hoursPerDrain = number(input.hoursPerDrain ?? 0, 'Hours per drain');
  const hoursPerCurb = number(input.hoursPerCurb ?? 0, 'Hours per HVAC curb');
  const hoursPerWalkPadSquare = number(input.hoursPerWalkPadSquare ?? 0, 'Hours per walk-pad square');
  const weldHours = number(input.weldHours ?? 0, 'Welder hours');
  const hoursCoverBoard = number(input.hoursCoverBoard ?? 0, 'Cover-board hours');
  const siteHours = number(input.siteHours ?? 0, 'Travel / site hours');

  const membranePerSquare = number(input.membranePerSquare ?? 0, 'Membrane per square');
  const insulationPerSquare = number(input.insulationPerSquare ?? 0, 'Insulation per square');
  const coverBoardPerSquare = number(input.coverBoardPerSquare ?? 0, 'Cover board per square');
  const parapetPerLf = number(input.parapetPerLf ?? 0, 'Parapet per lineal foot');
  const drainEach = number(input.drainEach ?? 0, 'Cost per drain');
  const curbEach = number(input.curbEach ?? 0, 'Cost per HVAC curb');
  const walkPadPerSquare = number(input.walkPadPerSquare ?? 0, 'Walk pad per square');
  const fastenerLump = number(input.fastenerLump ?? 0, 'Fasteners / plates / adhesive');
  const dumpsterPerSquare = number(input.dumpsterPerSquare ?? 0, 'Dumpster per tear-off square');
  const weldFee = number(input.weldFee ?? 0, 'Welder rental');
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
  const membraneHours = membraneSquares * hoursPerSquare;
  const storyHours = squares * extraHoursPerSquare;
  const tearOffHours = tearOffSquares * hoursTearoffPerSquare;
  const insulationHours = insulationSquares * hoursPerInsulationSquare;
  const parapetHours = parapetLf * hoursPerParapetLf;
  const drainHours = drainCount * hoursPerDrain;
  const curbHours = curbCount * hoursPerCurb;
  const walkHours = walkPadSquares * hoursPerWalkPadSquare;
  const weldLaborHours = (membrane === 'tpo-80' || membrane === 'pvc-60') ? weldHours : 0;
  const coverHours = includeCoverBoard ? hoursCoverBoard : 0;
  const travelHours = siteHours;
  const totalHours = tripHours + membraneHours + storyHours + tearOffHours + insulationHours
    + parapetHours + drainHours + curbHours + walkHours + weldLaborHours + coverHours + travelHours;

  const laborCost = totalHours * loadedWage;
  const membraneMaterial = membraneSquares * membranePerSquare;
  const insulationMaterial = insulationSquares * insulationPerSquare;
  const coverMaterial = includeCoverBoard ? squares * coverBoardPerSquare : 0;
  const parapetMaterial = parapetLf * parapetPerLf;
  const drainMaterial = drainCount * drainEach;
  const curbMaterial = curbCount * curbEach;
  const walkMaterial = walkPadSquares * walkPadPerSquare;
  const dumpsterMaterial = tearOffSquares * dumpsterPerSquare;
  const materialCost = membraneMaterial + insulationMaterial + coverMaterial
    + parapetMaterial + drainMaterial + curbMaterial + walkMaterial
    + fastenerLump + dumpsterMaterial;
  const weldMaterial = (membrane === 'tpo-80' || membrane === 'pvc-60') ? weldFee : 0;
  const mobilizationMaterial = mobilizationFee;
  const permitMaterial = includePermit ? permitFee : 0;
  const softCost = travelAndEquipment + mobilizationMaterial + permitMaterial + weldMaterial;
  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);
  const hourShare = (amount) => (totalHours === 0 ? 0 : amount / totalHours * 100);
  const membraneDirect = membraneHours * loadedWage + membraneMaterial;
  const fieldDirect = membraneDirect + insulationHours * loadedWage + insulationMaterial
    + coverHours * loadedWage + coverMaterial
    + parapetHours * loadedWage + parapetMaterial
    + drainHours * loadedWage + drainMaterial
    + curbHours * loadedWage + curbMaterial
    + walkHours * loadedWage + walkMaterial
    + weldLaborHours * loadedWage + weldMaterial;

  return {
    membrane,
    scope,
    slope,
    stories,
    lengthFeet,
    widthFeet,
    slopeMultiplier,
    planSf,
    roofSf,
    squares,
    wastePct,
    parapetWastePct,
    membraneSquares,
    tearOffSquares,
    insulationSquares,
    insulationLayers,
    parapetLf,
    drainCount,
    curbCount,
    walkPadSquares,
    includeCoverBoard,
    includePermit,
    loadedWage,
    tripHours,
    membraneHours,
    storyHours,
    tearOffHours,
    insulationHours,
    parapetHours,
    drainHours,
    curbHours,
    walkHours,
    weldLaborHours,
    coverHours,
    travelHours,
    totalHours,
    laborCost,
    membraneMaterial,
    insulationMaterial,
    coverMaterial,
    parapetMaterial,
    drainMaterial,
    curbMaterial,
    walkMaterial,
    fastenerLump,
    dumpsterMaterial,
    materialCost,
    weldMaterial,
    travelAndEquipment,
    mobilizationMaterial,
    permitMaterial,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSquare: squares === 0 ? null : price / squares,
    pricePerSf: roofSf === 0 ? null : price / roofSf,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    membraneShareOfDirect: directCost === 0 ? 0 : membraneDirect / directCost * 100,
    fieldShareOfDirect: directCost === 0 ? 0 : fieldDirect / directCost * 100,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(tripHours),
      membrane: hourShare(membraneHours),
      stories: hourShare(storyHours),
      tearoff: hourShare(tearOffHours),
      insulation: hourShare(insulationHours),
      parapet: hourShare(parapetHours),
      drains: hourShare(drainHours),
      curbs: hourShare(curbHours),
      walk: hourShare(walkHours),
      weld: hourShare(weldLaborHours),
      cover: hourShare(coverHours),
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
export function formatBidSummary(result, jobLabel = 'Flat roof') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const membrane = MEMBRANE_PRESETS.find((item) => item.id === result.membrane)?.label ?? result.membrane;
  const slope = SLOPE_PRESETS.find((item) => item.id === result.slope)?.label ?? result.slope;
  const scope = SCOPE_PRESETS.find((item) => item.id === result.scope)?.label ?? result.scope;
  const stories = STORY_PRESETS.find((item) => item.id === result.stories)?.label ?? result.stories;
  const extras = [
    `${result.lengthFeet}×${result.widthFeet} ft plan (${result.planSf.toFixed(0)} sf)`,
    `${result.roofSf.toFixed(0)} sf roof / ${result.squares.toFixed(2)} squares after ${slope}`,
    `${result.membraneSquares.toFixed(2)} membrane squares after ${result.wastePct + result.parapetWastePct}% waste (${membrane})`,
    result.tearOffSquares ? `${result.tearOffSquares.toFixed(2)} squares tear-off` : 'recover — no tear-off this bid',
    `${result.insulationLayers} polyiso layer${result.insulationLayers === 1 ? '' : 's'} (${result.insulationSquares.toFixed(2)} insulation squares)`,
    `${result.parapetLf.toFixed(0)} lf parapet flashing`,
    `${result.drainCount} drain${result.drainCount === 1 ? '' : 's'}`,
    `${result.curbCount} HVAC curb${result.curbCount === 1 ? '' : 's'}`,
    `${result.walkPadSquares} walk-pad square${result.walkPadSquares === 1 ? '' : 's'}`,
    result.includeCoverBoard ? 'cover board included' : 'no cover board this bid',
    result.includePermit ? 'permit allowance included' : 'no permit allowance this bid',
  ];
  return [
    'FLAT ROOF / TPO / EPDM BID',
    '',
    `Proposed flat-roof price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${membrane}; ${slope}; ${stories}`,
    `Install: ${scope}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    result.pricePerSquare === null ? null : `Effective: ${money(result.pricePerSquare)} / square`,
    '',
    'SCOPE BASIS',
    `- ${membrane}; ${slope}; ${stories}; ${scope}`,
    `- ${result.lengthFeet}×${result.widthFeet} ft = ${result.planSf.toFixed(0)} sf plan, ${result.squares.toFixed(2)} squares, ${result.membraneSquares.toFixed(2)} membrane squares`,
    `- Setup: ${result.tripHours.toFixed(1)} h; membrane: ${result.membraneHours.toFixed(1)} h; stories: ${result.storyHours.toFixed(1)} h; tear-off: ${result.tearOffHours.toFixed(1)} h; insulation: ${result.insulationHours.toFixed(1)} h; parapet: ${result.parapetHours.toFixed(1)} h; drains: ${result.drainHours.toFixed(1)} h; curbs: ${result.curbHours.toFixed(1)} h; walk pads: ${result.walkHours.toFixed(1)} h; weld: ${result.weldLaborHours.toFixed(1)} h`,
    `- ${extras.join('; ')}`,
    '',
    'This is a draft for review. Confirm the squares, membrane, tear-off, insulation, parapet, extras, permit, and all pricing before sending. It is not a construction specification, a building-code opinion, a permit, a wind-uplift rating, or an engineering stamp.',
  ].filter((line) => line !== null).join('\n');
}
