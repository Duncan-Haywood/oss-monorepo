// Backup packets: one PDF to send the GC, made of a document PayApps writes, an index, then the
// files attached to it (PDFs and JPEG/PNG photos) as uploaded.
// - Pay application: the application PDF, then the files named (in that order) or by default every
//   file except the signed application the GC returned, backup first, then photos, then other files,
//   oldest first within each.
// - Change order: the request PDF, then every file except the signed change order, oldest first:
//   the same files, in the same order, as the request's "Backup attached" list.
import { type AttachmentCategory, CATEGORY_LABELS } from "@shared/attachments";
import { changeOrderFileName } from "@shared/change-order-request";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { changeOrderAttachments, payAppAttachments } from "../../db/schema";
import { badRequest } from "../../lib/errors";
import { applicationPdf } from "../export/application-pdf";
import { changeOrderPdf } from "../export/change-order-pdf";
import { exportFileName } from "../export/model";
import { assemblePacket, type PacketFile, type PacketResult } from "../export/pdf-merge/packet";
import { bucket } from "./attachments";
import { loadApplicationDocument, loadChangeOrderRequest } from "./documents";

/** Short kind names for the index (the upload form's labels are longer). */
export const PACKET_KIND: Record<AttachmentCategory, string> = {
  backup: "Backup",
  photo: "Job photo",
  signed: "Signed application",
  other: "Other",
};

const DEFAULT_ORDER: AttachmentCategory[] = ["backup", "photo", "other"];

/** The default selection and order, from rows sorted oldest first. */
export function defaultPacketOrder<T extends { category: AttachmentCategory }>(rows: T[]): T[] {
  return DEFAULT_ORDER.flatMap((c) => rows.filter((r) => r.category === c));
}

const usDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${Number(m)}/${Number(d)}/${y}` : iso;
};

export async function buildPayAppPacket(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  payAppId: string,
  ids: string[] | null,
): Promise<PacketResult & { fileName: string }> {
  const data = await loadApplicationDocument(ctx, orgId, projectId, payAppId);
  const rows = await ctx.db
    .select()
    .from(payAppAttachments)
    .where(
      and(
        eq(payAppAttachments.orgId, orgId),
        eq(payAppAttachments.projectId, projectId),
        eq(payAppAttachments.payAppId, payAppId),
      ),
    )
    .orderBy(asc(payAppAttachments.createdAt))
    .all();
  let chosen = defaultPacketOrder(rows);
  if (ids) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const unknown = ids.filter((id) => !byId.has(id));
    if (unknown.length)
      throw badRequest("A file chosen for the packet is not on this pay application");
    chosen = [...new Set(ids)].map((id) => byId.get(id) as (typeof rows)[number]);
  }
  const files = chosen.length ? bucket(ctx) : null;
  const packetFiles: PacketFile[] = chosen.map((r) => ({
    id: r.id,
    name: r.fileName,
    kind: PACKET_KIND[r.category] ?? CATEGORY_LABELS[r.category],
    contentType: r.contentType,
    sizeBytes: r.sizeBytes,
    load: async () => {
      const object = await files?.get(r.r2Key);
      return object ? new Uint8Array(await object.arrayBuffer()) : null;
    },
  }));

  const { project, payApp } = data;
  const label = `Application #${payApp.number}`;
  const result = await assemblePacket({
    lead: applicationPdf(data),
    files: packetFiles,
    label,
    title: `${project.name} - ${label} with backup`,
    leadName: "the application",
    heading: `Backup for Application #${payApp.number}`,
    details: [
      `Job: ${project.name}${project.number ? ` (${project.number})` : ""}`,
      `From: ${data.contractor.name}   To: ${project.gcName}`,
      `Period: ${usDate(payApp.periodFrom)} to ${usDate(payApp.periodTo)}   Application date: ${usDate(payApp.applicationDate)}`,
      ...(project.sample ? ["SAMPLE DATA - NOT A REAL APPLICATION"] : []),
      ...(payApp.status === "draft" ? ["DRAFT - NOT SUBMITTED"] : []),
    ],
  });
  return { ...result, fileName: exportFileName(data, "pdf", "-with-backup") };
}

const CHANGE_ORDER_KIND: Record<AttachmentCategory, string> = {
  backup: "Pricing backup",
  photo: "Photo",
  signed: "Signed change order",
  other: "Other",
};

export async function buildChangeOrderPacket(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  changeOrderId: string,
): Promise<PacketResult & { fileName: string }> {
  // Loads the request (404 when the change order is not on this job of this company) first.
  const data = await loadChangeOrderRequest(ctx, orgId, projectId, changeOrderId);
  const rows = await ctx.db
    .select()
    .from(changeOrderAttachments)
    .where(
      and(
        eq(changeOrderAttachments.orgId, orgId),
        eq(changeOrderAttachments.projectId, projectId),
        eq(changeOrderAttachments.changeOrderId, changeOrderId),
      ),
    )
    .orderBy(asc(changeOrderAttachments.createdAt), asc(changeOrderAttachments.id))
    .all();
  const chosen = rows.filter((r) => r.category !== "signed");
  const files = chosen.length ? bucket(ctx) : null;
  const { project, changeOrder } = data;
  const label = `Change order ${changeOrder.number}`;
  const result = await assemblePacket({
    lead: changeOrderPdf(data),
    files: chosen.map((r) => ({
      id: r.id,
      name: r.fileName,
      kind: CHANGE_ORDER_KIND[r.category],
      contentType: r.contentType,
      sizeBytes: r.sizeBytes,
      load: async () => {
        const object = await files?.get(r.r2Key);
        return object ? new Uint8Array(await object.arrayBuffer()) : null;
      },
    })),
    label,
    title: `${project.name} - ${label} with backup`,
    leadName: "the change order",
    heading: `Backup for change order ${changeOrder.number}`,
    details: [
      `Job: ${project.name}${project.number ? ` (${project.number})` : ""}`,
      `From: ${data.contractor.name}   To: ${project.gcName}`,
      `Change order: ${changeOrder.description}`,
    ],
  });
  return { ...result, fileName: changeOrderFileName(data).replace(/\.pdf$/, "-with-backup.pdf") };
}

/** The packet as a streamed download: the chunks go out as they are, never joined in memory. */
export function packetResponse(packet: PacketResult & { fileName: string }): Response {
  const chunks = packet.chunks;
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks[i++];
      if (next) controller.enqueue(next);
      else controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(packet.length),
      "Content-Disposition": `attachment; filename="${packet.fileName}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Packet-Pages": String(packet.pages),
      "X-Packet-Files": String(packet.included.length),
      "X-Packet-Skipped": String(packet.skipped.length),
    },
  });
}
