/**
 * listing-audit-rubric.ts — scoring rubric for the Phase 1 Zillow listing
 * audit (STRATEGY.md Week 1-2: "Collect 20 Zillow listings in one target
 * metro, split between mediocre and excellent").
 *
 * Collecting the 20 real listings still requires a human to browse a live
 * metro's active/recent Zillow listings (p1-listing-audit stays
 * human-blocked — no agent can do this) — but until now nothing defined
 * what "mediocre" vs "excellent" actually means, or how to turn 20 scored
 * listings into the "blind photo quality rating versus current DIY"
 * STRATEGY.md's day-90 success criteria (>= 7/10) depends on. This gives
 * that a fixed, objective instrument so scoring doesn't drift listing to
 * listing or session to session, and so the eventual result is a number,
 * not a vibe.
 *
 * Usage once a human collects listings: score each on the 6 dimensions
 * below (1-5 each), call computeOverallScore() for the 1-10 composite, and
 * append a ListingAuditEntry to listingAuditLog. Never fabricate entries —
 * this array starts empty and stays empty until real listings are scored.
 */

export type AuditDimension =
  | "lighting_exposure"
  | "composition_angle"
  | "staging_declutter"
  | "photo_count_coverage"
  | "resolution_sharpness"
  | "color_white_balance";

export type AuditDimensionSpec = {
  id: AuditDimension;
  label: string;
  /** What a 1 (worst) vs a 5 (best) looks like, kept concrete so scoring stays consistent across raters. */
  guidance: string;
};

export const AUDIT_DIMENSIONS: AuditDimensionSpec[] = [
  {
    id: "lighting_exposure",
    label: "Lighting & exposure",
    guidance:
      "1 = blown-out windows or underlit rooms, mixed harsh shadows. 5 = balanced natural + ambient light, no blown highlights or crushed shadows.",
  },
  {
    id: "composition_angle",
    label: "Composition & angle",
    guidance:
      "1 = crooked verticals, doorway/corner framing that hides the room. 5 = level verticals, corner-of-room angle that shows the space and a clear sightline.",
  },
  {
    id: "staging_declutter",
    label: "Staging & declutter",
    guidance:
      "1 = visible clutter, personal items, trash cans, cars in driveway shots. 5 = tidy, depersonalized, styled surfaces (or clean vacant rooms).",
  },
  {
    id: "photo_count_coverage",
    label: "Photo count & room coverage",
    guidance:
      "1 = under 9 photos or missing whole rooms (see process/mls-compliance.ts's photo-count-guidance rule). 5 = 15-25+ photos covering every livable room plus exterior/curb appeal.",
  },
  {
    id: "resolution_sharpness",
    label: "Resolution & sharpness",
    guidance:
      "1 = visibly blurry, low-res, or compression artifacts at normal zoom. 5 = sharp focus throughout, no visible motion blur or over-sharpening halos.",
  },
  {
    id: "color_white_balance",
    label: "Color & white balance",
    guidance:
      "1 = strong color cast (orange indoor-light tint, blue-grey underexposure). 5 = neutral, true-to-life color throughout the set.",
  },
];

export type ListingAuditEntry = {
  id: string;
  dateLogged: string; // YYYY-MM-DD
  metro: string;
  /** Public listing reference only — a URL or a non-identifying address label, no buyer/seller/agent PII. */
  listingRef: string;
  /** The human's own gut-call bucket before scoring, to check the rubric against intuition. */
  bucket: "mediocre" | "excellent";
  scores: Record<AuditDimension, number>; // 1-5 per dimension
  notes?: string;
};

/**
 * Averages the 6 dimension scores (1-5 each) and rescales to a 1-10
 * composite, matching STRATEGY.md's "blind quality rating" success
 * criterion's 1-10 scale (>= 7/10 to meet the day-90 bar).
 */
export function computeOverallScore(scores: Record<AuditDimension, number>): number {
  const values = AUDIT_DIMENSIONS.map((d) => scores[d.id]);
  const avgOutOfFive = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.round(((avgOutOfFive - 1) / 4) * 9 * 10) / 10 + 1; // maps [1,5] -> [1,10], one decimal
}

/**
 * Append-only. No entries yet — nothing has been audited in the real world
 * as of this writing; p1-listing-audit still needs a human to pick a metro
 * and collect real listings.
 */
export const listingAuditLog: ListingAuditEntry[] = [];

export function auditSummary(log: ListingAuditEntry[] = listingAuditLog): {
  count: number;
  mediocreCount: number;
  excellentCount: number;
  avgOverallScore: number | null;
  meetsSuccessBar: boolean;
} {
  const count = log.length;
  const mediocreCount = log.filter((e) => e.bucket === "mediocre").length;
  const excellentCount = log.filter((e) => e.bucket === "excellent").length;
  const scores = log.map((e) => computeOverallScore(e.scores));
  const avgOverallScore = count === 0 ? null : Math.round((scores.reduce((s, v) => s + v, 0) / count) * 10) / 10;
  return {
    count,
    mediocreCount,
    excellentCount,
    avgOverallScore,
    meetsSuccessBar: avgOverallScore !== null && avgOverallScore >= 7,
  };
}
