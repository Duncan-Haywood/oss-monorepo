// Pure bid arithmetic for tiled walk-in showers and tub-to-shower
// conversions. No network, no state: every square foot, niche, drain,
// and wage is an input, so the result stays a transparent calculation
// the contractor can check against their own invoices rather than a
// claim about what any bathroom "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "price per square foot of tile" quote treats a 5x3 alcove tub-to-
// shower with the existing valve and a framed door as the same job as
// a 5x5 curbless walk-in with a linear drain, a valve relocate, a
// masonry bench, and frameless glass. Homeowners (and a lot of
// estimator sheets) count the same kind of number. Linear drains,
// curbless slope, niches, benches, and glass do not scale with tile
// square footage. Matching a cheaper per-SF quote written for the
// brochure alcove is how a sold walk-in becomes a week-long loss
// after the first curbless floor.
//
// Distinct from flooring install (LVP / hardwood / floor tile and
// waste), cabinet refinishing, quartz/granite countertops, drywall
// hang-and-finish, water-heater replacement, walk-in tub (a tub
// with a door, not a wet-area system), and toilet replacement (a
// commode swap). This prices a wet-area system: demo, plumbing
// relocate, waterproofing, wall and floor tile, niches, bench,
// glass, and (optionally) a steam unit.
//
// Owners also shop a second special: “I already bought the tile —
// just set it for $45 / SF.” Zeroing the tile invoice is not a
// free set. Unpacking their boxes still takes hours. A short
// order or a dye-lot mismatch is a second trip plus a retail
// fill-in they expect you to eat.

export const JOB_PRESETS = Object.freeze([
  {
    label: '5x3 alcove tub-to-shower, keep valve, framed door (the brochure job)',
    wallTileSf: 80,
    floorTileSf: 15,
    niches: 1,
    tearOutTub: true,
    relocateValve: false,
    linearDrain: false,
    curbless: false,
    steamUnit: false,
    bench: 'none',
    glass: 'framed',
  },
  {
    label: '5x5 curbless walk-in, linear drain, valve relocate, frameless glass, masonry bench',
    wallTileSf: 90,
    floorTileSf: 25,
    niches: 2,
    tearOutTub: true,
    relocateValve: true,
    linearDrain: true,
    curbless: true,
    steamUnit: false,
    bench: 'masonry',
    glass: 'frameless',
  },
  {
    label: '4x6 steam shower, masonry bench, two niches, steam glass',
    wallTileSf: 110,
    floorTileSf: 24,
    niches: 2,
    tearOutTub: true,
    relocateValve: true,
    linearDrain: false,
    curbless: false,
    steamUnit: true,
    bench: 'masonry',
    glass: 'steam',
  },
  {
    label: 'Tile-only alcove (demo already done), one niche, no glass',
    wallTileSf: 80,
    floorTileSf: 15,
    niches: 1,
    tearOutTub: false,
    relocateValve: false,
    linearDrain: false,
    curbless: false,
    steamUnit: false,
    bench: 'none',
    glass: 'none',
  },
]);

export const BENCH_PRESETS = Object.freeze([
  { id: 'none', label: 'No bench', hours: 0, material: 0 },
  { id: 'floating', label: 'Floating / teak bench', hours: 2, material: 220 },
  { id: 'masonry', label: 'Masonry / tiled bench', hours: 4.5, material: 85 },
]);

export const GLASS_PRESETS = Object.freeze([
  { id: 'none', label: 'No glass this bid', cost: 0 },
  { id: 'framed', label: 'Framed shower door', cost: 480 },
  { id: 'frameless', label: 'Frameless glass panel / door', cost: 1650 },
  { id: 'steam', label: 'Steam-rated enclosure', cost: 2200 },
]);

