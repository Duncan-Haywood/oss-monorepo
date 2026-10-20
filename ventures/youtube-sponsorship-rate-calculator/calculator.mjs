/**
 * YouTube sponsorship rate calculator, as a deterministic module.
 *
 * Creator-sponsorship deals are quoted as a CPM against *views*: the median
 * views of a channel's recent long-form videos, not subscribers (a sponsor is
 * paying for views the video actually gets). This module applies commonly
 * cited benchmark CPM ranges, by niche and sponsorship format, to the
 * creator's own median views, then layers the two add-ons that most often
 * move a real deal -- paid-usage / whitelisting rights and category
 * exclusivity -- as percentage uplifts. The output is a price *range*, a
 * starting point for negotiation, never a quote or a valuation.
 *
 * The ranges are deliberately wide and are general market ranges, not data
 * from any one platform or agency. Actual rates vary with audience quality,
 * how well the creator converts, and how badly a sponsor wants the audience.
 */

export const FORMATS = ["integration", "dedicated", "mention"];

export const FORMAT_LABELS = {
  integration: "Integration (60–90s segment inside the video)",
  dedicated: "Dedicated video (the whole video is about the sponsor)",
  mention: "Short mention (15–30s shout-out)",
};

export const NICHES = ["general", "business", "tech", "gaming", "lifestyle"];

export const NICHE_LABELS = {
  general: "General interest / entertainment",
  business: "Business / finance / career",
  tech: "Tech / software / science",
  gaming: "Gaming",
  lifestyle: "Lifestyle / beauty / travel / food",
};

export const USAGE_RIGHTS = ["none", "30d", "90d", "perpetual"];

export const USAGE_LABELS = {
  none: "None (the sponsor only gets the video on your channel)",
  "30d": "30 days of paid usage / whitelisting (sponsor runs it as an ad)",
  "90d": "90 days of paid usage / whitelisting",
  perpetual: "Perpetual paid usage",
};

export const EXCLUSIVITY = ["none", "30d", "90d"];

export const EXCLUSIVITY_LABELS = {
  none: "None",
  "30d": "30-day category exclusivity (no competing sponsor)",
  "90d": "90-day category exclusivity",
};

// Commonly cited CPM-per-1000-views ranges [low, high], USD, for a 60-90s
// integration by niche. Wide on purpose.
const INTEGRATION_CPM = {
  general: [10, 20],
  business: [25, 50],
  tech: [20, 40],
  gaming: [8, 18],
  lifestyle: [12, 25],
};

// A dedicated video is commonly priced at a multiple of an integration; a
// short mention at a fraction.
const FORMAT_MULTIPLIER = { integration: 1, dedicated: 2.2, mention: 0.5 };

// Percentage uplifts on top of the base fee, as commonly negotiated.
const USAGE_UPLIFT = { none: 0, "30d": 0.2, "90d": 0.4, perpetual: 1.0 };
const EXCLUSIVITY_UPLIFT = { none: 0, "30d": 0.15, "90d": 0.3 };

export const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low", INFO: "info" };

const pick = (allowed, value, fallback) => (allowed.includes(value) ? value : fallback);

/**
 * @param {{views:number, niche:string, format:string, usage:string, exclusivity:string}} input
 */
export function computeRate({ views, niche, format, usage, exclusivity }) {
  const v = Number.isFinite(views) && views > 0 ? views : 0;
  const nicheKey = pick(NICHES, niche, "general");
  const formatKey = pick(FORMATS, format, "integration");
  const usageKey = pick(USAGE_RIGHTS, usage, "none");
  const exclKey = pick(EXCLUSIVITY, exclusivity, "none");

  const [baseLow, baseHigh] = INTEGRATION_CPM[nicheKey];
  const mult = FORMAT_MULTIPLIER[formatKey];
  const cpmLow = baseLow * mult;
  const cpmHigh = baseHigh * mult;
  const thousands = v / 1000;

  const baseLowFee = thousands * cpmLow;
  const baseHighFee = thousands * cpmHigh;
  const usageUplift = USAGE_UPLIFT[usageKey];
  const exclUplift = EXCLUSIVITY_UPLIFT[exclKey];
  // Uplifts add (they are both percentages of the base fee), so the total
  // never compounds into a number that cannot be defended in a negotiation.
  const factor = 1 + usageUplift + exclUplift;

  const result = {
    views: v,
    cpmLow,
    cpmHigh,
    baseLow: Math.round(baseLowFee),
    baseHigh: Math.round(baseHighFee),
    usageLow: Math.round(baseLowFee * usageUplift),
    usageHigh: Math.round(baseHighFee * usageUplift),
    exclusivityLow: Math.round(baseLowFee * exclUplift),
    exclusivityHigh: Math.round(baseHighFee * exclUplift),
    totalLow: Math.round(baseLowFee * factor),
    totalHigh: Math.round(baseHighFee * factor),
    findings: [],
  };

  const add = (id, severity, title, detail) => result.findings.push({ id, severity, title, detail });

  if (v === 0) {
    add(
      "missing-input",
      SEVERITY.INFO,
      "Enter your median views",
      "Use the median views of your last 10 long-form videos, measured about 30 days after each went live (YouTube Studio → Analytics → Content). Use the median, not the average: one viral video drags an average far above what a typical sponsored video will get. Prices are all zero until a real number is entered.",
    );
    return result;
  }

  if (v < 1000) {
    add(
      "small-channel",
      SEVERITY.MEDIUM,
      "Under 1,000 median views is below most sponsors' floor",
      "Many sponsors and creator marketplaces set a minimum audience before they will pay a CPM. Below that, a flat fee or free product in exchange for an honest review is more common than a CPM quote.",
    );
  }
  if (usageKey === "perpetual") {
    add(
      "perpetual-usage",
      SEVERITY.HIGH,
      "Perpetual usage rights are usually worth more than +100%",
      "Once a sponsor can run your face and voice as an ad forever, you cannot sell that audience's attention to a competitor the same way. Treat the perpetual figure as a floor, and consider a time-limited licence with a renewal fee instead.",
    );
  }
  if (usageKey !== "none") {
    add(
      "usage-rights",
      SEVERITY.INFO,
      "Put paid-usage terms in writing",
      "Name the platforms (for example the sponsor's own ad account), the start and end date, and whether your likeness and voice may be edited. Whitelisting means the ad runs from your handle, so the sponsor's budget decides how many people see it.",
    );
  }
  if (exclKey !== "none") {
    add(
      "exclusivity",
      SEVERITY.INFO,
      "Define the category narrowly",
      "'No other fintech' blocks far more income than 'no other budgeting app'. Exclusivity is worth its uplift only if the category is narrow and the window is short.",
    );
  }
  if (formatKey === "dedicated") {
    add(
      "dedicated-note",
      SEVERITY.INFO,
      "A dedicated video usually replaces your own sponsor slots for that upload",
      "The multiplier already reflects that the whole video is the ad. Check the sponsor is not also expecting an integration fee's worth of extra mentions on top.",
    );
  }
  if (v > 1_000_000) {
    add(
      "large-channel",
      SEVERITY.INFO,
      "Past 1,000,000 median views you are in custom-rate territory",
      "Channels at this size usually negotiate with a manager or agency; treat this range as a sanity-check floor, not your only comparison.",
    );
  }
  return result;
}
