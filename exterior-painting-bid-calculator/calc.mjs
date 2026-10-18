// Pure bid arithmetic for exterior house-painting jobs. No network, no
// state: every elevation square foot, extra story, scrape/prime pass,
// trim lineal foot, and wage is an input, so the result stays a
// transparent calculation the painter can check against their own
// paint invoices rather than a claim about what any house "should"
// cost.
//
// The method is the one the trade actually loses money on: a flat
// "$3,999 house special" or a "$1.50/sqft of wall" rule treats a
// one-story ranch with sound existing paint as the same job as a
// two-story colonial with peeling latex, a scrape-and-prime pass,
// 240 feet of window and fascia trim, occupied landscaping, and
// hard second-story access. Homeowners (and a lot of coupon pages)
// count the same kind of number. Extra stories, extra elevation,
// extra trim, scrape, primer, shutters, and occupied protection do
// not scale with "a house is a house." Matching a cheaper ranch
// special is how a sold colonial becomes a loss after the first
// extra story.
//
// Distinct from interior painting (rooms, walls, and ceilings) and
// from cabinet refinishing (doors and drawers). This prices an
// *exterior* paint job: the elevation, the stories, the scrape, and
// the trim.

export const JOB_TYPE_PRESETS = Object.freeze([
  { id: 'repaint', label: '2-coat repaint / $3,999 house special' },
  { id: 'scrape', label: 'Scrape, prime, and two finish coats' },
  { id: 'bare', label: 'Bare / new wood — primer + two finish coats' },
  { id: 'elastomeric', label: 'Elastomeric masonry / stucco' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '1-story ranch, 1,800 sf, 2-coat repaint (the $3,999 special)',
    jobType: 'repaint',
    elevationSf: 1800,
    stories: 1,
    trimFeet: 90,
    shutters: 0,
    scrape: false,
    prime: false,
    occupied: false,
    hardAccess: false,
  },
  {
    label: '1-story 2,200 sf, scrape + prime, occupied landscaping',
    jobType: 'scrape',
    elevationSf: 2200,
    stories: 1,
    trimFeet: 140,
    shutters: 0,
    scrape: true,
    prime: true,
    occupied: true,
    hardAccess: false,
  },
  {
    label: '2-story colonial, 2,800 sf, extra trim, occupied, hard access',
    jobType: 'repaint',
    elevationSf: 2800,
    stories: 2,
    trimFeet: 240,
    shutters: 12,
    scrape: false,
    prime: false,
    occupied: true,
    hardAccess: true,
  },
  {
    label: '2-story 3,400 sf peeling masonry, scrape + elastomeric, occupied',
    jobType: 'elastomeric',
    elevationSf: 3400,
    stories: 2,
    trimFeet: 200,
    shutters: 8,
    scrape: true,
    prime: true,
    occupied: true,
    hardAccess: true,
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
 * Starting base hours, paint cost, and finish-coat count. Changing
 * job type never overwrites a rate the shop has already typed — only
 * the base-setup, paint-cost, and coat-count lines move, and only
 * when they are still the previous suggestion.
 */
export function suggestedJobHours(jobType) {
  const id = String(jobType);
  if (id === 'repaint') {
    return { hoursBaseSetup: 6, paintCostPerGallon: 48, finishCoats: 2 };
  }
  if (id === 'scrape') {
    return { hoursBaseSetup: 7.5, paintCostPerGallon: 48, finishCoats: 2 };
  }
  if (id === 'bare') {
    return { hoursBaseSetup: 8, paintCostPerGallon: 52, finishCoats: 2 };
  }
  if (id === 'elastomeric') {
    return { hoursBaseSetup: 7.5, paintCostPerGallon: 72, finishCoats: 2 };
  }
  throw new Error('Unknown job type');
}

/**
 * Price an exterior paint job from elevation square footage, stories,
 * trim, scrape/prime, occupancy, hard access, and the contractor's
 * own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const elevationSf = number(input.elevationSf ?? 0, 'Elevation square feet', { allowZero: false });
  const stories = number(input.stories ?? 0, 'Stories', { allowZero: false });
  const trimFeet = number(input.trimFeet ?? 0, 'Trim lineal feet');
  const shutters = number(input.shutters ?? 0, 'Shutters');
  const includedElevationSf = number(input.includedElevationSf ?? 0, 'Included elevation', { allowZero: false });
  const includedStories = number(input.includedStories ?? 0, 'Included stories', { allowZero: false });
  const includedTrimFeet = number(input.includedTrimFeet ?? 0, 'Included trim');

  const jobType = String(input.jobType ?? 'repaint');
  if (!JOB_TYPE_PRESETS.some((item) => item.id === jobType)) {
    throw new Error('Unknown job type');
  }

  const scrape = flag(input.scrape);
  const prime = flag(input.prime);
  const occupied = flag(input.occupied);
  const hardAccess = flag(input.hardAccess);

  const hoursBaseSetup = number(input.hoursBaseSetup ?? 0, 'Hours for a base setup');
  const hoursPer100Sf = number(input.hoursPer100Sf ?? 0, 'Hours per extra 100 sq ft');
  const hoursPerExtraStory = number(input.hoursPerExtraStory ?? 0, 'Hours per extra story');
  const hoursScrapePer100 = number(input.hoursScrapePer100 ?? 0, 'Hours to scrape per 100 sq ft');
  const hoursPrimePer100 = number(input.hoursPrimePer100 ?? 0, 'Hours to prime per 100 sq ft');
  const hoursTrimPer10Feet = number(input.hoursTrimPer10Feet ?? 0, 'Hours of trim per 10 feet');
  const hoursPerShutter = number(input.hoursPerShutter ?? 0, 'Hours per shutter');
  const hoursOccupied = number(input.hoursOccupied ?? 0, 'Hours for an occupied home');
  const hoursHardAccess = number(input.hoursHardAccess ?? 0, 'Hours for hard access');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const finishCoats = number(input.finishCoats ?? 0, 'Finish coats', { allowZero: false });
  const paintCoverage = number(input.paintCoverage ?? 0, 'Paint coverage', { allowZero: false });
  const paintCostPerGallon = number(input.paintCostPerGallon ?? 0, 'Paint cost per gallon');
  const primerCostPerGallon = number(input.primerCostPerGallon ?? 0, 'Primer cost per gallon');
  const caulkPer10TrimFeet = number(input.caulkPer10TrimFeet ?? 0, 'Caulk per 10 trim feet');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const extraSf = Math.max(0, elevationSf - includedElevationSf);
  const extraStories = Math.max(0, stories - includedStories);
  const extraTrim = Math.max(0, trimFeet - includedTrimFeet);

  const setupHours = hoursBaseSetup;
  const bodyHours = (extraSf / 100) * hoursPer100Sf;
  const storyHours = extraStories * hoursPerExtraStory;
  const scrapeHours = scrape ? (elevationSf / 100) * hoursScrapePer100 : 0;
  const primeHours = prime ? (elevationSf / 100) * hoursPrimePer100 : 0;
  const trimHours = (extraTrim / 10) * hoursTrimPer10Feet;
  const shutterHours = shutters * hoursPerShutter;
  const occupiedHours = occupied ? hoursOccupied : 0;
  const hardAccessHours = hardAccess ? hoursHardAccess : 0;

  const accessHours = storyHours + bodyHours + hardAccessHours;
  const serviceHours = scrapeHours + primeHours + trimHours + shutterHours + occupiedHours;
  const totalHours = setupHours + accessHours + serviceHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const finishGallons = elevationSf * finishCoats / paintCoverage;
  const primerGallons = prime ? elevationSf / paintCoverage : 0;
  const finishPaint = finishGallons * paintCostPerGallon;
  const primerPaint = primerGallons * primerCostPerGallon;
  const caulkMaterial = (trimFeet / 10) * caulkPer10TrimFeet;
  const materialCost = finishPaint + primerPaint + caulkMaterial;
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
    elevationSf,
    stories,
    trimFeet,
    shutters,
    includedElevationSf,
    includedStories,
    includedTrimFeet,
    extraSf,
    extraStories,
    extraTrim,
    scrape,
    prime,
    occupied,
    hardAccess,
    finishCoats,
    finishGallons,
    primerGallons,
    loadedWage,
    setupHours,
    bodyHours,
    storyHours,
    scrapeHours,
    primeHours,
    trimHours,
    shutterHours,
    occupiedHours,
    hardAccessHours,
    accessHours,
    serviceHours,
    siteHours,
    totalHours,
    laborCost,
    finishPaint,
    primerPaint,
    caulkMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerSf: elevationSf === 0 ? null : price / elevationSf,
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
      perSf: elevationSf === 0 ? null : proposedPrice / elevationSf,
      hourlyRate: totalHours === 0 ? null : proposedPrice / totalHours,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}

/**
 * Format a bid as a plain-text draft the shop can paste into a
 * proposal. Costs, wages, and paint invoices are omitted on purpose —
 * this is the customer-facing side.
 */
export function formatBidSummary(result, jobLabel = 'Exterior paint job') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perSf = result.pricePerSf === null
    ? 'n/a'
    : `${money(result.pricePerSf)} / sf of elevation`;
  const jobType = JOB_TYPE_PRESETS.find((item) => item.id === result.jobType)?.label ?? result.jobType;
  const extra = result.extraStories === 0
    ? 'stories inside the include'
    : `${result.extraStories} extra stor${result.extraStories === 1 ? 'y' : 'ies'} included`;
  const scrape = result.scrape ? 'scrape of failing paint included' : 'sound existing paint this bid';
  const prime = result.prime ? 'primer coat included' : 'no primer this bid';
  const occupied = result.occupied ? 'occupied-home protection included' : 'vacant / unoccupied access';
  const access = result.hardAccess ? 'hard second-story / steep access included' : 'standard one-story access this bid';
  const shutters = result.shutters === 0
    ? 'no shutters this bid'
    : `${result.shutters} shutter${result.shutters === 1 ? '' : 's'} included`;
  return [
    'EXTERIOR PAINT BID',
    '',
    `Proposed paint price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${result.stories} stor${result.stories === 1 ? 'y' : 'ies'}; ${result.elevationSf} sf elevation; ${result.trimFeet} lf trim`,
    `Price per elevation square foot: ${perSf}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- System: ${jobType}; ${result.finishCoats} finish coat${result.finishCoats === 1 ? '' : 's'}`,
    `- ${extra}; ${scrape}; ${prime}; ${shutters}; ${occupied}; ${access}`,
    `- Access labor (stories + extra elevation + hard access): ${result.accessHours.toFixed(1)} h; extras: ${result.serviceHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm elevation square footage, stories, trim, scrape/prime condition, shutter count, occupancy, access, and all pricing before sending. It is not a lead-paint determination, a building-code inspection, a warranty, or a guarantee that any surface will last a stated number of years.',
  ].join('\n');
}
