// Files kept with a California preliminary notice recorded as given: the mailing receipt and proof
// of delivery that Cal. Civ. Code § 8118(b) says go with the proof of notice declaration when the
// notice was mailed, and the signed declaration. The same rules, bucket and storage limit as
// change-order files (./change-order-attachments.ts); rows in lien_notice_files, keys under
// orgs/{orgId}/projects/{projectId}/notices/{sendId}/, so deleting the job clears them. Crew and up,
// like the notice log itself.
//
// Safety, as for the other files: the stored Content-Type comes from the extension allow-list, never
// the browser; downloads are served as attachments with nosniff (routes/org/projects.ts); every
// lookup filters by org, job and notice record.
import {
  ATTACHMENT_TYPES,
  type AttachmentCategory,
  attachmentProblem,
  cleanFileName,
  extensionOf,
  MAX_ATTACHMENTS_PER_NOTICE,
} from "@shared/attachments";
import { and, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { lienNoticeFiles, lienNoticeSends } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { assertLienWaivers, orgPlan } from "../billing";
import { type AttachmentDto, type AttachmentListDto, bucket, dto, usedBytes } from "./attachments";

export const noticePrefix = (orgId: string, projectId: string, sendId: string) =>
  `orgs/${orgId}/projects/${projectId}/notices/${sendId}/`;

async function assertSend(ctx: AppContext, orgId: string, projectId: string, sendId: string) {
  const row = await ctx.db
    .select({ id: lienNoticeSends.id, recipient: lienNoticeSends.recipient })
    .from(lienNoticeSends)
    .where(
      and(
        eq(lienNoticeSends.id, sendId),
        eq(lienNoticeSends.orgId, orgId),
        eq(lienNoticeSends.projectId, projectId),
      ),
    )
    .get();
  if (!row) throw notFound("Notice");
  return row;
}

const rowsOf = (ctx: AppContext, orgId: string, sendId: string) =>
  ctx.db
    .select()
    .from(lienNoticeFiles)
    .where(and(eq(lienNoticeFiles.orgId, orgId), eq(lienNoticeFiles.sendId, sendId)))
    .orderBy(desc(lienNoticeFiles.createdAt));

export async function listNoticeFiles(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  sendId: string,
): Promise<AttachmentListDto> {
  await assertSend(ctx, orgId, projectId, sendId);
  const [rows, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, sendId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  return {
    items: rows.map(dto),
    storage: { usedBytes: used, limitBytes: plan.attachmentStorageBytes },
    enabled: Boolean(ctx.env.FILES),
  };
}

/** How many files each of the job's notice records holds, for the log's "Files (2)" links. */
export async function noticeFileCounts(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<Map<string, number>> {
  const rows = await ctx.db
    .select({ sendId: lienNoticeFiles.sendId })
    .from(lienNoticeFiles)
    .where(and(eq(lienNoticeFiles.orgId, orgId), eq(lienNoticeFiles.projectId, projectId)))
    .all();
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.sendId, (counts.get(r.sendId) ?? 0) + 1);
  return counts;
}

export async function addNoticeFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  sendId: string,
  input: { file: File; category: AttachmentCategory },
  userId: string,
) {
  await assertLienWaivers(ctx, orgId);
  const files = bucket(ctx);
  const send = await assertSend(ctx, orgId, projectId, sendId);
  const [existing, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, sendId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  const problem = attachmentProblem(
    { name: input.file.name, sizeBytes: input.file.size },
    existing.length,
    { usedBytes: used, limitBytes: plan.attachmentStorageBytes },
    { max: MAX_ATTACHMENTS_PER_NOTICE, noun: "notice" },
  );
  if (problem) throw badRequest(problem);

  const fileName = cleanFileName(input.file.name);
  const contentType = ATTACHMENT_TYPES[extensionOf(fileName)] as string;
  const id = newId("att");
  const r2Key = `${noticePrefix(orgId, projectId, sendId)}${id}`;
  await files.put(r2Key, input.file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { orgId, sendId },
  });
  try {
    const [row] = await ctx.db
      .insert(lienNoticeFiles)
      .values({
        id,
        orgId,
        projectId,
        sendId,
        r2Key,
        fileName,
        contentType,
        sizeBytes: input.file.size,
        category: input.category,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return { file: dto(row) as AttachmentDto, recipient: send.recipient };
  } catch (e) {
    // The record was deleted mid-upload, or D1 failed: never leave an object no row owns.
    await files.delete(r2Key).catch(() => undefined);
    throw e;
  }
}

async function findRow(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  sendId: string,
  fileId: string | undefined,
) {
  const row = await ctx.db
    .select()
    .from(lienNoticeFiles)
    .where(
      and(
        eq(lienNoticeFiles.id, fileId ?? ""),
        eq(lienNoticeFiles.orgId, orgId),
        eq(lienNoticeFiles.projectId, projectId),
        eq(lienNoticeFiles.sendId, sendId),
      ),
    )
    .get();
  if (!row) throw notFound("Attachment");
  return row;
}

export async function getNoticeFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  sendId: string,
  fileId: string | undefined,
) {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, projectId, sendId, fileId);
  const object = await files.get(row.r2Key);
  if (!object) throw notFound("Attachment file");
  return { row: dto(row), body: object.body };
}

export async function deleteNoticeFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  sendId: string,
  fileId: string | undefined,
) {
  await assertLienWaivers(ctx, orgId);
  const files = bucket(ctx);
  const send = await assertSend(ctx, orgId, projectId, sendId);
  const row = await findRow(ctx, orgId, projectId, sendId, fileId);
  await ctx.db
    .delete(lienNoticeFiles)
    .where(and(eq(lienNoticeFiles.id, row.id), eq(lienNoticeFiles.orgId, orgId)));
  await files.delete(row.r2Key);
  return { row, recipient: send.recipient };
}

/**
 * The objects of a notice record's files, deleted before the record (whose rows then cascade). With
 * no bucket bound there can be no objects, so nothing to do.
 */
export async function purgeNoticeFiles(ctx: AppContext, orgId: string, sendId: string) {
  const rows = await rowsOf(ctx, orgId, sendId);
  if (rows.length === 0 || !ctx.env.FILES) return;
  await ctx.env.FILES.delete(rows.map((r) => r.r2Key));
}
