// Pure bid arithmetic for electrical panel replacements and service
// upgrades. No network, no state: every amp, circuit, feeder foot, and
// wage is an input, so the result stays a transparent calculation the
// electrician can check against their own invoices rather than a claim
// about what any house "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "panel upgrade costs $2,500" quote treats a same-amp interior panel
// swap with the existing grounding as the same job as a 100A → 200A
// underground service with a new meter-main, new grounding electrodes,
// twenty AFCI/GFCI breakers, a forty-foot feeder through finished
// space, a utility disconnect, and temporary power. Homeowners (and a
// lot of estimator sheets) count the same kind of number. Circuits,
// AFCI, feeder feet, underground vs overhead, grounding, and temp
// power do not scale with the amp rating on the label. Matching a
// cheaper per-amp quote written for the brochure garage swap is how a
// sold 200A underground job becomes a two-day loss after the first
// finished-space feeder.
//
// Distinct from EV-charger install (a dedicated circuit, trench, and
// panel *space*), standby-generator install (transfer switch, pad, and
// gas), and mini-split install (line-set and a dedicated circuit).
// This prices a service and panel: the can, the landing of existing
// circuits, the path from the meter, grounding, and the utility.

export const SERVICE_PRESETS = Object.freeze([
  { id: 'overhead', label: 'Overhead mast / weatherhead' },
  { id: 'underground', label: 'Underground service lateral' },
]);

export const PANEL_STYLE_PRESETS = Object.freeze([
  { id: 'main-breaker', label: 'Main-breaker panel' },
  { id: 'meter-main', label: 'Meter-main combo' },
]);

