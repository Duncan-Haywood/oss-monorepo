"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireOperatorAuth } from "@/lib/auth/operator";
import {
  updateLeadStage,
  upsertLead,
  updateClientInquiryStatus,
  getClientInquiryById,
  recordClientInquiryReply,
  getLeadBySlug,
  getLeads,
  listOrders,
  recordLeadOutreach,
  listOpenCheckoutSessions,
  listUnrepliedInquiries,
  recordCheckoutRecoverySent,
  updateLeadNotes,
  updateLeadSnooze,
  applyColdLeadDisposition,
  upsertMarketingPack,
  listMarketingPacksForMonth,
  getMarketingPack,
  upsertCommerceCatalog,
  getCommerceCatalog,
  listCommerceCatalogs,
  getCommerceOrderByStripeSessionId,
  markCommerceOrderPaidOut,
  upsertClientVoicePack,
  getClientVoicePackByLeadSlug,
  listClientVoicePacks,
  listUnpaidCommerceOrders,
  listDeployHandoffs,
} from "@/lib/db";
import { CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY } from "@/lib/checkout/session-persist";
import { COMMERCE_PAID_OUT_CONVEX_PRIMARY } from "@/lib/commerce/paid-out-persist";
import { COMMERCE_CATALOG_CONVEX_PRIMARY } from "@/lib/commerce/catalog-persist";
import { INQUIRY_REPLY_CONVEX_PRIMARY } from "@/lib/inquiries/reply-persist";
import { COLD_DISPOSITION_CONVEX_PRIMARY } from "@/lib/leads/cold-disposition-persist";
import { LEAD_NOTES_CONVEX_PRIMARY } from "@/lib/leads/notes-persist";
import { LEAD_SNOOZE_CONVEX_PRIMARY } from "@/lib/leads/snooze-persist";
import { LEAD_STAGE_CONVEX_PRIMARY } from "@/lib/leads/stage-persist";
import { LEAD_UPSERT_CONVEX_PRIMARY } from "@/lib/leads/upsert-persist";
import { OUTREACH_CADENCE_CONVEX_PRIMARY } from "@/lib/leads/outreach-persist";
import { MARKETING_PACK_CONVEX_PRIMARY } from "@/lib/marketing/pack-persist";
import { CLIENT_VOICE_PACK_CONVEX_PRIMARY } from "@/lib/voice/pack-persist";
import { ConvexPrimaryWriteError } from "@/lib/payments/convex-primary";
import {
  existingLeadSlugConflictMessage,
  parseLeadsCsv,
  partitionLeadsByExistingSlugs,
} from "@/lib/leads/csv-import";
import type { Lead, LeadPipelineStage } from "@/lib/leads/types";
import { normalizeOperatorNotes } from "@/lib/leads/notes";
import { leadPreviewAbsoluteUrl } from "@/lib/leads/slug-path";
import {
  isSnoozePresetId,
  normalizeSnoozedUntil,
  snoozedUntilFromPreset,
  type SnoozePresetId,
} from "@/lib/leads/snooze";
import {
  isColdLeadDisposition,
  planColdLeadDisposition,
  type ColdLeadDisposition,
} from "@/lib/leads/cold-archive";
import {
  inquiryCanReceiveReply,
  normalizeInquiryReply,
} from "@/lib/inquiries/reply";
import {
  markHandoffLive,
  assignVercelProjectAndProvision,
  assignCustomDomainAndProvision,
} from "@/lib/deploy/handoff";
import type { ClientInquiryStatus } from "@/lib/inquiries/types";
import {
  sendOutreachEmail,
  sendOutreachFollowUp2,
  sendOutreachFollowUp3,
  sendCheckoutAbandonedRecovery,
  sendCommerceAbandonedRecovery,
  sendInquiryReply,
  sendOperatorDailyDigest,
  sendStarterUpsellEmail,
  sendMarketingPackToClientEmail,
  sendClientVoicePackToClientEmail,
} from "@/lib/email/resend";
import { nextFollowUpStep } from "@/lib/email/outreach-followups";
import { createBillingPortalForLead } from "@/lib/billing/create-portal-session";
import {
  resolveStripeRedirectAppUrl,
  resolveTrustedAppUrl,
} from "@/lib/security/app-url";
import {
  leadEligibleForStarterUpsell,
  resolveUpsellTargetTier,
} from "@/lib/billing/starter-upsell";
import { getBundle } from "@/lib/pricing/bundles";
import { buildDailyDigest, renderDailyDigestHtml } from "@/lib/digest/daily-digest";
import {
  bestMarketingOrderTier,
  getMarketingGenerator,
  leadEligibleForMarketingPack,
  leadEligibleForMarketingPackDelivery,
  marketingMonthKey,
  monthlyPackRequestForLead,
} from "@/lib/marketing";
import {
  archiveCommerceStripeProducts,
  leadEligibleForCommerceCatalog,
  listOrphanCommerceStripeProducts,
  normalizeCommerceItems,
  preserveCommerceStripeIds,
  syncCommerceCatalogToStripe,
} from "@/lib/commerce";
import Stripe from "stripe";
import {
  clientVoicePackRequestForLead,
  getClientVoiceGenerator,
  leadEligibleForClientVoicePack,
  leadEligibleForClientVoicePackDelivery,
} from "@/lib/voice";

