// OWNER: attachments module — public partner upload link for letters of support (no login).
//   GET  /api/letters/:token          -> { orgName, grantTitle, partnerName, dueAt, maxBytes, acceptedTypes }
//   POST /api/letters/:token/upload   multipart: file (PDF/DOCX <= 10 MB), consent=true
// The token is the only credential: it resolves to exactly one request (by sha256), works only while
// the request is `sent` and unexpired, and grants nothing but this read and one upload. Rate-limited
// per client IP. Mounted in app.ts after originCheck + sessionMiddleware (see the integration diff);
// request-limits needs LETTER_UPLOAD_BODY_RULE ahead of the default JSON rule.
import { LETTER_MAX_BYTES } from "@shared/api/attachments";
import { Hono } from "hono";
import { AppError, badRequest } from "../lib/errors";
import { clientIp, RATE_LIMITS, rateLimit, TEST_RATE_LIMIT_HEADER } from "../middleware/rate-limit";
import { type BodyRule, MiB } from "../middleware/request-limits";
import {
  publicLetterInfo,
  receivePartnerLetter,
  resolveLetterToken,
} from "../services/attachments/letters";
import { contentMismatchReason, resolveMimeType } from "../services/ingestion/files";
import { hashIp } from "../services/privacy/consents";
import type { AppEnv } from "../types";

/** Add to BODY_RULES (request-limits.ts) before the default JSON rule. */
export const LETTER_UPLOAD_BODY_RULE: BodyRule = {
  name: "letter_upload",
  path: /^\/api\/letters\/[^/]+\/upload$/,
  methods: ["POST"],
  maxBytes: 11 * MiB,
  requireJson: false,
};

const LETTER_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const skippedInTests = (c: {
  env?: { APP_ENV?: string };
  req: { header(n: string): string | undefined };
}) => c.env?.APP_ENV === "test" && c.req.header(TEST_RATE_LIMIT_HEADER) !== "enforce";

/** Token lookups: generous, but slows down anyone probing for links. */
export const letterLookupLimiter = rateLimit({
  binding: RATE_LIMITS.upload.binding,
  name: "letters_lookup",
  limit: 30,
  periodSeconds: 60,
  when: (c) => c.req.method === "GET" && !skippedInTests(c),
  key: (c) => `ip:${clientIp(c)}`,
  message: "Too many requests. Please wait a minute and try again.",
});

/** Uploads: a partner needs one or two tries. */
export const letterUploadLimiter = rateLimit({
  binding: RATE_LIMITS.upload.binding,
  name: "letters_upload",
  limit: 5,
  periodSeconds: 60,
  when: (c) => c.req.method === "POST" && !skippedInTests(c),
  key: (c) => `ip:${clientIp(c)}`,
  message: "Too many uploads. Please wait a minute and try again.",
});

const routes = new Hono<AppEnv>();

const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } as const;

routes.get("/:token", letterLookupLimiter, async (c) => {
  const info = await publicLetterInfo(c.var.ctx, c.req.param("token"));
  return c.json(info, 200, noStore);
});

const tooLarge = () =>
  new AppError(413, "file_too_large", `File is too large (max ${LETTER_MAX_BYTES / MiB} MB)`);

routes.post("/:token/upload", letterUploadLimiter, async (c) => {
  const { ctx } = c.var;
  const token = c.req.param("token");
  const declared = Number(c.req.header("content-length") ?? "0");
  if (declared > LETTER_MAX_BYTES + MiB) throw tooLarge();
  if (!(c.req.header("content-type") ?? "").includes("multipart/form-data")) {
    throw badRequest("Expected a multipart/form-data upload with a `file` field");
  }
  // Check the link before reading up to 10 MB from an anonymous client.
  await resolveLetterToken(ctx, token);
  const body = await c.req.parseBody();
  if (body.consent !== "true") {
    throw new AppError(
      400,
      "consent_required",
      "Please confirm you have the right to share this letter with the organization.",
    );
  }
  const file = body.file;
  if (!(file instanceof File)) throw badRequest("Missing `file`");
  if (file.size > LETTER_MAX_BYTES) throw tooLarge();
  if (file.size === 0) throw badRequest("The file is empty");
  const mimeType = resolveMimeType(file.type, file.name);
  if (!mimeType || !LETTER_MIME_TYPES.has(mimeType)) {
    throw new AppError(
      415,
      "unsupported_file_type",
      "Please upload the signed letter as a PDF or Word (.docx) file.",
    );
  }
  const bytes = await file.arrayBuffer();
  // Same content checks as the documents route: magic bytes, ZIP-bomb guard for DOCX.
  const mismatch = contentMismatchReason(mimeType, bytes);
  if (mismatch) throw new AppError(415, "file_content_mismatch", mismatch);
  await receivePartnerLetter(ctx, {
    token,
    mimeType,
    bytes,
    filename: file.name || (mimeType === "application/pdf" ? "letter.pdf" : "letter.docx"),
    ipHash: await hashIp(ctx, c.req.header("cf-connecting-ip")),
    userAgent: c.req.header("user-agent") ?? null,
    requestId: c.var.requestId,
  });
  return c.json({ received: true }, 201, noStore);
});

export default routes;