export const LOCATION_PRESETS = Object.freeze([
  { id: 'garage', label: 'Garage / unfinished' },
  { id: 'basement', label: 'Basement / utility room' },
  { id: 'finished', label: 'Finished living space' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '100A same-amp garage panel swap, overhead, keep grounding (the brochure special)',
    existingAmps: 100,
    newAmps: 100,
    service: 'overhead',
    panelStyle: 'main-breaker',
    location: 'garage',
    feederFeet: 8,
    circuitCount: 10,
    afciCount: 0,
    replaceMeterSocket: false,
    newGrounding: false,
    temporaryPower: false,
  },
  {
    label: '100A → 200A overhead garage, meter-main, new ground rods, 16 circuits, 8 AFCI',
    existingAmps: 100,
    newAmps: 200,
    service: 'overhead',
    panelStyle: 'meter-main',
    location: 'garage',
    feederFeet: 12,
    circuitCount: 16,
    afciCount: 8,
    replaceMeterSocket: true,
    newGrounding: true,
    temporaryPower: false,
  },
  {
    label: '100A → 200A underground, 40 ft finished-space feeder, 20 AFCI, temp power, utility disconnect',
    existingAmps: 100,
    newAmps: 200,
    service: 'underground',
    panelStyle: 'meter-main',
    location: 'finished',
    feederFeet: 40,
    circuitCount: 20,
    afciCount: 20,
    replaceMeterSocket: true,
    newGrounding: true,
    temporaryPower: true,
  },
  {
    label: '200A → 400A class, underground, new meter-main, 24 circuits, 12 AFCI',
    existingAmps: 200,
    newAmps: 400,
    service: 'underground',
    panelStyle: 'meter-main',
    location: 'garage',
    feederFeet: 20,
    circuitCount: 24,
    afciCount: 12,
    replaceMeterSocket: true,
    newGrounding: true,
    temporaryPower: true,
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
 * Starting panel hardware cost from style and new amp rating. These are
 * ballpark distributor figures, not a catalog. Picking a style never
 * overwrites a cost the electrician has already typed.
 */
export function suggestedPanelCost(panelStyle, newAmps) {
  const style = String(panelStyle);
  const amps = number(newAmps, 'New service amps', { allowZero: false });
  if (!PANEL_STYLE_PRESETS.some((item) => item.id === style)) {
    throw new Error('Unknown panel style');
  }
  if (style === 'meter-main') {
    if (amps >= 350) return { panelCost: 1450 };
    if (amps >= 180) return { panelCost: 720 };
    return { panelCost: 520 };
  }
  if (amps >= 180) return { panelCost: 420 };
  if (amps >= 140) return { panelCost: 340 };
  return { panelCost: 280 };
}

/**
 * Starting path kit from overhead vs underground. Underground SE cable
 * is billed higher per foot and the mast kit drops to zero.
 */
export function suggestedServiceKit(service) {
  const id = String(service);
  if (id === 'overhead') {
    return { seCablePerFoot: 8, mastKitCost: 185, hoursUnderground: 0 };
  }
  if (id === 'underground') {
    return { seCablePerFoot: 14, mastKitCost: 0, hoursUnderground: 5 };
  }
  throw new Error('Unknown service path');
}

/**
 * Price a panel replacement or service upgrade from amp change, path,
 * circuits, AFCI, grounding, temp power, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const existingAmps = number(input.existingAmps ?? 0, 'Existing service amps', { allowZero: false });
  const newAmps = number(input.newAmps ?? 0, 'New service amps', { allowZero: false });
  const feederFeet = number(input.feederFeet ?? 0, 'Feeder feet');
  const circuitCount = number(input.circuitCount ?? 0, 'Circuit count');
  const afciCount = number(input.afciCount ?? 0, 'AFCI / GFCI count');
  if (afciCount > circuitCount) {
    throw new Error('AFCI / GFCI count cannot exceed the circuit count');
  }

  const service = String(input.service ?? 'overhead');
  if (!SERVICE_PRESETS.some((item) => item.id === service)) {
    throw new Error('Unknown service path');
  }
  const panelStyle = String(input.panelStyle ?? 'main-breaker');
  if (!PANEL_STYLE_PRESETS.some((item) => item.id === panelStyle)) {
    throw new Error('Unknown panel style');
  }
  const location = String(input.location ?? 'garage');
  if (!LOCATION_PRESETS.some((item) => item.id === location)) {
    throw new Error('Unknown panel location');
  }

  const replaceMeterSocket = flag(input.replaceMeterSocket);
  const newGrounding = flag(input.newGrounding);
  const temporaryPower = flag(input.temporaryPower);
  const ampUpgrade = newAmps > existingAmps;
  const utilityWork = ampUpgrade || replaceMeterSocket;

  const hoursPanelSwap = number(input.hoursPanelSwap ?? 0, 'Hours to swap the panel');
  const hoursServiceChange = number(input.hoursServiceChange ?? 0, 'Hours for a service change');
  const hoursUnderground = number(input.hoursUnderground ?? 0, 'Hours for an underground path');
  const hoursFinishedAccess = number(input.hoursFinishedAccess ?? 0, 'Hours for finished-space access');
  const hoursPerFeederFoot = number(input.hoursPerFeederFoot ?? 0, 'Hours per feeder foot');
  const hoursPerCircuit = number(input.hoursPerCircuit ?? 0, 'Hours per circuit');
  const hoursPerAfci = number(input.hoursPerAfci ?? 0, 'Hours per AFCI / GFCI');
  const hoursMeterSocket = number(input.hoursMeterSocket ?? 0, 'Hours to replace the meter socket');
  const hoursGrounding = number(input.hoursGrounding ?? 0, 'Hours for new grounding');
  const hoursTemporaryPower = number(input.hoursTemporaryPower ?? 0, 'Hours for temporary power');
  const hoursUtilityCoordination = number(input.hoursUtilityCoordination ?? 0, 'Hours for utility coordination');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const panelCost = number(input.panelCost ?? 0, 'Panel cost');
  const breakerCostEach = number(input.breakerCostEach ?? 0, 'Breaker cost each');
  const afciCostEach = number(input.afciCostEach ?? 0, 'AFCI / GFCI cost each');
  const seCablePerFoot = number(input.seCablePerFoot ?? 0, 'SE / SER cost per foot');
  const mastKitCost = number(input.mastKitCost ?? 0, 'Mast kit cost');
  const meterSocketCost = number(input.meterSocketCost ?? 0, 'Meter socket cost');
  const groundRodKit = number(input.groundRodKit ?? 0, 'Ground-rod kit');
  const tempPowerCost = number(input.tempPowerCost ?? 0, 'Temporary power cost');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');
  const utilityFee = number(input.utilityFee ?? 0, 'Utility disconnect / reconnect fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const swapHours = hoursPanelSwap;
  const serviceChangeHours = ampUpgrade ? hoursServiceChange : 0;
  const pathHours = service === 'underground' ? hoursUnderground : 0;
  const accessHours = location === 'finished' ? hoursFinishedAccess : 0;
  const feederHours = feederFeet * hoursPerFeederFoot;
  const circuitHours = circuitCount * hoursPerCircuit;
  const afciHours = afciCount * hoursPerAfci;
  const meterHours = replaceMeterSocket ? hoursMeterSocket : 0;
  const groundHours = newGrounding ? hoursGrounding : 0;
  const tempHours = temporaryPower ? hoursTemporaryPower : 0;
  const utilityHours = utilityWork ? hoursUtilityCoordination : 0;

  const serviceHours = serviceChangeHours + pathHours + meterHours + utilityHours;
  const landingHours = feederHours + circuitHours + afciHours + accessHours;
  const extraHours = groundHours + tempHours;
  const totalHours = swapHours + serviceHours + landingHours + extraHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const breakerMaterial = circuitCount * breakerCostEach;
  const afciMaterial = afciCount * afciCostEach;
  const feederMaterial = feederFeet * seCablePerFoot;
  const mastMaterial = service === 'overhead' ? mastKitCost : 0;
  const meterMaterial = replaceMeterSocket ? meterSocketCost : 0;
  const groundMaterial = newGrounding ? groundRodKit : 0;
  const tempMaterial = temporaryPower ? tempPowerCost : 0;
  const permitMaterial = permitFee;
  const utilityMaterial = utilityWork ? utilityFee : 0;
  const materialCost = panelCost + breakerMaterial + afciMaterial + feederMaterial
    + mastMaterial + meterMaterial + groundMaterial + tempMaterial
    + permitMaterial + utilityMaterial;
  const softCost = travelAndEquipment;

  const directCost = laborCost + materialCost + softCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;
  const ampDelta = Math.max(0, newAmps - existingAmps);

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const costShare = (amount) => (totalCost === 0 ? 0 : amount / totalCost * 100);
  const hourShare = (amount) => (totalHours === 0 ? 0 : amount / totalHours * 100);

  return {
    existingAmps,
    newAmps,
    ampDelta,
    ampUpgrade,
    service,
    panelStyle,
    location,
    feederFeet,
    circuitCount,
    afciCount,
    replaceMeterSocket,
    newGrounding,
    temporaryPower,
    utilityWork,
    loadedWage,
    swapHours,
    serviceChangeHours,
    pathHours,
    accessHours,
    feederHours,
    circuitHours,
    afciHours,
    meterHours,
    groundHours,
    tempHours,
    utilityHours,
    serviceHours,
    landingHours,
    extraHours,
    siteHours,
    totalHours,
    laborCost,
    panelCost,
    breakerMaterial,
    afciMaterial,
    feederMaterial,
    mastMaterial,
    meterMaterial,
    groundMaterial,
    tempMaterial,
    permitMaterial,
    utilityMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerNewAmp: newAmps === 0 ? null : price / newAmps,
    pricePerUpgradeAmp: ampDelta === 0 ? null : price / ampDelta,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      panel: hourShare(swapHours),
      service: hourShare(serviceHours),
      landing: hourShare(landingHours),
      extras: hourShare(extraHours),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perNewAmp: newAmps === 0 ? null : proposedPrice / newAmps,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the electrician can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this is
 * the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Electrical panel / service upgrade') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perAmp = result.pricePerNewAmp === null
    ? 'n/a'
    : `${money(result.pricePerNewAmp)} / amp of new service`;
  const service = SERVICE_PRESETS.find((item) => item.id === result.service)?.label ?? result.service;
  const panel = PANEL_STYLE_PRESETS.find((item) => item.id === result.panelStyle)?.label ?? result.panelStyle;
  const location = LOCATION_PRESETS.find((item) => item.id === result.location)?.label ?? result.location;
  const meter = result.replaceMeterSocket ? 'meter socket replacement included' : 'existing meter socket kept';
  const ground = result.newGrounding ? 'new grounding electrodes included' : 'existing grounding kept';
  const temp = result.temporaryPower ? 'temporary power included' : 'no temporary power this bid';
  const upgrade = result.ampUpgrade
    ? `${result.existingAmps}A → ${result.newAmps}A service upgrade`
    : `same-amp ${result.newAmps}A panel replacement`;
  return [
    'ELECTRICAL PANEL / SERVICE UPGRADE BID',
    '',
    `Proposed panel / service price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${upgrade}; ${service}; ${panel}`,
    `Price per amp of new service: ${perAmp}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${upgrade}; location: ${location}`,
    `- Feeder: ${result.feederFeet} ft; circuits landed: ${result.circuitCount}; AFCI / GFCI: ${result.afciCount}`,
    `- ${meter}; ${ground}; ${temp}`,
    `- Service / path labor: ${result.serviceHours.toFixed(1)} h; circuit landing: ${result.landingHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm ampacity, service path, grounding, meter, utility coordination, AFCI / GFCI requirements, permits, and all pricing before sending. It is not an electrical specification, a code determination, a permit, or an engineering stamp.',
  ].join('\n');
}
