// Pure bid arithmetic for residential and light-commercial air-duct
// cleaning jobs. No network, no state: every system, vent, extra
// story, coil clean, and wage is an input, so the result stays a
// transparent calculation the shop can check against their own
// payroll rather than a claim about what any house "should" cost.
//
// The method is the one the trade actually loses money on: a
// published "$99 whole-house special" (or a "$299 after-coupon"
// price) treats one furnace and ten vents on a ranch as the same
// job as a two-system colonial with extra returns, a crawl, a coil
// clean, and an occupied home. Homeowners (and a lot of coupon
// pages) count the same kind of number. Extra systems, extra vents,
// extra stories, crawl access, and a coil do not scale with "a
// house is a house." Matching the ranch coupon is how a sold
// colonial becomes a loss after the first extra air handler.
//
// Distinct from HVAC maintenance contracts (filters and tune-ups),
// dryer-vent cleaning (one appliance run), kitchen-hood / NFPA-96
// exhaust, chimney sweep, and mini-split install. This prices an
// *air-duct cleaning* job: the systems, the vents, the stories,
// and the coil.

export const JOB_TYPE_PRESETS = Object.freeze([
  { id: 'residential', label: 'Residential whole-house / $99 special' },
  { id: 'two_system', label: 'Two-system / split-level house' },
  { id: 'heavy', label: 'Heavy debris / pet hair' },
  { id: 'commercial', label: 'Light commercial / multi-zone' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '1-system ranch, 10 vents, 1 story (the $99 / $299 special)',
    jobType: 'residential',
    systems: 1,
    vents: 10,
    returns: 1,
    stories: 1,
    crawl: false,
    occupied: false,
    coil: false,
    sanitizer: false,
    heavyDebris: false,
  },
  {
    label: '1-system 14-vent ranch, occupied, coil + sanitizer',
    jobType: 'residential',
    systems: 1,
    vents: 14,
    returns: 2,
    stories: 1,
    crawl: false,
    occupied: true,
    coil: true,
    sanitizer: true,
    heavyDebris: false,
  },
  {
    label: '2-system colonial, 18 vents, crawl, occupied, coil + sanitizer',
    jobType: 'two_system',
    systems: 2,
    vents: 18,
    returns: 3,
    stories: 2,
    crawl: true,
    occupied: true,
    coil: true,
    sanitizer: true,
    heavyDebris: false,
  },
  {
    label: '2-system 22-vent split-level, crawl, heavy pet hair, coil',
    jobType: 'heavy',
    systems: 2,
    vents: 22,
    returns: 3,
    stories: 2,
    crawl: true,
    occupied: true,
    coil: true,
    sanitizer: true,
    heavyDebris: true,
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
 * Starting base hours and filter cost. Changing job type never
 * overwrites a rate the shop has already typed — only the
 * base-setup and filter-cost lines move, and only when they are
 * still the previous suggestion.
 */
export function suggestedJobHours(jobType) {
  const id = String(jobType);
  if (id === 'residential') {
    return { hoursBaseSetup: 2.5, filterCost: 22 };
  }
  if (id === 'two_system') {
    return { hoursBaseSetup: 3, filterCost: 22 };
  }
  if (id === 'heavy') {
    return { hoursBaseSetup: 3.2, filterCost: 28 };
  }
  if (id === 'commercial') {
    return { hoursBaseSetup: 3.5, filterCost: 32 };
  }
  throw new Error('Unknown job type');
}

/**
 * Price a duct-cleaning job from systems, vents, stories, crawl
 * access, coil clean, sanitizer, heavy debris, and the contractor's
 * own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const systems = number(input.systems ?? 0, 'Systems', { allowZero: false });
  const vents = number(input.vents ?? 0, 'Supply vents', { allowZero: false });
  const returns = number(input.returns ?? 0, 'Returns');
  const stories = number(input.stories ?? 0, 'Stories', { allowZero: false });
  const includedSystems = number(input.includedSystems ?? 0, 'Included systems', { allowZero: false });
  const includedVents = number(input.includedVents ?? 0, 'Included vents', { allowZero: false });
  const includedReturns = number(input.includedReturns ?? 0, 'Included returns');
  const includedStories = number(input.includedStories ?? 0, 'Included stories', { allowZero: false });

  const jobType = String(input.jobType ?? 'residential');
  if (!JOB_TYPE_PRESETS.some((item) => item.id === jobType)) {
    throw new Error('Unknown job type');
  }

  const crawl = flag(input.crawl);
  const occupied = flag(input.occupied);
  const coil = flag(input.coil);
  const sanitizer = flag(input.sanitizer);
  const heavyDebris = flag(input.heavyDebris);

  const hoursBaseSetup = number(input.hoursBaseSetup ?? 0, 'Hours for a base setup');
  const hoursPerExtraSystem = number(input.hoursPerExtraSystem ?? 0, 'Hours per extra system');
  const hoursPerExtraVent = number(input.hoursPerExtraVent ?? 0, 'Hours per extra vent');
  const hoursPerExtraReturn = number(input.hoursPerExtraReturn ?? 0, 'Hours per extra return');
  const hoursPerExtraStory = number(input.hoursPerExtraStory ?? 0, 'Hours per extra story');
  const hoursCrawl = number(input.hoursCrawl ?? 0, 'Hours for crawl access');
  const hoursOccupied = number(input.hoursOccupied ?? 0, 'Hours for an occupied home');
  const hoursCoil = number(input.hoursCoil ?? 0, 'Hours for a coil clean');
  const hoursSanitizer = number(input.hoursSanitizer ?? 0, 'Hours for sanitizer');
  const hoursHeavyDebris = number(input.hoursHeavyDebris ?? 0, 'Hours for heavy debris');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const filterCost = number(input.filterCost ?? 0, 'Filter cost per system');
  const consumables = number(input.consumables ?? 0, 'Consumables');
  const sanitizerCost = number(input.sanitizerCost ?? 0, 'Sanitizer cost');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const extraSystems = Math.max(0, systems - includedSystems);
  const extraVents = Math.max(0, vents - includedVents);
  const extraReturns = Math.max(0, returns - includedReturns);
  const extraStories = Math.max(0, stories - includedStories);

  const setupHours = hoursBaseSetup;
  const systemHours = extraSystems * hoursPerExtraSystem;
  const ventHours = extraVents * hoursPerExtraVent;
  const returnHours = extraReturns * hoursPerExtraReturn;
  const storyHours = extraStories * hoursPerExtraStory;
  const crawlHours = crawl ? hoursCrawl : 0;
  const occupiedHours = occupied ? hoursOccupied : 0;
  const coilHours = coil ? hoursCoil : 0;
  const sanitizerHours = sanitizer ? hoursSanitizer : 0;
  const heavyHours = heavyDebris ? hoursHeavyDebris : 0;

  const accessHours = systemHours + storyHours + crawlHours;
  const serviceHours = ventHours + returnHours + occupiedHours + coilHours + sanitizerHours + heavyHours;
  const totalHours = setupHours + accessHours + serviceHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const filterMaterial = systems * filterCost;
  const sanitizerMaterial = sanitizer ? sanitizerCost : 0;
  const materialCost = filterMaterial + consumables + sanitizerMaterial;
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
    systems,
    vents,
    returns,
    stories,
    includedSystems,
    includedVents,
    includedReturns,
    includedStories,
    extraSystems,
    extraVents,
    extraReturns,
    extraStories,
    crawl,
    occupied,
    coil,
    sanitizer,
    heavyDebris,
    loadedWage,
    setupHours,
    systemHours,
    ventHours,
    returnHours,
    storyHours,
    crawlHours,
    occupiedHours,
    coilHours,
    sanitizerHours,
    heavyHours,
    accessHours,
    serviceHours,
    siteHours,
    totalHours,
    laborCost,
    filterMaterial,
    sanitizerMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerVent: vents === 0 ? null : price / vents,
    pricePerSystem: systems === 0 ? null : price / systems,
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
      perVent: vents === 0 ? null : proposedPrice / vents,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the shop can paste into a
 * proposal. Costs, wages, and invoices are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Air duct cleaning') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perVent = result.pricePerVent === null
    ? 'n/a'
    : `${money(result.pricePerVent)} / supply vent`;
  const jobType = JOB_TYPE_PRESETS.find((item) => item.id === result.jobType)?.label ?? result.jobType;
  const extra = result.extraSystems === 0
    ? 'systems inside the include'
    : `${result.extraSystems} extra system${result.extraSystems === 1 ? '' : 's'} included`;
  const stories = result.extraStories === 0
    ? 'stories inside the include'
    : `${result.extraStories} extra stor${result.extraStories === 1 ? 'y' : 'ies'} included`;
  const crawl = result.crawl ? 'crawl / tight-attic access included' : 'standard first-floor access this bid';
  const occupied = result.occupied ? 'occupied-home protection included' : 'vacant / unoccupied access';
  const coil = result.coil ? 'evaporator coil / blower clean included' : 'no coil clean this bid';
  const sanitizer = result.sanitizer ? 'sanitizer / antimicrobial fog included' : 'no sanitizer this bid';
  const heavy = result.heavyDebris ? 'heavy debris / pet-hair surcharge included' : 'ordinary household dust this bid';
  return [
    'AIR DUCT CLEANING BID',
    '',
    `Proposed cleaning price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${result.systems} system${result.systems === 1 ? '' : 's'}; ${result.vents} supply vents; ${result.returns} return${result.returns === 1 ? '' : 's'}; ${result.stories} stor${result.stories === 1 ? 'y' : 'ies'}`,
    `Price per supply vent: ${perVent}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- System: ${jobType}`,
    `- ${extra}; ${stories}; ${crawl}; ${occupied}; ${coil}; ${sanitizer}; ${heavy}`,
    `- Access labor (extra systems + stories + crawl): ${result.accessHours.toFixed(1)} h; extras: ${result.serviceHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm system count, vent and return count, stories, crawl/attic access, occupancy, coil clean, sanitizer, debris condition, and all pricing before sending. It is not an indoor-air-quality test, a mold finding, a NADCA certification, a warranty, or a guarantee that any system will pass a later inspection.',
  ].join('\n');
}
