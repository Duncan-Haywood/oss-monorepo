"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireOperatorAuth } from "@/lib/auth/operator";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";
import {
  updateLeadStage,
  upsertLead,
  updateClientInquiryStatus,
  getClientInquiryById,
  recordClientInquiryReply,
  getLeadBySlug,
  getLeads,
  listOrdersByLeadSlug,
  recordLeadOutreach,
  recordStarterUpsellSent,
  recordStripeConnectOnboardingLinkSent,
  recordGrowthUpsellSent,
  listOpenCheckoutSessions,
  recordCheckoutRecoverySent,
  updateLeadNotes,
  updateLeadSnooze,
  applyColdLeadDisposition,
  upsertMarketingPack,
  getMarketingPack,
  markMarketingPackSentToClient,
  clearMarketingPackSentToClient,
  upsertCommerceCatalog,
  getCommerceCatalog,
  getCommerceOrderByStripeSessionId,
  markCommerceOrderPaidOut,
  markCommerceOrderClientReceiptSent,
  clearCommerceOrderClientReceiptSent,
  upsertClientVoicePack,
  getClientVoicePackByLeadSlug,
  markClientVoicePackSentToClient,
  clearClientVoicePackSentToClient,
  getLeadSlugByCustomDomain,
  getDeployHandoffBySlug,
  reserveBundleBuyerEmailNotes,
  releaseBundleBuyerEmailNotes,
  getOrderByStripeSessionId,
  updateLeadStripeConnectAccountId,
  updateLeadStripeConnectStatus,
  updateLeadBufferProfileIds,
  updateLeadBufferPostedVariantKeys,
  isEmailSuppressed,
  unsuppressEmail,
} from "@/lib/db";
import { CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY } from "@/lib/checkout/session-persist";
import { OPERATOR_UNSUPPRESS_CONVEX_PRIMARY } from "@/lib/email/suppression-persist";
import { MAX_CONTACT_EMAIL_LENGTH } from "@/lib/inquiries/contact-fields";
import { COMMERCE_PAID_OUT_CONVEX_PRIMARY } from "@/lib/commerce/paid-out-persist";
import { COMMERCE_CLIENT_RECEIPT_RESEND_CONVEX_PRIMARY } from "@/lib/commerce/client-receipt-persist";
import { COMMERCE_CATALOG_CONVEX_PRIMARY } from "@/lib/commerce/catalog-persist";
import { parseInquiryId } from "@/lib/inquiries/inquiry-id";
import { INQUIRY_REPLY_CONVEX_PRIMARY } from "@/lib/inquiries/reply-persist";
import { COLD_DISPOSITION_CONVEX_PRIMARY } from "@/lib/leads/cold-disposition-persist";
import { LEAD_NOTES_CONVEX_PRIMARY } from "@/lib/leads/notes-persist";
import { LEAD_SNOOZE_CONVEX_PRIMARY } from "@/lib/leads/snooze-persist";
import {
  LEAD_STRIPE_CONNECT_CONVEX_PRIMARY,
  LEAD_STRIPE_CONNECT_STATUS_CONVEX_PRIMARY,
} from "@/lib/leads/stripe-connect-persist";
import { LEAD_BUFFER_PROFILES_CONVEX_PRIMARY } from "@/lib/leads/buffer-profiles-persist";
import { LEAD_BUFFER_POSTED_VARIANT_KEYS_CONVEX_PRIMARY } from "@/lib/marketing/buffer-posted-variant-persist";
import { LEAD_STAGE_CONVEX_PRIMARY } from "@/lib/leads/stage-persist";
import { LEAD_UPSERT_CONVEX_PRIMARY } from "@/lib/leads/upsert-persist";
import { OUTREACH_CADENCE_CONVEX_PRIMARY } from "@/lib/leads/outreach-persist";
import { STARTER_UPSELL_SENT_CONVEX_PRIMARY } from "@/lib/leads/starter-upsell-persist";
import { GROWTH_UPSELL_SENT_CONVEX_PRIMARY } from "@/lib/leads/growth-upsell-persist";
import { STRIPE_CONNECT_ONBOARDING_LINK_SENT_CONVEX_PRIMARY } from "@/lib/leads/stripe-connect-onboarding-link-persist";
import { MARKETING_PACK_CONVEX_PRIMARY } from "@/lib/marketing/pack-persist";
import { CLIENT_VOICE_PACK_CONVEX_PRIMARY } from "@/lib/voice/pack-persist";
import { ConvexPrimaryWriteError } from "@/lib/payments/convex-primary";
import {
  existingLeadSlugConflictMessage,
  MAX_CSV_IMPORT_TEXT_LENGTH,
  parseCsvImportText,
  parseLeadsCsv,
  partitionLeadsByExistingSlugs,
} from "@/lib/leads/csv-import";
import type { Lead, LeadPipelineStage } from "@/lib/leads/types";
import {
  normalizeLeadCreateFields,
  normalizeLeadDataSource,
} from "@/lib/leads/create-fields";
import { normalizeOperatorNotes } from "@/lib/leads/notes";
import { parseLeadSlugLookup, sanitizeLeadSlug } from "@/lib/leads/slug";
import { leadPreviewAbsoluteUrl, leadPreviewPath } from "@/lib/leads/slug-path";
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
  enqueueProductionHandoff,
  productionRootDomain,
} from "@/lib/deploy/handoff";
import { DEPLOY_HANDOFF_CONVEX_PRIMARY } from "@/lib/deploy/handoff-persist";
import {
  CustomDomainConflictError,
  customDomainAlreadyOwnedMessage,
  parseOperatorCustomDomain,
} from "@/lib/deploy/custom-domain-routing";
import { parseVercelProjectId } from "@/lib/deploy/vercel-project-id";
import { assessStripeConnectOnboardingGate } from "@/lib/commerce/stripe-connect-gate";
import {
  createExpressConnectAccount,
  createConnectOnboardingLink,
  fetchConnectAccountStatus,
} from "@/lib/commerce/stripe-connect";
import { assessMarketingSchedulingGate } from "@/lib/marketing/buffer-gate";
import {
  listBufferProfiles,
  createBufferUpdate,
  bufferServiceContentType,
  formatMarketingVariantForBuffer,
  bufferPostedVariantKey,
  pruneBufferPostedVariantKeysForPack,
  MAX_BUFFER_PROFILE_ID_LENGTH,
  MAX_BUFFER_PROFILES_PER_LEAD,
} from "@/lib/marketing/buffer";
import type { ClientInquiryStatus } from "@/lib/inquiries/types";
import {
  sendOutreachEmail,
  sendOutreachFollowUp2,
  sendOutreachFollowUp3,
  sendCheckoutAbandonedRecovery,
  sendCommerceAbandonedRecovery,
  sendInquiryReply,
  sendStarterUpsellEmail,
  sendGrowthUpsellEmail,
  sendMarketingPackToClientEmail,
  sendClientVoicePackToClientEmail,
  sendCommerceBuyNowClientReceipt,
  sendStripeConnectOnboardingLinkEmail,
  sendReceiptEmail,
  sendBundleDnsHandoffEmail,
} from "@/lib/email/resend";
import {
  hasBundleReceiptEmailNote,
  hasBundleDnsHandoffEmailNote,
} from "@/lib/payments/bundle-side-effect-recovery";
import { nextFollowUpStep } from "@/lib/email/outreach-followups";
import { createBillingPortalForLead } from "@/lib/billing/create-portal-session";
import { parseCheckoutSessionId } from "@/lib/billing/checkout-session-id";
import {
  resolveStripeRedirectAppUrl,
  resolveTrustedAppUrl,
} from "@/lib/security/app-url";
import {
  leadEligibleForStarterUpsell,
  resolveUpsellTargetTier,
} from "@/lib/billing/starter-upsell";
import { leadEligibleForGrowthUpsell } from "@/lib/billing/growth-upsell";
import { getBundle } from "@/lib/pricing/bundles";
import { sendOperatorDigestEmail } from "@/lib/digest/send-operator-digest";
import {
  bestMarketingOrderTier,
  getMarketingGenerator,
  leadEligibleForMarketingPack,
  leadEligibleForMarketingPackDelivery,
  leadEligibleForSeasonalPromo,
  marketingMonthKey,
  monthlyPackRequestForLead,
  seasonalPromoRequestForLead,
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

/**
 * Manual remedy for a lead promoted to stage="paid" (stage dropdown or CSV
 * import) with no deploy_handoffs row — enqueueProductionHandoff is only
 * ever called from the Stripe webhook otherwise, so a manually-marked-paid
 * lead had no path to production handoff/DNS instructions at all (see
 * paid-not-live-dashboard-panel-and-remedy). Idempotency guard here is a
 * pre-check (getDeployHandoffBySlug), not enqueueProductionHandoff's own
 * stripeSessionId match, since a manual call has no real Stripe session to
 * match against.
 */
export async function createDeployHandoffForLeadAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`deploy-handoff-create:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;
    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }
    if (lead.stage !== "paid") {
      return { success: false as const, error: "Lead is not at the Paid stage" };
    }
    const existing = await getDeployHandoffBySlug(slug);
    if (existing) {
      return {
        success: false as const,
        error: "A deploy handoff already exists for this lead",
      };
    }
    let handoff;
    try {
      handoff = await enqueueProductionHandoff(
        {
          leadSlug: slug,
          businessName: lead.businessName,
          tier: lead.recommendedTier,
          commerceAddon: false,
          stripeSessionId: `manual_${slug}_${Date.now()}`,
          customerEmail: lead.email || "",
        },
        DEPLOY_HANDOFF_CONVEX_PRIMARY,
      );
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not record the new handoff in the shared store. Retry in a moment.",
        };
      }
      throw error;
    }
    revalidatePath("/dashboard/leads");
    return { success: true as const, handoff };
  } catch (error) {
    console.error("Error in createDeployHandoffForLeadAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function markHandoffLiveAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`deploy-handoff-mark-live:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }
    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;
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
    revalidatePath(leadPreviewPath(slug));
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

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`vercel-project-assign:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;
    // Hard-reject over-long opaque project ids before Domains API / Convex
    // write — auth is not a payload-size throttle; soft-cap would change the key.
    const parsed = parseVercelProjectId(vercelProjectId);
    if (parsed === null && vercelProjectId.trim().length > 0) {
      return { success: false as const, error: "Vercel project ID is too long" };
    }
    let handoff;
    try {
      handoff = await assignVercelProjectAndProvision(slug, parsed);
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

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`custom-domain-assign:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;
    // Bare hostname only — URL/port/path pastes must not land in the
    // handoff row (Host→preview + Vercel Domains API both expect Host form).
    // custom-domain-host-normalize (sibling continuous-work) + collision
    // reject (custom-domain-normalize-and-unique) folded into one path.
    const parsed = parseOperatorCustomDomain(customDomain, productionRootDomain());
    if (!parsed.ok) {
      return { success: false as const, error: parsed.error };
    }

    // Host→preview first-match would silently serve the wrong client if two
    // handoffs share one domain (or www↔apex twins) — reject collisions
    // (same lead may re-save). getLeadSlugByCustomDomain resolves aliases.
    if (parsed.host) {
      const ownerSlug = await getLeadSlugByCustomDomain(parsed.host);
      if (ownerSlug && ownerSlug !== slug) {
        return {
          success: false as const,
          error: customDomainAlreadyOwnedMessage(parsed.host, ownerSlug),
        };
      }
    }

    let handoff;
    try {
      handoff = await assignCustomDomainAndProvision(slug, parsed.host);
    } catch (error) {
      // Atomic re-check inside the write (updateDeployHandoffCustomDomain)
      // caught a concurrent Save domain that landed between this action's
      // own precheck above and the write — same message as that precheck.
      if (error instanceof CustomDomainConflictError) {
        return {
          success: false as const,
          error: customDomainAlreadyOwnedMessage(parsed.host ?? customDomain, error.ownerSlug),
        };
      }
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
    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`inquiry-status-update:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }
    const parsedId = parseInquiryId(inquiryId);
    if (!parsedId.ok) {
      return {
        success: false as const,
        error:
          parsedId.reason === "too_long"
            ? "Inquiry id is too long"
            : "Inquiry id is required",
      };
    }
    if (status !== "new" && status !== "read" && status !== "replied" && status !== "archived") {
      return { success: false as const, error: "Invalid status" };
    }
    let inquiry;
    try {
      inquiry = await updateClientInquiryStatus(
        parsedId.inquiryId,
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

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`inquiry-reply:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedId = parseInquiryId(inquiryId);
    if (!parsedId.ok) {
      return {
        success: false as const,
        error:
          parsedId.reason === "too_long"
            ? "Inquiry id is too long"
            : "Inquiry id is required",
      };
    }

    const normalized = normalizeInquiryReply(replyBody);
    if (!normalized.ok) {
      return { success: false as const, error: normalized.error };
    }

    const inquiry = await getClientInquiryById(parsedId.inquiryId);
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
    // see INQUIRY_REPLY_CONVEX_PRIMARY. recordClientInquiryReply also
    // atomically re-checks status !== "archived" (inquiry-reply-archive-race-guard)
    // AND expectedReplySentCount against the row it patches
    // (inquiry-reply-send-race-guard) — the inquiryCanReceiveReply check
    // above and the captured expectedReplySentCount both ran against the
    // same stale read, so null here can mean a concurrent archive, a
    // concurrent duplicate reply send, or a genuinely missing row. Re-fetch
    // to report the accurate current reason instead of guessing, mirroring
    // commerce-order-paid-out-race-message-accuracy's re-fetch-and-branch.
    const expectedReplySentCount = inquiry.replySentCount ?? 0;
    let updated;
    try {
      updated = await recordClientInquiryReply(
        parsedId.inquiryId,
        normalized.body,
        expectedReplySentCount,
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
      const current = await getClientInquiryById(parsedId.inquiryId);
      return {
        success: false as const,
        error:
          !current
            ? "Inquiry not found — it may have been deleted"
            : current.status === "archived"
              ? "Inquiry was archived after this page loaded — refresh and check its status"
              : "This inquiry was already replied to moments ago by a concurrent request — this click may have sent a duplicate reply email.",
      };
    }

    // Reply-To routes a visitor's follow-up (hitting Reply on this email)
    // straight to the business owner's own inbox instead of this app's
    // noreply EMAIL_FROM — the mirror-image of the notify email's Reply-To
    // fix (contact-form-notify-reply-to-visitor), closing the CRM reply loop
    // in both directions. Best-effort: a missing lead/email just omits it,
    // same fallback contact-form notify already uses.
    const lead = await getLeadBySlug(inquiry.leadSlug);
    const sent = await sendInquiryReply({
      to,
      businessName: inquiry.businessName,
      leadSlug: inquiry.leadSlug,
      replyBody: normalized.body,
      originalMessage: inquiry.message,
      inquirerName: inquiry.name,
      replyTo: lead?.email || undefined,
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

    // A move to outreach_sent conditionally sends a real Resend Email 1
    // below (auth alone is not a throttle — see AGENT_PROTOCOL).
    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`lead-stage-update:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

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

    let staged: boolean;
    try {
      staged = await updateLeadStage(slug, stage, LEAD_STAGE_CONVEX_PRIMARY);
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

    if (!staged) {
      // updateLeadStage's write-time re-check ran against the freshly read
      // row and refused because a concurrent Stripe checkout already moved
      // this lead to paid/live between our getLeadBySlug read above and this
      // write — the operator's dropdown snapshot was stale
      // (update-lead-stage-action-paid-live-revert-guard).
      return {
        success: false as const,
        error:
          "Lead was paid or went live after this page loaded — refresh and check its status; the stage was not changed",
      };
    }

    // If stage is changed to outreach_sent OR discovery_call, durably record
    // outreach cadence step 1 BEFORE any send (persist-then-notify) — see
    // OUTREACH_CADENCE_CONVEX_PRIMARY. isFollowUpDue/isColdLead both treat
    // outreach_sent and discovery_call as valid due-queue stages gated on
    // outreachStep >= 1 (src/lib/email/outreach-followups.ts) — a lead moved
    // directly to discovery_call (skipping outreach_sent, a real dropdown
    // transition — see notes.test.ts's discovered->discovery_call case)
    // would stay outreachStep=0 forever and become permanently invisible to
    // both queues (discovery-call-outreach-cadence-gap). recordLeadOutreach
    // is monotonic (never downgrades a lead already at step >= 1, see
    // convex/leads.ts's recordOutreach / sqliteRecordLeadOutreach) and
    // already guards against paid/live/closed, so calling it unconditionally
    // on every discovery_call move is safe — it silently no-ops for leads
    // that already came through outreach_sent.
    if (stage === "outreach_sent" || stage === "discovery_call") {
      if (lead.email) {
        let outreachRecorded: boolean;
        try {
          outreachRecorded = await recordLeadOutreach(
            slug,
            1,
            undefined,
            OUTREACH_CADENCE_CONVEX_PRIMARY,
          );
        } catch (error) {
          if (error instanceof ConvexPrimaryWriteError) {
            return {
              success: false as const,
              error:
                stage === "outreach_sent"
                  ? "Stage saved, but could not record the outreach mark in the shared store — Email 1 was not sent. Retry in a moment."
                  : "Stage saved, but could not record the outreach mark in the shared store. Retry in a moment.",
            };
          }
          throw error;
        }

        // Discovery Call is a manual, already-happened move, not an
        // automated send — the cadence mark above is all it needs. Only
        // outreach_sent triggers a real Email 1.
        if (stage === "outreach_sent") {
          if (!outreachRecorded) {
            // recordLeadOutreach's own paid/live/closed write-time guard fired
            // (defense in depth for the near-zero-width window between our own
            // updateLeadStage write above and this call), OR Email 1 was
            // already recorded by a concurrent call to this same action — a
            // double-click or a second open tab racing this request
            // (outreach-step-duplicate-send-guard) — either way Email 1 is not
            // sent here.
            return {
              success: false as const,
              error:
                "Stage saved, but the lead went paid/live/closed, or Email 1 was already sent by another request, before this could record it — Email 1 was not sent here",
            };
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
    }

    revalidatePath("/dashboard/leads");
    revalidatePath(leadPreviewPath(slug));
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
    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`lead-notes-update:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }
    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

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
    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`lead-snooze:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }
    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

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

    // Re-engage (sendEmail1) conditionally sends a real Resend Email 1
    // below (auth alone is not a throttle — see AGENT_PROTOCOL).
    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`cold-lead-dispose:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;
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

    let applied: boolean;
    try {
      applied = await applyColdLeadDisposition(
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

    if (!applied) {
      // planColdLeadDisposition's paid/live guard above ran against the
      // snapshot read at the top of this action — applyColdLeadDisposition
      // re-checks the same condition atomically at write time and no-ops
      // when a concurrent Stripe checkout already moved this lead to
      // paid/live in between (cold-lead-disposition-paid-live-race-guard).
      return {
        success: false as const,
        error:
          "Lead was paid or went live after this page loaded — refresh and check its status; the cold-lead disposition was not applied",
      };
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
    revalidatePath(leadPreviewPath(slug));
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

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`outreach-follow-up:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

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
    let recorded: boolean;
    try {
      recorded = await recordLeadOutreach(slug, next, undefined, OUTREACH_CADENCE_CONVEX_PRIMARY);
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

    if (!recorded) {
      // The paid/live/closed gate above ran against the snapshot read at the
      // top of this action — recordLeadOutreach re-checks the same
      // condition atomically at write time and skips the patch (and this
      // action skips the Resend send) when a concurrent Stripe checkout or
      // stage change already moved this lead to paid/live/closed in between
      // (sendfollowup-action-paid-live-closed-race-guard), OR when this
      // exact step was already recorded by a concurrent call (a double-click
      // or a second open tab racing this same request — outreach-step-
      // duplicate-send-guard) — either way the follow-up was not sent here.
      return {
        success: false as const,
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

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`checkout-recovery:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSessionId = parseCheckoutSessionId(stripeSessionId);
    if (!parsedSessionId.ok) {
      return {
        success: false as const,
        error:
          parsedSessionId.reason === "too_long"
            ? "Checkout session id is too long"
            : "Checkout session id is required",
      };
    }
    const sessionId = parsedSessionId.sessionId;

    const openSessions = await listOpenCheckoutSessions();
    const session = openSessions.find((s) => s.stripeSessionId === sessionId);
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
    const expectedRecoverySentCount = session.recoverySentCount ?? 0;

    // Durable mark before send (persist-then-notify). requireConvex when
    // configured so Convex-first abandoned queues cannot re-nudge after a
    // SQLite-only recoverySentAt write. expectedRecoverySentCount is this
    // action's own pre-write snapshot — recordCheckoutRecoverySent rejects
    // the write if the row's current count has already moved past it, so a
    // second concurrent call (another tab, a fast double-click) can never
    // both apply (checkout-recovery-send-race-guard).
    let marked: boolean;
    try {
      marked = await recordCheckoutRecoverySent(
        sessionId,
        new Date().toISOString(),
        expectedRecoverySentCount,
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
    if (!marked) {
      // Re-fetch and report the actual current reason instead of assuming a
      // payment race (mirroring commerce-order-paid-out-race-message-accuracy's
      // re-fetch-and-branch): either (a) a concurrent Stripe webhook completed
      // this exact session — a real payment landing — in the window between
      // the listOpenCheckoutSessions() read above and this mark, so the
      // session no longer resolves as open at all; or (b) a concurrent
      // duplicate recovery-send call (another tab, a fast double-click)
      // already recorded its own send moments ago, in which case the session
      // is fine and an email WAS just sent, just not by this call.
      const freshOpen = await listOpenCheckoutSessions();
      const fresh = freshOpen.find((s) => s.stripeSessionId === sessionId);
      if (fresh && (fresh.recoverySentCount ?? 0) > expectedRecoverySentCount) {
        return {
          success: false as const,
          error:
            "A recovery email was already sent for this session moments ago (likely from another tab or a duplicate click) — skipped duplicate send",
        };
      }
      return {
        success: false as const,
        error:
          "Checkout session was completed after this page loaded — refresh; recovery email was not sent",
      };
    }

    const sent = await sendCheckoutAbandonedRecovery(
      to,
      businessName,
      session.leadSlug,
      session.tier,
      expectedRecoverySentCount + 1,
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

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`commerce-checkout-recovery:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSessionId = parseCheckoutSessionId(stripeSessionId);
    if (!parsedSessionId.ok) {
      return {
        success: false as const,
        error:
          parsedSessionId.reason === "too_long"
            ? "Checkout session id is too long"
            : "Checkout session id is required",
      };
    }
    const sessionId = parsedSessionId.sessionId;

    const openSessions = await listOpenCheckoutSessions();
    const session = openSessions.find((s) => s.stripeSessionId === sessionId);
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
    if (!lead) {
      return {
        success: false as const,
        error: "Lead not found for this Buy now session",
      };
    }

    // Twin of Buy now create (#348) + sync + commerce_sku webhook (#350): do
    // not nudge end-customer carts after CRM pause/cancel while entitlement
    // is off (create-path 403s; webhook skips ledger).
    const orders = await listOrdersByLeadSlug(session.leadSlug);
    if (!leadEligibleForCommerceCatalog(lead, orders)) {
      return {
        success: false as const,
        error:
          "Commerce catalogs require a paid/live lead with a Commerce add-on order",
      };
    }

    const catalog = await getCommerceCatalog(session.leadSlug);
    const skuName =
      catalog?.items.find((item) => item.id === session.skuId)?.name ?? session.skuId ?? "item";
    const businessName = lead.businessName || session.leadSlug;
    const expectedRecoverySentCount = session.recoverySentCount ?? 0;

    // expectedRecoverySentCount is this action's own pre-write snapshot —
    // recordCheckoutRecoverySent rejects the write if the row's current
    // count has already moved past it, so a second concurrent call (another
    // tab, a fast double-click) can never both apply
    // (checkout-recovery-send-race-guard).
    let marked: boolean;
    try {
      marked = await recordCheckoutRecoverySent(
        sessionId,
        new Date().toISOString(),
        expectedRecoverySentCount,
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
    if (!marked) {
      // Re-fetch and report the actual current reason instead of assuming a
      // payment race (mirroring commerce-order-paid-out-race-message-accuracy's
      // re-fetch-and-branch): either (a) a concurrent Stripe webhook completed
      // this exact Buy now cart — the shopper actually paying — in the window
      // between listOpenCheckoutSessions above and this mark, so the session
      // no longer resolves as open at all; or (b) a concurrent duplicate
      // recovery-send call (another tab, a fast double-click) already
      // recorded its own send moments ago, in which case the cart is fine
      // and an email WAS just sent, just not by this call.
      const freshOpen = await listOpenCheckoutSessions();
      const fresh = freshOpen.find((s) => s.stripeSessionId === sessionId);
      if (fresh && (fresh.recoverySentCount ?? 0) > expectedRecoverySentCount) {
        return {
          success: false as const,
          error:
            "A recovery email was already sent for this session moments ago (likely from another tab or a duplicate click) — skipped duplicate send",
        };
      }
      return {
        success: false as const,
        error:
          "Checkout session was completed after this page loaded — refresh; recovery email was not sent",
      };
    }

    const sent = await sendCommerceAbandonedRecovery(
      to,
      businessName,
      session.leadSlug,
      skuName,
      expectedRecoverySentCount + 1,
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

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`commerce-order-mark-paid-out:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSessionId = parseCheckoutSessionId(stripeSessionId);
    if (!parsedSessionId.ok) {
      return {
        success: false as const,
        error:
          parsedSessionId.reason === "too_long"
            ? "Checkout session id is too long"
            : "Checkout session id is required",
      };
    }
    const sessionId = parsedSessionId.sessionId;

    const order = await getCommerceOrderByStripeSessionId(sessionId);
    if (!order) {
      return { success: false as const, error: "Commerce order not found" };
    }
    if (order.paidOutAt) {
      return { success: false as const, error: "Order is already marked paid out" };
    }
    if (order.refundedAt) {
      // Stripe already returned this money to the shopper — paying the
      // client out now would be a real out-of-pocket loss with no recovery
      // path until Stripe Connect ships (commerce-order-refund-clawback-tracking).
      return {
        success: false as const,
        error: "Order was refunded to the customer — nothing is owed to the client",
      };
    }
    if (order.disputedAt) {
      // Stripe already withdrew this money pending dispute review — same
      // payout-safety exposure as a refund (commerce-order-dispute-clawback-tracking).
      return {
        success: false as const,
        error: "Order is disputed with Stripe — nothing is owed to the client",
      };
    }

    const paidOutAt = new Date().toISOString();
    let applied: boolean;
    try {
      applied = await markCommerceOrderPaidOut(
        sessionId,
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
    if (!applied) {
      // The refunded/disputed/already-paid-out check above ran against a
      // snapshot read; markCommerceOrderPaidOut re-verifies all three fields
      // atomically with the write and found one had changed underneath us.
      // That's not always a refund/dispute webhook — a concurrent duplicate
      // Mark paid out click (two dashboard tabs open, or a click landing
      // before the button's isPending-disabled state takes effect) fails
      // this same guard once the other call's write lands first, and in
      // that case the order is genuinely fine: it WAS paid out, just by the
      // other call. Re-fetch and report the actual current reason instead
      // of assuming refund/dispute (commerce-order-paid-out-race-message-accuracy).
      const current = await getCommerceOrderByStripeSessionId(sessionId);
      if (current?.paidOutAt) {
        return {
          success: false as const,
          error:
            "This order was already marked paid out (likely from another tab or a duplicate click) — no action needed",
        };
      }
      if (current?.refundedAt) {
        return {
          success: false as const,
          error: "Order was refunded to the customer — nothing is owed to the client",
        };
      }
      if (current?.disputedAt) {
        return {
          success: false as const,
          error: "Order is disputed with Stripe — nothing is owed to the client",
        };
      }
      return {
        success: false as const,
        error:
          "Order was refunded or disputed after this page loaded — refresh and check its status; nothing was paid out",
      };
    }
    return { success: true as const, paidOutAt };
  } catch (error) {
    console.error("Error in markCommerceOrderPaidOutAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Operator manually resends a Commerce Buy now client-receipt notification —
 * the row-level remedy for listCommerceOrdersMissingClientReceipt (a
 * permanently-bad lead email or a Resend outage past Stripe's webhook retry
 * window otherwise leaves the sold order-notification promise unfulfilled
 * with no way for the operator to identify or act on which order is stuck;
 * see commerce-buy-now-client-receipt-manual-resend).
 */
export async function resendCommerceClientReceiptAction(stripeSessionId: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`commerce-client-receipt-resend:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSessionId = parseCheckoutSessionId(stripeSessionId);
    if (!parsedSessionId.ok) {
      return {
        success: false as const,
        error:
          parsedSessionId.reason === "too_long"
            ? "Checkout session id is too long"
            : "Checkout session id is required",
      };
    }
    const sessionId = parsedSessionId.sessionId;

    const order = await getCommerceOrderByStripeSessionId(sessionId);
    if (!order) {
      return { success: false as const, error: "Commerce order not found" };
    }
    if (order.clientReceiptEmailSentAt) {
      return {
        success: false as const,
        error: "Client receipt was already sent for this order",
      };
    }

    const lead = await getLeadBySlug(order.leadSlug);
    if (!lead) {
      return { success: false as const, error: "Lead not found for this order" };
    }
    const to = lead.email?.trim();
    if (!to) {
      return {
        success: false as const,
        error: "No email on file for this lead — add one first",
      };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const previewUrl = `${leadPreviewAbsoluteUrl(baseUrl, order.leadSlug)}#catalog`;

    // Reserve the one-shot sent-marker BEFORE sending (mirroring
    // sendMarketingPackToClientAction's reserve-then-send-then-release
    // ordering — see commerce-client-receipt-resend-race-guard-ordering-fix,
    // marketing-voice-pack-client-send-race-guard-ordering-fix). Closes the
    // window where two concurrent resend clicks (a second tab, a
    // double-click before the button's isPending-disabled state applied)
    // both read the order as not-yet-sent and both send a real duplicate
    // receipt email before either reaches a mark-after-send check. A lost
    // reservation (marked === false) or a fail-closed reservation write
    // skips the send entirely — no email goes out on the losing side. The
    // Stripe webhook's own call to markCommerceOrderClientReceiptSent is
    // untouched by this change and stays mark-after-send (see that
    // mutation's own doc comment for why).
    const clientReceiptEmailSentAt = new Date().toISOString();
    let marked: boolean;
    try {
      marked = await markCommerceOrderClientReceiptSent(
        sessionId,
        clientReceiptEmailSentAt,
        COMMERCE_CLIENT_RECEIPT_RESEND_CONVEX_PRIMARY,
      );
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not reserve the client receipt sent-marker in the shared store — email was not sent. Retry in a moment.",
        };
      }
      throw error;
    }
    if (!marked) {
      return {
        success: false as const,
        error:
          "Client receipt was already marked sent by a concurrent request (e.g. a webhook redelivery) — skipped duplicate send.",
      };
    }

    const sent = await sendCommerceBuyNowClientReceipt({
      to,
      businessName: lead.businessName || order.leadSlug,
      slug: order.leadSlug,
      skuName: order.skuName,
      amountTotalUsd: order.amountPaidUsd,
      stripeSessionId: order.stripeSessionId,
      previewUrl,
      quantity: order.quantity,
      customerEmail: order.customerEmail,
    });
    if (!sent.success) {
      // Release the reservation so the order correctly reappears as
      // not-yet-sent (listCommerceOrdersMissingClientReceipt /
      // pipeline-health / digest) and a retry click isn't blocked by the
      // one-shot gate this marker enforces. Best-effort at the call site,
      // mirroring sendMarketingPackToClientAction's release step.
      try {
        await clearCommerceOrderClientReceiptSent(sessionId, clientReceiptEmailSentAt);
      } catch (clearError) {
        console.error(
          `Failed to release commerce order client receipt sent-to-client reservation for ${sessionId} after a failed send:`,
          clearError,
        );
      }
      return {
        success: false as const,
        error:
          "reason" in sent && sent.reason === "suppressed"
            ? "Email is on the suppression list"
            : "error" in sent && typeof sent.error === "string"
              ? sent.error
              : "Failed to send client receipt email",
      };
    }

    revalidatePath("/dashboard/leads");
    return {
      success: true as const,
      clientReceiptEmailSentAt,
      mock: "mock" in sent ? Boolean(sent.mock) : false,
    };
  } catch (error) {
    console.error("Error in resendCommerceClientReceiptAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Operator manually resends a bundle (Starter/Growth/Complete/Commerce-addon)
 * buyer's still-missing receipt and/or DNS go-live email — the row-level
 * remedy for isBundleHandoffMissingBuyerEmail, mirroring
 * resendCommerceClientReceiptAction (bundle-dns-handoff-email-manual-resend,
 * closing the "extract the DNS email into a reusable helper" follow-up PR
 * #765/bundle-order-missing-buyer-email-visibility deliberately deferred).
 * Sends only whichever half still lacks its durable sent-marker note — a
 * second click after a partial failure only retries the outstanding half,
 * since the marker for any half that already succeeded was already written.
 *
 * Reserves each wanted marker BEFORE sending via reserveBundleBuyerEmailNotes
 * (see bundle-buyer-email-resend-race-guard-ordering-fix) — this function
 * previously only detected a lost race AFTER both sends completed, which
 * could report a duplicate-send warning but could never actually prevent the
 * real duplicate email that had already gone out by then (the same
 * mark-after-send anti-pattern already fixed on every sibling send guard:
 * starter-upsell-stripe-connect-send-race-guard-ordering-fix,
 * marketing-voice-pack-client-send-race-guard-ordering-fix,
 * commerce-client-receipt-resend-race-guard-ordering-fix). A concurrent
 * invocation (a second open dashboard tab, or a double-click before the
 * button's isPending-disabled state applies) now sees its wanted marker(s)
 * already reserved and is told not to send, instead of both calls sending a
 * real duplicate email to the paying buyer before either persists a marker.
 * A reserved send that then fails releases its own marker via
 * releaseBundleBuyerEmailNotes so it correctly reappears as not-yet-sent for
 * a retry.
 */
export async function resendBundleBuyerEmailAction(leadSlug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`bundle-buyer-email-resend:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(leadSlug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error: parsedSlug.reason === "too_long" ? "Slug is too long" : "Slug is required",
      };
    }
    const slug = parsedSlug.slug;

    const handoff = await getDeployHandoffBySlug(slug);
    if (!handoff) {
      return { success: false as const, error: "No deploy handoff found for this lead" };
    }
    const to = handoff.customerEmail.trim();
    if (!to) {
      return { success: false as const, error: "No buyer email on file for this handoff" };
    }

    const needsReceipt = !hasBundleReceiptEmailNote(handoff.notes, handoff.stripeSessionId);
    const needsDns = !hasBundleDnsHandoffEmailNote(handoff.notes, handoff.stripeSessionId);
    if (!needsReceipt && !needsDns) {
      return {
        success: false as const,
        error: "Both buyer emails were already sent for this handoff",
      };
    }

    let reservation;
    try {
      reservation = await reserveBundleBuyerEmailNotes(
        slug,
        handoff.stripeSessionId,
        needsReceipt,
        needsDns,
        DEPLOY_HANDOFF_CONVEX_PRIMARY,
      );
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not reserve the sent-marker(s) in the shared store — no email was sent. Retry in a moment.",
        };
      }
      throw error;
    }
    if (!reservation) {
      return { success: false as const, error: "No deploy handoff found for this lead" };
    }
    const { reservedReceipt, reservedDns } = reservation;

    if (!reservedReceipt && !reservedDns) {
      return {
        success: false as const,
        error:
          "Both buyer emails were already sent (or reserved) by a concurrent request — skipped duplicate send.",
        handoff: reservation.handoff,
      };
    }

    let sentReceipt = false;
    let sentDns = false;

    if (reservedReceipt) {
      const order = await getOrderByStripeSessionId(handoff.stripeSessionId);
      const sent = await sendReceiptEmail(
        to,
        handoff.businessName,
        handoff.tier,
        order?.amountPaid ?? 0,
      );
      if (sent.success) {
        sentReceipt = true;
      } else {
        try {
          await releaseBundleBuyerEmailNotes(slug, handoff.stripeSessionId, true, false);
        } catch (releaseError) {
          console.error(
            `Failed to release bundle buyer receipt reservation for ${slug} after a failed send:`,
            releaseError,
          );
        }
      }
    }

    if (reservedDns) {
      const sent = await sendBundleDnsHandoffEmail({
        to,
        businessName: handoff.businessName,
        slug,
        handoff,
      });
      if (sent.success) {
        sentDns = true;
      } else {
        try {
          await releaseBundleBuyerEmailNotes(slug, handoff.stripeSessionId, false, true);
        } catch (releaseError) {
          console.error(
            `Failed to release bundle buyer DNS-handoff reservation for ${slug} after a failed send:`,
            releaseError,
          );
        }
      }
    }

    revalidatePath("/dashboard/leads");

    const raceLostLabels = [
      needsReceipt && !reservedReceipt && "receipt",
      needsDns && !reservedDns && "DNS handoff",
    ].filter((label): label is string => Boolean(label));
    const sentLabels = [sentReceipt && "receipt", sentDns && "DNS handoff"].filter(
      (label): label is string => Boolean(label),
    );
    const sendFailedLabels = [
      reservedReceipt && !sentReceipt && "receipt",
      reservedDns && !sentDns && "DNS handoff",
    ].filter((label): label is string => Boolean(label));

    if (sentLabels.length === 0) {
      return {
        success: false as const,
        error:
          sendFailedLabels.length > 0
            ? "Failed to send the buyer email(s) — check Resend delivery status and try again"
            : `The ${raceLostLabels.join(" and ")} email was already sent (or reserved) by a concurrent request — this click sent nothing.`,
        handoff: reservation.handoff,
      };
    }

    if (sendFailedLabels.length > 0 || raceLostLabels.length > 0) {
      const causeLabel =
        sendFailedLabels.length > 0 ? sendFailedLabels.join(" and ") : raceLostLabels.join(" and ");
      const causeReason =
        sendFailedLabels.length > 0
          ? "failed to send — click Resend again to retry just that one"
          : "was already sent (or reserved) by a concurrent request";
      return {
        success: false as const,
        error: `Sent the ${sentLabels.join(" and ")} email, but the ${causeLabel} ${causeReason}.`,
        handoff: reservation.handoff,
      };
    }

    return { success: true as const, handoff: reservation.handoff };
  } catch (error) {
    console.error("Error in resendBundleBuyerEmailAction:", error);
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

    // Adding directly in outreach_sent stage conditionally sends a real
    // Resend Email 1 below (auth alone is not a throttle — see AGENT_PROTOCOL).
    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`lead-add:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const stage = leadData.stage ?? "discovered";

    // Simple validation
    if (!leadData.slug || !leadData.businessName) {
      throw new Error("Slug and Business Name are required");
    }

    // Shared create-path field caps (same MAX_* as CSV) so manual Add lead
    // cannot push unbounded strings into public preview / JSON-LD / outreach.
    const capped = normalizeLeadCreateFields({
      businessName: leadData.businessName,
      city: leadData.city,
      state: leadData.state,
      address: leadData.address,
      phone: leadData.phone,
      email: leadData.email,
      tagline: leadData.tagline,
      description: leadData.description,
      services: leadData.services,
      hours: leadData.hours,
      category: leadData.category,
    });
    if (!capped.ok) {
      return { success: false as const, error: capped.error };
    }

    const lead: Lead = {
      ...leadData,
      ...capped.fields,
      stage,
      // Soft-cap compliance tag (same MAX as CSV import) — not an opaque key.
      dataSource: normalizeLeadDataSource(leadData.dataSource, "manual_entry"),
    };

    // Shared create-path sanitize — strip edge dashes so CRM slug matches
    // leadSlugAsDnsLabel / preview-subdomain Host lookup (see sanitizeLeadSlug).
    lead.slug = sanitizeLeadSlug(lead.slug);
    if (!lead.slug) {
      throw new Error("Slug must contain at least one letter or number");
    }

    // Create-path only: never clobber an advanced lead via upsertLead on a slug typo/collision.
    const existing = await getLeadBySlug(lead.slug);
    if (existing) {
      return { success: false as const, error: existingLeadSlugConflictMessage(lead.slug) };
    }

    try {
      const created = await upsertLead(lead, LEAD_UPSERT_CONVEX_PRIMARY);
      if (!created) {
        // Defense in depth for the near-zero-width window between the
        // existence check above and this write (a concurrent create/import
        // for the same slug landing in between) — see
        // lead-upsert-create-only-race-guard.
        return { success: false as const, error: existingLeadSlugConflictMessage(lead.slug) };
      }
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

    // If added directly in outreach_sent OR discovery_call stage, durably
    // record outreach cadence step 1 BEFORE any send (persist-then-notify) —
    // see OUTREACH_CADENCE_CONVEX_PRIMARY. isFollowUpDue/isColdLead both
    // treat outreach_sent and discovery_call as valid due-queue stages gated
    // on outreachStep >= 1 (src/lib/email/outreach-followups.ts); the "Add
    // Lead" form's Pipeline Stage dropdown offers discovery_call directly
    // (same STAGES list as the dashboard stage-move dropdown), so a lead
    // created straight into discovery_call needs the same mark
    // updateLeadStageAction/importLeadsCsvAction already record, or it stays
    // outreachStep=0 forever and is permanently invisible to Follow-ups due
    // / Cold leads (add-lead-discovery-call-outreach-cadence-gap).
    if ((stage === "outreach_sent" || stage === "discovery_call") && lead.email) {
      try {
        await recordLeadOutreach(lead.slug, 1, undefined, OUTREACH_CADENCE_CONVEX_PRIMARY);
      } catch (error) {
        if (error instanceof ConvexPrimaryWriteError) {
          return {
            success: false as const,
            error:
              stage === "outreach_sent"
                ? "Lead saved, but could not record the outreach mark in the shared store — Email 1 was not sent. Retry Email 1 from the dashboard in a moment."
                : "Lead saved, but could not record the outreach mark in the shared store. Retry in a moment.",
            slug: lead.slug,
          };
        }
        throw error;
      }

      // Discovery Call is a manual, already-happened move, not an automated
      // send — the cadence mark above is all it needs. Only outreach_sent
      // triggers a real Email 1.
      if (stage === "outreach_sent") {
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
    }

    revalidatePath("/dashboard/leads");
    revalidatePath(leadPreviewPath(lead.slug));
    return { success: true as const, slug: lead.slug };
  } catch (error) {
    console.error("Error in addLeadAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Local return-type annotation only — "use server" files must export async
// functions, not `export type` aliases (see use-server-export-type-cleanup).
type ImportLeadsCsvResult =
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

    // A single call can drive up to MAX_CSV_IMPORT_ROWS sequential
    // upsertLead writes below — the same "loop of DB/API calls needs its own
    // throttle" pattern as syncCommerceCatalogToStripeAction /
    // archiveOrphanCommerceStripeProductsAction / scheduleMarketingPackToBufferAction,
    // and auth alone is not a throttle when OPERATOR_DASHBOARD_PASSWORD is
    // unset (see AGENT_PROTOCOL). This was the one loop-heavy dashboard
    // action in this file missing it (csv-import-action-rate-limit).
    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`csv-import:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    // Hard-reject over-long CSV payloads before splitCsvIntoLines / upsert —
    // auth is not a payload-size throttle; soft-cap would truncate mid-row.
    const parsedText = parseCsvImportText(input.csvText);
    if (!parsedText.ok) {
      return {
        success: false as const,
        error:
          parsedText.reason === "too_long"
            ? `CSV text is too long (over ${MAX_CSV_IMPORT_TEXT_LENGTH.toLocaleString("en-US")} characters) — split it into smaller batches (fewer rows, or shorter services lists) and import each separately.`
            : "CSV text is empty",
      };
    }

    const parsed = parseLeadsCsv(parsedText.csvText, {
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

    // Map each parsed lead's slug back to its original 1-based CSV data row.
    // Slugs are guaranteed unique within one parse batch (parseLeadsCsv's
    // seenSlugs auto-suffixes any in-batch duplicate), so this lookup is safe
    // across the fresh/collisions partition below. Without it, a row-error's
    // `row` number was reconstructed from `fresh`'s own array position
    // (fresh.entries()'s index) or hardcoded to 0 for collisions — both wrong
    // as soon as ANY earlier CSV row was invalid/dropped-by-parse or was
    // itself a collision, since every later row's position in `leads`/`fresh`
    // shifts left of its real CSV line the moment a row ahead of it is
    // filtered out. See csv-import-row-number-mislabel-after-drop.
    const rowBySlug = new Map(
      parsed.leads.map((lead, i) => [lead.slug, parsed.leadRows[i] ?? 0]),
    );

    const importedSlugs: string[] = [];
    const upsertErrors: Array<{ row: number; message: string }> = [...parsed.errors];
    for (const lead of collisions) {
      upsertErrors.push({
        row: rowBySlug.get(lead.slug) ?? 0,
        message: existingLeadSlugConflictMessage(lead.slug),
      });
    }

    for (const lead of fresh) {
      const row = rowBySlug.get(lead.slug) ?? 0;
      try {
        const created = await upsertLead(lead, LEAD_UPSERT_CONVEX_PRIMARY);
        if (!created) {
          // The one-time existingSlugs snapshot above went stale during this
          // sequential loop — a concurrent create/payment/import for this
          // slug landed between that snapshot and this row's turn. Report it
          // as a collision rather than silently skipping (see
          // lead-upsert-create-only-race-guard) — never resurface a false
          // "imported" for a row that was actually refused.
          upsertErrors.push({
            row,
            message: existingLeadSlugConflictMessage(lead.slug),
          });
          continue;
        }
        importedSlugs.push(lead.slug);
        // Prevent later rows in the same batch from colliding with earlier inserts.
        existingSlugs.add(lead.slug);
        revalidatePath(leadPreviewPath(lead.slug));

        // A row imported directly into outreach_sent OR discovery_call must
        // record cadence step 1 the same way addLeadAction/
        // updateLeadStageAction do — every other path into either stage
        // does, and isFollowUpDue/isColdLead both require outreachStep >= 1
        // before a lead can ever be surfaced (both stages are valid due-queue
        // stages, see src/lib/email/outreach-followups.ts), so a row that
        // skips this is permanently invisible to the follow-up-due and
        // cold-lead queues with no operator-visible signal anything is wrong
        // (see csv-import-outreach-sent-cadence-gap and its discovery_call
        // twin, discovery-call-outreach-cadence-gap). Deliberately does NOT
        // call sendOutreachEmail here unlike the single-lead outreach_sent
        // path: bulk CSV import is for recording outreach already sent
        // through another channel, not a request to mass-email up to
        // MAX_ROWS businesses in one click.
        if (
          (lead.stage === "outreach_sent" || lead.stage === "discovery_call") &&
          lead.email
        ) {
          try {
            await recordLeadOutreach(lead.slug, 1, undefined, OUTREACH_CADENCE_CONVEX_PRIMARY);
          } catch (error) {
            upsertErrors.push({
              row,
              message:
                error instanceof ConvexPrimaryWriteError
                  ? "Lead saved, but could not record the outreach mark in the shared store — retry marking the stage again from the dashboard."
                  : "Lead saved, but the outreach mark failed to record — retry marking the stage again from the dashboard.",
            });
          }
        }
      } catch (error) {
        upsertErrors.push({
          row,
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

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`starter-upsell:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    const ordersForLead = await listOrdersByLeadSlug(lead.slug);
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

    // Durable mark before send (persist-then-notify, mirroring
    // checkout-recovery-send-race-guard) — a concurrency guard only, not a
    // one-shot "already sent" gate (see starter-upsell-persist.ts): a
    // Starter upsell nudge has no monthly regenerate step to reset
    // eligibility, so an operator may legitimately re-send it to a still
    // Starter-only lead weeks later. expectedStarterUpsellSentCount is this
    // action's own pre-write snapshot — recordStarterUpsellSent rejects the
    // write (and this call skips the send entirely) if the row's current
    // count has already moved past it, so a second concurrent call (another
    // tab, a fast double-click) can never both send the real email
    // (starter-upsell-send-race-guard — previously mark-after-send, which
    // let both concurrent calls send before either could detect the other).
    const sentAt = new Date().toISOString();
    const expectedStarterUpsellSentCount = lead.starterUpsellSentCount ?? 0;
    let marked: boolean;
    try {
      marked = await recordStarterUpsellSent(
        lead.slug,
        sentAt,
        expectedStarterUpsellSentCount,
        STARTER_UPSELL_SENT_CONVEX_PRIMARY,
      );
    } catch (markError) {
      if (markError instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not record Starter upsell send in the shared store — email was not sent. Retry in a moment.",
        };
      }
      throw markError;
    }
    if (!marked) {
      return {
        success: false as const,
        error:
          "Starter upsell was already sent moments ago by a concurrent request — skipped duplicate send",
      };
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
            ? "Email is on the suppression list (sent-marker was recorded — click Send Starter upsell again to retry)"
            : "error" in sent && typeof sent.error === "string"
              ? `${sent.error} (sent-marker was recorded — click Send Starter upsell again to retry)`
              : "Failed to send upsell email (sent-marker was recorded — click Send Starter upsell again to retry)",
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
 * Operator-triggered Complete upsell email for paid Growth leads (no
 * Complete order yet) — the second upgrade step, mirroring
 * sendStarterUpsellAction's mark-before-send race guard and error shape.
 * See /docs/process (growth-upsell-nudge).
 */
export async function sendGrowthUpsellAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`growth-upsell:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    const ordersForLead = await listOrdersByLeadSlug(lead.slug);
    if (
      !leadEligibleForGrowthUpsell({
        stage: lead.stage,
        email: lead.email,
        ordersForLead,
      })
    ) {
      return {
        success: false as const,
        error:
          "Upsell only applies to paid/live Growth leads with email and no Complete order yet",
      };
    }

    const email = lead.email!.trim();
    const bundle = getBundle("complete");
    if (!bundle?.monthlyPriceUsd) {
      return { success: false as const, error: "Complete tier is missing monthly pricing" };
    }

    // Durable mark before send (persist-then-notify) — see
    // sendStarterUpsellAction's identical comment for the full race-guard
    // reasoning (growth-upsell-send-race-guard mirrors
    // starter-upsell-send-race-guard exactly: a concurrency guard only, not
    // a one-shot "already sent" gate, since a later, deliberate resend to a
    // still Growth-only lead must succeed).
    const sentAt = new Date().toISOString();
    const expectedGrowthUpsellSentCount = lead.growthUpsellSentCount ?? 0;
    let marked: boolean;
    try {
      marked = await recordGrowthUpsellSent(
        lead.slug,
        sentAt,
        expectedGrowthUpsellSentCount,
        GROWTH_UPSELL_SENT_CONVEX_PRIMARY,
      );
    } catch (markError) {
      if (markError instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not record Growth upsell send in the shared store — email was not sent. Retry in a moment.",
        };
      }
      throw markError;
    }
    if (!marked) {
      return {
        success: false as const,
        error:
          "Growth upsell was already sent moments ago by a concurrent request — skipped duplicate send",
      };
    }

    const sent = await sendGrowthUpsellEmail({
      to: email,
      businessName: lead.businessName,
      slug: lead.slug,
      monthlyPriceUsd: bundle.monthlyPriceUsd,
    });
    if (!sent.success) {
      return {
        success: false as const,
        error:
          "reason" in sent && sent.reason === "suppressed"
            ? "Email is on the suppression list (sent-marker was recorded — click Send Complete upsell again to retry)"
            : "error" in sent && typeof sent.error === "string"
              ? `${sent.error} (sent-marker was recorded — click Send Complete upsell again to retry)`
              : "Failed to send upsell email (sent-marker was recorded — click Send Complete upsell again to retry)",
      };
    }

    revalidatePath("/dashboard/leads");
    return {
      success: true as const,
      mock: "mock" in sent ? Boolean(sent.mock) : false,
    };
  } catch (error) {
    console.error("Error in sendGrowthUpsellAction:", error);
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

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`dashboard-billing-portal:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

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
 * — see /docs/process. This manual button and the automated daily
 * GET /api/cron/daily-digest (Vercel Cron) trigger both delegate to the same
 * sendOperatorDigestEmail helper (src/lib/digest/send-operator-digest.ts) so
 * they can never build the digest from different ledger reads.
 */
export async function sendDailyDigestAction() {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }

    // Builds the digest from a dozen full-ledger reads plus a real Resend
    // send — auth alone is not a throttle (see AGENT_PROTOCOL).
    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`daily-digest:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const digestEmail = process.env.OPERATOR_DIGEST_EMAIL?.trim();
    if (!digestEmail) {
      return {
        success: false as const,
        error: "Set OPERATOR_DIGEST_EMAIL in your environment to enable the daily digest.",
      };
    }

    const headerStore = await headers();
    const appUrl = resolveTrustedAppUrl(headerStore, process.env.NEXT_PUBLIC_APP_URL);

    const result = await sendOperatorDigestEmail(digestEmail, appUrl);
    if (!result.success) {
      return { success: false as const, error: result.error };
    }

    return {
      success: true as const,
      digest: result.digest,
      mock: result.mock,
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
    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`marketing-pack-generate:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }
    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    const orders = await listOrdersByLeadSlug(slug);
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
 * Ad-hoc seasonal promo + A/B ad-copy generation — fulfills the Complete
 * tier's sold "Full marketing — seasonal promos, A/B variants" bullet
 * (src/lib/pricing/bundles.ts), which had no dashboard fulfillment path at
 * all until this action shipped (see /docs/marketing-automation). Unlike
 * generateMarketingPackAction, this is intentionally NOT persisted — no DB
 * row, no monthly cadence — the operator copies the result to post/paste
 * themselves. Growth-tier leads are not eligible (leadEligibleForSeasonalPromo).
 */
export async function generateSeasonalPromoAction(slug: string, occasion?: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }
    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`seasonal-promo-generate:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }
    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    const orders = await listOrdersByLeadSlug(slug);
    if (!leadEligibleForSeasonalPromo(lead, orders)) {
      return {
        success: false as const,
        error:
          "Seasonal promo generation requires a paid/live lead with an active Complete order",
      };
    }

    const request = seasonalPromoRequestForLead(lead, occasion, Date.now());
    const generator = getMarketingGenerator();
    const result = await generator.generate(request);
    const usedAnthropic =
      Boolean(process.env.ANTHROPIC_API_KEY?.trim()) &&
      !result.variants.some((v) => v.body.startsWith("[Stub"));

    return {
      success: true as const,
      variants: result.variants,
      generatedAt: result.generatedAt,
      generator: usedAnthropic ? ("anthropic" as const) : ("stub" as const),
    };
  } catch (error) {
    console.error("Error in generateSeasonalPromoAction:", error);
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

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`marketing-pack-send:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    const orders = await listOrdersByLeadSlug(lead.slug);
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

    // Reserve the one-shot sent-marker BEFORE sending (mirroring
    // recordCheckoutRecoverySent's persist-then-notify placement) — closes
    // the window where two concurrent requests (a second tab, a double-click
    // before the button's isPending-disabled state applied) both read the
    // pack as not-yet-sent and both send a real duplicate email before
    // either reaches a mark-after-send check (see
    // marketing-voice-pack-client-send-race-guard-ordering-fix, the same fix
    // already applied to sendStarterUpsellAction /
    // sendStripeConnectOnboardingLinkToClientAction). Passing pack.generatedAt
    // as the expected version additionally closes a second, distinct race: a
    // concurrent Regenerate between the `pack` read above and this reservation
    // clears sentToClientAt and swaps in new variants, and without this check
    // the reservation would succeed against the NEW row while the send below
    // still emails the STALE `pack.variants` captured earlier (see
    // marketing-voice-pack-send-stale-content-race-guard). A lost reservation
    // (marked === false) or a fail-closed reservation write skips the send
    // entirely — no email goes out on the losing side.
    const sentToClientAt = new Date().toISOString();
    let marked: boolean;
    try {
      marked = await markMarketingPackSentToClient(
        lead.slug,
        pack.yearMonth,
        pack.generatedAt,
        sentToClientAt,
        MARKETING_PACK_CONVEX_PRIMARY,
      );
    } catch (markError) {
      if (markError instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not reserve the marketing pack sent-to-client marker in the shared store — email was not sent. Retry in a moment.",
        };
      }
      throw markError;
    }
    if (!marked) {
      // Re-fetch to tell a genuine duplicate-send race (same pack version,
      // already sent) apart from a version mismatch (the pack was
      // regenerated between the read above and this reservation) — the two
      // need different operator guidance, and in both cases no email was
      // sent by this call.
      const current = await getMarketingPack(lead.slug, pack.yearMonth);
      return {
        success: false as const,
        error:
          current && current.generatedAt !== pack.generatedAt
            ? "Marketing pack was regenerated while this send was in flight — refresh and resend to deliver the current version."
            : "Marketing pack was already marked sent by a concurrent request — skipped duplicate send.",
      };
    }

    const sent = await sendMarketingPackToClientEmail({
      to: email,
      businessName: lead.businessName,
      slug: lead.slug,
      yearMonth: pack.yearMonth,
      variants: pack.variants,
      previewUrl,
    });
    if (!sent.success) {
      // Release the reservation so the pack correctly reappears as
      // not-yet-sent (listMarketingPacksMissingClientSend / pipeline-health /
      // digest) and a retry click isn't blocked by the one-shot gate this
      // marker enforces. Unlike the reservation write above, this release is
      // best-effort at the call site: on the rare double-failure where the
      // release itself also fails, the marker stays stuck showing "sent" —
      // regenerating the pack (which always clears sentToClientAt) is the
      // documented manual recovery.
      try {
        await clearMarketingPackSentToClient(lead.slug, pack.yearMonth, sentToClientAt);
      } catch (clearError) {
        console.error(
          `Failed to release marketing pack sent-to-client reservation for ${lead.slug} after a failed send:`,
          clearError,
        );
      }
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
      sentToClientAt,
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
    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`commerce-catalog-save:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }
    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    const orders = await listOrdersByLeadSlug(slug);
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
    revalidatePath(leadPreviewPath(lead.slug));
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

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`commerce-catalog-get:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;
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

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`commerce-catalog-sync:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

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

    // Twin of saveCommerceCatalogAction + Buy now create-path: do not mint /
    // refresh Stripe Prices after CRM pause/cancel while entitlement is off.
    const orders = await listOrdersByLeadSlug(slug);
    if (!leadEligibleForCommerceCatalog(lead, orders)) {
      return {
        success: false as const,
        error:
          "Commerce catalogs require a paid/live lead with a Commerce add-on order",
      };
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
    revalidatePath(leadPreviewPath(lead.slug));
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

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`commerce-orphan-archive:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

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
    // right before archiving EACH candidate (not just once before the whole
    // batch) and drop any whose skuId has reappeared by its turn, so a
    // concurrent saveCommerceCatalogAction that re-adds/renames a SKU into
    // the same id — whether before the archive loop starts or between two
    // other candidates' turns within it — never gets its live Stripe Product
    // archived out from under it (buffer-schedule-stale-pack-variant-guard
    // fixed the identical per-iteration-not-just-once-per-loop bug shape).
    const candidates = await listOrphanCommerceStripeProducts(stripe, lead.slug, items);
    const { archived } = await archiveCommerceStripeProducts(stripe, candidates, {
      isStillOrphan: async (orphan) => {
        const freshCatalog = await getCommerceCatalog(slug);
        const freshSkuIds = new Set((freshCatalog?.items ?? []).map((item) => item.id));
        return !freshSkuIds.has(orphan.skuId);
      },
    });

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
 * Create (or find, if already created) a Stripe Connect Express account for
 * a lead's local business — commerce-payouts-stripe-connect tier-6
 * empty-backlog scaffold. ACCOUNT CREATION ONLY: no money-movement, no
 * transfer/payout wiring reads the resulting accountId yet. Dormant behind
 * ALLOW_STRIPE_CONNECT_ONBOARDING (default off) — see stripe-connect-gate.ts.
 * The actual payout path still requires a future, counsel-reviewed iteration.
 */
export async function createStripeConnectAccountAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`commerce-connect-account-create:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long" ? "Slug is too long" : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

    const gate = assessStripeConnectOnboardingGate();
    if (!gate.ok) {
      return { success: false as const, error: gate.message };
    }

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    if (lead.stripeConnectAccountId) {
      return {
        success: true as const,
        accountId: lead.stripeConnectAccountId,
        created: false,
      };
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      // assessStripeConnectOnboardingGate already checked; belt-and-suspenders for tsc.
      return {
        success: false as const,
        error: "Set STRIPE_SECRET_KEY before creating Connect accounts.",
      };
    }

    const stripe = new Stripe(secretKey);
    const { accountId, created } = await createExpressConnectAccount(stripe, {
      leadSlug: lead.slug,
      email: lead.email,
      businessName: lead.businessName,
    });

    try {
      await updateLeadStripeConnectAccountId(
        slug,
        accountId,
        LEAD_STRIPE_CONNECT_CONVEX_PRIMARY,
        new Date().toISOString(),
      );
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Connect account created on Stripe but could not be saved in the shared store — retry (idempotent; the same account will be reused).",
        };
      }
      throw error;
    }

    revalidatePath("/dashboard/leads");
    return { success: true as const, accountId, created };
  } catch (error) {
    console.error("Error in createStripeConnectAccountAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown Stripe error",
    };
  }
}

/**
 * Generate a Stripe-hosted Connect Express onboarding link for a lead's
 * already-created Connect account. Operator sends the URL to the client, who
 * completes their own KYC/bank details on Stripe's hosted flow. Dormant
 * behind ALLOW_STRIPE_CONNECT_ONBOARDING, same gate as account creation.
 */
export async function createStripeConnectOnboardingLinkAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`commerce-connect-onboarding-link:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long" ? "Slug is too long" : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

    const gate = assessStripeConnectOnboardingGate();
    if (!gate.ok) {
      return { success: false as const, error: gate.message };
    }

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }
    if (!lead.stripeConnectAccountId) {
      return {
        success: false as const,
        error: "Create a Connect account for this lead first",
      };
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return {
        success: false as const,
        error: "Set STRIPE_SECRET_KEY before generating an onboarding link.",
      };
    }

    // Same never-trust-request-Host precedent as billing-portal/checkout
    // redirects — a server action has no request Host to trust anyway.
    const appUrl = resolveStripeRedirectAppUrl();
    const stripe = new Stripe(secretKey);
    // refresh_url/return_url must be a page the CLIENT can actually reach —
    // this link is routinely handed off (pasted or emailed) to the external
    // local business completing Stripe's own hosted KYC flow, never opened
    // only in the operator's own browser. /dashboard/leads is operator-auth
    // gated (proxy.ts's dashboardAuthGate): a real client landing there either
    // bounces to /dashboard/login with no confirmation their onboarding was
    // accepted, or — on an open-demo deployment with no password set — loads
    // the operator's internal CRM, leaking every other lead's data to a third
    // party (stripe-connect-onboarding-link-client-facing-redirect). The
    // lead's own public preview page is the correct client-facing landing
    // spot; it has no per-status confirmation state, but it's a real,
    // reachable, single-lead-scoped page instead of a wrong or leaky one.
    const clientFacingUrl = leadPreviewAbsoluteUrl(appUrl, lead.slug);
    const { url } = await createConnectOnboardingLink(stripe, lead.stripeConnectAccountId, {
      refreshUrl: clientFacingUrl,
      returnUrl: clientFacingUrl,
    });

    return { success: true as const, url };
  } catch (error) {
    console.error("Error in createStripeConnectOnboardingLinkAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown Stripe error",
    };
  }
}

/**
 * Generate a fresh Stripe Connect Express onboarding link and email it to
 * the client directly, in the same request — closes the expiry/retry gap in
 * createStripeConnectOnboardingLinkAction's "copy to clipboard, then
 * manually paste into a separate message" flow. Stripe account_onboarding
 * Account Links are single-use and expire quickly if unopened; a manual
 * copy-paste hand-off routinely outlasts that window, handing the client a
 * dead link. Mints a brand-new link on every call (never reuses/caches one)
 * so a re-send after an expired first attempt just works. Dormant behind
 * ALLOW_STRIPE_CONNECT_ONBOARDING, same gate as account creation.
 */
export async function sendStripeConnectOnboardingLinkToClientAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`commerce-connect-onboarding-link-email:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long" ? "Slug is too long" : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

    const gate = assessStripeConnectOnboardingGate();
    if (!gate.ok) {
      return { success: false as const, error: gate.message };
    }

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }
    if (!lead.stripeConnectAccountId) {
      return {
        success: false as const,
        error: "Create a Connect account for this lead first",
      };
    }
    if (!lead.email || !lead.email.trim()) {
      return {
        success: false as const,
        error: "Lead has no email on file to send the onboarding link to",
      };
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return {
        success: false as const,
        error: "Set STRIPE_SECRET_KEY before generating an onboarding link.",
      };
    }

    // Same never-trust-request-Host precedent as billing-portal/checkout
    // redirects — a server action has no request Host to trust anyway.
    const appUrl = resolveStripeRedirectAppUrl();
    const stripe = new Stripe(secretKey);
    // See createStripeConnectOnboardingLinkAction's comment above — this link
    // is emailed directly to the client, so refresh_url/return_url must be
    // their own public preview page, never the operator-auth-gated dashboard
    // (stripe-connect-onboarding-link-client-facing-redirect).
    const clientFacingUrl = leadPreviewAbsoluteUrl(appUrl, lead.slug);
    const { url } = await createConnectOnboardingLink(stripe, lead.stripeConnectAccountId, {
      refreshUrl: clientFacingUrl,
      returnUrl: clientFacingUrl,
    });

    // Durable mark before send (persist-then-notify, mirroring
    // checkout-recovery-send-race-guard) — a concurrency guard only, not a
    // one-shot "already sent" gate (mirrors starter-upsell-send-race-guard):
    // an operator may legitimately re-send a fresh onboarding link after an
    // earlier one expired unused. expectedStripeConnectOnboardingLinkSentCount
    // is this action's own pre-write snapshot — recordStripeConnectOnboardingLinkSent
    // rejects the write (and this call skips the send entirely) if the row's
    // current count has already moved past it, so a second concurrent call
    // (another tab, a fast double-click) can never both send the real email
    // (stripe-connect-onboarding-link-send-race-guard — previously
    // mark-after-send, which let both concurrent calls send before either
    // could detect the other).
    const sentAt = new Date().toISOString();
    const expectedStripeConnectOnboardingLinkSentCount =
      lead.stripeConnectOnboardingLinkSentCount ?? 0;
    let marked: boolean;
    try {
      marked = await recordStripeConnectOnboardingLinkSent(
        lead.slug,
        sentAt,
        expectedStripeConnectOnboardingLinkSentCount,
        STRIPE_CONNECT_ONBOARDING_LINK_SENT_CONVEX_PRIMARY,
      );
    } catch (markError) {
      if (markError instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not record onboarding-link send in the shared store — email was not sent. Retry in a moment.",
        };
      }
      throw markError;
    }
    if (!marked) {
      return {
        success: false as const,
        error:
          "The onboarding link was already sent moments ago by a concurrent request — skipped duplicate send",
      };
    }

    const sent = await sendStripeConnectOnboardingLinkEmail({
      to: lead.email.trim(),
      businessName: lead.businessName,
      slug: lead.slug,
      onboardingUrl: url,
    });
    if (!sent.success) {
      return {
        success: false as const,
        error:
          "error" in sent && typeof sent.error === "string"
            ? `${sent.error} (sent-marker was recorded — click Send onboarding link again to retry)`
            : "Failed to send the onboarding link email (sent-marker was recorded — click Send onboarding link again to retry)",
      };
    }

    return { success: true as const, mock: "mock" in sent ? Boolean(sent.mock) : false };
  } catch (error) {
    console.error("Error in sendStripeConnectOnboardingLinkToClientAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown Stripe error",
    };
  }
}

/**
 * Fetch a lead's live Stripe Connect Express onboarding status
 * (charges_enabled / payouts_enabled / details_submitted). Status-checking
 * only — no persistence, no money-movement. Same gate as account creation.
 */
export async function checkStripeConnectAccountStatusAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`commerce-connect-status-check:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long" ? "Slug is too long" : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

    const gate = assessStripeConnectOnboardingGate();
    if (!gate.ok) {
      return { success: false as const, error: gate.message };
    }

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }
    if (!lead.stripeConnectAccountId) {
      return {
        success: false as const,
        error: "Create a Connect account for this lead first",
      };
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return {
        success: false as const,
        error: "Set STRIPE_SECRET_KEY before checking Connect status.",
      };
    }

    const stripe = new Stripe(secretKey);
    const status = await fetchConnectAccountStatus(stripe, lead.stripeConnectAccountId);

    // Cache for pipeline-health/digest visibility (see
    // stripe-connect-onboarding-pipeline-health-visibility). Passes
    // LEAD_STRIPE_CONNECT_STATUS_CONVEX_PRIMARY so a Convex failure fails
    // closed inside updateLeadStripeConnectStatus (skips the SQLite write
    // rather than split-braining the cache other instances read
    // Convex-first) — but that failure must still not turn this
    // already-successful live check into a reported error, so it's caught
    // and swallowed here same as before.
    try {
      await updateLeadStripeConnectStatus(
        slug,
        status,
        new Date().toISOString(),
        LEAD_STRIPE_CONNECT_STATUS_CONVEX_PRIMARY,
      );
      // Only when the cache write actually landed — pipeline-health's
      // connectOnboardingIncompleteCount MetricCard and the daily digest are
      // both computed server-side from getLeads() on /dashboard/leads, and
      // without this the SSR'd count/oldest-age stayed stale until an
      // unrelated action revalidated the same path or the operator did a
      // hard reload — the same missing-revalidatePath-after-a-persisting-
      // write bug class buffer-schedule-action-revalidate-path just closed
      // for scheduleMarketingPackToBufferAction one session earlier. A
      // failed persist changed nothing in the store, so there is nothing to
      // invalidate on that branch.
      revalidatePath("/dashboard/leads");
    } catch (persistError) {
      console.warn(
        `Failed to persist Stripe Connect status for ${slug}`,
        persistError,
      );
    }

    return { success: true as const, ...status };
  } catch (error) {
    console.error("Error in checkStripeConnectAccountStatusAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown Stripe error",
    };
  }
}

/**
 * List every social profile connected to the operator's own Buffer account
 * (marketing-content-scheduling tier-6 empty-backlog scaffold). Operator-wide,
 * not per-lead — the operator picks which of these apply to a given lead via
 * saveLeadBufferProfilesAction. Dormant behind ALLOW_MARKETING_SCHEDULING
 * (default off) — see buffer-gate.ts.
 */
export async function listBufferProfilesAction() {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`marketing-buffer-profiles-list:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const gate = assessMarketingSchedulingGate();
    if (!gate.ok) {
      return { success: false as const, error: gate.message };
    }

    const profiles = await listBufferProfiles(gate.accessToken);
    return { success: true as const, profiles };
  } catch (error) {
    console.error("Error in listBufferProfilesAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown Buffer error",
    };
  }
}

/**
 * Save which of the operator's Buffer profiles this lead's marketing pack
 * content should auto-post to. Dormant behind ALLOW_MARKETING_SCHEDULING,
 * same gate as listBufferProfilesAction — profile ids are opaque Buffer
 * tokens, hard-rejected over MAX_BUFFER_PROFILE_ID_LENGTH rather than
 * truncated (AGENT_PROTOCOL opaque-id size-bound class).
 */
export async function saveLeadBufferProfilesAction(slug: string, profileIds: string[]) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`marketing-buffer-profiles-save:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long" ? "Slug is too long" : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

    const gate = assessMarketingSchedulingGate();
    if (!gate.ok) {
      return { success: false as const, error: gate.message };
    }

    // Dedupe before persisting — a duplicate profile id surviving into
    // storage makes scheduleMarketingPackToBufferAction's for-loop below
    // process the same profile twice in one run, and its duplicate-post
    // guard only records a key as posted after the whole loop finishes, so
    // both passes would queue the same variant to Buffer again
    // (buffer-profile-ids-dedupe-on-save).
    const dedupedProfileIds = Array.from(new Set(profileIds));

    if (dedupedProfileIds.length > MAX_BUFFER_PROFILES_PER_LEAD) {
      return { success: false as const, error: "Too many Buffer profiles selected" };
    }
    if (dedupedProfileIds.some((id) => !id || id.length > MAX_BUFFER_PROFILE_ID_LENGTH)) {
      return { success: false as const, error: "Invalid Buffer profile id" };
    }

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    // A non-empty selection must include at least one profile Buffer can
    // actually post to (bufferServiceContentType only maps facebook/
    // instagram) — otherwise scheduleMarketingPackToBufferAction skips every
    // variant on every call, no bufferPostedVariantKey ever gets written, and
    // listLeadsMissingBufferProfileMapping treats the lead as "mapped" while
    // listMarketingPacksMissingBufferPost reports it "not posted" forever
    // with no way for the operator to clear the due-queue signal (an
    // empty selection is a valid un-map and skips this check entirely).
    if (dedupedProfileIds.length > 0) {
      let connectedProfiles: Awaited<ReturnType<typeof listBufferProfiles>>;
      try {
        connectedProfiles = await listBufferProfiles(gate.accessToken);
      } catch (error) {
        return {
          success: false as const,
          error:
            error instanceof Error
              ? error.message
              : "Could not verify Buffer profiles — retry in a moment.",
        };
      }
      const connectedById = new Map(connectedProfiles.map((profile) => [profile.id, profile]));
      const hasPostableProfile = dedupedProfileIds.some((id) => {
        const profile = connectedById.get(id);
        return profile ? bufferServiceContentType(profile.service) !== null : false;
      });
      if (!hasPostableProfile) {
        return {
          success: false as const,
          error:
            "None of the selected profiles can receive posts yet — Buffer auto-posting only supports Facebook and Instagram profiles.",
        };
      }
    }

    try {
      await updateLeadBufferProfileIds(
        slug,
        dedupedProfileIds,
        LEAD_BUFFER_PROFILES_CONVEX_PRIMARY,
      );
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not save Buffer profiles in the shared store — retry in a moment.",
        };
      }
      throw error;
    }

    revalidatePath("/dashboard/leads");
    return { success: true as const, bufferProfileIds: dedupedProfileIds };
  } catch (error) {
    console.error("Error in saveLeadBufferProfilesAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Auto-post this UTC month's marketing pack to the lead's saved Buffer
 * profiles, replacing operator copy-paste. Only facebook_caption/
 * instagram_caption variants map onto a Buffer profile service today (see
 * bufferServiceContentType) — other content types in the pack are left for
 * manual delivery (email pack send / operator copy). Each Buffer update is
 * scheduled into that profile's existing posting slots, never posted
 * immediately. Dormant behind ALLOW_MARKETING_SCHEDULING, same gate as the
 * two actions above.
 */
export async function scheduleMarketingPackToBufferAction(slug: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`marketing-buffer-schedule:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long" ? "Slug is too long" : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

    const gate = assessMarketingSchedulingGate();
    if (!gate.ok) {
      return { success: false as const, error: gate.message };
    }

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    const orders = await listOrdersByLeadSlug(lead.slug);
    if (!leadEligibleForMarketingPack(lead, orders)) {
      return {
        success: false as const,
        error:
          "Marketing packs require a paid/live lead with a Growth or Complete order",
      };
    }

    if (!lead.bufferProfileIds?.length) {
      return {
        success: false as const,
        error: "Select Buffer profiles for this lead first",
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

    const profiles = await listBufferProfiles(gate.accessToken);
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

    // Idempotency guard: a repeated click within the same pack (operator
    // double-clicks, or clicks again after already sending earlier this
    // month) must never re-post an already-queued variant to the same
    // profile. Scoped to this pack's own generatedAt — a mid-month
    // regenerate naturally makes every prior key stale rather than
    // permanently blocking the new content (buffer-schedule-duplicate-post-guard).
    const alreadyPostedKeys = new Set(
      pruneBufferPostedVariantKeysForPack(lead.bufferPostedVariantKeys ?? [], pack.generatedAt),
    );
    const newlyPostedKeys: string[] = [];

    const scheduled: string[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];

    for (const profileId of lead.bufferProfileIds) {
      const profile = profileById.get(profileId);
      if (!profile) {
        skipped.push(`${profileId}: no longer connected to Buffer`);
        continue;
      }
      const contentType = bufferServiceContentType(profile.service);
      if (!contentType) {
        skipped.push(`${profileId}: ${profile.service} has no matching pack content type`);
        continue;
      }
      const variants = pack.variants.filter((v) => v.contentType === contentType);
      if (variants.length === 0) {
        skipped.push(`${profileId}: no ${contentType} in this month's pack`);
        continue;
      }

      // Queue every matching variant for this month, not just the first —
      // MONTHLY_MARKETING_PACK_TYPES generates 3 facebook_caption/
      // instagram_caption variants per lead per month, all sold/billed
      // deliverables (see buffer-schedule-all-matching-variants).
      for (const [index, variant] of variants.entries()) {
        const label =
          variants.length > 1 ? `${profileId} (${index + 1}/${variants.length})` : profileId;

        // Stale-content guard: pack was captured once above (before the
        // listBufferProfiles network call), and this loop performs further
        // sequential awaited Buffer network calls, potentially several per
        // profile when a profile matches more than one variant — a
        // concurrent generateMarketingPackAction regenerate (full-row
        // upsertMarketingPack replace keyed only on leadSlug+yearMonth) in
        // that window would otherwise let this loop publish now-superseded
        // copy to the lead's live Facebook/Instagram profile through Buffer,
        // which can't be recalled once posted. Re-check freshness before
        // every single post (not just once per profile) so a regenerate
        // landing between two variants of the SAME profile also stops the
        // remaining posts, not only between different profiles
        // (buffer-schedule-stale-pack-content-guard).
        const freshPackForStaleCheck = await getMarketingPack(lead.slug, yearMonth);
        if (!freshPackForStaleCheck || freshPackForStaleCheck.generatedAt !== pack.generatedAt) {
          skipped.push(
            `${label}: marketing pack was regenerated mid-run — re-run to post the current content`,
          );
          break;
        }

        const key = bufferPostedVariantKey(pack.generatedAt, profileId, contentType, index);
        if (alreadyPostedKeys.has(key)) {
          skipped.push(`${label}: already posted this month`);
          continue;
        }
        const result = await createBufferUpdate(gate.accessToken, {
          profileIds: [profileId],
          text: formatMarketingVariantForBuffer(variant),
        });
        if (result.success) {
          scheduled.push(label);
          newlyPostedKeys.push(key);
          // Defense-in-depth: mark the key posted immediately, not only in
          // newlyPostedKeys (written back after the whole loop). A
          // duplicate profileId reaching this loop by any means (a
          // pre-dedupe row saved before buffer-profile-ids-dedupe-on-save
          // shipped, a future caller bypassing saveLeadBufferProfilesAction)
          // would otherwise still see alreadyPostedKeys.has(key) return
          // false on its second pass within this same run and double-post.
          alreadyPostedKeys.add(key);
        } else {
          failed.push(`${label}: ${result.error}`);
        }
      }
    }

    if (newlyPostedKeys.length > 0) {
      try {
        // TOCTOU guard: re-read the lead immediately before this write rather
        // than persisting alreadyPostedKeys as computed from the read at the
        // top of this action (before the awaited Buffer network calls
        // above). A concurrent invocation for the same lead (an operator
        // double-click, or two open dashboard tabs) can start from that same
        // initial bufferPostedVariantKeys snapshot, schedule its own
        // variants, and persist its own marker set in the window between our
        // read and this write — persisting our stale in-memory snapshot
        // verbatim would silently discard that concurrent write's markers,
        // reopening the door to a future duplicate post of variants already
        // sent. Merge only newlyPostedKeys (what this invocation actually
        // just posted) onto the freshest persisted state instead (same
        // re-read-then-merge shape as preserveCommerceStripeIds /
        // mergeProvisionOntoFreshHandoff — see AGENT_PROTOCOL's TOCTOU
        // lost-update rule).
        const freshLead = await getLeadBySlug(slug);
        const freshAlreadyPostedKeys = new Set(
          pruneBufferPostedVariantKeysForPack(
            freshLead?.bufferPostedVariantKeys ?? [],
            pack.generatedAt,
          ),
        );
        for (const key of newlyPostedKeys) {
          freshAlreadyPostedKeys.add(key);
        }
        await updateLeadBufferPostedVariantKeys(
          slug,
          [...freshAlreadyPostedKeys],
          LEAD_BUFFER_POSTED_VARIANT_KEYS_CONVEX_PRIMARY,
        );
      } catch (error) {
        // The Buffer posts above already succeeded and cannot be undone — a
        // failure to persist the marker must not turn a successful schedule
        // into a reported error. Worst case on failure: the next click can
        // re-post these same variants, no worse than before this guard shipped.
        console.error(
          `Failed to persist Buffer posted-variant markers for ${slug}:`,
          error,
        );
      }
    }

    revalidatePath("/dashboard/leads");
    return { success: true as const, scheduled, skipped, failed };
  } catch (error) {
    console.error("Error in scheduleMarketingPackToBufferAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown Buffer error",
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
    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`client-voice-pack-generate:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }
    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    const orders = await listOrdersByLeadSlug(slug);
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

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`client-voice-pack-send:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const parsedSlug = parseLeadSlugLookup(slug);
    if (!parsedSlug.ok) {
      return {
        success: false as const,
        error:
          parsedSlug.reason === "too_long"
            ? "Slug is too long"
            : "Slug is required",
      };
    }
    slug = parsedSlug.slug;

    const lead = await getLeadBySlug(slug);
    if (!lead) {
      return { success: false as const, error: "Lead not found" };
    }

    const orders = await listOrdersByLeadSlug(lead.slug);
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

    // Reserve the one-shot sent-marker BEFORE sending — mirrors
    // sendMarketingPackToClientAction's reserve-then-send-then-release-on-failure
    // ordering (see marketing-voice-pack-client-send-race-guard-ordering-fix).
    // Passing pack.generatedAt as the expected version additionally closes a
    // second, distinct race: a concurrent Regenerate between the `pack` read
    // above and this reservation clears sentToClientAt and swaps in new
    // variants, and without this check the reservation would succeed
    // against the NEW row while the send below still emails the STALE
    // `pack.variants` captured earlier (see
    // marketing-voice-pack-send-stale-content-race-guard). A lost
    // reservation or a fail-closed reservation write skips the send
    // entirely, closing the window where two concurrent requests could both
    // send a real duplicate email before either reached a mark-after-send
    // check.
    const sentToClientAt = new Date().toISOString();
    let marked: boolean;
    try {
      marked = await markClientVoicePackSentToClient(
        lead.slug,
        pack.generatedAt,
        sentToClientAt,
        CLIENT_VOICE_PACK_CONVEX_PRIMARY,
      );
    } catch (markError) {
      if (markError instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not reserve the client voice pack sent-to-client marker in the shared store — email was not sent. Retry in a moment.",
        };
      }
      throw markError;
    }
    if (!marked) {
      // Re-fetch to tell a genuine duplicate-send race (same pack version,
      // already sent) apart from a version mismatch (the pack was
      // regenerated between the read above and this reservation) — the two
      // need different operator guidance, and in both cases no email was
      // sent by this call.
      const current = await getClientVoicePackByLeadSlug(lead.slug);
      return {
        success: false as const,
        error:
          current && current.generatedAt !== pack.generatedAt
            ? "Client voice pack was regenerated while this send was in flight — refresh and resend to deliver the current version."
            : "Client voice pack was already marked sent by a concurrent request — skipped duplicate send.",
      };
    }

    const sent = await sendClientVoicePackToClientEmail({
      to: email,
      businessName: lead.businessName,
      slug: lead.slug,
      variants: pack.variants,
      previewUrl,
    });
    if (!sent.success) {
      // Release the reservation so the pack reappears as not-yet-sent and a
      // retry click isn't blocked by the one-shot gate — best-effort at the
      // call site, mirroring sendMarketingPackToClientAction's release step.
      try {
        await clearClientVoicePackSentToClient(lead.slug, sentToClientAt);
      } catch (clearError) {
        console.error(
          `Failed to release client voice pack sent-to-client reservation for ${lead.slug} after a failed send:`,
          clearError,
        );
      }
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
      sentToClientAt,
    };
  } catch (error) {
    console.error("Error in sendClientVoicePackToClientAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Operator override: remove an address from the CAN-SPAM suppression list
 * (SuppressedEmailsPanel's Remove control). getSuppressedEmails shipped this
 * list as read-only (suppressed-emails-operator-visibility) — there was no
 * way to correct a mistaken opt-in-request-treated-as-opt-out or a stale
 * suppression without direct DB access. Every sibling write action in this
 * file fetches the record before writing (see updateLeadStageAction); the
 * "record" here is the suppression row itself, keyed by the email address,
 * so isEmailSuppressed doubles as the not-found check.
 */
export async function unsuppressEmailAction(email: string) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false as const, error: auth.error };
    }

    const clientIp = clientIpFromHeaders(await headers());
    const rate = checkRateLimit(`unsuppress-email:${clientIp}`);
    if (!rate.allowed) {
      return {
        success: false as const,
        error: "Too many requests — please try again shortly.",
      };
    }

    const trimmed = email.trim();
    if (!trimmed) {
      return { success: false as const, error: "Email is required" };
    }
    // Opaque lookup key, not free text — hard-reject over-length rather than
    // soft-cap (a truncated address would look up / delete the wrong row).
    if (trimmed.length > MAX_CONTACT_EMAIL_LENGTH) {
      return { success: false as const, error: "Email is too long" };
    }

    const suppressed = await isEmailSuppressed(trimmed);
    if (!suppressed) {
      return { success: false as const, error: "Address is not on the suppression list" };
    }

    let removed: boolean;
    try {
      removed = await unsuppressEmail(trimmed, OPERATOR_UNSUPPRESS_CONVEX_PRIMARY);
    } catch (error) {
      if (error instanceof ConvexPrimaryWriteError) {
        return {
          success: false as const,
          error:
            "Could not remove the address in the shared store — other instances may still treat it as suppressed. Retry in a moment.",
        };
      }
      throw error;
    }
    if (!removed) {
      // A concurrent unsuppress (double-click, second tab) already removed
      // this row between our isEmailSuppressed check and this write.
      return { success: false as const, error: "Address is not on the suppression list" };
    }

    revalidatePath("/dashboard/leads");
    return { success: true as const };
  } catch (error) {
    console.error("Error in unsuppressEmailAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
