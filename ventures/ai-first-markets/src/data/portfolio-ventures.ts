import type { PortfolioVenture } from "@/lib/types";

// The portfolio's own eleven ventures, scored on the same six dimensions the
// eight hypothetical ideas in `ideas.ts` use. Scores are hand-assigned from
// each venture's `VENTURE.yaml` and `README.md`, exactly as the ideas' scores
// are — the point of this dataset is to test whether that method transfers,
// not to replace it with a different one.
//
// Scoring was done on business merit alone, deliberately without reference to
// the router's dispatchable/blocked split, so the comparison in
// `portfolio-transfer.ts` is not circular. `dispatchable` below mirrors the
// router's own rule (`portfolio/router/allocate.py`: a venture is blocked when
// its first untested hypothesis needs `customer-contact` and `links.production`
// is null). Only ai-first-markets and photos-import-tools carry an in-repo
// first hypothesis today, so only they are dispatchable; the test suite pins
// that set so a change to either venture's YAML surfaces here.
const dimensions = (
  scores: [number, number, number, number, number, number],
  rationales: [string, string, string, string, string, string],
) =>
  (
    [
      ["ai-leverage", "AI Leverage"],
      ["automation", "Zero-Employee Ops"],
      ["time-to-revenue", "Time to Revenue"],
      ["margin", "Gross Margin"],
      ["defensibility", "Defensibility"],
      ["market-access", "Distribution"],
    ] as const
  ).map(([key, label], i) => ({
    key,
    label,
    score: scores[i],
    maxScore: 10,
    rationale: rationales[i],
  }));

