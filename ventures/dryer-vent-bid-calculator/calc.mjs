// Pure bid arithmetic for dryer-vent cleaning jobs. No network, no
// state: every story, run foot, extra dryer, and wage is an input, so
// the result stays a transparent calculation the tech can check against
// their own brush and rod invoices rather than a claim about what any
// house "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$99 dryer vent special" treats a one-story wall cap with eight feet
// of pipe as the same job as a two-story roof cap with a 28-foot run,
// a camera pass, crushed flex in the laundry closet, and a bird nest.
// Homeowners (and a lot of coupon pages) count the same kind of
// number. Extra stories, extra feet, extra dryers, a rooftop
// termination, and a nest do not scale with "a dryer vent is a dryer
// vent." Matching a cheaper wall-cap special is how a sold roof job
// becomes a loss after the first extra story.
//
// Distinct from HVAC maintenance contracts (filter / coil / seasonal
// visit), chimney sweep (flue / creosote / CSIA), kitchen-hood /
// restaurant-exhaust cleaning (canopy / rooftop fan / NFPA-96), and
// appliance repair (the machine itself). This prices a dryer-vent
// clean: the stories, the run, the extra dryer, and the roof cap.

export const JOB_TYPE_PRESETS = Object.freeze([
  { id: 'wall', label: '1-story wall-cap special' },
  { id: 'two-story', label: '2-story wall or soffit' },
  { id: 'roof', label: 'Roof-cap / rooftop termination' },
  { id: 'multi', label: 'Multi-dryer / duplex laundry' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '1-story wall cap, 8 ft run, 1 dryer (the $99 special)',
    jobType: 'wall',
    stories: 1,
    runFeet: 8,
    extraDryers: 0,
    camera: false,
    flexReplace: false,
    nestBlockage: false,
    occupied: false,
  },
  {
    label: '2-story wall/soffit, 18 ft run, 1 dryer',
    jobType: 'two-story',
    stories: 2,
    runFeet: 18,
    extraDryers: 0,
    camera: false,
    flexReplace: false,
    nestBlockage: false,
    occupied: false,
  },
  {
    label: 'Roof cap, 2 stories, 28 ft run, camera, occupied',
    jobType: 'roof',
    stories: 2,
    runFeet: 28,
    extraDryers: 0,
    camera: true,
    flexReplace: false,
    nestBlockage: false,
    occupied: true,
  },
  {
    label: 'Duplex laundry, 2 extra dryers, 22 ft, camera, flex, nest, occupied',
    jobType: 'multi',
    stories: 2,
    runFeet: 22,
    extraDryers: 2,
    camera: true,
    flexReplace: true,
    nestBlockage: true,
    occupied: true,
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
 * Starting base hours. A roof-cap job does not change the extra-story
 * or extra-foot line; only the base-setup block moves. Picking a
 * preset never overwrites a cost the tech has already typed.
 */
export function suggestedJobHours(jobType) {
  const id = String(jobType);
  if (id === 'wall') return { hoursBaseSetup: 0.75 };
  if (id === 'two-story') return { hoursBaseSetup: 1.1 };
  if (id === 'roof') return { hoursBaseSetup: 1.5 };
  if (id === 'multi') return { hoursBaseSetup: 1.25 };
  throw new Error('Unknown job type');
}

/**
 * Price a dryer-vent cleaning job from stories, run length, extra
 * dryers, camera, flex replacement, nest/blockage, occupancy, and
 * the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const stories = number(input.stories ?? 0, 'Stories', { allowZero: false });
  const runFeet = number(input.runFeet ?? 0, 'Run feet', { allowZero: false });
  const extraDryers = number(input.extraDryers ?? 0, 'Extra dryers');
  const includedStories = number(input.includedStories ?? 0, 'Included stories', { allowZero: false });
  const includedRunFeet = number(input.includedRunFeet ?? 0, 'Included run feet', { allowZero: false });
  const includedDryers = number(input.includedDryers ?? 0, 'Included dryers', { allowZero: false });

  const jobType = String(input.jobType ?? 'wall');
  if (!JOB_TYPE_PRESETS.some((item) => item.id === jobType)) {
    throw new Error('Unknown job type');
  }

  const camera = flag(input.camera);
  const flexReplace = flag(input.flexReplace);
  const nestBlockage = flag(input.nestBlockage);
  const occupied = flag(input.occupied);

  const hoursBaseSetup = number(input.hoursBaseSetup ?? 0, 'Hours for a base setup');
  const hoursPerExtraStory = number(input.hoursPerExtraStory ?? 0, 'Hours per extra story');
  const hoursPerExtra10Feet = number(input.hoursPerExtra10Feet ?? 0, 'Hours per extra 10 feet');
  const hoursPerExtraDryer = number(input.hoursPerExtraDryer ?? 0, 'Hours per extra dryer');
  const hoursCamera = number(input.hoursCamera ?? 0, 'Hours for a camera pass');
  const hoursFlex = number(input.hoursFlex ?? 0, 'Hours for flex replacement');
  const hoursNest = number(input.hoursNest ?? 0, 'Hours for a nest / blockage');
  const hoursOccupied = number(input.hoursOccupied ?? 0, 'Hours for an occupied home');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const brushKit = number(input.brushKit ?? 0, 'Brush kit');
  const extraRodPer10Feet = number(input.extraRodPer10Feet ?? 0, 'Extra rod per 10 feet');
  const cameraFee = number(input.cameraFee ?? 0, 'Camera fee');
  const flexKit = number(input.flexKit ?? 0, 'Flex kit');
  const nestDisposal = number(input.nestDisposal ?? 0, 'Nest / blockage disposal');
  const roofSafetyKit = number(input.roofSafetyKit ?? 0, 'Roof safety kit');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const extraStories = Math.max(0, stories - includedStories);
  const extraFeet = Math.max(0, runFeet - includedRunFeet);
  const billableExtraDryers = extraDryers;
  const dryerCount = includedDryers + extraDryers;

  const setupHours = hoursBaseSetup;
  const storyHours = extraStories * hoursPerExtraStory;
  const runHours = (extraFeet / 10) * hoursPerExtra10Feet;
  const dryerHours = billableExtraDryers * hoursPerExtraDryer;
  const cameraHours = camera ? hoursCamera : 0;
  const flexHours = flexReplace ? hoursFlex : 0;
  const nestHours = nestBlockage ? hoursNest : 0;
  const occupiedHours = occupied ? hoursOccupied : 0;

  const accessHours = storyHours + runHours;
  const serviceHours = dryerHours + cameraHours + flexHours + nestHours + occupiedHours;
  const totalHours = setupHours + accessHours + serviceHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const rodMaterial = (extraFeet / 10) * extraRodPer10Feet;
  const cameraMaterial = camera ? cameraFee : 0;
  const flexMaterial = flexReplace ? flexKit : 0;
  const nestMaterial = nestBlockage ? nestDisposal : 0;
  const roofMaterial = jobType === 'roof' ? roofSafetyKit : 0;
  const materialCost = brushKit + rodMaterial + cameraMaterial + flexMaterial + nestMaterial + roofMaterial;
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
    stories,
    runFeet,
    extraDryers,
    dryerCount,
    includedStories,
    includedRunFeet,
    includedDryers,
    extraStories,
    extraFeet,
    camera,
    flexReplace,
    nestBlockage,
    occupied,
    loadedWage,
    setupHours,
    storyHours,
    runHours,
    dryerHours,
    cameraHours,
    flexHours,
    nestHours,
    occupiedHours,
    accessHours,
    serviceHours,
    siteHours,
    totalHours,
    laborCost,
    brushKit,
    rodMaterial,
    cameraMaterial,
    flexMaterial,
    nestMaterial,
    roofMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerDryer: dryerCount === 0 ? null : price / dryerCount,
    pricePerFoot: runFeet === 0 ? null : price / runFeet,
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
      perDryer: dryerCount === 0 ? null : proposedPrice / dryerCount,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the tech can paste into a
 * proposal. Costs, wages, and kit invoices are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Dryer vent cleaning') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perDryer = result.pricePerDryer === null
    ? 'n/a'
    : `${money(result.pricePerDryer)} / dryer`;
  const jobType = JOB_TYPE_PRESETS.find((item) => item.id === result.jobType)?.label ?? result.jobType;
  const extra = result.extraDryers === 0
    ? 'one dryer this bid'
    : `${result.extraDryers} extra dryer${result.extraDryers === 1 ? '' : 's'} included`;
  const camera = result.camera ? 'camera inspection included' : 'no camera this bid';
  const flex = result.flexReplace ? 'crushed-flex replacement included' : 'no flex replacement this bid';
  const nest = result.nestBlockage ? 'nest / heavy blockage included' : 'no nest this bid';
  const occupied = result.occupied ? 'occupied-home access included' : 'vacant / unoccupied access';
  return [
    'DRYER VENT CLEANING BID',
    '',
    `Proposed cleaning price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${result.stories} stor${result.stories === 1 ? 'y' : 'ies'}; ${result.runFeet} ft run; ${result.dryerCount} dryer${result.dryerCount === 1 ? '' : 's'}`,
    `Price per dryer: ${perDryer}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- Job type: ${jobType}`,
    `- ${extra}; ${camera}; ${flex}; ${nest}; ${occupied}`,
    `- Access labor (stories + run): ${result.accessHours.toFixed(1)} h; extras: ${result.serviceHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm stories, run length, dryer count, termination (wall, soffit, or roof), camera inspection, flex replacement, blockage, occupancy, and all pricing before sending. It is not a fire inspection, a building-code determination, a lint-clearance certificate, or a guarantee that any dryer will not overheat.',
  ].join('\n');
}
