// Pure bid arithmetic for *replacing a residential vinyl pool liner*,
// not replastering a gunite pool, not installing a hot tub, and not
// running a weekly chemical route. No network, no state: every span,
// mil, bead, stair, wage, and extra is an input, so the result stays a
// transparent calculation the shop can check against their own invoices
// rather than a claim about what any pool "should" cost, or whether any
// liner is code-compliant.
//
// The method is the one the trade actually loses money on: a published
// "$2,999 for a 16×32" or "$8 / sf of water" special treats a 16×32
// rectangle (512 sf of water) as the same job as an 18×36 oval with a
// hopper, wedding-cake stairs, a patterned 27-mil liner, and a new bead
// track. Homeowners (and a lot of estimator sheets) count water surface.
// Vinyl is sold and stretched on liner square feet — floor plus walls
// plus hopper extra plus stairs. Bead type, track replacement, cove,
// wall foam, and access never appear in the water-surface number.
// Matching the coupon written for a 16×32 spoon-bottom solid 20-mil
// swap is how a sold hopper oval becomes a two-day loss after the first
// wrinkle in the deep end.
//
// Distinct from pool *plaster* (chip-out and a new cementitious finish
// on gunite), a hot-tub / spa *install* (crane, pad, circuit), and a
// weekly pool *route* (chemicals). This prices the vinyl liner: the
// liner square feet the coupon cannot see, the stairs, the track, and
// the margin that is not in the water-surface special.
//
// Spans, mil rates, and waste percents shipped here are common starting
// points used on residential bids. They are not a building-code opinion,
// a permit, a structural check, or a manufacturer warranty. Confirm the
// jurisdiction, the bead receiver, and a qualified professional before
// sending a price.

export const SHAPE_PRESETS = Object.freeze([
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'oval', label: 'Oval / true oval' },
  { id: 'kidney', label: 'Kidney / freeform (bounding box)' },
]);

export const DEPTH_PRESETS = Object.freeze([
  { id: 'hopper', label: 'Hopper / deep-end box' },
  { id: 'spoon', label: 'Spoon / sloped (little extra vinyl)' },
  { id: 'flat', label: 'Flat bottom (walls only)' },
]);

export const MIL_PRESETS = Object.freeze([
  { id: '20', label: '20 mil solid / print' },
  { id: '27', label: '27 mil (common upgrade)' },
  { id: '30', label: '30 mil (thicker / patterned)' },
]);

export const BEAD_PRESETS = Object.freeze([
  { id: 'standard', label: 'Standard bead / J-hook into existing track' },
  { id: 'overlap', label: 'Overlap / coping-over (no track)' },
  { id: 'uni', label: 'Uni-bead / Fast-Bead conversion' },
]);

export const STAIR_PRESETS = Object.freeze([
  { id: 'none', label: 'No built-in stairs' },
  { id: 'hop-out', label: 'Hop-out / single step' },
  { id: 'wedding-cake', label: 'Wedding-cake / multi-step vinyl stairs' },
]);

export const PATTERN_PRESETS = Object.freeze([
  { id: 'solid', label: 'Solid / no pattern match' },
  { id: 'pattern', label: 'Patterned (print match + waste)' },
]);

