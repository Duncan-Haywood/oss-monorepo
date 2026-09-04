// Pure bid arithmetic for a paver patio / interlocking-paver install.
// No network, no state: every area, pattern, wage, and adder is an input,
// so the result stays a transparent calculation the contractor can check
// against their own invoices rather than a claim about what any patio
// "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// per-square-foot quote treats a 192 sq ft running-bond patio on 6 in of
// base as the same job as 192 sq ft of 45° herringbone on a 10 in driveway
// section. Pattern waste, excavation volume, haul-away, and edge restraint
// do not scale with the face the homeowner measures. Matching a cheaper
// per-foot quote written for a simple patio is how a sold job becomes a loss.

// Pattern waste and extra cut labor. These are ballpark figures to start
// from, NOT an industry standard: real waste depends on the cut list, the
// border course, and how many radii the layout has.
export const PATTERN_PRESETS = Object.freeze([
  { id: 'running', label: 'Running bond / stacked', wastePct: 7, laborFactor: 1.0 },
  { id: 'herringbone', label: 'Herringbone (90°)', wastePct: 10, laborFactor: 1.15 },
  { id: 'herringbone45', label: 'Herringbone (45°)', wastePct: 15, laborFactor: 1.25 },
  { id: 'circular', label: 'Circular / fan / random', wastePct: 18, laborFactor: 1.35 },
]);

