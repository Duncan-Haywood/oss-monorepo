// Pure bid arithmetic for stucco and EIFS repair. No network, no state:
// every crack foot, delaminated square foot, story, and wage is an input,
// so the result stays a transparent calculation the plasterer can check
// against their own invoices rather than a claim about what any wall
// "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$12 a square foot" stucco quote treats 40 feet of first-story hairline
// crack as the same job as 180 square feet of second-story EIFS torn back
// to the substrate with new mesh, four window flashings, a moisture
// investigation, and an integral-color match. Homeowners (and a lot of
// estimator sheets) count the same kind of number. Scaffolding, tear-off,
// flashing, and color match do not scale with a blended repair square
// footage. Matching a cheaper per-foot quote written for the brochure
// crack patch is how a sold second-story EIFS job becomes a two-day
// loss after the first lift day.
//
// Distinct from vinyl / fiber-cement siding (a cladding replacement),
// exterior painting (a coating on an intact surface), and foundation
// repair (structure, not finish). This prices a stucco or EIFS repair:
// the crack, the hollow, the tear-off, the story, and the flashings.

export const SYSTEM_PRESETS = Object.freeze([
  { id: 'hard-coat', label: 'Hard-coat / traditional 3-coat' },
  { id: 'one-coat', label: 'One-coat / synthetic' },
  { id: 'eifs', label: 'EIFS / synthetic stucco' },
]);

