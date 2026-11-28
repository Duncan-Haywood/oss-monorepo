// First article, part 2b: AS9102 Forms 1 and 2 drafted for one drawing file (shared/fai-forms.ts),
// from the RFQ's part, the shop's name, the RFQ's won quote's PO number and the drawing's text.
// Every query is scoped by orgId; another shop's file is a 404.

import { draftCharacteristics } from "@shared/fai-characteristics";
import { draftForms, type FormsDraft, formsCsv } from "@shared/fai-forms";
import { quoteLabel } from "@shared/quote-label";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import type { AppContext } from "../../context";
import { organization, quotes, rfqFiles, rfqParts, shopSettings } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";

export interface FormsDto extends FormsDraft {
  fileName: string;
}

async function load(ctx: AppContext, orgId: string, rfqId: string, fileId: string) {
  const f = await ctx.db
    .select({ fileName: rfqFiles.fileName, extractedText: rfqFiles.extractedText })
    .from(rfqFiles)
    .where(and(eq(rfqFiles.id, fileId), eq(rfqFiles.rfqId, rfqId), eq(rfqFiles.orgId, orgId)))
    .get();
  if (!f) throw notFound("File");
  if (!f.extractedText?.trim()) {
    throw badRequest(
      "No text was read from this file (a scan or a CAD file), so there is nothing to fill the forms from.",
    );
  }
  const parts = await ctx.db
    .select({
      partNumber: rfqParts.partNumber,
      revision: rfqParts.revision,
      description: rfqParts.description,
      materialText: rfqParts.materialText,
      finishText: rfqParts.finishText,
    })
    .from(rfqParts)
    .where(and(eq(rfqParts.rfqId, rfqId), eq(rfqParts.orgId, orgId)))
    .orderBy(asc(rfqParts.position))
    .all();
  // The same match the Form 3 list uses: the part whose number the file name carries, or the only part.
  const upper = f.fileName.toUpperCase();
  const part =
    parts.find((p) => p.partNumber && upper.includes(p.partNumber.toUpperCase())) ??
    (parts.length === 1 ? parts[0] : undefined);
  const shop = await ctx.db
    .select({ name: shopSettings.displayName })
    .from(shopSettings)
    .where(eq(shopSettings.orgId, orgId))
    .get();
  const org = shop
    ? null
    : await ctx.db
        .select({ name: organization.name })
        .from(organization)
        .where(eq(organization.id, orgId))
        .get();
  const won = await ctx.db
    .select({ po: quotes.poNumber, n: quotes.quoteNumber, rev: quotes.revNumber })
    .from(quotes)
    .where(
      and(
        eq(quotes.orgId, orgId),
        eq(quotes.rfqId, rfqId),
        eq(quotes.status, "won"),
        isNotNull(quotes.poNumber),
      ),
    )
    .orderBy(desc(quotes.updatedAt))
    .get();
  return {
    file: f,
    draft: draftForms({
      text: f.extractedText,
      fileName: f.fileName,
      part: part ?? null,
      organizationName: shop?.name ?? org?.name ?? null,
      poNumber: won?.po ?? null,
      quoteLabel: won ? quoteLabel(won.n, won.rev) : null,
    }),
  };
}

/** Forms 1 and 2 for the first article screen. */
export async function getFaiForms(
  ctx: AppContext,
  orgId: string,
  rfqId: string,
  fileId: string,
): Promise<FormsDto> {
  const { file, draft } = await load(ctx, orgId, rfqId, fileId);
  return { fileName: file.fileName, ...draft };
}

/** Forms 1 and 2 as one CSV, named after the drawing. */
export async function faiFormsCsv(
  ctx: AppContext,
  orgId: string,
  rfqId: string,
  fileId: string,
): Promise<{ csv: string; fileName: string; rows: number }> {
  const { file, draft } = await load(ctx, orgId, rfqId, fileId);
  const base = file.fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "drawing";
  const csv = formsCsv(
    draft,
    file.fileName,
    draftCharacteristics(file.extractedText).characteristics,
  );
  ctx.logger.info("rfq.fai_forms_csv", { orgId, rfqId, fileId, form2: draft.form2.length });
  return { csv, fileName: `${base}-forms-1-2-draft.csv`, rows: draft.form2.length };
}
