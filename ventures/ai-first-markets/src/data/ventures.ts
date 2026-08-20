import type { ScoreDimension } from "@/lib/types";

// The portfolio's own 11 real ventures, scored on the SAME six dimensions the
// hypothetical ideas in ideas.ts use (each 0..10). This exists to test one
// claim in this venture's VENTURE.yaml: does scoring real ventures this way
// reproduce the router's dispatchable-vs-blocked split?
//
// How the scores were assigned. Each score is a judgment grounded only in
// facts stated in that venture's `ventures/<slug>/VENTURE.yaml` (its stage,
// description, hypothesis, and kill criteria) as of 2026-08-20 — not in any
// private information. They are deliberately moderate and are not tuned to
// force an outcome. The finding they produce is robust to reasonable
// re-scoring: `dispatchable` below is set by the router's own rule
// (allocate.py's `dispatchable` property — the first untested hypothesis is
// in-repo-checkable, or the venture is published), and NONE of the six
// dimensions measures evidence type or publication status. So business-quality
// score and dispatchability are measuring different things; see
// assessMethodTransfer() in ../lib/transfer.ts.
//
// `dispatchable` mirrors `python3 portfolio/router/allocate.py` on the same
// date: ai-first-markets and photos-import-tools are dispatchable (their next
// untested hypothesis is `evidence: in-repo`); the other nine are blocked
// (their next hypothesis is `evidence: customer-contact` and they are
// unpublished, so no session can settle them).

export interface RealVenture {
  slug: string;
  stage: "idea" | "prototype";
  // From portfolio/router/allocate.py's `dispatchable` property on 2026-08-20.
  dispatchable: boolean;
  dimensions: ScoreDimension[];
}

// Order of scores: ai-leverage, automation, time-to-revenue, margin,
// defensibility, market-access — identical to baseDimensions() in ideas.ts.
const dims = (
  scores: [number, number, number, number, number, number],
): ScoreDimension[] => {
  const meta: Array<[string, string]> = [
    ["ai-leverage", "AI Leverage"],
    ["automation", "Zero-Employee Ops"],
    ["time-to-revenue", "Time to Revenue"],
    ["margin", "Gross Margin"],
    ["defensibility", "Defensibility"],
    ["market-access", "Distribution"],
  ];
  return meta.map(([key, label], i) => ({
    key,
    label,
    score: scores[i],
    maxScore: 10,
    rationale: "",
  }));
};

export const realVentures: RealVenture[] = [
  {
    slug: "ai-engineering-academy",
    stage: "idea",
    dispatchable: false,
    dimensions: dims([8, 6, 3, 7, 4, 5]),
  },
  {
    slug: "ai-first-markets",
    stage: "prototype",
    dispatchable: true,
    dimensions: dims([7, 7, 3, 7, 3, 3]),
  },
  {
    slug: "garmin-world-traveler-watchface",
    stage: "prototype",
    dispatchable: false,
    dimensions: dims([1, 7, 4, 8, 3, 5]),
  },
  {
    slug: "local-site-studio",
    stage: "prototype",
    dispatchable: false,
    dimensions: dims([5, 6, 7, 7, 3, 6]),
  },
  {
    slug: "photo-editing",
    stage: "prototype",
    dispatchable: false,
    dimensions: dims([7, 6, 4, 6, 4, 5]),
  },
  {
    slug: "photos-import-tools",
    stage: "prototype",
    dispatchable: true,
    dimensions: dims([1, 6, 3, 6, 3, 3]),
  },
  {
    slug: "print-atelier",
    stage: "idea",
    dispatchable: false,
    dimensions: dims([5, 6, 3, 3, 4, 5]),
  },
  {
    slug: "quick-pick-survey",
    stage: "prototype",
    dispatchable: false,
    dimensions: dims([4, 7, 4, 8, 4, 5]),
  },
  {
    slug: "real-estate-agent-photo-app",
    stage: "idea",
    dispatchable: false,
    dimensions: dims([8, 5, 4, 7, 4, 5]),
  },
  {
    slug: "retail-pilot-intel",
    stage: "prototype",
    dispatchable: false,
    dimensions: dims([5, 6, 4, 8, 5, 4]),
  },
  {
    slug: "world-clock-widget",
    stage: "prototype",
    dispatchable: false,
    dimensions: dims([1, 7, 5, 8, 2, 6]),
  },
];
