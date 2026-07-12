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
  listClientInquiries,
  recordCheckoutRecoverySent,
  updateLeadNotes,
  updateLeadSnooze,
  applyColdLeadDisposition,
  upsertMarketingPack,
  listMarketingPacksForMonth,
  upsertCommerceCatalog,
  getCommerceCatalog,
  upsertClientVoicePack,
} from "@/lib/db";
import { parseLeadsCsv } from "@/lib/leads/csv-import";
import type { Lead, LeadPipelineStage } from "@/lib/leads/types";
import { normalizeOperatorNotes } from "@/lib/leads/notes";
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
import { markHandoffLive, assignVercelProjectAndProvision } from "@/lib/deploy/handoff";
import type { ClientInquiryStatus } from "@/lib/inquiries/types";
import {
  sendOutreachEmail,
  sendOutreachFollowUp2,
  sendOutreachFollowUp3,
  sendCheckoutAbandonedRecovery,
  sendInquiryReply,
  sendOperatorDailyDigest,
  sendStarterUpsellEmail,
} from "@/lib/email/resend";
import { nextFollowUpStep } from "@/lib/email/outreach-followups";
import { createBillingPortalForLead } from "@/lib/billing/create-portal-session";
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
  marketingMonthKey,
  monthlyPackRequestForLead,
} from "@/lib/marketing";
import {
  leadEligibleForCommerceCatalog,
  normalizeCommerceItems,
} from "@/lib/commerce";
import {
  clientVoicePackRequestForLead,
  getClientVoiceGenerator,
  leadEligibleForClientVoicePack,
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
    const handoff = await markHandoffLive(slug);
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
    const handoff = await assignVercelProjectAndProvision(slug, trimmed || null);
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
    const inquiry = await updateClientInquiryStatus(inquiryId, status);
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
 * On success, persists operatorReply / repliedAt and marks status=replied.
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
            ? "Email is on the suppression list"
            : "error" in sent && typeof sent.error === "string"
              ? sent.error
              : "Failed to send reply email",
      };
    }

    const updated = await recordClientInquiryReply(inquiryId, normalized.body);
    if (!updated) {
      return {
        success: false as const,
        error: "Reply emailed but failed to persist inquiry status — refresh and check",
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
      return { success: false, error: auth.error };
    }

    await updateLeadStage(slug, stage);

    // If stage is changed to outreach_sent, trigger Email 1 and record step
    if (stage === "outreach_sent") {
      const lead = await getLeadBySlug(slug);
      if (lead?.email) {
        const sent = await sendOutreachEmail(lead.email, lead.businessName, lead.slug);
        if (sent.success) {
          await recordLeadOutreach(slug, 1);
        }
      }
    }

    revalidatePath("/dashboard/leads");
    revalidatePath(`/preview/${slug}`);
    return { success: true };
  } catch (error) {
    console.error("Error in updateLeadStageAction:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
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

    await updateLeadNotes(slug, normalized.notes);
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

    await updateLeadSnooze(slug, normalized.snoozedUntil);
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

    await applyColdLeadDisposition(slug, planned.patch);

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
      const sent = await sendOutreachEmail(email, existing.businessName, existing.slug);
      if (!sent.success) {
        return {
          success: false as const,
          error:
            "reason" in sent && sent.reason === "suppressed"
              ? "Email is on the suppression list"
              : "error" in sent && typeof sent.error === "string"
                ? sent.error
                : "Re-engage saved, but Email 1 failed to send — set stage to Outreach Sent to retry",
          stage: planned.patch.stage,
          outreachStep,
          lastOutreachAt,
          snoozedUntil: planned.patch.snoozedUntil,
          emailSent: false,
        };
      }
      const sentAt = new Date().toISOString();
      await recordLeadOutreach(slug, 1, sentAt);
      outreachStep = 1;
      lastOutreachAt = sentAt;
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
      };
    }

    await recordLeadOutreach(slug, next);
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

    const lead = await getLeadBySlug(session.leadSlug);
    const to = session.customerEmail || lead?.email;
    if (!to) {
      return { success: false as const, error: "No email on file for this checkout session" };
    }

    const businessName = lead?.businessName || session.leadSlug;
    const sent = await sendCheckoutAbandonedRecovery(to, businessName, session.leadSlug, session.tier);

    if (!sent.success) {
      return {
        success: false as const,
        error:
          "reason" in sent && sent.reason === "suppressed"
            ? "Email is on the suppression list"
            : "error" in sent && typeof sent.error === "string"
              ? sent.error
              : "Failed to send recovery email",
      };
    }

    await recordCheckoutRecoverySent(stripeSessionId);
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

