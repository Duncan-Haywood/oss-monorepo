// /api/orgs/:orgId/projects/:projectId/submittals — the job's submittal log
// (services/payapps/submittals.ts, docs/SUBMITTALS.md). Every member reads; editors and up write.

import {
  createSubmittalSchema,
  importSubmittalsSchema,
  resubmitSubmittalSchema,
  submittalLogQuerySchema,
  submittalTransmittalQuerySchema,
  updateSubmittalSchema,
} from "@shared/api/schemas";
import { ATTACHMENT_CATEGORIES, type AttachmentCategory } from "@shared/attachments";
import { defaultTransmittalRequest } from "@shared/submittals";
import { Hono } from "hono";
import { badRequest } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  transmittalFileName,
  transmittalPdf,
} from "../../services/export/submittal-transmittal-pdf";
import { MAX_UPLOAD_REQUEST_BYTES, purgeFiles } from "../../services/payapps/attachments";
import { isoDay } from "../../services/payapps/cash";
import { packetResponse } from "../../services/payapps/packet";
import {
  addSubmittalFile,
  buildSubmittalPacket,
  deleteSubmittalFile,
  getSubmittalFile,
  listSubmittalFiles,
  submittalPrefix,
} from "../../services/payapps/submittal-files";
import {
  createSubmittal,
  deleteSubmittal,
  importSubmittals,
  loadSubmittalTransmittal,
  resubmitSubmittal,
  submittalLog,
  submittalLogCsv,
  updateSubmittal,
} from "../../services/payapps/submittals";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");

const projectId = (c: { req: { param: (k: "projectId") => string | undefined } }) =>
  c.req.param("projectId") ?? "";

routes.get("/", async (c) => c.json(await submittalLog(c.var.ctx, c.var.tenant, projectId(c))));

routes.get("/log.csv", validate("query", submittalLogQuerySchema), async (c) => {
  const today = c.req.valid("query").today ?? isoDay(new Date());
  const { csv } = await submittalLogCsv(c.var.ctx, c.var.tenant.orgId, projectId(c), today);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="submittal-log-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});

routes.post("/", editor, validate("json", createSubmittalSchema), async (c) =>
  c.json(await createSubmittal(c.var.ctx, c.var.tenant, projectId(c), c.req.valid("json")), 201),
);

// Rows the user kept from a register or spec sections read in the browser (the file never comes here).
routes.post("/import", editor, validate("json", importSubmittalsSchema), async (c) =>
  c.json(await importSubmittals(c.var.ctx, c.var.tenant, projectId(c), c.req.valid("json")), 201),
);

routes.patch("/:submittalId", editor, validate("json", updateSubmittalSchema), async (c) =>
  c.json(
    await updateSubmittal(
      c.var.ctx,
      c.var.tenant,
      projectId(c),
      c.req.param("submittalId"),
      c.req.valid("json"),
    ),
  ),
);

routes.post(
  "/:submittalId/resubmit",
  editor,
  validate("json", resubmitSubmittalSchema),
  async (c) =>
    c.json(
      await resubmitSubmittal(
        c.var.ctx,
        c.var.tenant,
        projectId(c),
        c.req.param("submittalId"),
        c.req.valid("json"),
      ),
      201,
    ),
);

routes.delete("/:submittalId", editor, async (c) => {
  const id = c.req.param("submittalId");
  await deleteSubmittal(c.var.ctx, c.var.tenant.orgId, projectId(c), id);
  // Its file rows cascaded with it; clear the stored objects too.
  await purgeFiles(c.var.ctx, submittalPrefix(c.var.tenant.orgId, projectId(c), id));
  return c.json({ ok: true });
});

// The transmittal cover sheet for one submittal (services/export/submittal-transmittal-pdf.ts).
routes.get(
  "/:submittalId/transmittal.pdf",
  validate("query", submittalTransmittalQuerySchema),
  async (c) => {
    const q = c.req.valid("query");
    const doc = await loadSubmittalTransmittal(
      c.var.ctx,
      c.var.tenant.orgId,
      projectId(c),
      c.req.param("submittalId"),
    );
    const bytes = transmittalPdf(doc, {
      today: q.today ?? isoDay(new Date()),
      requested: q.requested ?? defaultTransmittalRequest(doc.submittal.type),
    });
    return new Response(bytes.slice().buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${transmittalFileName(doc)}"`,
        "Cache-Control": "no-store",
      },
    });
  },
);

// The transmittal, then the files enclosed with it (not the stamped copy returned), as one PDF.
routes.get(
  "/:submittalId/packet.pdf",
  validate("query", submittalTransmittalQuerySchema),
  async (c) => {
    const q = c.req.valid("query");
    const id = c.req.param("submittalId");
    const packet = await buildSubmittalPacket(c.var.ctx, c.var.tenant.orgId, projectId(c), id, {
      today: q.today ?? isoDay(new Date()),
      requested: q.requested,
    });
    return packetResponse(packet);
  },
);

// Files on a submittal revision (product data, shop drawings, sample photos, the stamped copy that
// comes back): readable by every member, added or deleted by editors, whatever its status.
const ids = (c: {
  req: { param: (k: string) => string | undefined };
  var: AppEnv["Variables"];
}) => ({
  orgId: c.var.tenant.orgId,
  projectId: c.req.param("projectId") ?? "",
  submittalId: c.req.param("submittalId") ?? "",
});

routes.get("/:submittalId/attachments", async (c) => {
  const { orgId, projectId, submittalId } = ids(c);
  return c.json(await listSubmittalFiles(c.var.ctx, orgId, projectId, submittalId));
});

routes.post("/:submittalId/attachments", editor, async (c) => {
  const { orgId, projectId, submittalId } = ids(c);
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
  const added = await addSubmittalFile(
    c.var.ctx,
    orgId,
    projectId,
    submittalId,
    { file, category: raw as AttachmentCategory },
    c.var.tenant.userId,
  );
  return c.json(added, 201);
});

routes.get("/:submittalId/attachments/:attachmentId", async (c) => {
  const { orgId, projectId, submittalId } = ids(c);
  const id = c.req.param("attachmentId");
  const { row, body } = await getSubmittalFile(c.var.ctx, orgId, projectId, submittalId, id);
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

routes.delete("/:submittalId/attachments/:attachmentId", editor, async (c) => {
  const { orgId, projectId, submittalId } = ids(c);
  await deleteSubmittalFile(c.var.ctx, orgId, projectId, submittalId, c.req.param("attachmentId"));
  return c.json({ ok: true });
});

export default routes;
