// Pure bid arithmetic for a concrete driveway, patio, sidewalk, or slab.
// No network, no state: every rate, wage, and thickness is an input, so the
// result stays a transparent calculation the contractor can check against
// their ready-mix ticket and their own labor, not a claim about what any
// pour "should" cost.
//
// The method is the one the trade actually bids with: area × thickness gives
// cubic yards (concrete is sold by the yard), a waste factor covers over-excavate
// and spillage, forms are priced by linear feet of edge, finish labor is priced
// by the surface, and access (chute vs wheelbarrow vs pump) is a separate cost.
// That is what separates a defensible bid from a square-foot guess — a 20×40
// driveway at 4" and the same pad at 6" for an RV differ by 50% in material,
// and a stamped patio takes two to three times the finish labor of a broom
// driveway of the same size.

export const CU_FT_PER_CU_YD = 27;

// An 80-lb bag of ready-mix yields about 0.60 cubic feet. Used only as a
// comparison for small pads — once the pour is over a yard, bagging it is
// almost never the cheaper path.
export const BAG_80LB_CU_FT = 0.6;

// Ready-mix is typically billed in quarter-yard increments. Reporting the
// exact volume and the ordered volume separately is the point: contractors
// who price the exact yards and then get billed the rounded-up ticket eat
// the difference.
export const ORDER_INCREMENT_YD = 0.25;

// Common starting points for finish labor, in crew-hours per 100 square feet
// of pour-and-finish (not including forms, prep, or demo). These are
// ballpark figures to start from, NOT an industry standard or a guarantee:
// real rates depend on crew size, weather, slump, and how decorative the
// finish is. Contractors should replace them with times from their own jobs.
export const FINISH_PRESETS = Object.freeze([
  { id: 'broom', label: 'Broom finish', hoursPer100: 0.85 },
  { id: 'trowel', label: 'Smooth trowel', hoursPer100: 1.25 },
  { id: 'exposed', label: 'Exposed aggregate', hoursPer100: 1.7 },
  { id: 'stamped', label: 'Stamped / decorative', hoursPer100: 2.5 },
]);

export const REINFORCEMENT_PRESETS = Object.freeze([
  { id: 'none', label: 'None', costPerSqFt: 0 },
  { id: 'mesh', label: 'Wire mesh', costPerSqFt: 0.35 },
  { id: 'rebar', label: 'Rebar 12" o.c.', costPerSqFt: 0.85 },
]);

