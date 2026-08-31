// Pure bid arithmetic for furnace and heat-pump replacement.
// No network, no state: every BTU of capacity, foot of duct, wage, and
// haul charge is an input, so the result stays a transparent calculation
// the shop can check against their own invoices rather than a claim
// about what any house "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$2,495 installed" furnace special treats a 60k 80% AFUE basement
// swap as the same job as a 100k 96% condensing unit in an attic
// with a matching coil, a gas upsize, extra duct, haul-away of the
// old unit, and a new thermostat. Homeowners (and a lot of estimator
// sheets) count the same kind of number. Extra duct past the included
// run, the attic, the coil, the gas upsize, and the haul-away do not
// scale with the trip charge. Matching a cheaper special written for
// the brochure basement swap is how a sold attic-and-coil job becomes
// a two-day loss after the first condensate run.
//
// Distinct from HVAC maintenance contracts (recurring service),
// mini-split / ductless installs (heads and line-set), water-heater
// replacement (a vented appliance), and standby-generator installs
// (a transfer switch). This prices a furnace or heat-pump changeout:
// the unit, where it sits, the coil, the gas, and the duct that is
// not in the coupon.

export const CAPACITY_PRESETS = Object.freeze([
  { id: '60k', label: '60,000 BTU / ~2.5 ton' },
  { id: '80k', label: '80,000 BTU / ~3 ton' },
  { id: '100k', label: '100,000 BTU / ~4 ton' },
]);

export const EQUIPMENT_PRESETS = Object.freeze([
  { id: 'eighty', label: '80% AFUE furnace' },
  { id: 'condensing', label: '96% condensing furnace' },
  { id: 'heatpump', label: 'Air-source heat pump' },
]);

