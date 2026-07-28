import {
  ArtistPayoutComparisonInput,
  compareArtistPayoutModels,
  roundCurrency,
} from "@/lib/marketplace";

export type CompetitorId =
  | "society6"
  | "redbubble"
  | "saatchi"
  | "artfinder"
  | "print-atelier";

export type CompetitivePosition = "win" | "parity" | "lose";

export type CompetitorBattlecard = {
  id: CompetitorId;
  name: string;
  category: "POD marketplace" | "Curated gallery" | "Print Atelier";
  artistModel: string;
  artistPayoutPerOrder: number;
  monthlyArtistPayout: number;
  operatorBurden: "Low" | "Medium" | "High";
  weaknesses: string[];
  printAtelierEdge: string[];
  objectionHandlers: string[];
  position: CompetitivePosition;
  payoutDeltaVsPrintAtelier: number;
  sourceNote: string;
};

export type CompetitiveBattlecardDeck = {
  retailPrice: number;
  monthlyOrders: number;
  printAtelierPayoutPerOrder: number;
  bestPodLabel: string;
  podAdvantagePerOrder: number;
  overallPosition: CompetitivePosition;
  recommendation: string;
  cards: CompetitorBattlecard[];
};

const competitorProfiles: Record<
  Exclude<CompetitorId, "print-atelier">,
  Omit<CompetitorBattlecard, "artistPayoutPerOrder" | "monthlyArtistPayout" | "position" | "payoutDeltaVsPrintAtelier">
> = {
  society6: {
    id: "society6",
    name: "Society6",
    category: "POD marketplace",
    artistModel: "10% fixed wall-art royalty on retail price",
    operatorBurden: "Low",
    weaknesses: [
      "Fixed royalty ignores fulfillment and payment cost transparency",
      "Mass-market catalog dilutes artist story and discovery",
      "No phone-capture onboarding or AI room mockup pipeline",
    ],
    printAtelierEdge: [
      "30% of net profit with visible POD, payment, and AI cost breakdown",
      "AI capture + room mockups turn phone photos into sellable listings",
      "Outreach and ad tooling built for artist supply, not upload-and-wait",
    ],
    objectionHandlers: [
      "Society6 pays 10% of retail — we pay 30% of what remains after real costs, often higher per print at our price points.",
      "Artists keep copyright; we only license POD and marketing rights with explicit consent gates.",
    ],
    sourceNote: "Society6 March 2025 artist earnings update",
  },
  redbubble: {
    id: "redbubble",
    name: "Redbubble",
    category: "POD marketplace",
    artistModel: "Artist markup minus 20–50% account fee on excess margin",
    operatorBurden: "Low",
    weaknesses: [
      "Tiered account fees erode markup above 20%",
      "Race-to-bottom pricing on commodity designs",
      "No structured capture, proof, or consent workflow for paid ads",
    ],
    printAtelierEdge: [
      "Economics simulator shows payout vs Redbubble Standard and Premium before outreach",
      "Creative readiness gates block spend until proof and room mockups exist",
      "Artist-led referral kits turn supply into demand without extra headcount",
    ],
    objectionHandlers: [
      "Redbubble Standard keeps roughly 10% of retail on a 20% markup — compare your SKU in our payout trust lab.",
      "We do not charge escalating account fees; margin is shared on net profit after fulfillment.",
    ],
    sourceNote: "Redbubble tiered fee benchmark",
  },
  saatchi: {
    id: "saatchi",
    name: "Saatchi Art",
    category: "Curated gallery",
    artistModel: "60% of print profit after production; 40% commission on originals",
    operatorBurden: "High",
    weaknesses: [
      "Gallery curation gate slows supply scale",
      "Original-sale economics require artist fulfillment labor",
      "Less software automation for capture, SEO, and programmatic ads",
    ],
    printAtelierEdge: [
      "Software-first onboarding: capture → catalog → storefront without jury review",
      "Room-preview CAC lab ties visualization to paid channel budgets",
      "Dual-sided growth engine advances supply and demand in parallel",
    ],
    objectionHandlers: [
      "Saatchi print profit share can look higher nominally — we win on speed-to-listing and automated demand.",
      "Our moat is capture + catalog + ads software, not white-glove curation.",
    ],
    sourceNote: "Saatchi Art commission rate help center",
  },
  artfinder: {
    id: "artfinder",
    name: "Artfinder",
    category: "Curated gallery",
    artistModel: "55–60% of artwork retail after 40–45% marketplace commission",
    operatorBurden: "High",
    weaknesses: [
      "Commission on retail value, not transparent net-profit share",
      "Seller-managed fulfillment on originals increases ops burden",
      "Limited AI capture, mockup, and programmatic SEO tooling",
    ],
    printAtelierEdge: [
      "POD-first economics with Printful/Gelato partner readiness scoring",
      "Listing consent gate separates storefront, outreach, ads, and AI room rights",
      "Investor dashboard scores supply, demand, ops, and fulfillment in one view",
    ],
    objectionHandlers: [
      "Artfinder Core/Premium tiers take 40–45% — our 70% platform share is on net profit after known costs.",
      "We optimize for print volume and repeat buyers, not one-off original sales labor.",
    ],
    sourceNote: "Artfinder seller support payout FAQ",
  },
};