export async function markHandoffLiveAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!slug) {
      return { success: false as const, error: "Slug is required" };
    }
    let handoff;
    try {
      handoff = await markHandoffLive(slug);
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not record Mark live in the shared store — handoff/lead stage may still show as pre-live elsewhere. Retry in a moment.",
        };
      }
      throw error;
    }
    if (!handoff) {
      return { success: false as const, error: "No deploy handoff found for this lead" };
    }
    revalidatePath("/dashboard/leads");
    revalidatePath(`/preview/${slug}`);
    return { success: true as const, handoff };
  } catch (error) {
    console.error("Error in markHandoffLiveAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function assignVercelProjectAction(slug: string, vercelProjectId: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!slug) {
      return { success: false as const, error: "Slug is required" };
    }
    const trimmed = vercelProjectId.trim();
    let handoff;
    try {
      handoff = await assignVercelProjectAndProvision(slug, trimmed || null);
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not save the Vercel project in the shared store — deploy may still route to the old project elsewhere. Retry in a moment.",
        };
      }
      throw error;
    }
    if (!handoff) {
      return { success: false as const, error: "No deploy handoff found for this lead" };
    }
    revalidatePath("/dashboard/leads");
    return { success: true as const, handoff };
  } catch (error) {
    console.error("Error in assignVercelProjectAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function assignCustomDomainAction(slug: string, customDomain: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!slug) {
      return { success: false as const, error: "Slug is required" };
    }
    const trimmed = customDomain.trim();
    let handoff;
    try {
      handoff = await assignCustomDomainAndProvision(slug, trimmed || null);
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not save the custom domain in the shared store — routing may still miss on other instances. Retry in a moment.",
        };
      }
      throw error;
    }
    if (!handoff) {
      return { success: false as const, error: "No deploy handoff found for this lead" };
    }
    revalidatePath("/dashboard/leads");
    return { success: true as const, handoff };
  } catch (error) {
    console.error("Error in assignCustomDomainAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function updateInquiryStatusAction(
  inquiryId: string,
  status: ClientInquiryStatus,
) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!inquiryId) {
      return { success: false as const, error: "Inquiry id is required" };
    }
    if (status !== "new" && status !== "read" && status !== "replied" && status !== "archived") {
      return { success: false as const, error: "Invalid status" };
    }
    let inquiry;
    try {
      inquiry = await updateClientInquiryStatus(
        inquiryId,
        status,
        INQUIRY_REPLY_CONVEX_PRIMARY,
      );
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not update inquiry status in the shared store — retry in a moment.",
        };
      }
      throw error;
    }
    if (!inquiry) {
      return { success: false as const, error: "Inquiry not found" };
    }
    revalidatePath("/dashboard/leads");
    return { success: true as const, inquiry };
  } catch (error) {
    console.error("Error in updateInquiryStatusAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Reply to a website contact-form inquiry from the dashboard (Resend + suppression).
 * Durably marks status=replied BEFORE sending (persist-then-notify) so a Convex
 * mutation failure never lets a real send land unrecorded while unreplied
 * metrics stay high on other instances.
 */
export async function replyToInquiryAction(inquiryId: string, replyBody: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!inquiryId) {
      return { success: false as const, error: "Inquiry id is required" };
    }

    const normalized = normalizeInquiryReply(replyBody);
    if (!normalized.ok) {
      return { success: false as const, error: normalized.error };
    }

    const inquiry = await getClientInquiryById(inquiryId);
    if (!inquiry) {
      return { success: false as const, error: "Inquiry not found" };
    }
    if (!inquiryCanReceiveReply(inquiry)) {
      return {
        success: false as const,
        error: inquiry.status === "archived"
          ? "Inquiry is archived — unarchive is not supported; leave a lead note instead"
          : "Inquiry has no email address to reply to",
      };
    }

    const to = inquiry.email?.trim();
    if (!to) {
      return { success: false as const, error: "Inquiry has no email address to reply to" };
    }

    // Durably mark replied BEFORE Resend (persist-then-notify) so a Convex
    // mutation failure never lets a real visitor reply land unrecorded —
    // see INQUIRY_REPLY_CONVEX_PRIMARY.
    let updated;
    try {
      updated = await recordClientInquiryReply(
        inquiryId,
        normalized.body,
        INQUIRY_REPLY_CONVEX_PRIMARY,
      );
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not record the reply in the shared store — email was not sent. Retry in a moment.",
        };
      }
      throw error;
    }
    if (!updated) {
      return { success: false as const, error: "Inquiry not found" };
    }

    const sent = await sendInquiryReply({
      to,
      businessName: inquiry.businessName,
      leadSlug: inquiry.leadSlug,
      replyBody: normalized.body,
      originalMessage: inquiry.message,
      inquirerName: inquiry.name,
    });

    if (!sent.success) {
      return {
        success: false as const,
        error:
          "reason" in sent && sent.reason === "suppressed"
            ? "Email is on the suppression list — inquiry is marked replied; leave a lead note if needed"
            : "error" in sent && typeof sent.error === "string"
              ? `${sent.error} — inquiry is marked replied; retry send or leave a lead note`
              : "Failed to send reply email — inquiry is marked replied; retry send or leave a lead note",
        inquiry: updated,
      };
    }

    revalidatePath("/dashboard/leads");
    return {
      success: true as const,
      inquiry: updated,
      mock: "mock" in sent ? Boolean(sent.mock) : false,
    };
  } catch (error) {
    console.error("Error in replyToInquiryAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function updateLeadStageAction(slug: string, stage: LeadPipelineStage) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }

    // Every sibling write action in this file (notes, snooze, cold
    // disposition, catalogs, marketing/voice packs, payouts) checks the
    // record exists before writing. This one didn't: the SQLite fallback's
    // `UPDATE leads SET status = ? WHERE slug = ?` matches zero rows and
    // never throws on an unknown slug, so a mistyped/stale slug silently
    // returned { success: true } with nothing actually written.
    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    try {
      await updateLeadStage(slug, stage, LEAD_STAGE_CONVEX_PRIMARY);
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not save the stage in the shared store — other instances may not see this move. Retry in a moment.",
        };
      }
      throw error;
    }

    // If stage is changed to outreach_sent, durably mark Email 1 sent BEFORE
    // sending (persist-then-notify) so a Convex mutation failure never lets a
    // real send land unrecorded — see OUTREACH_CADENCE_CONVEX_PRIMARY.
    if (stage === "outreach_sent") {
      if (lead.email) {
        try {
          await recordLeadOutreach(slug, 1, undefined, OUTREACH_CADENCE_CONVEX_PRIMARY);
        } catch (error) {
          if (error instanceof ConvexPrimaryWriteError) {
            return {
              success: false as const,
              error:
                "Stage saved, but could not record the outreach mark in the shared store — Email 1 was not sent. Retry in a moment.",
            };
          }
          throw error;
        }
        // sendOutreachEmail → sendEmail resolves { success: false } on
        // suppression/Resend failure (never throws). Surface that to the
        // operator — persist-then-notify keeps the mark; do not pretend Email 1 sent.
        const sent = await sendOutreachEmail(
          lead.email,
          lead.businessName,
          lead.slug,
        );
        if (!sent.success) {
          return {
            success: false as const,
            error:
              "reason" in sent && sent.reason === "suppressed"
                ? "Stage saved and marked Outreach Sent, but Email 1 was not delivered — email is on the suppression list"
                : "error" in sent && typeof sent.error === "string"
                  ? `Stage saved and marked Outreach Sent, but Email 1 failed to send — ${sent.error}`
                  : "Stage saved and marked Outreach Sent, but Email 1 failed to send — retry from the dashboard",
          };
        }
      }
    }

    revalidatePath("/dashboard/leads");
    revalidatePath(`/preview/${slug}`);
    return { success: true as const };
  } catch (error) {
    console.error("Error in updateLeadStageAction:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Save free-text operator notes on a lead (call outcomes, objections, next steps).
 * Empty/whitespace clears the notes field.
 */
export async function updateLeadNotesAction(slug: string, notes: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!slug) {
      return { success: false as const, error: "Slug is required" };
    }

    const normalized = normalizeOperatorNotes(notes);
    if (!normalized.ok) {
      return { success: false as const, error: normalized.error };
    }

    const existing = await getLeadBySlug(slug);
    if (!existing) {
      return { success: false as const, error: "Lead not found" };
    }

    try {
      await updateLeadNotes(slug, normalized.notes, LEAD_NOTES_CONVEX_PRIMARY);
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not save notes in the shared store — other instances may not see this update. Retry in a moment.",
        };
      }
      throw error;
    }
    revalidatePath("/dashboard/leads");
    return { success: true as const, notes: normalized.notes };
  } catch (error) {
    console.error("Error in updateLeadNotesAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Park a lead off Work next for a preset duration (1d / 3d / 7d), or clear
 * snooze when clear=true. Score history is preserved; the lead reappears when
 * snoozedUntil elapses.
 */
export async function snoozeLeadAction(
  slug: string,
  options: { preset?: SnoozePresetId | string; clear?: boolean },
) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!slug) {
      return { success: false as const, error: "Slug is required" };
    }

    const existing = await getLeadBySlug(slug);
    if (!existing) {
      return { success: false as const, error: "Lead not found" };
    }

    const nowMs = Date.now();
    let snoozedUntil: string | undefined;

    if (options.clear) {
      snoozedUntil = undefined;
    } else if (options.preset !== undefined) {
      if (!isSnoozePresetId(options.preset)) {
        return { success: false as const, error: "Invalid snooze preset" };
      }
      snoozedUntil = snoozedUntilFromPreset(options.preset, nowMs);
    } else {
      return {
        success: false as const,
        error: "Provide a snooze preset or clear: true",
      };
    }

    const normalized = normalizeSnoozedUntil(snoozedUntil ?? "", nowMs);
    if (!normalized.ok) {
      return { success: false as const, error: normalized.error };
    }

    try {
      await updateLeadSnooze(slug, normalized.snoozedUntil, LEAD_SNOOZE_CONVEX_PRIMARY);
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not save the snooze in the shared store — lead may still show as due elsewhere. Retry in a moment.",
        };
      }
      throw error;
    }
    revalidatePath("/dashboard/leads");
    return { success: true as const, snoozedUntil: normalized.snoozedUntil };
  } catch (error) {
    console.error("Error in snoozeLeadAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * One-click cold-lead disposition: re-enter the Email 1–3 cadence (reset to
 * discovered, or optionally outreach_sent + Email 1) or move to the terminal
 * `closed` stage. Only valid while isColdLead is true — see
 * src/lib/leads/cold-archive.ts.
 */
export async function disposeColdLeadAction(
  slug: string,
  disposition: ColdLeadDisposition | string,
  options: { sendEmail1?: boolean } = {},
) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!slug) {
      return { success: false as const, error: "Slug is required" };
    }
    if (!isColdLeadDisposition(disposition)) {
      return { success: false as const, error: "Invalid cold-lead disposition" };
    }

    const existing = await getLeadBySlug(slug);
    if (!existing) {
      return { success: false as const, error: "Lead not found" };
    }

    const planned = planColdLeadDisposition(existing, disposition, Date.now(), {
      sendEmail1: options.sendEmail1,
    });
    if (!planned.ok) {
      return { success: false as const, error: planned.error };
    }

    try {
      await applyColdLeadDisposition(
        slug,
        planned.patch,
        COLD_DISPOSITION_CONVEX_PRIMARY,
      );
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not save the cold-lead disposition in the shared store — other instances may still show this lead as cold. Retry in a moment.",
        };
      }
      throw error;
    }

    let outreachStep = planned.patch.outreachStep;
    let lastOutreachAt = planned.patch.lastOutreachAt;
    let emailMock = false;
    let emailSent = false;

    if (planned.sendEmail1) {
      const email = existing.email?.trim();
      if (!email) {
        // Planner already rejects this; defensive guard for race/reload.
        return {
          success: false as const,
          error: "Cannot send Email 1 on re-engage — lead has no email address",
        };
      }

      // Durably mark Email 1 sent BEFORE calling Resend (persist-then-notify)
      // so a Convex mutation failure never lets a real send land unrecorded.
      const sentAt = new Date().toISOString();
      try {
        await recordLeadOutreach(slug, 1, sentAt, OUTREACH_CADENCE_CONVEX_PRIMARY);
      } catch (error) {
        if (error instanceof ConvexPrimaryWriteError) {
          return {
            success: false as const,
            error:
              "Re-engage saved, but could not record the outreach mark in the shared store — Email 1 was not sent. Retry in a moment.",
            stage: planned.patch.stage,
            outreachStep,
            lastOutreachAt,
            snoozedUntil: planned.patch.snoozedUntil,
            emailSent: false,
          };
        }
        throw error;
      }
      outreachStep = 1;
      lastOutreachAt = sentAt;

      const sent = await sendOutreachEmail(email, existing.businessName, existing.slug);
      if (!sent.success) {
        return {
          success: false as const,
          error:
            "reason" in sent && sent.reason === "suppressed"
              ? "Email is on the suppression list"
              : "error" in sent && typeof sent.error === "string"
                ? sent.error
                : "Re-engage saved and marked Outreach Sent, but Email 1 failed to send — set stage to Outreach Sent to retry",
          stage: planned.patch.stage,
          outreachStep,
          lastOutreachAt,
          snoozedUntil: planned.patch.snoozedUntil,
          emailSent: false,
        };
      }
      emailSent = true;
      emailMock = "mock" in sent ? Boolean(sent.mock) : false;
    }

    revalidatePath("/dashboard/leads");
    revalidatePath(`/preview/${slug}`);
    return {
      success: true as const,
      stage: planned.patch.stage,
      outreachStep,
      lastOutreachAt,
      snoozedUntil: planned.patch.snoozedUntil,
      emailSent,
      mock: emailMock,
    };
  } catch (error) {
    console.error("Error in disposeColdLeadAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send the next outreach follow-up (Email 2 or 3) for a lead that already received Email 1.
 */
export async function sendFollowUpAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!slug) {
      return { success: false as const, error: "Slug is required" };
    }

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }
    if (!lead.email) {
      return { success: false as const, error: "Lead has no email address" };
    }
    if (lead.stage === "paid" || lead.stage === "live" || lead.stage === "closed") {
      return {
        success: false as const,
        error:
          lead.stage === "closed"
            ? "Lead is closed — re-engage first or change stage manually"
            : "Lead already paid or live — skip follow-ups",
      };
    }

    const next = nextFollowUpStep(lead.outreachStep);
    if (!next) {
      const step = lead.outreachStep ?? 0;
      if (step >= 3) {
        return {
          success: false as const,
          error: "Outreach sequence already complete (Email 3 sent)",
        };
      }
      return {
        success: false as const,
        error: "Send Email 1 first by setting stage to Outreach Sent",
      };
    }

    // Durably mark the follow-up step sent BEFORE calling Resend
    // (persist-then-notify) so a Convex mutation failure never lets a real
    // send land unrecorded and risk a duplicate on another instance.
    try {
      await recordLeadOutreach(slug, next, undefined, OUTREACH_CADENCE_CONVEX_PRIMARY);
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not record the outreach mark in the shared store — follow-up was not sent. Retry in a moment.",
        };
      }
      throw error;
    }

    const sent =
      next === 2
        ? await sendOutreachFollowUp2(lead.email, lead.businessName, lead.slug)
        : await sendOutreachFollowUp3(lead.email, lead.businessName, lead.slug);

    if (!sent.success) {
      return {
        success: false as const,
        error:
          "reason" in sent && sent.reason === "suppressed"
            ? "Email is on the suppression list"
            : "error" in sent && typeof sent.error === "string"
              ? sent.error
              : "Failed to send follow-up email",
        outreachStep: next,
      };
    }

    revalidatePath("/dashboard/leads");
    return {
      success: true as const,
      outreachStep: next,
      mock: "mock" in sent ? Boolean(sent.mock) : false,
    };
  } catch (error) {
    console.error("Error in sendFollowUpAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send an abandoned-checkout recovery nudge for a Stripe Checkout Session that
 * was created but not completed. See src/lib/checkout/abandoned-recovery.ts.
 * Bundle plan sessions only — commerce Buy now uses sendCommerceCheckoutRecoveryAction.
 */
export async function sendCheckoutRecoveryAction(stripeSessionId: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!stripeSessionId) {
      return { success: false as const, error: "Checkout session id is required" };
    }

    const openSessions = await listOpenCheckoutSessions();
    const session = openSessions.find((s) => s.stripeSessionId === stripeSessionId);
    if (!session) {
      return { success: false as const, error: "Checkout session not found or already completed" };
    }
    if (session.kind === "commerce_sku") {
      return {
        success: false as const,
        error: "Use Send Buy now recovery for commerce catalog carts",
      };
    }

    const lead = await getLeadBySlug(session.leadSlug);
    const to = session.customerEmail || lead?.email;
    if (!to) {
      return { success: false as const, error: "No email on file for this checkout session" };
    }

    const businessName = lead?.businessName || session.leadSlug;

    // Durable mark before send (persist-then-notify). requireConvex when
    // configured so Convex-first abandoned queues cannot re-nudge after a
    // SQLite-only recoverySentAt write.
    try {
      await recordCheckoutRecoverySent(
        stripeSessionId,
        new Date().toISOString(),
        CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY,
      );
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not record recovery send in the shared store — email was not sent. Retry in a moment.",
        };
      }
      throw error;
    }

    const sent = await sendCheckoutAbandonedRecovery(to, businessName, session.leadSlug, session.tier);

    if (!sent.success) {
      return {
        success: false as const,
        error:
          "reason" in sent && sent.reason === "suppressed"
            ? "Email is on the suppression list (session already marked recovered — will not reappear in due queue)"
            : "error" in sent && typeof sent.error === "string"
              ? `${sent.error} (session already marked recovered — will not reappear in due queue)`
              : "Failed to send recovery email (session already marked recovered — will not reappear in due queue)",
      };
    }

    revalidatePath("/dashboard/leads");
    return { success: true as const, mock: "mock" in sent ? Boolean(sent.mock) : false };
  } catch (error) {
    console.error("Error in sendCheckoutRecoveryAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Commerce Buy now abandoned-cart recovery — emails the end customer a link
 * back to /preview/[slug]#catalog (never /checkout?tier=).
 */
export async function sendCommerceCheckoutRecoveryAction(stripeSessionId: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!stripeSessionId) {
      return { success: false as const, error: "Checkout session id is required" };
    }

    const openSessions = await listOpenCheckoutSessions();
    const session = openSessions.find((s) => s.stripeSessionId === stripeSessionId);
    if (!session) {
      return { success: false as const, error: "Checkout session not found or already completed" };
    }
    if (session.kind !== "commerce_sku") {
      return {
        success: false as const,
        error: "Use Send recovery email for Local Site Studio plan checkouts",
      };
    }

    const to = session.customerEmail;
    if (!to) {
      return {
        success: false as const,
        error: "No customer email on this Buy now session — recovery needs the shopper's email",
      };
    }

    const lead = await getLeadBySlug(session.leadSlug);
    const catalog = await getCommerceCatalog(session.leadSlug);
    const skuName =
      catalog?.items.find((item) => item.id === session.skuId)?.name ?? session.skuId ?? "item";
    const businessName = lead?.businessName || session.leadSlug;

    try {
      await recordCheckoutRecoverySent(
        stripeSessionId,
        new Date().toISOString(),
        CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY,
      );
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not record recovery send in the shared store — email was not sent. Retry in a moment.",
        };
      }
      throw error;
    }

    const sent = await sendCommerceAbandonedRecovery(
      to,
      businessName,
      session.leadSlug,
      skuName,
    );

    if (!sent.success) {
      return {
        success: false as const,
        error:
          "reason" in sent && sent.reason === "suppressed"
            ? "Email is on the suppression list (session already marked recovered — will not reappear in due queue)"
            : "error" in sent && typeof sent.error === "string"
              ? `${sent.error} (session already marked recovered — will not reappear in due queue)`
              : "Failed to send recovery email (session already marked recovered — will not reappear in due queue)",
      };
    }

    revalidatePath("/dashboard/leads");
    return { success: true as const, mock: "mock" in sent ? Boolean(sent.mock) : false };
  } catch (error) {
    console.error("Error in sendCommerceCheckoutRecoveryAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Operator marks one commerceOrders line as manually paid out to the client.
 * Free coded path ahead of Stripe Connect (see commerce-payouts-stripe-connect) —
 * reduces double-pay risk on the Commerce payouts (manual) panel. Never touches
 * revenueTotalUsd/orders — pass-through money stays in its own ledger.
 */
export async function markCommerceOrderPaidOutAction(stripeSessionId: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!stripeSessionId) {
      return { success: false as const, error: "Checkout session id is required" };
    }

    const order = await getCommerceOrderByStripeSessionId(stripeSessionId);
    if (!order) {
      return { success: false as const, error: "Commerce order not found" };
    }
    if (order.paidOutAt) {
      return { success: false as const, error: "Order is already marked paid out" };
    }

    const paidOutAt = new Date().toISOString();
    try {
      await markCommerceOrderPaidOut(
        stripeSessionId,
        paidOutAt,
        COMMERCE_PAID_OUT_CONVEX_PRIMARY,
      );
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not record payout in the shared store — order still shows as owed. Retry in a moment.",
        };
      }
      throw error;
    }
    revalidatePath("/dashboard/leads");
    return { success: true as const, paidOutAt };
  } catch (error) {
    console.error("Error in markCommerceOrderPaidOutAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function addLeadAction(leadData: Omit<Lead, "stage"> & { stage?: LeadPipelineStage }) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }

    const stage = leadData.stage ?? "discovered";
    const lead: Lead = {
      ...leadData,
      stage,
      dataSource: leadData.dataSource ?? "manual_entry",
    };

    // Simple validation
    if (!lead.slug || !lead.businessName) {
      throw new Error("Slug and Business Name are required");
    }

    // Ensure slug is clean
    lead.slug = lead.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

    // Create-path only: never clobber an advanced lead via upsertLead on a slug typo/collision.
    const existing = await getLeadBySlug(lead.slug);
    if (existing) {
      return { success: false as const, error: existingLeadSlugConflictMessage(lead.slug) };
    }

    try {
      await upsertLead(lead, LEAD_UPSERT_CONVEX_PRIMARY);
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not save the lead in the shared store — other instances may not see it. Retry in a moment.",
        };
      }
      throw error;
    }

    // If added directly in outreach_sent stage, durably mark Email 1 sent
    // BEFORE sending (persist-then-notify) — see OUTREACH_CADENCE_CONVEX_PRIMARY.
    if (stage === "outreach_sent" && lead.email) {
      try {
        await recordLeadOutreach(lead.slug, 1, undefined, OUTREACH_CADENCE_CONVEX_PRIMARY);
      } catch (error) {
        if (error instanceof ConvexPrimaryWriteError) {
          return {
            success: false as const,
            error:
              "Lead saved, but could not record the outreach mark in the shared store — Email 1 was not sent. Retry Email 1 from the dashboard in a moment.",
            slug: lead.slug,
          };
        }
        throw error;
      }
      // sendOutreachEmail → sendEmail resolves { success: false } on
      // suppression/Resend failure (never throws). Surface that to the
      // operator — persist-then-notify keeps the mark; do not pretend Email 1 sent.
      const sent = await sendOutreachEmail(
        lead.email,
        lead.businessName,
        lead.slug,
      );
      if (!sent.success) {
        return {
          success: false as const,
          error:
            "reason" in sent && sent.reason === "suppressed"
              ? "Lead saved and marked Outreach Sent, but Email 1 was not delivered — email is on the suppression list"
              : "error" in sent && typeof sent.error === "string"
                ? `Lead saved and marked Outreach Sent, but Email 1 failed to send — ${sent.error}`
                : "Lead saved and marked Outreach Sent, but Email 1 failed to send — retry Email 1 from the dashboard",
          slug: lead.slug,
        };
      }
    }

    revalidatePath("/dashboard/leads");
    revalidatePath(`/preview/${lead.slug}`);
    return { success: true as const, slug: lead.slug };
  } catch (error) {
    console.error("Error in addLeadAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export type ImportLeadsCsvResult =
  | {
      success: true;
      imported: number;
      slugs: string[];
      errors: Array<{ row: number; message: string }>;
      skipped: number;
    }
  | {
      success: false;
      error: string;
      imported?: number;
      errors?: Array<{ row: number; message: string }>;
      skipped?: number;
    };

export async function importLeadsCsvAction(input: {
  csvText: string;
  dataSource?: string;
  defaultStage?: LeadPipelineStage;
}): Promise<ImportLeadsCsvResult> {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }

    if (!input.csvText || input.csvText.trim().length === 0) {
      return { success: false as const, error: "CSV text is empty" };
    }

    const parsed = parseLeadsCsv(input.csvText, {
      dataSource: input.dataSource,
      defaultStage: input.defaultStage,
    });

    if (parsed.leads.length === 0) {
      return {
        success: false as const,
        error: parsed.errors[0]?.message ?? "No valid leads found in CSV",
        imported: 0,
        errors: parsed.errors,
        skipped: parsed.skipped,
      };
    }

    // Skip rows whose slug already exists — upsertLead would reset stage/outreach/notes/snooze.
    const existingSlugs = new Set((await getLeads()).map((l) => l.slug));
    const { fresh, collisions } = partitionLeadsByExistingSlugs(parsed.leads, existingSlugs);

    const importedSlugs: string[] = [];
    const upsertErrors: Array<{ row: number; message: string }> = [...parsed.errors];
    for (const lead of collisions) {
      upsertErrors.push({
        row: 0,
        message: existingLeadSlugConflictMessage(lead.slug),
      });
    }

    for (const [index, lead] of fresh.entries()) {
      try {
        await upsertLead(lead, LEAD_UPSERT_CONVEX_PRIMARY);
        importedSlugs.push(lead.slug);
        // Prevent later rows in the same batch from colliding with earlier inserts.
        existingSlugs.add(lead.slug);
        revalidatePath(`/preview/${lead.slug}`);
      } catch (error) {
        upsertErrors.push({
          row: index + 1,
          message:
            error instanceof ConvexPrimaryWriteError
              ? "Could not save this lead in the shared store — other instances may not see it. Retry import for this row."
              : error instanceof Error
                ? error.message
                : "Failed to upsert lead",
        });
      }
    }

    revalidatePath("/dashboard/leads");

    const collisionSkipped = collisions.length;
    const failedFresh = fresh.length - importedSlugs.length;

    if (importedSlugs.length === 0) {
      return {
        success: false as const,
        error: upsertErrors[0]?.message ?? "No leads imported",
        imported: 0,
        errors: upsertErrors,
        skipped: parsed.skipped + collisionSkipped + failedFresh,
      };
    }

    return {
      success: true as const,
      imported: importedSlugs.length,
      slugs: importedSlugs,
      errors: upsertErrors,
      skipped: parsed.skipped + collisionSkipped + failedFresh,
    };
  } catch (error) {
    console.error("Error in importLeadsCsvAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Operator-triggered Growth/Complete upsell email for paid Starter leads
 * (no recurring order yet). Checkout link preselects recommended tier.
 * See /docs/process (paid-starter-upsell-nudge).
 */
export async function sendStarterUpsellAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!slug?.trim()) {
      return { success: false as const, error: "Slug is required" };
    }

    const lead = await getLeadBySlug(slug.trim());
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    const allOrders = await listOrders();
    const ordersForLead = allOrders.filter((o) => o.leadSlug === lead.slug);
    if (
      !leadEligibleForStarterUpsell({
        stage: lead.stage,
        email: lead.email,
        ordersForLead,
      })
    ) {
      return {
        success: false as const,
        error:
          "Upsell only applies to paid/live Starter leads with email and no Growth/Complete/Commerce order yet",
      };
    }

    const email = lead.email!.trim();
    const targetTier = resolveUpsellTargetTier(lead.recommendedTier);
    const bundle = getBundle(targetTier);
    if (!bundle?.monthlyPriceUsd) {
      return { success: false as const, error: "Upsell tier is missing monthly pricing" };
    }

    const sent = await sendStarterUpsellEmail({
      to: email,
      businessName: lead.businessName,
      slug: lead.slug,
      targetTier,
      monthlyPriceUsd: bundle.monthlyPriceUsd,
    });
    if (!sent.success) {
      return {
        success: false as const,
        error:
          "reason" in sent && sent.reason === "suppressed"
            ? "Email is on the suppression list"
            : "error" in sent && typeof sent.error === "string"
              ? sent.error
              : "Failed to send upsell email",
      };
    }

    revalidatePath("/dashboard/leads");
    return {
      success: true as const,
      targetTier,
      mock: "mock" in sent ? Boolean(sent.mock) : false,
    };
  } catch (error) {
    console.error("Error in sendStarterUpsellAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Open Stripe Billing Portal for a Growth/Complete/Commerce subscriber.
 * Resolves Stripe Customer from the lead's latest eligible order.
 */
export async function openBillingPortalAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!slug?.trim()) {
      return { success: false as const, error: "Slug is required" };
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return {
        success: false as const,
        error: "Set STRIPE_SECRET_KEY before opening the billing portal.",
      };
    }

    // Money redirect — never trust request Host (see resolveStripeRedirectAppUrl).
    const appUrl = resolveStripeRedirectAppUrl();

    const stripe = new Stripe(secretKey);
    const result = await createBillingPortalForLead(stripe, slug, `${appUrl}/dashboard/leads`);
    if (!result.ok) {
      return { success: false as const, error: result.error };
    }
    return { success: true as const, url: result.url };
  } catch (error) {
    console.error("Error in openBillingPortalAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Operator-triggered daily digest email: Work next top leads, follow-ups due,
 * abandoned-checkout recoveries due, unreplied inquiries, marketing packs due,
 * Starter → MRR upsell candidates, Commerce catalogs missing / unsynced,
 * Complete voice packs due, Commerce payouts owed (pass-through Buy now), and
 * production handoffs still open (DNS / Mark live) in one send, plus
 * cold/snoozed footnotes, so a single-operator business does not have to open
 * this dashboard to know what is urgent today. Requires OPERATOR_DIGEST_EMAIL
 * — see /docs/process.
 */
export async function sendDailyDigestAction() {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }

    const digestEmail = process.env.OPERATOR_DIGEST_EMAIL?.trim();
    if (!digestEmail) {
      return {
        success: false as const,
        error: "Set OPERATOR_DIGEST_EMAIL in your environment to enable the daily digest.",
      };
    }

    const nowMs = Date.now();
    const yearMonth = marketingMonthKey(nowMs);
    const [
      leads,
      inquiries,
      openCheckoutSessions,
      orders,
      marketingPacks,
      commerceCatalogs,
      clientVoicePacks,
      commerceOrders,
      handoffs,
    ] = await Promise.all([
      getLeads(),
      listUnrepliedInquiries(),
      listOpenCheckoutSessions(),
      listOrders(),
      listMarketingPacksForMonth(yearMonth),
      listCommerceCatalogs(),
      listClientVoicePacks(),
      listUnpaidCommerceOrders(),
      listDeployHandoffs(),
    ]);

    const headerStore = await headers();
    const appUrl = resolveTrustedAppUrl(headerStore, process.env.NEXT_PUBLIC_APP_URL);

    const digest = buildDailyDigest({
      leads,
      inquiries,
      openCheckoutSessions,
      orders,
      marketingPacksThisMonth: marketingPacks,
      commerceCatalogs,
      clientVoicePacks,
      commerceOrders,
      handoffs,
      nowMs,
    });
    const html = renderDailyDigestHtml(digest, appUrl);

    const sent = await sendOperatorDailyDigest(digestEmail, html);
    if (!sent.success) {
      return {
        success: false as const,
        error:
          "error" in sent && typeof sent.error === "string"
            ? sent.error
            : "Failed to send daily digest",
      };
    }

    return {
      success: true as const,
      digest,
      mock: "mock" in sent ? Boolean(sent.mock) : false,
    };
  } catch (error) {
    console.error("Error in sendDailyDigestAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate (or regenerate) this UTC month's marketing pack for a paid/live
 * Growth/Complete lead. Uses Anthropic when ANTHROPIC_API_KEY is set; otherwise stub.
 */
export async function generateMarketingPackAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!slug) {
      return { success: false as const, error: "Slug is required" };
    }

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    const orders = (await listOrders()).filter((o) => o.leadSlug === slug);
    if (!leadEligibleForMarketingPack(lead, orders)) {
      return {
        success: false as const,
        error:
          "Marketing packs require a paid/live lead with a Growth or Complete order",
      };
    }

    const orderTier = bestMarketingOrderTier(orders);
    if (!orderTier) {
      return {
        success: false as const,
        error: "No Growth/Complete order found for this lead",
      };
    }

    const nowMs = Date.now();
    const yearMonth = marketingMonthKey(nowMs);
    const { request, packageTier } = monthlyPackRequestForLead(lead, { orderTier });
    const generator = getMarketingGenerator();
    const result = await generator.generate(request);
    const usedAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim()) &&
      !result.variants.some((v) => v.body.startsWith("[Stub"));

    let pack;
    try {
      pack = await upsertMarketingPack(
        {
          leadSlug: lead.slug,
          yearMonth,
          variants: result.variants,
          generatedAt: result.generatedAt,
          generator: usedAnthropic ? "anthropic" : "stub",
          packageTier: result.packageTier ?? packageTier,
        },
        MARKETING_PACK_CONVEX_PRIMARY,
      );
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not save the marketing pack in the shared store — other instances may still show packs due. Retry in a moment.",
        };
      }
      throw error;
    }

    revalidatePath("/dashboard/leads");
    return { success: true as const, pack };
  } catch (error) {
    console.error("Error in generateMarketingPackAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Email this UTC month's marketing pack to the client (Growth/Complete content
 * handoff without Buffer/GBP OAuth). Requires an existing pack row + lead.email.
 * See /docs/process (deliver-marketing-pack-to-client).
 */
export async function sendMarketingPackToClientAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!slug?.trim()) {
      return { success: false as const, error: "Slug is required" };
    }

    const lead = await getLeadBySlug(slug.trim());
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    const orders = (await listOrders()).filter((o) => o.leadSlug === lead.slug);
    if (!leadEligibleForMarketingPackDelivery(lead, orders)) {
      return {
        success: false as const,
        error:
          "Email pack requires a paid/live Growth or Complete lead with an email on file",
      };
    }

    const yearMonth = marketingMonthKey(Date.now());
    const pack = await getMarketingPack(lead.slug, yearMonth);
    if (!pack || pack.variants.length === 0) {
      return {
        success: false as const,
        error: `No marketing pack for ${yearMonth} — generate one first`,
      };
    }

    const email = lead.email!.trim();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const previewUrl = leadPreviewAbsoluteUrl(baseUrl, lead.slug);
    const sent = await sendMarketingPackToClientEmail({
      to: email,
      businessName: lead.businessName,
      slug: lead.slug,
      yearMonth: pack.yearMonth,
      variants: pack.variants,
      previewUrl,
    });
    if (!sent.success) {
      return {
        success: false as const,
        error:
          "reason" in sent && sent.reason === "suppressed"
            ? "Email is on the suppression list"
            : "error" in sent && typeof sent.error === "string"
              ? sent.error
              : "Failed to send marketing pack email",
      };
    }

    revalidatePath("/dashboard/leads");
    return {
      success: true as const,
      yearMonth: pack.yearMonth,
      mock: "mock" in sent ? Boolean(sent.mock) : false,
    };
  } catch (error) {
    console.error("Error in sendMarketingPackToClientAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Save (or replace) the Commerce catalog for a paid/live lead with a commerceAddon order.
 * Caps at 50 SKUs — matches the sold Commerce promise before Stripe Products sync.
 */
export async function saveCommerceCatalogAction(
  slug: string,
  rawItems: ReadonlyArray<{
    id?: string;
    name?: string;
    description?: string;
    priceCents?: number;
  }>,
) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!slug) {
      return { success: false as const, error: "Slug is required" };
    }

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    const orders = (await listOrders()).filter((o) => o.leadSlug === slug);
    if (!leadEligibleForCommerceCatalog(lead, orders)) {
      return {
        success: false as const,
        error:
          "Commerce catalogs require a paid/live lead with a Commerce add-on order",
      };
    }

    const normalized = normalizeCommerceItems(rawItems);
    if (!normalized.ok) {
      return { success: false as const, error: normalized.error };
    }

    // normalizeCommerceItems intentionally drops Stripe ids (never trust the
    // client). Re-attach from the saved row so an edit after Sync to Stripe
    // does not silently disable Buy now.
    const existing = await getCommerceCatalog(slug);
    const items = preserveCommerceStripeIds(normalized.items, existing?.items);

    let catalog;
    try {
      catalog = await upsertCommerceCatalog(
        {
          leadSlug: lead.slug,
          items,
          updatedAt: new Date().toISOString(),
        },
        COMMERCE_CATALOG_CONVEX_PRIMARY,
      );
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not save the catalog in the shared store — Buy now may still miss stripePriceId elsewhere. Retry in a moment.",
        };
      }
      throw error;
    }

    revalidatePath("/dashboard/leads");
    revalidatePath(`/preview/${lead.slug}`);
    return { success: true as const, catalog };
  } catch (error) {
    console.error("Error in saveCommerceCatalogAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/** Read-only helper for dashboard — returns null when no catalog row exists. */
export async function getCommerceCatalogAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!slug) {
      return { success: false as const, error: "Slug is required" };
    }
    const catalog = await getCommerceCatalog(slug);
    return { success: true as const, catalog };
  } catch (error) {
    console.error("Error in getCommerceCatalogAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Sync a saved Commerce catalog to real Stripe Products/Prices (one Product
 * per SKU, idempotent on re-run) and persist the resulting ids so the
 * preview page can offer a direct Stripe Checkout "Buy now" instead of the
 * Request-order → inquiry stub. Requires STRIPE_SECRET_KEY — the same secret
 * already required for the bundle checkout flow, no new credentials needed.
 */
export async function syncCommerceCatalogToStripeAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!slug) {
      return { success: false as const, error: "Slug is required" };
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return {
        success: false as const,
        error: "Set STRIPE_SECRET_KEY before syncing the catalog to Stripe.",
      };
    }

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    const catalog = await getCommerceCatalog(slug);
    if (!catalog || catalog.items.length === 0) {
      return {
        success: false as const,
        error: "Save the catalog with at least one SKU before syncing to Stripe",
      };
    }

    const stripe = new Stripe(secretKey);
    const synced = await syncCommerceCatalogToStripe(
      stripe,
      lead.slug,
      lead.businessName,
      catalog.items,
    );

    // syncCommerceCatalogToStripe runs a real, sequential per-SKU Stripe API
    // loop (up to MAX_COMMERCE_SKUS) — a materially long window in which an
    // operator's concurrent saveCommerceCatalogAction (a different browser
    // tab, or a follow-up edit) could persist a newer catalog. Writing
    // `synced` (derived from the catalog read before the loop) as the whole
    // row would silently overwrite that edit. Re-read immediately before
    // this write and layer only the freshly-created Stripe ids onto the
    // current items (by SKU id, dropping the price-matched id if the price
    // changed concurrently) — the same merge preserveCommerceStripeIds
    // already does for saveCommerceCatalogAction, just with the just-synced
    // items as the "previous" (Stripe-id-bearing) side instead of the base.
    const freshCatalog = await getCommerceCatalog(slug);
    const items = preserveCommerceStripeIds(freshCatalog?.items ?? catalog.items, synced);

    let updated;
    try {
      updated = await upsertCommerceCatalog(
        {
          leadSlug: lead.slug,
          items,
          updatedAt: new Date().toISOString(),
        },
        COMMERCE_CATALOG_CONVEX_PRIMARY,
      );
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Stripe Products/Prices may already exist, but the catalog could not be saved in the shared store — Buy now may still miss stripePriceId elsewhere. Retry Sync to Stripe (idempotent).",
        };
      }
      throw error;
    }

    revalidatePath("/dashboard/leads");
    revalidatePath(`/preview/${lead.slug}`);
    return { success: true as const, catalog: updated };
  } catch (error) {
    console.error("Error in syncCommerceCatalogToStripeAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown Stripe error",
    };
  }
}

