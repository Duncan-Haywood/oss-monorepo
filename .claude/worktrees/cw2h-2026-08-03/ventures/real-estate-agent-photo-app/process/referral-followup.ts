/**
 * referral-followup.ts — the ready-to-send message for a few days *after*
 * a concierge delivery, once the agent has actually used the photos.
 *
 * Same class of silent gap booking-link.ts, payment-collection.ts, and
 * delivery-message.ts each found and fixed, one step further down the
 * funnel: this repo had a message for getting booked, a way to pay, and a
 * handoff message for the delivery moment — but nothing for the moment
 * that actually grows the business. STRATEGY.md's own numbers say the
 * target agent has 4-12 listings/month and mid-market agents talk to each
 * other; the cheapest, most credible growth channel available to a
 * concierge MVP with zero ad spend is turning a single $19 delivery into
 * a repeat booking and a referral, not just a one-off transaction.
 */

import type { LeadStage } from "./leads-log";

export type ReferralFollowUpInput = {
  listingAddress: string;
  /** Agent's first name, if known — omit for a generic greeting. */
  recipientName?: string;
};

/**
 * Zero-spend incentive: a discount off a *future* delivery, not a cash
 * payout. Costs nothing until a referral actually books and pays (and
 * even then it's foregone revenue on a sale that wouldn't have existed
 * otherwise), so it doesn't violate the "no spend of real money" guardrail
 * the way a cash referral bonus would.
 */
export const REFERRAL_INCENTIVE = {
  referrerReward: "$10 off their next $19 listing (so $9) once the referred agent's first listing is paid",
  refereeReward: "$5 off their first listing ($14 instead of $19)",
  summary:
    "Both sides get a discount off a future paid delivery, not a cash payout — no new spend, only foregone margin on revenue that wouldn't exist without the referral.",
};

/**
 * Sent a few days after delivery — long enough for the agent to have
 * actually put the photos on the MLS/Zillow and seen some response
 * (showings, inquiries), which makes the testimonial ask concrete instead
 * of generic, and makes the referral ask land on a real result instead of
 * a cold pitch. Manual send only, same as every other template in this
 * repo — no automated/scheduled/bulk sending.
 */
export function followUpMessageText(input: ReferralFollowUpInput): string {
  const greeting = input.recipientName ? `Hi ${input.recipientName} —` : "Hi —";
  return (
    `${greeting} checking in on the ${input.listingAddress} photos — how's the listing looking on Zillow/MLS, ` +
    `and has the showing traffic picked up any since the new photos went up? ` +
    `If it's working, two quick asks: (1) mind if I use a line from you as a quote when I reach out to other agents? ` +
    `(2) know anyone else listing soon who'd want the same $19 guided shoot? ${REFERRAL_INCENTIVE.summary} ` +
    `As a thank you: ${REFERRAL_INCENTIVE.referrerReward}. Either way, thanks again for being the first to try it.`
  );
}

/** A short, reusable prompt for turning a reply into an actual usable quote — not every "sounds good!" reply is one. */
export const TESTIMONIAL_PROMPT =
  "Ask for one specific, attributable sentence (what changed, e.g. 'went from empty showings to 6 in the first weekend') rather than generic praise — a vague 'great service!' isn't usable in outreach copy the way a concrete before/after is.";

/**
 * leads-log.ts stages this naturally follows once a real referral loop
 * exists — not added to LeadStage itself (that would force every existing
 * "paid" lead to retroactively decide whether it was followed up on,
 * which none have been yet); tracked here as guidance for when a human
 * logs a real referral-sourced lead: set the new lead's own entry with
 * notes mentioning which prior lead referred them, same free-text pattern
 * leads-log.ts already uses for other context.
 */
export const REFERRAL_SOURCED_NOTE_HINT: string =
  "When logging a referral-sourced lead in leads-log.ts, note the referring lead's id/contactLabel in this new lead's `notes` field, e.g. \"Referred by lead agent-jane-kw-001\".";

export const followUpTiming =
  "3-7 days after delivery, once the listing has had time to go live and get real showing traffic — sending it same-day as delivery makes both asks premature.";

/** Referenced only for context on when this fits in the funnel — not a new required stage. */
export const FOLLOWS_STAGE: LeadStage = "paid";
