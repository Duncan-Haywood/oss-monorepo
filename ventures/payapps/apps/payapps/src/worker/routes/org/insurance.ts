// /api/orgs/:orgId/insurance — the company's insurance certificates (services/insurance.ts) and the
// files kept with each (services/insurance-files.ts). Every member reads them; editors (who prepare
// pay applications) add, change, archive and delete.
import {
  insuranceCertificateSchema,
  insuranceHoldersSchema,
  insuranceRequirementsSchema,
  updateInsuranceCertificateSchema,
} from "@shared/api/schemas";
import { ATTACHMENT_CATEGORIES, type AttachmentCategory } from "@shared/attachments";
import { Hono } from "hono";
import { badRequest } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  createCertificate,
  deleteCertificate,
  listCertificates,
  updateCertificate,
} from "../../services/insurance";
import {
  addCertificateFile,
  deleteCertificateFile,
  getCertificateFile,
  listCertificateFiles,
} from "../../services/insurance-files";
import { setCertificateHolders } from "../../services/insurance-holders";
import { getJobRequirements, setJobRequirements } from "../../services/insurance-requirements";
import { MAX_UPLOAD_REQUEST_BYTES } from "../../services/payapps/attachments";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");

routes.get("/", async (c) => c.json(await listCertificates(c.var.ctx, c.var.tenant.orgId)));

// What one job's subcontract asks the company to carry, checked against the certificates on file
// (services/insurance-requirements.ts): every member reads, editors replace the list. Registered
// before the "/:id/..." routes so the literal segment is never read as a certificate id.
routes.get("/requirements/:projectId", async (c) =>
  c.json(await getJobRequirements(c.var.ctx, c.var.tenant.orgId, c.req.param("projectId"))),
);

routes.put(
  "/requirements/:projectId",
  editor,
  validate("json", insuranceRequirementsSchema),
  async (c) => {
    const { orgId, userId } = c.var.tenant;
    return c.json(
      await setJobRequirements(
        c.var.ctx,
        orgId,
        c.req.param("projectId"),
        userId,
        c.req.valid("json").requirements,
      ),
    );
  },
);

routes.post("/", editor, validate("json", insuranceCertificateSchema), async (c) => {
  const { orgId, userId } = c.var.tenant;
  return c.json(await createCertificate(c.var.ctx, orgId, userId, c.req.valid("json")), 201);
});

routes.patch("/:id", editor, validate("json", updateInsuranceCertificateSchema), async (c) =>
  c.json(
    await updateCertificate(c.var.ctx, c.var.tenant.orgId, c.req.param("id"), c.req.valid("json")),
  ),
);

routes.delete("/:id", editor, async (c) => {
  await deleteCertificate(c.var.ctx, c.var.tenant.orgId, c.req.param("id"));
  return c.json({ ok: true });
});

// The jobs whose GC holds the certificate: every member reads them in the list, editors replace them.
routes.put("/:id/holders", editor, validate("json", insuranceHoldersSchema), async (c) => {
  const { orgId, userId } = c.var.tenant;
  const holders = await setCertificateHolders(
    c.var.ctx,
    orgId,
    c.req.param("id"),
    userId,
    c.req.valid("json").holders,
  );
  return c.json({ holders });
});

// The files kept with one certificate: every member lists and downloads, editors add and delete.
routes.get("/:id/attachments", async (c) =>
  c.json(await listCertificateFiles(c.var.ctx, c.var.tenant.orgId, c.req.param("id"))),
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
  const { orgId, userId } = c.var.tenant;
  const added = await addCertificateFile(
    c.var.ctx,
    orgId,
    c.req.param("id"),
    { file, category: raw as AttachmentCategory },
    userId,
  );
  return c.json(added, 201);
});

routes.get("/:id/attachments/:fileId", async (c) => {
  const { row, body } = await getCertificateFile(
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
  await deleteCertificateFile(
    c.var.ctx,
    c.var.tenant.orgId,
    c.req.param("id"),
    c.req.param("fileId"),
  );
  return c.json({ ok: true });
});

export default routes;
