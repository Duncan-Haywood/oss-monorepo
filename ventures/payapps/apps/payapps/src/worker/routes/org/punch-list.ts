// /api/orgs/:orgId/projects/:projectId/punch-list: the job's punch list
// (services/payapps/punch-list.ts). Every member reads it and downloads the PDF and CSV; editors
// (who run the job's paperwork) add, change and delete. Free on every plan: it is rows of text and
// an on-request PDF. Each item keeps its photos (before, after, the marked-up sheet) under
// /:itemId/attachments, with the RFI files' rules (services/payapps/punch-item-files.ts).
import { punchItemSchema, punchItemsBulkSchema, updatePunchItemSchema } from "@shared/api/schemas";
import { ATTACHMENT_CATEGORIES, type AttachmentCategory } from "@shared/attachments";
import { Hono } from "hono";
import { badRequest } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  punchListCsv,
  punchListFileName,
  punchListPdf,
} from "../../services/export/punch-list-export";
import { MAX_UPLOAD_REQUEST_BYTES, purgeFiles } from "../../services/payapps/attachments";
import { getProjectRow } from "../../services/payapps/bundle";
import { recordJobEvents } from "../../services/payapps/job-history";
import {
  addPunchItemFile,
  deletePunchItemFile,
  getPunchItemFile,
  listPunchItemFiles,
  punchItemPrefix,
} from "../../services/payapps/punch-item-files";
import {
  createPunchItem,
  createPunchItems,
  deletePunchItem,
  listPunchItems,
  loadPunchListDocument,
  updatePunchItem,
} from "../../services/payapps/punch-list";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");
const projectId = (c: { req: { param: (k: "projectId") => string | undefined } }) =>
  c.req.param("projectId") ?? "";
/** `?only=open` prints the items still to fix or awaiting back-check; anything else prints all. */
const scopeOf = (v: string | undefined) => (v === "open" ? "open" : "all");

routes.get("/", async (c) =>
  c.json(await listPunchItems(c.var.ctx, c.var.tenant.orgId, projectId(c))),
);

// Registered before "/:itemId" so the literal segments are never read as an item id.
routes.get("/punch-list.csv", async (c) => {
  const doc = await loadPunchListDocument(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    scopeOf(c.req.query("only")),
  );
  return new Response(punchListCsv(doc), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${punchListFileName(doc.project, "csv")}"`,
      "Cache-Control": "no-store",
    },
  });
});

routes.get("/punch-list.pdf", async (c) => {
  const doc = await loadPunchListDocument(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    scopeOf(c.req.query("only")),
  );
  return new Response(punchListPdf(doc).slice().buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${punchListFileName(doc.project, "pdf")}"`,
      "Cache-Control": "no-store",
    },
  });
});

routes.post("/bulk", editor, validate("json", punchItemsBulkSchema), async (c) =>
  c.json(
    await createPunchItems(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.valid("json").items),
    201,
  ),
);

routes.post("/", editor, validate("json", punchItemSchema), async (c) =>
  c.json(
    await createPunchItem(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.valid("json")),
    201,
  ),
);

routes.patch("/:itemId", editor, validate("json", updatePunchItemSchema), async (c) =>
  c.json(
    await updatePunchItem(
      c.var.ctx,
      c.var.tenant.orgId,
      projectId(c),
      c.req.param("itemId"),
      c.req.valid("json"),
    ),
  ),
);

routes.delete("/:itemId", editor, async (c) => {
  const itemId = c.req.param("itemId");
  await deletePunchItem(c.var.ctx, c.var.tenant.orgId, projectId(c), itemId);
  // Its file rows cascaded with it; clear the stored objects too.
  await purgeFiles(c.var.ctx, punchItemPrefix(c.var.tenant.orgId, projectId(c), itemId));
  return c.json({ ok: true });
});

/** A photo row in the job history; the sample job writes none, as for its other rows. */
async function logFile(
  c: { var: AppEnv["Variables"] },
  jobId: string,
  itemId: string,
  action: "punch_file_added" | "punch_file_deleted",
  punchNumber: number,
  fileName: string,
) {
  const { ctx, tenant } = c.var;
  const project = await getProjectRow(ctx, tenant.orgId, jobId);
  if (project.isSample) return;
  await recordJobEvents(ctx, [
    {
      action,
      data: { punchNumber, fileName },
      subjectId: itemId,
      orgId: tenant.orgId,
      projectId: jobId,
      actorUserId: tenant.userId,
    },
  ]);
}

routes.get("/:itemId/attachments", async (c) =>
  c.json(
    await listPunchItemFiles(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.param("itemId")),
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
  const raw = String(form.get("category") ?? "photo");
  if (!(ATTACHMENT_CATEGORIES as readonly string[]).includes(raw)) {
    throw badRequest(`category must be one of ${ATTACHMENT_CATEGORIES.join(", ")}`);
  }
  const added = await addPunchItemFile(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    itemId,
    { file, category: raw as AttachmentCategory },
    c.var.tenant.userId,
  );
  await logFile(c, projectId(c), itemId, "punch_file_added", added.itemNumber, added.file.fileName);
  return c.json(added.file, 201);
});

routes.get("/:itemId/attachments/:fileId", async (c) => {
  const { row, body } = await getPunchItemFile(
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
  const { row, itemNumber } = await deletePunchItemFile(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    itemId,
    c.req.param("fileId"),
  );
  await logFile(c, projectId(c), itemId, "punch_file_deleted", itemNumber, row.fileName);
  return c.json({ ok: true });
});

export default routes;
