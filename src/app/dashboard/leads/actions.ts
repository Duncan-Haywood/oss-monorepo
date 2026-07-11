"use server";

import { revalidatePath } from "next/cache";
import { requireOperatorAuth } from "@/lib/auth/operator";
import {
  updateLeadStage,
  upsertLead,
  updateClientInquiryStatus,
  getLeadBySlug,
  recordLeadOutreach,
} from "@/lib/db";
import { parseLeadsCsv } from "@/lib/leads/csv-import";
import type { Lead, LeadPipelineStage } from "@/lib/leads/types";
import { markHandoffLive, assignVercelProjectAndProvision } from "@/lib/deploy/handoff";
import type { DeployHandoff } from "@/lib/deploy/types";
import type { ClientInquiry, ClientInquiryStatus } from "@/lib/inquiries/types";
import {
  sendOutreachEmail,
  sendOutreachFollowUp2,
  sendOutreachFollowUp3,
} from "@/lib/email/resend";
import { nextFollowUpStep } from "@/lib/email/outreach-followups";

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

/** Re-export for client typing convenience. */
export type { DeployHandoff, ClientInquiry };

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
    if (status !== "new" && status !== "read" && status !== "archived") {
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
    if (lead.stage === "paid" || lead.stage === "live") {
      return { success: false as const, error: "Lead already paid or live — skip follow-ups" };
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
