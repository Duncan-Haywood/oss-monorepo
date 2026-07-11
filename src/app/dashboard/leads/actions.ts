"use server";

import { revalidatePath } from "next/cache";
import { requireOperatorAuth } from "@/lib/auth/operator";
import { updateLeadStage, upsertLead } from "@/lib/db";
import { parseLeadsCsv } from "@/lib/leads/csv-import";
import type { Lead, LeadPipelineStage } from "@/lib/leads/types";

export async function updateLeadStageAction(slug: string, stage: LeadPipelineStage) {
  try {
    const auth = await requireOperatorAuth();
    if (!auth.ok) {
      return { success: false, error: auth.error };
    }

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
