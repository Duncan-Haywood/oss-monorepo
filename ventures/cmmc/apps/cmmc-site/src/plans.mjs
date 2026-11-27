// The workspace's public plans, as the pricing page shows them once the app is open.
//
// A copy of apps/cmmc/src/shared/plans.ts (PLAN_LIST, the free and purchasable entries), because this
// site has no TypeScript build. test/plans.test.mjs reads that file and fails when a name,
// description, price or feature line here differs from it, so the site cannot advertise a plan the
// app does not sell. Annual prices follow packages/billing's annualPriceFor (10% off twelve months,
// rounded to the dollar).

/** @typedef {{ key: string, name: string, description: string, priceCents: number, annualPriceCents: number | null, features: string[] }} PublicPlan */

/** @type {readonly PublicPlan[]} */
const PLANS = [
  {
    key: "free",
    name: "Level 1",
    description:
      "The 15 Level 1 safeguards (FAR 52.204-21): status, evidence, SSP and the pass/fail result.",
    priceCents: 0,
    annualPriceCents: null,
    features: [
      "Level 1: the 15 FAR 52.204-21 safeguards",
      "1 user",
      "10 AI statement drafts a month",
      "250 MB of evidence",
      "Level 2 requirements to read (recording them needs Level 2)",
      "The ISO 9001 clause checklist to read",
    ],
  },
  {
    key: "level2",
    name: "Level 2",
    description:
      "The 110 NIST SP 800-171 Rev. 2 requirements with objectives, SPRS score, SSP and POA&M for a small shop.",
    priceCents: 24_900,
    annualPriceCents: 268_900,
    features: [
      "Level 2: 110 requirements and 320 assessment objectives",
      "3 users",
      "150 AI statement drafts a month",
      "10 GB of evidence",
      "SPRS score, SSP and POA&M (CSV) with conditional-status checks",
      "Everything in Level 1",
    ],
  },
  {
    key: "team",
    name: "Level 2 + Quality",
    description:
      "Level 2 plus the ISO 9001:2015 clause checklist on the same evidence, for a shop where IT, quality and the owner all work in it.",
    priceCents: 39_900,
    annualPriceCents: 430_900,
    features: [
      "Level 2: 110 requirements and 320 assessment objectives",
      "10 users",
      "400 AI statement drafts a month",
      "50 GB of evidence",
      "ISO 9001:2015 clause checklist: status, notes, readiness and a gap report, reusing your CMMC evidence",
      "Everything in Level 2",
    ],
  },
];

const esc = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** The plans in price order, with their text escaped for HTML. */
export function publicPlans() {
  return PLANS.map((p) => ({
    ...p,
    name: esc(p.name),
    description: esc(p.description),
    features: p.features.map(esc),
  }));
}

/** The raw copy (tests compare it with the app's plans.ts). */
export const PLAN_COPY = PLANS;
