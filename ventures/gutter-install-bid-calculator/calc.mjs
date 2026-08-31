// Pure bid arithmetic for new gutter *install* (not cleaning, not guards).
// No network, no state: every foot of gutter, miter, drop, wage, and
// fascia board is an input, so the result stays a transparent calculation
// the shop can check against their own invoices rather than a claim
// about what any house "should" cost.
//
// The method is the one the trade actually loses money on: a flat
// "$4.50 a foot installed" gutter special treats a 140-foot one-story
// ranch with two included downspouts as the same job as a 220-foot
// two-story colonial with six-inch trough, extra drops, inside miters,
// fascia repair, and tear-off of the old system. Homeowners (and a lot
// of estimator sheets) count linear feet. Corners, extra drops past
// the included first two, extra downspout footage past ten feet per
// drop, a second story, fascia rot, and tear-off do not scale with
// that number. Matching a cheaper special written for the brochure
// ranch is how a sold two-story-and-fascia job becomes a two-day loss
// after the first inside miter.
//
// Distinct from gutter *cleaning* (stories and downspouts for a wash)
// and from gutter *guards* (mesh on an existing trough). This prices
// a new hang: the trough, the corners, the drops, the stories, and
// the fascia that is not in the coupon.

export const PROFILE_PRESETS = Object.freeze([
  { id: 'five-alum', label: '5" K-style aluminum' },
  { id: 'six-alum', label: '6" K-style aluminum' },
  { id: 'copper', label: 'Half-round copper' },
]);

export const STORY_PRESETS = Object.freeze([
  { id: 'one', label: 'One story' },
  { id: 'two', label: 'Two stories' },
  { id: 'three', label: 'Three stories' },
]);