/**
 * Archive Stripe Products for SKUs removed from a lead's saved Commerce catalog.
 * Operator-triggered only (never on save/sync). Sets product.active=false —
 * does not delete. Reuses STRIPE_SECRET_KEY.
 */
export async function archiveOrphanCommerceStripeProductsAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!slug) {
      return { success: false as const, error: "Slug is required" };
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return {
        success: false as const,
        error: "Set STRIPE_SECRET_KEY before archiving orphan Stripe Products.",
      };
    }

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    const catalog = await getCommerceCatalog(slug);
    const items = catalog?.items ?? [];

    const stripe = new Stripe(secretKey);
    // listOrphanCommerceStripeProducts paginates every active Stripe Product
    // on the account — a real, materially long window. Re-read the catalog
    // right before actually archiving anything and drop any candidate whose
    // skuId reappears, so a concurrent saveCommerceCatalogAction that
    // re-adds/renames a SKU into the same id during that window doesn't get
    // its live Stripe Product archived out from under it.
    const candidates = await listOrphanCommerceStripeProducts(stripe, lead.slug, items);
    const freshCatalog = await getCommerceCatalog(slug);
    const freshSkuIds = new Set((freshCatalog?.items ?? []).map((item) => item.id));
    const toArchive = candidates.filter((orphan) => !freshSkuIds.has(orphan.skuId));
    const { archived } = await archiveCommerceStripeProducts(stripe, toArchive);

    revalidatePath("/dashboard/leads");
    return {
      success: true as const,
      archivedCount: archived.length,
      archivedSkuIds: archived.map((o) => o.skuId),
    };
  } catch (error) {
    console.error("Error in archiveOrphanCommerceStripeProductsAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown Stripe error",
    };
  }
}

