// Pure bid arithmetic for a window-cleaning job. No network, no state: every
// rate, wage, and minute figure is an input, so the result stays a transparent
// calculation the operator can check against their own payroll and drive time
// rather than a claim about what any house or storefront "should" cost.
//
// The method is the one the trade actually loses money by skipping: panes ×
// minutes-per-pane × sides, plus a travel-and-setup block that does not shrink
// when the job is small. A flat "price per window" cannot see that a 10-pane
// ranch 25 minutes away is mostly windshield time, or that ten French panes
// both sides are a different job from ten ground-floor plates.

// Common starting points for minutes one cleaner spends on one pane on one
// side. These are ballpark figures to start from, NOT an industry standard
// or a guarantee: real times depend on soil, water, access, and whether the
// glass is restoration work. Operators should replace them with times from
// their own stops.
export const PANE_PRESETS = Object.freeze([
  { label: 'Ground-floor exterior (water-fed pole)', minutesPerPane: 1.5, defaultSides: 1 },
  { label: 'Ground-floor interior', minutesPerPane: 2, defaultSides: 1 },
  { label: 'French / divided-light pane', minutesPerPane: 4, defaultSides: 2 },
  { label: '2-story ladder exterior', minutesPerPane: 3, defaultSides: 1 },
  { label: '3+ story / bosun / lift', minutesPerPane: 6, defaultSides: 1 },
  { label: 'Storefront plate glass', minutesPerPane: 8, defaultSides: 1 },
  { label: 'Skylights', minutesPerPane: 8, defaultSides: 1 },
  { label: 'Screens (remove & replace)', minutesPerPane: 1, defaultSides: 1 },
  { label: 'Hard-water / restoration', minutesPerPane: 8, defaultSides: 1 },
]);

// `calculateBid` only ever wants visits-per-month (0 meaning one-off), because
// that is the one number every cadence reduces to for the monthly-average
// figure. It is not, however, a number an operator scheduling a quarterly or
// twice-a-year storefront contract can supply without doing the division
// themselves first — "how many visits per month is once a quarter" is not a
// question the form should be asking. These presets are the common recurring
// cadences in the trade, expressed as the exact fraction `calculateBid`
// expects, so the page can offer the cadence a contract is actually sold on
// and fill the field for them.
export const VISIT_FREQUENCY_PRESETS = Object.freeze([
  { id: 'weekly', label: 'Weekly', visitsPerMonth: 52 / 12 },
  { id: 'biweekly', label: 'Every 2 weeks', visitsPerMonth: 26 / 12 },
  { id: 'monthly', label: 'Monthly', visitsPerMonth: 1 },
  { id: 'quarterly', label: 'Quarterly (every 3 months)', visitsPerMonth: 1 / 3 },
  { id: 'semiannual', label: 'Twice a year', visitsPerMonth: 2 / 12 },
  { id: 'annual', label: 'Once a year', visitsPerMonth: 1 / 12 },
  { id: 'one-off', label: 'One-off / no set schedule', visitsPerMonth: 0 },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * Price a window-cleaning visit from its pane groups and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, panes: number, minutesPerPane: number, sides: number}>} input.groups
 *   One row per glass type. Splitting the stop this way is the point: a single
 *   per-window price hides the French panes and the third-story access that
 *   sink underpriced bids.
 * @param {number} input.hourlyWage          What the cleaner is paid per hour.
 * @param {number} input.burdenRate          Payroll burden as a % on top of wage.
 * @param {number} input.travelSetupMinutes  Drive, park, hose-up, and pack-out
 *   minutes that happen once per visit regardless of pane count.
 * @param {number} input.suppliesPerVisit    Chemicals, blades, towels for this stop.
 * @param {number} input.otherPerVisit       Fuel, parking, lift rental, anything else.
 * @param {number} input.overheadRate        Business overhead as a % on direct cost.
 * @param {number} input.targetMargin        Net profit as a % of the final price.
 * @param {number} input.minimumCharge       Floor price per visit (0 = none).
 * @param {number} input.visitsPerMonth      0 means one-off; otherwise scales monthly.
 * @param {number|null} input.proposedPrice  Optional: a per-visit price already
 *   on the table, so the operator can see the margin it actually leaves.
 */
