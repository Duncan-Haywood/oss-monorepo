// First article balloons: the drawing PDF with a numbered balloon beside each characteristic of the
// Form 3 draft (shared/fai-balloons.ts). Drafted from the same stored text as the CSV
// (characteristicsCsv), so a balloon's number is that characteristic's row number in the CSV.
import { balloonDrawing, placeBalloons, zonesByNo } from "@shared/fai-balloons";
import type { CharacteristicDraft } from "@shared/fai-characteristics";
import { readPdfLayout } from "@shared/pdf-text";
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

/** Larger drawings are not read for zones on every sheet load (the balloons still read them). */
const ZONE_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Each characteristic's drawing zone ("C4"), read from the zone labels of the drawing's border
 * (shared/drawing-zones.ts), for Form 3's Reference Location and the inspection screen. Empty when
 * the file is not a PDF, has no zoned border the reader can see, or cannot be read: the zone is then
 * the inspector's to fill, as before. Never throws.
 */
export async function drawingZones(
  ctx: AppContext,
  orgId: string,
  file: { mimeType: string; r2Key: string; sizeBytes: number },
  draft: CharacteristicDraft,
): Promise<Record<string, string>> {
  if (file.mimeType !== "application/pdf" || file.sizeBytes > ZONE_MAX_BYTES) return {};
  if (!draft.characteristics.length || !file.r2Key.startsWith(`orgs/${orgId}/`)) return {};
  try {
    const obj = await ctx.env.FILES.get(file.r2Key);
    if (!obj) return {};
    const layout = await readPdfLayout(new Uint8Array(await obj.arrayBuffer()));
    if (!layout) return {};
    return zonesByNo(draft, placeBalloons(layout, draft));
  } catch (e) {
    ctx.logger.warn("rfq.zones_failed", { error: String(e).slice(0, 200) });
    return {};
  }
}
