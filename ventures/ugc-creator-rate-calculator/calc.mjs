// UGC creator rate calculator: what to charge a brand for user-generated-content
// videos the brand will post or run as ads, where the price is the content plus
// the RIGHTS to use it (paid-ad usage, whitelisting, exclusivity, raw footage).
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// The multipliers are commonly cited creator-market rules of thumb, written from
// memory WITHOUT network access in the building session. They are a negotiating
// starting point, not a market quote; the result says so and lists what to verify.

export const TIERS = [
  { id: "new", label: "New (first paid deals, small portfolio)", low: 75, high: 150 },
  { id: "mid", label: "Established (steady portfolio, repeat brands)", low: 150, high: 350 },
  { id: "pro", label: "Pro (strong niche portfolio, results to show)", low: 350, high: 900 },
];

export const FORMATS = [
  { id: "short", label: "Short video, up to 30 seconds", mult: 1 },
  { id: "mid", label: "Video, 30 to 60 seconds", mult: 1.25 },
  { id: "long", label: "Video, over 60 seconds", mult: 1.6 },
  { id: "photo", label: "Photo set (5 to 8 images)", mult: 0.7 },
];

export const NICHES = [
  { id: "general", label: "General lifestyle / home / food", mult: 1 },
  { id: "beauty", label: "Beauty / fashion / fitness", mult: 1.1 },
  { id: "tech", label: "Tech / apps / SaaS", mult: 1.3 },
  { id: "finance", label: "Finance / health / B2B", mult: 1.5 },
];

// Share of the base fee added for the right to run the content as a paid ad.
export const USAGE = [
  { id: "none", label: "Organic posting only, on the brand's own channels", add: 0 },
  { id: "d30", label: "Paid ads, 30 days", add: 0.25 },
  { id: "d90", label: "Paid ads, 90 days", add: 0.5 },
  { id: "d180", label: "Paid ads, 6 months", add: 1 },
  { id: "d365", label: "Paid ads, 12 months", add: 1.75 },
  { id: "forever", label: "Perpetual / unlimited term", add: 3 },
];

// Whitelisting: the brand runs ads from the CREATOR's handle (Spark / partnership ads).
export const WHITELIST = [
  { id: "none", label: "No access to my handle", add: 0 },
  { id: "d30", label: "Ads through my handle, 30 days", add: 0.2 },
  { id: "d90", label: "Ads through my handle, 90 days", add: 0.4 },
  { id: "d180", label: "Ads through my handle, 6 months", add: 0.75 },
];

export const EXCLUSIVITY = [
  { id: "none", label: "None", add: 0 },
  { id: "d30", label: "No competing brands, 30 days", add: 0.2 },
  { id: "d90", label: "No competing brands, 90 days", add: 0.4 },
  { id: "d180", label: "No competing brands, 6 months", add: 0.8 },
];

export const RAW_FOOTAGE_ADD = 0.25;
export const RUSH_ADD = 0.3;
export const EXTRA_HOOK_ADD = 0.1;       // per extra hook / intro variant, share of one video
export const EXTRA_REVISION_ADD = 0.1;   // per round beyond the two included, share of one video
export const INCLUDED_REVISIONS = 2;
export const BULK_DISCOUNT = [[10, 0.12], [5, 0.08], [3, 0.05]]; // [from N videos, discount]
export const WALK_AWAY_SHARE = 0.8;      // floor = 80% of the low end

export const VERIFY = "Recent UGC rate surveys from creator-economy sources, the brand's own brief and contract, and the platform's partnership-ad terms";

export const SAMPLE = {
  tier: "mid", format: "short", niche: "beauty", videos: 3,
  usage: "d90", whitelist: "d30", exclusivity: "none",
  rawFootage: "yes", rush: "no", extraHooks: 2, extraRevisions: 0, productCost: 40,
};

const find = (list, id) => list.find((x) => x.id === id);
const round5 = (n) => Math.round(n / 5) * 5;

function count(v, name, errors, max) {
  if (v === "" || v === null || v === undefined) { errors.push(`Enter ${name}.`); return null; }
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) { errors.push(`${name[0].toUpperCase()}${name.slice(1)} must be a whole number from 0 to ${max}.`); return null; }
  return n;
}

export function bulkDiscount(videos) {
  for (const [from, d] of BULK_DISCOUNT) if (videos >= from) return d;
  return 0;
}

