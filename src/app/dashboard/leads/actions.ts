"use server";

import { revalidatePath } from "next/cache";
import { updateLeadStage, upsertLead } from "@/lib/db";
import { parseLeadsCsv } from "@/lib/leads/csv-import";
import type { Lead, LeadPipelineStage } from "@/lib/leads/types";

export async function updateLeadStageAction(slug: string, stage: LeadPipelineStage) {
  try {
    await updateLeadStage(slug, stage);

    // If stage is changed to outreach_sent, trigger outreach email
    if (stage === "outreach_sent") {
      const { getLeadBySlug } = await import("@/lib/db");
      const { sendOutreachEmail } = await import("@/lib/email/resend");
      const lead = await getLeadBySlug(slug);
      if (lead && lead.email) {
        await sendOutreachEmail(lead.email, lead.businessName, lead.slug);
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

export async function addLeadAction(leadData: Omit<Lead, "stage"> & { stage?: LeadPipelineStage }) {
  try {
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

    // If added directly in outreach_sent stage, trigger outreach email
    if (stage === "outreach_sent" && lead.email) {
      const { sendOutreachEmail } = await import("@/lib/email/resend");
      await sendOutreachEmail(lead.email, lead.businessName, lead.slug);
    }

    revalidatePath("/dashboard/leads");
    revalidatePath(`/preview/${lead.slug}`);
    return { success: true, slug: lead.slug };
  } catch (error) {
    console.error("Error in addLeadAction:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function importLeadsCsvAction(input: {
  csvText: string;
  dataSource?: string;
  defaultStage?: LeadPipelineStage;
}) {
  try {
    const parsed = parseLeadsCsv(input.csvText, {
      dataSource: input.dataSource,
      defaultStage: input.defaultStage,
    });

    if (parsed.leads.length === 0 && parsed.errors.length > 0) {
      return {
        success: false as const,
        error: parsed.errors[0]?.message ?? "CSV import failed",
        imported: 0,
        errors: parsed.errors,
      };
    }

    let imported = 0;
    const upsertErrors: Array<{ row: number; message: string }> = [...parsed.errors];

    for (const [index, lead] of parsed.leads.entries()) {
      try {
        await upsertLead(lead);
        imported += 1;
        revalidatePath(`/preview/${lead.slug}`);
      } catch (error) {
        upsertErrors.push({
          row: index + 1,
          message: error instanceof Error ? error.message : "Failed to upsert lead",
        });
      }
    }

    revalidatePath("/dashboard/leads");

    return {
      success: imported > 0,
      imported,
      skipped: parsed.skipped + (parsed.leads.length - imported),
      errors: upsertErrors,
      error:
        imported === 0
          ? upsertErrors[0]?.message ?? "No leads imported"
          : undefined,
    };
  } catch (error) {
    console.error("Error in importLeadsCsvAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
      imported: 0,
      errors: [] as Array<{ row: number; message: string }>,
    };
  }
}
