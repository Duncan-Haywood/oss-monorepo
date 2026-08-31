// Pure bid arithmetic for *screening a residential porch / lanai*, not
// building a deck, not building a pergola, and not hanging a fence. No
// network, no state: every span, knee wall, roof, mesh, wage, and extra
// is an input, so the result stays a transparent calculation the shop
// can check against their own invoices rather than a claim about what
// any porch "should" cost, or whether any layout is code-compliant.
//
// The method is the one the trade actually loses money on: a flat
// "$55 / sf" special treats a 10×12 screen-in under an existing roof
// (no knee wall, fiberglass, one door) as the same job as a 12×16 with
// a 36-inch knee wall, a new shed roof, beadboard, and pet mesh.
// Homeowners (and a lot of estimator sheets) count floor square feet.
// Screen does not scale with that number. Knee wall, roof, ceiling,
// doors, and mesh never appear in it. Matching a cheaper special
// written for the 10×12 screen-in is how a sold 12×16 enclosed porch
// becomes a two-day loss after the first wall of panels.
//
// Distinct from a deck *build* (posts, joists, railing as a walking
// platform), a pergola / patio cover (posts and an open shade layer),
// and a fence (posts and gates as a barrier). This prices the screened
// porch: wall-screen square feet the coupon cannot see, knee wall,
// roof, ceiling, extras, and the margin that is not in the sf special.
//
// Spans, panel widths, and mesh rates shipped here are common starting
// points used on residential bids. They are not a building-code opinion,
// a permit, or an engineering stamp. Confirm the jurisdiction and a
// qualified professional before sending a price.

export const ATTACHMENT_PRESETS = Object.freeze([
  { id: 'attached', label: 'Attached (three screened sides)' },
  { id: 'freestanding', label: 'Freestanding / wrap (four screened sides)' },
]);

export const ROOF_PRESETS = Object.freeze([
  { id: 'existing', label: 'Existing roof (screen the walls only)' },
  { id: 'framed', label: 'New framed roof (shingle / metal)' },
  { id: 'screen-roof', label: 'Screen roof (lanai / pool-cage style)' },
]);

export const CEILING_PRESETS = Object.freeze([
  { id: 'none', label: 'No ceiling (open joists / existing)' },
  { id: 'vinyl', label: 'Vinyl porch ceiling' },
  { id: 'beadboard', label: 'Beadboard / wood ceiling' },
]);

export const MESH_PRESETS = Object.freeze([
  { id: 'fiberglass', label: 'Standard fiberglass screen' },
  { id: 'pet', label: 'Pet-resistant mesh' },
  { id: 'hurricane', label: 'Hurricane / solar mesh' },
]);

