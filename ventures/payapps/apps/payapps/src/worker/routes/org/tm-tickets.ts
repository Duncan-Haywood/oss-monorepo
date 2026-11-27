// /api/orgs/:orgId/projects/:projectId/tm-tickets: the job's T&M tickets (services/payapps/tm-tickets.ts,
// docs/TM-TICKETS.md). Every member reads them and downloads the PDF and CSV; editors (who run the
// job's paperwork) write them up, record the GC's signature and bill them on a change order. Free on
// every plan, like the RFI and submittal logs. Photos and files per ticket
// (services/payapps/tm-ticket-files.ts) count against the plan's one storage limit. Each change also
// writes the job history (@shared/job-history `tmTicketEvents`), after it succeeds and never for the
// sample job, as the other job routes do.
import {
  tmChangeOrderSchema,
  tmRateSheetSchema,
  tmSignatureSchema,
  tmTicketSchema,
  updateTmTicketSchema,
} from "@shared/api/schemas";
import type { TmTicketDto } from "@shared/api/types";
import { ATTACHMENT_CATEGORIES, type AttachmentCategory } from "@shared/attachments";
import { type JobEventAction, type JobEventData, tmTicketEvents } from "@shared/job-history";
import { Hono } from "hono";
import { z } from "zod";
import { badRequest } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  tmTicketFileName,
  tmTicketLogCsv,
  tmTicketLogFileName,
  tmTicketPdf,
} from "../../services/export/tm-ticket-export";
import { MAX_UPLOAD_REQUEST_BYTES, purgeFiles } from "../../services/payapps/attachments";
import { getProjectRow } from "../../services/payapps/bundle";
import { recordJobEvents } from "../../services/payapps/job-history";
import { buildTmTicketPacket, packetResponse } from "../../services/payapps/packet";
import {
  addTmTicketFile,
  deleteTmTicketFile,
  getTmTicketFile,
  listTmTicketFiles,
  tmTicketPrefix,
} from "../../services/payapps/tm-ticket-files";
import {
  changeOrderFromTickets,
  createTmTicket,
  deleteTmRateSheet,
  deleteTmTicket,
  getTmTicket,
  loadTmTicketDocument,
  loadTmTicketLog,
  saveTmRateSheet,
  signTmTicket,
  tmSignatureImage,
  tmTicketLog,
  unsignTmTicket,
  updateTmTicket,
} from "../../services/payapps/tm-tickets";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");
const projectId = (c: { req: { param: (k: "projectId") => string | undefined } }) =>
  c.req.param("projectId") ?? "";
/** `?prices=0` prints the field copy (quantities and blank signature lines, no money). */
const pdfQuery = z.object({ prices: z.enum(["0", "1"]).optional() });

const pdfResponse = (bytes: Uint8Array, name: string) =>
  new Response(bytes.slice().buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });

/** Job history rows for a ticket or one of its files; the sample job writes none. */
async function logEvents(
  c: { var: AppEnv["Variables"] },
  jobId: string,
  subjectId: string,
  events: { action: JobEventAction; data: JobEventData }[],
) {
  if (events.length === 0) return;
  const { ctx, tenant } = c.var;
  const project = await getProjectRow(ctx, tenant.orgId, jobId);
  if (project.isSample) return;
  await recordJobEvents(
    ctx,
    events.map((e) => ({
      ...e,
      subjectId,
      orgId: tenant.orgId,
      projectId: jobId,
      actorUserId: tenant.userId,
    })),
  );
}

const logTicket = (
  c: { var: AppEnv["Variables"] },
  jobId: string,
  before: TmTicketDto | null,
  after: TmTicketDto | null,
) => logEvents(c, jobId, (after ?? before)?.id ?? "", tmTicketEvents(before, after));

routes.get("/", async (c) => c.json(await tmTicketLog(c.var.ctx, c.var.tenant, projectId(c))));

