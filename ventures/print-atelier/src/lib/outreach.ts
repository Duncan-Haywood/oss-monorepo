import type { ArtistOnboardingSource } from "./artist-onboarding";
import {
  buildPayoutExceptionQueue,
  calculatePrintEconomics,
  catalogArtworks,
  type CatalogArtwork,
  type PayoutExceptionQueueItem,
} from "./marketplace";

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
    status: "Replied",
    fitScore: 87,
    styleSignal: "Geometric abstracts match high-margin monochrome interiors",
    replyText: "These look interesting — can you send room mockup examples before I commit?",
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

export type ArtistOnboardingDeepLinkParams = {
  handle: string;
  name: string;
  source: ArtistOnboardingSource;
};

export function buildArtistOnboardingDeepLink(
  prospect: Pick<OutreachProspect, "name" | "handle">,
  basePath = "/artist-onboard",
): string {
  const params = new URLSearchParams({
    handle: prospect.handle.replace(/^@/, ""),
    name: prospect.name,
    source: "outreach",
  });
  return `${basePath}?${params.toString()}`;
}

export function isOnboardingDeepLinkEligible(item: OutreachQueueItem): boolean {
  if (item.payoutGuardrail) {
    return false;
  }
  return (
    item.replyClassification === "Ready for upload link" ||
    (item.status === "Replied" && item.replyClassification !== "Needs human review")
  );
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

export type ProofMockupScene = {
  id: string;
  roomLabel: string;
  decorIntent: string;
  previewLabel: string;
  hasApprovedAsset: boolean;
};

export type ProofMockupResponseKit = {
  prospectHandle: string;
  artistName: string;
  artworkTitle: string | null;
  artworkSlug: string | null;
  readyToSend: boolean;
  blockers: string[];
  roomScenes: ProofMockupScene[];
  payoutProof: {
    retailPrice: number;
    artistPayoutPerOrder: number;
    monthlyPayoutEstimate: number;
    payoutLine: string;
  } | null;
  dmCopy: string;
  emailCopy: string;
  attachmentLabels: string[];
};

const ROOM_SCENE_TEMPLATES: Array<{ roomLabel: string; decorIntent: string }> = [
  { roomLabel: "Living room", decorIntent: "gallery wall above sofa" },
  { roomLabel: "Bedroom", decorIntent: "accent piece above nightstand" },
  { roomLabel: "Home office", decorIntent: "minimal desk backdrop" },
];

function buildRoomScenes(artwork: CatalogArtwork): ProofMockupScene[] {
  const primaryTag = artwork.tags[0] ?? artwork.style.toLowerCase();

  return ROOM_SCENE_TEMPLATES.map((template, index) => ({
    id: `${artwork.slug}-${index}`,
    roomLabel: template.roomLabel,
    decorIntent: template.decorIntent,
    previewLabel: `${template.roomLabel} — ${primaryTag} ${template.decorIntent}`,
    hasApprovedAsset: artwork.hasRoomMockups && artwork.hasApprovedProof,
  }));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function buildProofMockupResponseKit(
  prospect: OutreachProspect,
  options: { monthlyOrders?: number } = {},
): ProofMockupResponseKit {
  const monthlyOrders = options.monthlyOrders ?? 12;
  const artwork = prospect.catalogArtworkSlug
    ? catalogArtworks.find((item) => item.slug === prospect.catalogArtworkSlug)
    : undefined;
  const blockers: string[] = [];

  if (!artwork) {
    blockers.push("No catalog SKU linked — generate mockups after capture upload");
  } else {
    if (!artwork.hasApprovedProof) {
      blockers.push(`${artwork.title} is missing an approved print proof`);
    }
    if (!artwork.hasRoomMockups) {
      blockers.push(`${artwork.title} needs AI room mockups before sending examples`);
    }
  }

  const roomScenes = artwork ? buildRoomScenes(artwork) : [];
  const payoutProof = artwork
    ? (() => {
        const economics = calculatePrintEconomics({
          retailPrice: artwork.retailPrice,
          fulfillmentCost: artwork.fulfillmentCost,
        });
        const monthlyPayoutEstimate = economics.artistShare * monthlyOrders;

        return {
          retailPrice: artwork.retailPrice,
          artistPayoutPerOrder: economics.artistShare,
          monthlyPayoutEstimate,
          payoutLine: `${formatCurrency(economics.artistShare)} per ${formatCurrency(artwork.retailPrice)} print (~${formatCurrency(monthlyPayoutEstimate)}/mo at ${monthlyOrders} orders)`,
        };
      })()
    : null;

  const artworkLabel = artwork?.title ?? "your work";
  const sceneSummary =
    roomScenes.length > 0
      ? roomScenes.map((scene) => scene.previewLabel).join("; ")
      : "living room, bedroom, and office previews";

  const dmCopy = payoutProof
    ? `Hi ${prospect.name.split(" ")[0]} — attached ${roomScenes.length} room scenes for ${artworkLabel} plus payout proof: ${payoutProof.payoutLine}. Upload link is ready when you want to go live.`
    : `Hi ${prospect.name.split(" ")[0]} — we can generate room scenes (${sceneSummary}) once you upload one phone capture. I'll send payout proof with the mockups.`;

  const emailCopy = payoutProof
    ? `Subject: Room mockups + payout proof for ${artworkLabel}\n\nHi ${prospect.name},\n\nAs requested, here are proofed room scenes (${sceneSummary}) and transparent payout math: ${payoutProof.payoutLine}.\n\nPrint Atelier pays 30% of net profit after POD, payment, and AI costs — not a flat royalty. You keep copyright; we only license POD and marketing rights with explicit consent.\n\nReply "upload" and I'll send the capture link.`
    : `Subject: Mockup examples for ${prospect.name}\n\nHi ${prospect.name},\n\nHappy to send room mockup examples. Upload one phone capture first and we'll return ${sceneSummary} plus an earnings estimate within 24h.\n\nReply when you're ready for the secure upload link.`;

  const attachmentLabels = [
    ...roomScenes.map((scene) => `${scene.roomLabel} mockup — ${artwork?.title ?? "preview"}`),
    payoutProof ? `Payout proof — ${payoutProof.payoutLine}` : "Payout estimate — pending capture",
    artwork?.hasSeoCopy ? "SEO listing preview" : "Listing draft — pending metadata",
  ];

  return {
    prospectHandle: prospect.handle,
    artistName: prospect.name,
    artworkTitle: artwork?.title ?? null,
    artworkSlug: artwork?.slug ?? null,
    readyToSend: blockers.length === 0 && roomScenes.every((scene) => scene.hasApprovedAsset),
    blockers,
    roomScenes,
    payoutProof,
    dmCopy,
    emailCopy,
    attachmentLabels,
  };
}

export function buildProofMockupKitsForQueue(
  prospects: OutreachProspect[] = outreachProspects,
): ProofMockupResponseKit[] {
  return buildOutreachQueue(prospects)
    .filter((prospect) => prospect.replyClassification === "Send proof mockup")
    .map((prospect) => buildProofMockupResponseKit(prospect));
}

export type OutreachAttributionStage =
  | "outreach"
  | "replied"
  | "onboard-intake"
  | "capture-linked"
  | "live-listing"
  | "stalled";

export type OutreachCohortAttributionRow = {
  handle: string;
  name: string;
  platform: OutreachProspect["platform"];
  attributionStage: OutreachAttributionStage;
  prospectStatus: ProspectStatus;
  pipelineStage: PipelineStage | null;
  hoursSinceOutreach: number | null;
  projectedMonthlyPayout: number;
  catalogArtworkSlug: string | null;
  dropOffReason: string | null;
  deepLinkEligible: boolean;
};

export type OutreachCohortAttribution = {
  generatedAt: string;
  rows: OutreachCohortAttributionRow[];
  funnelCounts: Record<OutreachAttributionStage, number>;
  conversionRates: {
    replyRate: number;
    onboardRate: number;
    liveRate: number;
  };
  platformBreakdown: Array<{
    platform: OutreachProspect["platform"];
    prospects: number;
    replied: number;
    live: number;
    projectedPayout: number;
  }>;
  attributedPayoutLive: number;
  attributedPayoutPipeline: number;
  summaryLabel: string;
};

export type OutreachCohortAttributionOptions = {
  now?: string;
  prospects?: OutreachProspect[];
  cohort?: OutreachPipelineEntry[];
};

function mapPipelineToAttributionStage(
  pipelineStage: PipelineStage | null,
  prospectStatus: ProspectStatus,
): OutreachAttributionStage {
  if (pipelineStage === "live-listing") {
    return "live-listing";
  }
  if (pipelineStage === "capture-uploaded" || pipelineStage === "ai-processing" || pipelineStage === "proof-pending") {
    return pipelineStage === "capture-uploaded" ? "capture-linked" : "onboard-intake";
  }
  if (prospectStatus === "Onboarded") {
    return "onboard-intake";
  }
  if (prospectStatus === "Replied" || pipelineStage === "replied") {
    return "replied";
  }
  if (prospectStatus === "Draft" || prospectStatus === "Sent" || prospectStatus === "Opened") {
    return prospectStatus === "Opened" || prospectStatus === "Sent" ? "outreach" : "outreach";
  }
  return "stalled";
}

function dropOffReasonForRow(
  row: Pick<OutreachCohortAttributionRow, "attributionStage" | "prospectStatus" | "pipelineStage">,
  payoutGuardrail: boolean,
): string | null {
  if (row.attributionStage === "live-listing") {
    return null;
  }
  if (payoutGuardrail) {
    return "Payout guardrail hold — fix SKU economics before onboarding";
  }
  if (row.prospectStatus === "Draft") {
    return "Outreach draft not sent";
  }
  if (row.prospectStatus === "Sent" || row.prospectStatus === "Opened") {
    return "Awaiting artist reply";
  }
  if (row.pipelineStage === "proof-pending") {
    return "Proof approval pending";
  }
  if (row.pipelineStage === "ai-processing") {
    return "AI tagging and mockups in progress";
  }
  if (row.attributionStage === "replied") {
    return "Reply received — send onboarding deep-link";
  }
  return null;
}

export function buildOutreachCohortAttribution(
  options: OutreachCohortAttributionOptions = {},
): OutreachCohortAttribution {
  const {
    now = new Date().toISOString(),
    prospects = outreachProspects,
    cohort = outreachPipelineCohort,
  } = options;
  const nowMs = Date.parse(now);
  const queue = buildOutreachQueue(prospects);
  const cohortByHandle = new Map(cohort.map((entry) => [entry.prospectHandle, entry]));

  const rows: OutreachCohortAttributionRow[] = prospects.map((prospect) => {
    const queueItem = queue.find((item) => item.handle === prospect.handle);
    const cohortEntry = cohortByHandle.get(prospect.handle) ?? null;
    const pipelineStage = cohortEntry?.currentStage ?? null;
    const attributionStage = mapPipelineToAttributionStage(pipelineStage, prospect.status);
    const outreachAt = cohortEntry?.stageTimestamps["outreach-sent"];
    const hoursSinceOutreach =
      outreachAt !== undefined ? Math.round((nowMs - Date.parse(outreachAt)) / (1000 * 60 * 60)) : null;

    return {
      handle: prospect.handle,
      name: prospect.name,
      platform: prospect.platform,
      attributionStage,
      prospectStatus: prospect.status,
      pipelineStage,
      hoursSinceOutreach,
      projectedMonthlyPayout: prospect.projectedMonthlyArtistPayout,
      catalogArtworkSlug: prospect.catalogArtworkSlug ?? cohortEntry?.catalogArtworkSlug ?? null,
      dropOffReason: dropOffReasonForRow(
        { attributionStage, prospectStatus: prospect.status, pipelineStage },
        Boolean(queueItem?.payoutGuardrail),
      ),
      deepLinkEligible: queueItem ? isOnboardingDeepLinkEligible(queueItem) : false,
    };
  });

  const funnelCounts: Record<OutreachAttributionStage, number> = {
    outreach: 0,
    replied: 0,
    "onboard-intake": 0,
    "capture-linked": 0,
    "live-listing": 0,
    stalled: 0,
  };
  for (const row of rows) {
    funnelCounts[row.attributionStage] += 1;
  }

  const sentOrBeyond = prospects.filter((prospect) => prospect.status !== "Draft").length;
  const replied = rows.filter((row) =>
    ["replied", "onboard-intake", "capture-linked", "live-listing"].includes(row.attributionStage),
  ).length;
  const onboarded = funnelCounts["onboard-intake"] + funnelCounts["capture-linked"] + funnelCounts["live-listing"];
  const live = funnelCounts["live-listing"];

  const conversionRates = {
    replyRate: sentOrBeyond > 0 ? Math.round((replied / sentOrBeyond) * 100) : 0,
    onboardRate: replied > 0 ? Math.round((onboarded / replied) * 100) : 0,
    liveRate: onboarded > 0 ? Math.round((live / onboarded) * 100) : 0,
  };

  const platformBreakdown = (["Instagram", "TikTok", "Pinterest"] as const).map((platform) => {
    const platformRows = rows.filter((row) => row.platform === platform);
    return {
      platform,
      prospects: platformRows.length,
      replied: platformRows.filter((row) =>
        ["replied", "onboard-intake", "capture-linked", "live-listing"].includes(row.attributionStage),
      ).length,
      live: platformRows.filter((row) => row.attributionStage === "live-listing").length,
      projectedPayout: platformRows.reduce((sum, row) => sum + row.projectedMonthlyPayout, 0),
    };
  });

  const attributedPayoutLive = rows
    .filter((row) => row.attributionStage === "live-listing")
    .reduce((sum, row) => sum + row.projectedMonthlyPayout, 0);
  const attributedPayoutPipeline = rows
    .filter((row) => row.attributionStage !== "outreach" && row.attributionStage !== "stalled")
    .reduce((sum, row) => sum + row.projectedMonthlyPayout, 0);

  const summaryLabel =
    live > 0
      ? `${live} live from outreach • $${attributedPayoutLive.toLocaleString()}/mo attributed • ${conversionRates.replyRate}% reply rate`
      : `${onboarded} in onboarding pipeline • $${attributedPayoutPipeline.toLocaleString()}/mo projected • ${conversionRates.replyRate}% reply rate`;

  return {
    generatedAt: now,
    rows,
    funnelCounts,
    conversionRates,
    platformBreakdown,
    attributedPayoutLive,
    attributedPayoutPipeline,
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
