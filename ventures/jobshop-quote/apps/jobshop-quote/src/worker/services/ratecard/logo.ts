// The shop's logo on its quote PDF (services/quotes/pdf.ts). One PNG or JPEG per shop, at most 1 MB
// and 4 megapixels, checked by the same reader the PDF writer uses, so a file that uploads is a file
// that prints. Stored in R2 under `orgs/{orgId}/logo/` by content hash; the old file is deleted when
// it is replaced or removed. A sent quote keeps the exact PDF it was sent with, logo included.
import { eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { shopSettings } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { sha256Hex } from "../../lib/hash";
import { ImageUnreadable, type PdfImage, readLogo, sniffLogo } from "../../lib/pdf-image";

const prefix = (orgId: string) => `orgs/${orgId}/logo/`;

async function currentKey(ctx: AppContext, orgId: string): Promise<string | null> {
  const row = await ctx.db
    .select({ logoKey: shopSettings.logoKey })
    .from(shopSettings)
    .where(eq(shopSettings.orgId, orgId))
    .get();
  if (!row) throw notFound("Shop");
  const key = row.logoKey;
  // Never follow a key outside this shop's own prefix.
  return key?.startsWith(prefix(orgId)) ? key : null;
}

/** Checks and stores a new logo, replacing any earlier one. */
export async function setLogo(ctx: AppContext, orgId: string, bytes: Uint8Array<ArrayBuffer>) {
  if (bytes.length === 0) throw badRequest("Choose a PNG or JPEG file for the logo");
  try {
    await readLogo(bytes);
  } catch (e) {
    if (e instanceof ImageUnreadable) throw badRequest(`That logo ${e.message}`);
    throw e;
  }
  const mime = sniffLogo(bytes) ?? "image/png";
  const old = await currentKey(ctx, orgId);
  const sha = await sha256Hex(bytes);
  const key = `${prefix(orgId)}${sha.slice(0, 16)}.${mime === "image/png" ? "png" : "jpg"}`;
  await ctx.env.FILES.put(key, bytes, { httpMetadata: { contentType: mime } });
  await ctx.db.update(shopSettings).set({ logoKey: key }).where(eq(shopSettings.orgId, orgId));
  if (old && old !== key) await ctx.env.FILES.delete(old);
}

/** Removes the logo; quotes print the shop's name alone again. */
export async function removeLogo(ctx: AppContext, orgId: string) {
  const old = await currentKey(ctx, orgId);
  await ctx.db.update(shopSettings).set({ logoKey: null }).where(eq(shopSettings.orgId, orgId));
  if (old) await ctx.env.FILES.delete(old);
}

/** The stored logo file, for the rate card's preview. */
export async function getLogoFile(ctx: AppContext, orgId: string) {
  const key = await currentKey(ctx, orgId);
  const obj = key ? await ctx.env.FILES.get(key) : null;
  if (!obj) throw notFound("Logo");
  const bytes = new Uint8Array(await obj.arrayBuffer());
  return { bytes, mime: sniffLogo(bytes) ?? "application/octet-stream" };
}

/**
 * The logo ready for the PDF writer, or null when the shop has none. A file that no longer reads
 * (it was checked at upload, so this means storage trouble) leaves the logo off rather than
 * failing the quote, and is logged.
 */
export async function logoForPdf(ctx: AppContext, orgId: string): Promise<PdfImage | null> {
  const key = await currentKey(ctx, orgId);
  if (!key) return null;
  const obj = await ctx.env.FILES.get(key);
  if (!obj) {
    ctx.logger.warn("quote_pdf.logo_missing", { orgId });
    return null;
  }
  try {
    return await readLogo(new Uint8Array(await obj.arrayBuffer()));
  } catch (e) {
    ctx.logger.warn("quote_pdf.logo_unreadable", { orgId, error: String(e) });
    return null;
  }
}
