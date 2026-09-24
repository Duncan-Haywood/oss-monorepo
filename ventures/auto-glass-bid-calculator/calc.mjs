// Pure bid arithmetic for a mobile/in-shop auto-glass replacement (not a
// chip repair, not a body-shop collision estimate, not a fleet contract).
// No network, no state: every glass cost, calibration line, mobile fee,
// wage, and margin is an input, so the result stays a transparent
// calculation the shop can check against their own invoices rather than
// a claim about what any vehicle "should" cost.
//
// The method is the one the trade actually loses money on: a windshield is
// priced as "a windshield," and the line that gets forgotten on the way to
// a number is ADAS recalibration. Most vehicles built since roughly 2018
// carry a forward-facing camera, radar unit, or both mounted to or sighted
// through the windshield — lane-keep assist, automatic emergency braking,
// adaptive cruise. Replace the glass and the camera is either unbolted and
// rebolted (needs a static calibration, done in a shop bay with target
// boards) or simply loses its aim by a few millimeters (needs a dynamic
// calibration, a supervised road test), and a growing share of vehicles
// require both. Quoting the swap without pricing the calibration is not a
// rounding error — it is a job that is either driven away out of spec on a
// safety system, or one a shop eats the cost of the moment the mistake is
// caught. `calibrationMissing` below flags exactly that gap before the bid
// goes out, and it is the one number a flat "windshield replaced, $249"
// coupon can never see.
//
// Distinct from a resin chip *repair* (a different, much shorter job this
// calculator does not price) and from a collision-damage glass claim that
// is really a body-shop repair estimate.

export const GLASS_POSITION_PRESETS = Object.freeze([
  { id: 'windshield', label: 'Windshield' },
  { id: 'front-door', label: 'Front door glass' },
  { id: 'rear-door', label: 'Rear door glass' },
  { id: 'back-glass', label: 'Back / rear glass' },
]);

export const GLASS_SOURCE_PRESETS = Object.freeze([
  { id: 'oem', label: 'OEM glass' },
  { id: 'oee', label: 'OEM-equivalent aftermarket (OEE)' },
  { id: 'economy', label: 'Economy aftermarket' },
]);

export const CALIBRATION_PRESETS = Object.freeze([
  { id: 'none', label: 'No ADAS camera/sensor on this glass' },
  { id: 'dynamic', label: 'Dynamic calibration (supervised road test)' },
  { id: 'static', label: 'Static calibration (target boards, in-shop)' },
  { id: 'dual', label: 'Static + dynamic (both required)' },
]);

export const SERVICE_PRESETS = Object.freeze([
  { id: 'in-shop', label: 'Customer drives to the shop' },
  { id: 'mobile', label: 'Mobile — technician goes to the vehicle' },
]);

