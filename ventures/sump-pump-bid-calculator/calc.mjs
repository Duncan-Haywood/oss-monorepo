// Pure bid arithmetic for a sump-pump install / replacement (not a
// basement waterproofing system, not a well pump, not a sewer jet).
// No network, no state: every pump, pit, discharge foot, backup, wage,
// and permit is an input, so the result stays a transparent calculation
// the shop can check against their own invoices rather than a claim
// about what any basement "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$450 pump swap" special treats a 1/3 HP replacement in an existing
// pit with fifteen included feet of discharge as the same job as a
// new basin cut through a concrete slab, a 1/2 HP pump, forty feet of
// discharge, a battery backup, and a high-water alarm. Homeowners
// (and a lot of estimator sheets) count "a pump." Pit excavation,
// slab cutting, extra discharge past the included first fifteen feet,
// and the backup that is often more than the primary do not scale
// with that number. Matching a cheaper special written for the
// brochure swap is how a sold new-pit-and-battery job becomes a
// two-day loss after the first saw cut.
//
// Distinct from basement *waterproofing* (interior drain tile /
// French drain / crawl encapsulation) and from *well-pump* work
// (depth, pitless adapter, pressure tank). This prices a sump:
// the pump, the pit, the discharge, and the backup that is not
// in the coupon.

export const PUMP_PRESETS = Object.freeze([
  { id: 'third-hp', label: '1/3 HP submersible' },
  { id: 'half-hp', label: '1/2 HP submersible' },
  { id: 'three-quarter-hp', label: '3/4 HP submersible' },
]);

export const PIT_PRESETS = Object.freeze([
  { id: 'existing', label: 'Existing pit — swap only' },
  { id: 'new-dirt', label: 'New pit — dirt / crawl floor' },
  { id: 'new-slab', label: 'New pit — concrete slab cut' },
]);

