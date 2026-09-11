/**
 * Brand deal rate calculator, as a deterministic module.
 *
 * Influencer marketing rate cards and creator-economy write-ups routinely
 * quote sponsorship prices as a CPM against *engaged* followers, not raw
 * follower count -- a brand is paying for people who actually see and react
 * to the post, and engagement rate is the one number that separates a
 * 100,000-follower account nobody interacts with from a 10,000-follower
 * account whose audience shows up every time. This module applies commonly
 * cited benchmark CPM-per-1000-engaged-followers ranges, by platform and by
 * deliverable, to a creator's own numbers and returns a price *range* per
 * deliverable -- a starting point for negotiation, never a quote or a
 * valuation performed on the user's behalf. See index.html's disclaimer for
 * the exact wording.
 *
 * Benchmark ranges are deliberately wide and clearly labeled as general
 * market ranges rather than a specific quote: actual rates vary by audience
 * quality, past brand-deal history, niche demand, and how badly a given
 * brand wants that specific audience this week.
 */

export const DELIVERABLES = ["post", "story", "reel", "video"];

export const DELIVERABLE_LABELS = {
  post: "Feed post (single photo or carousel)",
  story: "Story (single frame, ~24h)",
  reel: "Reel / short-form video (Reels, TikTok, Shorts)",
  video: "Dedicated long-form video (mainly YouTube)",
};

export const PLATFORMS = ["instagram", "tiktok", "youtube", "general"];

export const PLATFORM_LABELS = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  general: "Other / multiple platforms",
};

// Commonly cited CPM-per-1000-engaged-followers ranges [low, high], USD, by
// platform and deliverable. Deliberately wide: these are general market
// ranges to anchor a negotiation, not a quote for any specific creator.
const CPM_PER_1000_ENGAGED = {
  instagram: { post: [10, 20], story: [4, 8], reel: [8, 18], video: [15, 30] },
  tiktok: { post: [5, 12], story: [3, 6], reel: [6, 15], video: [10, 20] },
  youtube: { post: [6, 14], story: [3, 6], reel: [6, 14], video: [20, 40] },
  general: { post: [8, 16], story: [3, 6], reel: [7, 15], video: [14, 26] },
};

export const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low", INFO: "info" };

function round(n) {
  return Math.round(n);
}

/**
 * @param {{followers: number, engagementRate: number, platform: string}} input
 * @returns {{engagedFollowers: number, rates: Record<string, {low:number, high:number}>, findings: Array<{id:string, severity:string, title:string, detail:string}>}}
 */
export function computeRates({ followers, engagementRate, platform }) {
  const flw = Number.isFinite(followers) && followers > 0 ? followers : 0;
  const rate = Number.isFinite(engagementRate) && engagementRate > 0 ? Math.min(engagementRate, 100) : 0;
  const key = PLATFORMS.includes(platform) ? platform : "general";

  const engagedFollowers = flw * (rate / 100);
  const perThousandEngaged = engagedFollowers / 1000;

  const rates = {};
  for (const deliverable of DELIVERABLES) {
    const [cpmLow, cpmHigh] = CPM_PER_1000_ENGAGED[key][deliverable];
    rates[deliverable] = {
      cpmLow,
      cpmHigh,
      low: round(perThousandEngaged * cpmLow),
      high: round(perThousandEngaged * cpmHigh),
    };
  }

  const findings = [];

  if (flw === 0 || rate === 0) {
    findings.push({
      id: "missing-input",
      severity: SEVERITY.INFO,
      title: "Enter your follower count and engagement rate",
      detail: "Both numbers come from your own platform's native insights/analytics (Instagram, TikTok, and YouTube all report both). Prices below are all zero until real numbers are entered.",
    });
    return { engagedFollowers, rates, findings };
  }

  if (flw < 1000) {
    findings.push({
      id: "low-follower-count",
      severity: SEVERITY.MEDIUM,
      title: "Under 1,000 followers is below many marketplaces' minimum",
      detail: "Several influencer-marketing marketplaces and brand self-serve tools set an audience floor (often 1,000-10,000 followers) before listing a creator at all. Below that size, direct outreach to a brand whose product you already use, or a product-gifting arrangement, usually works better than a posted rate.",
    });
  }

  if (rate < 1) {
    findings.push({
      id: "low-engagement-rate",
      severity: SEVERITY.MEDIUM,
      title: "Engagement rate is below the range brands consider healthy",
      detail: "Under roughly 1% is low relative to typical creator benchmarks and can make a brand question follower quality, regardless of the price you quote. Since these prices are already calculated from engaged followers rather than raw follower count, they already account for this — but a brand evaluating your account from the outside may still ask why engagement looks low.",
    });
  } else if (rate > 15) {
    findings.push({
      id: "high-engagement-rate",
      severity: SEVERITY.INFO,
      title: "Engagement rate is unusually high",
      detail: "Above ~15% is unusual outside a very small or highly engaged niche account. That is a genuine selling point worth naming explicitly to a brand — highly engaged small accounts often out-convert larger, more passive ones — but double-check the number against your platform's own insights before quoting it.",
    });
  }

  return { engagedFollowers, rates, findings };
}