export async function addLeadAction(leadData: Omit<Lead, "stage"> & { stage?: LeadPipelineStage }) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false, error: auth.error };
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

    await upsertLead(lead);

    // If added directly in outreach_sent stage, trigger Email 1
    if (stage === "outreach_sent" && lead.email) {
      const sent = await sendOutreachEmail(lead.email, lead.businessName, lead.slug);
      if (sent.success) {
        await recordLeadOutreach(lead.slug, 1);
      }
    }

    revalidatePath("/dashboard/leads");
    revalidatePath(`/preview/${lead.slug}`);
    return { success: true, slug: lead.slug };
  } catch (error) {
    console.error("Error in addLeadAction:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
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
      return { success: false, error: auth.error };
    }

    if (!input.csvText || input.csvText.trim().length === 0) {
      return { success: false, error: "CSV text is empty" };
    }

    const parsed = parseLeadsCsv(input.csvText, {
      dataSource: input.dataSource,
      defaultStage: input.defaultStage,
    });

    if (parsed.leads.length === 0) {
      return {
        success: false,
        error: parsed.errors[0]?.message ?? "No valid leads found in CSV",
        imported: 0,
        errors: parsed.errors,
        skipped: parsed.skipped,
      };
    }

    const importedSlugs: string[] = [];
    const upsertErrors: Array<{ row: number; message: string }> = [...parsed.errors];

    for (const [index, lead] of parsed.leads.entries()) {
      try {
        await upsertLead(lead);
        importedSlugs.push(lead.slug);
        revalidatePath(`/preview/${lead.slug}`);
      } catch (error) {
        upsertErrors.push({
          row: index + 1,
          message: error instanceof Error ? error.message : "Failed to upsert lead",
        });
      }
    }

    revalidatePath("/dashboard/leads");

    if (importedSlugs.length === 0) {
      return {
        success: false,
        error: upsertErrors[0]?.message ?? "No leads imported",
        imported: 0,
        errors: upsertErrors,
        skipped: parsed.skipped + parsed.leads.length,
      };
    }

    return {
      success: true,
      imported: importedSlugs.length,
      slugs: importedSlugs,
      errors: upsertErrors,
      skipped: parsed.skipped + (parsed.leads.length - importedSlugs.length),
    };
  } catch (error) {
    console.error("Error in importLeadsCsvAction:", error);
    return {
      success: false,
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

    const headerStore = await headers();
    const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
    const proto = headerStore.get("x-forwarded-proto") ?? "http";
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? (host ? `${proto}://${host}` : "http://localhost:3000");

    const result = await createBillingPortalForLead(slug, `${appUrl}/dashboard/leads`);
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
 * and Starter → MRR upsell candidates in one send, plus cold/snoozed footnotes,
 * so a single-operator business does not have to open this dashboard to know
 * what is urgent today. Requires OPERATOR_DIGEST_EMAIL — see /docs/process.
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
    const [leads, inquiries, openCheckoutSessions, orders, marketingPacks] =
      await Promise.all([
        getLeads(),
        listClientInquiries(100),
        listOpenCheckoutSessions(),
        listOrders(),
        listMarketingPacksForMonth(yearMonth),
      ]);

    const headerStore = await headers();
    const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
    const proto = headerStore.get("x-forwarded-proto") ?? "http";
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? (host ? `${proto}://${host}` : "http://localhost:3000");

    const digest = buildDailyDigest({
      leads,
      inquiries,
      openCheckoutSessions,
      orders,
      marketingPacksThisMonth: marketingPacks,
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

    const pack = await upsertMarketingPack({
      leadSlug: lead.slug,
      yearMonth,
      variants: result.variants,
      generatedAt: result.generatedAt,
      generator: usedAnthropic ? "anthropic" : "stub",
      packageTier: result.packageTier ?? packageTier,
    });

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

    const catalog = await upsertCommerceCatalog({
      leadSlug: lead.slug,
      items: normalized.items,
      updatedAt: new Date().toISOString(),
    });

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

    const pack = await upsertClientVoicePack({
      leadSlug: lead.slug,
      variants: result.variants,
      generatedAt: result.generatedAt,
      generator: usedAnthropic ? "anthropic" : "stub",
    });

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
