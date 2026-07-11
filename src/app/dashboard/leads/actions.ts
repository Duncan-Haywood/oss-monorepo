"use server";

import { revalidatePath } from "next/cache";
import { updateLeadStage, upsertLead } from "@/lib/db";
import { parseLeadCsv } from "@/lib/leads/csv-import";
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

export async function importLeadsCsvAction(csvText: string) {
  try {
    if (!csvText || csvText.trim().length === 0) {
      return { success: false as const, error: "CSV text is empty" };
    }

    const parsed = parseLeadCsv(csvText);
    if (parsed.leads.length === 0) {
      const firstError = parsed.errors[0]?.message ?? "No valid leads found in CSV";
      return {
        success: false as const,
        error: firstError,
        imported: 0,
        errors: parsed.errors,
      };
    }

    const importedSlugs: string[] = [];
    for (const lead of parsed.leads) {
      await upsertLead(lead);
      importedSlugs.push(lead.slug);
      revalidatePath(`/preview/${lead.slug}`);
    }

    revalidatePath("/dashboard/leads");
    return {
      success: true as const,
      imported: importedSlugs.length,
      slugs: importedSlugs,
      errors: parsed.errors,
      skipped: parsed.skipped,
    };
  } catch (error) {
    console.error("Error in importLeadsCsvAction:", error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
