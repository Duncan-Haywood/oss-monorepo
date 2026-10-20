/**
 * Podcast sponsorship rate calculator, as a deterministic module.
 *
 * Podcast ad marketplaces and network rate cards (AdvertiseCast's annual
 * rate report, Podcorn, direct-sold network cards) routinely price an ad
 * spot as a CPM against *downloads*, not raw subscriber or listener counts
 * -- a sponsor is paying for a spot that actually got served, and the
 * industry-standard download window (IAB/Podtrac methodology) is downloads
 * within the first 7 days of an episode going live. This module applies
 * commonly cited benchmark CPM-per-1000-downloads ranges, by niche,
 * placement, and read type, to a show's own numbers and returns a price
 * *range* per placement -- a starting point for negotiation, never a quote
 * or a valuation performed on the user's behalf. See index.html's
 * disclaimer for the exact wording.
 *
 * Benchmark ranges are deliberately wide and clearly labeled as general
 * market ranges rather than a specific quote: actual rates vary by
 * audience quality, host endorsement strength, and how badly a given
 * sponsor wants that audience this quarter.
 */

export const PLACEMENTS = ["preroll", "midroll", "postroll"];

export const PLACEMENT_LABELS = {
  preroll: "Pre-roll (:15–:30s ad at the very start)",
  midroll: "Mid-roll (:60–:90s ad in the middle of the episode)",
  postroll: "Post-roll (:15–:30s ad at the end)",
};

export const NICHES = ["general", "business", "tech", "true-crime"];

export const NICHE_LABELS = {
  general: "General interest / lifestyle / comedy",
  business: "Business / finance / entrepreneurship",
  tech: "Tech / startups / science",
  "true-crime": "True crime / narrative / drama",
};

export const READ_TYPES = ["host-read", "produced"];

export const READ_TYPE_LABELS = {
  "host-read": "Host-read (the host reads the ad live, in their own voice)",
  produced: "Produced (a pre-recorded, studio-produced spot)",
};

// Commonly cited CPM-per-1000-downloads ranges [low, high], USD, for a
// host-read ad by niche and placement. Deliberately wide: these are
// general market ranges to anchor a negotiation, not a quote for any
// specific show.
const CPM_PER_1000_DOWNLOADS = {
  general: { preroll: [15, 20], midroll: [20, 30], postroll: [10, 15] },
  business: { preroll: [20, 28], midroll: [30, 45], postroll: [15, 20] },
  tech: { preroll: [18, 25], midroll: [25, 40], postroll: [13, 18] },
  "true-crime": { preroll: [16, 22], midroll: [24, 35], postroll: [12, 16] },
};

// Produced (pre-recorded) spots are commonly cited as pricing below a
// host-read ad in the same slot, since they lack the host's live
// endorsement. Host-read is the benchmark table's baseline (1.0).
const READ_TYPE_MULTIPLIER = { "host-read": 1, produced: 0.7 };

export const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low", INFO: "info" };

function round(n) {
  return Math.round(n);
}

/**
 * @param {{downloads: number, niche: string, readType: string}} input
 * @returns {{perThousand: number, rates: Record<string, {low:number, high:number}>, findings: Array<{id:string, severity:string, title:string, detail:string}>}}
 */
export function computeRates({ downloads, niche, readType }) {
  const dl = Number.isFinite(downloads) && downloads > 0 ? downloads : 0;
  const nicheKey = NICHES.includes(niche) ? niche : "general";
  const readKey = READ_TYPES.includes(readType) ? readType : "host-read";
  const multiplier = READ_TYPE_MULTIPLIER[readKey];

  const perThousand = dl / 1000;

  const rates = {};
  for (const placement of PLACEMENTS) {
    const [baseLow, baseHigh] = CPM_PER_1000_DOWNLOADS[nicheKey][placement];
    const cpmLow = baseLow * multiplier;
    const cpmHigh = baseHigh * multiplier;
    rates[placement] = {
      cpmLow,
      cpmHigh,
      low: round(perThousand * cpmLow),
      high: round(perThousand * cpmHigh),
    };
  }

  const findings = [];

  if (dl === 0) {
    findings.push({
      id: "missing-input",
      severity: SEVERITY.INFO,
      title: "Enter your average downloads per episode",
      detail: "Use downloads in the first 7 days of an episode going live -- the industry-standard window (the IAB/Podtrac methodology most ad buyers expect) -- from your hosting platform's own dashboard (Spotify for Podcasters, Apple Podcasts Connect, Libsyn, Buzzsprout, and others all report it). Prices below are all zero until a real number is entered.",
    });
    return { perThousand, rates, findings };
  }

  if (dl < 1000) {
    findings.push({
      id: "small-show",
      severity: SEVERITY.MEDIUM,
      title: "Under 1,000 downloads/episode is below many marketplaces' minimum",
      detail: "Several self-serve podcast ad marketplaces set an audience floor (often 1,000-5,000 downloads per episode) before listing a show at all. Below that size, direct outreach to a sponsor whose product your listeners clearly want usually works better than a posted rate card.",
    });
  }

  if (readKey === "produced") {
    findings.push({
      id: "produced-discount",
      severity: SEVERITY.INFO,
      title: "Produced spots typically price below a host-read ad",
      detail: "These ranges are already discounted from the host-read benchmark, since a produced spot has no live host endorsement. If you can offer a host-read version of the same ad instead, it is worth pricing separately -- sponsors often pay a premium for it.",
    });
  }

  if (dl > 500000) {
    findings.push({
      id: "large-show",
      severity: SEVERITY.INFO,
      title: "North of 500,000 downloads/episode is well past public benchmark territory",
      detail: "Shows at this scale usually negotiate custom rates with a network ad-sales team rather than working from a published CPM range. Treat this range as a sanity-check floor, not your only comparison.",
    });
  }

  return { perThousand, rates, findings };
}
