// Files attached to a change order: the backup a GC asks for before signing one (supplier quotes,
// time-and-material tickets, invoices), photos of the condition that caused it, and the signed
// change order that comes back. The same rules, bucket and storage limit as pay-application files
// (./attachments.ts, src/shared/attachments.ts); rows in change_order_attachments, keys under
// orgs/{orgId}/projects/{projectId}/change-orders/{changeOrderId}/, so deleting the job clears them.
//
// Safety, as for pay-app files: the stored Content-Type comes from the extension allow-list, never
// the browser; downloads are served as attachments with nosniff (routes/org/projects.ts); every
// lookup filters by org, job and change order.
import {
  ATTACHMENT_TYPES,
  type AttachmentCategory,
  attachmentProblem,
  cleanFileName,
  extensionOf,
  MAX_ATTACHMENTS_PER_CHANGE_ORDER,
} from "@shared/attachments";
import { and, asc, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { changeOrderAttachments, changeOrders } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { orgPlan } from "../billing";
import { type AttachmentDto, type AttachmentListDto, bucket, dto, usedBytes } from "./attachments";

export const changeOrderPrefix = (orgId: string, projectId: string, changeOrderId: string) =>
  `orgs/${orgId}/projects/${projectId}/change-orders/${changeOrderId}/`;

async function assertChangeOrder(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  changeOrderId: string,
) {
  const row = await ctx.db
    .select({ id: changeOrders.id, number: changeOrders.number })
    .from(changeOrders)
    .where(
      and(
        eq(changeOrders.id, changeOrderId),
        eq(changeOrders.orgId, orgId),
        eq(changeOrders.projectId, projectId),
      ),
    )
    .get();
  if (!row) throw notFound("Change order");
  return row;
}

const rowsOf = (ctx: AppContext, orgId: string, changeOrderId: string) =>
  ctx.db
    .select()
    .from(changeOrderAttachments)
    .where(
      and(
        eq(changeOrderAttachments.orgId, orgId),
        eq(changeOrderAttachments.changeOrderId, changeOrderId),
      ),
    )
    .orderBy(desc(changeOrderAttachments.createdAt));

export async function listChangeOrderAttachments(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  changeOrderId: string,
): Promise<AttachmentListDto> {
  await assertChangeOrder(ctx, orgId, projectId, changeOrderId);
  const [rows, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, changeOrderId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  return {
    items: rows.map(dto),
    storage: { usedBytes: used, limitBytes: plan.attachmentStorageBytes },
    enabled: Boolean(ctx.env.FILES),
  };
}

/** Names and kinds of a change order's files, oldest first, for the request PDF's backup list. */
export async function changeOrderBackupList(
  ctx: AppContext,
  orgId: string,
  changeOrderId: string,
): Promise<{ fileName: string; category: AttachmentCategory }[]> {
  return ctx.db
    .select({
      fileName: changeOrderAttachments.fileName,
      category: changeOrderAttachments.category,
    })
    .from(changeOrderAttachments)
    .where(
      and(
        eq(changeOrderAttachments.orgId, orgId),
        eq(changeOrderAttachments.changeOrderId, changeOrderId),
      ),
    )
    .orderBy(asc(changeOrderAttachments.createdAt), asc(changeOrderAttachments.id));
}

export async function addChangeOrderAttachment(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  changeOrderId: string,
  input: { file: File; category: AttachmentCategory },
  userId: string,
): Promise<AttachmentDto> {
  const files = bucket(ctx);
  await assertChangeOrder(ctx, orgId, projectId, changeOrderId);
  const [existing, used, { plan }] = await Promise.all([
    rowsOf(ctx, orgId, changeOrderId),
    usedBytes(ctx, orgId),
    orgPlan(ctx, orgId),
  ]);
  const problem = attachmentProblem(
    { name: input.file.name, sizeBytes: input.file.size },
    existing.length,
    { usedBytes: used, limitBytes: plan.attachmentStorageBytes },
    { max: MAX_ATTACHMENTS_PER_CHANGE_ORDER, noun: "change order" },
  );
  if (problem) throw badRequest(problem);

  const fileName = cleanFileName(input.file.name);
  const contentType = ATTACHMENT_TYPES[extensionOf(fileName)] as string;
  const id = newId("att");
  const r2Key = `${changeOrderPrefix(orgId, projectId, changeOrderId)}${id}`;
  await files.put(r2Key, input.file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { orgId, changeOrderId },
  });
  try {
    const [row] = await ctx.db
      .insert(changeOrderAttachments)
      .values({
        id,
        orgId,
        projectId,
        changeOrderId,
        r2Key,
        fileName,
        contentType,
        sizeBytes: input.file.size,
        category: input.category,
        createdBy: userId,
      })
      .returning();
    if (!row) throw new Error("insert returned no row");
    return dto(row);
  } catch (e) {
    // The change order was deleted mid-upload, or D1 failed: never leave an object no row owns.
    await files.delete(r2Key).catch(() => undefined);
    throw e;
  }
}

async function findRow(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  changeOrderId: string,
  attachmentId: string | undefined,
) {
  const row = await ctx.db
    .select()
    .from(changeOrderAttachments)
    .where(
      and(
        eq(changeOrderAttachments.id, attachmentId ?? ""),
        eq(changeOrderAttachments.orgId, orgId),
        eq(changeOrderAttachments.projectId, projectId),
        eq(changeOrderAttachments.changeOrderId, changeOrderId),
      ),
    )
    .get();
  if (!row) throw notFound("Attachment");
  return row;
}

export async function getChangeOrderAttachmentFile(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  changeOrderId: string,
  attachmentId: string | undefined,
) {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, projectId, changeOrderId, attachmentId);
  const object = await files.get(row.r2Key);
  if (!object) throw notFound("Attachment file");
  return { row: dto(row), body: object.body };
}

export async function deleteChangeOrderAttachment(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  changeOrderId: string,
  attachmentId: string | undefined,
) {
  const files = bucket(ctx);
  const row = await findRow(ctx, orgId, projectId, changeOrderId, attachmentId);
  await ctx.db
    .delete(changeOrderAttachments)
    .where(and(eq(changeOrderAttachments.id, row.id), eq(changeOrderAttachments.orgId, orgId)));
  await files.delete(row.r2Key);
  return row;
}