export const SUPPLY_PRESETS = Object.freeze([
  {
    id: 'contractor-supplied',
    label: 'You supply the tile',
    detail: 'Tile invoice stays in the bid',
  },
  {
    id: 'owner-fits',
    label: 'They bought the right tile',
    detail: 'Zero tile invoice; unpack and leftover boxes still take hours',
  },
  {
    id: 'owner-short',
    label: 'They bought too little / wrong dye lot',
    detail: 'Zero tile invoice plus a second trip and a retail fill-in',
  },
]);

/**
 * Starting extras when the owner bought the tile. Unpack / leftover
 * boxes are not free. A short order or a dye-lot mismatch is a
 * second trip plus a retail fill-in they expect you to eat.
 */
export function suggestedOwnerTileKit() {
  return {
    hoursOwnerHandle: 1.5,
    hoursCallbackTrip: 2.5,
    extraTileBuy: 180,
  };
}

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

export function suggestedBench(benchId) {
  const preset = BENCH_PRESETS.find((item) => item.id === benchId);
  if (!preset) throw new Error('Unknown bench type');
  return { hoursPerBench: preset.hours, benchMaterial: preset.material };
}

export function suggestedGlass(glassId) {
  const preset = GLASS_PRESETS.find((item) => item.id === glassId);
  if (!preset) throw new Error('Unknown glass type');
  return { glassCost: preset.cost };
}

export function billedTileSf(wallTileSf, floorTileSf, wastePercent) {
  const wall = number(wallTileSf, 'Wall tile');
  const floor = number(floorTileSf, 'Floor tile');
  const waste = number(wastePercent, 'Tile waste');
  return (wall + floor) * (1 + waste / 100);
}

