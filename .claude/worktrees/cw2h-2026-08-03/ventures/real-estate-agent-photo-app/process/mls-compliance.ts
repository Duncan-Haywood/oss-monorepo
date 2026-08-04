/**
 * mls-compliance.ts — answers STRATEGY.md's open "MLS compliance by board"
 * question with general, publicly documented MLS photo rules, and turns
 * them into concrete guardrails for the capture checklist, the enhancement
 * pipeline, and any future "Polish"/"Brand" work.
 *
 * This is desk research (public MLS-board blog posts, ARMLS/CRMLS/NAR
 * policy pages, and 2026 state disclosure-law coverage), not legal advice
 * and not board-specific verification — rules vary by MLS and change over
 * time. Treat this as a floor to build to, and re-verify against the
 * specific MLS board once a concierge shoot has a real listing/board
 * attached (see process/outreach-templates.ts's bookingIntakeFields,
 * which already captures "MLS/board (if known)" for this reason).
 */

export type ComplianceRule = {
  id: string;
  topic: string;
  rule: string;
  /** What this means for Listing Lens specifically, right now. */
  implication: string;
  sources: string[];
};

export const mlsComplianceRules: ComplianceRule[] = [
  {
    id: "no-branding-on-mls-photos",
    topic: "No agent/brokerage branding on MLS-submitted photos",
    rule:
      "Virtually all MLS boards prohibit contact info, agent/brokerage names, logos, watermarks, phone numbers, or URLs anywhere in an MLS-submitted photo or virtual tour. Violations are typically an automatic, no-notice fine to the broker ($500-$5,000 per violation range reported across boards).",
    implication:
      "The pipeline/ enhancement CLI must never burn in a watermark, logo, or contact info on delivery photos — it currently doesn't (enhance.ts only auto-orients, normalizes, sharpens, resizes, re-encodes). STRATEGY.md's step 5 'Brand' (agent headshot, logo, property microsite) must stay scoped to marketing collateral around the listing (a microsite, a flyer, social posts) and never touch the actual MLS-uploaded image files.",
    sources: [
      "https://armls.com/watermarks",
      "https://www.nar.realtor/about-nar/policies/mls-policy/use-of-photographs-in-a-multiple-listing-service",
    ],
  },
  {
    id: "virtual-staging-disclosure",
    topic: "Virtually staged / digitally altered photos need disclosure",
    rule:
      "As of 2026, a majority of states require disclosing digitally altered listing photos (added furniture, AI room redesigns, object/damage removal, sky replacement). Strict-disclosure states (e.g. California, effective Jan 1 2026 under AB 723; also New York, Texas) require a visible per-image label/watermark ('Virtually Staged') plus the original unaltered photo shown alongside it. Moderate-disclosure states require only a listing-remarks note, not a per-image label.",
    implication:
      "The current enhance.ts pipeline does NOT do virtual staging, sky replacement, or object removal, so no disclosure obligation applies to it today — this is exactly why decisions-log.ts scoped those to a future human/cloud 'Polish' step rather than the automated CLI. If/when that Polish step is built, it must (a) default to the strictest behavior — visible 'Virtually Staged' caption on the altered image and retain the original unaltered photo in the delivery — regardless of state, since Listing Lens can't verify the listing's state/board at pipeline-run time, and (b) never silently replace the original.",
    sources: [
      "https://www.roomstage.ai/mls-virtual-staging-rules",
      "https://armls.com/virtually-staged-photos",
      "https://support.mlslistings.com/s/article/AB723---Altered-Images-Overview",
    ],
  },
  {
    id: "photo-count-guidance",
    topic: "Photo count best practice",
    rule:
      "Most boards set only a low required minimum (e.g. CRMLS: 1 photo minimum), but engagement data favors far more: under ~9 photos measurably hurts engagement, and 22-27+ is the commonly cited best-performing range on major portals.",
    implication:
      "process/capture-checklist.ts's totalShotCount() now scales per bed/bath (typical-home default: 19 shots; a 5-bed/3-bath listing: 22; a 0-extra-bed/bath listing: 16) — already inside the promised 15-25 range and close to, though still shy of, the 22-27+ best-performing range this rule cites. Not a compliance problem (boards don't require more), but still a quality/competitiveness gap worth revisiting once real deliveries produce feedback on whether prospects want more shots per room for the same $19 flat price.",
    sources: ["https://brokerless.com/mls-photo-rules", "https://www.stellarmls.com/photorules"],
  },
];

export function ruleById(id: string): ComplianceRule | undefined {
  return mlsComplianceRules.find((r) => r.id === id);
}
