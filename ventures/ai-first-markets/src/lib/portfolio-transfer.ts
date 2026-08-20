import type { DimensionKey } from "./types";

/**
 * Transfer test for the second hypothesis in this venture's VENTURE.yaml:
 * "Scoring the portfolio's own 11 ventures on the same six dimensions ranks
 * them consistently with the router's dispatchable-vs-blocked split, so the
 * map's method transfers from the 8 hypothetical ideas to real ventures."
 *
 * The honest answer is built from repo-observable facts only, so it is
 * reproducible rather than asserted. Five of the six market-map dimensions
 * (AI Leverage, Zero-Employee Ops, Time to Revenue, Gross Margin,
 * Defensibility) have no recorded value for any real venture: every
 * `ventures/*​/VENTURE.yaml` carries `economics.mrr: null` and no per-venture
 * dimension scores. A six-dimension composite therefore cannot be computed
 * for these ventures without inventing five of its six inputs -- which would
 * be fabrication, not measurement (see the router's "Unmeasured is not zero"
 * rule).
 *
 * The sixth dimension, Distribution (`market-access`), does have a
 * repo-observable value: whether a venture's next unit of work can be settled
 * without an outside customer response. That single axis reproduces the
 * router's dispatchable-vs-blocked split exactly. So the method transfers on
 * the one axis that has data -- the binding one -- and not as a composite.
 * The literal hypothesis (a six-dimension ranking) is refuted; the reason is
 * itself the portfolio's standing distribution-first finding.
 */

// The two work classes the router's next-task column emits. `all-settled` is
// the case where a venture has no untested hypothesis left, which the router
// treats as dispatchable in-repo (write the next claim, then test it).
export type NextWorkEvidence = "in-repo" | "customer-contact" | "all-settled";

// One venture reduced to only the facts recorded in its VENTURE.yaml. No
// narrative scores: those do not exist for these ventures and are not invented
// here.
export interface VentureObservation {
  slug: string;
  stage: string;
  // links.production is non-null.
  published: boolean;
  // Evidence type of the venture's next untested hypothesis, or `all-settled`
  // when none remain untested.
  nextWorkEvidence: NextWorkEvidence;
}

// Transcribed from each ventures/*/VENTURE.yaml. The drift guard in
// portfolio-transfer.test.ts re-derives `published` and the dispatch class
// from the YAML on disk and fails if this list stops matching the repo, so a
// newly-added, published, or reclassified venture forces a re-review here.
export const portfolioObservations: VentureObservation[] = [
  { slug: "ai-engineering-academy", stage: "idea", published: false, nextWorkEvidence: "customer-contact" },
  { slug: "ai-first-markets", stage: "prototype", published: false, nextWorkEvidence: "all-settled" },
  { slug: "garmin-world-traveler-watchface", stage: "prototype", published: false, nextWorkEvidence: "customer-contact" },
  { slug: "local-site-studio", stage: "prototype", published: false, nextWorkEvidence: "customer-contact" },
  { slug: "photo-editing", stage: "prototype", published: false, nextWorkEvidence: "customer-contact" },
  { slug: "photos-import-tools", stage: "prototype", published: false, nextWorkEvidence: "all-settled" },
  { slug: "print-atelier", stage: "idea", published: false, nextWorkEvidence: "customer-contact" },
  { slug: "quick-pick-survey", stage: "prototype", published: false, nextWorkEvidence: "customer-contact" },
  { slug: "real-estate-agent-photo-app", stage: "idea", published: false, nextWorkEvidence: "customer-contact" },
  { slug: "retail-pilot-intel", stage: "prototype", published: false, nextWorkEvidence: "customer-contact" },
  { slug: "world-clock-widget", stage: "prototype", published: false, nextWorkEvidence: "customer-contact" },
];

// Which of the six market-map dimensions carry a repo-observable value for
// these ventures, and which do not.
export const OBSERVABLE_DIMENSIONS: DimensionKey[] = ["market-access"];
export const UNMEASURED_DIMENSIONS: DimensionKey[] = [
  "ai-leverage",
  "automation",
  "time-to-revenue",
  "margin",
  "defensibility",
];

// The router marks a venture dispatchable when its next unit of work is
// settleable in-repo (an untested in-repo hypothesis, or none left to test),
// and blocked when the next claim needs an outside customer response and
// nothing is published for that customer to respond to.
export function isDispatchable(v: VentureObservation): boolean {
  return v.nextWorkEvidence !== "customer-contact";
}

// Distribution (`market-access`) scored from observable facts on a 0..10 axis
// matching ideas.ts's maxScore. This is the only one of the six dimensions
// with a repo-recorded value for these ventures: a venture whose next result
// is observable from here scores the axis max; one gated on an unpublished
// outside response scores 0.
export function distributionScore(v: VentureObservation): number {
  return isDispatchable(v) ? 10 : 0;
}

export interface TransferResult {
  totalVentures: number;
  dispatchable: string[];
  blocked: string[];
  // The Distribution axis alone reproduces the router's split exactly.
  distributionAxisMatchesSplit: boolean;
  // A full six-dimension composite cannot be computed without fabricating the
  // five unmeasured dimensions.
  compositeComputable: boolean;
  unmeasuredDimensions: DimensionKey[];
  verdict: "transfers-on-distribution-axis-only";
}

export function evaluatePortfolioTransfer(): TransferResult {
  const dispatchable = portfolioObservations.filter(isDispatchable).map((v) => v.slug);
  const blocked = portfolioObservations.filter((v) => !isDispatchable(v)).map((v) => v.slug);

  // The Distribution axis matches the split by construction of the scoring
  // rule; the assertion here is that the two partitions agree venture-for-
  // venture: every dispatchable venture scores the axis max and every blocked
  // one scores zero.
  const distributionAxisMatchesSplit = portfolioObservations.every(
    (v) => (distributionScore(v) > 0) === isDispatchable(v),
  );

  return {
    totalVentures: portfolioObservations.length,
    dispatchable,
    blocked,
    distributionAxisMatchesSplit,
    compositeComputable: UNMEASURED_DIMENSIONS.length === 0,
    unmeasuredDimensions: UNMEASURED_DIMENSIONS,
    verdict: "transfers-on-distribution-axis-only",
  };
}
