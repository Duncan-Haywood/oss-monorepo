import { buildAdCatalogSyncHealth } from "./ad-catalog";
import { buildCheckoutFunnelMetrics } from "./checkout";
import { catalogArtworks, type CatalogArtwork } from "./marketplace";
import { calculateReplyToListingCompression } from "./outreach";
import { calculateMarketLaunchScore } from "./partners";

export type LaunchGateStatus = "ready" | "watch" | "blocked";

export type LaunchGate = {
  id: string;
  label: string;
  score: number;
  status: LaunchGateStatus;
  summary: string;
  blockers: string[];
};

export type MarketLaunchCommandCenter = {
  generatedAt: string;
  overallLaunchScore: number;
  overallStatus: LaunchGateStatus;
  readyToScaleAds: boolean;
  readyToOnboardArtists: boolean;
  readyToAcceptPayments: boolean;
  gates: LaunchGate[];
  topBlockers: string[];
  supplyCompressionScore: number;
  demandSyncScore: number;
  checkoutReadiness: number;
};

function statusFromScore(score: number): LaunchGateStatus {
  if (score >= 75) return "ready";
  if (score >= 50) return "watch";
  return "blocked";
}

export function buildMarketLaunchCommandCenter(
  artworks: CatalogArtwork[] = catalogArtworks,
  env: Record<string, string | undefined> = {},
  now?: string,
): MarketLaunchCommandCenter {
  const marketLaunch = calculateMarketLaunchScore(artworks);
  const checkoutFunnel = buildCheckoutFunnelMetrics(artworks, undefined, env);
  const supplyVelocity = calculateReplyToListingCompression({ now });
  const adSync = buildAdCatalogSyncHealth({ artworks });

  const supplyScore = Math.round(
    (marketLaunch.supplyScore * 0.4 + supplyVelocity.compressionScore * 0.6),
  );
  const supplyBlockers = [
    supplyVelocity.behindCount > 0
      ? `${supplyVelocity.behindCount} artists behind 7-day reply→live target`
      : "",
    marketLaunch.liveListings < 5 ? "Need 5+ live listings for supply credibility" : "",
  ].filter(Boolean);

  const demandScore = Math.round((adSync.overallScore * 0.6 + marketLaunch.demandScore * 0.4));
  const demandBlockers = adSync.recommendedActions.slice(0, 3);

  const paymentsScore = checkoutFunnel.overallReadiness;
  const paymentsBlockers = checkoutFunnel.stages.flatMap((stage) => stage.blockers).slice(0, 3);

  const opsScore = Math.round(
    (marketLaunch.opsScore * 0.5 + marketLaunch.fulfillmentScore * 0.5),
  );
  const opsBlockers =
    marketLaunch.opsScore < 70
      ? ["Release/consent gates blocking catalog expansion"]
      : marketLaunch.fulfillmentScore < 70
        ? ["Fulfillment partner credentials incomplete"]
        : [];

  const gates: LaunchGate[] = [
    {
      id: "supply",
      label: "Supply — artist onboarding",
      score: supplyScore,
      status: statusFromScore(supplyScore),
      summary: `${supplyVelocity.liveCount} live · ${supplyVelocity.inPipelineCount} in pipeline · compression ${supplyVelocity.compressionScore}/100`,
      blockers: supplyBlockers,
    },
    {
      id: "demand",
      label: "Demand — ad catalog sync",
      score: demandScore,
      status: statusFromScore(demandScore),
      summary: `${adSync.eligibleFeedRows} feed rows · ${adSync.checks.filter((c) => c.status === "healthy").length}/${adSync.checks.length} checks healthy`,
      blockers: demandBlockers,
    },
    {
      id: "payments",
      label: "Payments — buyer checkout",
      score: paymentsScore,
      status: statusFromScore(paymentsScore),
      summary: `Checkout readiness ${paymentsScore}% · ${checkoutFunnel.stages.filter((s) => s.status === "healthy").length}/5 stages ready`,
      blockers: paymentsBlockers,
    },
    {
      id: "ops",
      label: "Ops — fulfillment & legal",
      score: opsScore,
      status: statusFromScore(opsScore),
      summary: `Market launch ${marketLaunch.overall}/100 · fulfillment ${marketLaunch.fulfillmentScore}/100`,
      blockers: opsBlockers,
    },
  ];

  const topBlockers = Array.from(
    new Set(gates.flatMap((gate) => gate.blockers).filter(Boolean)),
  ).slice(0, 5);

  const overallLaunchScore = Math.round(
    gates.reduce((sum, gate) => sum + gate.score, 0) / gates.length,
  );

  const supplyGate = gates.find((gate) => gate.id === "supply");
  const demandGate = gates.find((gate) => gate.id === "demand");
  const paymentsGate = gates.find((gate) => gate.id === "payments");

  return {
    generatedAt: now ?? new Date().toISOString(),
    overallLaunchScore,
    overallStatus: statusFromScore(overallLaunchScore),
    readyToScaleAds: demandGate?.status === "ready" && paymentsGate?.status !== "blocked",
    readyToOnboardArtists: supplyGate?.status !== "blocked",
    readyToAcceptPayments: paymentsGate?.status === "ready",
    gates,
    topBlockers,
    supplyCompressionScore: supplyVelocity.compressionScore,
    demandSyncScore: adSync.overallScore,
    checkoutReadiness: paymentsScore,
  };
}