export function calculateBid(input) {
  const groupsInput = Array.isArray(input.groups) ? input.groups : [];
  if (groupsInput.length === 0) throw new Error('Add at least one pane group to price');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const travelSetupMinutes = number(input.travelSetupMinutes ?? 0, 'Travel and setup minutes');
  const suppliesPerVisit = number(input.suppliesPerVisit ?? 0, 'Supplies per visit');
  const otherPerVisit = number(input.otherPerVisit ?? 0, 'Other per-visit cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  const minimumCharge = number(input.minimumCharge ?? 0, 'Minimum job charge');
  const visitsPerMonth = number(input.visitsPerMonth ?? 0, 'Visits per month');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const groups = groupsInput.map((group, index) => {
    const label = group.name?.trim() || `Group ${index + 1}`;
    const panes = number(group.panes ?? 0, `${label}: pane count`);
    // A zero minutes-per-pane would report free glass, so it is rejected
    // rather than defaulted — the operator has to state how long a pane takes.
    const minutesPerPane = number(group.minutesPerPane ?? 0, `${label}: minutes per pane`, { allowZero: false });
    const sides = number(group.sides ?? 0, `${label}: sides`, { min: 1, allowZero: false });
    if (sides > 2) throw new Error(`${label}: sides must be 1 or 2`);
    const minutes = panes * minutesPerPane * sides;
    return {
      name: label,
      panes,
      minutesPerPane,
      sides,
      paneSides: panes * sides,
      minutes,
      hours: minutes / 60,
    };
  });

  const totalPanes = groups.reduce((sum, g) => sum + g.panes, 0);
  const totalPaneSides = groups.reduce((sum, g) => sum + g.paneSides, 0);
  const paneMinutes = groups.reduce((sum, g) => sum + g.minutes, 0);
  const paneHours = paneMinutes / 60;
  const travelHours = travelSetupMinutes / 60;
  const hoursPerVisit = paneHours + travelHours;
  const travelShare = hoursPerVisit === 0 ? 0 : travelHours / hoursPerVisit * 100;

  const laborPerVisit = hoursPerVisit * loadedWage;
  const directCost = laborPerVisit + suppliesPerVisit + otherPerVisit;
  const overheadPerVisit = directCost * overheadRate / 100;
  const costPerVisit = directCost + overheadPerVisit;

  // Margin is a share of price, not a markup on cost, because that is how the
  // customer's number is quoted and how the operator's P&L reads it.
  const pricedFromMargin = costPerVisit / (1 - targetMargin / 100);
  const minimumApplied = minimumCharge > 0 && pricedFromMargin < minimumCharge;
  const pricePerVisit = minimumApplied ? minimumCharge : pricedFromMargin;
  const profitPerVisit = pricePerVisit - costPerVisit;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    groups: groups.map(group => ({
      ...group,
      // Share of pane labor only — travel is shown separately so a small stop
      // cannot hide that most of the visit was the drive.
      hoursShare: paneMinutes === 0 ? 0 : group.minutes / paneMinutes * 100,
    })),
    totalPanes,
    totalPaneSides,
    loadedWage,
    paneMinutes,
    paneHours,
    travelSetupMinutes,
    travelHours,
    travelShare,
    hoursPerVisit,
    laborPerVisit,
    suppliesPerVisit,
    otherPerVisit,
    overheadPerVisit,
    costPerVisit,
    pricedFromMargin,
    minimumCharge,
    minimumApplied,
    pricePerVisit,
    profitPerVisit,
    visitsPerMonth,
    monthlyHours: hoursPerVisit * visitsPerMonth,
    monthlyPrice: pricePerVisit * visitsPerMonth,
    monthlyProfit: profitPerVisit * visitsPerMonth,
    monthlyCost: costPerVisit * visitsPerMonth,
    // The two sanity numbers an operator checks a bid against before sending
    // it: what it works out to per pane, and what they are billing per hour.
    pricePerPane: totalPanes === 0 ? null : pricePerVisit / totalPanes,
    effectiveHourlyRate: hoursPerVisit === 0 ? null : pricePerVisit / hoursPerVisit,
    // Price at which the visit stops making money — the walk-away number when
    // a prospect asks them to match a $6-a-window flyer.
    breakEvenPerVisit: costPerVisit,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - costPerVisit,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - costPerVisit) / proposedPrice * 100,
      hourlyRate: hoursPerVisit === 0 ? null : proposedPrice / hoursPerVisit,
      belowBreakEven: proposedPrice < costPerVisit,
    },
  };
}