export const PAYER_PRESETS = Object.freeze([
  { id: 'cash', label: 'Cash / out of pocket' },
  { id: 'insurance', label: 'Billed through insurance (glass coverage)' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Economy aftermarket windshield, no ADAS, in-shop (the $249 coupon job)',
    position: 'windshield',
    glassSource: 'economy',
    calibration: 'none',
    service: 'in-shop',
    payer: 'cash',
  },
  {
    label: 'OEE windshield, dynamic calibration, mobile — common ADAS sedan',
    position: 'windshield',
    glassSource: 'oee',
    calibration: 'dynamic',
    service: 'mobile',
    payer: 'insurance',
  },
  {
    label: 'OEM windshield, static + dynamic calibration, mobile — camera and radar both mounted to the glass',
    position: 'windshield',
    glassSource: 'oem',
    calibration: 'dual',
    service: 'mobile',
    payer: 'insurance',
  },
  {
    label: 'Economy aftermarket back-glass replacement, in-shop',
    position: 'back-glass',
    glassSource: 'economy',
    calibration: 'none',
    service: 'in-shop',
    payer: 'cash',
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
 * Starting R&R (remove-and-replace) hours and trim/clip cost by glass
 * position. A windshield carries moldings, cowl clips, and a rain-sensor
 * gel pad more often than a door or back glass does; back glass usually
 * carries a defroster-grid reconnection. Ballpark shop figures, not a
 * catalog. Picking a position never overwrites a rate already typed.
 */
export function suggestedGlassKit(position) {
  const id = String(position);
  if (id === 'windshield') return { hoursRR: 1.1, moldingCost: 35 };
  if (id === 'front-door') return { hoursRR: 0.9, moldingCost: 15 };
  if (id === 'rear-door') return { hoursRR: 0.9, moldingCost: 15 };
  if (id === 'back-glass') return { hoursRR: 1.3, moldingCost: 20 };
  throw new Error('Unknown glass position');
}

/**
 * Starting glass cost by source tier. Real cost depends entirely on the
 * vehicle — a base sedan windshield and a heated, acoustic, camera-bracket
 * windshield for a luxury SUV are not the same part — so this is a
 * starting point to replace with the actual supplier invoice, not a price
 * list.
 */
export function suggestedSourceKit(glassSource) {
  const id = String(glassSource);
  if (id === 'oem') return { glassCost: 650 };
  if (id === 'oee') return { glassCost: 380 };
  if (id === 'economy') return { glassCost: 240 };
  throw new Error('Unknown glass source');
}

/**
 * Starting calibration hours (your shop's labor: setup, target-board
 * placement, the supervised road test) and calibration cost (sublet fee to
 * a calibration center or dealer, or the amortized cost of your own target
 * equipment and software subscription when done in-house). Both default to
 * zero when no ADAS camera or sensor is on this glass.
 */
export function suggestedCalibrationKit(calibration) {
  const id = String(calibration);
  if (id === 'none') return { hoursCalibration: 0, calibrationCost: 0 };
  if (id === 'dynamic') return { hoursCalibration: 0.6, calibrationCost: 85 };
  if (id === 'static') return { hoursCalibration: 1.2, calibrationCost: 150 };
  if (id === 'dual') return { hoursCalibration: 1.7, calibrationCost: 210 };
  throw new Error('Unknown calibration requirement');
}

/**
 * Starting trip fee and trip hours for a mobile job. In-shop carries
 * neither — the customer's drive is not billed.
 */
export function suggestedServiceKit(service) {
  const id = String(service);
  if (id === 'in-shop') return { tripFee: 0, tripHours: 0 };
  if (id === 'mobile') return { tripFee: 45, tripHours: 0.35 };
  throw new Error('Unknown service type');
}

/**
 * Price an auto-glass replacement from glass position, source, ADAS
 * calibration requirement, mobile/in-shop service, and the shop's own
 * costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const position = String(input.position ?? 'windshield');
  if (!GLASS_POSITION_PRESETS.some((item) => item.id === position)) {
    throw new Error('Unknown glass position');
  }
  const glassSource = String(input.glassSource ?? 'economy');
  if (!GLASS_SOURCE_PRESETS.some((item) => item.id === glassSource)) {
    throw new Error('Unknown glass source');
  }
  const calibration = String(input.calibration ?? 'none');
  if (!CALIBRATION_PRESETS.some((item) => item.id === calibration)) {
    throw new Error('Unknown calibration requirement');
  }
  const service = String(input.service ?? 'in-shop');
  if (!SERVICE_PRESETS.some((item) => item.id === service)) {
    throw new Error('Unknown service type');
  }
  const payer = String(input.payer ?? 'cash');
  if (!PAYER_PRESETS.some((item) => item.id === payer)) {
    throw new Error('Unknown payer');
  }

  const addWiperService = flag(input.addWiperService);

  const hoursRR = number(input.hoursRR ?? 0, 'Hours for removal and installation');
  const hoursCalibration = number(input.hoursCalibration ?? 0, 'Hours for ADAS calibration');
  const tripHours = number(input.tripHours ?? 0, 'Hours for the mobile trip');
  const wiperServiceHours = number(input.wiperServiceHours ?? 0, 'Hours for wiper-arm service');
  const siteHours = number(input.siteHours ?? 0, 'Site / setup hours');

  const glassCost = number(input.glassCost ?? 0, 'Glass cost');
  const moldingCost = number(input.moldingCost ?? 0, 'Moldings, clips, and sensor pad');
  const urethaneKitCost = number(input.urethaneKitCost ?? 0, 'Urethane / adhesive kit');
  const calibrationCost = number(input.calibrationCost ?? 0, 'Calibration sublet fee or equipment recovery');
  const tripFee = number(input.tripFee ?? 0, 'Mobile trip fee');
  const wiperServiceCost = number(input.wiperServiceCost ?? 0, 'Wiper-arm / blade parts');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const cashDiscountPercent = number(input.cashDiscountPercent ?? 0, 'Cash discount');
  if (cashDiscountPercent >= 100) throw new Error('Cash discount must be less than 100%');
  const deductible = number(input.deductible ?? 0, 'Deductible collected from the customer');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const rrHours = hoursRR;
  const calibrationHours = hoursCalibration;
  const mobileHours = tripHours;
  const wiperHours = addWiperService ? wiperServiceHours : 0;
  const totalHours = rrHours + calibrationHours + mobileHours + wiperHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const glassMaterial = glassCost;
  const moldingMaterial = moldingCost;
  const urethaneMaterial = urethaneKitCost;
  const calibrationMaterial = calibrationCost;
  const tripMaterial = tripFee;
  const wiperMaterial = addWiperService ? wiperServiceCost : 0;
  const materialCost = glassMaterial + moldingMaterial + urethaneMaterial
    + calibrationMaterial + tripMaterial + wiperMaterial;
  const softCost = travelAndEquipment;

  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const listPrice = totalCost / (1 - targetMargin / 100);

  const isCash = payer === 'cash';
  const price = isCash ? listPrice * (1 - cashDiscountPercent / 100) : listPrice;
  const cashSavings = isCash ? listPrice - price : 0;
  const profit = price - totalCost;

  const customerCollects = payer === 'insurance' ? Math.min(deductible, price) : price;
  const insurerBills = payer === 'insurance' ? Math.max(price - customerCollects, 0) : 0;

  // The one mistake this trade actually loses money on: an ADAS camera or
  // sensor is on this glass, but neither calibration hours nor a
  // calibration cost were ever entered — the bid as typed prices a
  // windshield with no calibration in it at all.
  const calibrationMissing = calibration !== 'none' && hoursCalibration === 0 && calibrationCost === 0;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);
  const hourShare = (amount) => (totalHours === 0 ? 0 : amount / totalHours * 100);

  return {
    position,
    glassSource,
    calibration,
    service,
    payer,
    addWiperService,
    loadedWage,
    rrHours,
    calibrationHours,
    mobileHours,
    wiperHours,
    siteHours,
    totalHours,
    laborCost,
    glassMaterial,
    moldingMaterial,
    urethaneMaterial,
    calibrationMaterial,
    tripMaterial,
    wiperMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    listPrice,
    price,
    cashSavings,
    profit,
    customerCollects,
    insurerBills,
    calibrationMissing,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      rr: hourShare(rrHours),
      calibration: hourShare(calibrationHours),
      mobile: hourShare(mobileHours),
      site: hourShare(siteHours + wiperHours),
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
 * Format a bid as a plain-text draft the shop can paste into a proposal or
 * a work order. Costs, wages, and margin are omitted on purpose — this is
 * the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Auto glass replacement') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const position = GLASS_POSITION_PRESETS.find((item) => item.id === result.position)?.label ?? result.position;
  const glassSource = GLASS_SOURCE_PRESETS.find((item) => item.id === result.glassSource)?.label ?? result.glassSource;
  const calibration = CALIBRATION_PRESETS.find((item) => item.id === result.calibration)?.label ?? result.calibration;
  const service = SERVICE_PRESETS.find((item) => item.id === result.service)?.label ?? result.service;
  const calibrationLine = result.calibration === 'none'
    ? 'No ADAS calibration required on this glass'
    : `${calibration} required and priced`;
  return [
    'AUTO GLASS REPLACEMENT BID',
    '',
    `Proposed price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${position}; ${glassSource}`,
    `Shop labor: ${result.totalHours.toFixed(2)} hours`,
    '',
    'SCOPE BASIS',
    `- ${position}; ${glassSource}; ${service}`,
    `- ${calibrationLine}`,
    result.payer === 'insurance'
      ? `- Billed to insurer: ${money(result.insurerBills)}; collected from customer: ${money(result.customerCollects)}`
      : `- Cash price${result.cashSavings > 0 ? ` (${money(result.cashSavings)} cash discount already applied)` : ''}`,
    '',
    'This is a draft for review. Confirm the vehicle, glass part number, ADAS calibration requirement, and all pricing before sending. It is not a determination that any safety system is functioning correctly after the work.',
  ].join('\n');
}
