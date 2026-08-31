// Pure bid arithmetic for pole-barn / post-frame building installation.
// No network, no state: every bay, eave foot, door, wage, and lumber
// invoice is an input, so the result stays a transparent calculation
// the post-frame shop can check against their own tickets rather than
// a claim about what any barn "should" cost.
//
// The method is the one the trade actually loses money on: a published
// "$45 a square foot" or "$28,000 for a 30×40" Facebook special treats
// a 10-foot ag shell on gravel with two walk doors as the same job as a
// 40×60×16 shop with two overhead doors, a lean-to, a 6-inch slab, and
// a shop panel. Homeowners (and a lot of estimator sheets) count the
// same kind of number. Extra eave height, overhead doors, a slab, and
// a lean-to do not scale with that per-foot dump. Matching a cheap ag
// special on a shop-and-slab job is how a sold barn becomes a two-week
// loss after the first concrete ticket.
//
// Distinct from *fence* (posts and gates as a barrier), *deck build*
// (posts and joists as a platform), *pergola* (posts and an open shade
// layer), *garage-door* (springs and a header on an existing opening),
// *metal roof* (panels on an existing house), *gravel driveway* (a
// loose-stone pad, not a building), and *concrete slab pours* (the
// floor only). This prices a post-frame building: the bays, the eave,
// the doors, and the floor.

export const FLOOR_PRESETS = Object.freeze([
  { id: 'gravel', label: 'Crushed-stone / gravel floor' },
  { id: 'slab4', label: '4-inch concrete slab' },
  { id: 'slab6', label: '6-inch reinforced slab' },
]);

export const INSULATION_PRESETS = Object.freeze([
  { id: 'none', label: 'No insulation (shell)' },
  { id: 'walls', label: 'Walls only' },
  { id: 'full', label: 'Walls and ceiling' },
]);

