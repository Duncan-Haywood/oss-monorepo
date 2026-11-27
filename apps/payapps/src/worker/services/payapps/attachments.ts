// Files attached to a pay application: backup a GC asks for (stored-material invoices, certified
// payroll, insurance certificates), job photos and the signed application that comes back. Rules in
// src/shared/attachments.ts; bytes in the R2 bucket bound as FILES, rows in pay_app_attachments.
//
// Safety: the stored Content-Type comes from the extension allow-list, never from the browser, and
// every download is served as an attachment with nosniff (routes/org/pay-apps.ts), so an uploaded
// file can never render as a page on our origin. Every key starts with the org's prefix, and every
// lookup filters by org, job and pay application.
import {
  ATTACHMENT_TYPES,
  type AttachmentCategory,
  attachmentProblem,
  cleanFileName,
  extensionOf,
  MAX_ATTACHMENT_BYTES,
} from "@shared/attachments";
import { and, desc, eq, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  changeOrderAttachments,
  closeoutFiles,
  companyDocumentFiles,
  dailyReportFiles,
  insuranceCertificateFiles,
  lienNoticeFiles,
  payAppAttachments,
  payApps,
  rfiFiles,
  submittalFiles,
  tmTicketFiles,
} from "../../db/schema";
import { AppError, badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { orgPlan } from "../billing";
import { lowerTierWaiverOnPayApp, markLowerTierReceived } from "./lower-tier-waivers";

export interface AttachmentDto {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  category: AttachmentCategory;
  createdAt: string;
  /** Pay-application files only: the lower-tier waiver row this is the signed waiver for. */
  lowerTierWaiverId?: string | null;
}

export interface AttachmentListDto {
  items: AttachmentDto[];
  storage: { usedBytes: number; limitBytes: number };
  /** False when this deployment has no file bucket: the list still reads, uploads are refused. */
  enabled: boolean;
}

export const dto = (r: {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  category: AttachmentCategory;
  createdAt: Date;
}): AttachmentDto => ({
  id: r.id,
  fileName: r.fileName,
  contentType: r.contentType,
  sizeBytes: r.sizeBytes,
  category: r.category,
  createdAt: r.createdAt.toISOString(),
});

/** Slack for the multipart envelope around one file. */
const ENVELOPE_BYTES = 64 * 1024;
export const MAX_UPLOAD_REQUEST_BYTES = MAX_ATTACHMENT_BYTES + ENVELOPE_BYTES;

export const payAppPrefix = (orgId: string, projectId: string, payAppId: string) =>
  `orgs/${orgId}/projects/${projectId}/pay-apps/${payAppId}/`;
export const projectPrefix = (orgId: string, projectId: string) =>
  `orgs/${orgId}/projects/${projectId}/`;

const storageOff = () =>
  new AppError(503, "files_unavailable", "File attachments are not set up on this deployment yet");

export function bucket(ctx: AppContext): R2Bucket {
  const b = ctx.env.FILES;
  if (!b) throw storageOff();
  return b;
}

async function assertPayApp(ctx: AppContext, orgId: string, projectId: string, payAppId: string) {
  const row = await ctx.db
    .select({ id: payApps.id })
    .from(payApps)
    .where(
      and(eq(payApps.id, payAppId), eq(payApps.orgId, orgId), eq(payApps.projectId, projectId)),
    )
    .get();
  if (!row) throw notFound("Pay application");
}

/**
 * Bytes the company stores: pay-application, change-order, notice, insurance-certificate, RFI,
 * submittal, daily-report, close-out, T&M ticket and company-document files together (one plan
 * limit).
 */
export async function usedBytes(ctx: AppContext, orgId: string) {
  const [apps, cos, notices, insurance, rfi, subs, daily, closeout, tm, docs] = await Promise.all([
    ctx.db
      .select({ n: sql<number>`coalesce(sum(${payAppAttachments.sizeBytes}), 0)` })
      .from(payAppAttachments)
      .where(eq(payAppAttachments.orgId, orgId))
      .get(),
    ctx.db
      .select({ n: sql<number>`coalesce(sum(${changeOrderAttachments.sizeBytes}), 0)` })
      .from(changeOrderAttachments)
      .where(eq(changeOrderAttachments.orgId, orgId))
      .get(),
    ctx.db
      .select({ n: sql<number>`coalesce(sum(${lienNoticeFiles.sizeBytes}), 0)` })
      .from(lienNoticeFiles)
      .where(eq(lienNoticeFiles.orgId, orgId))
      .get(),
    ctx.db
      .select({ n: sql<number>`coalesce(sum(${insuranceCertificateFiles.sizeBytes}), 0)` })
      .from(insuranceCertificateFiles)
      .where(eq(insuranceCertificateFiles.orgId, orgId))
      .get(),
    ctx.db
      .select({ n: sql<number>`coalesce(sum(${rfiFiles.sizeBytes}), 0)` })
      .from(rfiFiles)
      .where(eq(rfiFiles.orgId, orgId))
      .get(),
    ctx.db
      .select({ n: sql<number>`coalesce(sum(${submittalFiles.sizeBytes}), 0)` })
      .from(submittalFiles)
      .where(eq(submittalFiles.orgId, orgId))
      .get(),
    ctx.db
      .select({ n: sql<number>`coalesce(sum(${dailyReportFiles.sizeBytes}), 0)` })
      .from(dailyReportFiles)
      .where(eq(dailyReportFiles.orgId, orgId))
      .get(),
    ctx.db
      .select({ n: sql<number>`coalesce(sum(${closeoutFiles.sizeBytes}), 0)` })
      .from(closeoutFiles)
      .where(eq(closeoutFiles.orgId, orgId))
      .get(),
    ctx.db
      .select({ n: sql<number>`coalesce(sum(${tmTicketFiles.sizeBytes}), 0)` })
      .from(tmTicketFiles)
      .where(eq(tmTicketFiles.orgId, orgId))
      .get(),
    ctx.db
      .select({ n: sql<number>`coalesce(sum(${companyDocumentFiles.sizeBytes}), 0)` })
      .from(companyDocumentFiles)
      .where(eq(companyDocumentFiles.orgId, orgId))
      .get(),
  ]);
  return (
    Number(apps?.n ?? 0) +
    Number(cos?.n ?? 0) +
    Number(notices?.n ?? 0) +
    Number(insurance?.n ?? 0) +
    Number(rfi?.n ?? 0) +
    Number(subs?.n ?? 0) +
    Number(daily?.n ?? 0) +
    Number(closeout?.n ?? 0) +
    Number(tm?.n ?? 0) +
    Number(docs?.n ?? 0)
  );
}

/** A pay-application file, with the lower-tier waiver row it belongs to (if any). */
const payAppDto = (r: typeof payAppAttachments.$inferSelect): AttachmentDto => ({
  ...dto(r),
  lowerTierWaiverId: r.lowerTierWaiverId ?? null,
});

const rowsOf = (ctx: AppContext, orgId: string, payAppId: string) =>
  ctx.db
    .select()
    .from(payAppAttachments)
    .where(and(eq(payAppAttachments.orgId, orgId), eq(payAppAttachments.payAppId, payAppId)))
    .orderBy(desc(payAppAttachments.createdAt));

export async function listAttachments(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
): Promise<AttachmentListDto> {
  await assertPayApp(ctx, orgId, projectId, payAppId);
  const [rows, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, payAppId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  return {
    items: rows.map(payAppDto),
    storage: { usedBytes: used, limitBytes: plan.attachmentStorageBytes },
    enabled: Boolean(ctx.env.FILES),
  };
}

export interface UploadInput {
  file: File;
  category: AttachmentCategory;
  /** The lower-tier waiver row on this pay application the file is the signed waiver for. */
  lowerTierWaiverId?: string | null;
}

export async function addAttachment(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  input: UploadInput,
  userId: string,
): Promise<AttachmentDto> {
  const files = bucket(ctx);
  await assertPayApp(ctx, orgId, projectId, payAppId);
  const waiverId = input.lowerTierWaiverId || null;
  // Filing a waiver on its row is changing the lower-tier list: the same plan gate and tenancy.
  if (waiverId) await lowerTierWaiverOnPayApp(ctx, orgId, projectId, payAppId, waiverId);
  const [existing, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, payAppId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  const problem = attachmentProblem(
    { name: input.file.name, sizeBytes: input.file.size },
    existing.length,
    { usedBytes: used, limitBytes: plan.attachmentStorageBytes },
  );
  if (problem) throw badRequest(problem);

  const fileName = cleanFileName(input.file.name);
  const contentType = ATTACHMENT_TYPES[extensionOf(fileName)] as string;
  const id = newId("att");
  const r2Key = `${payAppPrefix(orgId, projectId, payAppId)}${id}`;
  await files.put(r2Key, input.file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { orgId, payAppId },
  });
  try {
    const [row] = await ctx.db
      .insert(payAppAttachments)
      .values({
        id,
        orgId,
        projectId,
        payAppId,
        r2Key,
        fileName,
        contentType,
        sizeBytes: input.file.size,
        category: input.category,
        lowerTierWaiverId: waiverId,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    if (waiverId) await markLowerTierReceived(ctx, orgId, waiverId);
    return payAppDto(row);
  } catch (e) {
    // The pay application was deleted mid-upload, or D1 failed: never leave an object no row owns.
    await files.delete(r2Key).catch(() => undefined);
    throw e;
  }
}

async function findRow(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  attachmentId: string | undefined,
) {
  const row = await ctx.db
    .select()
    .from(payAppAttachments)
    .where(
      and(
        eq(payAppAttachments.id, attachmentId ?? ""),
        eq(payAppAttachments.orgId, orgId),
        eq(payAppAttachments.projectId, projectId),
        eq(payAppAttachments.payAppId, payAppId),
      ),
    )
    .get();
  if (!row) throw notFound("Attachment");
  return row;
}

export async function getAttachmentFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  attachmentId: string | undefined,
) {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, projectId, payAppId, attachmentId);
  const object = await files.get(row.r2Key);
  if (!object) throw notFound("Attachment file");
  return { row: payAppDto(row), body: object.body };
}

export async function deleteAttachment(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  attachmentId: string | undefined,
) {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, projectId, payAppId, attachmentId);
  await ctx.db
    .delete(payAppAttachments)
    .where(and(eq(payAppAttachments.id, row.id), eq(payAppAttachments.orgId, orgId)));
  await files.delete(row.r2Key);
  return row;
}

/**
 * Removes every stored file under a prefix after its rows are gone (a deleted draft pay app or job;
 * the rows cascade in D1). Best effort: a failure is logged, never shown, since the record is
 * already deleted.
 */
export async function purgeFiles(ctx: AppContext, prefix: string) {
  const files = ctx.env.FILES;
  if (!files) return;
  try {
    let cursor: string | undefined;
    do {
      const page = await files.list({ prefix, cursor, limit: 1000 });
      if (page.objects.length) await files.delete(page.objects.map((o) => o.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  } catch (e) {
    ctx.logger.error("attachments.purge_failed", { prefix, error: String(e) });
  }
}
