// Pure bid arithmetic for gutter-guard / leaf-filter installs. No
// network, no state: every lineal foot, extra story, extra miter,
// and wage is an input, so the result stays a transparent calculation
// the shop can check against their own coil and mesh invoices rather
// than a claim about what any house "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$8/foot leaf filter special" or a Home Depot DIY micromesh price
// treats a one-story ranch with 140 feet of empty 5" K-style as the
// same job as a two-story colonial with 220 feet, twelve miters, two
// extra downspouts, gutters packed with last fall's leaves, sixteen
// feet of rotten fascia, and occupied landscaping. Homeowners (and a
// lot of coupon pages) count the same kind of number. Extra stories,
// extra feet, extra miters, a clean-first pass, fascia repair, and a
// micromesh coil do not scale with "a gutter is a gutter." Matching
// a cheaper screen special is how a sold mesh job becomes a loss
// after the first extra story.
//
// Distinct from gutter *cleaning* (seasonal debris removal / downspout
// flush) and from roofing / shingle / reroof (squares and pitch). This
// prices a guard *install*: the feet, the stories, the miters, and
// the system.

export const JOB_TYPE_PRESETS = Object.freeze([
  { id: 'screen', label: 'Perforated screen / $8-ft special' },
  { id: 'foam', label: 'Foam insert' },
  { id: 'reverse', label: 'Reverse-curve / helmet' },
  { id: 'mesh', label: 'Micromesh / leaf filter' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '1-story ranch, 140 ft screen, empty gutters (the $8/ft special)',
    jobType: 'screen',
    linealFeet: 140,
    stories: 1,
    miters: 4,
    extraDownspouts: 0,
    fasciaRepairFeet: 0,
    cleanFirst: false,
    occupied: false,
    steepRoof: false,
  },
  {
    label: '1-story, 160 ft foam, 6 miters, occupied',
    jobType: 'foam',
    linealFeet: 160,
    stories: 1,
    miters: 6,
    extraDownspouts: 0,
    fasciaRepairFeet: 0,
    cleanFirst: false,
    occupied: true,
    steepRoof: false,
  },
  {
    label: '2-story colonial, 180 ft reverse-curve, steep roof, occupied',
    jobType: 'reverse',
    linealFeet: 180,
    stories: 2,
    miters: 8,
    extraDownspouts: 0,
    fasciaRepairFeet: 0,
    cleanFirst: false,
    occupied: true,
    steepRoof: true,
  },
  {
    label: '2-story colonial, 220 ft micromesh, clean-first, fascia, occupied',
    jobType: 'mesh',
    linealFeet: 220,
    stories: 2,
    miters: 12,
    extraDownspouts: 2,
    fasciaRepairFeet: 16,
    cleanFirst: true,
    occupied: true,
    steepRoof: false,
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
 * Starting base hours and coil cost. Changing system type never
 * overwrites a rate the shop has already typed — only the base-setup
 * and material-per-foot lines move, and only when they are still the
 * previous suggestion.
 */
export function suggestedJobHours(jobType) {
  const id = String(jobType);
  if (id === 'screen') return { hoursBaseSetup: 1.5, materialPerFoot: 2.25 };
  if (id === 'foam') return { hoursBaseSetup: 1.7, materialPerFoot: 3.4 };
  if (id === 'reverse') return { hoursBaseSetup: 2.1, materialPerFoot: 6.25 };
  if (id === 'mesh') return { hoursBaseSetup: 2.4, materialPerFoot: 8.5 };
  throw new Error('Unknown job type');
}

/**
 * Price a gutter-guard install from lineal feet, stories, miters,
 * extra downspouts, a clean-first pass, fascia repair, occupancy,
 * steep-roof access, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const linealFeet = number(input.linealFeet ?? 0, 'Lineal feet', { allowZero: false });
  const stories = number(input.stories ?? 0, 'Stories', { allowZero: false });
  const miters = number(input.miters ?? 0, 'Miters');
  const extraDownspouts = number(input.extraDownspouts ?? 0, 'Extra downspouts');
  const fasciaRepairFeet = number(input.fasciaRepairFeet ?? 0, 'Fascia repair feet');
  const includedFeet = number(input.includedFeet ?? 0, 'Included feet', { allowZero: false });
  const includedStories = number(input.includedStories ?? 0, 'Included stories', { allowZero: false });
  const includedMiters = number(input.includedMiters ?? 0, 'Included miters');
  const includedDownspouts = number(input.includedDownspouts ?? 0, 'Included downspouts', { allowZero: false });

  const jobType = String(input.jobType ?? 'screen');
  if (!JOB_TYPE_PRESETS.some((item) => item.id === jobType)) {
    throw new Error('Unknown job type');
  }

  const cleanFirst = flag(input.cleanFirst);
  const occupied = flag(input.occupied);
  const steepRoof = flag(input.steepRoof);

  const hoursBaseSetup = number(input.hoursBaseSetup ?? 0, 'Hours for a base setup');
  const hoursPerExtraStory = number(input.hoursPerExtraStory ?? 0, 'Hours per extra story');
  const hoursPerExtra10Feet = number(input.hoursPerExtra10Feet ?? 0, 'Hours per extra 10 feet');
  const hoursPerExtraMiter = number(input.hoursPerExtraMiter ?? 0, 'Hours per extra miter');
  const hoursPerExtraDownspout = number(input.hoursPerExtraDownspout ?? 0, 'Hours per extra downspout');
  const hoursCleanFirstPer10Feet = number(input.hoursCleanFirstPer10Feet ?? 0, 'Hours to clean per 10 feet');
  const hoursFasciaPer10Feet = number(input.hoursFasciaPer10Feet ?? 0, 'Hours of fascia per 10 feet');
  const hoursOccupied = number(input.hoursOccupied ?? 0, 'Hours for an occupied home');
  const hoursSteepRoof = number(input.hoursSteepRoof ?? 0, 'Hours for a steep roof');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const materialPerFoot = number(input.materialPerFoot ?? 0, 'Material per foot');
  const miterKit = number(input.miterKit ?? 0, 'Miter kit');
  const downspoutAdapter = number(input.downspoutAdapter ?? 0, 'Downspout adapter');
  const fasciaBoardPer10Feet = number(input.fasciaBoardPer10Feet ?? 0, 'Fascia board per 10 feet');
  const cleanDisposal = number(input.cleanDisposal ?? 0, 'Clean-first disposal');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const extraFeet = Math.max(0, linealFeet - includedFeet);
  const extraStories = Math.max(0, stories - includedStories);
  const extraMiters = Math.max(0, miters - includedMiters);
  const billableExtraDownspouts = extraDownspouts;
  const downspoutCount = includedDownspouts + extraDownspouts;

  const setupHours = hoursBaseSetup;
  const storyHours = extraStories * hoursPerExtraStory;
  const feetHours = (extraFeet / 10) * hoursPerExtra10Feet;
  const miterHours = extraMiters * hoursPerExtraMiter;
  const downspoutHours = billableExtraDownspouts * hoursPerExtraDownspout;
  const cleanHours = cleanFirst ? (linealFeet / 10) * hoursCleanFirstPer10Feet : 0;
  const fasciaHours = (fasciaRepairFeet / 10) * hoursFasciaPer10Feet;
  const occupiedHours = occupied ? hoursOccupied : 0;
  const steepHours = steepRoof ? hoursSteepRoof : 0;

  const accessHours = storyHours + feetHours + steepHours;
  const serviceHours = miterHours + downspoutHours + cleanHours + fasciaHours + occupiedHours;
  const totalHours = setupHours + accessHours + serviceHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const coilMaterial = linealFeet * materialPerFoot;
  const miterMaterial = extraMiters * miterKit;
  const downspoutMaterial = billableExtraDownspouts * downspoutAdapter;
  const fasciaMaterial = (fasciaRepairFeet / 10) * fasciaBoardPer10Feet;
  const cleanMaterial = cleanFirst ? cleanDisposal : 0;
  const materialCost = coilMaterial + miterMaterial + downspoutMaterial + fasciaMaterial + cleanMaterial;
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
    jobType,
    linealFeet,
    stories,
    miters,
    extraDownspouts,
    downspoutCount,
    fasciaRepairFeet,
    includedFeet,
    includedStories,
    includedMiters,
    includedDownspouts,
    extraFeet,
    extraStories,
    extraMiters,
    cleanFirst,
    occupied,
    steepRoof,
    loadedWage,
    setupHours,
    storyHours,
    feetHours,
    miterHours,
    downspoutHours,
    cleanHours,
    fasciaHours,
    occupiedHours,
    steepHours,
    accessHours,
    serviceHours,
    siteHours,
    totalHours,
    laborCost,
    coilMaterial,
    miterMaterial,
    downspoutMaterial,
    fasciaMaterial,
    cleanMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerFoot: linealFeet === 0 ? null : price / linealFeet,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      setup: hourShare(setupHours),
      access: hourShare(accessHours),
      extras: hourShare(serviceHours),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perFoot: linealFeet === 0 ? null : proposedPrice / linealFeet,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the shop can paste into a
 * proposal. Costs, wages, and coil invoices are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Gutter guard install') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perFoot = result.pricePerFoot === null
    ? 'n/a'
    : `${money(result.pricePerFoot)} / ft`;
  const jobType = JOB_TYPE_PRESETS.find((item) => item.id === result.jobType)?.label ?? result.jobType;
  const extra = result.extraMiters === 0
    ? 'miters inside the include'
    : `${result.extraMiters} extra miter${result.extraMiters === 1 ? '' : 's'} included`;
  const downspouts = result.extraDownspouts === 0
    ? 'no extra downspouts this bid'
    : `${result.extraDownspouts} extra downspout${result.extraDownspouts === 1 ? '' : 's'} included`;
  const clean = result.cleanFirst ? 'clean-first of packed gutters included' : 'empty gutters this bid';
  const fascia = result.fasciaRepairFeet > 0
    ? `${result.fasciaRepairFeet} ft of fascia repair included`
    : 'no fascia repair this bid';
  const occupied = result.occupied ? 'occupied-home access included' : 'vacant / unoccupied access';
  const steep = result.steepRoof ? 'steep-roof access included' : 'standard pitch this bid';
  return [
    'GUTTER GUARD INSTALL BID',
    '',
    `Proposed install price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${result.stories} stor${result.stories === 1 ? 'y' : 'ies'}; ${result.linealFeet} lf; ${result.miters} miter${result.miters === 1 ? '' : 's'}`,
    `Price per foot: ${perFoot}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- System: ${jobType}`,
    `- ${extra}; ${downspouts}; ${clean}; ${fascia}; ${occupied}; ${steep}`,
    `- Access labor (stories + extra feet + steep): ${result.accessHours.toFixed(1)} h; extras: ${result.serviceHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm lineal feet, stories, miter count, downspouts, system (screen, foam, reverse-curve, or micromesh), whether gutters must be cleaned first, fascia condition, occupancy, roof pitch, and all pricing before sending. It is not a roofing inspection, a building-code determination, a leak warranty, or a guarantee that any gutter will stay clear.',
  ].join('\n');
}