// Base depth starting points. A patio that only sees foot traffic is not
// a driveway that sees a pickup. Quoting both at the same per-foot number
// is the usual miss.
export const USE_PRESETS = Object.freeze([
  { id: 'patio', label: 'Patio / sitting area', baseDepthIn: 6 },
  { id: 'walkway', label: 'Walkway / path', baseDepthIn: 6 },
  { id: 'driveway', label: 'Driveway / parking pad', baseDepthIn: 10 },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '12 × 16 ft running-bond patio',
    lengthFeet: 12,
    widthFeet: 16,
    patternId: 'running',
    useId: 'patio',
    haulAway: true,
  },
  {
    label: '16 × 20 ft herringbone patio',
    lengthFeet: 16,
    widthFeet: 20,
    patternId: 'herringbone',
    useId: 'patio',
    haulAway: true,
  },
  {
    label: '20 × 24 ft 45° herringbone driveway pad',
    lengthFeet: 20,
    widthFeet: 24,
    patternId: 'herringbone45',
    useId: 'driveway',
    haulAway: true,
  },
  {
    label: '4 × 40 ft running-bond walkway',
    lengthFeet: 4,
    widthFeet: 40,
    patternId: 'running',
    useId: 'walkway',
    haulAway: true,
  },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

export function suggestedWastePct(patternId) {
  const preset = PATTERN_PRESETS.find((item) => item.id === patternId);
  if (!preset) throw new Error('Unknown paver pattern');
  return preset.wastePct;
}

export function suggestedPatternLaborFactor(patternId) {
  const preset = PATTERN_PRESETS.find((item) => item.id === patternId);
  if (!preset) throw new Error('Unknown paver pattern');
  return preset.laborFactor;
}

export function suggestedBaseDepthIn(useId) {
  const preset = USE_PRESETS.find((item) => item.id === useId);
  if (!preset) throw new Error('Unknown paver use');
  return preset.baseDepthIn;
}

/**
 * Finished patio area from length × width. A zero side is rejected
 * rather than treated as a free patio.
 */
export function patioAreaSqFt(lengthFeet, widthFeet) {
  const length = number(lengthFeet, 'Length', { allowZero: false });
  const width = number(widthFeet, 'Width', { allowZero: false });
  return length * width;
}

export function patioPerimeterLf(lengthFeet, widthFeet) {
  const length = number(lengthFeet, 'Length', { allowZero: false });
  const width = number(widthFeet, 'Width', { allowZero: false });
  return 2 * (length + width);
}

export function cubicYardsFromArea(areaSqFt, depthIn) {
  const area = number(areaSqFt, 'Area');
  const depth = number(depthIn, 'Depth');
  return area * depth / 12 / 27;
}

export function suggestedExcavationHours(excavationCuYd, ydPerHour = 2) {
  const yards = number(excavationCuYd, 'Excavation volume');
  const rate = number(ydPerHour, 'Excavation rate', { allowZero: false });
  return yards / rate;
}

export function polymericBagCount(areaSqFt, coverageSf) {
  const area = number(areaSqFt, 'Area');
  const coverage = number(coverageSf, 'Polymeric-sand coverage', { allowZero: false });
  if (area === 0) return 0;
  return Math.ceil(area / coverage);
}

/**
 * Price a paver patio from finished area, pattern waste, base depth,
 * edge restraint, haul-away, and the contractor's own cost structure.
 *
 * @param {object} input
 * @param {number} [input.lengthFeet]
 * @param {number} [input.widthFeet]
 * @param {number} [input.areaSqFt]            Used when length/width omitted.
 * @param {number} [input.edgeLf]              Used when length/width omitted.
 * @param {number} input.wastePct
 * @param {number} input.patternLaborFactor
 * @param {number} input.hoursPerFinishedSf    Easy-access running-bond hours / sf.
 * @param {number} input.hoursPerEdgeLf
 * @param {number} input.excavateYdPerHour
 * @param {number} [input.excavationHours]     Override computed excavation hours.
 * @param {boolean} input.haulAway
 * @param {number} input.baseDepthIn
 * @param {number} input.beddingIn
 * @param {number} input.paverThicknessIn
 * @param {number} input.paverCostPerSf
 * @param {number} input.gravelCostPerCuYd
 * @param {number} input.sandCostPerCuYd
 * @param {number} input.polymericCoverageSf
 * @param {number} input.polymericBagCost
 * @param {number} input.edgeCostPerLf
 * @param {number} input.haulCostPerCuYd
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate
 * @param {number} input.travelAndEquipment
 * @param {number} input.overheadRate
 * @param {number} input.targetMargin
 * @param {number|null} [input.proposedPrice]
 */
export function calculateBid(input) {
  const hasSides = input.lengthFeet !== undefined && input.lengthFeet !== ''
    && input.widthFeet !== undefined && input.widthFeet !== '';

  let areaSqFt;
  let edgeLf;
  let lengthFeet = null;
  let widthFeet = null;

  if (hasSides) {
    lengthFeet = number(input.lengthFeet, 'Length', { allowZero: false });
    widthFeet = number(input.widthFeet, 'Width', { allowZero: false });
    areaSqFt = lengthFeet * widthFeet;
    const hasEdge = input.edgeLf !== undefined && input.edgeLf !== '';
    edgeLf = hasEdge ? number(input.edgeLf, 'Edge restraint') : patioPerimeterLf(lengthFeet, widthFeet);
  } else {
    areaSqFt = number(input.areaSqFt ?? 0, 'Patio area', { allowZero: false });
    edgeLf = number(input.edgeLf ?? 0, 'Edge restraint');
  }

  const wastePct = number(input.wastePct ?? 0, 'Pattern waste');
  const patternLaborFactor = number(input.patternLaborFactor ?? 0, 'Pattern labor factor', { allowZero: false });
  const hoursPerFinishedSf = number(input.hoursPerFinishedSf ?? 0, 'Hours per finished sq ft', { allowZero: false });
  const hoursPerEdgeLf = number(input.hoursPerEdgeLf ?? 0, 'Hours per edge foot');
  const excavateYdPerHour = number(input.excavateYdPerHour ?? 0, 'Excavation rate', { allowZero: false });
  const haulAway = Boolean(input.haulAway);
  const baseDepthIn = number(input.baseDepthIn ?? 0, 'Base depth', { allowZero: false });
  const beddingIn = number(input.beddingIn ?? 0, 'Bedding depth');
  const paverThicknessIn = number(input.paverThicknessIn ?? 0, 'Paver thickness', { allowZero: false });
  const paverCostPerSf = number(input.paverCostPerSf ?? 0, 'Paver cost per sq ft');
  const gravelCostPerCuYd = number(input.gravelCostPerCuYd ?? 0, 'Gravel cost');
  const sandCostPerCuYd = number(input.sandCostPerCuYd ?? 0, 'Bedding-sand cost');
  const polymericCoverageSf = number(input.polymericCoverageSf ?? 0, 'Polymeric-sand coverage', { allowZero: false });
  const polymericBagCost = number(input.polymericBagCost ?? 0, 'Polymeric-sand bag cost');
  const edgeCostPerLf = number(input.edgeCostPerLf ?? 0, 'Edge cost per foot');
  const haulCostPerCuYd = number(input.haulCostPerCuYd ?? 0, 'Haul-away cost');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const paverSqFt = areaSqFt * (1 + wastePct / 100);
  const excavationDepthIn = baseDepthIn + beddingIn + paverThicknessIn;
  const excavationCuYd = cubicYardsFromArea(areaSqFt, excavationDepthIn);
  const baseCuYd = cubicYardsFromArea(areaSqFt, baseDepthIn);
  const beddingCuYd = cubicYardsFromArea(areaSqFt, beddingIn);
  const polymericBags = polymericBagCount(areaSqFt, polymericCoverageSf);

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  // Install labor is on the finished face the crew walks, then the
  // pattern factor for extra cuts. Waste is material only — buying
  // more pavers does not by itself add hours.
  const installHours = areaSqFt * hoursPerFinishedSf * patternLaborFactor;
  const edgeHours = edgeLf * hoursPerEdgeLf;
  const hasExcavationOverride = input.excavationHours !== undefined && input.excavationHours !== '';
  const excavationHours = hasExcavationOverride
    ? number(input.excavationHours, 'Excavation hours')
    : suggestedExcavationHours(excavationCuYd, excavateYdPerHour);
  const totalHours = installHours + edgeHours + excavationHours;
  const laborCost = totalHours * loadedWage;

  const paverCost = paverSqFt * paverCostPerSf;
  const baseCost = baseCuYd * gravelCostPerCuYd;
  const beddingCost = beddingCuYd * sandCostPerCuYd;
  const polymericCost = polymericBags * polymericBagCost;
  const edgeCost = edgeLf * edgeCostPerLf;
  const haulCost = haulAway ? excavationCuYd * haulCostPerCuYd : 0;
  const materialCost = paverCost + baseCost + beddingCost + polymericCost + edgeCost;
  const softCost = haulCost + travelAndEquipment;

  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);

  return {
    lengthFeet,
    widthFeet,
    areaSqFt,
    edgeLf,
    wastePct,
    paverSqFt,
    patternLaborFactor,
    excavationDepthIn,
    excavationCuYd,
    baseCuYd,
    beddingCuYd,
    polymericBags,
    haulAway,
    loadedWage,
    installHours,
    edgeHours,
    excavationHours,
    totalHours,
    laborCost,
    paverCost,
    baseCost,
    beddingCost,
    polymericCost,
    edgeCost,
    haulCost,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSqFt: price / areaSqFt,
    costPerSqFt: totalCost / areaSqFt,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    breakEvenPerSqFt: totalCost / areaSqFt,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perSqFt: proposedPrice / areaSqFt,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the contractor can paste into a
 * proposal. Costs and wages are omitted on purpose — this is the
 * customer-facing side.
 */
export function formatBidSummary(result) {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const size = result.lengthFeet !== null && result.widthFeet !== null
    ? `${result.lengthFeet.toFixed(1)} × ${result.widthFeet.toFixed(1)} ft (${result.areaSqFt.toFixed(0)} sq ft)`
    : `${result.areaSqFt.toFixed(0)} sq ft`;
  return [
    'PAVER PATIO / HARDSCAPE BID',
    '',
    `Proposed install price: ${money(result.price)}`,
    `Patio: ${size}`,
    `Price per finished square foot: ${money(result.pricePerSqFt)}`,
    `Install labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- Finished area ${result.areaSqFt.toFixed(0)} sq ft`,
    `- Pavers purchased including pattern waste: ${result.paverSqFt.toFixed(0)} sq ft`,
    `- Excavation: ${result.excavationCuYd.toFixed(1)} cu yd (${result.excavationDepthIn.toFixed(2)} in deep)`,
    `- Compacted base: ${result.baseCuYd.toFixed(1)} cu yd`,
    `- Edge restraint: ${result.edgeLf.toFixed(0)} ft`,
    `- Polymeric joint sand: ${result.polymericBags} bag${result.polymericBags === 1 ? '' : 's'}`,
    result.haulAway ? '- Spoil haul-away included in this draft' : '- Spoil left on site (no haul-away)',
    '',
    'This is a draft for review. Confirm base depth, compaction, drainage, pattern waste, edge restraint, permits, and all pricing before sending. It is not an engineered pavement design.',
  ].join('\n');
}
