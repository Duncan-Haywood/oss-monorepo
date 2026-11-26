// OWNER: export — GET /api/orgs/:orgId/applications/:id/export?format=docx|html|txt
// (mounted at /applications next to the pipeline's router). Viewer+ (the org router's base role).

import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../../lib/validate";
import { EXPORT_FORMATS, loadExportInput, renderExport } from "../../services/export";
import { audit } from "../../services/privacy/audit";
import type { AppEnv } from "../../types";

const flag = z
  .enum(["0", "1", "true", "false"])
  .optional()
  .transform((v) => v === "1" || v === "true");

export const ExportQuery = z.object({
  format: z.enum(EXPORT_FORMATS).default("docx"),
  /** Numbered [n] markers + citations appendix. Off by default (funder-facing copy). */
  citations: flag,
  /** Internal reviewer cover page (executive summary + key points). Off by default. */
  cover: flag,
  versionId: z.string().min(1).max(100).optional(),
});

const routes = new Hono<AppEnv>().get("/:id/export", validate("query", ExportQuery), async (c) => {
  const { orgId, userId } = c.var.tenant;
  const applicationId = c.req.param("id");
  const q = c.req.valid("query");
  const input = await loadExportInput(c.var.ctx, { orgId, applicationId, versionId: q.versionId });
  const out = renderExport(input, q.format, { citations: q.citations, cover: q.cover });
  await audit(c.var.ctx, {
    orgId,
    actorType: "user",
    actorId: userId,
    action: "application.exported",
    targetType: "application",
    targetId: applicationId,
    metadata: {
      format: q.format,
      versionId: input.version.id,
      versionNumber: input.version.versionNumber,
      citations: q.citations,
      cover: q.cover,
    },
    requestId: c.var.requestId,
  });
  const headers: Record<string, string> = {
    "Content-Type": out.contentType,
    "Content-Disposition": `attachment; filename="${out.filename}"`,
    "Cache-Control": "private, no-store",
    "X-Export-Version-Id": input.version.id,
  };
  // Defence in depth if the HTML is opened from our origin: no scripts, no external loads.
  if (q.format === "html") {
    headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  }
  return c.body(
    typeof out.body === "string" ? out.body : (out.body as Uint8Array<ArrayBuffer>),
    200,
    headers,
  );
});

export default routes;