export const STORY_PRESETS = Object.freeze([
  { id: '1', label: 'Single story' },
  { id: '2', label: 'Two stories' },
  { id: '3', label: 'Three stories / gable' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '40 LF first-story hairline cracks, hard-coat, no scaffold (the brochure special)',
    system: 'hard-coat',
    stories: '1',
    crackLf: 40,
    delamSf: 0,
    tearoffSf: 0,
    windowFlashes: 0,
    caulkLf: 20,
    colorMatch: false,
    moistureInvestigation: false,
  },
  {
    label: '80 SF first-story one-coat delamination, 30 LF cracks, color match, one flashing',
    system: 'one-coat',
    stories: '1',
    crackLf: 30,
    delamSf: 80,
    tearoffSf: 0,
    windowFlashes: 1,
    caulkLf: 40,
    colorMatch: true,
    moistureInvestigation: false,
  },
  {
    label: '180 SF 2nd-story EIFS tear-off, 40 SF hollow, moisture, 4 flashings, color match',
    system: 'eifs',
    stories: '2',
    crackLf: 20,
    delamSf: 40,
    tearoffSf: 180,
    windowFlashes: 4,
    caulkLf: 60,
    colorMatch: true,
    moistureInvestigation: true,
  },
  {
    label: '400 SF 3-story hard-coat tear-off, gable access, color match, 2 flashings',
    system: 'hard-coat',
    stories: '3',
    crackLf: 0,
    delamSf: 0,
    tearoffSf: 400,
    windowFlashes: 2,
    caulkLf: 80,
    colorMatch: true,
    moistureInvestigation: false,
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
 * Starting mix, mesh, and tear-off hours from the wall system. These are
 * ballpark distributor / crew figures, not a catalog. Picking a system
 * never overwrites a rate the plasterer has already typed.
 */
export function suggestedSystemKit(system) {
  const id = String(system);
  if (id === 'hard-coat') {
    return { stuccoMixPerSf: 2.8, meshPerSf: 0.65, hoursPerTearoffSf: 0.32 };
  }
  if (id === 'one-coat') {
    return { stuccoMixPerSf: 2.4, meshPerSf: 0.9, hoursPerTearoffSf: 0.28 };
  }
  if (id === 'eifs') {
    return { stuccoMixPerSf: 3.8, meshPerSf: 1.4, hoursPerTearoffSf: 0.42 };
  }
  throw new Error('Unknown stucco system');
}

/**
 * Starting scaffold hours and rental from story count. Second-story
 * access is a lift day; a third-story gable is another one.
 */
export function suggestedAccessKit(stories) {
  const id = String(stories);
  if (id === '1') {
    return { hoursScaffold: 0, scaffoldRental: 0, hoursExtraStory: 0 };
  }
  if (id === '2') {
    return { hoursScaffold: 4, scaffoldRental: 280, hoursExtraStory: 0 };
  }
  if (id === '3') {
    return { hoursScaffold: 6, scaffoldRental: 420, hoursExtraStory: 3 };
  }
  throw new Error('Unknown story count');
}

/**
 * Price a stucco or EIFS repair from crack feet, hollow area, tear-off,
 * stories, flashing, color match, moisture work, and the contractor's
 * own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const crackLf = number(input.crackLf ?? 0, 'Crack linear feet');
  const delamSf = number(input.delamSf ?? 0, 'Delaminated square feet');
  const tearoffSf = number(input.tearoffSf ?? 0, 'Tear-off square feet');
  const windowFlashes = number(input.windowFlashes ?? 0, 'Window / door flashings');
  const caulkLf = number(input.caulkLf ?? 0, 'Control-joint / caulk feet');
  if (crackLf === 0 && delamSf === 0 && tearoffSf === 0 && windowFlashes === 0 && caulkLf === 0) {
    throw new Error('Add crack feet, hollow area, tear-off, flashing, or caulk to price');
  }

  const system = String(input.system ?? 'hard-coat');
  if (!SYSTEM_PRESETS.some((item) => item.id === system)) {
    throw new Error('Unknown stucco system');
  }
  const stories = String(input.stories ?? '1');
  if (!STORY_PRESETS.some((item) => item.id === stories)) {
    throw new Error('Unknown story count');
  }

  const colorMatch = flag(input.colorMatch);
  const moistureInvestigation = flag(input.moistureInvestigation);

  const hoursPerCrackLf = number(input.hoursPerCrackLf ?? 0, 'Hours per crack foot');
  const hoursPerDelamSf = number(input.hoursPerDelamSf ?? 0, 'Hours per hollow square foot');
  const hoursPerTearoffSf = number(input.hoursPerTearoffSf ?? 0, 'Hours per tear-off square foot');
  const hoursScaffold = number(input.hoursScaffold ?? 0, 'Hours to set scaffolding');
  const hoursExtraStory = number(input.hoursExtraStory ?? 0, 'Hours for a third-story / gable');
  const hoursPerWindowFlash = number(input.hoursPerWindowFlash ?? 0, 'Hours per window / door flashing');
  const hoursColorMatch = number(input.hoursColorMatch ?? 0, 'Hours for color match');
  const hoursMoisture = number(input.hoursMoisture ?? 0, 'Hours for moisture investigation');
  const hoursPerCaulkLf = number(input.hoursPerCaulkLf ?? 0, 'Hours per caulk foot');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const stuccoMixPerSf = number(input.stuccoMixPerSf ?? 0, 'Stucco / lamina cost per square foot');
  const mixPerCrackLf = number(input.mixPerCrackLf ?? 0, 'Mix cost per crack foot');
  const meshPerSf = number(input.meshPerSf ?? 0, 'Mesh / lath cost per square foot');
  const flashKitEach = number(input.flashKitEach ?? 0, 'Flashing kit each');
  const colorTintCost = number(input.colorTintCost ?? 0, 'Color-match tint cost');
  const scaffoldRental = number(input.scaffoldRental ?? 0, 'Scaffold / lift rental');
  const moistureKit = number(input.moistureKit ?? 0, 'Moisture-investigation kit');
  const caulkPerLf = number(input.caulkPerLf ?? 0, 'Caulk cost per foot');
  const dumpsterCost = number(input.dumpsterCost ?? 0, 'Dumpster / haul-off');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const crackHours = crackLf * hoursPerCrackLf;
  const delamHours = delamSf * hoursPerDelamSf;
  const tearoffHours = tearoffSf * hoursPerTearoffSf;
  const repairHours = crackHours + delamHours + tearoffHours;
  const scaffoldHours = stories === '1' ? 0 : hoursScaffold;
  const extraStoryHours = stories === '3' ? hoursExtraStory : 0;
  const accessHours = scaffoldHours + extraStoryHours;
  const flashHours = windowFlashes * hoursPerWindowFlash;
  const colorHours = colorMatch ? hoursColorMatch : 0;
  const moistureHours = moistureInvestigation ? hoursMoisture : 0;
  const caulkHours = caulkLf * hoursPerCaulkLf;
  const extraHours = flashHours + colorHours + moistureHours + caulkHours;
  const totalHours = repairHours + accessHours + extraHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const repairSf = delamSf + tearoffSf;
  const mixMaterial = repairSf * stuccoMixPerSf + crackLf * mixPerCrackLf;
  // Full mesh / lath on tear-off; patch mesh on hollow cut-outs.
  const meshMaterial = (tearoffSf + delamSf * 0.5) * meshPerSf;
  const flashMaterial = windowFlashes * flashKitEach;
  const colorMaterial = colorMatch ? colorTintCost : 0;
  const scaffoldMaterial = stories === '1' ? 0 : scaffoldRental;
  const moistureMaterial = moistureInvestigation ? moistureKit : 0;
  const caulkMaterial = caulkLf * caulkPerLf;
  const dumpsterMaterial = tearoffSf > 0 ? dumpsterCost : 0;
  const permitMaterial = permitFee;
  const materialCost = mixMaterial + meshMaterial + flashMaterial + colorMaterial
    + scaffoldMaterial + moistureMaterial + caulkMaterial + dumpsterMaterial
    + permitMaterial;
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
    system,
    stories,
    crackLf,
    delamSf,
    tearoffSf,
    repairSf,
    windowFlashes,
    caulkLf,
    colorMatch,
    moistureInvestigation,
    loadedWage,
    crackHours,
    delamHours,
    tearoffHours,
    repairHours,
    scaffoldHours,
    extraStoryHours,
    accessHours,
    flashHours,
    colorHours,
    moistureHours,
    caulkHours,
    extraHours,
    siteHours,
    totalHours,
    laborCost,
    mixMaterial,
    meshMaterial,
    flashMaterial,
    colorMaterial,
    scaffoldMaterial,
    moistureMaterial,
    caulkMaterial,
    dumpsterMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerRepairSf: repairSf === 0 ? null : price / repairSf,
    pricePerCrackLf: crackLf === 0 ? null : price / crackLf,
    effectiveHourlyRate: totalHours === 0 ? null : price / totalHours,
    breakEvenPrice: totalCost,
    shares: {
      labor: costShare(laborCost),
      material: costShare(materialCost),
      soft: costShare(softCost),
      overhead: costShare(overhead),
    },
    hourShares: {
      repair: hourShare(repairHours),
      access: hourShare(accessHours),
      extras: hourShare(extraHours),
      site: hourShare(siteHours),
    },
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      perRepairSf: repairSf === 0 ? null : proposedPrice / repairSf,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the plasterer can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose — this is
 * the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Stucco / EIFS repair') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perSf = result.pricePerRepairSf === null
    ? 'n/a (crack / flashing / caulk scope)'
    : `${money(result.pricePerRepairSf)} / sq ft of hollow + tear-off`;
  const system = SYSTEM_PRESETS.find((item) => item.id === result.system)?.label ?? result.system;
  const stories = STORY_PRESETS.find((item) => item.id === result.stories)?.label ?? result.stories;
  const color = result.colorMatch ? 'integral / finish color match included' : 'no color-match work this bid';
  const moisture = result.moistureInvestigation
    ? 'moisture investigation included'
    : 'no moisture investigation this bid';
  return [
    'STUCCO / EIFS REPAIR BID',
    '',
    `Proposed repair price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${system}; ${stories}`,
    `Price per sq ft of hollow + tear-off: ${perSf}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- Cracks: ${result.crackLf} lf; hollow / delaminated: ${result.delamSf} sf; tear-off to substrate: ${result.tearoffSf} sf`,
    `- Window / door flashings: ${result.windowFlashes}; control-joint / caulk: ${result.caulkLf} lf`,
    `- ${color}; ${moisture}`,
    `- Repair labor: ${result.repairHours.toFixed(1)} h; access / scaffold: ${result.accessHours.toFixed(1)} h; extras: ${result.extraHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm system, substrate, moisture, flashing, color match, access, permits, and all pricing before sending. It is not a stucco specification, a moisture determination, a permit, or an engineering stamp.',
  ].join('\n');
}
