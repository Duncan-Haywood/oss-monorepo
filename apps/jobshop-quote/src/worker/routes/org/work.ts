// RFQs, quotes and the costing preview. Mounted under /api/orgs/:orgId behind requireOrg("viewer");
// writes need "estimator".
import {
  copyLineFromSchema,
  createQuoteSchema,
  emailQuoteSchema,
  fileUnitsSchema,
  outcomeSchema,
  quoteLinePatchSchema,
  quoteLineSchema,
  quotePatchSchema,
  rfqCustomerPatchSchema,
  rfqPartPatchSchema,
  rfqTextSchema,
  winLossQuerySchema,
} from "@shared/api";
import { computeCost } from "@shared/costing";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { AppError, badRequest } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  addLine,
  createQuote,
  deleteLine,
  draftCoverNote,
  getQuote,
  listQuotes,
  parseInputs,
  quotePdf,
  quoteStats,
  recalculate,
  recordOutcome,
  reviseQuote,
  sendQuote,
  updateLine,
  updateQuote,
} from "../../services/quotes";
import { winLoss, winLossCsvExport } from "../../services/quotes/analytics";
import { quoteChanges, quoteRevisions } from "../../services/quotes/changes";
import { emailQuote, listQuoteEmails } from "../../services/quotes/email";
import { copyLineFrom, partHistory, rfqPartHistory } from "../../services/quotes/history";
import { loadRateCard } from "../../services/ratecard";
import {
  addFiles,
  addPart,
  createRfq,
  deletePart,
  extractRfq,
  getFile,
  getRfq,
  listRfqs,
  measureFile,
  setFileUnits,
  type UploadedFile,
  updatePart,
  updateRfq,
} from "../../services/rfq";
import type { AppEnv } from "../../types";

const est = requireRole("estimator");

/** Total multipart size cap, checked before the body is parsed (Workers have 128 MB of memory). */
export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

const uploadLimit = createMiddleware<AppEnv>(async (c, next) => {
  // Multipart bodies need a Content-Length: a chunked body would be parsed whole before any check.
  const header = c.req.header("Content-Length");
  const isMultipart = (c.req.header("Content-Type") ?? "").startsWith("multipart/");
  if (isMultipart && header === undefined) {
    throw new AppError(411, "length_required", "Uploads need a Content-Length header");
  }
  const len = Number(header ?? "0");
  if (!Number.isFinite(len) || len > MAX_UPLOAD_BYTES) {
    throw new AppError(413, "payload_too_large", "Upload at most 40 MB per request");
  }
  await next();
});

async function filesFrom(form: FormData): Promise<UploadedFile[]> {
  const out: UploadedFile[] = [];
  for (const v of form.getAll("files")) {
    if (typeof v === "string") continue;
    out.push({ name: v.name || "upload", type: v.type, bytes: await v.arrayBuffer() });
  }
  return out;
}

const contentDisposition = (name: string) =>
  `attachment; filename="${name.replace(/[^\w.\- ]/g, "_")}"`;