export function priceUgc(input) {
  const errors = [];
  const tier = find(TIERS, input.tier);
  const format = find(FORMATS, input.format);
  const niche = find(NICHES, input.niche);
  const usage = find(USAGE, input.usage);
  const whitelist = find(WHITELIST, input.whitelist);
  const exclusivity = find(EXCLUSIVITY, input.exclusivity);
  if (!tier) errors.push("Choose your experience level.");
  if (!format) errors.push("Choose a deliverable format.");
  if (!niche) errors.push("Choose the brand's category.");
  if (!usage) errors.push("Choose the ad usage rights.");
  if (!whitelist) errors.push("Choose whether the brand gets access to your handle.");
  if (!exclusivity) errors.push("Choose an exclusivity term.");
  const videos = count(input.videos, "number of deliverables", errors, 100);
  if (videos === 0) errors.push("Number of deliverables must be at least 1.");
  const extraHooks = count(input.extraHooks ?? 0, "extra hook variants", errors, 20);
  const extraRevisions = count(input.extraRevisions ?? 0, "extra revision rounds", errors, 20);
  const productCost = Number(input.productCost === "" || input.productCost == null ? 0 : input.productCost);
  if (!Number.isFinite(productCost) || productCost < 0) errors.push("Product or props cost must be a number, zero or more.");
  if (input.rawFootage !== "yes" && input.rawFootage !== "no") errors.push("Say whether raw footage is included.");
  if (input.rush !== "yes" && input.rush !== "no") errors.push("Say whether this is a rush job (under 72 hours).");
  if (errors.length) return { ok: false, errors };

  const perLow = tier.low * format.mult * niche.mult;
  const perHigh = tier.high * format.mult * niche.mult;
  const rights = usage.add + whitelist.add + exclusivity.add
    + (input.rawFootage === "yes" ? RAW_FOOTAGE_ADD : 0)
    + (input.rush === "yes" ? RUSH_ADD : 0);
  const perVideoMult = 1 + rights;

  const lines = [];
  const add = (label, share) => lines.push({ label, share });
  add("Base fee per deliverable", 1);
  if (usage.add) add(`Ad usage rights (${usage.label.toLowerCase()})`, usage.add);
  if (whitelist.add) add(`Handle access (${whitelist.label.toLowerCase()})`, whitelist.add);
  if (exclusivity.add) add(`Exclusivity (${exclusivity.label.toLowerCase()})`, exclusivity.add);
  if (input.rawFootage === "yes") add("Raw footage handover", RAW_FOOTAGE_ADD);
  if (input.rush === "yes") add("Rush turnaround (under 72 hours)", RUSH_ADD);

  const discount = bulkDiscount(videos);
  const flatShare = extraHooks * EXTRA_HOOK_ADD + extraRevisions * EXTRA_REVISION_ADD;
  const scale = (per) => per * perVideoMult * videos * (1 - discount) + per * flatShare + productCost;
  const low = round5(scale(perLow));
  const high = round5(scale(perHigh));
  const walkAway = round5(low * WALK_AWAY_SHARE);

  const findings = [];
  if (usage.id === "none" && whitelist.id === "none") {
    findings.push({ severity: "info", title: "Organic-only deals are the cheapest to sell", detail: "If the brand later runs your video as an ad, that is a new licence. Put the usage term in writing so ad use is a paid upgrade, not a free extra." });
  }
  if (usage.id === "forever") {
    findings.push({ severity: "high", title: "Perpetual rights are rarely worth the headline price", detail: "Unlimited-term rights let the brand run the content forever. Many creators cap terms at 6 to 12 months and sell a renewal. If you accept perpetual, price it as a buyout and say so." });
  }
  if (whitelist.id !== "none") {
    findings.push({ severity: "medium", title: "Handle access puts ads under your name", detail: "The brand's ads run from your account, so their claims carry your name. Agree who approves ad copy, what the brand may not say, and how access is revoked on the end date." });
  }
  if (exclusivity.id !== "none") {
    findings.push({ severity: "medium", title: "Exclusivity costs you other deals", detail: "Define the category narrowly (not 'all beauty') and the exact window. The fee should cover what you expect to turn away." });
  }
  if (videos >= 3 && discount > 0) {
    findings.push({ severity: "info", title: `Bulk discount applied: ${Math.round(discount * 100)}%`, detail: "Bundles save you filming and pitching time per video. Drop the discount if the brand wants every video on a separate schedule." });
  }
  if (productCost > 0) {
    findings.push({ severity: "info", title: "Product cost is added at cost, outside the discount", detail: "Better still, ask the brand to ship the product so it is never your outlay." });
  }
  findings.push({ severity: "info", title: "This is a starting point, not a market quote", detail: `Rule-of-thumb ranges from memory. Check against ${VERIFY}.` });

  return { ok: true, low, high, walkAway, perVideoLow: round5(perLow * perVideoMult), perVideoHigh: round5(perHigh * perVideoMult), videos, discount, lines, findings, rightsShare: rights };
}

export function quoteText(input, result) {
  if (!result?.ok) return "";
  const usage = find(USAGE, input.usage);
  const wl = find(WHITELIST, input.whitelist);
  const ex = find(EXCLUSIVITY, input.exclusivity);
  const fmt = find(FORMATS, input.format);
  const out = [];
  out.push(`UGC quote: ${result.videos} x ${fmt.label.toLowerCase()}`);
  out.push(`Fee: $${result.low.toLocaleString()} to $${result.high.toLocaleString()} (open at the upper figure)`);
  out.push("Includes:");
  out.push(`- Concept, filming and editing, ${INCLUDED_REVISIONS} revision rounds`);
  out.push(`- ${usage.label}`);
  if (wl.add) out.push(`- ${wl.label}`);
  if (ex.add) out.push(`- ${ex.label}`);
  if (input.rawFootage === "yes") out.push("- Raw footage");
  out.push("Rights end on the stated date unless renewed in writing. Ad copy using my handle needs my approval.");
  return out.join("\n");
}
