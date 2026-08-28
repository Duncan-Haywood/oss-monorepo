// Pure bid arithmetic for pool plaster / pool resurfacing. No network, no
// state: every length, depth, finish, chip-out, and wage is an input, so
// the result stays a transparent calculation the plasterer can check
// against their own invoices rather than a claim about what any pool
// "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$8 a square foot" plaster quote treats the homeowner's water-surface
// number (length × width) as the takeoff. The plaster goes on the floor
// AND the walls. A 16×32 rectangle with a 3.5-foot shallow end and an
// 8-foot deep end is 512 square feet of water and about 1,064 square
// feet of plaster. Matching a cheaper per-foot quote written for the
// water surface is how a sold pebble job with a full chip-out, spa,
// waterline tile, and coping becomes a two-day loss after the first
// drain day.
//
// Distinct from pool-route / weekly chemical service (a recurring stop),
// concrete (a slab pour), epoxy garage floors, and walk-in shower tile.
// This prices a drain-and-replaster: the walls, the finish, the chip-out,
// the spa, and the tile band.

export const FINISH_PRESETS = Object.freeze([
  { id: 'white-plaster', label: 'White plaster / marcite' },
  { id: 'quartz', label: 'Quartz' },
  { id: 'pebble', label: 'Pebble / exposed aggregate' },
  { id: 'glass', label: 'Glass bead' },
]);

export const CHIPOUT_PRESETS = Object.freeze([
  { id: 'none', label: 'No chip-out (drain and plaster over, if bonded)' },
  { id: 'partial', label: 'Partial chip-out (failed areas only)' },
  { id: 'full', label: 'Full chip-out to gunite' },
]);