export const rfqRoutes = new Hono<AppEnv>()
  .get("/", async (c) =>
    c.json({ items: await listRfqs(c.var.ctx, c.var.tenant.orgId, c.req.query("status")) }),
  )
  .post("/", est, uploadLimit, async (c) => {
    const t = c.var.tenant;
    const type = c.req.header("Content-Type") ?? "";
    if (type.startsWith("multipart/form-data")) {
      const form = await c.req.formData();
      const subject = form.get("subject");
      const body = form.get("bodyText");
      const rfq = await createRfq(c.var.ctx, t.orgId, t.userId, {
        subject: typeof subject === "string" ? subject.slice(0, 200) : undefined,
        bodyText: typeof body === "string" ? body.slice(0, 100_000) : "",
        files: await filesFrom(form),
      });
      return c.json(rfq, 201);
    }
    const parsed = rfqTextSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      throw badRequest("Send JSON { subject?, bodyText } or multipart form data");
    const rfq = await createRfq(c.var.ctx, t.orgId, t.userId, { ...parsed.data, files: [] });
    return c.json(rfq, 201);
  })
  .get("/:rfqId", async (c) =>
    c.json(await getRfq(c.var.ctx, c.var.tenant.orgId, c.req.param("rfqId"))),
  )
  .patch("/:rfqId", est, validate("json", rfqCustomerPatchSchema), async (c) =>
    c.json(
      await updateRfq(c.var.ctx, c.var.tenant.orgId, c.req.param("rfqId"), c.req.valid("json")),
    ),
  )
  .post("/:rfqId/files", est, uploadLimit, async (c) => {
    const files = await filesFrom(await c.req.formData());
    if (files.length === 0) throw badRequest("No files");
    return c.json(await addFiles(c.var.ctx, c.var.tenant.orgId, c.req.param("rfqId"), files));
  })
  // A CAD file too large to measure at upload, measured in a request of its own.
  .post("/:rfqId/files/:fileId/measure", est, async (c) =>
    c.json(
      await measureFile(c.var.ctx, c.var.tenant.orgId, c.req.param("rfqId"), c.req.param("fileId")),
    ),
  )
  // The unit a CAD file that states none was drawn in, chosen by the estimator; measured again in it.
  .post("/:rfqId/files/:fileId/units", est, validate("json", fileUnitsSchema), async (c) =>
    c.json(
      await setFileUnits(
        c.var.ctx,
        c.var.tenant.orgId,
        c.req.param("rfqId"),
        c.req.param("fileId"),
        c.req.valid("json").units,
      ),
    ),
  )
  .get("/:rfqId/files/:fileId/download", async (c) => {
    const { file, body } = await getFile(
      c.var.ctx,
      c.var.tenant.orgId,
      c.req.param("rfqId"),
      c.req.param("fileId"),
    );
    return new Response(body, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": contentDisposition(file.fileName),
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  })
  // Repeat parts, part 2: each part's earlier quotes, on the review screen before a quote exists.
  .get("/:rfqId/part-history", async (c) =>
    c.json(await rfqPartHistory(c.var.ctx, c.var.tenant.orgId, c.req.param("rfqId"))),
  )
  .post("/:rfqId/extract", est, async (c) =>
    c.json(await extractRfq(c.var.ctx, c.var.tenant.orgId, c.req.param("rfqId"))),
  )
  .post("/:rfqId/parts", est, validate("json", rfqPartPatchSchema), async (c) =>
    c.json(
      await addPart(c.var.ctx, c.var.tenant.orgId, c.req.param("rfqId"), c.req.valid("json")),
      201,
    ),
  )
  .patch("/:rfqId/parts/:partId", est, validate("json", rfqPartPatchSchema), async (c) =>
    c.json(
      await updatePart(
        c.var.ctx,
        c.var.tenant.orgId,
        c.req.param("rfqId"),
        c.req.param("partId"),
        c.req.valid("json"),
      ),
    ),
  )
  .delete("/:rfqId/parts/:partId", est, async (c) =>
    c.json(
      await deletePart(c.var.ctx, c.var.tenant.orgId, c.req.param("rfqId"), c.req.param("partId")),
    ),
  );

export const quoteRoutes = new Hono<AppEnv>()
  .get("/", async (c) =>
    c.json({ items: await listQuotes(c.var.ctx, c.var.tenant.orgId, c.req.query("status")) }),
  )
  .get("/stats", async (c) => c.json(await quoteStats(c.var.ctx, c.var.tenant.orgId)))
  // Win/loss by customer, material, machine and markup; what each repeat part was won and lost at.
  .get("/analytics", validate("query", winLossQuerySchema), async (c) =>
    c.json(await winLoss(c.var.ctx, c.var.tenant.orgId, c.req.valid("query").window)),
  )
  // The decided quotes behind that report, one CSV row each, for a spreadsheet.
  .get("/analytics.csv", validate("query", winLossQuerySchema), async (c) => {
    const window = c.req.valid("query").window;
    const { csv, truncated } = await winLossCsvExport(c.var.ctx, c.var.tenant.orgId, window);
    const day = c.var.ctx.now().toISOString().slice(0, 10);
    // A BOM so Excel opens accented customer names as UTF-8.
    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDisposition(`win-loss-${window}-${day}.csv`),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        ...(truncated ? { "X-Truncated": "true" } : {}),
      },
    });
  })
  .post("/", est, validate("json", createQuoteSchema), async (c) => {
    const t = c.var.tenant;
    return c.json(await createQuote(c.var.ctx, t.orgId, t.userId, c.req.valid("json")), 201);
  })
  .get("/:quoteId", async (c) =>
    c.json(await getQuote(c.var.ctx, c.var.tenant.orgId, c.req.param("quoteId"))),
  )
  .patch("/:quoteId", est, validate("json", quotePatchSchema), async (c) =>
    c.json(
      await updateQuote(c.var.ctx, c.var.tenant.orgId, c.req.param("quoteId"), c.req.valid("json")),
    ),
  )
  .post("/:quoteId/lines", est, validate("json", quoteLineSchema), async (c) =>
    c.json(
      await addLine(c.var.ctx, c.var.tenant.orgId, c.req.param("quoteId"), c.req.valid("json")),
      201,
    ),
  )
  .patch("/:quoteId/lines/:lineId", est, validate("json", quoteLinePatchSchema), async (c) =>
    c.json(
      await updateLine(
        c.var.ctx,
        c.var.tenant.orgId,
        c.req.param("quoteId"),
        c.req.param("lineId"),
        c.req.valid("json"),
      ),
    ),
  )
  // Repeat parts: earlier quotes of this line's part number, and copying one's cost inputs.
  .get("/:quoteId/lines/:lineId/history", async (c) =>
    c.json(
      await partHistory(
        c.var.ctx,
        c.var.tenant.orgId,
        c.req.param("quoteId"),
        c.req.param("lineId"),
      ),
    ),
  )
  .post("/:quoteId/lines/:lineId/copy-from", est, validate("json", copyLineFromSchema), async (c) =>
    c.json(
      await copyLineFrom(
        c.var.ctx,
        c.var.tenant.orgId,
        c.req.param("quoteId"),
        c.req.param("lineId"),
        c.req.valid("json").sourceLineId,
      ),
    ),
  )
  .delete("/:quoteId/lines/:lineId", est, async (c) =>
    c.json(
      await deleteLine(
        c.var.ctx,
        c.var.tenant.orgId,
        c.req.param("quoteId"),
        c.req.param("lineId"),
      ),
    ),
  )
  .post("/:quoteId/recalculate", est, async (c) =>
    c.json(await recalculate(c.var.ctx, c.var.tenant.orgId, c.req.param("quoteId"))),
  )
  .post("/:quoteId/cover-note", est, async (c) =>
    c.json(await draftCoverNote(c.var.ctx, c.var.tenant.orgId, c.req.param("quoteId"))),
  )
  .post("/:quoteId/send", est, async (c) =>
    c.json(await sendQuote(c.var.ctx, c.var.tenant.orgId, c.req.param("quoteId"))),
  )
  // Email the sent quote (its frozen PDF attached) to the customer; replies go to the estimator.
  .get("/:quoteId/emails", async (c) => {
    const t = c.var.tenant;
    return c.json(await listQuoteEmails(c.var.ctx, t.orgId, t.userId, c.req.param("quoteId")));
  })
  .post("/:quoteId/email", est, validate("json", emailQuoteSchema), async (c) => {
    const t = c.var.tenant;
    return c.json(
      await emailQuote(c.var.ctx, t.orgId, t.userId, c.req.param("quoteId"), c.req.valid("json")),
      201,
    );
  })
  // What changed from the revision this one replaces (or `?from=` another of the same number).
  .get("/:quoteId/changes", async (c) => {
    const from = c.req.query("from");
    return c.json(
      await quoteChanges(c.var.ctx, c.var.tenant.orgId, c.req.param("quoteId"), from || undefined),
    );
  })
  // Every revision of this quote number, oldest first (for comparing with any earlier one).
  .get("/:quoteId/revisions", async (c) =>
    c.json(await quoteRevisions(c.var.ctx, c.var.tenant.orgId, c.req.param("quoteId"))),
  )
  // Revisions: a new draft "Rev N+1" of a sent, lost or expired quote (the existing one if started).
  .post("/:quoteId/revise", est, async (c) => {
    const t = c.var.tenant;
    return c.json(await reviseQuote(c.var.ctx, t.orgId, t.userId, c.req.param("quoteId")), 201);
  })
  .post("/:quoteId/outcome", est, validate("json", outcomeSchema), async (c) =>
    c.json(
      await recordOutcome(
        c.var.ctx,
        c.var.tenant.orgId,
        c.req.param("quoteId"),
        c.req.valid("json"),
      ),
    ),
  )
  .get("/:quoteId/pdf", async (c) => {
    const { bytes, label } = await quotePdf(c.var.ctx, c.var.tenant.orgId, c.req.param("quoteId"));
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(`${label}.pdf`),
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  });

/** Live preview for the line editor: price inputs against the current rate card without saving. */
export const costingRoutes = new Hono<AppEnv>().post(
  "/preview",
  validate("json", z.object({ inputs: z.unknown() })),
  async (c) => {
    const inputs = parseInputs(c.req.valid("json").inputs);
    const card = await loadRateCard(c.var.ctx, c.var.tenant.orgId);
    return c.json(computeCost(card, inputs));
  },
);