/**
 * Price a tiled shower from wall/floor tile, demo, plumbing, waterproofing,
 * niches, bench, glass, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const wallTileSf = number(input.wallTileSf ?? 0, 'Wall tile');
  const floorTileSf = number(input.floorTileSf ?? 0, 'Floor tile');
  const niches = number(input.niches ?? 0, 'Niches');
  const wastePercent = number(input.wastePercent ?? 0, 'Tile waste');
  if (wallTileSf + floorTileSf === 0) {
    throw new Error('Add wall or floor tile square footage to price');
  }

  const tearOutTub = flag(input.tearOutTub);
  const relocateValve = flag(input.relocateValve);
  const linearDrain = flag(input.linearDrain);
  const curbless = flag(input.curbless);
  const steamUnit = flag(input.steamUnit);

  const benchId = String(input.bench ?? 'none');
  if (!BENCH_PRESETS.some((item) => item.id === benchId)) {
    throw new Error('Unknown bench type');
  }
  const glassId = String(input.glass ?? 'none');
  if (!GLASS_PRESETS.some((item) => item.id === glassId)) {
    throw new Error('Unknown glass type');
  }

  const hoursPer100Tile = number(input.hoursPer100Tile ?? 0, 'Hours per 100 sq ft of tile');
  const hoursDemoTub = number(input.hoursDemoTub ?? 0, 'Hours to tear out a tub');
  const hoursRelocateValve = number(input.hoursRelocateValve ?? 0, 'Hours to relocate the valve');
  const hoursLinearDrain = number(input.hoursLinearDrain ?? 0, 'Hours for a linear drain');
  const hoursCurbless = number(input.hoursCurbless ?? 0, 'Hours for curbless slope');
  const hoursPerNiche = number(input.hoursPerNiche ?? 0, 'Hours per niche');
  const hoursPerBench = number(input.hoursPerBench ?? 0, 'Hours for the bench');
  const hoursSteam = number(input.hoursSteam ?? 0, 'Hours for a steam unit');
  const hoursWaterproofPer100 = number(input.hoursWaterproofPer100 ?? 0, 'Hours per 100 sq ft of waterproofing');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const tileCostPerSf = number(input.tileCostPerSf ?? 0, 'Tile cost per sq ft');
  const membraneCostPerSf = number(input.membraneCostPerSf ?? 0, 'Membrane cost per sq ft');
  const dumpsterFee = number(input.dumpsterFee ?? 0, 'Dumpster fee');
  const linearDrainCost = number(input.linearDrainCost ?? 0, 'Linear drain cost');
  const valveRelocateParts = number(input.valveRelocateParts ?? 0, 'Valve-relocate parts');
  const nicheKitEach = number(input.nicheKitEach ?? 0, 'Niche kit each');
  const benchMaterial = number(input.benchMaterial ?? 0, 'Bench material');
  const glassCost = number(input.glassCost ?? 0, 'Glass cost');
  const steamUnitCost = number(input.steamUnitCost ?? 0, 'Steam unit cost');
  const fixturesAllowance = number(input.fixturesAllowance ?? 0, 'Fixtures allowance');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const tileSf = wallTileSf + floorTileSf;
  const tileBilledSf = billedTileSf(wallTileSf, floorTileSf, wastePercent);
  const waterproofSf = tileSf;

  const tileHours = (tileSf / 100) * hoursPer100Tile;
  const waterproofHours = (waterproofSf / 100) * hoursWaterproofPer100;
  const demoHours = tearOutTub ? hoursDemoTub : 0;
  const valveHours = relocateValve ? hoursRelocateValve : 0;
  const drainHours = linearDrain ? hoursLinearDrain : 0;
  const curblessHours = curbless ? hoursCurbless : 0;
  const nicheHours = niches * hoursPerNiche;
  const benchHours = benchId === 'none' ? 0 : hoursPerBench;
  const steamHours = steamUnit ? hoursSteam : 0;
  const wetHours = waterproofHours + drainHours + curblessHours;
  const finishHours = nicheHours + benchHours + steamHours;
  const totalHours = tileHours + wetHours + demoHours + valveHours + finishHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const tileMaterial = tileBilledSf * tileCostPerSf;
  const membraneMaterial = waterproofSf * membraneCostPerSf;
  const demoMaterial = tearOutTub ? dumpsterFee : 0;
  const drainMaterial = linearDrain ? linearDrainCost : 0;
  const valveMaterial = relocateValve ? valveRelocateParts : 0;
  const nicheMaterial = niches * nicheKitEach;
  const benchMaterialCost = benchId === 'none' ? 0 : benchMaterial;
  const glassMaterial = glassCost;
  const steamMaterial = steamUnit ? steamUnitCost : 0;
  const fixtureMaterial = fixturesAllowance;
  const permitMaterial = permitFee;
  const materialCost = tileMaterial + membraneMaterial + demoMaterial + drainMaterial
    + valveMaterial + nicheMaterial + benchMaterialCost + glassMaterial
    + steamMaterial + fixtureMaterial + permitMaterial + otherCost;
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
    wallTileSf,
    floorTileSf,
    tileSf,
    tileBilledSf,
    waterproofSf,
    niches,
    wastePercent,
    tearOutTub,
    relocateValve,
    linearDrain,
    curbless,
    steamUnit,
    bench: benchId,
    glass: glassId,
    loadedWage,
    tileHours,
    waterproofHours,
    demoHours,
    valveHours,
    drainHours,
    curblessHours,
    nicheHours,
    benchHours,
    steamHours,
    wetHours,
    finishHours,
    siteHours,
    totalHours,
    laborCost,
    tileMaterial,
    membraneMaterial,
    demoMaterial,
    drainMaterial,
    valveMaterial,
    nicheMaterial,
    benchMaterial: benchMaterialCost,
    glassMaterial,
    steamMaterial,
    fixtureMaterial,
    permitMaterial,
    otherCost,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerTileSf: tileSf === 0 ? null : price / tileSf,
    costPerTileSf: tileSf === 0 ? null : totalCost / tileSf,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      tile: hourShare(tileHours),
      wet: hourShare(wetHours),
      demo: hourShare(demoHours + valveHours),
      finish: hourShare(finishHours),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perTileSf: tileSf === 0 ? null : proposedPrice / tileSf,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

function scoreLaborOnly(bid, laborOnlyPrice) {
  if (laborOnlyPrice === null) return null;
  return {
    price: laborOnlyPrice,
    profit: laborOnlyPrice - bid.totalCost,
    margin: laborOnlyPrice === 0 ? 0 : (laborOnlyPrice - bid.totalCost) / laborOnlyPrice * 100,
    belowBreakEven: laborOnlyPrice < bid.totalCost,
  };
}

/**
 * Price the same wet area three ways: you supply the tile, the
 * owner supplies boxes that cover the takeoff, or the owner
 * supplies a short / wrong-dye-lot order.
 *
 * Owner rows zero the tile invoice and keep the current set
 * hours — unpacking their boxes is still a set. The short
 * row adds a starting callback trip and a retail fill-in on
 * top of the current rates so a typed invoice does not leak
 * into the "they bought it" case.
 *
 * A labor-only price (options.laborOnlyPrice, else the proposed
 * price on the bid, else laborOnlyPerSf × tile SF) is scored
 * against each cost base. That is the $45 / SF "just set what
 * I bought" number tile shops actually get shopped on.
 */
