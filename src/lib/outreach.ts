import { buildPayoutExceptionQueue, catalogArtworks, type PayoutExceptionQueueItem } from "./marketplace";

export type ProspectStatus = "Draft" | "Sent" | "Opened" | "Replied" | "Onboarded";

export type ReplyClassification =
  | "Ready for upload link"
  | "Needs payout/licensing answer"
  | "Send proof mockup"
  | "No reply yet"
  | "Needs human review";

export type OutreachProspect = {
  name: string;
  handle: string;
  platform: "Instagram" | "TikTok" | "Pinterest";
  followers: number;
  status: ProspectStatus;
  fitScore: number;
  styleSignal: string;
  replyText?: string;
  projectedMonthlyArtistPayout: number;
  catalogArtworkSlug?: string;
};

export type OutreachQueueItem = OutreachProspect & {
  priorityScore: number;
  replyClassification: ReplyClassification;
  nextAction: string;
  payoutGuardrail?: Pick<
    PayoutExceptionQueueItem,
    "severity" | "blockers" | "nextAction" | "suggestedRetailPrice"
  >;
};

export const outreachProspects: OutreachProspect[] = [
  {
    name: "Elena Rostova",
    handle: "@elena_paints",
    platform: "Instagram",
    followers: 12400,
    status: "Replied",
    fitScore: 92,
    styleSignal: "Coastal oil series over-indexes with moody blue room searches",
    replyText: "I love this, send me the upload link and earnings estimate.",
    projectedMonthlyArtistPayout: 720,
    catalogArtworkSlug: "midnight-coast",
  },
  {
    name: "Marcus Chen",
    handle: "@marcus.art",
    platform: "Instagram",
    followers: 8200,
    status: "Opened",
    fitScore: 87,
    styleSignal: "Geometric abstracts match high-margin monochrome interiors",
    projectedMonthlyArtistPayout: 432,
    catalogArtworkSlug: "urban-geometry",
  },
  {
    name: "Sarah Jenkins",
    handle: "@sarahcreates",
    platform: "TikTok",
    followers: 15100,
    status: "Sent",
    fitScore: 85,
    styleSignal: "Botanical reels convert into spring wall-art searches",
    projectedMonthlyArtistPayout: 348,
    catalogArtworkSlug: "spring-bloom",
  },
  {
    name: "David Okonkwo",
    handle: "@dokonkwo_studio",
    platform: "Instagram",
    followers: 6800,
    status: "Onboarded",
    fitScore: 90,
    styleSignal: "Warm landscape catalog already has proof-approved demand",
    projectedMonthlyArtistPayout: 540,
    catalogArtworkSlug: "desert-sun",
  },
  {
    name: "Luna Martinez",
    handle: "@luna.watercolor",
    platform: "Pinterest",
    followers: 22300,
    status: "Draft",
    fitScore: 78,
    styleSignal: "Watercolor boards have volume but need clearer POD margins",
    projectedMonthlyArtistPayout: 216,
  },
  {
    name: "James Wu",
    handle: "@jameswu.art",
    platform: "Instagram",
    followers: 4500,
    status: "Replied",
    fitScore: 81,
    styleSignal: "Minimal city scenes fit B2B designer sourcing",
    replyText: "What are the artist payout terms and do I keep the original rights?",
    projectedMonthlyArtistPayout: 120,
    catalogArtworkSlug: "city-at-dusk",
  },
];

export function classifyProspectReply(replyText?: string): ReplyClassification {
  if (!replyText) {
    return "No reply yet";
  }

  const normalized = replyText.toLowerCase();

  if (/(upload|signup|sign up|earnings|estimate)/.test(normalized)) {
    return "Ready for upload link";
  }
  if (/(payout|terms|rights|license|licensing|original)/.test(normalized)) {
    return "Needs payout/licensing answer";
  }
  if (/(mockup|mockups|example|examples|proof|visual)/.test(normalized)) {
    return "Send proof mockup";
  }

  return "Needs human review";
}

function getStatusWeight(status: ProspectStatus) {
  const weights: Record<ProspectStatus, number> = {
    Replied: 5,
    Opened: 2,
    Sent: 1,
    Onboarded: -5,
    Draft: -10,
  };

  return weights[status];
}

function getNextAction(
  classification: ReplyClassification,
  status: ProspectStatus,
  payoutGuardrail?: OutreachQueueItem["payoutGuardrail"],
) {
  if (payoutGuardrail) {
    return `Hold outreach: ${payoutGuardrail.nextAction}`;
  }
  if (classification === "Ready for upload link") {
    return "Send capture upload link + payout calculator";
  }
  if (classification === "Needs payout/licensing answer") {
    return "Send payout terms + artist rights explainer";
  }
  if (classification === "Send proof mockup") {
    return "Generate room mockup + send proof pack";
  }
  if (status === "Opened") {
    return "Send social-proof follow-up";
  }
  if (status === "Sent") {
    return "Wait 24h, then personalize follow-up";
  }
  if (status === "Onboarded") {
    return "Create artist referral kit";
  }

  return "Draft AI-personalized first touch";
}

export function buildOutreachQueue(prospects: OutreachProspect[]): OutreachQueueItem[] {
  const payoutExceptionBySlug = new Map(
    buildPayoutExceptionQueue(catalogArtworks).map((exception) => [exception.artwork.slug, exception]),
  );

  return prospects
    .map((prospect) => {
      const replyClassification = classifyProspectReply(prospect.replyText);
      const payoutException = prospect.catalogArtworkSlug
        ? payoutExceptionBySlug.get(prospect.catalogArtworkSlug)
        : undefined;
      const payoutGuardrail = payoutException
        ? {
            severity: payoutException.severity,
            blockers: payoutException.blockers,
            nextAction: payoutException.nextAction,
            suggestedRetailPrice: payoutException.suggestedRetailPrice,
          }
        : undefined;

      return {
        ...prospect,
        priorityScore: prospect.fitScore + getStatusWeight(prospect.status),
        replyClassification,
        nextAction: getNextAction(replyClassification, prospect.status, payoutGuardrail),
        payoutGuardrail,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

export function calculateOutreachSummary(prospects: OutreachProspect[]) {
  const queue = buildOutreachQueue(prospects);
  const repliedProspects = queue.filter((prospect) => prospect.status === "Replied").length;
  const readyForOnboarding = queue.filter(
    (prospect) => prospect.replyClassification === "Ready for upload link" && !prospect.payoutGuardrail,
  ).length;

  return {
    totalProspects: prospects.length,
    repliedProspects,
    readyForOnboarding,
    averageFitScore: Math.round(
      prospects.reduce((sum, prospect) => sum + prospect.fitScore, 0) / Math.max(prospects.length, 1),
    ),
    projectedMonthlyArtistPayout: prospects.reduce(
      (sum, prospect) => sum + prospect.projectedMonthlyArtistPayout,
      0,
    ),
    automationLabel: `${repliedProspects} replies need AI follow-up; ${readyForOnboarding} can enter onboarding now`,
  };
}
