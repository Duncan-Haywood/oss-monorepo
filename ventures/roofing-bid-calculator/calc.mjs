// Pure bid arithmetic for a residential reroof. No network, no state: every
// rate, wage, and material figure is an input, so the result stays a
// transparent calculation the contractor can check against their supplier
// invoice and crew timesheets rather than a claim about what any roof "should"
// cost.
//
// The method is the one the trade actually bids with: convert each roof
// section's *footprint* to *roof surface* with a pitch factor, express that
// surface in squares (100 sq ft), add waste, then layer material, tear-off,
// dump, labor (with a steepness multiplier), overhead, and margin. That is
// what separates a defensible bid from a house-square-footage guess — a
// 1,800 sq ft ranch at 6/12 is about 20 squares of roof, not 18, and a
// 12/12 section is 41% more surface than its footprint.

export const SQUARE_SQ_FT = 100;

// Common starting points for installed material and labor. These are ballpark
// figures to start from, NOT a supplier quote, an industry standard, or a
// guarantee. Real numbers depend on brand, region, deck condition, and crew.
// Contractors should replace them with their current invoice and timed rates.
export const MATERIAL_PRESETS = Object.freeze([
  { label: '3-tab asphalt', materialPerSquare: 95, installHoursPerSquare: 1.5, underlaymentPerSquare: 18 },
  { label: 'Architectural asphalt', materialPerSquare: 140, installHoursPerSquare: 1.8, underlaymentPerSquare: 22 },
  { label: 'Designer / luxury asphalt', materialPerSquare: 230, installHoursPerSquare: 2.1, underlaymentPerSquare: 28 },
  { label: 'Standing-seam metal', materialPerSquare: 480, installHoursPerSquare: 3.5, underlaymentPerSquare: 35 },
  { label: 'Stone-coated steel', materialPerSquare: 360, installHoursPerSquare: 3.0, underlaymentPerSquare: 30 },
  { label: 'Concrete tile', materialPerSquare: 420, installHoursPerSquare: 4.0, underlaymentPerSquare: 25 },
]);

