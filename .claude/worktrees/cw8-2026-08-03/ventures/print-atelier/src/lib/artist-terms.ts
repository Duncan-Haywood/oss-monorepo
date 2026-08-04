import type { ArtistOnboardingConsent } from "./artist-onboarding";

export type ArtistObjectionTemplate = {
  id: string;
  category: string;
  artistObjection: string;
  legalClause: string;
  responseCopy: string;
  channelCopySnippet: string;
  suggestedAction: string;
  title?: string;
  quickReplySnippet?: string;
};

export type ArtistLicensingObjectionTemplate = ArtistObjectionTemplate;

export const artistObjectionTemplates: ArtistObjectionTemplate[] = [
  {
    id: "copyright-retention",
    category: "Copyright & Ownership",
    artistObjection: "Do I keep the copyright of my art?",
    legalClause: "Clause 1.1 — Artist Copyright Retention",
    responseCopy:
      "Yes, 100%. You retain full, exclusive copyright ownership of all your original artwork. Print Atelier only receives a non-exclusive license to print and package orders placed by customers.",
    channelCopySnippet: "100% copyright retention guaranteed under Clause 1.1",
    suggestedAction: "Provide standard copyright guarantee document to artist",
  },
  {
    id: "non-exclusive-pod",
    category: "Licensing & Exclusivity",
    artistObjection: "Can I still sell prints on my Etsy shop or website?",
    legalClause: "Clause 2.3 — Non-Exclusive POD Fulfillment License",
    responseCopy:
      "Absolutely. Our agreement is strictly non-exclusive. You can continue selling prints on Etsy, Shopify, galleries, or anywhere else with zero restrictions.",
    channelCopySnippet: "Non-exclusive license — sell anywhere else without restrictions",
    suggestedAction: "Confirm non-exclusive terms in outreach reply",
  },
  {
    id: "payout-vs-royalty-benchmark",
    category: "Payouts & Economics",
    artistObjection: "Why is 30% net profit better than Society6 10% royalty?",
    legalClause: "Clause 4.2 — Transparent 30% Net Profit Calculation",
    responseCopy:
      "Society6 pays ~10% of retail ($8 on an $80 print). Print Atelier pays 30% of net profit after direct print cost ($24+ on an $80 print), tripling your earnings per sale.",
    channelCopySnippet: "30% net profit split delivers 3x earnings vs traditional flat royalties",
    suggestedAction: "Send payout comparison breakdown calculator",
  },
  {
    id: "ai-room-scene-rights",
    category: "Marketing & AI Staging",
    artistObjection: "How do you render AI room mockups for ads?",
    legalClause: "Clause 5.1 — AI Room Preview & Marketing Staging License",
    responseCopy:
      "We generate realistic architectural room scenes placing your print on interior walls to boost buyer conversion. Your artwork is never used to train generative AI replacement models.",
    channelCopySnippet: "AI room mockups increase buyer conversion without AI model training",
    suggestedAction: "Share proof-mockup kit examples with target artist",
  },
  {
    id: "cancel-remove-anytime",
    category: "Termination & Rights Removal",
    artistObjection: "Can I delete my listings and cancel anytime?",
    legalClause: "Clause 7.4 — 14-Day Notice Listing Termination Rights",
    responseCopy:
      "Yes. You can unpublish listings or terminate your agreement with 14 days notice. Unfulfilled pending orders will complete and pay out, after which all print production stops immediately.",
    channelCopySnippet: "Cancel anytime with 14-day notice — full control over your listings",
    suggestedAction: "Confirm painless opt-out and listing removal rights",
  },
];

export function getArtistObjectionTemplates(): ArtistObjectionTemplate[] {
  return artistObjectionTemplates;
}

export function findObjectionTemplateByQuery(query: string): ArtistObjectionTemplate {
  const q = query.toLowerCase();
  if (q.includes("payout") || q.includes("society6") || q.includes("royalty") || q.includes("30%")) {
    return artistObjectionTemplates.find((t) => t.id === "payout-vs-royalty-benchmark")!;
  }
  if (q.includes("copyright") || q.includes("ownership")) {
    return artistObjectionTemplates.find((t) => t.id === "copyright-retention")!;
  }
  if (q.includes("etsy") || q.includes("sell") || q.includes("exclusive")) {
    return artistObjectionTemplates.find((t) => t.id === "non-exclusive-pod")!;
  }
  if (q.includes("ai") || q.includes("room") || q.includes("mockup")) {
    return artistObjectionTemplates.find((t) => t.id === "ai-room-scene-rights")!;
  }
  if (q.includes("cancel") || q.includes("delete") || q.includes("anytime")) {
    return artistObjectionTemplates.find((t) => t.id === "cancel-remove-anytime")!;
  }
  return artistObjectionTemplates[0]!;
}