export const ACCESS_PRESETS = Object.freeze([
  { id: 'chute', label: 'Truck chute', extraHoursPer100: 0, pumpFee: 0 },
  { id: 'wheelbarrow', label: 'Wheelbarrow / buggy', extraHoursPer100: 0.45, pumpFee: 0 },
  { id: 'pump', label: 'Concrete pump', extraHoursPer100: 0.1, pumpFee: 650 },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * Area of one slab. Length × width wins when both are positive so a
 * contractor who typed the tape-measure numbers is not silently overridden
 * by a leftover square-footage field.
 */
export function slabArea({ lengthFt = 0, widthFt = 0, squareFeet = 0 } = {}) {
  const length = number(lengthFt ?? 0, 'Length');
  const width = number(widthFt ?? 0, 'Width');
  const area = number(squareFeet ?? 0, 'Square feet');
  if (length > 0 && width > 0) return length * width;
  return area;
}

/**
 * Perimeter of one slab. Same rule as area: tape-measure sides win. A slab
 * entered only as square footage has no computable edge, so forms for that
 * row must be entered as an override.
 */
export function slabPerimeter({ lengthFt = 0, widthFt = 0, perimeterFt = 0 } = {}) {
  const length = number(lengthFt ?? 0, 'Length');
  const width = number(widthFt ?? 0, 'Width');
  const override = number(perimeterFt ?? 0, 'Perimeter');
  if (length > 0 && width > 0) return 2 * (length + width);
  return override;
}

/** Cubic yards in a slab before waste. thickness is in inches. */
export function slabVolumeCuYd({ squareFeet, thicknessIn }) {
  const area = number(squareFeet ?? 0, 'Square feet');
  const thickness = number(thicknessIn ?? 0, 'Thickness');
  return (area * thickness) / 12 / CU_FT_PER_CU_YD;
}

/** Exact yards × (1 + waste%), then the billed increment the plant will charge. */
export function orderYards(rawYards, wastePct) {
  const raw = number(rawYards ?? 0, 'Yards');
  const waste = number(wastePct ?? 0, 'Waste');
  const withWaste = raw * (1 + waste / 100);
  const increment = ORDER_INCREMENT_YD;
  const ordered = withWaste === 0 ? 0 : Math.ceil(withWaste / increment - 1e-12) * increment;
  return { withWaste, ordered };
}

/** 80-lb bags needed to match a cubic-foot volume, rounded up. */
export function bagsForVolume(cuFt) {
  const volume = number(cuFt ?? 0, 'Cubic feet');
  if (volume === 0) return 0;
  return Math.ceil(volume / BAG_80LB_CU_FT - 1e-12);
}

/**
 * Price a concrete pour from its slabs and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, lengthFt?: number, widthFt?: number, squareFeet?: number, thicknessIn: number, perimeterFt?: number, hoursPer100: number}>} input.slabs
 *   One row per distinct pour. Splitting the job this way is the whole point:
 *   a 4" broom driveway and a 6" stamped patio are not the same unit price.
 * @param {number} input.wastePct            Extra yards for over-excavate and spill.
 * @param {number} input.concretePerYd       Ready-mix price, delivered, per cubic yard.
 * @param {number} input.formPerLf           Form material and stakes, per linear foot of edge.
 * @param {number} input.formHours           Hours to set and strip forms.
 * @param {number} input.reinforcementPerSqFt Wire or rebar material, per square foot.
 * @param {number} input.accessHoursPer100   Extra labor hours per 100 sq ft for access.
 * @param {number} input.pumpFee             Flat pump or short-hose charge.
 * @param {number} input.shortLoadThresholdYd Yards below which the plant adds a fee.
 * @param {number} input.shortLoadFee        That fee. Zero if the plant does not charge one.
 * @param {number} input.demoSqFt            Existing concrete to remove, square feet.
 * @param {number} input.demoThicknessIn     Thickness of that existing slab, inches.
 * @param {number} input.haulPerYd           Haul-off and dump, per cubic yard of demo.
 * @param {number} input.demoHours           Hours to break out and load the old slab.
 * @param {number} input.prepHours           Base, gravel, compaction, layout.
 * @param {number} input.hourlyWage          What the crew is paid per hour (blended).
 * @param {number} input.burdenRate          Payroll burden as a % on top of wage.
 * @param {number} input.otherCost           Permits, control joints, sealer, fuel.
 * @param {number} input.overheadRate        Business overhead as a % on direct cost.
 * @param {number} input.targetMargin        Net profit as a % of the final price.
 * @param {number|null} input.proposedPrice  Optional: a price already on the table.
 */
export function calculateBid(input) {
  const slabsInput = Array.isArray(input.slabs) ? input.slabs : [];
  if (slabsInput.length === 0) throw new Error('Add at least one slab to price');

  const wastePct = number(input.wastePct ?? 0, 'Waste');
  const concretePerYd = number(input.concretePerYd ?? 0, 'Concrete price');
  const formPerLf = number(input.formPerLf ?? 0, 'Form cost');
  const formHours = number(input.formHours ?? 0, 'Form hours');
  const reinforcementPerSqFt = number(input.reinforcementPerSqFt ?? 0, 'Reinforcement');
  const accessHoursPer100 = number(input.accessHoursPer100 ?? 0, 'Access hours');
  const pumpFee = number(input.pumpFee ?? 0, 'Pump fee');
  const shortLoadThresholdYd = number(input.shortLoadThresholdYd ?? 0, 'Short-load threshold');
  const shortLoadFee = number(input.shortLoadFee ?? 0, 'Short-load fee');
  const demoSqFt = number(input.demoSqFt ?? 0, 'Demo square feet');
  const demoThicknessIn = number(input.demoThicknessIn ?? 0, 'Demo thickness');
  const haulPerYd = number(input.haulPerYd ?? 0, 'Haul-off');
  const demoHours = number(input.demoHours ?? 0, 'Demo hours');
  const prepHours = number(input.prepHours ?? 0, 'Prep hours');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const slabs = slabsInput.map((slab, index) => {
    const label = slab.name?.trim() || `Slab ${index + 1}`;
    const lengthFt = number(slab.lengthFt ?? 0, `${label}: length`);
    const widthFt = number(slab.widthFt ?? 0, `${label}: width`);
    const squareFeetInput = number(slab.squareFeet ?? 0, `${label}: square feet`);
    const thicknessIn = number(slab.thicknessIn ?? 0, `${label}: thickness`, { allowZero: false });
    const perimeterOverride = number(slab.perimeterFt ?? 0, `${label}: perimeter`);
    const hoursPer100 = number(slab.hoursPer100 ?? 0, `${label}: finish hours`);

    const squareFeet = slabArea({ lengthFt, widthFt, squareFeet: squareFeetInput });
    const perimeterFt = slabPerimeter({ lengthFt, widthFt, perimeterFt: perimeterOverride });
    const rawYards = slabVolumeCuYd({ squareFeet, thicknessIn });
    const finishHours = (squareFeet / 100) * hoursPer100;
    const accessHours = (squareFeet / 100) * accessHoursPer100;

    return {
      name: label,
      lengthFt,
      widthFt,
      squareFeet,
      thicknessIn,
      perimeterFt,
      hoursPer100,
      rawYards,
      finishHours,
      accessHours,
    };
  });

  const totalSquareFeet = slabs.reduce((sum, s) => sum + s.squareFeet, 0);
  const totalPerimeterFt = slabs.reduce((sum, s) => sum + s.perimeterFt, 0);
  const rawYards = slabs.reduce((sum, s) => sum + s.rawYards, 0);
  const { withWaste, ordered: orderedYards } = orderYards(rawYards, wastePct);
  const finishHours = slabs.reduce((sum, s) => sum + s.finishHours, 0);
  const accessHours = slabs.reduce((sum, s) => sum + s.accessHours, 0);

  const concreteCost = orderedYards * concretePerYd;
  const formMaterialCost = totalPerimeterFt * formPerLf;
  const reinforcementCost = totalSquareFeet * reinforcementPerSqFt;
  const appliedShortLoadFee = orderedYards > 0 && orderedYards < shortLoadThresholdYd ? shortLoadFee : 0;
  const demoYards = slabVolumeCuYd({ squareFeet: demoSqFt, thicknessIn: demoThicknessIn || 0 });
  const demoHaulCost = demoYards * haulPerYd;

  const laborHours = finishHours + accessHours + formHours + prepHours + demoHours;
  const laborCost = laborHours * loadedWage;

  const directCost =
    concreteCost +
    formMaterialCost +
    reinforcementCost +
    pumpFee +
    appliedShortLoadFee +
    demoHaulCost +
    laborCost +
    otherCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const bags80lb = bagsForVolume(withWaste * CU_FT_PER_CU_YD);

  return {
    slabs: slabs.map(slab => ({
      ...slab,
      yardsShare: rawYards === 0 ? 0 : slab.rawYards / rawYards * 100,
      hoursShare: laborHours === 0 ? 0 : slab.finishHours / laborHours * 100,
    })),
    totalSquareFeet,
    totalPerimeterFt,
    rawYards,
    yardsWithWaste: withWaste,
    orderedYards,
    bags80lb,
    demoYards,
    loadedWage,
    finishHours,
    accessHours,
    formHours,
    prepHours,
    demoHours,
    laborHours,
    concreteCost,
    formMaterialCost,
    formLaborCost: formHours * loadedWage,
    reinforcementCost,
    pumpFee,
    shortLoadFee: appliedShortLoadFee,
    demoHaulCost,
    laborCost,
    otherCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSqFt: totalSquareFeet === 0 ? null : price / totalSquareFeet,
    pricePerYard: orderedYards === 0 ? null : price / orderedYards,
    effectiveHourlyRate: laborHours === 0 ? null : price / laborHours,
    breakEvenPrice: totalCost,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      hourlyRate: laborHours === 0 ? null : proposedPrice / laborHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}