// Literal segments registered before "/:ticketId/..." so they are never read as a ticket id.
routes.get("/log.csv", async (c) => {
  const { project, tickets } = await loadTmTicketLog(c.var.ctx, c.var.tenant.orgId, projectId(c));
  return new Response(tmTicketLogCsv(tickets), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tmTicketLogFileName(project)}"`,
      "Cache-Control": "no-store",
    },
  });
});

/** The same tickets, then an index and every ticket's photos and files, in one PDF. */
routes.get("/change-order/:coId/backup-with-files.pdf", async (c) =>
  packetResponse(
    await buildTmTicketPacket(c.var.ctx, c.var.tenant.orgId, projectId(c), {
      changeOrderId: c.req.param("coId"),
    }),
  ),
);

/** Every ticket on one change order, priced, in one PDF: the backup the GC asks for with it. */
routes.get("/change-order/:coId/backup.pdf", async (c) => {
  const doc = await loadTmTicketDocument(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    { changeOrderId: c.req.param("coId") },
    true,
  );
  return pdfResponse(
    tmTicketPdf(doc),
    tmTicketFileName(doc, doc.tickets[0]?.changeOrderNumber ?? ""),
  );
});

routes.post("/change-order", editor, validate("json", tmChangeOrderSchema), async (c) => {
  const { ctx, tenant } = c.var;
  const out = await changeOrderFromTickets(ctx, tenant, projectId(c), c.req.valid("json"));
  // The job history gets the change order like one made on the project page (not on the sample job).
  const p = await getProjectRow(ctx, tenant.orgId, projectId(c));
  if (!p.isSample) {
    await recordJobEvents(ctx, [
      {
        orgId: tenant.orgId,
        projectId: p.id,
        actorUserId: tenant.userId,
        action: "change_order_created",
        subjectId: out.changeOrderId,
        data: {
          changeOrderNumber: out.number,
          amountCents: out.amountCents,
          description: out.description,
        },
      },
      ...out.billed.map((t) => ({
        orgId: tenant.orgId,
        projectId: p.id,
        actorUserId: tenant.userId,
        action: "tm_ticket_billed" as const,
        subjectId: t.id,
        data: {
          ticketNumber: t.number,
          changeOrderNumber: out.number,
          amountCents: t.amountCents,
        },
      })),
    ]);
  }
  return c.json(out, 201);
});

/** The job's rate sheet: replaced whole (PUT) or removed (DELETE); read with the log. */
routes.put("/rate-sheet", editor, validate("json", tmRateSheetSchema), async (c) =>
  c.json(await saveTmRateSheet(c.var.ctx, c.var.tenant, projectId(c), c.req.valid("json"))),
);

routes.delete("/rate-sheet", editor, async (c) => {
  await deleteTmRateSheet(c.var.ctx, c.var.tenant.orgId, projectId(c));
  return c.json({ ok: true });
});

routes.post("/", editor, validate("json", tmTicketSchema), async (c) => {
  const created = await createTmTicket(c.var.ctx, c.var.tenant, projectId(c), c.req.valid("json"));
  await logTicket(c, projectId(c), null, created);
  return c.json(created, 201);
});

routes.patch("/:ticketId", editor, validate("json", updateTmTicketSchema), async (c) => {
  const { ctx, tenant } = c.var;
  const ticketId = c.req.param("ticketId");
  const before = await getTmTicket(ctx, tenant.orgId, projectId(c), ticketId);
  const after = await updateTmTicket(ctx, tenant, projectId(c), ticketId, c.req.valid("json"));
  await logTicket(c, projectId(c), before, after);
  return c.json(after);
});

routes.delete("/:ticketId", editor, async (c) => {
  const { ctx, tenant } = c.var;
  const ticketId = c.req.param("ticketId");
  const before = await getTmTicket(ctx, tenant.orgId, projectId(c), ticketId);
  await deleteTmTicket(ctx, tenant.orgId, projectId(c), ticketId);
  // Its file rows cascaded with it; clear the stored objects too.
  await purgeFiles(ctx, tmTicketPrefix(tenant.orgId, projectId(c), ticketId));
  await logTicket(c, projectId(c), before, null);
  return c.json({ ok: true });
});