export const BACKUP_PRESETS = Object.freeze([
  { id: 'none', label: 'No backup this bid' },
  { id: 'battery', label: 'Battery backup' },
  { id: 'water-powered', label: 'Water-powered backup' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: 'Existing pit, 1/3 HP, 15 ft discharge included (the $450 swap special)',
    pump: 'third-hp',
    pit: 'existing',
    backup: 'none',
    dischargeFeet: 15,
    includedDischargeFeet: 15,
    addAlarm: false,
    addCheckValve: true,
    freezeProtect: false,
  },
  {
    label: 'Existing pit, 1/3 HP, battery backup, alarm',
    pump: 'third-hp',
    pit: 'existing',
    backup: 'battery',
    dischargeFeet: 15,
    includedDischargeFeet: 15,
    addAlarm: true,
    addCheckValve: true,
    freezeProtect: false,
  },
  {
    label: 'New pit through slab, 1/2 HP, 40 ft discharge, battery backup, alarm',
    pump: 'half-hp',
    pit: 'new-slab',
    backup: 'battery',
    dischargeFeet: 40,
    includedDischargeFeet: 15,
    addAlarm: true,
    addCheckValve: true,
    freezeProtect: false,
  },
  {
    label: 'New pit in dirt crawl, 3/4 HP, water-powered backup, 50 ft discharge, freeze protect, permit',
    pump: 'three-quarter-hp',
    pit: 'new-dirt',
    backup: 'water-powered',
    dischargeFeet: 50,
    includedDischargeFeet: 15,
    addAlarm: true,
    addCheckValve: true,
    freezeProtect: true,
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
 * Starting pump cost and swap hours from the horsepower. These are
 * ballpark shop figures, not a catalog. Picking a pump never
 * overwrites a cost the shop has already typed.
 */
export function suggestedPumpKit(pump) {
  const id = String(pump);
  if (id === 'third-hp') {
    return { pumpCost: 185, hoursSwap: 1.1 };
  }
  if (id === 'half-hp') {
    return { pumpCost: 265, hoursSwap: 1.25 };
  }
  if (id === 'three-quarter-hp') {
    return { pumpCost: 385, hoursSwap: 1.4 };
  }
  throw new Error('Unknown pump size');
}

/**
 * Starting pit hours and basin costs. An existing-pit swap is not a
 * new basin cut through a slab.
 */
export function suggestedPitKit(pit) {
  const id = String(pit);
  if (id === 'existing') {
    return { hoursNewPit: 0, hoursSlabCut: 0, basinCost: 0, slabCutCost: 0 };
  }
  if (id === 'new-dirt') {
    return { hoursNewPit: 2.8, hoursSlabCut: 0, basinCost: 95, slabCutCost: 0 };
  }
  if (id === 'new-slab') {
    return { hoursNewPit: 2.8, hoursSlabCut: 2.4, basinCost: 95, slabCutCost: 285 };
  }
  throw new Error('Unknown pit type');
}

/**
 * Starting backup hours and kit cost. The backup is often more than
 * the primary pump — it is not a blended add-on to the swap special.
 */
export function suggestedBackupKit(backup) {
  const id = String(backup);
  if (id === 'none') {
    return { hoursBattery: 0, hoursWaterBackup: 0, batteryCost: 0, waterBackupCost: 0 };
  }
  if (id === 'battery') {
    return { hoursBattery: 1.1, hoursWaterBackup: 0, batteryCost: 420, waterBackupCost: 0 };
  }
  if (id === 'water-powered') {
    return { hoursBattery: 0, hoursWaterBackup: 1.4, batteryCost: 0, waterBackupCost: 380 };
  }
  throw new Error('Unknown backup type');
}

/**
 * Price a sump-pump install from pit type, extra discharge past the
 * included first fifteen feet, backup, alarm, freeze protection, and
 * the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const dischargeFeet = number(input.dischargeFeet ?? 0, 'Discharge footage');
  const includedDischargeFeet = number(input.includedDischargeFeet ?? 0, 'Included discharge footage');

  const pump = String(input.pump ?? 'third-hp');
  if (!PUMP_PRESETS.some((item) => item.id === pump)) {
    throw new Error('Unknown pump size');
  }
  const pit = String(input.pit ?? 'existing');
  if (!PIT_PRESETS.some((item) => item.id === pit)) {
    throw new Error('Unknown pit type');
  }
  const backup = String(input.backup ?? 'none');
  if (!BACKUP_PRESETS.some((item) => item.id === backup)) {
    throw new Error('Unknown backup type');
  }

  const addAlarm = flag(input.addAlarm);
  const addCheckValve = flag(input.addCheckValve);
  const freezeProtect = flag(input.freezeProtect);

  const extraDischargeFeet = Math.max(0, dischargeFeet - includedDischargeFeet);

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursSwap = number(input.hoursSwap ?? 0, 'Hours for the pump swap');
  const hoursNewPit = number(input.hoursNewPit ?? 0, 'Hours for a new pit');
  const hoursSlabCut = number(input.hoursSlabCut ?? 0, 'Hours for the slab cut');
  const hoursPerExtraDischargeFoot = number(
    input.hoursPerExtraDischargeFoot ?? 0,
    'Hours per extra discharge foot',
  );
  const hoursBattery = number(input.hoursBattery ?? 0, 'Hours for battery backup');
  const hoursWaterBackup = number(input.hoursWaterBackup ?? 0, 'Hours for water-powered backup');
  const hoursAlarm = number(input.hoursAlarm ?? 0, 'Hours for the alarm');
  const hoursFreeze = number(input.hoursFreeze ?? 0, 'Hours for freeze protection');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const pumpCost = number(input.pumpCost ?? 0, 'Pump cost');
  const basinCost = number(input.basinCost ?? 0, 'Basin cost');
  const slabCutCost = number(input.slabCutCost ?? 0, 'Slab-cut cost');
  const dischargePerFoot = number(input.dischargePerFoot ?? 0, 'Discharge cost per foot');
  const checkValveCost = number(input.checkValveCost ?? 0, 'Check valve');
  const batteryCost = number(input.batteryCost ?? 0, 'Battery backup kit');
  const waterBackupCost = number(input.waterBackupCost ?? 0, 'Water-powered backup kit');
  const alarmCost = number(input.alarmCost ?? 0, 'Alarm');
  const freezeCost = number(input.freezeCost ?? 0, 'Freeze-protection kit');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const tripHours = hoursTrip;
  const swapHours = hoursSwap;
  const pitHours = hoursNewPit;
  const slabHours = hoursSlabCut;
  const dischargeHours = extraDischargeFeet * hoursPerExtraDischargeFoot;
  const backupHours = hoursBattery + hoursWaterBackup;
  const alarmHours = addAlarm ? hoursAlarm : 0;
  const freezeHours = freezeProtect ? hoursFreeze : 0;
  const packageHours = pitHours + slabHours + dischargeHours + backupHours + alarmHours + freezeHours;
  const totalHours = tripHours + swapHours + packageHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const pumpMaterial = pumpCost;
  const pitMaterial = basinCost + slabCutCost;
  const dischargeMaterial = extraDischargeFeet * dischargePerFoot;
  const valveMaterial = addCheckValve ? checkValveCost : 0;
  const backupMaterial = batteryCost + waterBackupCost;
  const alarmMaterial = addAlarm ? alarmCost : 0;
  const freezeMaterial = freezeProtect ? freezeCost : 0;
  const permitMaterial = permitFee;
  const materialCost = pumpMaterial + pitMaterial + dischargeMaterial + valveMaterial
    + backupMaterial + alarmMaterial + freezeMaterial + permitMaterial;
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
    pump,
    pit,
    backup,
    dischargeFeet,
    includedDischargeFeet,
    extraDischargeFeet,
    addAlarm,
    addCheckValve,
    freezeProtect,
    loadedWage,
    tripHours,
    swapHours,
    pitHours,
    slabHours,
    dischargeHours,
    backupHours,
    alarmHours,
    freezeHours,
    packageHours,
    siteHours,
    totalHours,
    laborCost,
    pumpMaterial,
    pitMaterial,
    dischargeMaterial,
    valveMaterial,
    backupMaterial,
    alarmMaterial,
    freezeMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerDischargeFoot: dischargeFeet === 0 ? null : price / dischargeFeet,
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
      swap: hourShare(swapHours),
      extras: hourShare(packageHours),
      site: hourShare(siteHours),
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
 * Format a bid as a plain-text draft the shop can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this is
 * the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Sump pump install') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const pump = PUMP_PRESETS.find((item) => item.id === result.pump)?.label ?? result.pump;
  const pit = PIT_PRESETS.find((item) => item.id === result.pit)?.label ?? result.pit;
  const backup = BACKUP_PRESETS.find((item) => item.id === result.backup)?.label ?? result.backup;
  const alarm = result.addAlarm ? 'high-water alarm included' : 'no alarm this bid';
  const valve = result.addCheckValve ? 'check valve included' : 'no check valve this bid';
  const freeze = result.freezeProtect ? 'freeze protection included' : 'no freeze-protection adder this bid';
  return [
    'SUMP PUMP INSTALL BID',
    '',
    `Proposed sump-pump price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${pump}; ${pit}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${pump}; ${pit}; ${backup}`,
    `- ${result.dischargeFeet} ft of discharge (${result.extraDischargeFeet} ft past the included ${result.includedDischargeFeet} ft)`,
    `- ${valve}; ${alarm}; ${freeze}`,
    `- Swap labor: ${result.swapHours.toFixed(1)} h; pit / slab / extra discharge / backup: ${result.packageHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm pump size, pit type, discharge, backup, alarm, freeze protection, and all pricing before sending. It is not a waterproofing design, a drainage plan, a permit, or an engineering stamp.',
  ].join('\n');
}
