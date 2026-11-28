// Photos kept with a punch list item: the item as listed (before), the item fixed (after) and the
// GC's marked-up sheet it came from. The same rules, bucket and storage limit as RFI files
// (./rfi-files.ts); rows in punch_item_files, keys under orgs/{orgId}/projects/{projectId}/punch/
// {itemId}/, so deleting the item or the job clears them. Every member reads; editors add and
// delete, like the punch list itself.
//
// Safety, as for the other files: the stored Content-Type comes from the extension allow-list, never
// the browser; downloads are served as attachments with nosniff (routes/org/punch-list.ts); every
// lookup filters by org, job and item.
import {
  ATTACHMENT_TYPES,
  type AttachmentCategory,
  attachmentProblem,
  cleanFileName,
  extensionOf,
  MAX_ATTACHMENTS_PER_PUNCH_ITEM,
} from "@shared/attachments";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { punchItemFiles, punchItems } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { storageLimitBytes } from "../../ports/file-store";
import { orgPlan } from "../billing";
import { type AttachmentDto, type AttachmentListDto, bucket, dto, usedBytes } from "./attachments";

export const punchItemPrefix = (orgId: string, projectId: string, itemId: string) =>
  `orgs/${orgId}/projects/${projectId}/punch/${itemId}/`;

async function assertItem(ctx: AppContext, orgId: string, projectId: string, itemId: string) {
  const row = await ctx.db
    .select({ id: punchItems.id, number: punchItems.number })
    .from(punchItems)
    .where(
      and(
        eq(punchItems.id, itemId),
        eq(punchItems.orgId, orgId),
        eq(punchItems.projectId, projectId),
      ),
    )
    .get();
  if (!row) throw notFound("Punch item");
  return row;
}

const rowsOf = (ctx: AppContext, orgId: string, projectId: string, itemId: string) =>
  ctx.db
    .select()
    .from(punchItemFiles)
    .where(
      and(
        eq(punchItemFiles.orgId, orgId),
        eq(punchItemFiles.projectId, projectId),
        eq(punchItemFiles.itemId, itemId),
      ),
    )
    .orderBy(desc(punchItemFiles.createdAt));

export async function listPunchItemFiles(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  itemId: string,
): Promise<AttachmentListDto> {
  await assertItem(ctx, orgId, projectId, itemId);
  const [rows, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, projectId, itemId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  return {
    items: rows.map(dto),
    storage: { usedBytes: used, limitBytes: storageLimitBytes(ctx.env, plan) },
    enabled: Boolean(ctx.env.FILES),
  };
}

/** Every file row of one item, oldest first. */
export function punchItemFileRows(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  itemId: string,
) {
  return ctx.db
    .select()
    .from(punchItemFiles)
    .where(
      and(
        eq(punchItemFiles.orgId, orgId),
        eq(punchItemFiles.projectId, projectId),
        eq(punchItemFiles.itemId, itemId),
      ),
    )
    .orderBy(asc(punchItemFiles.createdAt), asc(punchItemFiles.id))
    .all();
}

/** Files per item on a job, for the list's "Photos (n)" link. */
export async function punchItemFileCounts(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<Map<string, number>> {
  const rows = await ctx.db
    .select({ itemId: punchItemFiles.itemId, n: sql<number>`count(*)` })
    .from(punchItemFiles)
    .where(and(eq(punchItemFiles.orgId, orgId), eq(punchItemFiles.projectId, projectId)))
    .groupBy(punchItemFiles.itemId)
    .all();
  return new Map(rows.map((r) => [r.itemId, Number(r.n)]));
}

export async function addPunchItemFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  itemId: string,
  input: { file: File; category: AttachmentCategory },
  userId: string,
): Promise<{ file: AttachmentDto; itemNumber: number }> {
  const files = bucket(ctx);
  const item = await assertItem(ctx, orgId, projectId, itemId);
  const [existing, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, projectId, itemId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  const problem = attachmentProblem(
    { name: input.file.name, sizeBytes: input.file.size },
    existing.length,
    { usedBytes: used, limitBytes: storageLimitBytes(ctx.env, plan) },
    { max: MAX_ATTACHMENTS_PER_PUNCH_ITEM, noun: "punch item" },
  );
  if (problem) throw badRequest(problem);

  const fileName = cleanFileName(input.file.name);
  const contentType = ATTACHMENT_TYPES[extensionOf(fileName)] as string;
  const id = newId("att");
  const r2Key = `${punchItemPrefix(orgId, projectId, itemId)}${id}`;
  await files.put(r2Key, input.file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { orgId, itemId },
  });
  try {
    const [row] = await ctx.db
      .insert(punchItemFiles)
      .values({
        id,
        orgId,
        projectId,
        itemId,
        r2Key,
        fileName,
        contentType,
        sizeBytes: input.file.size,
        category: input.category,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return { file: dto(row), itemNumber: item.number };
  } catch (e) {
    // The item was deleted mid-upload, or D1 failed: never leave an object no row owns.
    await files.delete(r2Key).catch(() => undefined);
    throw e;
  }
}

async function findRow(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  itemId: string,
  fileId: string | undefined,
) {
  const row = await ctx.db
    .select()
    .from(punchItemFiles)
    .where(
      and(
        eq(punchItemFiles.id, fileId ?? ""),
        eq(punchItemFiles.orgId, orgId),
        eq(punchItemFiles.projectId, projectId),
        eq(punchItemFiles.itemId, itemId),
      ),
    )
    .get();
  if (!row) throw notFound("Attachment");
  return row;
}

export async function getPunchItemFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  itemId: string,
  fileId: string | undefined,
) {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, projectId, itemId, fileId);
  const object = await files.get(row.r2Key);
  if (!object) throw notFound("Attachment file");
  return { row: dto(row), body: object.body };
}

export async function deletePunchItemFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  itemId: string,
  fileId: string | undefined,
) {
  const files = bucket(ctx);
  const item = await assertItem(ctx, orgId, projectId, itemId);
  const row = await findRow(ctx, orgId, projectId, itemId, fileId);
  await ctx.db
    .delete(punchItemFiles)
    .where(and(eq(punchItemFiles.id, row.id), eq(punchItemFiles.orgId, orgId)));
  await files.delete(row.r2Key);
  return { row, itemNumber: item.number };
}