export const ACCESS_PRESETS = Object.freeze([
  { id: 'easy', label: 'Easy access (gate / side yard)' },
  { id: 'fence', label: 'Over-the-fence carry' },
  { id: 'tight', label: 'Tight / over-house / no-gate' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '16×32 rectangle hopper, 20 mil solid (the $2,999 special)',
    shape: 'rectangle',
    depth: 'hopper',
    mil: '20',
    bead: 'standard',
    stairs: 'none',
    pattern: 'solid',
    access: 'easy',
    lengthFeet: 32,
    widthFeet: 16,
    wallHeightFeet: 3.5,
    replaceTrack: false,
    replaceCove: false,
    replaceWallFoam: false,
    includeCover: false,
    includePermit: false,
    pumpDown: true,
  },
  {
    label: '18×36 oval hopper, 27 mil pattern, wedding-cake, new track',
    shape: 'oval',
    depth: 'hopper',
    mil: '27',
    bead: 'standard',
    stairs: 'wedding-cake',
    pattern: 'pattern',
    access: 'easy',
    lengthFeet: 36,
    widthFeet: 18,
    wallHeightFeet: 3.5,
    replaceTrack: true,
    replaceCove: false,
    replaceWallFoam: false,
    includeCover: false,
    includePermit: true,
    pumpDown: true,
  },
  {
    label: '16×32 rectangle spoon, 20 mil, overlap bead, fence carry',
    shape: 'rectangle',
    depth: 'spoon',
    mil: '20',
    bead: 'overlap',
    stairs: 'none',
    pattern: 'solid',
    access: 'fence',
    lengthFeet: 32,
    widthFeet: 16,
    wallHeightFeet: 3.5,
    replaceTrack: false,
    replaceCove: true,
    replaceWallFoam: false,
    includeCover: false,
    includePermit: false,
    pumpDown: true,
  },
  {
    label: '20×40 rectangle hopper, 30 mil pattern, stairs, foam, cover',
    shape: 'rectangle',
    depth: 'hopper',
    mil: '30',
    bead: 'uni',
    stairs: 'wedding-cake',
    pattern: 'pattern',
    access: 'tight',
    lengthFeet: 40,
    widthFeet: 20,
    wallHeightFeet: 3.5,
    replaceTrack: true,
    replaceCove: true,
    replaceWallFoam: true,
    includeCover: true,
    includePermit: true,
    pumpDown: true,
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
 * Water surface the coupon sees. Rectangle is length × width. Oval is
 * the ellipse. Kidney starts from 85% of the bounding box — a
 * starting guess the shop replaces after they measure.
 */
export function suggestedWaterSurface(lengthFeet, widthFeet, shape) {
  const length = number(lengthFeet, 'Length (feet)', { allowZero: false });
  const width = number(widthFeet, 'Width (feet)', { allowZero: false });
  const id = String(shape);
  if (id === 'rectangle') return length * width;
  if (id === 'oval') return Math.PI * (length / 2) * (width / 2);
  if (id === 'kidney') return length * width * 0.85;
  throw new Error('Unknown shape');
}

/**
 * Bead-track / wall lineal feet. Rectangle is 2(L+W). Oval uses
 * Ramanujan's approximation. Kidney starts 8% longer than the
 * bounding rectangle — freeform walls wander.
 */
export function suggestedPerimeter(lengthFeet, widthFeet, shape) {
  const length = number(lengthFeet, 'Length (feet)', { allowZero: false });
  const width = number(widthFeet, 'Width (feet)', { allowZero: false });
  const id = String(shape);
  if (id === 'rectangle') return 2 * (length + width);
  if (id === 'oval') {
    const a = length / 2;
    const b = width / 2;
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  }
  if (id === 'kidney') return 2 * (length + width) * 1.08;
  throw new Error('Unknown shape');
}

/**
 * Wall vinyl the water-surface coupon cannot see. A 16×32 rectangle
 * at 42-inch walls is 96 lf × 3.5 ft = 336 sf of wall on a 512 sf
 * floor.
 */
export function suggestedWallSf(perimeterFeet, wallHeightFeet) {
  const perimeter = number(perimeterFeet, 'Perimeter (feet)', { allowZero: false });
  const wall = number(wallHeightFeet, 'Wall height (feet)', { allowZero: false });
  return perimeter * wall;
}

/**
 * Extra vinyl for the deep end. A hopper is a box the coupon never
 * counted. Spoon is a gentle slope. Flat is walls only.
 */
export function suggestedHopperExtraSf(waterSurfaceSf, depth) {
  const surface = number(waterSurfaceSf, 'Water surface (square feet)', { allowZero: false });
  const id = String(depth);
  if (id === 'flat') return 0;
  if (id === 'spoon') return surface * 0.06;
  if (id === 'hopper') return surface * 0.22;
  throw new Error('Unknown depth');
}

/**
 * Extra vinyl and wrinkle time for built-in stairs. Wedding-cake
 * stairs are the job that turns a half-day stretch into a full day.
 */
export function suggestedStairSf(stairs) {
  const id = String(stairs);
  if (id === 'none') return 0;
  if (id === 'hop-out') return 28;
  if (id === 'wedding-cake') return 85;
  throw new Error('Unknown stairs');
}

/**
 * Liner square feet the mill cuts from: floor + walls + hopper extra
 * + stairs. This is the number the water-surface coupon cannot see.
 */
export function suggestedLinerSf(waterSurfaceSf, wallSf, hopperExtraSf, stairSf) {
  return number(waterSurfaceSf, 'Water surface (square feet)')
    + number(wallSf, 'Wall square feet')
    + number(hopperExtraSf, 'Hopper extra square feet')
    + number(stairSf, 'Stair square feet');
}

/**
 * Order square feet after waste. Patterned liners waste more because
 * the print has to land on the bead and the floor.
 */
export function suggestedWastePercent(pattern) {
  const id = String(pattern);
  if (id === 'solid') return 8;
  if (id === 'pattern') return 14;
  throw new Error('Unknown pattern');
}

export function suggestedOrderSf(linerSf, wastePercent) {
  const liner = number(linerSf, 'Liner square feet');
  const waste = number(wastePercent, 'Waste percent');
  return liner * (1 + waste / 100);
}

/**
 * Starting hours-per-100-sf and material-per-sf for the mil. Picking
 * a mil never overwrites a cost the shop has already typed.
 */
export function suggestedMilKit(mil) {
  const id = String(mil);
  if (id === '20') return { hoursPer100Sf: 1.8, linerPerSf: 1.85 };
  if (id === '27') return { hoursPer100Sf: 2.1, linerPerSf: 2.85 };
  if (id === '30') return { hoursPer100Sf: 2.3, linerPerSf: 3.35 };
  throw new Error('Unknown mil');
}

/**
 * Starting extra hours for the bead. Overlap is coping work the
 * standard-bead 16×32 never had.
 */
export function suggestedBeadKit(bead) {
  const id = String(bead);
  if (id === 'standard') return { extraHours: 0 };
  if (id === 'overlap') return { extraHours: 2.5 };
  if (id === 'uni') return { extraHours: 0.8 };
  throw new Error('Unknown bead');
}

/**
 * Starting extra hours for access. Over-the-fence is not "the same
 * job plus a ladder."
 */
export function suggestedAccessKit(access) {
  const id = String(access);
  if (id === 'easy') return { extraHours: 0 };
  if (id === 'fence') return { extraHours: 2.5 };
  if (id === 'tight') return { extraHours: 4.5 };
  throw new Error('Unknown access');
}

/**
 * Starting stair hours. None is zero. Wedding-cake is a morning.
 */
export function suggestedStairKit(stairs) {
  const id = String(stairs);
  if (id === 'none') return { hours: 0 };
  if (id === 'hop-out') return { hours: 1.6 };
  if (id === 'wedding-cake') return { hours: 4.2 };
  throw new Error('Unknown stairs');
}

/**
 * Price a vinyl-liner replacement from the water surface the coupon
 * sees and the liner, stairs, track, and extras it cannot see.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const lengthFeet = number(input.lengthFeet ?? 0, 'Length (feet)', { allowZero: false });
  const widthFeet = number(input.widthFeet ?? 0, 'Width (feet)', { allowZero: false });
  const wallHeightFeet = number(input.wallHeightFeet ?? 0, 'Wall height (feet)', { allowZero: false });

  const shape = String(input.shape ?? 'rectangle');
  if (!SHAPE_PRESETS.some((item) => item.id === shape)) throw new Error('Unknown shape');
  const depth = String(input.depth ?? 'hopper');
  if (!DEPTH_PRESETS.some((item) => item.id === depth)) throw new Error('Unknown depth');
  const mil = String(input.mil ?? '20');
  if (!MIL_PRESETS.some((item) => item.id === mil)) throw new Error('Unknown mil');
  const bead = String(input.bead ?? 'standard');
  if (!BEAD_PRESETS.some((item) => item.id === bead)) throw new Error('Unknown bead');
  const stairs = String(input.stairs ?? 'none');
  if (!STAIR_PRESETS.some((item) => item.id === stairs)) throw new Error('Unknown stairs');
  const pattern = String(input.pattern ?? 'solid');
  if (!PATTERN_PRESETS.some((item) => item.id === pattern)) throw new Error('Unknown pattern');
  const access = String(input.access ?? 'easy');
  if (!ACCESS_PRESETS.some((item) => item.id === access)) throw new Error('Unknown access');

  const replaceTrack = flag(input.replaceTrack);
  const replaceCove = flag(input.replaceCove);
  const replaceWallFoam = flag(input.replaceWallFoam);
  const includeCover = flag(input.includeCover);
  const includePermit = flag(input.includePermit);
  const pumpDown = flag(input.pumpDown);

  const waterSurfaceSf = number(input.waterSurfaceSf ?? 0, 'Water surface (square feet)');
  const perimeterLf = number(input.perimeterLf ?? 0, 'Perimeter (feet)');
  const wallSf = number(input.wallSf ?? 0, 'Wall square feet');
  const hopperExtraSf = number(input.hopperExtraSf ?? 0, 'Hopper extra square feet');
  const stairSf = number(input.stairSf ?? 0, 'Stair square feet');
  const linerSf = number(input.linerSf ?? 0, 'Liner square feet');
  const wastePercent = number(input.wastePercent ?? 0, 'Waste percent');
  const orderSf = number(input.orderSf ?? 0, 'Order square feet');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursPer100SfLiner = number(input.hoursPer100SfLiner ?? 0, 'Hours per 100 sf of liner');
  const hoursStairs = number(input.hoursStairs ?? 0, 'Hours for stairs');
  const hoursBead = number(input.hoursBead ?? 0, 'Hours for bead work');
  const hoursPerTrackLf = number(input.hoursPerTrackLf ?? 0, 'Hours per lf of track');
  const hoursCove = number(input.hoursCove ?? 0, 'Hours for cove');
  const hoursFoam = number(input.hoursFoam ?? 0, 'Hours for wall foam');
  const hoursAccess = number(input.hoursAccess ?? 0, 'Hours for access');
  const hoursPump = number(input.hoursPump ?? 0, 'Hours to pump and vac');
  const hoursCover = number(input.hoursCover ?? 0, 'Hours for a new cover');
  const siteHours = number(input.siteHours ?? 0, 'Travel / site hours');

  const linerPerSf = number(input.linerPerSf ?? 0, 'Liner per sf');
  const fittingsLump = number(input.fittingsLump ?? 0, 'Fittings / gaskets');
  const disposalFee = number(input.disposalFee ?? 0, 'Old-liner disposal');
  const trackPerLf = number(input.trackPerLf ?? 0, 'Track per lineal foot');
  const coveLump = number(input.coveLump ?? 0, 'Cove replacement');
  const foamPerLf = number(input.foamPerLf ?? 0, 'Wall foam per lineal foot');
  const coverFee = number(input.coverFee ?? 0, 'Winter / safety cover');
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
  const linerHours = linerSf * hoursPer100SfLiner / 100;
  const stairHours = hoursStairs;
  const beadHours = hoursBead;
  const trackHours = replaceTrack ? perimeterLf * hoursPerTrackLf : 0;
  const coveHours = replaceCove ? hoursCove : 0;
  const foamHours = replaceWallFoam ? hoursFoam : 0;
  const accessHours = hoursAccess;
  const pumpHours = pumpDown ? hoursPump : 0;
  const coverHours = includeCover ? hoursCover : 0;
  const travelHours = siteHours;
  const totalHours = tripHours + linerHours + stairHours + beadHours + trackHours
    + coveHours + foamHours + accessHours + pumpHours + coverHours + travelHours;

  const laborCost = totalHours * loadedWage;
  const linerMaterial = orderSf * linerPerSf;
  const trackMaterial = replaceTrack ? perimeterLf * trackPerLf : 0;
  const coveMaterial = replaceCove ? coveLump : 0;
  const foamMaterial = replaceWallFoam ? perimeterLf * foamPerLf : 0;
  const coverMaterial = includeCover ? coverFee : 0;
  const materialCost = linerMaterial + fittingsLump + disposalFee + trackMaterial
    + coveMaterial + foamMaterial + coverMaterial;
  const mobilizationMaterial = mobilizationFee;
  const permitMaterial = includePermit ? permitFee : 0;
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
  const linerDirect = linerHours * loadedWage + linerMaterial + stairHours * loadedWage;
  const extrasDirect = trackHours * loadedWage + trackMaterial + coveHours * loadedWage + coveMaterial
    + foamHours * loadedWage + foamMaterial + coverHours * loadedWage + coverMaterial;

  return {
    shape,
    depth,
    mil,
    bead,
    stairs,
    pattern,
    access,
    lengthFeet,
    widthFeet,
    wallHeightFeet,
    waterSurfaceSf,
    perimeterLf,
    wallSf,
    hopperExtraSf,
    stairSf,
    linerSf,
    wastePercent,
    orderSf,
    replaceTrack,
    replaceCove,
    replaceWallFoam,
    includeCover,
    includePermit,
    pumpDown,
    loadedWage,
    tripHours,
    linerHours,
    stairHours,
    beadHours,
    trackHours,
    coveHours,
    foamHours,
    accessHours,
    pumpHours,
    coverHours,
    travelHours,
    totalHours,
    laborCost,
    linerMaterial,
    fittingsLump,
    disposalFee,
    trackMaterial,
    coveMaterial,
    foamMaterial,
    coverMaterial,
    materialCost,
    travelAndEquipment,
    mobilizationMaterial,
    permitMaterial,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerWaterSf: waterSurfaceSf === 0 ? null : price / waterSurfaceSf,
    pricePerLinerSf: linerSf === 0 ? null : price / linerSf,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    linerShareOfDirect: directCost === 0 ? 0 : linerDirect / directCost * 100,
    extrasShareOfDirect: directCost === 0 ? 0 : extrasDirect / directCost * 100,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(tripHours),
      liner: hourShare(linerHours),
      stairs: hourShare(stairHours),
      bead: hourShare(beadHours),
      track: hourShare(trackHours),
      cove: hourShare(coveHours),
      foam: hourShare(foamHours),
      access: hourShare(accessHours),
      pump: hourShare(pumpHours),
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
export function formatBidSummary(result, jobLabel = 'Vinyl liner replacement') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const shape = SHAPE_PRESETS.find((item) => item.id === result.shape)?.label ?? result.shape;
  const depth = DEPTH_PRESETS.find((item) => item.id === result.depth)?.label ?? result.depth;
  const mil = MIL_PRESETS.find((item) => item.id === result.mil)?.label ?? result.mil;
  const bead = BEAD_PRESETS.find((item) => item.id === result.bead)?.label ?? result.bead;
  const stairs = STAIR_PRESETS.find((item) => item.id === result.stairs)?.label ?? result.stairs;
  const pattern = PATTERN_PRESETS.find((item) => item.id === result.pattern)?.label ?? result.pattern;
  const extras = [
    `${result.lengthFeet}×${result.widthFeet} ft ${shape.toLowerCase()} (${result.waterSurfaceSf.toFixed(0)} sf water)`,
    `${result.perimeterLf.toFixed(0)} lf wall; ${result.wallSf.toFixed(0)} sf wall vinyl`,
    result.hopperExtraSf ? `${result.hopperExtraSf.toFixed(0)} sf hopper extra` : 'no hopper extra this bid',
    result.stairSf ? `${result.stairSf.toFixed(0)} sf stairs (${stairs})` : 'no built-in stairs this bid',
    `${result.linerSf.toFixed(0)} sf liner / ${result.orderSf.toFixed(0)} sf ordered at ${result.wastePercent}% waste (${pattern})`,
    `${mil}; ${bead}`,
    result.replaceTrack ? `new bead track on ${result.perimeterLf.toFixed(0)} lf` : 'existing bead track',
    result.replaceCove ? 'cove replacement included' : 'existing cove',
    result.replaceWallFoam ? 'wall-foam replacement included' : 'existing wall foam',
    result.includeCover ? 'new cover included' : 'no cover this bid',
    result.pumpDown ? 'pump-down and vac included' : 'customer pumps',
    result.includePermit ? 'permit allowance included' : 'no permit allowance this bid',
  ];
  return [
    'VINYL POOL LINER BID',
    '',
    `Proposed vinyl-liner price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${shape}; ${depth}`,
    `Liner: ${mil}; ${pattern}; ${bead}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    result.pricePerWaterSf === null ? null : `Effective: ${money(result.pricePerWaterSf)} / sf of water surface`,
    result.pricePerLinerSf === null ? null : `Liner: ${money(result.pricePerLinerSf)} / sf of liner`,
    '',
    'SCOPE BASIS',
    `- ${shape}; ${depth}; ${mil}; ${pattern}`,
    `- ${result.lengthFeet}×${result.widthFeet} ft = ${result.waterSurfaceSf.toFixed(0)} sf water, ${result.linerSf.toFixed(0)} sf liner`,
    `- Setup: ${result.tripHours.toFixed(1)} h; liner: ${result.linerHours.toFixed(1)} h; stairs: ${result.stairHours.toFixed(1)} h; bead: ${result.beadHours.toFixed(1)} h; track: ${result.trackHours.toFixed(1)} h; pump: ${result.pumpHours.toFixed(1)} h`,
    `- ${extras.join('; ')}`,
    '',
    'This is a draft for review. Confirm the spans, liner square feet, mil, bead, stairs, track, extras, permit, and all pricing before sending. It is not a construction specification, a building-code opinion, a permit, a manufacturer warranty, or an engineering stamp.',
  ].filter((line) => line !== null).join('\n');
}
