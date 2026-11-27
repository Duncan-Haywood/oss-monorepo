// /api/orgs/:orgId/projects/:projectId/closeout: the job's close-out checklist and what still stands
// between it and its retainage (services/payapps/closeout.ts). Every member reads it; editors (who
// run the job's paperwork) add, change and delete. Free on every plan: it is rows of text. Each
// document keeps its files (the document as sent, photos, the GC's receipt) under the same rules as
// RFI files, and `binder.pdf` puts the transmittal and those files in one PDF for the GC. Adding or
// removing a file writes the job history, after it succeeds and never for the sample job.
import {
  closeoutItemSchema,
  closeoutStandardSchema,
  updateCloseoutItemSchema,
} from "@shared/api/schemas";
import { ATTACHMENT_CATEGORIES, type AttachmentCategory } from "@shared/attachments";
import type { JobEventAction } from "@shared/job-history";
import { Hono } from "hono";
import { badRequest } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { MAX_UPLOAD_REQUEST_BYTES, purgeFiles } from "../../services/payapps/attachments";
import { getProjectRow } from "../../services/payapps/bundle";
import {
  addStandardCloseout,
  createCloseoutItem,
  deleteCloseoutItem,
  listCloseout,
  updateCloseoutItem,
} from "../../services/payapps/closeout";
import {
  addCloseoutFile,
  closeoutPrefix,
  deleteCloseoutFile,
  getCloseoutFile,
  listCloseoutFiles,
} from "../../services/payapps/closeout-files";
import { recordJobEvents } from "../../services/payapps/job-history";
import { buildCloseoutBinder, packetResponse } from "../../services/payapps/packet";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");
const projectId = (c: { req: { param: (k: "projectId") => string | undefined } }) =>
  c.req.param("projectId") ?? "";

routes.get("/", async (c) =>
  c.json(await listCloseout(c.var.ctx, c.var.tenant.orgId, projectId(c))),
);

// Literal segments registered before "/:itemId" so they are never read as an item id.
// The transmittal, an index, then each required document's files (not the GC's receipt).
routes.get("/binder.pdf", async (c) =>
  packetResponse(await buildCloseoutBinder(c.var.ctx, c.var.tenant.orgId, projectId(c))),
);

routes.post("/standard", editor, validate("json", closeoutStandardSchema), async (c) =>
  c.json(
    await addStandardCloseout(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.valid("json")),
    201,
  ),
);

routes.post("/", editor, validate("json", closeoutItemSchema), async (c) =>
  c.json(
    await createCloseoutItem(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.valid("json")),
    201,
  ),
);

routes.patch("/:itemId", editor, validate("json", updateCloseoutItemSchema), async (c) =>
  c.json(
    await updateCloseoutItem(
      c.var.ctx,
      c.var.tenant.orgId,
      projectId(c),
      c.req.param("itemId"),
      c.req.valid("json"),
    ),
  ),
);

routes.delete("/:itemId", editor, async (c) => {
  const { ctx, tenant } = c.var;
  const itemId = c.req.param("itemId");
  await deleteCloseoutItem(ctx, tenant.orgId, projectId(c), itemId);
  // Its file rows cascaded with it; clear the stored objects too.
  await purgeFiles(ctx, closeoutPrefix(tenant.orgId, projectId(c), itemId));
  return c.json({ ok: true });
});

/** The job history row for one file added or removed; the sample job writes none. */
async function logFile(
  c: { var: AppEnv["Variables"] },
  jobId: string,
  itemId: string,
  action: JobEventAction,
  title: string,
  fileName: string,
) {
  const { ctx, tenant } = c.var;
  const project = await getProjectRow(ctx, tenant.orgId, jobId);
  if (project.isSample) return;
  await recordJobEvents(ctx, [
    {
      action,
      data: { description: title, fileName },
      subjectId: itemId,
      orgId: tenant.orgId,
      projectId: jobId,
      actorUserId: tenant.userId,
    },
  ]);
}

routes.get("/:itemId/attachments", async (c) =>
  c.json(
    await listCloseoutFiles(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.param("itemId")),
  ),
);

routes.post("/:itemId/attachments", editor, async (c) => {
  const itemId = c.req.param("itemId");
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
  const added = await addCloseoutFile(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    itemId,
    { file, category: raw as AttachmentCategory },
    c.var.tenant.userId,
  );
  await logFile(c, projectId(c), itemId, "closeout_file_added", added.title, added.file.fileName);
  return c.json(added.file, 201);
});

routes.get("/:itemId/attachments/:fileId", async (c) => {
  const { row, body } = await getCloseoutFile(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    c.req.param("itemId"),
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

routes.delete("/:itemId/attachments/:fileId", editor, async (c) => {
  const itemId = c.req.param("itemId");
  const { row, title } = await deleteCloseoutFile(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    itemId,
    c.req.param("fileId"),
  );
  await logFile(c, projectId(c), itemId, "closeout_file_deleted", title, row.fileName);
  return c.json({ ok: true });
});

export default routes;