export const SECTION_PRESETS = Object.freeze([
  { label: 'Main house' },
  { label: 'Attached garage' },
  { label: 'Detached garage' },
  { label: 'Porch / patio cover' },
  { label: 'Dormer' },
  { label: 'Addition' },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * Roof-surface multiplier for a given pitch, expressed as rise per 12 of run.
 * Surface = footprint × sqrt(1 + (rise/12)²). A dead-flat roof is 1.0; 6/12
 * is about 1.118; 12/12 is √2 ≈ 1.414.
 */
export function pitchFactor(risePer12) {
  const rise = number(risePer12, 'Pitch rise', { min: 0 });
  return Math.sqrt(1 + (rise / 12) ** 2);
}

/**
 * Labor multiplier for working on the slope. Walking a 12/12 is not the same
 * job as a 4/12: more setup, more safety, slower production. These steps are
 * common starting points, not OSHA categories or a safety determination.
 */
export function steepLaborMultiplier(risePer12) {
  const rise = number(risePer12, 'Pitch rise', { min: 0 });
  if (rise <= 6) return 1;
  if (rise <= 9) return 1.25;
  if (rise <= 12) return 1.5;
  return 2;
}

/**
 * Price a reroof from its sections and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, footprintSqFt: number, pitchRise: number, tearOffLayers: number}>} input.sections
 *   One row per roof plane group. Splitting this way is the point: a steep
 *   garage or a multi-layer porch cannot be priced at the same rate as a
 *   low-slope main.
 * @param {number} input.wastePercent            Cut-up waste, starter, ridge.
 * @param {number} input.materialPerSquare       Installed covering, per square.
 * @param {number} input.underlaymentPerSquare   Felt / synthetic, per square.
 * @param {number} input.accessoriesFlat         Ridge, starter, flashing, vents.
 * @param {number} input.installHoursPerSquare   Crew-hours to install one square.
 * @param {number} input.tearOffHoursPerSquare   Crew-hours to tear off one square.
 * @param {number} input.hourlyWage              What the crew is paid per hour.
 * @param {number} input.burdenRate              Payroll burden as a % on wage.
 * @param {number} input.dumpPerSquare           Landfill, per tear-off square.
 * @param {number} input.dumpsterFee             Bin drop / haul, flat.
 * @param {number} input.permitFee               Permit and inspection, flat.
 * @param {number} input.otherCost               Anything else billed to this job.
 * @param {number} input.overheadRate            Business overhead as a % on direct cost.
 * @param {number} input.targetMargin            Net profit as a % of the final price.
 * @param {number|null} input.proposedPrice      Optional price already on the table.
 */
export function calculateBid(input) {
  const sectionsInput = Array.isArray(input.sections) ? input.sections : [];
  if (sectionsInput.length === 0) throw new Error('Add at least one roof section to price');

  const wastePercent = number(input.wastePercent ?? 0, 'Waste');
  const materialPerSquare = number(input.materialPerSquare ?? 0, 'Material per square');
  const underlaymentPerSquare = number(input.underlaymentPerSquare ?? 0, 'Underlayment per square');
  const accessoriesFlat = number(input.accessoriesFlat ?? 0, 'Accessories');
  const installHoursPerSquare = number(input.installHoursPerSquare ?? 0, 'Install hours per square');
  const tearOffHoursPerSquare = number(input.tearOffHoursPerSquare ?? 0, 'Tear-off hours per square');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const dumpPerSquare = number(input.dumpPerSquare ?? 0, 'Dump per square');
  const dumpsterFee = number(input.dumpsterFee ?? 0, 'Dumpster fee');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const sections = sectionsInput.map((section, index) => {
    const label = section.name?.trim() || `Section ${index + 1}`;
    const footprintSqFt = number(section.footprintSqFt ?? 0, `${label}: footprint square feet`);
    const pitchRise = number(section.pitchRise ?? 0, `${label}: pitch rise`);
    const tearOffLayers = number(section.tearOffLayers ?? 0, `${label}: tear-off layers`);
    const factor = pitchFactor(pitchRise);
    const steep = steepLaborMultiplier(pitchRise);
    const surfaceSqFt = footprintSqFt * factor;
    const squares = surfaceSqFt / SQUARE_SQ_FT;
    // Waste is on the *new* covering (cuts, starter, ridge, valleys), not on
    // tear-off. Tear-off follows the existing surface times the number of
    // layers coming off.
    const materialSquares = squares * (1 + wastePercent / 100);
    const tearOffSquares = squares * tearOffLayers;
    const installHours = installHoursPerSquare * materialSquares * steep;
    const tearOffHours = tearOffHoursPerSquare * tearOffSquares * steep;
    const laborHours = installHours + tearOffHours;
    return {
      name: label,
      footprintSqFt,
      pitchRise,
      pitchFactor: factor,
      steepLaborMultiplier: steep,
      tearOffLayers,
      surfaceSqFt,
      squares,
      materialSquares,
      tearOffSquares,
      installHours,
      tearOffHours,
      laborHours,
      laborCost: laborHours * loadedWage,
    };
  });

  const totalFootprintSqFt = sections.reduce((sum, s) => sum + s.footprintSqFt, 0);
  const totalSurfaceSqFt = sections.reduce((sum, s) => sum + s.surfaceSqFt, 0);
  const totalSquares = sections.reduce((sum, s) => sum + s.squares, 0);
  const totalMaterialSquares = sections.reduce((sum, s) => sum + s.materialSquares, 0);
  const totalTearOffSquares = sections.reduce((sum, s) => sum + s.tearOffSquares, 0);
  const laborHours = sections.reduce((sum, s) => sum + s.laborHours, 0);
  const laborCost = laborHours * loadedWage;
  const coveringCost = materialPerSquare * totalMaterialSquares;
  const underlaymentCost = underlaymentPerSquare * totalMaterialSquares;
  const materialCost = coveringCost + underlaymentCost + accessoriesFlat;
  const dumpCost = dumpPerSquare * totalTearOffSquares + dumpsterFee;

  // Overhead is a markup on the direct cost of this job — office, sales,
  // insurance that is not already in burden. It is not applied to itself or
  // to profit.
  const directCost = laborCost + materialCost + dumpCost + permitFee + otherCost;
  const overhead = directCost * overheadRate / 100;
  const jobCost = directCost + overhead;

  // Margin is a share of price, not a markup on cost, because that is how
  // the customer's number is quoted and how the contractor's P&L reads it.
  const jobPrice = jobCost / (1 - targetMargin / 100);
  const jobProfit = jobPrice - jobCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    sections: sections.map(section => ({
      ...section,
      // Share of total labor hours. This is the line that shows a contractor
      // that a steep garage ate a third of the labor on 15% of the footprint.
      hoursShare: laborHours === 0 ? 0 : section.laborHours / laborHours * 100,
    })),
    totalFootprintSqFt,
    totalSurfaceSqFt,
    totalSquares,
    totalMaterialSquares,
    totalTearOffSquares,
    loadedWage,
    laborHours,
    laborCost,
    coveringCost,
    underlaymentCost,
    accessoriesFlat,
    materialCost,
    dumpCost,
    permitFee,
    otherCost,
    overhead,
    jobCost,
    jobPrice,
    jobProfit,
    // The two sanity numbers a contractor checks a bid against before sending
    // it: what it works out to per roof square, and what they are effectively
    // billing per labor hour.
    pricePerSquare: totalSquares === 0 ? null : jobPrice / totalSquares,
    pricePerFootprintSqFt: totalFootprintSqFt === 0 ? null : jobPrice / totalFootprintSqFt,
    effectiveHourlyRate: laborHours === 0 ? null : jobPrice / laborHours,
    // Price at which the job stops making money — the walk-away number to
    // hold when a homeowner asks them to match a cheaper quote.
    breakEvenPrice: jobCost,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - jobCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - jobCost) / proposedPrice * 100,
      hourlyRate: laborHours === 0 ? null : proposedPrice / laborHours,
      pricePerSquare: totalSquares === 0 ? null : proposedPrice / totalSquares,
      belowBreakEven: proposedPrice < jobCost,
    },
  };
}