export const SHAPE_PRESETS = Object.freeze([
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'freeform', label: 'Freeform / kidney' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '16×32 rectangle, white plaster, no chip-out (the brochure special)',
    shape: 'rectangle',
    finish: 'white-plaster',
    chipout: 'none',
    lengthFt: 32,
    widthFt: 16,
    shallowFt: 3.5,
    deepFt: 8,
    waterSurfaceSf: 512,
    freeformMultiplier: 1.8,
    chipoutSf: 0,
    spaSf: 0,
    stepBenches: 0,
    waterlineTileLf: 0,
    copingLf: 0,
    drainRefill: true,
    acidWash: false,
  },
  {
    label: '18×36 rectangle, quartz, partial chip-out, 70 lf waterline tile',
    shape: 'rectangle',
    finish: 'quartz',
    chipout: 'partial',
    lengthFt: 36,
    widthFt: 18,
    shallowFt: 3.5,
    deepFt: 8,
    waterSurfaceSf: 648,
    freeformMultiplier: 1.8,
    chipoutSf: 220,
    spaSf: 0,
    stepBenches: 2,
    waterlineTileLf: 70,
    copingLf: 0,
    drainRefill: true,
    acidWash: true,
  },
  {
    label: 'Freeform pebble, full chip-out, spa, tile, coping (the loss job)',
    shape: 'freeform',
    finish: 'pebble',
    chipout: 'full',
    lengthFt: 36,
    widthFt: 18,
    shallowFt: 3.5,
    deepFt: 8.5,
    waterSurfaceSf: 620,
    freeformMultiplier: 1.85,
    chipoutSf: 0,
    spaSf: 80,
    stepBenches: 4,
    waterlineTileLf: 90,
    copingLf: 90,
    drainRefill: true,
    acidWash: true,
  },
  {
    label: '20×40 rectangle, glass bead, full chip-out, spa, coping',
    shape: 'rectangle',
    finish: 'glass',
    chipout: 'full',
    lengthFt: 40,
    widthFt: 20,
    shallowFt: 3.5,
    deepFt: 9,
    waterSurfaceSf: 800,
    freeformMultiplier: 1.8,
    chipoutSf: 0,
    spaSf: 64,
    stepBenches: 2,
    waterlineTileLf: 40,
    copingLf: 80,
    drainRefill: true,
    acidWash: false,
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
 * Starting finish cost and plaster hours from the surface. These are
 * ballpark distributor / crew figures, not a catalog. Picking a finish
 * never overwrites a rate the plasterer has already typed.
 */
export function suggestedFinishKit(finish) {
  const id = String(finish);
  if (id === 'white-plaster') {
    return { finishPerSf: 1.85, hoursPerPlasterSf: 0.045 };
  }
  if (id === 'quartz') {
    return { finishPerSf: 3.4, hoursPerPlasterSf: 0.055 };
  }
  if (id === 'pebble') {
    return { finishPerSf: 6.2, hoursPerPlasterSf: 0.075 };
  }
  if (id === 'glass') {
    return { finishPerSf: 8.8, hoursPerPlasterSf: 0.09 };
  }
  throw new Error('Unknown pool finish');
}

/**
 * Starting chip-out hours and haul-off from the demolition choice.
 * Full chip-out is a different job from a drain-and-overlay.
 */
export function suggestedChipoutKit(chipout) {
  const id = String(chipout);
  if (id === 'none') {
    return { hoursPerChipoutSf: 0, dumpsterCost: 0 };
  }
  if (id === 'partial') {
    return { hoursPerChipoutSf: 0.08, dumpsterCost: 280 };
  }
  if (id === 'full') {
    return { hoursPerChipoutSf: 0.14, dumpsterCost: 650 };
  }
  throw new Error('Unknown chip-out method');
}

/**
 * Plaster surface and water volume from the pool's shape. The floor is
 * the water surface. The walls are what a length × width quote misses.
 */
export function poolGeometry(input) {
  const shape = String(input.shape ?? 'rectangle');
  if (!SHAPE_PRESETS.some((item) => item.id === shape)) {
    throw new Error('Unknown pool shape');
  }

  const spaSf = number(input.spaSf ?? 0, 'Spa square feet');
  const stepBenches = number(input.stepBenches ?? 0, 'Steps / benches');
  const stepSfEach = number(input.stepSfEach ?? 12, 'Square feet per step / bench');
  const stepSf = stepBenches * stepSfEach;

  if (shape === 'rectangle') {
    const lengthFt = number(input.lengthFt ?? 0, 'Length', { allowZero: false });
    const widthFt = number(input.widthFt ?? 0, 'Width', { allowZero: false });
    const shallowFt = number(input.shallowFt ?? 0, 'Shallow depth', { allowZero: false });
    const deepFt = number(input.deepFt ?? 0, 'Deep depth', { allowZero: false });
    const floorSf = lengthFt * widthFt;
    const avgDepth = (shallowFt + deepFt) / 2;
    const wallSf = 2 * (lengthFt + widthFt) * avgDepth;
    const shellSf = floorSf + wallSf;
    const plasterSf = shellSf + spaSf + stepSf;
    const volumeGal = (floorSf * avgDepth + spaSf * 3) * 7.48052;
    return {
      shape,
      floorSf,
      wallSf,
      shellSf,
      spaSf,
      stepSf,
      plasterSf,
      avgDepth,
      volumeGal,
    };
  }

  const waterSurfaceSf = number(input.waterSurfaceSf ?? 0, 'Water-surface square feet', { allowZero: false });
  const freeformMultiplier = number(input.freeformMultiplier ?? 0, 'Freeform wall multiplier', {
    allowZero: false,
  });
  const shallowFt = number(input.shallowFt ?? 0, 'Shallow depth', { allowZero: false });
  const deepFt = number(input.deepFt ?? 0, 'Deep depth', { allowZero: false });
  const floorSf = waterSurfaceSf;
  const shellSf = waterSurfaceSf * freeformMultiplier;
  const wallSf = shellSf - floorSf;
  const plasterSf = shellSf + spaSf + stepSf;
  const avgDepth = (shallowFt + deepFt) / 2;
  const volumeGal = (waterSurfaceSf * avgDepth + spaSf * 3) * 7.48052;
  return {
    shape,
    floorSf,
    wallSf,
    shellSf,
    spaSf,
    stepSf,
    plasterSf,
    avgDepth,
    volumeGal,
  };
}

/**
 * Price a pool replaster from the shell geometry, finish, chip-out,
 * spa, tile, coping, drain-and-refill, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const geometry = poolGeometry(input);
  const finish = String(input.finish ?? 'white-plaster');
  if (!FINISH_PRESETS.some((item) => item.id === finish)) {
    throw new Error('Unknown pool finish');
  }
  const chipout = String(input.chipout ?? 'none');
  if (!CHIPOUT_PRESETS.some((item) => item.id === chipout)) {
    throw new Error('Unknown chip-out method');
  }

  const chipoutSf = number(input.chipoutSf ?? 0, 'Partial chip-out square feet');
  const waterlineTileLf = number(input.waterlineTileLf ?? 0, 'Waterline tile linear feet');
  const copingLf = number(input.copingLf ?? 0, 'Coping linear feet');
  const drainRefill = flag(input.drainRefill);
  const acidWash = flag(input.acidWash);

  const hoursPerPlasterSf = number(input.hoursPerPlasterSf ?? 0, 'Hours per plaster square foot');
  const hoursPerChipoutSf = number(input.hoursPerChipoutSf ?? 0, 'Hours per chip-out square foot');
  const hoursPerSpa = number(input.hoursPerSpa ?? 0, 'Hours for a spa');
  const hoursPerStep = number(input.hoursPerStep ?? 0, 'Hours per step / bench');
  const hoursPerTileLf = number(input.hoursPerTileLf ?? 0, 'Hours per tile foot');
  const hoursPerCopingLf = number(input.hoursPerCopingLf ?? 0, 'Hours per coping foot');
  const hoursDrainRefill = number(input.hoursDrainRefill ?? 0, 'Hours to drain and refill');
  const hoursAcidWash = number(input.hoursAcidWash ?? 0, 'Hours for acid wash');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const finishPerSf = number(input.finishPerSf ?? 0, 'Finish cost per square foot');
  const tilePerLf = number(input.tilePerLf ?? 0, 'Tile cost per foot');
  const copingPerLf = number(input.copingPerLf ?? 0, 'Coping cost per foot');
  const dumpsterCost = number(input.dumpsterCost ?? 0, 'Dumpster / haul-off');
  const waterPerGallon = number(input.waterPerGallon ?? 0, 'Water cost per gallon');
  const acidWashChem = number(input.acidWashChem ?? 0, 'Acid-wash chemicals');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const plasterHours = geometry.plasterSf * hoursPerPlasterSf;
  const billedChipoutSf = chipout === 'none'
    ? 0
    : chipout === 'full'
      ? geometry.plasterSf
      : chipoutSf;
  if (chipout === 'partial' && chipoutSf === 0) {
    throw new Error('Add partial chip-out square feet to price');
  }
  const chipoutHours = billedChipoutSf * hoursPerChipoutSf;
  const plasterWorkHours = plasterHours + chipoutHours;
  const spaHours = geometry.spaSf > 0 ? hoursPerSpa : 0;
  const stepHours = (input.stepBenches ? number(input.stepBenches, 'Steps / benches') : 0) * hoursPerStep;
  const tileHours = waterlineTileLf * hoursPerTileLf;
  const copingHours = copingLf * hoursPerCopingLf;
  const drainHours = drainRefill ? hoursDrainRefill : 0;
  const acidHours = acidWash ? hoursAcidWash : 0;
  const extraHours = spaHours + stepHours + tileHours + copingHours + drainHours + acidHours;
  const totalHours = plasterWorkHours + extraHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const finishMaterial = geometry.plasterSf * finishPerSf;
  const tileMaterial = waterlineTileLf * tilePerLf;
  const copingMaterial = copingLf * copingPerLf;
  const dumpsterMaterial = billedChipoutSf > 0 ? dumpsterCost : 0;
  const waterMaterial = drainRefill ? geometry.volumeGal * waterPerGallon : 0;
  const acidMaterial = acidWash ? acidWashChem : 0;
  const permitMaterial = permitFee;
  const materialCost = finishMaterial + tileMaterial + copingMaterial
    + dumpsterMaterial + waterMaterial + acidMaterial + permitMaterial;
  const softCost = travelAndEquipment;

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
    finish,
    chipout,
    ...geometry,
    billedChipoutSf,
    waterlineTileLf,
    copingLf,
    drainRefill,
    acidWash,
    loadedWage,
    plasterHours,
    chipoutHours,
    plasterWorkHours,
    spaHours,
    stepHours,
    tileHours,
    copingHours,
    drainHours,
    acidHours,
    extraHours,
    siteHours,
    totalHours,
    laborCost,
    finishMaterial,
    tileMaterial,
    copingMaterial,
    dumpsterMaterial,
    waterMaterial,
    acidMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerPlasterSf: geometry.plasterSf === 0 ? null : price / geometry.plasterSf,
    pricePerWaterSf: geometry.floorSf === 0 ? null : price / geometry.floorSf,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      plaster: hourShare(plasterWorkHours),
      extras: hourShare(extraHours),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perPlasterSf: geometry.plasterSf === 0 ? null : proposedPrice / geometry.plasterSf,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the plasterer can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this is
 * the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Pool plaster / resurfacing') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const finish = FINISH_PRESETS.find((item) => item.id === result.finish)?.label ?? result.finish;
  const chipout = CHIPOUT_PRESETS.find((item) => item.id === result.chipout)?.label ?? result.chipout;
  const shape = SHAPE_PRESETS.find((item) => item.id === result.shape)?.label ?? result.shape;
  const drain = result.drainRefill ? 'drain and refill included' : 'no drain-and-refill this bid';
  const acid = result.acidWash ? 'acid wash included' : 'no acid wash this bid';
  return [
    'POOL PLASTER / RESURFACING BID',
    '',
    `Proposed plaster price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${finish}; ${shape}`,
    `Price per sq ft of plaster (floor + walls + spa + steps): ${money(result.pricePerPlasterSf)}`,
    `Price per sq ft of water surface (what homeowners count): ${money(result.pricePerWaterSf)}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- Water surface: ${result.floorSf.toFixed(0)} sf; walls: ${result.wallSf.toFixed(0)} sf; plaster takeoff: ${result.plasterSf.toFixed(0)} sf`,
    `- Chip-out: ${chipout}; billed chip-out: ${result.billedChipoutSf.toFixed(0)} sf`,
    `- Spa: ${result.spaSf} sf; steps / benches: ${result.stepSf.toFixed(0)} sf; waterline tile: ${result.waterlineTileLf} lf; coping: ${result.copingLf} lf`,
    `- ${drain}; ${acid}`,
    `- Plaster + chip-out labor: ${result.plasterWorkHours.toFixed(1)} h; extras: ${result.extraHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm shell, finish, bond, chip-out, tile, coping, drain, refill, permits, and all pricing before sending. It is not a pool specification, a structural determination, a permit, or an engineering stamp.',
  ].join('\n');
}
