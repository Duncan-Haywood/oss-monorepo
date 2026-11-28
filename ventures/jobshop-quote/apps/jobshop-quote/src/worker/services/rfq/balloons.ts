// First article balloons: the drawing PDF with a numbered balloon beside each characteristic of the
// Form 3 draft (shared/fai-balloons.ts). Drafted from the same stored text as the CSV
// (characteristicsCsv), so a balloon's number is that characteristic's row number in the CSV.
import { balloonDrawing } from "@shared/fai-balloons";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { rfqFiles } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";

export interface BalloonedDrawing {
  pdf: Uint8Array;
  fileName: string;
  placed: number;
  /** Balloon numbers whose text was not found in the PDF's text layer (no balloon drawn). */
  unplaced: string[];
}

export async function balloonedDrawing(
  ctx: AppContext,
  orgId: string,
  rfqId: string,
  fileId: string,
): Promise<BalloonedDrawing> {
  const f = await ctx.db
    .select({
      fileName: rfqFiles.fileName,
      mimeType: rfqFiles.mimeType,
      r2Key: rfqFiles.r2Key,
      extractedText: rfqFiles.extractedText,
    })
    .from(rfqFiles)
    .where(and(eq(rfqFiles.id, fileId), eq(rfqFiles.rfqId, rfqId), eq(rfqFiles.orgId, orgId)))
    .get();
  if (!f) throw notFound("File");
  if (f.mimeType !== "application/pdf")
    throw badRequest("Balloons are drawn on PDF drawings only.");
  if (!f.extractedText?.trim()) {
    throw badRequest("No text was read from this file (a scan), so there is nothing to balloon.");
  }
  if (!f.r2Key.startsWith(`orgs/${orgId}/`)) throw conflict("File key outside the tenant prefix");
  const obj = await ctx.env.FILES.get(f.r2Key);
  if (!obj) throw notFound("File");
  const bytes = new Uint8Array(await obj.arrayBuffer());
  const res = await balloonDrawing(bytes, f.extractedText);
  if (!res) {
    throw badRequest(
      "This PDF could not be read for balloons (encrypted or damaged). Use the CSV and balloon by hand.",
    );
  }
  if (res.placements.length === 0) {
    throw badRequest(
      "None of the listed characteristics were found in this PDF's text layer (the drawing's text may be drawn as lines), so no balloons were placed. Use the CSV.",
    );
  }
  const base = f.fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "drawing";
  return {
    pdf: res.pdf,
    fileName: `${base}-ballooned.pdf`,
    placed: res.placements.length,
    unplaced: res.unplaced,
  };
}