export type ChannelTermsPreview = {
  channel: "storefront" | "outreach" | "paid-ads" | "ai-room-scenes";
  title: string;
  shortNotice: string;
  fullTermsSnippet: string;
  requiredConsentGate: "pod_fulfillment" | "outreach_consent" | "paid_ads" | "ai_room_preview";
};

const channelTermsPreviews: Record<string, ChannelTermsPreview> = {
  storefront: {
    channel: "storefront",
    title: "Storefront Artist Terms",
    shortNotice: "Artists retain copyright and receive 30% net profit payouts.",
    fullTermsSnippet:
      "Print Atelier fulfills physical orders under a non-exclusive license and pays 30% of net profit after POD fulfillment cost.",
    requiredConsentGate: "pod_fulfillment",
  },
  outreach: {
    channel: "outreach",
    title: "Artist Outreach Terms Preview",
    shortNotice: "Non-exclusive POD fulfillment with transparent 30% net profit math.",
    fullTermsSnippet:
      "Our agreement is completely non-exclusive. You retain full copyright and can cancel anytime with notice.",
    requiredConsentGate: "outreach_consent",
  },
  "paid-ads": {
    channel: "paid-ads",
    title: "Paid Ads Legal Preview",
    shortNotice: "Promotional ad placement with explicit artist attribution.",
    fullTermsSnippet:
      "Artwork featured in Meta/Pinterest/Google ad campaigns receives explicit credit and handle attribution.",
    requiredConsentGate: "paid_ads",
  },
  "ai-room-scenes": {
    channel: "ai-room-scenes",
    title: "AI Room Scenes License Preview",
    shortNotice: "Realistic architectural room preview staging to boost buyer conversion.",
    fullTermsSnippet:
      "AI room mockups place your artwork in living room, bedroom, and office scenes without training generative models.",
    requiredConsentGate: "ai_room_preview",
  },
};

export function getChannelTermsPreview(channel: string): ChannelTermsPreview {
  return channelTermsPreviews[channel] ?? channelTermsPreviews["storefront"]!;
}

export function getAllChannelTermsPreviews(): ChannelTermsPreview[] {
  return Object.values(channelTermsPreviews);
}

export type DetailedArtistTermsExplainer = {
  version: string;
  summaryLabel: string;
  copyrightRetention: {
    title: string;
    keyPoints: string[];
  };
  podLicense: {
    title: string;
    fulfillmentPartners: string[];
    scope: string;
  };
  payoutMathAndAcknowledgement: {
    title: string;
    examplePayout: {
      retailPrice: number;
      fulfillmentCost: number;
      merchantFee: number;
      netProfit: number;
      artistPayout: number;
    };
  };
};

export function buildArtistTermsExplainer(options: { retailPrice?: number } = {}): DetailedArtistTermsExplainer {
  const retailPrice = options.retailPrice ?? 120;
  const fulfillmentCost = 28;
  const merchantFee = Math.round(retailPrice * 0.03 * 100) / 100;
  const netProfit = Math.max(0, retailPrice - fulfillmentCost - merchantFee);
  const artistPayout = Math.round(netProfit * 0.3 * 100) / 100;

  return {
    version: "2026.1-artist-first",
    summaryLabel: "100% Copyright Retention & 30% Net Profit Payout",
    copyrightRetention: {
      title: "Copyright & Ownership Retention",
      keyPoints: [
        "100% copyright ownership retained by artist",
        "Original high-resolution master assets protected in encrypted storage",
        "No reselling or sublicensing to third-party stock databases",
      ],
    },
    podLicense: {
      title: "Non-Exclusive POD Fulfillment",
      fulfillmentPartners: ["Printful Inc.", "Gelato POD Network"],
      scope: "Non-exclusive print-on-demand fulfillment for customer orders",
    },
    payoutMathAndAcknowledgement: {
      title: "30% Net Profit Payout Math",
      examplePayout: {
        retailPrice,
        fulfillmentCost,
        merchantFee,
        netProfit,
        artistPayout,
      },
    },
  };
}

export type ArtistTermSection = {
  id: keyof ArtistOnboardingConsent;
  title: string;
  shortSummary: string;
  fullLegalText: string;
  artistProtectionHighlights: string[];
};

export type ArtistTermsExplainer = {
  version: string;
  lastUpdated: string;
  headlinePromise: string;
  netProfitSplitPercent: number;
  sections: ArtistTermSection[];
};

export type ConsentComplianceResult = {
  compliant: boolean;
  missingConsents: Array<keyof ArtistOnboardingConsent>;
  summaryText: string;
  auditBadge: "FULL_CONSENT" | "PARTIAL_CONSENT" | "NON_COMPLIANT";
};