export function compareTileSupply(input, options = {}) {
  const kit = suggestedOwnerTileKit();
  const wallTileSf = number(input.wallTileSf ?? 0, 'Wall tile');
  const floorTileSf = number(input.floorTileSf ?? 0, 'Floor tile');
  const tileSf = wallTileSf + floorTileSf;
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');

  let laborOnlyPrice = null;
  const rawLabor = options.laborOnlyPrice !== undefined
    ? options.laborOnlyPrice
    : input.proposedPrice;
  if (rawLabor !== null && rawLabor !== undefined && rawLabor !== '') {
    laborOnlyPrice = number(rawLabor, 'Labor-only price');
  } else {
    const perSf = number(
      options.laborOnlyPerSf ?? input.laborOnlyPerSf ?? 45,
      'Labor-only per sq ft',
    );
    laborOnlyPrice = perSf * tileSf;
  }

  const contractor = calculateBid(input);
  const ownerFits = calculateBid({
    ...input,
    tileCostPerSf: 0,
    siteHours: siteHours + kit.hoursOwnerHandle,
  });
  const ownerShort = calculateBid({
    ...input,
    tileCostPerSf: 0,
    siteHours: siteHours + kit.hoursOwnerHandle + kit.hoursCallbackTrip,
    otherCost: otherCost + kit.extraTileBuy,
  });

  const rows = [
    {
      supply: 'contractor-supplied',
      label: SUPPLY_PRESETS[0].label,
      detail: SUPPLY_PRESETS[0].detail,
      bid: contractor,
    },
    {
      supply: 'owner-fits',
      label: SUPPLY_PRESETS[1].label,
      detail: SUPPLY_PRESETS[1].detail,
      bid: ownerFits,
    },
    {
      supply: 'owner-short',
      label: SUPPLY_PRESETS[2].label,
      detail: SUPPLY_PRESETS[2].detail,
      bid: ownerShort,
    },
  ].map((row) => ({
    supply: row.supply,
    label: row.label,
    detail: row.detail,
    price: row.bid.price,
    totalCost: row.bid.totalCost,
    totalHours: row.bid.totalHours,
    tileMaterial: row.bid.tileMaterial,
    otherCost: row.bid.otherCost,
    siteHours: row.bid.siteHours,
    breakEvenPrice: row.bid.breakEvenPrice,
    laborOnly: scoreLaborOnly(row.bid, laborOnlyPrice),
    savedVsContractor: contractor.price - row.bid.price,
  }));

  const cheapest = Math.min(...rows.map((row) => row.price));
  return rows.map((row) => ({
    ...row,
    cheapest: row.price === cheapest,
    delta: row.price - cheapest,
    laborOnlyPrice,
  }));
}