export const JOB_PRESETS = Object.freeze([
  {
    label: '1-story ranch, 140 ft of 5" aluminum, 4 outside miters, first 2 downs included (the $4.50/ft special)',
    profile: 'five-alum',
    stories: 'one',
    gutterFeet: 140,
    insideMiters: 0,
    outsideMiters: 4,
    downspouts: 2,
    downspoutFeet: 20,
    includedDownspouts: 2,
    includedDownspoutFeetPerDrop: 10,
    fasciaFeet: 0,
    tearOff: false,
    steepAccess: false,
    addHiddenHangers: false,
  },
  {
    label: '1-story, 180 ft of 5" aluminum, 3 downs, tear-off',
    profile: 'five-alum',
    stories: 'one',
    gutterFeet: 180,
    insideMiters: 0,
    outsideMiters: 6,
    downspouts: 3,
    downspoutFeet: 30,
    includedDownspouts: 2,
    includedDownspoutFeetPerDrop: 10,
    fasciaFeet: 0,
    tearOff: true,
    steepAccess: false,
    addHiddenHangers: false,
  },
  {
    label: '2-story colonial, 220 ft of 6" aluminum, 2 inside miters, 4 downs, 40 ft fascia, tear-off',
    profile: 'six-alum',
    stories: 'two',
    gutterFeet: 220,
    insideMiters: 2,
    outsideMiters: 6,
    downspouts: 4,
    downspoutFeet: 48,
    includedDownspouts: 2,
    includedDownspoutFeetPerDrop: 10,
    fasciaFeet: 40,
    tearOff: true,
    steepAccess: false,
    addHiddenHangers: true,
  },
  {
    label: '2-story, 160 ft copper, 3 downs, steep access, tear-off',
    profile: 'copper',
    stories: 'two',
    gutterFeet: 160,
    insideMiters: 1,
    outsideMiters: 5,
    downspouts: 3,
    downspoutFeet: 36,
    includedDownspouts: 2,
    includedDownspoutFeetPerDrop: 10,
    fasciaFeet: 0,
    tearOff: true,
    steepAccess: true,
    addHiddenHangers: false,
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
 * Starting trough cost and hang hours from the profile. These are
 * ballpark shop figures, not a catalog. Picking a profile never
 * overwrites a cost the shop has already typed.
 */
export function suggestedProfileKit(profile) {
  const id = String(profile);
  if (id === 'five-alum') {
    return { gutterPerFoot: 3.4, hoursPerGutterFoot: 0.035, profilePremiumPerFoot: 0 };
  }
  if (id === 'six-alum') {
    return { gutterPerFoot: 4.6, hoursPerGutterFoot: 0.04, profilePremiumPerFoot: 1.2 };
  }
  if (id === 'copper') {
    return { gutterPerFoot: 18, hoursPerGutterFoot: 0.055, profilePremiumPerFoot: 0 };
  }
  throw new Error('Unknown gutter profile');
}

/**
 * Starting story hours. A one-story ranch hang is not a two-story
 * colonial.
 */
export function suggestedStoryKit(stories) {
  const id = String(stories);
  if (id === 'one') return { hoursPerStoryFoot: 0 };
  if (id === 'two') return { hoursPerStoryFoot: 0.018 };
  if (id === 'three') return { hoursPerStoryFoot: 0.032 };
  throw new Error('Unknown story count');
}

/**
 * Price a gutter install from corners, extra drops past the included
 * first two, extra downspout footage past ten feet per drop, stories,
 * fascia, tear-off, and the contractor's own costs.
 *
 * @param {object} input
 */
export function calculateBid(input) {
  const gutterFeet = number(input.gutterFeet ?? 0, 'Gutter footage');
  const insideMiters = number(input.insideMiters ?? 0, 'Inside miters');
  const outsideMiters = number(input.outsideMiters ?? 0, 'Outside miters');
  const downspouts = number(input.downspouts ?? 0, 'Downspouts');
  const downspoutFeet = number(input.downspoutFeet ?? 0, 'Downspout footage');
  const includedDownspouts = number(input.includedDownspouts ?? 0, 'Included downspouts');
  const includedDownspoutFeetPerDrop = number(
    input.includedDownspoutFeetPerDrop ?? 0,
    'Included downspout footage per drop',
  );
  const fasciaFeet = number(input.fasciaFeet ?? 0, 'Fascia footage');

  const profile = String(input.profile ?? 'five-alum');
  if (!PROFILE_PRESETS.some((item) => item.id === profile)) {
    throw new Error('Unknown gutter profile');
  }
  const stories = String(input.stories ?? 'one');
  if (!STORY_PRESETS.some((item) => item.id === stories)) {
    throw new Error('Unknown story count');
  }

  const tearOff = flag(input.tearOff);
  const steepAccess = flag(input.steepAccess);
  const addHiddenHangers = flag(input.addHiddenHangers);

  const extraDownspouts = Math.max(0, downspouts - includedDownspouts);
  const extraDownspoutFeet = Math.max(0, downspoutFeet - includedDownspoutFeetPerDrop * downspouts);

  const hoursTrip = number(input.hoursTrip ?? 0, 'Hours for the trip / setup');
  const hoursPerGutterFoot = number(input.hoursPerGutterFoot ?? 0, 'Hours per gutter foot');
  const hoursPerStoryFoot = number(input.hoursPerStoryFoot ?? 0, 'Hours per story foot');
  const hoursInsideMiter = number(input.hoursInsideMiter ?? 0, 'Hours per inside miter');
  const hoursOutsideMiter = number(input.hoursOutsideMiter ?? 0, 'Hours per outside miter');
  const hoursPerExtraDownspout = number(input.hoursPerExtraDownspout ?? 0, 'Hours per extra downspout');
  const hoursPerExtraDownspoutFoot = number(
    input.hoursPerExtraDownspoutFoot ?? 0,
    'Hours per extra downspout foot',
  );
  const hoursPerFasciaFoot = number(input.hoursPerFasciaFoot ?? 0, 'Hours per fascia foot');
  const hoursPerTearOffFoot = number(input.hoursPerTearOffFoot ?? 0, 'Hours per tear-off foot');
  const hoursPerSteepFoot = number(input.hoursPerSteepFoot ?? 0, 'Hours per steep-access foot');
  const siteHours = number(input.siteHours ?? 0, 'Site / travel hours');

  const gutterPerFoot = number(input.gutterPerFoot ?? 0, 'Gutter cost per foot');
  const profilePremiumPerFoot = number(input.profilePremiumPerFoot ?? 0, 'Profile premium per foot');
  const downspoutOutletCost = number(input.downspoutOutletCost ?? 0, 'Extra downspout outlet');
  const downspoutPerFoot = number(input.downspoutPerFoot ?? 0, 'Downspout cost per foot');
  const insideMiterCost = number(input.insideMiterCost ?? 0, 'Inside miter');
  const outsideMiterCost = number(input.outsideMiterCost ?? 0, 'Outside miter');
  const fasciaPerFoot = number(input.fasciaPerFoot ?? 0, 'Fascia cost per foot');
  const tearOffDumpPerFoot = number(input.tearOffDumpPerFoot ?? 0, 'Tear-off dump per foot');
  const hangerPerFoot = number(input.hangerPerFoot ?? 0, 'Hidden hanger per foot');
  const permitFee = number(input.permitFee ?? 0, 'Permit fee');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelAndEquipment = number(input.travelAndEquipment ?? 0, 'Travel and equipment');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const tripHours = hoursTrip;
  const hangHours = gutterFeet * hoursPerGutterFoot;
  const storyHours = gutterFeet * hoursPerStoryFoot;
  const miterHours = insideMiters * hoursInsideMiter + outsideMiters * hoursOutsideMiter;
  const dropHours = extraDownspouts * hoursPerExtraDownspout
    + extraDownspoutFeet * hoursPerExtraDownspoutFoot;
  const fasciaHours = fasciaFeet * hoursPerFasciaFoot;
  const tearOffHours = tearOff ? gutterFeet * hoursPerTearOffFoot : 0;
  const steepHours = steepAccess ? gutterFeet * hoursPerSteepFoot : 0;
  const accessHours = storyHours + steepHours;
  const packageHours = miterHours + dropHours + fasciaHours + tearOffHours;
  const totalHours = tripHours + hangHours + accessHours + packageHours + siteHours;
  const laborCost = totalHours * loadedWage;

  const gutterMaterial = gutterFeet * (gutterPerFoot + profilePremiumPerFoot);
  const miterMaterial = insideMiters * insideMiterCost + outsideMiters * outsideMiterCost;
  const dropMaterial = extraDownspouts * downspoutOutletCost + extraDownspoutFeet * downspoutPerFoot;
  const fasciaMaterial = fasciaFeet * fasciaPerFoot;
  const tearOffMaterial = tearOff ? gutterFeet * tearOffDumpPerFoot : 0;
  const hangerMaterial = addHiddenHangers ? gutterFeet * hangerPerFoot : 0;
  const permitMaterial = permitFee;
  const materialCost = gutterMaterial + miterMaterial + dropMaterial + fasciaMaterial
    + tearOffMaterial + hangerMaterial + permitMaterial;
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
    profile,
    stories,
    gutterFeet,
    insideMiters,
    outsideMiters,
    downspouts,
    downspoutFeet,
    includedDownspouts,
    includedDownspoutFeetPerDrop,
    extraDownspouts,
    extraDownspoutFeet,
    fasciaFeet,
    tearOff,
    steepAccess,
    addHiddenHangers,
    loadedWage,
    tripHours,
    hangHours,
    storyHours,
    miterHours,
    dropHours,
    fasciaHours,
    tearOffHours,
    steepHours,
    accessHours,
    packageHours,
    siteHours,
    totalHours,
    laborCost,
    gutterMaterial,
    miterMaterial,
    dropMaterial,
    fasciaMaterial,
    tearOffMaterial,
    hangerMaterial,
    permitMaterial,
    materialCost,
    travelAndEquipment,
    softCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerGutterFoot: gutterFeet === 0 ? null : price / gutterFeet,
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
      perGutterFoot: gutterFeet === 0 ? null : proposedPrice / gutterFeet,
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
export function formatBidSummary(result, jobLabel = 'Gutter install') {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const perFoot = result.pricePerGutterFoot === null
    ? 'n/a'
    : `${money(result.pricePerGutterFoot)} / ft of gutter`;
  const profile = PROFILE_PRESETS.find((item) => item.id === result.profile)?.label ?? result.profile;
  const stories = STORY_PRESETS.find((item) => item.id === result.stories)?.label ?? result.stories;
  const tearOff = result.tearOff ? 'tear-off of the old system included' : 'no tear-off this bid';
  const steep = result.steepAccess ? 'steep / hard access included' : 'no steep-access adder this bid';
  const hangers = result.addHiddenHangers ? 'hidden hangers included' : 'no hidden-hanger upgrade this bid';
  return [
    'GUTTER INSTALL BID',
    '',
    `Proposed gutter-install price: ${money(result.price)}`,
    `Scope: ${jobLabel}; ${profile}; ${stories}`,
    `Price per foot of gutter: ${perFoot}`,
    `Crew labor: ${result.totalHours.toFixed(1)} crew-hours`,
    '',
    'SCOPE BASIS',
    `- ${result.gutterFeet} ft of ${profile}; ${stories}; ${result.insideMiters} inside miter(s); ${result.outsideMiters} outside miter(s)`,
    `- ${result.downspouts} downspouts (${result.extraDownspouts} past the included ${result.includedDownspouts}); ${result.downspoutFeet} ft of downspout (${result.extraDownspoutFeet} ft past ${result.includedDownspoutFeetPerDrop} ft per drop)`,
    `- ${result.fasciaFeet} ft of fascia; ${tearOff}; ${steep}; ${hangers}`,
    `- Hang labor: ${result.hangHours.toFixed(1)} h; stories / steep: ${result.accessHours.toFixed(1)} h; corners / drops / fascia / tear-off: ${result.packageHours.toFixed(1)} h`,
    '',
    'This is a draft for review. Confirm footage, profile, stories, miters, downspouts, fascia, tear-off, and all pricing before sending. It is not a gutter design, a water-management plan, a permit, or an engineering stamp.',
  ].join('\n');
}