export const LOCATION_PRESETS = Object.freeze([
  { id: 'basement', label: 'Basement / open utility' },
  { id: 'closet', label: 'Interior closet' },
  { id: 'attic', label: 'Attic' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '60k 80% AFUE basement swap, first 15 ft of duct included (the $2,495 brochure special)',
    capacity: '60k',
    equipment: 'eighty',
    location: 'basement',
    ductFeet: 12,
    includedDuctFeet: 15,
    addCoil: false,
    addGas: false,
    haulAway: false,
    addThermostat: false,
  },
  {
    label: '80k 96% condensing, basement, 25 ft duct, haul-away',
    capacity: '80k',
    equipment: 'condensing',
    location: 'basement',
    ductFeet: 25,
    includedDuctFeet: 15,
    addCoil: false,
    addGas: false,
    haulAway: true,
    addThermostat: false,
  },
  {
    label: '100k 96% attic, matching coil, gas upsize, 40 ft duct, haul-away, thermostat',
    capacity: '100k',
    equipment: 'condensing',
    location: 'attic',
    ductFeet: 40,
    includedDuctFeet: 15,
    addCoil: true,
    addGas: true,
    haulAway: true,
    addThermostat: true,
  },
  {
    label: '80k heat pump, attic, coil, haul-away, thermostat',
    capacity: '80k',
    equipment: 'heatpump',
    location: 'attic',
    ductFeet: 30,
    includedDuctFeet: 15,
    addCoil: true,
    addGas: false,
    haulAway: true,
    addThermostat: true,
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
 * Starting furnace / outdoor-unit cost from capacity. These are
 * ballpark shop figures, not a catalog. Picking capacity never
 * overwrites a cost the shop has already typed.
 */
export function suggestedCapacityKit(capacity) {
  const id = String(capacity);
  const table = { '60k': 1480, '80k': 1850, '100k': 2280 };
  if (!(id in table)) throw new Error('Unknown furnace capacity');
  return { furnaceCost: table[id] };
}

/**
 * Starting hang hours and the equipment premium from the unit type.
 * An 80% swap is not a 96% condensate run and is not a heat-pump
 * changeout.
 */
export function suggestedEquipmentKit(equipment) {
  const id = String(equipment);
  if (id === 'eighty') return { hoursFurnaceBase: 4, furnacePremium: 0 };
  if (id === 'condensing') return { hoursFurnaceBase: 5.25, furnacePremium: 400 };
  if (id === 'heatpump') return { hoursFurnaceBase: 6, furnacePremium: 1600 };
  throw new Error('Unknown equipment type');
}

/**
 * Starting location hours. A basement open-utility swap is not an
 * attic set.
 */
export function suggestedLocationKit(location) {
  const id = String(location);
  if (id === 'basement') return { hoursLocation: 0 };
  if (id === 'closet') return { hoursLocation: 1 };
  if (id === 'attic') return { hoursLocation: 2 };
  throw new Error('Unknown install location');
}

/**
 * Price a furnace or heat-pump replacement from extra duct past the
 * included run, attic versus basement, a matching coil, a gas upsize,
 * haul-away, a thermostat, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const ductFeet = number(input.ductFeet ?? 0, 'Duct run');
  const includedDuctFeet = number(input.includedDuctFeet ?? 0, 'Included duct footage');
  // A brochure special that "includes the first 15 ft" still prices a
  // shorter basement swap — extra footage is zero, not an invalid takeoff.

  const capacity = String(input.capacity ?? '60k');
  if (!CAPACITY_PRESETS.some((item) => item.id === capacity)) {
    throw new Error('Unknown furnace capacity');
  }
  const equipment = String(input.equipment ?? 'eighty');
  if (!EQUIPMENT_PRESETS.some((item) => item.id === equipment)) {
    throw new Error('Unknown equipment type');
  }
  const location = String(input.location ?? 'basement');
  if (!LOCATION_PRESETS.some((item) => item.id === location)) {
    throw new Error('Unknown install location');
  }

  const addCoil = flag(input.addCoil);
  const addGas = flag(input.addGas);
  const haulAway = flag(input.haulAway);
  const addThermostat = flag(input.addThermostat);
  const extraDuctFeet = Math.max(0, ductFeet - includedDuctFeet);

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursFurnaceBase = number(input.hoursFurnaceBase ?? 0, 'Hours to set the unit');
  const hoursLocation = number(input.hoursLocation ?? 0, 'Hours for the location');
  const hoursPerExtraDuctFoot = number(input.hoursPerExtraDuctFoot ?? 0, 'Hours per extra duct foot');
  const hoursCoil = number(input.hoursCoil ?? 0, 'Hours to set a matching coil');
  const hoursGas = number(input.hoursGas ?? 0, 'Hours for a gas upsize');
  const hoursHaul = number(input.hoursHaul ?? 0, 'Hours to haul the old unit');
  const hoursThermostat = number(input.hoursThermostat ?? 0, 'Hours for a thermostat');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const furnaceCost = number(input.furnaceCost ?? 0, 'Furnace / outdoor unit');
  const furnacePremium = number(input.furnacePremium ?? 0, 'Equipment premium');
  const coilCost = number(input.coilCost ?? 0, 'Matching coil');
  const gasCost = number(input.gasCost ?? 0, 'Gas fittings / upsize');
  const ductPerFoot = number(input.ductPerFoot ?? 0, 'Duct cost per foot');
  const haulFee = number(input.haulFee ?? 0, 'Haul-away / disposal');
  const thermostatCost = number(input.thermostatCost ?? 0, 'Thermostat');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const tripHours = hoursTrip;
  const hangHours = hoursFurnaceBase;
  const locationHours = hoursLocation;
  const ductHours = extraDuctFeet * hoursPerExtraDuctFoot;
  const coilHours = addCoil ? hoursCoil : 0;
  const gasHours = addGas ? hoursGas : 0;
  const haulHours = haulAway ? hoursHaul : 0;
  const thermostatHours = addThermostat ? hoursThermostat : 0;
  const accessHours = locationHours + ductHours;
  const packageHours = coilHours + gasHours + haulHours + thermostatHours;
  const totalHours = tripHours + hangHours + accessHours + packageHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const furnaceMaterial = furnaceCost + furnacePremium;
  const coilMaterial = addCoil ? coilCost : 0;
  const gasMaterial = addGas ? gasCost : 0;
  const ductMaterial = extraDuctFeet * ductPerFoot;
  const haulMaterial = haulAway ? haulFee : 0;
  const thermostatMaterial = addThermostat ? thermostatCost : 0;
  const permitMaterial = permitFee;
  const materialCost = furnaceMaterial + coilMaterial + gasMaterial + ductMaterial
    + haulMaterial + thermostatMaterial + permitMaterial;
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
    capacity,
    equipment,
    location,
    ductFeet,
    includedDuctFeet,
    extraDuctFeet,
    addCoil,
    addGas,
    haulAway,
    addThermostat,
    loadedWage,
    tripHours,
    hangHours,
    locationHours,
    ductHours,
    coilHours,
    gasHours,
    haulHours,
    thermostatHours,
    accessHours,
    packageHours,
    siteHours,
    totalHours,
    laborCost,
    furnaceMaterial,
    coilMaterial,
    gasMaterial,
    ductMaterial,
    haulMaterial,
    thermostatMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerDuctFoot: ductFeet === 0 ? null : price / ductFeet,
    pricePerExtraDuctFoot: extraDuctFeet === 0 ? null : price / extraDuctFeet,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      trip: hourShare(tripHours),
      hang: hourShare(hangHours),
      access: hourShare(accessHours),
      extras: hourShare(packageHours),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perDuctFoot: ductFeet === 0 ? null : proposedPrice / ductFeet,
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
export function formatBidSummary(result, jobLabel = 'Furnace replacement') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perFoot = result.pricePerDuctFoot === null
    ? 'n/a'
    : `${money(result.pricePerDuctFoot)} / ft of duct`;
  const capacity = CAPACITY_PRESETS.find((item) => item.id === result.capacity)?.label ?? result.capacity;
  const equipment = EQUIPMENT_PRESETS.find((item) => item.id === result.equipment)?.label ?? result.equipment;
  const location = LOCATION_PRESETS.find((item) => item.id === result.location)?.label ?? result.location;
  const coil = result.addCoil ? 'matching coil included' : 'no matching coil this bid';
  const gas = result.addGas ? 'gas upsize included' : 'no gas upsize this bid';
  const haul = result.haulAway ? 'haul-away of the old unit included' : 'no haul-away this bid';
  const thermostat = result.addThermostat ? 'thermostat included' : 'no thermostat this bid';
  return [
    'FURNACE / HEAT PUMP REPLACEMENT BID',
    '',
    `Proposed furnace / heat-pump price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${capacity}; ${equipment}; ${location}`,
    `Price per foot of duct: ${perFoot}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${capacity}; ${equipment}; ${location}; ${result.ductFeet} ft of duct (${result.extraDuctFeet} ft past the included ${result.includedDuctFeet} ft)`,
    `- ${coil}; ${gas}; ${haul}; ${thermostat}`,
    `- Set labor: ${result.hangHours.toFixed(1)} h; location / extra duct: ${result.accessHours.toFixed(1)} h; coil / gas / haul / thermostat: ${result.packageHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm capacity, AFUE or HSPF, location, coil match, gas, duct, permits, and all pricing before sending. It is not an HVAC design, a Manual J, a permit, or an engineering stamp.',
  ].join('\n');
}
