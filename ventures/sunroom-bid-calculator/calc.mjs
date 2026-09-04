// Pure bid arithmetic for *building a residential sunroom / three-season
// / four-season room*, not screening a porch, not building a deck, and
// not hanging a pergola. No network, no state: every span, glass kit,
// floor, roof, wage, and extra is an input, so the result stays a
// transparent calculation the shop can check against their own invoices
// rather than a claim about what any room "should" cost, or whether any
// layout is code-compliant.
//
// The method is the one the trade actually loses money on: a flat
// "$180 / sf" special treats a 10×12 three-season on an existing deck
// (vinyl windows, existing roof, no HVAC) as the same job as a 12×16
// four-season with insulated glass, a new slab, an insulated roof, and
// a mini-split. Homeowners (and a lot of estimator sheets) count floor
// square feet. Glass does not scale with that number. Foundation, roof
// insulation, HVAC, and electrical never appear in it. Matching a
// cheaper special written for the 10×12 screen-to-sunroom conversion
// is how a sold four-season room becomes a two-week loss after the
// first wall of glass.
//
// Distinct from a screened porch (mesh panels and a knee wall), a deck
// *build* (posts, joists, railing as a walking platform), and a pergola
// (posts and an open shade layer). This prices the sunroom: glazed-wall
// square feet the coupon cannot see, the thermal floor, the insulated
// roof, HVAC, extras, and the margin that is not in the sf special.
//
// Spans, window widths, and glass rates shipped here are common
// starting points used on residential bids. They are not a
// building-code opinion, a permit, or an engineering stamp. Confirm
// the jurisdiction and a qualified professional before sending a price.

export const ATTACHMENT_PRESETS = Object.freeze([
  { id: 'attached', label: 'Attached (three glazed sides)' },
  { id: 'wrap', label: 'Wrap / freestanding (four glazed sides)' },
]);

export const ENCLOSURE_PRESETS = Object.freeze([
  { id: 'three-season', label: 'Three-season (vinyl / single-pane)' },
  { id: 'four-season', label: 'Four-season (insulated glass)' },
]);

export const FOUNDATION_PRESETS = Object.freeze([
  { id: 'existing-deck', label: 'Existing deck (insulated overlay)' },
  { id: 'existing-slab', label: 'Existing slab / patio (finish only)' },
  { id: 'new-slab', label: 'New insulated slab' },
]);

export const ROOF_PRESETS = Object.freeze([
  { id: 'existing', label: 'Existing roof (walls and floor only)' },
  { id: 'new-insulated', label: 'New insulated roof' },
]);