export const HEIGHT_PRESETS = Object.freeze([
  { id: '8', label: '8 ft walls' },
  { id: '10', label: '10 ft walls' },
  { id: '12', label: '12 ft walls' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '10×12 attached, existing roof, no knee wall (the $55/sf special)',
    attachment: 'attached',
    roof: 'existing',
    ceiling: 'none',
    mesh: 'fiberglass',
    height: '8',
    widthFeet: 12,
    depthFeet: 10,
    kneeWallInches: 0,
    panelWidthInches: 36,
    doorCount: 1,
    includeFan: false,
    includePermit: false,
    demoExisting: false,
  },
  {
    label: '12×16 attached, 36-in knee wall, new framed roof, beadboard',
    attachment: 'attached',
    roof: 'framed',
    ceiling: 'beadboard',
    mesh: 'fiberglass',
    height: '8',
    widthFeet: 16,
    depthFeet: 12,
    kneeWallInches: 36,
    panelWidthInches: 36,
    doorCount: 1,
    includeFan: true,
    includePermit: true,
    demoExisting: false,
  },
  {
    label: '12×16 attached, full-height pet screen, existing roof, 2 doors',
    attachment: 'attached',
    roof: 'existing',
    ceiling: 'none',
    mesh: 'pet',
    height: '8',
    widthFeet: 16,
    depthFeet: 12,
    kneeWallInches: 0,
    panelWidthInches: 36,
    doorCount: 2,
    includeFan: false,
    includePermit: true,
    demoExisting: true,
  },
  {
    label: '16×32 lanai wrap, screen roof, hurricane mesh, 10 ft',
    attachment: 'freestanding',
    roof: 'screen-roof',
    ceiling: 'none',
    mesh: 'hurricane',
    height: '10',
    widthFeet: 32,
    depthFeet: 16,
    kneeWallInches: 24,
    panelWidthInches: 48,
    doorCount: 2,
    includeFan: false,
    includePermit: true,
    demoExisting: false,
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
 * Screenable wall lineal feet. An attached porch screens three sides
 * (the house is the fourth). A wrap / freestanding lanai screens four.
 * The "$55 / sf" special never sees this number.
 */
export function suggestedPerimeter(widthFeet, depthFeet, attachment) {
  const width = number(widthFeet, 'Width (feet)', { allowZero: false });
  const depth = number(depthFeet, 'Depth (feet)', { allowZero: false });
  const id = String(attachment);
  if (id !== 'attached' && id !== 'freestanding') throw new Error('Unknown attachment');
  return id === 'attached' ? width + 2 * depth : 2 * (width + depth);
}

/**
 * Screen height on the walls after the knee wall is subtracted. A
 * 36-inch knee wall on 8-foot walls leaves 5 feet of screen — not 8,
 * and not the floor square feet the coupon counted.
 */
export function suggestedScreenHeightFeet(wallHeightFeet, kneeWallInches) {
  const wall = number(wallHeightFeet, 'Wall height (feet)', { allowZero: false });
  const knee = number(kneeWallInches, 'Knee-wall height (inches)');
  return Math.max(0, wall - knee / 12);
}

/**
 * Wall-screen square feet the coupon cannot see. A 10×12 attached
 * porch at 8 feet with no knee wall is 32 lf × 8 ft = 256 sf of
 * screen on a 120 sf floor.
 */
export function suggestedWallScreenSf(widthFeet, depthFeet, attachment, wallHeightFeet, kneeWallInches) {
  const perimeter = suggestedPerimeter(widthFeet, depthFeet, attachment);
  const screenHeight = suggestedScreenHeightFeet(wallHeightFeet, kneeWallInches);
  return perimeter * screenHeight;
}

/**
 * Knee-wall lineal feet. Zero when the shop is running full-height
 * screen. Otherwise the same perimeter the panels hang on.
 */
export function suggestedKneeWallLf(widthFeet, depthFeet, attachment, kneeWallInches) {
  const knee = number(kneeWallInches, 'Knee-wall height (inches)');
  if (knee === 0) return 0;
  return suggestedPerimeter(widthFeet, depthFeet, attachment);
}

/**
 * Screen panels along the perimeter. A 32-foot attached porch at
 * 36-inch centers is 11 panels, not "120 square feet."
 */
export function suggestedPanelCount(perimeterFeet, panelWidthInches) {
  const perimeter = number(perimeterFeet, 'Perimeter (feet)', { allowZero: false });
  const width = number(panelWidthInches, 'Panel width (inches)', { allowZero: false });
  return Math.max(1, Math.ceil(perimeter / (width / 12)));
}

/**
 * Roof square feet that this bid actually builds. Existing roof is
 * zero — the coupon already assumed that. Framed and screen-roof
 * cover the whole footprint.
 */
export function suggestedRoofSf(widthFeet, depthFeet, roof) {
  const width = number(widthFeet, 'Width (feet)', { allowZero: false });
  const depth = number(depthFeet, 'Depth (feet)', { allowZero: false });
  const id = String(roof);
  if (id !== 'existing' && id !== 'framed' && id !== 'screen-roof') throw new Error('Unknown roof');
  return id === 'existing' ? 0 : width * depth;
}

/**
 * Ceiling square feet. None is zero. Vinyl and beadboard cover the
 * footprint the coupon already counted as "done."
 */
export function suggestedCeilingSf(widthFeet, depthFeet, ceiling) {
  const width = number(widthFeet, 'Width (feet)', { allowZero: false });
  const depth = number(depthFeet, 'Depth (feet)', { allowZero: false });
  const id = String(ceiling);
  if (id !== 'none' && id !== 'vinyl' && id !== 'beadboard') throw new Error('Unknown ceiling');
  return id === 'none' ? 0 : width * depth;
}

/**
 * Starting hours-per-100-sf and material-per-sf for the mesh. Picking
 * a mesh never overwrites a cost the shop has already typed.
 */
export function suggestedMeshKit(mesh) {
  const id = String(mesh);
  if (id === 'fiberglass') return { hoursPer100Sf: 1.1, screenPerSf: 1.35 };
  if (id === 'pet') return { hoursPer100Sf: 1.5, screenPerSf: 2.4 };
  if (id === 'hurricane') return { hoursPer100Sf: 2.1, screenPerSf: 4.75 };
  throw new Error('Unknown mesh');
}

/**
 * Starting hours-per-100-sf and material-per-sf for the roof. Existing
 * roof is zero: the walls are the job.
 */
export function suggestedRoofKit(roof) {
  const id = String(roof);
  if (id === 'existing') return { hoursPer100Sf: 0, roofPerSf: 0 };
  if (id === 'framed') return { hoursPer100Sf: 3.4, roofPerSf: 12 };
  if (id === 'screen-roof') return { hoursPer100Sf: 2.2, roofPerSf: 6.5 };
  throw new Error('Unknown roof');
}

/**
 * Starting hours-per-100-sf and material-per-sf for the ceiling.
 */
export function suggestedCeilingKit(ceiling) {
  const id = String(ceiling);
  if (id === 'none') return { hoursPer100Sf: 0, ceilingPerSf: 0 };
  if (id === 'vinyl') return { hoursPer100Sf: 1.6, ceilingPerSf: 4.25 };
  if (id === 'beadboard') return { hoursPer100Sf: 2.4, ceilingPerSf: 7.5 };
  throw new Error('Unknown ceiling');
}

/**
 * Extra hours per panel for 10- and 12-foot walls. Taller screen is
 * not "the same job plus two feet" — it is a ladder, a second pair of
 * hands, and a heavier frame.
 */
export function suggestedHeightKit(height) {
  const id = String(height);
  if (id === '8') return { wallHeightFeet: 8, extraHoursPerPanel: 0 };
  if (id === '10') return { wallHeightFeet: 10, extraHoursPerPanel: 0.2 };
  if (id === '12') return { wallHeightFeet: 12, extraHoursPerPanel: 0.4 };
  throw new Error('Unknown height');
}

/**
 * Price a screened-porch / lanai job from the floor the coupon sees
 * and the screen, knee wall, roof, and ceiling it cannot see.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const widthFeet = number(input.widthFeet ?? 0, 'Width (feet)', { allowZero: false });
  const depthFeet = number(input.depthFeet ?? 0, 'Depth (feet)', { allowZero: false });
  const wallHeightFeet = number(input.wallHeightFeet ?? 0, 'Wall height (feet)', { allowZero: false });
  const kneeWallInches = number(input.kneeWallInches ?? 0, 'Knee-wall height (inches)');
  const panelWidthInches = number(input.panelWidthInches ?? 0, 'Panel width (inches)', { allowZero: false });

  const attachment = String(input.attachment ?? 'attached');
  if (!ATTACHMENT_PRESETS.some((item) => item.id === attachment)) {
    throw new Error('Unknown attachment');
  }
  const roof = String(input.roof ?? 'existing');
  if (!ROOF_PRESETS.some((item) => item.id === roof)) {
    throw new Error('Unknown roof');
  }
  const ceiling = String(input.ceiling ?? 'none');
  if (!CEILING_PRESETS.some((item) => item.id === ceiling)) {
    throw new Error('Unknown ceiling');
  }
  const mesh = String(input.mesh ?? 'fiberglass');
  if (!MESH_PRESETS.some((item) => item.id === mesh)) {
    throw new Error('Unknown mesh');
  }
  const height = String(input.height ?? '8');
  if (!HEIGHT_PRESETS.some((item) => item.id === height)) {
    throw new Error('Unknown height');
  }

  const includeFan = flag(input.includeFan);
  const includePermit = flag(input.includePermit);
  const demoExisting = flag(input.demoExisting);

  const footprintSf = widthFeet * depthFeet;
  const perimeterLf = number(input.perimeterLf ?? 0, 'Perimeter (feet)');
  const wallScreenSf = number(input.wallScreenSf ?? 0, 'Wall-screen square feet');
  const roofSf = number(input.roofSf ?? 0, 'Roof square feet');
  const ceilingSf = number(input.ceilingSf ?? 0, 'Ceiling square feet');
  const kneeWallLf = number(input.kneeWallLf ?? 0, 'Knee-wall lineal feet');
  const panelCount = number(input.panelCount ?? 0, 'Panel count');
  const doorCount = number(input.doorCount ?? 0, 'Door count');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursPerPanel = number(input.hoursPerPanel ?? 0, 'Hours per panel');
  const extraHoursPerPanel = number(input.extraHoursPerPanel ?? 0, 'Extra hours per panel for height');
  const hoursPer100SfScreen = number(input.hoursPer100SfScreen ?? 0, 'Hours per 100 sf of screen');
  const hoursPerKneeLf = number(input.hoursPerKneeLf ?? 0, 'Hours per lineal foot of knee wall');
  const hoursPer100SfRoof = number(input.hoursPer100SfRoof ?? 0, 'Hours per 100 sf of roof');
  const hoursPer100SfCeiling = number(input.hoursPer100SfCeiling ?? 0, 'Hours per 100 sf of ceiling');
  const hoursPerDoor = number(input.hoursPerDoor ?? 0, 'Hours per door');
  const hoursFan = number(input.hoursFan ?? 0, 'Hours for the fan');
  const hoursDemo = number(input.hoursDemo ?? 0, 'Hours to demo existing screen');
  const hoursSite = number(input.hoursSite ?? 0, 'Site / grade hours');
  const siteHours = number(input.siteHours ?? 0, 'Travel / site hours');

  const screenPerSf = number(input.screenPerSf ?? 0, 'Screen per sf');
  const panelEach = number(input.panelEach ?? 0, 'Cost per panel frame');
  const kneeWallPerLf = number(input.kneeWallPerLf ?? 0, 'Knee wall per lineal foot');
  const roofPerSf = number(input.roofPerSf ?? 0, 'Roof per sf');
  const ceilingPerSf = number(input.ceilingPerSf ?? 0, 'Ceiling per sf');
  const doorEach = number(input.doorEach ?? 0, 'Cost per door');
  const hardwareLump = number(input.hardwareLump ?? 0, 'Hardware / fasteners');
  const fanFee = number(input.fanFee ?? 0, 'Fan / light fee');
  const demoFee = number(input.demoFee ?? 0, 'Demo fee');
  const mobilizationFee = number(input.mobilizationFee ?? 0, 'Mobilization');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const roofScreenSf = roof === 'screen-roof' ? roofSf : 0;
  const framedRoofSf = roof === 'framed' ? roofSf : 0;
  const totalScreenSf = wallScreenSf + roofScreenSf;

  const tripHours = hoursTrip;
  const panelHours = panelCount * (hoursPerPanel + extraHoursPerPanel);
  const screenHours = totalScreenSf * hoursPer100SfScreen / 100;
  const kneeHours = kneeWallLf * hoursPerKneeLf;
  const roofHours = roofSf * hoursPer100SfRoof / 100;
  const ceilingHours = ceilingSf * hoursPer100SfCeiling / 100;
  const doorHours = doorCount * hoursPerDoor;
  const fanHours = includeFan ? hoursFan : 0;
  const demoHours = demoExisting ? hoursDemo : 0;
  const gradeHours = hoursSite;
  const travelHours = siteHours;
  const totalHours = tripHours + panelHours + screenHours + kneeHours + roofHours
    + ceilingHours + doorHours + fanHours + demoHours + gradeHours + travelHours;

  const laborCost = totalHours * loadedWage;
  const screenMaterial = totalScreenSf * screenPerSf;
  const panelMaterial = panelCount * panelEach;
  const kneeMaterial = kneeWallLf * kneeWallPerLf;
  const roofMaterial = roofSf * roofPerSf;
  const ceilingMaterial = ceilingSf * ceilingPerSf;
  const doorMaterial = doorCount * doorEach;
  const demoMaterial = demoExisting ? demoFee : 0;
  const fanMaterial = includeFan ? fanFee : 0;
  const materialCost = screenMaterial + panelMaterial + kneeMaterial + roofMaterial
    + ceilingMaterial + doorMaterial + hardwareLump + demoMaterial;
  const mobilizationMaterial = mobilizationFee;
  const permitMaterial = includePermit ? permitFee : 0;
  const softCost = travelAndEquipment + mobilizationMaterial + permitMaterial + fanMaterial;
  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);
  const hourShare = (amount) => (totalHours === 0 ? 0 : amount / totalHours * 100);
  const screenDirect = screenHours * loadedWage + screenMaterial + panelHours * loadedWage + panelMaterial;
  const enclosureDirect = screenDirect + kneeHours * loadedWage + kneeMaterial
    + roofHours * loadedWage + roofMaterial + ceilingHours * loadedWage + ceilingMaterial;

  return {
    attachment,
    roof,
    ceiling,
    mesh,
    height,
    widthFeet,
    depthFeet,
    wallHeightFeet,
    kneeWallInches,
    panelWidthInches,
    footprintSf,
    perimeterLf,
    wallScreenSf,
    roofSf,
    roofScreenSf,
    framedRoofSf,
    ceilingSf,
    kneeWallLf,
    panelCount,
    doorCount,
    totalScreenSf,
    includeFan,
    includePermit,
    demoExisting,
    loadedWage,
    tripHours,
    panelHours,
    screenHours,
    kneeHours,
    roofHours,
    ceilingHours,
    doorHours,
    fanHours,
    demoHours,
    gradeHours,
    travelHours,
    totalHours,
    laborCost,
    screenMaterial,
    panelMaterial,
    kneeMaterial,
    roofMaterial,
    ceilingMaterial,
    doorMaterial,
    hardwareLump,
    demoMaterial,
    fanMaterial,
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
    screenShareOfDirect: directCost === 0 ? 0 : screenDirect / directCost * 100,
    enclosureShareOfDirect: directCost === 0 ? 0 : enclosureDirect / directCost * 100,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(tripHours),
      panels: hourShare(panelHours),
      screen: hourShare(screenHours),
      knee: hourShare(kneeHours),
      roof: hourShare(roofHours),
      ceiling: hourShare(ceilingHours),
      doors: hourShare(doorHours),
      fan: hourShare(fanHours),
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
export function formatBidSummary(result, jobLabel = 'Screened porch / lanai') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const attachment = ATTACHMENT_PRESETS.find((item) => item.id === result.attachment)?.label ?? result.attachment;
  const roof = ROOF_PRESETS.find((item) => item.id === result.roof)?.label ?? result.roof;
  const ceiling = CEILING_PRESETS.find((item) => item.id === result.ceiling)?.label ?? result.ceiling;
  const mesh = MESH_PRESETS.find((item) => item.id === result.mesh)?.label ?? result.mesh;
  const height = HEIGHT_PRESETS.find((item) => item.id === result.height)?.label ?? result.height;
  const extras = [
    `${result.widthFeet}×${result.depthFeet} ft floor (${result.footprintSf.toFixed(0)} sf)`,
    `${result.perimeterLf.toFixed(0)} lf screenable wall; ${result.panelCount} panels`,
    `${result.wallScreenSf.toFixed(0)} sf wall screen (${mesh})`,
    result.kneeWallLf ? `${result.kneeWallLf.toFixed(0)} lf knee wall at ${result.kneeWallInches} in` : 'no knee wall this bid',
    result.roofSf ? `${result.roofSf.toFixed(0)} sf roof (${roof})` : 'existing roof — walls only',
    result.ceilingSf ? `${result.ceilingSf.toFixed(0)} sf ceiling (${ceiling})` : 'no ceiling this bid',
    `${result.doorCount} screen door${result.doorCount === 1 ? '' : 's'}`,
    result.includeFan ? 'ceiling fan / light included' : 'no fan this bid',
    result.demoExisting ? 'existing-screen demo included' : 'no demo this bid',
    result.includePermit ? 'permit allowance included' : 'no permit allowance this bid',
  ];
  return [
    'SCREENED PORCH / LANAI BID',
    '',
    `Proposed screened-porch price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${attachment}; ${height}`,
    `Roof: ${roof}; ceiling: ${ceiling}; mesh: ${mesh}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    result.pricePerSf === null ? null : `Effective: ${money(result.pricePerSf)} / sf of floor`,
    '',
    'SCOPE BASIS',
    `- ${attachment}; ${height}; ${mesh}`,
    `- ${result.widthFeet}×${result.depthFeet} ft = ${result.footprintSf.toFixed(0)} sf floor, ${result.wallScreenSf.toFixed(0)} sf wall screen`,
    `- Setup: ${result.tripHours.toFixed(1)} h; panels: ${result.panelHours.toFixed(1)} h; mesh: ${result.screenHours.toFixed(1)} h; knee wall: ${result.kneeHours.toFixed(1)} h; roof: ${result.roofHours.toFixed(1)} h; ceiling: ${result.ceilingHours.toFixed(1)} h; doors: ${result.doorHours.toFixed(1)} h`,
    `- ${extras.join('; ')}`,
    '',
    'This is a draft for review. Confirm the spans, panels, knee wall, roof, ceiling, mesh, extras, permit, and all pricing before sending. It is not a construction specification, a building-code opinion, a permit, or an engineering stamp.',
  ].filter((line) => line !== null).join('\n');
}
