// /api/orgs/:orgId/documents — the company's licenses, W-9, bonding letter and other compliance
// documents (services/company-documents.ts) and the files kept with each
// (services/company-document-files.ts). Every member reads them; editors (who prepare pay
// applications) add, change, archive and delete.
import { companyDocumentSchema, updateCompanyDocumentSchema } from "@shared/api/schemas";
import { ATTACHMENT_CATEGORIES, type AttachmentCategory } from "@shared/attachments";
import { W9_FILE_CONSENT_FIELD } from "@shared/company-documents";
import { Hono } from "hono";
import { badRequest } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  addDocumentFile,
  deleteDocumentFile,
  getDocumentFile,
  listDocumentFiles,
} from "../../services/company-document-files";
import {
  createCompanyDocument,
  deleteCompanyDocument,
  listCompanyDocuments,
  updateCompanyDocument,
} from "../../services/company-documents";
import { MAX_UPLOAD_REQUEST_BYTES } from "../../services/payapps/attachments";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");

routes.get("/", async (c) => c.json(await listCompanyDocuments(c.var.ctx, c.var.tenant.orgId)));

routes.post("/", editor, validate("json", companyDocumentSchema), async (c) => {
  const { orgId, userId } = c.var.tenant;
  return c.json(await createCompanyDocument(c.var.ctx, orgId, userId, c.req.valid("json")), 201);
});

routes.patch("/:id", editor, validate("json", updateCompanyDocumentSchema), async (c) =>
  c.json(
    await updateCompanyDocument(
      c.var.ctx,
      c.var.tenant.orgId,
      c.req.param("id"),
      c.req.valid("json"),
    ),
  ),
);

routes.delete("/:id", editor, async (c) => {
  await deleteCompanyDocument(c.var.ctx, c.var.tenant.orgId, c.req.param("id"));
  return c.json({ ok: true });
});

// The files kept with one document: every member lists and downloads, editors add and delete.
routes.get("/:id/attachments", async (c) =>
  c.json(await listDocumentFiles(c.var.ctx, c.var.tenant.orgId, c.req.param("id"))),
);

routes.post("/:id/attachments", editor, async (c) => {
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
  const consent = form.get(W9_FILE_CONSENT_FIELD);
  const { orgId, userId } = c.var.tenant;
  const added = await addDocumentFile(
    c.var.ctx,
    orgId,
    c.req.param("id"),
    {
      file,
      category: raw as AttachmentCategory,
      consent: typeof consent === "string" ? consent : null,
    },
    userId,
  );
  return c.json(added, 201);
});

routes.get("/:id/attachments/:fileId", async (c) => {
  const { row, body } = await getDocumentFile(
    c.var.ctx,
    c.var.tenant.orgId,
    c.req.param("id"),
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

routes.delete("/:id/attachments/:fileId", editor, async (c) => {
  await deleteDocumentFile(c.var.ctx, c.var.tenant.orgId, c.req.param("id"), c.req.param("fileId"));
  return c.json({ ok: true });
});

export default routes;