export const ELECTRICAL_PRESETS = Object.freeze([
  { id: 'none', label: 'Shell only — no electrical' },
  { id: 'lights', label: 'Lights and outlets' },
  { id: 'shop', label: 'Shop panel (100A+)' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '30×40×10 ag barn, gravel, 2 walk doors (the cheap special)',
    lengthFt: 40,
    widthFt: 30,
    eaveHeightFt: 10,
    pitchRise: 4,
    postSpacingFt: 8,
    floor: 'gravel',
    insulation: 'none',
    electrical: 'none',
    overheadDoors: 0,
    walkDoors: 2,
    leanToWidthFt: 0,
    wainscot: false,
  },
  {
    label: '36×48×12 hobby shop, 4" slab, one 10×10 overhead',
    lengthFt: 48,
    widthFt: 36,
    eaveHeightFt: 12,
    pitchRise: 4,
    postSpacingFt: 8,
    floor: 'slab4',
    insulation: 'none',
    electrical: 'lights',
    overheadDoors: 1,
    walkDoors: 1,
    leanToWidthFt: 0,
    wainscot: true,
  },
  {
    label: '40×60×16 commercial shop, 6" slab, two overheads, lean-to (where the special loses)',
    lengthFt: 60,
    widthFt: 40,
    eaveHeightFt: 16,
    pitchRise: 4,
    postSpacingFt: 8,
    floor: 'slab6',
    insulation: 'full',
    electrical: 'shop',
    overheadDoors: 2,
    walkDoors: 2,
    leanToWidthFt: 12,
    wainscot: true,
  },
  {
    label: '24×32×10 garage, 4" slab, one overhead, one walk door',
    lengthFt: 32,
    widthFt: 24,
    eaveHeightFt: 10,
    pitchRise: 4,
    postSpacingFt: 8,
    floor: 'slab4',
    insulation: 'none',
    electrical: 'lights',
    overheadDoors: 1,
    walkDoors: 1,
    leanToWidthFt: 0,
    wainscot: false,
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
 * Floor area of the main building. Either dimension at zero is a
 * zero-area barn, not a missing input — the shop can still price
 * rates without a shape.
 */
export function buildingAreaSqFt(lengthFt, widthFt) {
  return number(lengthFt, 'Length') * number(widthFt, 'Width');
}

/**
 * Four walls at the eave. Gable triangles are roof steel, not wall
 * steel — they sit in roofAreaSqFt.
 */
export function wallAreaSqFt(lengthFt, widthFt, eaveHeightFt) {
  const length = number(lengthFt, 'Length');
  const width = number(widthFt, 'Width');
  const eave = number(eaveHeightFt, 'Eave height');
  return 2 * (length + width) * eave;
}

/**
 * Gable roof area from a rise-in-12 pitch, plus eave/rake overhang
 * on the rectangle. Pitch of zero is a flat roof, not a missing input.
 */
export function roofAreaSqFt(lengthFt, widthFt, pitchRise, overhangFt) {
  const length = number(lengthFt, 'Length');
  const width = number(widthFt, 'Width');
  const rise = number(pitchRise, 'Roof pitch rise');
  const overhang = number(overhangFt, 'Overhang');
  const factor = Math.sqrt(1 + (rise / 12) ** 2);
  // Overhang extends the roof past the building on all four sides, so both
  // the rake edges (length) and the eave edges (width) grow by 2x overhang
  // before the pitch factor projects the flat footprint onto the sloped
  // surface. An earlier version only extended length, undercounting roof
  // steel and roof labor by roughly the overhang-to-width ratio on every
  // job with a nonzero overhang -- the shipped default.
  return (length + 2 * overhang) * (width + 2 * overhang) * factor;
}

/**
 * Bays along the eave. Spacing of zero is rejected — a free bay
 * would hide a missing post layout.
 */
export function bayCount(lengthFt, postSpacingFt) {
  const length = number(lengthFt, 'Length');
  const spacing = number(postSpacingFt, 'Post spacing', { allowZero: false });
  if (length === 0) return 0;
  return Math.ceil(length / spacing);
}

/**
 * Eave posts on both sides, plus two gable posts that are not the
 * shared corners. A 40 ft building on 8 ft centers is 5 bays → 12
 * eave posts + 2 gable = 14.
 */
export function postCount(lengthFt, postSpacingFt, extraGablePosts = 2) {
  const bays = bayCount(lengthFt, postSpacingFt);
  if (bays === 0) return 0;
  return 2 * (bays + 1) + number(extraGablePosts, 'Extra gable posts');
}

/**
 * One truss at each post line, including both gable ends.
 */
export function trussCount(lengthFt, postSpacingFt) {
  const bays = bayCount(lengthFt, postSpacingFt);
  return bays === 0 ? 0 : bays + 1;
}

/**
 * Cubic yards from area and thickness. Thickness of zero is a
 * zero-volume floor, not a missing input.
 */
export function cubicYards(areaSqFt, thicknessIn) {
  const area = number(areaSqFt, 'Floor area');
  const thickness = number(thicknessIn, 'Thickness');
  return area * (thickness / 12) / 27;
}

/**
 * Lean-to area along the eave. Width of zero is no lean-to.
 */
export function leanToAreaSqFt(lengthFt, leanToWidthFt) {
  return number(lengthFt, 'Length') * number(leanToWidthFt, 'Lean-to width');
}

/**
 * Extra eave above the included height. Each extra foot adds 8%
 * to frame and wall-steel hours — the ladder, the longer posts,
 * and the extra sheet. Included height of zero is rejected so a
 * free foot cannot hide a missing coupon height.
 */
export function heightFactor(eaveHeightFt, includedEaveFt) {
  const eave = number(eaveHeightFt, 'Eave height');
  const included = number(includedEaveFt, 'Included eave height', { allowZero: false });
  return 1 + Math.max(0, eave - included) * 0.08;
}

/**
 * Starting hours and material rates from the floor. These are
 * ballpark crew figures, not a ready-mix catalog. Picking a floor
 * never overwrites a rate the shop has already typed.
 */
export function suggestedFloorKit(floor) {
  const id = String(floor);
  if (id === 'gravel') {
    return {
      hoursPerSqFtFloor: 1 / 200,
      floorThicknessIn: 4,
      gravelPerCy: 38,
      concretePerCy: 0,
      rebarPerSqFt: 0,
      usesGravel: 1,
      usesConcrete: 0,
    };
  }
  if (id === 'slab4') {
    return {
      hoursPerSqFtFloor: 1 / 55,
      floorThicknessIn: 4,
      gravelPerCy: 0,
      concretePerCy: 165,
      rebarPerSqFt: 0.45,
      usesGravel: 0,
      usesConcrete: 1,
    };
  }
  if (id === 'slab6') {
    return {
      hoursPerSqFtFloor: 1 / 40,
      floorThicknessIn: 6,
      gravelPerCy: 0,
      concretePerCy: 175,
      rebarPerSqFt: 1.1,
      usesGravel: 0,
      usesConcrete: 1,
    };
  }
  throw new Error('Unknown floor');
}

/**
 * Starting shell hours and lumber/steel invoices. Extra eave is
 * applied later as a factor — this kit is the 10-foot coupon.
 */
export function suggestedShellKit() {
  return {
    hoursTrip: 4,
    hoursPerSqFtFrame: 1 / 90,
    hoursPerSqFtRoof: 1 / 140,
    hoursPerOverheadDoor: 6.5,
    hoursPerWalkDoor: 1.8,
    hoursPerSqFtLeanTo: 1 / 110,
    hoursWainscotPerLf: 0.08,
    siteHours: 3,
    postEach: 85,
    trussEach: 220,
    wallSteelPerSqFt: 2.4,
    roofSteelPerSqFt: 2.8,
    wainscotPerLf: 14,
    overheadDoorEach: 1850,
    walkDoorEach: 380,
    leanToPerSqFt: 8.5,
    includedEaveFt: 10,
    overhangFt: 1.5,
    extraGablePosts: 2,
  };
}

/**
 * Insulation hours and material from the package. Shell is zero.
 */
export function suggestedInsulationKit(insulation) {
  const id = String(insulation);
  if (id === 'none') {
    return { hoursPerSqFtInsulation: 0, insulationPerSqFt: 0 };
  }
  if (id === 'walls') {
    return { hoursPerSqFtInsulation: 1 / 250, insulationPerSqFt: 1.6 };
  }
  if (id === 'full') {
    return { hoursPerSqFtInsulation: 1 / 180, insulationPerSqFt: 2.4 };
  }
  throw new Error('Unknown insulation');
}

/**
 * Electrical package. Lights is a half-day. A shop panel is a
 * dedicated circuit day plus the panel invoice.
 */
export function suggestedElectricalKit(electrical) {
  const id = String(electrical);
  if (id === 'none') {
    return { hoursElectrical: 0, electricalPackage: 0 };
  }
  if (id === 'lights') {
    return { hoursElectrical: 6, electricalPackage: 850 };
  }
  if (id === 'shop') {
    return { hoursElectrical: 14, electricalPackage: 2800 };
  }
  throw new Error('Unknown electrical');
}

/**
 * Price a pole barn from the bays, the eave, the doors, and the floor.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const floor = requirePreset(FLOOR_PRESETS, input.floor, 'floor').id;
  const insulation = requirePreset(INSULATION_PRESETS, input.insulation, 'insulation').id;
  const electrical = requirePreset(ELECTRICAL_PRESETS, input.electrical, 'electrical').id;

  const lengthFt = number(input.lengthFt ?? 0, 'Length');
  const widthFt = number(input.widthFt ?? 0, 'Width');
  const eaveHeightFt = number(input.eaveHeightFt ?? 0, 'Eave height');
  const pitchRise = number(input.pitchRise ?? 0, 'Roof pitch rise');
  const postSpacingFt = number(input.postSpacingFt ?? 8, 'Post spacing', { allowZero: false });
  const overheadDoors = number(input.overheadDoors ?? 0, 'Overhead doors');
  const walkDoors = number(input.walkDoors ?? 0, 'Walk doors');
  const leanToWidthFt = number(input.leanToWidthFt ?? 0, 'Lean-to width');
  const wainscot = flag(input.wainscot);

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Trip hours');
  const hoursPerSqFtFrame = number(input.hoursPerSqFtFrame ?? 0, 'Frame hours per sq ft');
  const hoursPerSqFtRoof = number(input.hoursPerSqFtRoof ?? 0, 'Roof hours per sq ft');
  const hoursPerSqFtFloor = number(input.hoursPerSqFtFloor ?? 0, 'Floor hours per sq ft');
  const hoursPerOverheadDoor = number(input.hoursPerOverheadDoor ?? 0, 'Hours per overhead door');
  const hoursPerWalkDoor = number(input.hoursPerWalkDoor ?? 0, 'Hours per walk door');
  const hoursPerSqFtLeanTo = number(input.hoursPerSqFtLeanTo ?? 0, 'Lean-to hours per sq ft');
  const hoursWainscotPerLf = number(input.hoursWainscotPerLf ?? 0, 'Wainscot hours per lf');
  const hoursPerSqFtInsulation = number(input.hoursPerSqFtInsulation ?? 0, 'Insulation hours per sq ft');
  const hoursElectrical = number(input.hoursElectrical ?? 0, 'Electrical hours');
  const siteHours = number(input.siteHours ?? 0, 'Site hours');

  const postEach = number(input.postEach ?? 0, 'Post each');
  const trussEach = number(input.trussEach ?? 0, 'Truss each');
  const wallSteelPerSqFt = number(input.wallSteelPerSqFt ?? 0, 'Wall steel per sq ft');
  const roofSteelPerSqFt = number(input.roofSteelPerSqFt ?? 0, 'Roof steel per sq ft');
  const wainscotPerLf = number(input.wainscotPerLf ?? 0, 'Wainscot per lf');
  const overheadDoorEach = number(input.overheadDoorEach ?? 0, 'Overhead door each');
  const walkDoorEach = number(input.walkDoorEach ?? 0, 'Walk door each');
  const leanToPerSqFt = number(input.leanToPerSqFt ?? 0, 'Lean-to per sq ft');
  const insulationPerSqFt = number(input.insulationPerSqFt ?? 0, 'Insulation per sq ft');
  const electricalPackage = number(input.electricalPackage ?? 0, 'Electrical package');
  const gravelPerCy = number(input.gravelPerCy ?? 0, 'Gravel per cubic yard');
  const concretePerCy = number(input.concretePerCy ?? 0, 'Concrete per cubic yard');
  const rebarPerSqFt = number(input.rebarPerSqFt ?? 0, 'Rebar per sq ft');
  const floorThicknessIn = number(input.floorThicknessIn ?? 0, 'Floor thickness');
  const usesGravel = number(input.usesGravel ?? 0, 'Uses gravel');
  const usesConcrete = number(input.usesConcrete ?? 0, 'Uses concrete');
  const includedEaveFt = number(input.includedEaveFt ?? 10, 'Included eave height', { allowZero: false });
  const overhangFt = number(input.overhangFt ?? 0, 'Overhang');
  const extraGablePosts = number(input.extraGablePosts ?? 2, 'Extra gable posts');

  const areaSqFt = buildingAreaSqFt(lengthFt, widthFt);
  const wallsSqFt = wallAreaSqFt(lengthFt, widthFt, eaveHeightFt);
  const roofSqFt = roofAreaSqFt(lengthFt, widthFt, pitchRise, overhangFt);
  const bays = bayCount(lengthFt, postSpacingFt);
  const posts = postCount(lengthFt, postSpacingFt, extraGablePosts);
  const trusses = trussCount(lengthFt, postSpacingFt);
  const leanToSqFt = leanToAreaSqFt(lengthFt, leanToWidthFt);
  const floorCy = cubicYards(areaSqFt + leanToSqFt, floorThicknessIn);
  const gravelCy = usesGravel ? floorCy : 0;
  const slabCy = usesConcrete ? floorCy : 0;
  const wainscotLf = wainscot ? 2 * (lengthFt + widthFt) : 0;
  const insulatedSqFt = insulation === 'none'
    ? 0
    : insulation === 'walls'
      ? wallsSqFt
      : wallsSqFt + areaSqFt;
  const extraHeight = Math.max(0, eaveHeightFt - includedEaveFt);
  const eaveFactor = heightFactor(eaveHeightFt, includedEaveFt);

  const hoursFrame = areaSqFt * hoursPerSqFtFrame * eaveFactor;
  const hoursRoof = roofSqFt * hoursPerSqFtRoof;
  const hoursFloor = (areaSqFt + leanToSqFt) * hoursPerSqFtFloor;
  const hoursDoors = overheadDoors * hoursPerOverheadDoor + walkDoors * hoursPerWalkDoor;
  const hoursLeanTo = leanToSqFt * hoursPerSqFtLeanTo;
  const hoursWainscot = wainscotLf * hoursWainscotPerLf;
  const hoursInsulation = insulatedSqFt * hoursPerSqFtInsulation;
  const totalHours = hoursTrip + hoursFrame + hoursRoof + hoursFloor + hoursDoors
    + hoursLeanTo + hoursWainscot + hoursInsulation + hoursElectrical + siteHours;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const laborCost = totalHours * loadedWage;

  const postMaterial = posts * postEach;
  const trussMaterial = trusses * trussEach;
  const wallMaterial = wallsSqFt * wallSteelPerSqFt;
  const roofMaterial = roofSqFt * roofSteelPerSqFt;
  const shellMaterial = postMaterial + trussMaterial + wallMaterial + roofMaterial;
  const doorMaterial = overheadDoors * overheadDoorEach + walkDoors * walkDoorEach;
  const leanToMaterial = leanToSqFt * leanToPerSqFt;
  const wainscotMaterial = wainscotLf * wainscotPerLf;
  const insulationMaterial = insulatedSqFt * insulationPerSqFt;
  const gravelMaterial = gravelCy * gravelPerCy;
  const concreteMaterial = slabCy * concretePerCy;
  const rebarMaterial = usesConcrete ? (areaSqFt + leanToSqFt) * rebarPerSqFt : 0;
  const floorMaterial = gravelMaterial + concreteMaterial + rebarMaterial;
  const extraHardware = doorMaterial + leanToMaterial + wainscotMaterial
    + insulationMaterial + electricalPackage + floorMaterial;
  const materialCost = shellMaterial + extraHardware;

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
    + hoursFloor * loadedWage
    + hoursDoors * loadedWage
    + hoursLeanTo * loadedWage
    + hoursWainscot * loadedWage
    + hoursInsulation * loadedWage
    + hoursElectrical * loadedWage
    + hoursFrame * loadedWage * (1 - 1 / eaveFactor);

  return {
    floor,
    insulation,
    electrical,
    lengthFt,
    widthFt,
    eaveHeightFt,
    pitchRise,
    postSpacingFt,
    overheadDoors,
    walkDoors,
    leanToWidthFt,
    wainscot,
    areaSqFt,
    wallsSqFt,
    roofSqFt,
    leanToSqFt,
    bays,
    posts,
    trusses,
    floorCy,
    gravelCy,
    slabCy,
    wainscotLf,
    insulatedSqFt,
    extraHeight,
    eaveFactor,
    loadedWage,
    hoursTrip,
    hoursFrame,
    hoursRoof,
    hoursFloor,
    hoursDoors,
    hoursLeanTo,
    hoursWainscot,
    hoursInsulation,
    hoursElectrical,
    siteHours,
    totalHours,
    laborCost,
    postMaterial,
    trussMaterial,
    wallMaterial,
    roofMaterial,
    shellMaterial,
    doorMaterial,
    leanToMaterial,
    wainscotMaterial,
    insulationMaterial,
    electricalPackage,
    gravelMaterial,
    concreteMaterial,
    rebarMaterial,
    floorMaterial,
    extraHardware,
    extraCost,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSqFt: areaSqFt === 0 ? null : price / areaSqFt,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      shell: costShare(shellMaterial),
      extra: costShare(extraCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(hoursTrip),
      frame: hourShare(hoursFrame),
      roof: hourShare(hoursRoof),
      floor: hourShare(hoursFloor),
      doors: hourShare(hoursDoors),
      leanTo: hourShare(hoursLeanTo),
      wainscot: hourShare(hoursWainscot),
      insulation: hourShare(hoursInsulation),
      electrical: hourShare(hoursElectrical),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perSqFt: areaSqFt === 0 ? null : proposedPrice / areaSqFt,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Price the same barn three ways — gravel, 4-inch slab, 6-inch
 * reinforced — from the suggested floor kits so the shop can see
 * when a shop slab flips the cheap ag special. User-typed floor
 * rates are not reused here: the comparison is apples-to-apples
 * on the starting figures. Shell, insulation, and electrical kits
 * stay with the current job.
 */
export function compareFloor(input) {
  const shellKit = suggestedShellKit();
  const insulationKit = suggestedInsulationKit(String(input.insulation ?? 'none'));
  const electricalKit = suggestedElectricalKit(String(input.electrical ?? 'none'));
  const rows = FLOOR_PRESETS.map((preset) => {
    const kit = suggestedFloorKit(preset.id);
    const bid = calculateBid({
      ...input,
      floor: preset.id,
      ...shellKit,
      ...insulationKit,
      ...electricalKit,
      ...kit,
    });
    return {
      floor: preset.id,
      label: preset.label,
      price: bid.price,
      totalCost: bid.totalCost,
      totalHours: bid.totalHours,
      pricePerSqFt: bid.pricePerSqFt,
      floorMaterial: bid.floorMaterial,
      extraCost: bid.extraCost,
      extraShare: bid.shares.extra,
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
 * Format a bid as a plain-text draft the shop can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this
 * is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Pole barn') {
  const perFt = result.pricePerSqFt === null
    ? 'n/a'
    : `${money(result.pricePerSqFt)} / sq ft`;
  const floor = FLOOR_PRESETS.find((item) => item.id === result.floor)?.label ?? result.floor;
  const insulation = INSULATION_PRESETS.find((item) => item.id === result.insulation)?.label ?? result.insulation;
  const electrical = ELECTRICAL_PRESETS.find((item) => item.id === result.electrical)?.label ?? result.electrical;
  const extras = [
    `${result.eaveHeightFt} ft eave`,
    `${result.pitchRise}/12 pitch`,
    `${result.overheadDoors} overhead door${result.overheadDoors === 1 ? '' : 's'}`,
    `${result.walkDoors} walk door${result.walkDoors === 1 ? '' : 's'}`,
    result.leanToSqFt > 0 ? `${result.leanToWidthFt} ft lean-to` : 'no lean-to',
    result.wainscot ? 'wainscot included' : 'no wainscot',
  ].join('; ');
  return [
    'POLE BARN / POST-FRAME BID',
    '',
    `Proposed building price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${floor}`,
    `Price per square foot: ${perFt}`,
    `Frame: ${result.bays} bays, ${result.posts} posts, ${result.trusses} trusses`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.lengthFt} ft × ${result.widthFt} ft building (${result.areaSqFt.toLocaleString('en-US')} sq ft)`,
    `- ${floor}; ${insulation}; ${electrical}`,
    `- ${extras}`,
    `- Frame: ${result.hoursFrame.toFixed(1)} h; roof: ${result.hoursRoof.toFixed(1)} h; floor: ${result.hoursFloor.toFixed(1)} h; doors / lean-to: ${(result.hoursDoors + result.hoursLeanTo).toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm building size, eave height, floor, doors, lean-to, insulation, electrical, and all pricing before sending. It is not a structural specification, an engineered stamp, a permit set, or a building-code determination.',
  ].join('\n');
}
