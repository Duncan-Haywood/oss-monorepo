// Pure bid arithmetic for an irrigation winterization (sprinkler blowout)
// stop. No network, no state: every zone count, wage, and add-on is an
// input, so the result stays a transparent calculation the contractor can
// check against their own compressor time and payroll rather than a claim
// about what any system "should" cost or whether a backflow is winterized
// correctly.
//
// The method is the one the trade actually loses money on when they skip it:
// a flat "$75 blowout" or "$8 a zone" cannot see that drip zones take longer
// than spray, that a backflow drain-and-insulate is a second job, or that
// the drive is most of a four-zone house. Hours come from zones × minutes
// per head type, then backflow, setup, travel, and a freeze-warning premium
// layer on. That is what separates a defensible quote from a neighborhood
// special.

export const SYSTEM_PRESETS = Object.freeze([
  { id: 'small-res', label: 'Small residential', sprayZones: 4, rotorZones: 0, dripZones: 1 },
  { id: 'typical-res', label: 'Typical residential', sprayZones: 6, rotorZones: 2, dripZones: 2 },
  { id: 'large-res', label: 'Large residential', sprayZones: 10, rotorZones: 4, dripZones: 3 },
  { id: 'commercial', label: 'Small commercial / HOA', sprayZones: 8, rotorZones: 12, dripZones: 4 },
]);

// Minutes one tech spends on a zone of that head type with a trailer
// compressor. These are ballpark starting points, NOT a production
// standard: real time depends on main size, valve location, and how dry
// the owner wants the laterals.
export const MINUTES_PER_ZONE = Object.freeze({
  spray: 4,
  rotor: 5,
  drip: 8,
});

export const MINUTES_PER_BACKFLOW = 15;

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * Price an irrigation winterization stop from its systems and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, sprayZones: number, rotorZones: number, dripZones: number}>} input.systems
 * @param {number} input.sprayMinutes
 * @param {number} input.rotorMinutes
 * @param {number} input.dripMinutes
 * @param {number} input.backflows
 * @param {number} input.backflowMinutes
 * @param {boolean} input.freezeWarning
 * @param {number} input.afterHoursPremium   Extra % on labor for freeze / after-hours calls
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate
 * @param {number} input.milesOneWay
 * @param {number} input.speedMph
 * @param {number} input.setupHours
 * @param {number} input.minOnSiteHours
 * @param {number} input.tripFee
 * @param {number} input.compressorCost
 * @param {number} input.fittingsCost
 * @param {number} input.otherCost
 * @param {number} input.overheadRate
 * @param {number} input.targetMargin
 * @param {number|null} input.proposedPrice
 */
export function calculateBid(input) {
  const systemsInput = Array.isArray(input.systems) ? input.systems : [];
  if (systemsInput.length === 0) throw new Error('Add at least one system to price');

  const sprayMinutes = number(input.sprayMinutes ?? MINUTES_PER_ZONE.spray, 'Spray minutes per zone', { allowZero: false });
  const rotorMinutes = number(input.rotorMinutes ?? MINUTES_PER_ZONE.rotor, 'Rotor minutes per zone', { allowZero: false });
  const dripMinutes = number(input.dripMinutes ?? MINUTES_PER_ZONE.drip, 'Drip minutes per zone', { allowZero: false });
  const backflows = number(input.backflows ?? 0, 'Backflows');
  const backflowMinutes = number(input.backflowMinutes ?? MINUTES_PER_BACKFLOW, 'Minutes per backflow');
  const freezeWarning = Boolean(input.freezeWarning);
  const afterHoursPremium = number(input.afterHoursPremium ?? 0, 'After-hours premium');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const milesOneWay = number(input.milesOneWay ?? 0, 'Miles one way');
  const speedMph = number(input.speedMph ?? 0, 'Travel speed', { allowZero: false });
  const setupHours = number(input.setupHours ?? 0, 'Setup hours');
  const minOnSiteHours = number(input.minOnSiteHours ?? 0, 'Minimum on-site hours');
  const tripFee = number(input.tripFee ?? 0, 'Trip / truck fee');
  const compressorCost = number(input.compressorCost ?? 0, 'Compressor / fuel');
  const fittingsCost = number(input.fittingsCost ?? 0, 'Fittings / adapters');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const systems = systemsInput.map((system, index) => {
    const label = system.name?.trim() || `System ${index + 1}`;
    const sprayZones = number(system.sprayZones ?? 0, `${label}: spray zones`);
    const rotorZones = number(system.rotorZones ?? 0, `${label}: rotor zones`);
    const dripZones = number(system.dripZones ?? 0, `${label}: drip zones`);
    const zoneCount = sprayZones + rotorZones + dripZones;
    const sprayHours = (sprayZones * sprayMinutes) / 60;
    const rotorHours = (rotorZones * rotorMinutes) / 60;
    const dripHours = (dripZones * dripMinutes) / 60;
    const blowoutHours = sprayHours + rotorHours + dripHours;
    return {
      name: label,
      sprayZones,
      rotorZones,
      dripZones,
      zoneCount,
      sprayHours,
      rotorHours,
      dripHours,
      blowoutHours,
    };
  });

  const totalZones = systems.reduce((sum, system) => sum + system.zoneCount, 0);
  const sprayHours = systems.reduce((sum, system) => sum + system.sprayHours, 0);
  const rotorHours = systems.reduce((sum, system) => sum + system.rotorHours, 0);
  const dripHours = systems.reduce((sum, system) => sum + system.dripHours, 0);
  const blowoutHours = sprayHours + rotorHours + dripHours;
  const backflowHours = (backflows * backflowMinutes) / 60;
  const rawOnSite = blowoutHours + backflowHours + setupHours;
  const hasWork = totalZones > 0 || backflows > 0;
  const minimumApplied = hasWork && rawOnSite < minOnSiteHours;
  const onSiteHours = minimumApplied ? minOnSiteHours : rawOnSite;
  const travelHours = (2 * milesOneWay) / speedMph;
  const totalHours = onSiteHours + travelHours;

  const baseLabor = totalHours * loadedWage;
  const premiumRate = freezeWarning ? afterHoursPremium / 100 : 0;
  const premiumLabor = baseLabor * premiumRate;
  const laborCost = baseLabor + premiumLabor;
  const materials = compressorCost + fittingsCost;
  const directCost = laborCost + materials + tripFee + otherCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    systems: systems.map(system => ({
      ...system,
      hoursShare: blowoutHours === 0 ? 0 : system.blowoutHours / blowoutHours * 100,
    })),
    totalZones,
    sprayHours,
    rotorHours,
    dripHours,
    blowoutHours,
    backflowHours,
    setupHours,
    rawOnSite,
    minimumApplied,
    onSiteHours,
    travelHours,
    totalHours,
    loadedWage,
    freezeWarning,
    afterHoursPremium: freezeWarning ? afterHoursPremium : 0,
    baseLabor,
    premiumLabor,
    laborCost,
    compressorCost,
    fittingsCost,
    materials,
    tripFee,
    otherCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerZone: totalZones === 0 ? null : price / totalZones,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      perZone: totalZones === 0 ? null : proposedPrice / totalZones,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}
