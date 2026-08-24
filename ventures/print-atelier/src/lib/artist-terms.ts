/**
 * Plain-language explainer content for the rights and payout terms artists
 * accept as checkboxes on /artist-onboard (see CONSENT_LABELS in
 * ArtistOnboardingIntakeForm.tsx). This module is the single source of truth
 * for that copy so the onboarding checkboxes and the /artist-terms page
 * cannot drift out of sync with each other.
 */

export type ArtistTermsConsentKey = "podLicense" | "adRights" | "aiRoomScenes" | "payoutAcknowledgement";

export type ArtistTermsSection = {
  id: string;
  /** Matches a key in ArtistOnboardingIntakeForm's CONSENT_LABELS, or null for context-only sections. */
  consentKey: ArtistTermsConsentKey | null;
  title: string;
  summary: string;
  details: string[];
};

export const ARTIST_TERMS_SECTIONS: ArtistTermsSection[] = [
  {
    id: "copyright-retention",
    consentKey: null,
    title: "You keep your copyright",
    summary: "Print Atelier never takes ownership of your artwork. You remain the copyright holder for every piece you upload.",
    details: [
      "Uploading a piece does not transfer, assign, or license away your copyright.",
      "You can sell, license, or use the same artwork anywhere else at the same time.",
      "Removing a listing ends every right described on this page for that piece going forward — it does not undo fulfillment already completed on prior orders.",
    ],
  },
  {
    id: "pod-license",
    consentKey: "podLicense",
    title: "Print-on-demand fulfillment license",
    summary: "A limited, non-exclusive license letting Print Atelier's fulfillment partners print and ship physical copies when a buyer orders.",
    details: [
      "The license covers reproducing your uploaded image file only for the print sizes and products you list — nothing broader.",
      "Fulfillment is subcontracted to print-on-demand partners (Printful, Gelato); they receive the image file needed to produce and ship an order, not a separate license from you.",
      "The license is revocable: unlisting a piece stops new orders from being accepted for it.",
    ],
  },
  {
    id: "paid-ad-rights",
    consentKey: "adRights",
    title: "Paid advertising rights",
    summary: "Permission to use your artwork in paid ad creative on Meta, Google, and Pinterest to drive traffic to your listing.",
    details: [
      "Ads may show a crop, thumbnail, or in-context mockup of the artwork alongside your name and a link to the listing.",
      "This consent is separate from the POD license — you can allow fulfillment without allowing paid ads, or vice versa.",
      "You can ask for a piece to be pulled from active ad campaigns at any time; campaigns already delivered are not retroactively recalled.",
    ],
  },
  {
    id: "ai-room-scenes",
    consentKey: "aiRoomScenes",
    title: "AI room-scene mockups",
    summary: "AI-generated preview images that place your artwork digitally into a styled interior photo, shown to buyers considering a purchase.",
    details: [
      "The artwork image itself is not altered, redrawn, or used as training data — it is composited, unmodified, into a separately generated background scene.",
      "Room-scene previews are labeled as AI-generated wherever they appear to buyers.",
      "This consent covers marketing and product-preview use only, not any other AI application.",
    ],
  },
  {
    id: "payout-acknowledgement",
    consentKey: "payoutAcknowledgement",
    title: "Payout terms",
    summary: "You earn 30% of net profit per print sold — the retail price minus the print-on-demand fulfillment cost and payment processing fees.",
    details: [
      "Net profit is calculated per order after fulfillment cost and processing fees are subtracted from the retail price you and Print Atelier agreed on.",
      "Payouts are scheduled Net-15 through Stripe Connect once an order ships; see the Payouts tab in the artist portal for your running total.",
      "Print Atelier is currently a demo: payout figures shown in the artist portal are modeled from sample orders, not real settled transactions, until checkout goes live for real buyers.",
    ],
  },
];

export const ARTIST_TERMS_DISCLAIMER =
  "This page explains, in plain language, what each onboarding checkbox means. It is not the binding agreement and it is not legal advice — if anything here conflicts with the actual terms you accept at signup, those signed terms control. Print Atelier is currently a demo: no real payments, print orders, or artist payouts are live yet.";