function mapModelIdToCompetitorId(modelId: string): CompetitorId | null {
  if (modelId.startsWith("society6")) return "society6";
  if (modelId.startsWith("redbubble")) return "redbubble";
  if (modelId.startsWith("artfinder")) return "artfinder";
  return null;
}

function positionFromDelta(delta: number): CompetitivePosition {
  if (delta > 1) return "win";
  if (delta >= -1) return "parity";
  return "lose";
}

export function buildCompetitorBattlecards(
  input: ArtistPayoutComparisonInput,
): CompetitiveBattlecardDeck {
  const comparison = compareArtistPayoutModels(input);
  const printAtelierPayout = comparison.printAtelier.artistPayoutPerOrder;

  const podCards: CompetitorBattlecard[] = comparison.models
    .filter((model) => model.isPodAlternative)
    .map((model) => {
      const competitorId = mapModelIdToCompetitorId(model.id);
      const profile =
        competitorId === "society6" ? competitorProfiles.society6 : competitorProfiles.redbubble;
      const delta = roundCurrency(printAtelierPayout - model.artistPayoutPerOrder);

      return {
        ...profile,
        id: competitorId === "society6" ? "society6" : "redbubble",
        name: model.label,
        artistModel: model.basis,
        artistPayoutPerOrder: model.artistPayoutPerOrder,
        monthlyArtistPayout: model.monthlyArtistPayout,
        payoutDeltaVsPrintAtelier: delta,
        position: positionFromDelta(delta),
        sourceNote: model.sourceNote,
      };
    });

  const galleryCards: CompetitorBattlecard[] = comparison.models
    .filter((model) => !model.isPodAlternative && model.id !== "print-atelier")
    .map((model) => {
      const profile =
        model.id === "artfinder-original"
          ? competitorProfiles.artfinder
          : competitorProfiles.saatchi;
      const delta = roundCurrency(printAtelierPayout - model.artistPayoutPerOrder);

      return {
        ...profile,
        name: model.label.includes("Artfinder") ? "Artfinder" : "Saatchi Art",
        artistModel: model.basis,
        artistPayoutPerOrder: model.artistPayoutPerOrder,
        monthlyArtistPayout: model.monthlyArtistPayout,
        operatorBurden: model.operatorBurden,
        payoutDeltaVsPrintAtelier: delta,
        position: positionFromDelta(delta),
        sourceNote: model.sourceNote,
      };
    });

  const printAtelierCard: CompetitorBattlecard = {
    id: "print-atelier",
    name: "Print Atelier",
    category: "Print Atelier",
    artistModel: comparison.printAtelier.basis,
    artistPayoutPerOrder: printAtelierPayout,
    monthlyArtistPayout: comparison.printAtelier.monthlyArtistPayout,
    operatorBurden: "Low",
    weaknesses: ["Requires proof approval and consent before paid scale"],
    printAtelierEdge: [
      "Only marketplace with capture → catalog → ads in one software stack",
      "Payout promise guarded by exception queue and release workflow",
      "Market launch score ties supply, demand, ops, and fulfillment",
    ],
    objectionHandlers: [
      "Lead with transparent per-print economics, not headline royalty percentages.",
      "Show room mockups and payout proof before asking artists to trust the 30% promise.",
    ],
    position: "win",
    payoutDeltaVsPrintAtelier: 0,
    sourceNote: comparison.printAtelier.sourceNote,
  };

  const overallPosition: CompetitivePosition =
    comparison.podAdvantagePerOrder > 1
      ? "win"
      : comparison.podAdvantagePerOrder >= 0
        ? "parity"
        : "lose";

  return {
    retailPrice: input.retailPrice,
    monthlyOrders: input.monthlyOrders,
    printAtelierPayoutPerOrder: printAtelierPayout,
    bestPodLabel: comparison.bestPodAlternative?.label ?? "best POD benchmark",
    podAdvantagePerOrder: comparison.podAdvantagePerOrder,
    overallPosition,
    recommendation: comparison.recommendation,
    cards: [printAtelierCard, ...podCards, ...galleryCards],
  };
}

export type BattlecardReplyIntent = "payout" | "rights" | "proof" | "general";

export function buildBattlecardReplySnippet(
  intent: BattlecardReplyIntent,
  input: ArtistPayoutComparisonInput = { retailPrice: 85, fulfillmentCost: 28, monthlyOrders: 25 },
): string {
  const deck = buildCompetitorBattlecards(input);
  const society6 = deck.cards.find((card) => card.id === "society6");
  const redbubble = deck.cards.find((card) => card.id === "redbubble");
  const payoutLine = `At $${input.retailPrice}/print you earn $${deck.printAtelierPayoutPerOrder.toFixed(2)} — ${deck.podAdvantagePerOrder >= 0 ? `${deck.podAdvantagePerOrder.toFixed(2)} more than` : "compare carefully to"} ${deck.bestPodLabel}.`;

  if (intent === "payout") {
    return society6?.objectionHandlers[0] ?? payoutLine;
  }
  if (intent === "rights") {
    return society6?.objectionHandlers[1] ?? "You keep copyright; we only license POD and marketing rights with explicit consent gates.";
  }
  if (intent === "proof") {
    return redbubble?.objectionHandlers[0] ?? deck.recommendation;
  }
  return `${payoutLine} ${deck.recommendation}`;
}