/**
 * One-line verdict for the owner-supplied table. Names the
 * labor-only loss when that number is on the table; otherwise
 * names the bid drop from zeroing the tile.
 */
export function tileSupplyNote(rows) {
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new Error('Tile-supply comparison is missing rows');
  }
  const contractor = rows.find((row) => row.supply === 'contractor-supplied');
  const fits = rows.find((row) => row.supply === 'owner-fits');
  const short = rows.find((row) => row.supply === 'owner-short');
  if (!contractor || !fits || !short) {
    throw new Error('Tile-supply comparison is missing a supply row');
  }

  const drop = contractor.price - fits.price;
  const callbackLift = short.price - fits.price;
  if (contractor.laborOnly && fits.laborOnly) {
    const asked = contractor.laborOnly.price;
    if (contractor.laborOnly.belowBreakEven && fits.laborOnly.belowBreakEven) {
      return `At ${money(asked)} labor-only you lose money even when they bought the tile. Walk-away on the owner-supplied set is ${money(fits.breakEvenPrice)}.`;
    }
    if (contractor.laborOnly.belowBreakEven && !fits.laborOnly.belowBreakEven) {
      return `At ${money(asked)} the contractor-supplied job loses ${money(Math.abs(contractor.laborOnly.profit))}. The same labor-only number covers the set if their boxes actually cover the takeoff.`;
    }
    if (short.laborOnly?.belowBreakEven) {
      return `At ${money(asked)} the set covers if their boxes cover the takeoff. A short-order callback still loses ${money(Math.abs(short.laborOnly.profit))} — walk-away then is ${money(short.breakEvenPrice)}.`;
    }
    return `At ${money(asked)} both supply paths hold a margin. A short-order callback still adds ${money(callbackLift)} to the bid.`;
  }
  return `Zeroing the tile invoice drops the bid ${money(drop)}. A short-order callback puts ${money(callbackLift)} back on.`;
}

function money(value) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a bid as a plain-text draft the contractor can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this is
 * the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Tiled walk-in shower') {
  const money = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const perSf = result.pricePerTileSf === null
    ? 'n/a'
    : `${money(result.pricePerTileSf)} / sq ft of tile`;
  const bench = BENCH_PRESETS.find((item) => item.id === result.bench)?.label ?? result.bench;
  const glass = GLASS_PRESETS.find((item) => item.id === result.glass)?.label ?? result.glass;
  const demo = result.tearOutTub ? 'tub / surround tear-out included' : 'no tub tear-out this bid';
  const valve = result.relocateValve ? 'valve relocate included' : 'existing valve kept';
  const drain = result.linearDrain ? 'linear drain included' : 'standard drain';
  const curb = result.curbless ? 'curbless / barrier-free' : 'standard curb';
  const steam = result.steamUnit ? 'steam unit included' : 'no steam unit';
  return [
    'WALK-IN SHOWER BID',
    '',
    `Proposed shower price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${result.wallTileSf} sq ft walls + ${result.floorTileSf} sq ft floor (${result.tileBilledSf.toFixed(1)} billed with waste)`,
    `Price per tile square foot: ${perSf}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- Tile: ${result.wallTileSf} sq ft walls, ${result.floorTileSf} sq ft floor, ${result.wastePercent}% waste`,
    `- Waterproofing: ${result.waterproofSf} sq ft wet area; ${drain}; ${curb}`,
    `- ${demo}; ${valve}`,
    `- Niches: ${result.niches}; bench: ${bench}; glass: ${glass}`,
    `- ${steam}`,
    `- Wet-area labor: ${result.wetHours.toFixed(1)} h waterproofing / drain / curbless + ${result.finishHours.toFixed(1)} h niches / bench / steam`,
    '',
    'This is a draft for review. Confirm waterproofing method, slope, drain type, plumbing, glass measurements, fixtures, permits, and all pricing before sending. It is not a plumbing specification, a waterproofing warranty, or a building-code determination.',
  ].join('\n');
}