export function getArtistTermsExplainer(): ArtistTermsExplainer {
  return {
    version: "2026.1-artist-first",
    lastUpdated: "2026-07-29",
    headlinePromise:
      "Artists retain 100% copyright ownership and receive 30% net profit payouts after print-on-demand cost.",
    netProfitSplitPercent: 30,
    sections: [
      {
        id: "podLicense",
        title: "Print-on-Demand (POD) Non-Exclusive License",
        shortSummary:
          "Grants non-exclusive, revocable right to fulfill physical print orders on your behalf via production partners (Printful/Gelato).",
        fullLegalText:
          "The Artist grants Print Atelier a non-exclusive, non-transferable, revocable license to reproduce, print, package, and ship physical reproductions of submitted high-resolution artwork solely to fulfill customer purchases made through authorized storefronts. The Artist retains full ownership of original copyright.",
        artistProtectionHighlights: [
          "Non-exclusive license: you can sell anywhere else",
          "Revocable at any time with 14-day notice",
          "Strictly limited to fulfillment of completed paid orders",
        ],
      },
      {
        id: "adRights",
        title: "Marketing & Paid Ad Rights",
        shortSummary:
          "Allows promotional inclusion in paid visual campaigns (Meta/Pinterest/Google) with explicit attribution to your artist profile.",
        fullLegalText:
          "The Artist grants Print Atelier permission to feature digital previews and room mockups of submitted artwork in digital advertising and promotional channels. All ad placements must display or credit the Artist's name or handle. No secondary licensing or sublicensing to third-party ad networks is permitted.",
        artistProtectionHighlights: [
          "Always attributed with your name or handle",
          "No third-party reselling or stock image catalog inclusion",
          "Opt-out option available per artwork catalog listing",
        ],
      },
      {
        id: "aiRoomScenes",
        title: "AI-Generated Room Scene Rendering Rights",
        shortSummary:
          "Authorizes AI pipeline to generate realistic in-room staging mockups (living room, bedroom, office) to increase buyer conversion.",
        fullLegalText:
          "The Artist authorizes Print Atelier's visual pipeline to render digital room mockups placing the artwork into architectural environments for preview purposes. Generated room mockups are used exclusively to market and sell physical prints of the Artist's work.",
        artistProtectionHighlights: [
          "Enhances conversion by showing artwork in realistic rooms",
          "Artwork is never used to train generative AI replacement models",
          "High-res source files remain stored securely in encrypted vaults",
        ],
      },
      {
        id: "payoutAcknowledgement",
        title: "Transparent 30% Net Profit Payout Math",
        shortSummary:
          "Acknowledges payout formula: (Retail Price - Direct POD Fulfillment Cost - Payment Gateway Fee) * 30%. Paid via Stripe Connect.",
        fullLegalText:
          "Payouts are calculated transparently per fulfilled order. Net profit equals gross sales revenue minus actual third-party print/shipping costs and merchant processing fees. The Artist receives 30% of this net profit, disbursed monthly via Stripe Connect.",
        artistProtectionHighlights: [
          "Guaranteed 30% split of real net profit",
          "Automated monthly Stripe Connect disbursements",
          "Complete ledger transparency visible in your Artist Portal dashboard",
        ],
      },
    ],
  };
}

export function generateArtistConsentSummary(consent: ArtistOnboardingConsent): string {
  const count = [
    consent.podLicense,
    consent.adRights,
    consent.aiRoomScenes,
    consent.payoutAcknowledgement,
  ].filter(Boolean).length;

  if (count === 4) {
    return "All 4 consent terms accepted — listing ready for market release & POD fulfillment.";
  }
  return `Accepted ${count} of 4 terms. Required items remaining before release.`;
}

export function validateArtistTermsCompliance(
  consent: ArtistOnboardingConsent,
): ConsentComplianceResult {
  const missingConsents: Array<keyof ArtistOnboardingConsent> = [];

  if (!consent.podLicense) missingConsents.push("podLicense");
  if (!consent.adRights) missingConsents.push("adRights");
  if (!consent.aiRoomScenes) missingConsents.push("aiRoomScenes");
  if (!consent.payoutAcknowledgement) missingConsents.push("payoutAcknowledgement");

  const compliant = missingConsents.length === 0;
  let auditBadge: ConsentComplianceResult["auditBadge"] = "FULL_CONSENT";

  if (!compliant) {
    auditBadge = missingConsents.length === 4 ? "NON_COMPLIANT" : "PARTIAL_CONSENT";
  }

  return {
    compliant,
    missingConsents,
    summaryText: generateArtistConsentSummary(consent),
    auditBadge,
  };
}
