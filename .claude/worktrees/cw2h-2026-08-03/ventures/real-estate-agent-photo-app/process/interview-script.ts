/**
 * Problem-interview scripts for Phase 1 (STRATEGY.md Week 1-2).
 *
 * These are meant to be run by a human (Duncan, or a hired researcher) —
 * agents cannot conduct live interviews. What agents *can* do is keep this
 * script sharp, keep the scoring rubric objective, and turn logged results
 * into a scored readout against the day-90 success criteria.
 */

export type InterviewQuestion = {
  id: string;
  prompt: string;
  /** What we're trying to learn from the answer. */
  purpose: string;
};

export type InterviewSection = {
  id: string;
  title: string;
  questions: InterviewQuestion[];
};

export const agentInterviewScript: InterviewSection[] = [
  {
    id: "current-workflow",
    title: "Current listing-media workflow",
    questions: [
      {
        id: "a1",
        prompt: "Walk me through what happens between signing a listing and photos going live.",
        purpose: "Map the real workflow and time cost, not the idealized one.",
      },
      {
        id: "a2",
        prompt: "Who shoots your photos today — you, a pro, an assistant, an app?",
        purpose: "Segment respondent: DIY vs outsourced (targets the ~65% who don't use a pro).",
      },
      {
        id: "a3",
        prompt: "What did your last 3 listings cost you in photography, in money and in hours?",
        purpose: "Anchors willingness-to-pay against real spend, per STRATEGY.md unit economics.",
      },
    ],
  },
  {
    id: "pain",
    title: "Pain and consequences",
    questions: [
      {
        id: "b1",
        prompt: "Have you ever felt a listing underperformed because of photo quality? What happened?",
        purpose: "Surfaces the days-on-market / fewer-showings pain point directly.",
      },
      {
        id: "b2",
        prompt: "What's the most annoying part of getting photos scheduled, shot, or edited?",
        purpose: "Finds the sharpest wedge feature (scheduling vs editing vs delivery).",
      },
    ],
  },
  {
    id: "willingness-to-pay",
    title: "Willingness to pay",
    questions: [
      {
        id: "c1",
        prompt:
          "If your phone could guide you through the shoot and hand you MLS-ready photos in 30 minutes, what would that be worth per listing, or per month?",
        purpose: "Direct pricing signal against the $29-99/mo and $8-19/listing tiers.",
      },
      {
        id: "c2",
        prompt: "Would you trust AI-enhanced photos for MLS, or only for social/marketing?",
        purpose: "Tests a real adoption blocker (MLS compliance / trust), not just interest.",
      },
    ],
  },
];

export const strHostInterviewScript: InterviewSection[] = [
  {
    id: "portfolio",
    title: "Portfolio and cadence",
    questions: [
      {
        id: "d1",
        prompt: "How many listings do you manage, and how often do photos need refreshing?",
        purpose: "Separates episodic single-property hosts from multi-property managers.",
      },
      {
        id: "d2",
        prompt: "What do you currently pay for photography per property, and how often?",
        purpose: "Validates the one-time $19-79/listing host-pack pricing vs a subscription.",
      },
    ],
  },
  {
    id: "value",
    title: "Perceived value",
    questions: [
      {
        id: "e1",
        prompt: "Have you noticed a booking or rate difference after refreshing photos?",
        purpose: "Corroborates the +21% earnings / +19% bookings claim from STRATEGY.md.",
      },
    ],
  },
];

export type PayWillingness = "no" | "maybe" | "yes_at_lower_price" | "yes";

export type InterviewResult = {
  date: string; // YYYY-MM-DD
  respondentType: "agent" | "str_host";
  metro: string;
  payWillingness: PayWillingness;
  monthlyDealVolumeOrUnits: number;
  notes: string;
};

/**
 * Scores logged interview results against STRATEGY.md's day-90 success
 * criterion: "at least 40% of interviewed agents would pay $49+/mo".
 */
export function scoreWillingnessToPay(results: InterviewResult[]): {
  respondents: number;
  willingCount: number;
  willingPct: number;
  meetsSuccessBar: boolean;
} {
  const agents = results.filter((r) => r.respondentType === "agent");
  const willingCount = agents.filter((r) => r.payWillingness === "yes").length;
  const respondents = agents.length;
  const willingPct = respondents === 0 ? 0 : Math.round((willingCount / respondents) * 100);
  return {
    respondents,
    willingCount,
    willingPct,
    meetsSuccessBar: respondents > 0 && willingPct >= 40,
  };
}

/**
 * No interviews have been logged yet — this array is the append target once
 * a human runs the scripts above. Keep entries in date order.
 */
export const loggedInterviewResults: InterviewResult[] = [];
