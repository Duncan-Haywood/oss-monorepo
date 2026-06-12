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

export type PipelineStage =
  | "outreach-sent"
  | "replied"
  | "capture-uploaded"
  | "ai-processing"
  | "proof-pending"
  | "live-listing";

export type OutreachPipelineEntry = {
  prospectHandle: string;
  artistName: string;
  catalogArtworkSlug?: string;
  currentStage: PipelineStage;
  stageTimestamps: Partial<Record<PipelineStage, string>>;
  projectedMonthlyPayout: number;
};

/** Mock cohort pipeline for reply-to-live-listing velocity (Phase 1). */
export const outreachPipelineCohort: OutreachPipelineEntry[] = [
  {
    prospectHandle: "@dokonkwo_studio",
    artistName: "David Okonkwo",
    catalogArtworkSlug: "desert-sun",
    currentStage: "live-listing",
    projectedMonthlyPayout: 540,
    stageTimestamps: {
      "outreach-sent": "2026-06-01T10:00:00Z",
      replied: "2026-06-02T14:30:00Z",
      "capture-uploaded": "2026-06-02T16:00:00Z",
      "ai-processing": "2026-06-03T09:00:00Z",
      "proof-pending": "2026-06-04T11:00:00Z",
      "live-listing": "2026-06-05T18:00:00Z",
    },
  },
  {
    prospectHandle: "@elena_paints",
    artistName: "Elena Rostova",
    catalogArtworkSlug: "midnight-coast",
    currentStage: "ai-processing",
    projectedMonthlyPayout: 720,
    stageTimestamps: {
      "outreach-sent": "2026-06-08T09:00:00Z",
      replied: "2026-06-09T11:20:00Z",
      "capture-uploaded": "2026-06-09T15:45:00Z",
      "ai-processing": "2026-06-10T08:00:00Z",
    },
  },
  {
    prospectHandle: "@jameswu.art",
    artistName: "James Wu",
    catalogArtworkSlug: "city-at-dusk",
    currentStage: "proof-pending",
    projectedMonthlyPayout: 120,
    stageTimestamps: {
      "outreach-sent": "2026-06-05T12:00:00Z",
      replied: "2026-06-06T18:00:00Z",
      "capture-uploaded": "2026-06-07T10:30:00Z",
      "ai-processing": "2026-06-08T14:00:00Z",
      "proof-pending": "2026-06-09T16:00:00Z",
    },
  },
  {
    prospectHandle: "@marcus.art",
    artistName: "Marcus Chen",
    catalogArtworkSlug: "urban-geometry",
    currentStage: "replied",
    projectedMonthlyPayout: 432,
    stageTimestamps: {
      "outreach-sent": "2026-06-10T08:00:00Z",
      replied: "2026-06-11T19:30:00Z",
    },
  },
  {
    prospectHandle: "@sarahcreates",
    artistName: "Sarah Jenkins",
    catalogArtworkSlug: "spring-bloom",
    currentStage: "capture-uploaded",
    projectedMonthlyPayout: 348,
    stageTimestamps: {
      "outreach-sent": "2026-06-07T14:00:00Z",
      replied: "2026-06-08T20:00:00Z",
      "capture-uploaded": "2026-06-10T12:00:00Z",
    },
  },
];

const PIPELINE_STAGE_ORDER: PipelineStage[] = [
  "outreach-sent",
  "replied",
  "capture-uploaded",
  "ai-processing",
  "proof-pending",
  "live-listing",
];

const STAGE_LABELS: Record<PipelineStage, string> = {
  "outreach-sent": "Outreach sent",
  replied: "Artist replied",
  "capture-uploaded": "Capture uploaded",
  "ai-processing": "AI processing",
  "proof-pending": "Proof pending",
  "live-listing": "Live listing",
};

function hoursBetween(startIso: string, endIso: string): number {
  return (Date.parse(endIso) - Date.parse(startIso)) / (1000 * 60 * 60);
}

function getStageIndex(stage: PipelineStage): number {
  return PIPELINE_STAGE_ORDER.indexOf(stage);
}

export type CohortLaunchPlanItem = {
  prospectHandle: string;
  artistName: string;
  currentStage: PipelineStage;
  hoursSinceReply: number | null;
  projectedDaysToLive: number;
  onTrack: boolean;
  blockers: string[];
  nextMilestone: string;
};

export type ReplyToListingCompression = {
  compressionScore: number;
  medianHoursReplyToLive: number | null;
  averageHoursReplyToLive: number | null;
  targetHours: number;
  liveCount: number;
  inPipelineCount: number;
  onTrackCount: number;
  behindCount: number;
  stageFunnel: Array<{ stage: PipelineStage; label: string; count: number; avgHoursInStage: number }>;
  cohortPlan: CohortLaunchPlanItem[];
  summaryLabel: string;
};

export type ReplyToListingCompressionOptions = {
  now?: string;
  targetDaysToLive?: number;
  cohort?: OutreachPipelineEntry[];
};

