// /api/orgs/:orgId/projects/:projectId/rfis: the job's RFI log (services/payapps/rfis.ts). Every
// member reads it and downloads the PDF and CSV; editors (who run the job's paperwork) add, change
// and delete. Free on every plan: it is rows of text and an on-request PDF. Each change also writes
// the job history (sent, answered, linked to a change order: @shared/job-history `rfiEvents`), after
// it succeeds and never for the sample job, as the other job routes do.
import { rfiSchema, updateRfiSchema } from "@shared/api/schemas";
import type { RfiDto } from "@shared/api/types";
import { ATTACHMENT_CATEGORIES, type AttachmentCategory } from "@shared/attachments";
import { rfiEvents } from "@shared/job-history";
import { Hono } from "hono";
import { badRequest } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { rfiFileName, rfiLogCsv, rfiLogFileName, rfiPdf } from "../../services/export/rfi-export";
import { MAX_UPLOAD_REQUEST_BYTES, purgeFiles } from "../../services/payapps/attachments";
import { getProjectRow } from "../../services/payapps/bundle";
import { recordJobEvents } from "../../services/payapps/job-history";
import { buildRfiPacket, packetResponse } from "../../services/payapps/packet";
import {
  addRfiFile,
  deleteRfiFile,
  getRfiFile,
  listRfiFiles,
  rfiPrefix,
} from "../../services/payapps/rfi-files";
import {
  createRfi,
  deleteRfi,
  getRfi,
  listRfis,
  loadRfiDocument,
  loadRfiLog,
  updateRfi,
} from "../../services/payapps/rfis";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");
const projectId = (c: { req: { param: (k: "projectId") => string | undefined } }) =>
  c.req.param("projectId") ?? "";

routes.get("/", async (c) => c.json(await listRfis(c.var.ctx, c.var.tenant.orgId, projectId(c))));

// Registered before "/:rfiId/..." so the literal segment is never read as an RFI id.
routes.get("/rfis.csv", async (c) => {
  const { project, log } = await loadRfiLog(c.var.ctx, c.var.tenant.orgId, projectId(c));
  const name = rfiLogFileName(project);
  return new Response(rfiLogCsv(log), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
});

/** Writes the job history rows for one RFI change; the sample job writes none (nobody did it). */
async function logRfi(
  c: { var: AppEnv["Variables"] },
  jobId: string,
  before: RfiDto | null,
  after: RfiDto | null,
) {
  const { ctx, tenant } = c.var;
  const events = rfiEvents(before, after);
  if (events.length === 0) return;
  const project = await getProjectRow(ctx, tenant.orgId, jobId);
  if (project.isSample) return;
  const subjectId = (after ?? before)?.id ?? null;
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

routes.post("/", editor, validate("json", rfiSchema), async (c) => {
  const created = await createRfi(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.valid("json"));
  await logRfi(c, projectId(c), null, created);
  return c.json(created, 201);
});

routes.patch("/:rfiId", editor, validate("json", updateRfiSchema), async (c) => {
  const { ctx, tenant } = c.var;
  const rfiId = c.req.param("rfiId");
  const before = await getRfi(ctx, tenant.orgId, projectId(c), rfiId);
  const after = await updateRfi(ctx, tenant.orgId, projectId(c), rfiId, c.req.valid("json"));
  await logRfi(c, projectId(c), before, after);
  return c.json(after);
});

routes.delete("/:rfiId", editor, async (c) => {
  const { ctx, tenant } = c.var;
  const rfiId = c.req.param("rfiId");
  const before = await getRfi(ctx, tenant.orgId, projectId(c), rfiId);
  await deleteRfi(ctx, tenant.orgId, projectId(c), rfiId);
  // Its file rows cascaded with it; clear the stored objects too.
  await purgeFiles(ctx, rfiPrefix(tenant.orgId, projectId(c), rfiId));
  await logRfi(c, projectId(c), before, null);
  return c.json({ ok: true });
});

routes.get("/:rfiId/rfi.pdf", async (c) => {
  const doc = await loadRfiDocument(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    c.req.param("rfiId"),
  );
  return new Response(rfiPdf(doc).slice().buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${rfiFileName(doc)}"`,
      "Cache-Control": "no-store",
    },
  });
});

// The RFI PDF, an index, then the files that go with it (not the response that came back).
routes.get("/:rfiId/packet.pdf", async (c) =>
  packetResponse(
    await buildRfiPacket(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.param("rfiId")),
  ),
);

/** A file row in the job history; the sample job writes none, as for the RFI's own rows. */
async function logFile(
  c: { var: AppEnv["Variables"] },
  jobId: string,
  rfiId: string,
  action: "rfi_file_added" | "rfi_file_deleted",
  rfiNumber: number,
  fileName: string,
) {
  const { ctx, tenant } = c.var;
  const project = await getProjectRow(ctx, tenant.orgId, jobId);
  if (project.isSample) return;
  await recordJobEvents(ctx, [
    {
      action,
      data: { rfiNumber, fileName },
      subjectId: rfiId,
      orgId: tenant.orgId,
      projectId: jobId,
      actorUserId: tenant.userId,
    },
  ]);
}

routes.get("/:rfiId/attachments", async (c) =>
  c.json(await listRfiFiles(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.param("rfiId"))),
);

routes.post("/:rfiId/attachments", editor, async (c) => {
  const rfiId = c.req.param("rfiId");
  // Refuse an oversized body before buffering it.
  const length = Number(c.req.header("Content-Length") ?? "0");
  if (length > MAX_UPLOAD_REQUEST_BYTES) throw badRequest("The file is larger than 15 MB");
  if (!(c.req.header("Content-Type") ?? "").startsWith("multipart/form-data")) {
    throw badRequest("Send the file as multipart/form-data in a field named file");
  }
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Send the file in a field named file");
  const raw = String(form.get("category") ?? "backup");
  if (!(ATTACHMENT_CATEGORIES as readonly string[]).includes(raw)) {
    throw badRequest(`category must be one of ${ATTACHMENT_CATEGORIES.join(", ")}`);
  }
  const added = await addRfiFile(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    rfiId,
    { file, category: raw as AttachmentCategory },
    c.var.tenant.userId,
  );
  await logFile(c, projectId(c), rfiId, "rfi_file_added", added.rfiNumber, added.file.fileName);
  return c.json(added.file, 201);
});

routes.get("/:rfiId/attachments/:fileId", async (c) => {
  const { row, body } = await getRfiFile(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    c.req.param("rfiId"),
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

routes.delete("/:rfiId/attachments/:fileId", editor, async (c) => {
  const rfiId = c.req.param("rfiId");
  const { row, rfiNumber } = await deleteRfiFile(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    rfiId,
    c.req.param("fileId"),
  );
  await logFile(c, projectId(c), rfiId, "rfi_file_deleted", rfiNumber, row.fileName);
  return c.json({ ok: true });
});

export default routes;
