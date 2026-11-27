// Backup packets: one PDF to send the GC, made of a document PayApps writes, an index, then the
// files attached to it (PDFs and JPEG/PNG photos) as uploaded.
// - Pay application: the application PDF, then the files named (in that order) or by default every
//   file except the signed application the GC returned, backup first, then photos, then other files,
//   oldest first within each.
// - Change order: the request PDF, then every file except the signed change order, oldest first:
//   the same files, in the same order, as the request's "Backup attached" list.
// - RFI: the RFI PDF, then every file except the response that came back, oldest first: the same
//   files, in the same order, as the RFI's "Attached" list.
// - T&M ticket: the ticket PDF, then every file kept with it (photos of the work, material backup and
//   a scan of a paper-signed copy), oldest first; for a change order, every ticket on it, then each
//   ticket's files in ticket order: the backup a GC asks for before approving T&M work.
// - Close-out binder: the close-out transmittal, then each required document's files (not the GC's
//   receipt), documents in checklist order: the same files, in the same order, as its "Enclosed" list.
import { type AttachmentCategory, CATEGORY_LABELS } from "@shared/attachments";
import { changeOrderFileName } from "@shared/change-order-request";
import { rfiLabel } from "@shared/rfi";
import { tmLabel } from "@shared/tm-tickets";
import { and, asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { changeOrderAttachments, lowerTierWaivers, payAppAttachments } from "../../db/schema";
import { badRequest } from "../../lib/errors";
import { applicationPdf } from "../export/application-pdf";
import { changeOrderPdf } from "../export/change-order-pdf";
import {
  closeoutTransmittalFileName,
  closeoutTransmittalPdf,
} from "../export/closeout-transmittal-pdf";
import { dailyReportFileName, dailyReportPdf } from "../export/daily-report-export";
import { exportFileName } from "../export/model";
import { assemblePacket, type PacketFile, type PacketResult } from "../export/pdf-merge/packet";
import { rfiFileName, rfiPdf } from "../export/rfi-export";
import { tmTicketFileName, tmTicketPdf } from "../export/tm-ticket-export";
import { bucket } from "./attachments";
import { loadCloseoutBinder } from "./closeout";
import {
  dailyReportFileKind,
  dailyReportFileRows,
  inDailyReportPacket,
} from "./daily-report-files";
import { loadDailyReportDocument } from "./daily-reports";
import { loadApplicationDocument, loadChangeOrderRequest } from "./documents";
import { rfiFileKind, rfiFileRows, sentWithRfi } from "./rfi-files";
import { loadRfiDocument } from "./rfis";
import { tmTicketFileKind, tmTicketFileRows } from "./tm-ticket-files";
import { loadTmTicketDocument } from "./tm-tickets";

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
  // A file filed on a lower-tier waiver row is named for it in the index.
  const waivers = rows.some((r) => r.lowerTierWaiverId)
    ? await ctx.db
        .select({ id: lowerTierWaivers.id, party: lowerTierWaivers.party })
        .from(lowerTierWaivers)
        .where(and(eq(lowerTierWaivers.orgId, orgId), eq(lowerTierWaivers.payAppId, payAppId)))
        .all()
    : [];
  const partyOf = new Map(waivers.map((w) => [w.id, w.party]));
  const kindOf = (r: (typeof rows)[number]) => {
    const party = r.lowerTierWaiverId ? partyOf.get(r.lowerTierWaiverId) : undefined;
    return party
      ? `Lower-tier waiver: ${party}`
      : (PACKET_KIND[r.category] ?? CATEGORY_LABELS[r.category]);
  };
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
    kind: kindOf(r),
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

export async function buildRfiPacket(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  rfiId: string,
): Promise<PacketResult & { fileName: string }> {
  // Loads the RFI (404 when it is not on this job of this company) first.
  const doc = await loadRfiDocument(ctx, orgId, projectId, rfiId);
  const chosen = (await rfiFileRows(ctx, orgId, projectId, rfiId)).filter((r) =>
    sentWithRfi(r.category),
  );
  const files = chosen.length ? bucket(ctx) : null;
  const { project, rfi } = doc;
  const label = rfiLabel(rfi.number);
  const result = await assemblePacket({
    lead: rfiPdf(doc),
    files: chosen.map((r) => ({
      id: r.id,
      name: r.fileName,
      kind: rfiFileKind(r.category),
      contentType: r.contentType,
      sizeBytes: r.sizeBytes,
      load: async () => {
        const object = await files?.get(r.r2Key);
        return object ? new Uint8Array(await object.arrayBuffer()) : null;
      },
    })),
    label,
    title: `${project.name} - ${label} with files`,
    leadName: "the RFI",
    heading: `Files for ${label}`,
    details: [
      `Job: ${project.name}${project.number ? ` (${project.number})` : ""}`,
      `From: ${doc.contractor.name}   To: ${project.gcName}`,
      `Subject: ${rfi.subject}`,
      ...(project.isSample ? ["SAMPLE DATA - NOT A REAL RFI"] : []),
    ],
  });
  return { ...result, fileName: rfiFileName(doc).replace(/\.pdf$/, "-with-files.pdf") };
}

/**
 * One daily report, an index, then its photos and files (not a signed copy of the report itself):
 * the day's record as one PDF for the GC, or for a delay claim. Photos go in one to a page.
 */
export async function buildDailyReportPacket(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  reportId: string,
): Promise<PacketResult & { fileName: string }> {
  // Loads the report (404 when it is not on this job of this company) first.
  const doc = await loadDailyReportDocument(ctx, orgId, projectId, { reportId });
  const chosen = (await dailyReportFileRows(ctx, orgId, projectId, reportId)).filter((r) =>
    inDailyReportPacket(r.category),
  );
  const files = chosen.length ? bucket(ctx) : null;
  const { project } = doc;
  const date = doc.reports[0]?.reportDate ?? "";
  const label = `Daily report ${date}`;
  const result = await assemblePacket({
    lead: dailyReportPdf(doc),
    files: chosen.map((r) => ({
      id: r.id,
      name: r.fileName,
      kind: dailyReportFileKind(r.category),
      contentType: r.contentType,
      sizeBytes: r.sizeBytes,
      load: async () => {
        const object = await files?.get(r.r2Key);
        return object ? new Uint8Array(await object.arrayBuffer()) : null;
      },
    })),
    label,
    title: `${project.name} - ${label} with photos and files`,
    leadName: "the daily report",
    heading: `Photos and files for the ${date} daily report`,
    details: [
      `Job: ${project.name}${project.number ? ` (${project.number})` : ""}`,
      `From: ${doc.contractor.name}   To: ${project.gcName}`,
      ...(project.isSample ? ["SAMPLE DATA - NOT A REAL DAILY REPORT"] : []),
    ],
  });
  return {
    ...result,
    fileName: dailyReportFileName(doc).replace(/\.pdf$/, "-with-files.pdf"),
  };
}

/**
 * One T&M ticket (`ticketId`) or every ticket billed on one change order (`changeOrderId`), priced,
 * then an index and the photos and files kept with each ticket, in ticket order. Every kind goes in:
 * on a ticket the GC signed on paper, the scan of that paper is the signature.
 */
export async function buildTmTicketPacket(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  pick: { ticketId: string } | { changeOrderId: string },
): Promise<PacketResult & { fileName: string }> {
  // Loads the tickets (404 when they are not on this job of this company) first.
  const doc = await loadTmTicketDocument(ctx, orgId, projectId, pick, true);
  const perTicket = await Promise.all(
    doc.tickets.map(async (t) => ({
      t,
      rows: await tmTicketFileRows(ctx, orgId, projectId, t.id),
    })),
  );
  const many = doc.tickets.length > 1;
  const chosen = perTicket.flatMap(({ t, rows }) =>
    rows.map((r) => ({
      r,
      kind: `${many ? `${tmLabel(t.number)}: ` : ""}${tmTicketFileKind(r.category)}`,
    })),
  );
  const files = chosen.length ? bucket(ctx) : null;
  const { project } = doc;
  const coNumber = "changeOrderId" in pick ? (doc.tickets[0]?.changeOrderNumber ?? "") : undefined;
  const label =
    coNumber !== undefined
      ? `T&M tickets on change order ${coNumber}`
      : tmLabel(doc.tickets[0]?.number ?? 0);
  const result = await assemblePacket({
    lead: tmTicketPdf(doc),
    files: chosen.map(({ r, kind }) => ({
      id: r.id,
      name: r.fileName,
      kind,
      contentType: r.contentType,
      sizeBytes: r.sizeBytes,
      load: async () => {
        const object = await files?.get(r.r2Key);
        return object ? new Uint8Array(await object.arrayBuffer()) : null;
      },
    })),
    label,
    title: `${project.name} - ${label} with photos and files`,
    leadName: many ? "the T&M tickets" : "the T&M ticket",
    heading: `Photos and files for ${label}`,
    details: [
      `Job: ${project.name}${project.number ? ` (${project.number})` : ""}`,
      `From: ${doc.contractor.name}   To: ${project.gcName}`,
      ...(project.isSample ? ["SAMPLE DATA - NOT A REAL T&M TICKET"] : []),
    ],
  });
  return {
    ...result,
    fileName: tmTicketFileName(doc, coNumber).replace(/\.pdf$/, "-with-files.pdf"),
  };
}

/**
 * The close-out binder: one PDF for the GC with the transmittal on top (every document on the
 * checklist and its dates), an index, then the files kept with each required document. A file past
 * the packet's size budget, or one it cannot read, is listed as left out on the index.
 */
export async function buildCloseoutBinder(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<PacketResult & { fileName: string }> {
  const doc = await loadCloseoutBinder(ctx, orgId, projectId);
  const files = doc.files.length ? bucket(ctx) : null;
  const number = new Map(doc.items.map((it, i) => [it.id, i + 1]));
  const title = new Map(doc.items.map((it) => [it.id, it.title]));
  const { project } = doc;
  const result = await assemblePacket({
    lead: closeoutTransmittalPdf(doc),
    files: doc.files.map((f) => ({
      id: f.id,
      name: f.fileName,
      kind: `${number.get(f.itemId) ?? "?"}. ${title.get(f.itemId) ?? f.kind}`,
      contentType: f.contentType,
      sizeBytes: f.sizeBytes,
      load: async () => {
        const object = await files?.get(f.r2Key);
        return object ? new Uint8Array(await object.arrayBuffer()) : null;
      },
    })),
    label: "Close-out",
    title: `${project.name} - close-out binder`,
    leadName: "the transmittal",
    heading: "Close-out documents enclosed",
    details: [
      `Job: ${project.name}${project.number ? ` (${project.number})` : ""}`,
      `From: ${doc.contractor.name}   To: ${project.gcName}`,
      ...(project.isSample ? ["SAMPLE DATA - NOT A REAL CLOSE-OUT"] : []),
    ],
  });
  return {
    ...result,
    fileName: closeoutTransmittalFileName(doc).replace(/\.pdf$/, "-binder.pdf"),
  };
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