export function calculateReplyToListingCompression(
  options: ReplyToListingCompressionOptions = {},
): ReplyToListingCompression {
  const {
    now = new Date().toISOString(),
    targetDaysToLive = 7,
    cohort = outreachPipelineCohort,
  } = options;
  const targetHours = targetDaysToLive * 24;
  const nowMs = Date.parse(now);

  const replyToLiveHours: number[] = [];
  const cohortPlan: CohortLaunchPlanItem[] = [];
  let onTrackCount = 0;
  let behindCount = 0;
  let liveCount = 0;
  let inPipelineCount = 0;

  for (const entry of cohort) {
    const replyAt = entry.stageTimestamps.replied;
    const liveAt = entry.stageTimestamps["live-listing"];
    const hoursSinceReply =
      replyAt !== undefined ? (nowMs - Date.parse(replyAt)) / (1000 * 60 * 60) : null;

    if (liveAt && replyAt) {
      replyToLiveHours.push(hoursBetween(replyAt, liveAt));
      liveCount += 1;
    } else if (replyAt) {
      inPipelineCount += 1;
    }

    const currentIndex = getStageIndex(entry.currentStage);
    const remainingStages = PIPELINE_STAGE_ORDER.length - 1 - currentIndex;
    const avgHoursPerStage = liveCount > 0 ? replyToLiveHours.reduce((a, b) => a + b, 0) / replyToLiveHours.length / 5 : 18;
    const projectedHoursToLive =
      entry.currentStage === "live-listing"
        ? 0
        : remainingStages * avgHoursPerStage;
    const projectedDaysToLive = Math.round((projectedHoursToLive / 24) * 10) / 10;

    const blockers: string[] = [];
    if (entry.currentStage === "proof-pending") {
      blockers.push("Awaiting proof approval");
    }
    if (entry.currentStage === "ai-processing") {
      blockers.push("AI tagging and mockup generation in progress");
    }
    if (!entry.catalogArtworkSlug) {
      blockers.push("No catalog SKU linked yet");
    }

    const onTrack =
      entry.currentStage === "live-listing" ||
      (hoursSinceReply !== null && hoursSinceReply + projectedHoursToLive <= targetHours);

    if (entry.currentStage === "live-listing") {
      onTrackCount += 1;
    } else if (onTrack) {
      onTrackCount += 1;
    } else {
      behindCount += 1;
    }

    const nextStage = PIPELINE_STAGE_ORDER[Math.min(currentIndex + 1, PIPELINE_STAGE_ORDER.length - 1)];
    cohortPlan.push({
      prospectHandle: entry.prospectHandle,
      artistName: entry.artistName,
      currentStage: entry.currentStage,
      hoursSinceReply: hoursSinceReply !== null ? Math.round(hoursSinceReply) : null,
      projectedDaysToLive,
      onTrack,
      blockers,
      nextMilestone:
        entry.currentStage === "live-listing"
          ? "Listing live — enroll in referral kit"
          : `Advance to ${STAGE_LABELS[nextStage]}`,
    });
  }

  const sorted = [...replyToLiveHours].sort((a, b) => a - b);
  const medianHoursReplyToLive =
    sorted.length === 0
      ? null
      : sorted.length % 2 === 1
        ? sorted[Math.floor(sorted.length / 2)]!
        : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  const averageHoursReplyToLive =
    sorted.length === 0 ? null : Math.round((sorted.reduce((sum, value) => sum + value, 0) / sorted.length) * 10) / 10;

  const stageFunnel = PIPELINE_STAGE_ORDER.map((stage) => {
    const entriesAtOrPast = cohort.filter((entry) => getStageIndex(entry.currentStage) >= getStageIndex(stage));
    const durations: number[] = [];

    for (const entry of cohort) {
      const enteredAt = entry.stageTimestamps[stage];
      const nextStageIndex = getStageIndex(stage) + 1;
      const nextStage = PIPELINE_STAGE_ORDER[nextStageIndex];
      const exitedAt = nextStage ? entry.stageTimestamps[nextStage] : undefined;
      if (enteredAt && exitedAt) {
        durations.push(hoursBetween(enteredAt, exitedAt));
      } else if (enteredAt && entry.currentStage === stage) {
        durations.push(hoursBetween(enteredAt, now));
      }
    }

    const avgHoursInStage =
      durations.length === 0
        ? 0
        : Math.round((durations.reduce((sum, value) => sum + value, 0) / durations.length) * 10) / 10;

    return {
      stage,
      label: STAGE_LABELS[stage],
      count: entriesAtOrPast.length,
      avgHoursInStage,
    };
  });

  const compressionRatio =
    medianHoursReplyToLive !== null ? Math.min(1, targetHours / medianHoursReplyToLive) : 0.5;
  const onTrackRatio = cohort.length > 0 ? onTrackCount / cohort.length : 0;
  const compressionScore = Math.round(compressionRatio * 50 + onTrackRatio * 50);

  const summaryLabel =
    liveCount === 0
      ? `${inPipelineCount} artists in pipeline; no live listings yet from this cohort`
      : `Median ${Math.round(medianHoursReplyToLive ?? 0)}h reply→live; ${onTrackCount}/${cohort.length} on ${targetDaysToLive}-day track`;

  return {
    compressionScore,
    medianHoursReplyToLive: medianHoursReplyToLive !== null ? Math.round(medianHoursReplyToLive) : null,
    averageHoursReplyToLive,
    targetHours,
    liveCount,
    inPipelineCount,
    onTrackCount,
    behindCount,
    stageFunnel,
    cohortPlan,
    summaryLabel,
  };
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