routes.put("/:ticketId/signature", editor, validate("json", tmSignatureSchema), async (c) => {
  const { ctx, tenant } = c.var;
  const ticketId = c.req.param("ticketId");
  const before = await getTmTicket(ctx, tenant.orgId, projectId(c), ticketId);
  const after = await signTmTicket(ctx, tenant, projectId(c), ticketId, c.req.valid("json"));
  await logTicket(c, projectId(c), before, after);
  return c.json(after);
});

routes.delete("/:ticketId/signature", editor, async (c) => {
  const { ctx, tenant } = c.var;
  const ticketId = c.req.param("ticketId");
  const before = await getTmTicket(ctx, tenant.orgId, projectId(c), ticketId);
  const after = await unsignTmTicket(ctx, tenant, projectId(c), ticketId);
  await logTicket(c, projectId(c), before, after);
  return c.json(after);
});

routes.get("/:ticketId/signature.jpg", async (c) => {
  const bytes = await tmSignatureImage(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    c.req.param("ticketId"),
  );
  return new Response(bytes.slice().buffer, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
});

routes.get("/:ticketId/ticket.pdf", validate("query", pdfQuery), async (c) => {
  const doc = await loadTmTicketDocument(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    { ticketId: c.req.param("ticketId") },
    c.req.valid("query").prices !== "0",
  );
  return pdfResponse(tmTicketPdf(doc), tmTicketFileName(doc));
});

// The ticket PDF, an index, then its photos and files.
routes.get("/:ticketId/packet.pdf", async (c) =>
  packetResponse(
    await buildTmTicketPacket(c.var.ctx, c.var.tenant.orgId, projectId(c), {
      ticketId: c.req.param("ticketId"),
    }),
  ),
);

routes.get("/:ticketId/attachments", async (c) =>
  c.json(
    await listTmTicketFiles(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.param("ticketId")),
  ),
);

routes.post("/:ticketId/attachments", editor, async (c) => {
  const ticketId = c.req.param("ticketId");
  // Refuse an oversized body before buffering it.
  const length = Number(c.req.header("Content-Length") ?? "0");
  if (length > MAX_UPLOAD_REQUEST_BYTES) throw badRequest("The file is larger than 15 MB");
  if (!(c.req.header("Content-Type") ?? "").startsWith("multipart/form-data")) {
    throw badRequest("Send the file as multipart/form-data in a field named file");
  }
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Send the file in a field named file");
  const raw = String(form.get("category") ?? "photo");
  if (!(ATTACHMENT_CATEGORIES as readonly string[]).includes(raw)) {
    throw badRequest(`category must be one of ${ATTACHMENT_CATEGORIES.join(", ")}`);
  }
  const added = await addTmTicketFile(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    ticketId,
    { file, category: raw as AttachmentCategory },
    c.var.tenant.userId,
  );
  await logEvents(c, projectId(c), ticketId, [
    {
      action: "tm_ticket_file_added",
      data: { ticketNumber: added.ticketNumber, fileName: added.file.fileName },
    },
  ]);
  return c.json(added.file, 201);
});

routes.get("/:ticketId/attachments/:fileId", async (c) => {
  const { row, body } = await getTmTicketFile(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    c.req.param("ticketId"),
    c.req.param("fileId"),
  );
  return new Response(body, {
    headers: {
      "Content-Type": row.contentType,
      "Content-Length": String(row.sizeBytes),
      // RFC 6266: an ASCII fallback plus the exact UTF-8 name.
      "Content-Disposition": `attachment; filename="${row.fileName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

routes.delete("/:ticketId/attachments/:fileId", editor, async (c) => {
  const ticketId = c.req.param("ticketId");
  const { row, ticketNumber } = await deleteTmTicketFile(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    ticketId,
    c.req.param("fileId"),
  );
  await logEvents(c, projectId(c), ticketId, [
    { action: "tm_ticket_file_deleted", data: { ticketNumber, fileName: row.fileName } },
  ]);
  return c.json({ ok: true });
});

export default routes;
