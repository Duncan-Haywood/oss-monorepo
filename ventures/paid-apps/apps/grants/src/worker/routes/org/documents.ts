// OWNER: ingestion agent — /api/orgs/:orgId/documents (upload, list, get, delete, reprocess)

import { DOCUMENT_KINDS, PAST_OUTCOMES } from "@shared/enums";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { AppError, badRequest, notFound } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  createDocument,
  createDocumentFromText,
  deleteDocument,
  getDocument,
  getDocumentDetail,
  isOriginalPurged,
  listDocuments,
  originalUnavailable,
  reprocessDocument,
} from "../../services/ingestion/documents";
import {
  ALLOWED_EXTENSIONS,
  contentDisposition,
  contentMismatchReason,
  extensionForMime,
  MAX_TEXT_CHARS,
  MAX_UPLOAD_BYTES,
  resolveMimeType,
  titleFromFilename,
} from "../../services/ingestion/files";
import { hashIp } from "../../services/privacy/consents";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

const invalid = (issues: unknown) =>
  new AppError(400, "validation_error", "Invalid request", issues);

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);
const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

const uploadFields = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  title: optionalText(300),
  pastOutcome: z.preprocess(emptyToUndefined, z.enum(PAST_OUTCOMES).optional()),
  pastFunder: optionalText(300),
  pastAmountCents: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(0).max(100_000_000_000).optional(),
  ),
  pastYear: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1900).max(2100).optional()),
  notes: optionalText(5000),
});

const consentRequired = () =>
  new AppError(
    400,
    "consent_required",
    "Please confirm you have the right to share this document and agree to it being processed.",
  );

async function consentFrom(c: Context<AppEnv>) {
  const ip = c.req.header("cf-connecting-ip");
  return {
    userId: c.var.tenant.userId,
    ipHash: await hashIp(c.var.ctx, ip), // salted, like every consent record
    userAgent: c.req.header("user-agent") ?? null,
  };
}

routes.get(
  "/",
  validate(
    "query",
    z.object({ kind: z.preprocess(emptyToUndefined, z.enum(DOCUMENT_KINDS).optional()) }),
  ),
  async (c) => {
    const { kind } = c.req.valid("query");
    const items = await listDocuments(c.var.ctx, c.var.tenant.orgId, { kind });
    return c.json({ items });
  },
);

routes.post("/", requireRole("editor"), async (c) => {
  const declaredLength = Number(c.req.header("content-length") ?? "0");
  if (declaredLength > MAX_UPLOAD_BYTES + 1024 * 1024) throw tooLarge();
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw badRequest("Expected a multipart/form-data upload with a `file` field");
  }

  const body = await c.req.parseBody();
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) if (typeof v === "string") fields[k] = v;
  if (fields.consent !== "true") throw consentRequired();
  const parsed = uploadFields.safeParse(fields);
  if (!parsed.success) throw invalid(parsed.error.issues);
  const meta = parsed.data;

  const file = body.file;
  if (!(file instanceof File)) throw badRequest("Missing `file`");
  if (file.size > MAX_UPLOAD_BYTES) throw tooLarge();
  if (file.size === 0) throw badRequest("The file is empty");
  const mimeType = resolveMimeType(file.type, file.name);
  if (!mimeType) {
    throw new AppError(
      415,
      "unsupported_file_type",
      `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
    );
  }

  const bytes = await file.arrayBuffer();
  // The declared type / extension must match the actual bytes (magic numbers, ZIP bombs).
  const mismatch = contentMismatchReason(mimeType, bytes);
  if (mismatch) throw new AppError(415, "file_content_mismatch", mismatch);

  const { tenant, ctx } = c.var;
  const { document } = await createDocument(ctx, tenant.orgId, {
    title: meta.title || titleFromFilename(file.name),
    kind: meta.kind,
    mimeType,
    bytes,
    filename: file.name || `document.${extensionForMime(mimeType)}`,
    uploadedBy: tenant.userId,
    notes: meta.notes ?? null,
    pastOutcome: meta.pastOutcome ?? null,
    pastFunder: meta.pastFunder ?? null,
    pastAmountCents: meta.pastAmountCents ?? null,
    pastYear: meta.pastYear ?? null,
    consent: await consentFrom(c),
    onDuplicate: "reject",
    requestId: c.var.requestId,
  });
  return c.json(document, 201);
});

routes.post(
  "/text",
  requireRole("editor"),
  validate(
    "json",
    z.object({
      title: z.string().trim().min(1).max(300),
      kind: z.enum(DOCUMENT_KINDS).default("other"),
      text: z.string().min(1).max(MAX_TEXT_CHARS),
      notes: z.string().trim().max(5000).optional(),
      sourceUrl: z.url().max(2000).optional(),
      consent: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const input = c.req.valid("json");
    const { tenant, ctx } = c.var;
    const { documentId } = await createDocumentFromText(ctx, tenant.orgId, {
      title: input.title,
      kind: input.kind,
      text: input.text,
      notes: input.notes ?? null,
      sourceUrl: input.sourceUrl ?? null,
      uploadedBy: tenant.userId,
      consent: input.consent ? await consentFrom(c) : undefined,
      onDuplicate: "reject",
      requestId: c.var.requestId,
    });
    const doc = await getDocument(ctx, tenant.orgId, documentId);
    return c.json(doc, 201);
  },
);

routes.get("/:id", async (c) => {
  const detail = await getDocumentDetail(c.var.ctx, c.var.tenant.orgId, c.req.param("id"));
  return c.json(detail);
});

routes.get("/:id/download", async (c) => {
  const { ctx, tenant } = c.var;
  const doc = await getDocument(ctx, tenant.orgId, c.req.param("id"));
  if (!doc) throw notFound("Document");
  if (await isOriginalPurged(ctx, tenant.orgId, doc)) throw originalUnavailable("retention_purged");
  const obj = await ctx.env.FILES.get(doc.r2Key);
  if (!obj) throw originalUnavailable("missing");
  const filename = obj.customMetadata?.filename ?? `${doc.title}.${extensionForMime(doc.mimeType)}`;
  return c.body(obj.body, 200, {
    "Content-Type": doc.mimeType,
    "Content-Length": String(obj.size),
    "Content-Disposition": contentDisposition(filename, doc.mimeType),
    "Cache-Control": "private, no-store",
    // Uploaded HTML must never render or run on our origin, even if opened directly.
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
  });
});

routes.delete("/:id", requireRole("editor"), async (c) => {
  await deleteDocument(c.var.ctx, c.var.tenant.orgId, c.req.param("id"), {
    userId: c.var.tenant.userId,
    requestId: c.var.requestId,
  });
  return c.body(null, 204);
});

routes.post("/:id/reprocess", requireRole("editor"), async (c) => {
  const doc = await reprocessDocument(c.var.ctx, c.var.tenant.orgId, c.req.param("id"), {
    userId: c.var.tenant.userId,
    requestId: c.var.requestId,
  });
  return c.json(doc);
});

function tooLarge() {
  return new AppError(
    413,
    "file_too_large",
    `File is too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB)`,
  );
}

export default routes;
