// Pure bid arithmetic for *spraying residential foam insulation*,
// not blowing cellulose or fiberglass into an attic, not hanging batts,
// and not quoting a "price per square foot of attic" special. No
// network, no state: every span, thickness, cell, rim, wage, and extra
// is an input, so the result stays a transparent calculation the shop
// can check against their own drum invoices rather than a claim about
// what any house "should" cost, or whether any assembly meets code.
//
// The method is the one the trade actually loses money on: a published
// "$3.50 / sf of attic" special treats a 1,200 sf attic getting 8" of
// open-cell as the same job as that attic plus a closed-cell rim, or
// as a cathedral getting 5.5" of closed-cell plus an ignition barrier.
// Homeowners (and a lot of estimator sheets) count attic floor. Spray
// foam is sold and sprayed in board feet — square feet times inches.
// Rim joists, cell type, waste, and ignition coating never appear in
// the attic-square-foot number. Matching the coupon written for bags
// of blown-in is how a sold 8" open-cell attic becomes a drum-short
// loss after the first rim bay.
//
// Distinct from attic *blown-in* (bags, R-delta, baffles) and from
// wall *batt* or *dense-pack*. This prices board feet, the rim the
// coupon cannot see, open vs closed vs hybrid, and the margin that
// is not in the attic-square-foot special.
//
// Thicknesses, yields, and hours shipped here are common starting
// points used on residential bids. They are not an energy-code
// opinion, a permit, an R-value stamp, or a manufacturer warranty.
// Confirm the jurisdiction, the assembly, and a qualified professional
// before sending a price.

export const AREA_PRESETS = Object.freeze([
  { id: 'attic-floor', label: 'Attic floor (length × width)' },
  { id: 'cathedral', label: 'Cathedral / sloped roof (pitch-adjusted)' },
  { id: 'crawl-wall', label: 'Crawl / foundation wall (perimeter × height)' },
]);

export const CELL_PRESETS = Object.freeze([
  { id: 'open', label: 'Open-cell (thicker, cheaper per board foot)' },
  { id: 'closed', label: 'Closed-cell (thinner, vapor-closed)' },
  { id: 'hybrid', label: 'Hybrid (1" closed + open-cell fill)' },
]);

export const PITCH_PRESETS = Object.freeze([
  { id: '4/12', label: '4/12 (~1.05× floor)', factor: 1.054 },
  { id: '6/12', label: '6/12 (~1.12× floor)', factor: 1.118 },
  { id: '8/12', label: '8/12 (~1.20× floor)', factor: 1.202 },
  { id: '12/12', label: '12/12 (~1.41× floor)', factor: 1.414 },
]);

export const BARRIER_PRESETS = Object.freeze([
  { id: 'none', label: 'No ignition / thermal coating this bid' },
  { id: 'intumescent', label: 'Intumescent ignition barrier on exposed foam' },
  { id: 'thermal-already', label: 'Thermal barrier already in place (drywall)' },
]);