export const portfolioVentures: PortfolioVenture[] = [
  {
    slug: "local-site-studio",
    stage: "prototype",
    dispatchable: false,
    dimensions: dimensions(
      [5, 6, 8, 8, 2, 5],
      [
        "AI drafts the sites and outreach, but the thing sold is a finished website — model quality is an input, not the product",
        "Preview-before-you-buy plus Stripe checkout is self-serve; local sales still tends to pull in a conversation",
        "$500 flat one-off, no subscription infrastructure to build first — the shortest path to a first dollar in the portfolio",
        "Hosting and per-site generation cost are both negligible against $500",
        "Wix, Squarespace and every local agency sell the same outcome; nothing here is hard to copy",
        "Local outbound is a real, well-understood channel, but it is manual and does not compound",
      ],
    ),
  },
  {
    slug: "photo-editing",
    stage: "prototype",
    dispatchable: false,
    dimensions: dimensions(
      [7, 6, 3, 6, 5, 3],
      [
        "VLM analysis drives story selection and grading — genuinely AI-native in the part that matters",
        "Ingest and render are automated, but media tooling generates real support load when someone's shoot is at stake",
        "Render workers are still unwritten; there is no end-to-end path from card to deliverable yet",
        "Compute and storage for video are a real COGS, unlike pure-SaaS ventures here",
        "The manifest, checksum and trust-boundary architecture is substantial and not quickly reproduced",
        "Photographers are reachable through communities, but no channel has been built or tested",
      ],
    ),
  },
  {
    slug: "real-estate-agent-photo-app",
    stage: "idea",
    dispatchable: false,
    dimensions: dimensions(
      [8, 5, 3, 6, 4, 4],
      [
        "The enhancement pipeline is the product; guided capture is AI-assisted end to end",
        "Phase 1 is concierge delivery by design — deliberately manual until the workflow is proven",
        "README records every agent-doable task as complete and everything remaining as human-blocked",
        "Per-listing inference is a recurring cost against a recurring fee",
        "Guided-capture flow plus MLS-ready delivery is a workflow moat, not a model moat",
        "Agents are reachable through brokerages, but distribution needs an App Store presence that does not exist",
      ],
    ),
  },
  {
    slug: "quick-pick-survey",
    stage: "prototype",
    dispatchable: false,
    dimensions: dimensions(
      [3, 8, 5, 8, 2, 3],
      [
        "Preference inference from pairwise picks is statistics, not a model — AI is incidental to the product",
        "Pure web SaaS with self-serve survey creation; nothing in the loop needs a person",
        "A working Postgres-backed deployment already exists — closer to shippable than most of the portfolio",
        "Cheap per-response SaaS economics",
        "Pairwise comparison is a published method; the incumbents can add it",
        "Researchers and product teams are reachable, but no channel has been built",
      ],
    ),
  },
  {
    slug: "ai-engineering-academy",
    stage: "idea",
    dispatchable: false,
    dimensions: dimensions(
      [8, 5, 2, 7, 3, 3],
      [
        "The AI mentor is the product — this is the most AI-native concept in the portfolio",
        "Teaching scales through the mentor, but cohorts and communities pull humans back in",
        "README states there is no code yet; the constitution has not been narrowed to an MVP",
        "Content plus inference, with no per-learner marginal cost beyond tokens",
        "Crowded category, and credentialing needs institutional partners this portfolio cannot sign",
        "Education has punishing acquisition costs and no channel is in place",
      ],
    ),
  },
  {
    slug: "world-clock-widget",
    stage: "prototype",
    dispatchable: false,
    dimensions: dimensions(
      [1, 9, 4, 7, 1, 6],
      [
        "No AI anywhere in the product, and none is needed",
        "App Store distribution with essentially no support or operational surface",
        "Shipping needs an Apple Developer Program membership, which needs a payment card and a legal identity",
        "Seventy to eighty-five percent after Apple's cut, with no serving costs",
        "World clock widgets are a commodity category with dozens of free entrants",
        "The App Store is a genuine discovery channel, but a saturated one for this category",
      ],
    ),
  },
  {
    slug: "ai-first-markets",
    stage: "prototype",
    dispatchable: true,
    dimensions: dimensions(
      [4, 7, 3, 9, 2, 3],
      [
        "The scores and rankings are hand-curated data; no model runs at request time",
        "A static site with no per-user state and nothing to operate",
        "There is no pricing, no buyer and no purchase surface — it is an internal decision tool",
        "Static content serving, effectively zero marginal cost",
        "A curated list of business ideas is the single most copyable asset in the portfolio",
        "Competes against an enormous supply of free idea lists with no distinguishing channel",
      ],
    ),
  },
  {
    slug: "retail-pilot-intel",
    stage: "prototype",
    dispatchable: false,
    dimensions: dimensions(
      [4, 4, 4, 7, 5, 2],
      [
        "SKU-gap detection and experiment readout are largely conventional statistics",
        "In-store installation and hardware make this the most touch-heavy venture here",
        "One named prospect boutique, no contract and no demo delivered",
        "Recurring analytics margins once past installation",
        "Privacy-first positioning plus accumulated per-store data is a defensible position",
        "A single boutique in Italy is not yet a repeatable channel",
      ],
    ),
  },
  {
    slug: "garmin-world-traveler-watchface",
    stage: "prototype",
    dispatchable: false,
    dimensions: dimensions(
      [0, 9, 3, 8, 1, 5],
      [
        "No AI in the product at all",
        "Store-distributed binary with no backend and no operational surface",
        "Connect IQ monetizes weakly, and the store account needs an identity this portfolio does not have",
        "No serving costs of any kind",
        "Watch faces are a commodity category; the design is nice but not protectable",
        "The Connect IQ store is a real channel, but a small one",
      ],
    ),
  },
  {
    slug: "photos-import-tools",
    stage: "prototype",
    dispatchable: true,
    dimensions: dimensions(
      [1, 8, 3, 9, 2, 3],
      [
        "Deterministic file tooling with no AI component",
        "A CLI the user runs; there is no service to keep up",
        "macOS import utilities are a category people expect for free, and no pricing exists",
        "Downloadable software with no marginal cost",
        "The scripts are replicable by anyone with the same problem",
        "GitHub and Homebrew only — the Mac App Store needs a paid developer account",
      ],
    ),
  },
  {
    slug: "print-atelier",
    stage: "idea",
    dispatchable: false,
    dimensions: dimensions(
      [6, 5, 3, 3, 3, 4],
      [
        "Cataloging, marketing copy and artist prospecting are all automated with models",
        "Print-on-demand outsources fulfilment, but artist relationships stay human",
        "A two-sided marketplace has to solve supply and demand cold-start simultaneously",
        "Print-on-demand COGS plus a thirty percent artist share leaves the thinnest margin in the portfolio",
        "Artist relationships are the only moat, and they are weak while volume is low",
        "Programmatic SEO and dynamic ads are plausible, but the ads half costs money the portfolio has not committed",
      ],
    ),
  },
];
