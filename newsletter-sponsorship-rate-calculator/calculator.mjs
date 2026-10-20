/**
 * Newsletter sponsorship rate calculator, as a deterministic module.
 *
 * Newsletter sponsorship marketplaces (Swapstack, Paved, Sponsy) and
 * creator-economy write-ups routinely quote ad prices as a CPM against
 * *opens*, not raw subscriber count -- a sponsor is paying for eyes on the
 * ad, and open rate is the one number that separates a list of 20,000
 * mostly-dormant addresses from a list of 5,000 people who read every
 * issue. This module applies commonly cited benchmark CPM-per-1000-opens
 * ranges, by niche and by placement, to a newsletter's own numbers and
 * returns a price *range* per placement -- a starting point for
 * negotiation, never a quote or a valuation performed on the user's
 * behalf. See index.html's disclaimer for the exact wording.
 *
 * Benchmark ranges are deliberately wide and clearly labeled as general
 * market ranges rather than a specific quote: actual rates vary by list
 * quality, click-through history, and how badly a given sponsor wants that
 * audience on that week.
 */

export const PLACEMENTS = ["dedicated", "primary", "secondary", "classified"];

export const PLACEMENT_LABELS = {
  dedicated: "Dedicated send (solo email, just the ad)",
  primary: "Primary in-issue placement (top ad slot)",
  secondary: "Secondary in-issue placement (lower ad slot)",
  classified: "Classified / text-link placement",
};

export const NICHES = ["general", "tech", "finance", "b2b"];

export const NICHE_LABELS = {
  general: "General interest / lifestyle",
  tech: "Tech / SaaS / startups",
  finance: "Finance / business / investing",
  b2b: "B2B / niche professional",
};

// Commonly cited CPM-per-1000-opens ranges [low, high], USD, by niche and
// placement. Deliberately wide: these are general market ranges to anchor
// a negotiation, not a quote for any specific list.
const CPM_PER_1000_OPENS = {
  general: { dedicated: [30, 50], primary: [20, 35], secondary: [12, 20], classified: [6, 10] },
  tech: { dedicated: [40, 70], primary: [25, 45], secondary: [15, 25], classified: [8, 12] },
  finance: { dedicated: [50, 90], primary: [35, 55], secondary: [20, 30], classified: [10, 15] },
  b2b: { dedicated: [45, 80], primary: [30, 50], secondary: [18, 28], classified: [9, 14] },
};

export const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low", INFO: "info" };

function round(n) {
  return Math.round(n);
}

/**
 * @param {{subscribers: number, openRate: number, niche: string}} input
 * @returns {{opens: number, rates: Record<string, {low:number, high:number}>, findings: Array<{id:string, severity:string, title:string, detail:string}>}}
 */
export function computeRates({ subscribers, openRate, niche }) {
  const subs = Number.isFinite(subscribers) && subscribers > 0 ? subscribers : 0;
  const rate = Number.isFinite(openRate) && openRate > 0 ? Math.min(openRate, 100) : 0;
  const key = NICHES.includes(niche) ? niche : "general";

  const opens = subs * (rate / 100);
  const perThousandOpens = opens / 1000;

  const rates = {};
  for (const placement of PLACEMENTS) {
    const [cpmLow, cpmHigh] = CPM_PER_1000_OPENS[key][placement];
    rates[placement] = {
      cpmLow,
      cpmHigh,
      low: round(perThousandOpens * cpmLow),
      high: round(perThousandOpens * cpmHigh),
    };
  }

  const findings = [];

  if (subs === 0 || rate === 0) {
    findings.push({
      id: "missing-input",
      severity: SEVERITY.INFO,
      title: "Enter your subscriber count and open rate",
      detail: "Both numbers come from your own newsletter platform's dashboard (Substack, beehiiv, ConvertKit, Mailchimp, and others all report both). Prices below are all zero until real numbers are entered.",
    });
    return { opens, rates, findings };
  }

  if (subs < 1000) {
    findings.push({
      id: "small-list",
      severity: SEVERITY.MEDIUM,
      title: "Under 1,000 subscribers is below many sponsors' minimum",
      detail: "Several newsletter ad marketplaces set an audience floor (often 1,000-2,500 subscribers) before listing a newsletter at all. Below that size, direct outreach to a sponsor whose audience you clearly overlap with usually works better than a posted rate card.",
    });
  }

  if (rate < 15) {
    findings.push({
      id: "low-open-rate",
      severity: SEVERITY.MEDIUM,
      title: "Open rate is below the range sponsors usually expect",
      detail: "A sub-15% open rate is low relative to typical email newsletter benchmarks and will make a sponsor discount the subscriber count heavily regardless of the price you quote. Since these prices are already calculated from opens rather than raw subscribers, they already account for this — but a sponsor evaluating your list from the outside may still ask why the open rate is low.",
    });
  } else if (rate > 70) {
    findings.push({
      id: "high-open-rate",
      severity: SEVERITY.INFO,
      title: "Open rate is unusually high",
      detail: "Above ~70% is unusual outside a very small or highly engaged list. That is a genuine selling point worth naming explicitly to a sponsor — highly engaged small lists often out-convert larger, more passive ones — but double-check the number against your platform's own reporting period before quoting it.",
    });
  }

  return { opens, rates, findings };
}
