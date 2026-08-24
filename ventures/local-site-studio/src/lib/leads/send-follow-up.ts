import { recordLeadOutreach } from "@/lib/db";
import { OUTREACH_CADENCE_CONVEX_PRIMARY } from "@/lib/leads/outreach-persist";
import { nextFollowUpStep } from "@/lib/email/outreach-followups";
import { sendOutreachFollowUp2, sendOutreachFollowUp3 } from "@/lib/email/resend";
import { ConvexPrimaryWriteError } from "@/lib/payments/convex-primary";
import type { Lead } from "@/lib/leads/types";

export type SendOutreachFollowUpResult =
  | { success: true; outreachStep: 2 | 3; mock: boolean }
  | { success: false; error: string; outreachStep?: 2 | 3 };

/**
 * Shared send-and-mark body behind BOTH triggers for the cold-outreach
 * Email 2/3 follow-up cadence: the operator's manual "Send Email 2/3"
 * dashboard button (sendFollowUpAction, src/app/dashboard/leads/actions.ts)
 * and the automated daily GET /api/cron/outreach-followups
 * (src/app/api/cron/outreach-followups/route.ts). Extracted so the two
 * callers can never diverge on the mark-then-send race guard — see
 * outreach-followup-cron-automation in BUSINESS_DECISIONS.
 *
 * Callers own auth/rate-limiting/lead lookup and the stage/step
 * pre-checks (paid/live/closed, sequence-complete) before calling this —
 * this function re-derives `next` from the lead's own outreachStep itself
 * (via nextFollowUpStep) rather than trusting a caller-supplied step, so a
 * stale caller-side read can never send the wrong email number.
 */
export async function sendOutreachFollowUpEmail(lead: Lead): Promise<SendOutreachFollowUpResult> {
  if (!lead.email) {
    return { success: false, error: "Lead has no email address" };
  }

  const next = nextFollowUpStep(lead.outreachStep);
  if (!next) {
    const step = lead.outreachStep ?? 0;
    return {
      success: false,
      error:
        step >= 3
          ? "Outreach sequence already complete (Email 3 sent)"
          : "Send Email 1 first by setting stage to Outreach Sent",
    };
  }

  // Durably mark the follow-up step sent BEFORE calling Resend
  // (persist-then-notify) so a Convex mutation failure never lets a real
  // send land unrecorded and risk a duplicate on another instance.
  let recorded: boolean;
  try {
    recorded = await recordLeadOutreach(lead.slug, next, undefined, OUTREACH_CADENCE_CONVEX_PRIMARY);
  } catch (error) {
    if (error instanceof ConvexPrimaryWriteError) {
      return {
        success: false,
        error: "Could not record the outreach mark in the shared store — follow-up was not sent. Retry in a moment.",
      };
    }
    throw error;
  }

  if (!recorded) {
    // recordLeadOutreach re-checks the paid/live/closed gate and the
    // outreach-step value atomically at write time and skips the patch (and
    // this call skips the Resend send) when a concurrent Stripe checkout or
    // stage change already moved this lead to paid/live/closed, OR when this
    // exact step was already recorded by a concurrent call — either way the
    // follow-up was not sent here.
    return {
      success: false,
      error:
        "Lead was paid, went live, or was closed after this page loaded — or this follow-up step was already sent by another request. Refresh and check its status; the follow-up was not sent",
    };
  }

  const sent =
    next === 2
      ? await sendOutreachFollowUp2(lead.email, lead.businessName, lead.slug)
      : await sendOutreachFollowUp3(lead.email, lead.businessName, lead.slug);

  if (!sent.success) {
    return {
      success: false,
      error:
        "reason" in sent && sent.reason === "suppressed"
          ? "Email is on the suppression list"
          : "error" in sent && typeof sent.error === "string"
            ? sent.error
            : "Failed to send follow-up email",
      outreachStep: next,
    };
  }

  return { success: true, outreachStep: next, mock: "mock" in sent ? Boolean(sent.mock) : false };
}