export const HEIGHT_PRESETS = Object.freeze([
  { id: '8', label: '8 ft walls' },
  { id: '10', label: '10 ft walls' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '10×12 three-season on existing deck, existing roof (the $180/sf special)',
    attachment: 'attached',
    enclosure: 'three-season',
    foundation: 'existing-deck',
    roof: 'existing',
    height: '8',
    widthFeet: 12,
    depthFeet: 10,
    kneeWallInches: 0,
    windowWidthInches: 48,
    sliderCount: 1,
    includeHvac: false,
    includeElectrical: false,
    includePermit: false,
  },
  {
    label: '12×16 four-season, new slab, insulated roof, HVAC and electrical',
    attachment: 'attached',
    enclosure: 'four-season',
    foundation: 'new-slab',
    roof: 'new-insulated',
    height: '8',
    widthFeet: 16,
    depthFeet: 12,
    kneeWallInches: 24,
    windowWidthInches: 48,
    sliderCount: 1,
    includeHvac: true,
    includeElectrical: true,
    includePermit: true,
  },
  {
    label: '12×16 three-season on existing patio, existing roof, 2 sliders',
    attachment: 'attached',
    enclosure: 'three-season',
    foundation: 'existing-slab',
    roof: 'existing',
    height: '8',
    widthFeet: 16,
    depthFeet: 12,
    kneeWallInches: 0,
    windowWidthInches: 48,
    sliderCount: 2,
    includeHvac: false,
    includeElectrical: true,
    includePermit: true,
  },
  {
    label: '16×20 four-season wrap, new slab, insulated roof, HVAC, 10 ft',
    attachment: 'wrap',
    enclosure: 'four-season',
    foundation: 'new-slab',
    roof: 'new-insulated',
    height: '10',
    widthFeet: 20,
    depthFeet: 16,
    kneeWallInches: 24,
    windowWidthInches: 48,
    sliderCount: 2,
    includeHvac: true,
    includeElectrical: true,
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
 * Glazed-wall lineal feet. An attached sunroom glazes three sides
 * (the house is the fourth). A wrap glazes four. The "$180 / sf"
 * special never sees this number.
 */
export function suggestedPerimeter(widthFeet, depthFeet, attachment) {
  const width = number(widthFeet, 'Width (feet)', { allowZero: false });
  const depth = number(depthFeet, 'Depth (feet)', { allowZero: false });
  const id = String(attachment);
  if (id !== 'attached' && id !== 'wrap') throw new Error('Unknown attachment');
  return id === 'attached' ? width + 2 * depth : 2 * (width + depth);
}

/**
 * Glass height after the knee wall is subtracted. A 24-inch knee wall
 * on 8-foot walls leaves 6 feet of glass — not 8, and not the floor
 * square feet the coupon counted.
 */
export function suggestedGlassHeightFeet(wallHeightFeet, kneeWallInches) {
  const wall = number(wallHeightFeet, 'Wall height (feet)', { allowZero: false });
  const knee = number(kneeWallInches, 'Knee-wall height (inches)');
  return Math.max(0, wall - knee / 12);
}

/**
 * Glazed-wall square feet the coupon cannot see. A 10×12 attached
 * sunroom at 8 feet with no knee wall is 32 lf × 8 ft = 256 sf of
 * glass on a 120 sf floor.
 */
export function suggestedGlassSf(widthFeet, depthFeet, attachment, wallHeightFeet, kneeWallInches) {
  const perimeter = suggestedPerimeter(widthFeet, depthFeet, attachment);
  const glassHeight = suggestedGlassHeightFeet(wallHeightFeet, kneeWallInches);
  return perimeter * glassHeight;
}

/**
 * Knee-wall lineal feet. Zero when the shop is running full-height
 * glass. Otherwise the same perimeter the windows sit on.
 */
export function suggestedKneeWallLf(widthFeet, depthFeet, attachment, kneeWallInches) {
  const knee = number(kneeWallInches, 'Knee-wall height (inches)');
  if (knee === 0) return 0;
  return suggestedPerimeter(widthFeet, depthFeet, attachment);
}

/**
 * Window units along the perimeter. A 32-foot attached sunroom at
 * 48-inch centers is 8 windows, not "120 square feet."
 */
export function suggestedWindowCount(perimeterFeet, windowWidthInches) {
  const perimeter = number(perimeterFeet, 'Perimeter (feet)', { allowZero: false });
  const width = number(windowWidthInches, 'Window width (inches)', { allowZero: false });
  return Math.max(1, Math.ceil(perimeter / (width / 12)));
}

/**
 * Floor square feet this bid actually builds. Existing slab is a
 * finish pass on the footprint. Existing deck is an insulated overlay.
 * New slab is the whole pour.
 */
export function suggestedFloorSf(widthFeet, depthFeet, foundation) {
  const width = number(widthFeet, 'Width (feet)', { allowZero: false });
  const depth = number(depthFeet, 'Depth (feet)', { allowZero: false });
  const id = String(foundation);
  if (id !== 'existing-deck' && id !== 'existing-slab' && id !== 'new-slab') {
    throw new Error('Unknown foundation');
  }
  return width * depth;
}

/**
 * Roof square feet that this bid actually builds. Existing roof is
 * zero — the coupon already assumed that. A new insulated roof covers
 * the whole footprint.
 */
export function suggestedRoofSf(widthFeet, depthFeet, roof) {
  const width = number(widthFeet, 'Width (feet)', { allowZero: false });
  const depth = number(depthFeet, 'Depth (feet)', { allowZero: false });
  const id = String(roof);
  if (id !== 'existing' && id !== 'new-insulated') throw new Error('Unknown roof');
  return id === 'existing' ? 0 : width * depth;
}

/**
 * Starting hours-per-100-sf and material-per-sf for the glass kit.
 * Picking an enclosure never overwrites a cost the shop has already typed.
 */
export function suggestedEnclosureKit(enclosure) {
  const id = String(enclosure);
  if (id === 'three-season') return { hoursPer100Sf: 1.8, glassPerSf: 14 };
  if (id === 'four-season') return { hoursPer100Sf: 3.4, glassPerSf: 42 };
  throw new Error('Unknown enclosure');
}

/**
 * Starting hours-per-100-sf and material-per-sf for the floor.
 */
export function suggestedFoundationKit(foundation) {
  const id = String(foundation);
  if (id === 'existing-deck') return { hoursPer100Sf: 1.4, floorPerSf: 6 };
  if (id === 'existing-slab') return { hoursPer100Sf: 0.6, floorPerSf: 3 };
  if (id === 'new-slab') return { hoursPer100Sf: 4.2, floorPerSf: 14 };
  throw new Error('Unknown foundation');
}

/**
 * Starting hours-per-100-sf and material-per-sf for the roof.
 */
export function suggestedRoofKit(roof) {
  const id = String(roof);
  if (id === 'existing') return { hoursPer100Sf: 0, roofPerSf: 0 };
  if (id === 'new-insulated') return { hoursPer100Sf: 3.8, roofPerSf: 16 };
  throw new Error('Unknown roof');
}

/**
 * Extra hours per window for 10-foot walls. Taller glass is not
 * "the same job plus two feet" — it is a lift, a second pair of
 * hands, and a heavier unit.
 */
export function suggestedHeightKit(height) {
  const id = String(height);
  if (id === '8') return { wallHeightFeet: 8, extraHoursPerWindow: 0 };
  if (id === '10') return { wallHeightFeet: 10, extraHoursPerWindow: 0.25 };
  throw new Error('Unknown height');
}

/**
 * Price a sunroom / three-season / four-season job from the floor the
 * coupon sees and the glass, floor, roof, and HVAC it cannot see.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const widthFeet = number(input.widthFeet ?? 0, 'Width (feet)', { allowZero: false });
  const depthFeet = number(input.depthFeet ?? 0, 'Depth (feet)', { allowZero: false });
  const wallHeightFeet = number(input.wallHeightFeet ?? 0, 'Wall height (feet)', { allowZero: false });
  const kneeWallInches = number(input.kneeWallInches ?? 0, 'Knee-wall height (inches)');
  const windowWidthInches = number(input.windowWidthInches ?? 0, 'Window width (inches)', { allowZero: false });

  const attachment = String(input.attachment ?? 'attached');
  if (!ATTACHMENT_PRESETS.some((item) => item.id === attachment)) {
    throw new Error('Unknown attachment');
  }
  const enclosure = String(input.enclosure ?? 'three-season');
  if (!ENCLOSURE_PRESETS.some((item) => item.id === enclosure)) {
    throw new Error('Unknown enclosure');
  }
  const foundation = String(input.foundation ?? 'existing-deck');
  if (!FOUNDATION_PRESETS.some((item) => item.id === foundation)) {
    throw new Error('Unknown foundation');
  }
  const roof = String(input.roof ?? 'existing');
  if (!ROOF_PRESETS.some((item) => item.id === roof)) {
    throw new Error('Unknown roof');
  }
  const height = String(input.height ?? '8');
  if (!HEIGHT_PRESETS.some((item) => item.id === height)) {
    throw new Error('Unknown height');
  }

  const includeHvac = flag(input.includeHvac);
  const includeElectrical = flag(input.includeElectrical);
  const includePermit = flag(input.includePermit);

  const footprintSf = widthFeet * depthFeet;
  const perimeterLf = number(input.perimeterLf ?? 0, 'Perimeter (feet)');
  const glassSf = number(input.glassSf ?? 0, 'Glass square feet');
  const floorSf = number(input.floorSf ?? 0, 'Floor square feet');
  const roofSf = number(input.roofSf ?? 0, 'Roof square feet');
  const kneeWallLf = number(input.kneeWallLf ?? 0, 'Knee-wall lineal feet');
  const windowCount = number(input.windowCount ?? 0, 'Window count');
  const sliderCount = number(input.sliderCount ?? 0, 'Slider count');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursPerWindow = number(input.hoursPerWindow ?? 0, 'Hours per window');
  const extraHoursPerWindow = number(input.extraHoursPerWindow ?? 0, 'Extra hours per window for height');
  const hoursPer100SfGlass = number(input.hoursPer100SfGlass ?? 0, 'Hours per 100 sf of glass');
  const hoursPerKneeLf = number(input.hoursPerKneeLf ?? 0, 'Hours per lineal foot of knee wall');
  const hoursPer100SfFloor = number(input.hoursPer100SfFloor ?? 0, 'Hours per 100 sf of floor');
  const hoursPer100SfRoof = number(input.hoursPer100SfRoof ?? 0, 'Hours per 100 sf of roof');
  const hoursPerSlider = number(input.hoursPerSlider ?? 0, 'Hours per slider');
  const hoursHvac = number(input.hoursHvac ?? 0, 'Hours for HVAC');
  const hoursElectrical = number(input.hoursElectrical ?? 0, 'Hours for electrical');
  const hoursSite = number(input.hoursSite ?? 0, 'Site / grade hours');
  const siteHours = number(input.siteHours ?? 0, 'Travel / site hours');

  const glassPerSf = number(input.glassPerSf ?? 0, 'Glass per sf');
  const windowEach = number(input.windowEach ?? 0, 'Cost per window unit');
  const kneeWallPerLf = number(input.kneeWallPerLf ?? 0, 'Knee wall per lineal foot');
  const floorPerSf = number(input.floorPerSf ?? 0, 'Floor per sf');
  const roofPerSf = number(input.roofPerSf ?? 0, 'Roof per sf');
  const sliderEach = number(input.sliderEach ?? 0, 'Cost per slider');
  const hardwareLump = number(input.hardwareLump ?? 0, 'Hardware / fasteners');
  const hvacFee = number(input.hvacFee ?? 0, 'HVAC / mini-split fee');
  const electricalFee = number(input.electricalFee ?? 0, 'Electrical package');
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
  const windowHours = windowCount * (hoursPerWindow + extraHoursPerWindow);
  const glassHours = glassSf * hoursPer100SfGlass / 100;
  const kneeHours = kneeWallLf * hoursPerKneeLf;
  const floorHours = floorSf * hoursPer100SfFloor / 100;
  const roofHours = roofSf * hoursPer100SfRoof / 100;
  const sliderHours = sliderCount * hoursPerSlider;
  const hvacHours = includeHvac ? hoursHvac : 0;
  const electricalHours = includeElectrical ? hoursElectrical : 0;
  const gradeHours = hoursSite;
  const travelHours = siteHours;
  const totalHours = tripHours + windowHours + glassHours + kneeHours + floorHours
    + roofHours + sliderHours + hvacHours + electricalHours + gradeHours + travelHours;

  const laborCost = totalHours * loadedWage;
  const glassMaterial = glassSf * glassPerSf;
  const windowMaterial = windowCount * windowEach;
  const kneeMaterial = kneeWallLf * kneeWallPerLf;
  const floorMaterial = floorSf * floorPerSf;
  const roofMaterial = roofSf * roofPerSf;
  const sliderMaterial = sliderCount * sliderEach;
  const materialCost = glassMaterial + windowMaterial + kneeMaterial + floorMaterial
    + roofMaterial + sliderMaterial + hardwareLump;
  const hvacMaterial = includeHvac ? hvacFee : 0;
  const electricalMaterial = includeElectrical ? electricalFee : 0;
  const mobilizationMaterial = mobilizationFee;
  const permitMaterial = includePermit ? permitFee : 0;
  const softCost = travelAndEquipment + mobilizationMaterial + permitMaterial
    + hvacMaterial + electricalMaterial;
  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);
  const hourShare = (amount) => (totalHours === 0 ? 0 : amount / totalHours * 100);
  const glassDirect = glassHours * loadedWage + glassMaterial + windowHours * loadedWage + windowMaterial;
  const envelopeDirect = glassDirect + kneeHours * loadedWage + kneeMaterial
    + floorHours * loadedWage + floorMaterial + roofHours * loadedWage + roofMaterial;

  return {
    attachment,
    enclosure,
    foundation,
    roof,
    height,
    widthFeet,
    depthFeet,
    wallHeightFeet,
    kneeWallInches,
    windowWidthInches,
    footprintSf,
    perimeterLf,
    glassSf,
    floorSf,
    roofSf,
    kneeWallLf,
    windowCount,
    sliderCount,
    includeHvac,
    includeElectrical,
    includePermit,
    loadedWage,
    tripHours,
    windowHours,
    glassHours,
    kneeHours,
    floorHours,
    roofHours,
    sliderHours,
    hvacHours,
    electricalHours,
    gradeHours,
    travelHours,
    totalHours,
    laborCost,
    glassMaterial,
    windowMaterial,
    kneeMaterial,
    floorMaterial,
    roofMaterial,
    sliderMaterial,
    hardwareLump,
    hvacMaterial,
    electricalMaterial,
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
    pricePerSf: footprintSf === 0 ? null : price / footprintSf,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    glassShareOfDirect: directCost === 0 ? 0 : glassDirect / directCost * 100,
    envelopeShareOfDirect: directCost === 0 ? 0 : envelopeDirect / directCost * 100,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(tripHours),
      windows: hourShare(windowHours),
      glass: hourShare(glassHours),
      knee: hourShare(kneeHours),
      floor: hourShare(floorHours),
      roof: hourShare(roofHours),
      sliders: hourShare(sliderHours),
      hvac: hourShare(hvacHours),
      electrical: hourShare(electricalHours),
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
export function formatBidSummary(result, jobLabel = 'Sunroom / three-season room') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const attachment = ATTACHMENT_PRESETS.find((item) => item.id === result.attachment)?.label ?? result.attachment;
  const enclosure = ENCLOSURE_PRESETS.find((item) => item.id === result.enclosure)?.label ?? result.enclosure;
  const foundation = FOUNDATION_PRESETS.find((item) => item.id === result.foundation)?.label ?? result.foundation;
  const roof = ROOF_PRESETS.find((item) => item.id === result.roof)?.label ?? result.roof;
  const height = HEIGHT_PRESETS.find((item) => item.id === result.height)?.label ?? result.height;
  const extras = [
    `${result.widthFeet}×${result.depthFeet} ft floor (${result.footprintSf.toFixed(0)} sf)`,
    `${result.perimeterLf.toFixed(0)} lf glazed wall; ${result.windowCount} window units`,
    `${result.glassSf.toFixed(0)} sf glass (${enclosure})`,
    result.kneeWallLf ? `${result.kneeWallLf.toFixed(0)} lf knee wall at ${result.kneeWallInches} in` : 'no knee wall this bid',
    `${result.floorSf.toFixed(0)} sf floor (${foundation})`,
    result.roofSf ? `${result.roofSf.toFixed(0)} sf roof (${roof})` : 'existing roof — walls and floor only',
    `${result.sliderCount} slider${result.sliderCount === 1 ? '' : 's'}`,
    result.includeHvac ? 'HVAC / mini-split included' : 'no HVAC this bid',
    result.includeElectrical ? 'electrical package included' : 'no electrical package this bid',
    result.includePermit ? 'permit allowance included' : 'no permit allowance this bid',
  ];
  return [
    'SUNROOM / THREE-SEASON / FOUR-SEASON BID',
    '',
    `Proposed sunroom price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${attachment}; ${height}`,
    `Enclosure: ${enclosure}; foundation: ${foundation}; roof: ${roof}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    result.pricePerSf === null ? null : `Effective: ${money(result.pricePerSf)} / sf of floor`,
    '',
    'SCOPE BASIS',
    `- ${attachment}; ${height}; ${enclosure}`,
    `- ${result.widthFeet}×${result.depthFeet} ft = ${result.footprintSf.toFixed(0)} sf floor, ${result.glassSf.toFixed(0)} sf glass`,
    `- Setup: ${result.tripHours.toFixed(1)} h; windows: ${result.windowHours.toFixed(1)} h; glass: ${result.glassHours.toFixed(1)} h; knee wall: ${result.kneeHours.toFixed(1)} h; floor: ${result.floorHours.toFixed(1)} h; roof: ${result.roofHours.toFixed(1)} h; sliders: ${result.sliderHours.toFixed(1)} h`,
    `- ${extras.join('; ')}`,
    '',
    'This is a draft for review. Confirm the spans, glass, floor, roof, HVAC, electrical, extras, permit, and all pricing before sending. It is not a construction specification, a building-code opinion, a permit, or an engineering stamp.',
  ].filter((line) => line !== null).join('\n');
}