export const ACCESS_PRESETS = Object.freeze([
  { id: 'open', label: 'Open attic / easy access' },
  { id: 'tight-crawl', label: 'Tight crawl / limited headroom' },
  { id: 'occupied', label: 'Occupied / furniture / dust control' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '1,200 sf attic, 8" open-cell (the $3.50/sf special)',
    area: 'attic-floor',
    cell: 'open',
    pitch: '6/12',
    barrier: 'none',
    access: 'open',
    lengthFeet: 40,
    widthFeet: 30,
    thicknessInches: 8,
    rimLf: 0,
    rimHeightInches: 9.25,
    rimThicknessInches: 3,
    includePermit: false,
  },
  {
    label: 'Same attic + 80 lf closed-cell rim + ignition coating',
    area: 'attic-floor',
    cell: 'open',
    pitch: '6/12',
    barrier: 'intumescent',
    access: 'open',
    lengthFeet: 40,
    widthFeet: 30,
    thicknessInches: 8,
    rimLf: 80,
    rimHeightInches: 9.25,
    rimThicknessInches: 3,
    includePermit: false,
  },
  {
    label: '1,800 sf cathedral, 6/12, 5.5" closed-cell + ignition',
    area: 'cathedral',
    cell: 'closed',
    pitch: '6/12',
    barrier: 'intumescent',
    access: 'open',
    lengthFeet: 40,
    widthFeet: 36,
    thicknessInches: 5.5,
    rimLf: 0,
    rimHeightInches: 9.25,
    rimThicknessInches: 3,
    includePermit: true,
  },
  {
    label: '80 lf crawl walls, 2" closed-cell, tight access',
    area: 'crawl-wall',
    cell: 'closed',
    pitch: '6/12',
    barrier: 'intumescent',
    access: 'tight-crawl',
    lengthFeet: 80,
    widthFeet: 4,
    thicknessInches: 2,
    rimLf: 80,
    rimHeightInches: 9.25,
    rimThicknessInches: 2,
    includePermit: false,
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
 * Floor or wall square feet the coupon sees. Attic floor is length ×
 * width. Cathedral multiplies by a pitch factor. Crawl wall is
 * perimeter × height (length is the perimeter).
 */
export function suggestedAreaSf(lengthFeet, widthFeet, area, pitch) {
  const length = number(lengthFeet, 'Length (feet)', { allowZero: false });
  const width = number(widthFeet, 'Width / height (feet)', { allowZero: false });
  const id = String(area);
  if (id === 'attic-floor') return length * width;
  if (id === 'cathedral') {
    const factor = PITCH_PRESETS.find((item) => item.id === String(pitch))?.factor;
    if (!factor) throw new Error('Unknown pitch');
    return length * width * factor;
  }
  if (id === 'crawl-wall') return length * width;
  throw new Error('Unknown area');
}

/**
 * Board feet on the sprayed plane: square feet × inches. One board
 * foot is one square foot one inch thick — the unit drums are sold
 * in, and the unit an attic-square-foot coupon cannot see.
 */
export function suggestedAreaBf(areaSf, thicknessInches) {
  return number(areaSf, 'Area (square feet)') * number(thicknessInches, 'Thickness (inches)');
}

/**
 * Closed-cell inches in a hybrid lift. Open-cell fills the rest.
 * A full closed-cell or open-cell job does not split.
 */
export function suggestedHybridClosedInches(cell, thicknessInches) {
  const id = String(cell);
  const thickness = number(thicknessInches, 'Thickness (inches)');
  if (id === 'hybrid') return Math.min(1, thickness);
  return 0;
}

export function suggestedOpenBf(areaSf, thicknessInches, cell) {
  const area = number(areaSf, 'Area (square feet)');
  const thickness = number(thicknessInches, 'Thickness (inches)');
  const id = String(cell);
  if (id === 'open') return area * thickness;
  if (id === 'closed') return 0;
  if (id === 'hybrid') {
    const closedIn = suggestedHybridClosedInches(id, thickness);
    return area * Math.max(0, thickness - closedIn);
  }
  throw new Error('Unknown cell');
}

export function suggestedClosedBf(areaSf, thicknessInches, cell) {
  const area = number(areaSf, 'Area (square feet)');
  const thickness = number(thicknessInches, 'Thickness (inches)');
  const id = String(cell);
  if (id === 'closed') return area * thickness;
  if (id === 'open') return 0;
  if (id === 'hybrid') return area * suggestedHybridClosedInches(id, thickness);
  throw new Error('Unknown cell');
}

/**
 * Rim-joist board feet. Perimeter × (rim height in feet) × thickness
 * in inches. A 80 lf band at 9.25" sprayed 3" is 185 board feet the
 * attic-square-foot coupon never counted — and it is almost always
 * closed-cell.
 */
export function suggestedRimBf(rimLf, rimHeightInches, rimThicknessInches) {
  const rim = number(rimLf, 'Rim (lineal feet)');
  const height = number(rimHeightInches, 'Rim height (inches)');
  const thick = number(rimThicknessInches, 'Rim thickness (inches)');
  return rim * (height / 12) * thick;
}

/**
 * Starting waste. Open-cell oversprays more. Hybrid wastes both
 * setups. Closed-cell is tighter but still not zero.
 */
export function suggestedWastePercent(cell) {
  const id = String(cell);
  if (id === 'open') return 10;
  if (id === 'closed') return 8;
  if (id === 'hybrid') return 12;
  throw new Error('Unknown cell');
}

export function suggestedOrderBf(boardFeet, wastePercent) {
  return number(boardFeet, 'Board feet') * (1 + number(wastePercent, 'Waste percent') / 100);
}

/**
 * Informational nominal R from common published per-inch figures.
 * Not a code table, not a tested assembly, not a label.
 */
export function suggestedNominalR(thicknessInches, cell) {
  const thickness = number(thicknessInches, 'Thickness (inches)');
  const id = String(cell);
  if (id === 'open') return thickness * 3.7;
  if (id === 'closed') return thickness * 6.5;
  if (id === 'hybrid') {
    const closedIn = suggestedHybridClosedInches(id, thickness);
    return closedIn * 6.5 + Math.max(0, thickness - closedIn) * 3.7;
  }
  throw new Error('Unknown cell');
}

/**
 * Starting hours-per-1,000-bf and material-per-bf for the cell.
 * Picking a cell never overwrites a cost the shop has already typed.
 */
export function suggestedCellKit(cell) {
  const id = String(cell);
  if (id === 'open') return { hoursPer1000Bf: 1.4, foamPerBfOpen: 0.55, foamPerBfClosed: 1.25 };
  if (id === 'closed') return { hoursPer1000Bf: 1.8, foamPerBfOpen: 0.55, foamPerBfClosed: 1.25 };
  if (id === 'hybrid') return { hoursPer1000Bf: 1.7, foamPerBfOpen: 0.55, foamPerBfClosed: 1.25 };
  throw new Error('Unknown cell');
}

export function suggestedAccessKit(access) {
  const id = String(access);
  if (id === 'open') return { extraHours: 0 };
  if (id === 'tight-crawl') return { extraHours: 3.5 };
  if (id === 'occupied') return { extraHours: 2.2 };
  throw new Error('Unknown access');
}

export function suggestedBarrierKit(barrier) {
  const id = String(barrier);
  if (id === 'none') return { hoursPer100Sf: 0, coat: false };
  if (id === 'intumescent') return { hoursPer100Sf: 0.8, coat: true };
  if (id === 'thermal-already') return { hoursPer100Sf: 0, coat: false };
  throw new Error('Unknown barrier');
}

/**
 * Price a spray-foam job from the attic square feet the coupon sees
 * and the board feet, rim, cell, and ignition coating it cannot see.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const lengthFeet = number(input.lengthFeet ?? 0, 'Length (feet)', { allowZero: false });
  const widthFeet = number(input.widthFeet ?? 0, 'Width / height (feet)', { allowZero: false });
  const thicknessInches = number(input.thicknessInches ?? 0, 'Thickness (inches)', { allowZero: false });

  const area = String(input.area ?? 'attic-floor');
  if (!AREA_PRESETS.some((item) => item.id === area)) throw new Error('Unknown area');
  const cell = String(input.cell ?? 'open');
  if (!CELL_PRESETS.some((item) => item.id === cell)) throw new Error('Unknown cell');
  const pitch = String(input.pitch ?? '6/12');
  if (!PITCH_PRESETS.some((item) => item.id === pitch)) throw new Error('Unknown pitch');
  const barrier = String(input.barrier ?? 'none');
  if (!BARRIER_PRESETS.some((item) => item.id === barrier)) throw new Error('Unknown barrier');
  const access = String(input.access ?? 'open');
  if (!ACCESS_PRESETS.some((item) => item.id === access)) throw new Error('Unknown access');

  const includePermit = flag(input.includePermit);
  const includeRim = number(input.rimLf ?? 0, 'Rim (lineal feet)') > 0;

  const areaSf = number(input.areaSf ?? 0, 'Area (square feet)');
  const openBf = number(input.openBf ?? 0, 'Open-cell board feet');
  const closedBf = number(input.closedBf ?? 0, 'Closed-cell board feet');
  const rimBf = number(input.rimBf ?? 0, 'Rim board feet');
  const wastePercent = number(input.wastePercent ?? 0, 'Waste percent');
  const orderOpenBf = number(input.orderOpenBf ?? 0, 'Order open-cell board feet');
  const orderClosedBf = number(input.orderClosedBf ?? 0, 'Order closed-cell board feet');

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursPer1000Bf = number(input.hoursPer1000Bf ?? 0, 'Hours per 1,000 board feet');
  const hoursRimPerLf = number(input.hoursRimPerLf ?? 0, 'Hours per lf of rim');
  const hoursBarrierPer100Sf = number(input.hoursBarrierPer100Sf ?? 0, 'Hours per 100 sf of coating');
  const hoursAccess = number(input.hoursAccess ?? 0, 'Hours for access');
  const siteHours = number(input.siteHours ?? 0, 'Travel / site hours');

  const foamPerBfOpen = number(input.foamPerBfOpen ?? 0, 'Open-cell foam per board foot');
  const foamPerBfClosed = number(input.foamPerBfClosed ?? 0, 'Closed-cell foam per board foot');
  const barrierPerSf = number(input.barrierPerSf ?? 0, 'Ignition coating per square foot');
  const consumablesLump = number(input.consumablesLump ?? 0, 'Suits, tape, tips');
  const mobilizationFee = number(input.mobilizationFee ?? 0, 'Mobilization');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const rimLf = number(input.rimLf ?? 0, 'Rim (lineal feet)');
  const rimHeightInches = number(input.rimHeightInches ?? 0, 'Rim height (inches)');
  const rimThicknessInches = number(input.rimThicknessInches ?? 0, 'Rim thickness (inches)');

  const planeBf = openBf + closedBf;
  const sprayHours = planeBf * hoursPer1000Bf / 1000;
  const rimHours = includeRim ? rimLf * hoursRimPerLf : 0;
  const coat = suggestedBarrierKit(barrier).coat;
  const barrierHours = coat ? areaSf * hoursBarrierPer100Sf / 100 : 0;
  const accessHours = hoursAccess;
  const travelHours = siteHours;
  const tripHours = hoursTrip;
  const totalHours = tripHours + sprayHours + rimHours + barrierHours + accessHours + travelHours;

  const laborCost = totalHours * loadedWage;
  const openMaterial = orderOpenBf * foamPerBfOpen;
  const closedMaterial = orderClosedBf * foamPerBfClosed;
  const barrierMaterial = coat ? areaSf * barrierPerSf : 0;
  const materialCost = openMaterial + closedMaterial + barrierMaterial + consumablesLump;
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
  const foamDirect = sprayHours * loadedWage + openMaterial + closedMaterial;
  const extrasDirect = rimHours * loadedWage + barrierHours * loadedWage + barrierMaterial;

  return {
    area,
    cell,
    pitch,
    barrier,
    access,
    lengthFeet,
    widthFeet,
    thicknessInches,
    areaSf,
    openBf,
    closedBf,
    rimLf,
    rimHeightInches,
    rimThicknessInches,
    rimBf,
    wastePercent,
    orderOpenBf,
    orderClosedBf,
    includePermit,
    includeRim,
    loadedWage,
    tripHours,
    sprayHours,
    rimHours,
    barrierHours,
    accessHours,
    travelHours,
    totalHours,
    laborCost,
    openMaterial,
    closedMaterial,
    barrierMaterial,
    consumablesLump,
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
    planeBf,
    orderBf: orderOpenBf + orderClosedBf,
    nominalR: suggestedNominalR(thicknessInches, cell),
    pricePerAreaSf: areaSf === 0 ? null : price / areaSf,
    pricePerBoardFoot: planeBf + rimBf === 0 ? null : price / (planeBf + rimBf),
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    foamShareOfDirect: directCost === 0 ? 0 : foamDirect / directCost * 100,
    extrasShareOfDirect: directCost === 0 ? 0 : extrasDirect / directCost * 100,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(tripHours),
      spray: hourShare(sprayHours),
      rim: hourShare(rimHours),
      barrier: hourShare(barrierHours),
      access: hourShare(accessHours),
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
 * Same plane, rim, shop rates, and extras — three cells.
 * A $3.50/sf coupon pretends open-cell, closed-cell, and hybrid are
 * the same attic-square-foot job. They are not: board-foot split,
 * waste, and spray hours change. Rim stays closed-cell on every row.
 */
export function compareCellBids(input) {
  const areaSf = number(input.areaSf ?? 0, 'Area (square feet)');
  const thickness = number(input.thicknessInches ?? 0, 'Thickness (inches)', { allowZero: false });
  const rimBf = suggestedRimBf(input.rimLf ?? 0, input.rimHeightInches ?? 0, input.rimThicknessInches ?? 0);
  const selected = String(input.cell ?? 'open');
  const rows = CELL_PRESETS.map(({ id, label }) => {
    const kit = suggestedCellKit(id);
    const waste = suggestedWastePercent(id);
    const openBf = suggestedOpenBf(areaSf, thickness, id);
    const closedBf = suggestedClosedBf(areaSf, thickness, id);
    const result = calculateBid({
      ...input,
      cell: id,
      openBf,
      closedBf,
      rimBf,
      wastePercent: waste,
      orderOpenBf: suggestedOrderBf(openBf, waste),
      orderClosedBf: suggestedOrderBf(closedBf + rimBf, waste),
      hoursPer1000Bf: kit.hoursPer1000Bf,
    });
    return {
      cell: id,
      label,
      selected: selected === id,
      price: result.price,
      totalCost: result.totalCost,
      profit: result.profit,
      pricePerAreaSf: result.pricePerAreaSf,
      openBf,
      closedBf,
      orderBf: result.orderBf,
      vsSelected: 0,
    };
  });
  const current = rows.find((row) => row.selected) ?? rows[0];
  for (const row of rows) {
    row.vsSelected = row.price - current.price;
  }
  return rows;
}

/**
 * Format a bid as a plain-text draft the shop can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this is
 * the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Spray foam insulation') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const area = AREA_PRESETS.find((item) => item.id === result.area)?.label ?? result.area;
  const cell = CELL_PRESETS.find((item) => item.id === result.cell)?.label ?? result.cell;
  const barrier = BARRIER_PRESETS.find((item) => item.id === result.barrier)?.label ?? result.barrier;
  const extras = [
    `${result.lengthFeet}×${result.widthFeet} ft ${area.toLowerCase()} (${result.areaSf.toFixed(0)} sf sprayed plane)`,
    `${result.thicknessInches}" ${cell.toLowerCase()} = ${result.openBf.toFixed(0)} bf open / ${result.closedBf.toFixed(0)} bf closed`,
    result.rimBf
      ? `${result.rimLf.toFixed(0)} lf rim at ${result.rimHeightInches}" × ${result.rimThicknessInches}" = ${result.rimBf.toFixed(0)} bf closed-cell`
      : 'no rim joist this bid',
    `${result.orderBf.toFixed(0)} bf ordered at ${result.wastePercent}% waste`,
    `nominal starting R-${result.nominalR.toFixed(1)} (not a tested assembly)`,
    barrier,
    result.includePermit ? 'permit allowance included' : 'no permit allowance this bid',
  ];
  return [
    'SPRAY FOAM INSULATION BID',
    '',
    `Proposed spray-foam price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${area}`,
    `Foam: ${cell}; ${result.thicknessInches}" on ${result.areaSf.toFixed(0)} sf`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    result.pricePerAreaSf === null ? null : `Effective: ${money(result.pricePerAreaSf)} / sf of sprayed plane`,
    result.pricePerBoardFoot === null ? null : `Board feet: ${money(result.pricePerBoardFoot)} / bf`,
    '',
    'SCOPE BASIS',
    `- ${area}; ${cell}; ${result.thicknessInches}"`,
    `- ${result.lengthFeet}×${result.widthFeet} ft = ${result.areaSf.toFixed(0)} sf plane, ${result.planeBf.toFixed(0)} bf on the plane`,
    `- Setup: ${result.tripHours.toFixed(1)} h; spray: ${result.sprayHours.toFixed(1)} h; rim: ${result.rimHours.toFixed(1)} h; coating: ${result.barrierHours.toFixed(1)} h`,
    `- ${extras.join('; ')}`,
    '',
    'This is a draft for review. Confirm the spans, board feet, cell, thickness, rim, ignition coating, permit, and all pricing before sending. It is not a construction specification, an energy-code opinion, a permit, a manufacturer warranty, or an engineering stamp.',
  ].filter((line) => line !== null).join('\n');
}