/**
 * Generate (or regenerate) the client voice FAQ/script pack for a paid/live
 * Complete lead. Uses Anthropic when ANTHROPIC_API_KEY is set; otherwise stub.
 * Operators paste scripts into a temp number / Cal.com until Twilio ships.
 */
export async function generateClientVoicePackAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!slug) {
      return { success: false as const, error: "Slug is required" };
    }

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    const orders = (await listOrders()).filter((o) => o.leadSlug === slug);
    if (!leadEligibleForClientVoicePack(lead, orders)) {
      return {
        success: false as const,
        error:
          "Client voice FAQ packs require a paid/live lead with a Complete order",
      };
    }

    const request = clientVoicePackRequestForLead(lead);
    const generator = getClientVoiceGenerator();
    const result = await generator.generate(request);
    const usedAnthropic =
      Boolean(process.env.ANTHROPIC_API_KEY?.trim()) &&
      !result.variants.some((v) => v.body.includes("[Stub"));

    let pack;
    try {
      pack = await upsertClientVoicePack(
        {
          leadSlug: lead.slug,
          variants: result.variants,
          generatedAt: result.generatedAt,
          generator: usedAnthropic ? "anthropic" : "stub",
        },
        CLIENT_VOICE_PACK_CONVEX_PRIMARY,
      );
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not save the voice pack in the shared store — other instances may still show voice packs due. Retry in a moment.",
        };
      }
      throw error;
    }

    revalidatePath("/dashboard/leads");
    return { success: true as const, pack };
  } catch (error) {
    console.error("Error in generateClientVoicePackAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Email the Complete voice FAQ/script pack to the client (phone-script handoff
 * without Twilio). Requires an existing pack row + lead.email.
 * See /docs/process (deliver-client-voice-pack-to-client).
 */
export async function sendClientVoicePackToClientAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    if (!slug?.trim()) {
      return { success: false as const, error: "Slug is required" };
    }

    const lead = await getLeadBySlug(slug.trim());
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    const orders = (await listOrders()).filter((o) => o.leadSlug === lead.slug);
    if (!leadEligibleForClientVoicePackDelivery(lead, orders)) {
      return {
        success: false as const,
        error:
          "Email voice pack requires a paid/live Complete lead with an email on file",
      };
    }

    const pack = await getClientVoicePackByLeadSlug(lead.slug);
    if (!pack || pack.variants.length === 0) {
      return {
        success: false as const,
        error: "No voice FAQ pack — generate one first",
      };
    }

    const email = lead.email!.trim();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const previewUrl = leadPreviewAbsoluteUrl(baseUrl, lead.slug);
    const sent = await sendClientVoicePackToClientEmail({
      to: email,
      businessName: lead.businessName,
      slug: lead.slug,
      variants: pack.variants,
      previewUrl,
    });
    if (!sent.success) {
      return {
        success: false as const,
        error:
          "reason" in sent && sent.reason === "suppressed"
            ? "Email is on the suppression list"
            : "error" in sent && typeof sent.error === "string"
              ? sent.error
              : "Failed to send voice pack email",
      };
    }

    revalidatePath("/dashboard/leads");
    return {
      success: true as const,
      mock: "mock" in sent ? Boolean(sent.mock) : false,
    };
  } catch (error) {
    console.error("Error in sendClientVoicePackToClientAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
