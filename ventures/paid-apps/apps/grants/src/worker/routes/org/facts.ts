// OWNER: knowledge agent — /api/orgs/:orgId/facts (list, create, confirm, reject, edit)

import { FactValue } from "@shared/content";
import { FACT_CATEGORIES, FACT_STATUSES, SENSITIVITY_LEVELS } from "@shared/enums";
import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  bulkConfirmFacts,
  confirmFact,
  confirmFactStillTrue,
  createUserFact,
  getFact,
  getFactsSummary,
  listFacts,
  rejectFact,
  updateFact,
} from "../../services/knowledge/facts";
import { withSupersedeLinks } from "../../services/knowledge/supersede";
import type { AppEnv } from "../../types";

const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        : undefined,
    )
    .pipe(z.array(z.enum(values)).optional());

const ListQuery = z.object({
  status: csvEnum(FACT_STATUSES),
  category: csvEnum(FACT_CATEGORIES),
  q: z.string().max(200).optional(),
  projectId: z.string().max(64).optional(),
  documentId: z.string().max(64).optional(),
  interviewId: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

const Statement = z.string().trim().min(3).max(1000);
const AsOf = z.string().trim().max(40).nullable();

const CreateBody = z.object({
  category: z.enum(FACT_CATEGORIES),
  statement: Statement,
  value: FactValue.nullable().optional(),
  asOf: AsOf.optional(),
  projectId: z.string().max(64).nullable().optional(),
  sensitivity: z.enum(SENSITIVITY_LEVELS).optional(),
});

const PatchBody = z
  .object({
    category: z.enum(FACT_CATEGORIES),
    statement: Statement,
    value: FactValue.nullable(),
    asOf: AsOf,
    projectId: z.string().max(64).nullable(),
    sensitivity: z.enum(SENSITIVITY_LEVELS),
  })
  .partial()
  .strict();

const RejectBody = z.object({ reason: z.string().max(1000).optional() }).optional();
const BulkBody = z.object({ ids: z.array(z.string().max(64)).min(1).max(1000) });

const actorOf = (c: { var: AppEnv["Variables"] }) => ({
  userId: c.var.tenant.userId,
  requestId: c.var.requestId,
});

const routes = new Hono<AppEnv>()
  .get("/", validate("query", ListQuery), async (c) => {
    const q = c.req.valid("query");
    const items = await listFacts(c.var.ctx, c.var.tenant.orgId, {
      status: q.status,
      category: q.category,
      q: q.q,
      projectId: q.projectId,
      sourceDocumentId: q.documentId,
      sourceInterviewId: q.interviewId,
      limit: q.limit,
    });
    // Each item also carries pending supersede proposals (supersedes / supersedeProposal).
    const linked = await withSupersedeLinks(c.var.ctx, c.var.tenant.orgId, items);
    return c.json({ items: linked, nextCursor: null });
  })
  .get("/summary", async (c) => c.json(await getFactsSummary(c.var.ctx, c.var.tenant.orgId)))
  .post("/", requireRole("editor"), validate("json", CreateBody), async (c) => {
    const row = await createUserFact(
      c.var.ctx,
      c.var.tenant.orgId,
      c.req.valid("json"),
      actorOf(c),
    );
    return c.json(row, 201);
  })
  .post("/bulk-confirm", requireRole("editor"), validate("json", BulkBody), async (c) => {
    const { ids } = c.req.valid("json");
    return c.json(await bulkConfirmFacts(c.var.ctx, c.var.tenant.orgId, ids, actorOf(c)));
  })
  .get("/:id", async (c) => c.json(await getFact(c.var.ctx, c.var.tenant.orgId, c.req.param("id"))))
  .patch("/:id", requireRole("editor"), validate("json", PatchBody), async (c) => {
    const row = await updateFact(
      c.var.ctx,
      c.var.tenant.orgId,
      c.req.param("id"),
      c.req.valid("json"),
      actorOf(c),
    );
    return c.json(row);
  })
  .post("/:id/confirm", requireRole("editor"), async (c) =>
    c.json(await confirmFact(c.var.ctx, c.var.tenant.orgId, c.req.param("id"), actorOf(c))),
  )
  .post("/:id/still-true", requireRole("editor"), async (c) =>
    c.json(
      await confirmFactStillTrue(c.var.ctx, c.var.tenant.orgId, c.req.param("id"), actorOf(c)),
    ),
  )
  .post("/:id/reject", requireRole("editor"), async (c) => {
    let reason: string | undefined;
    if ((c.req.header("content-type") ?? "").includes("application/json")) {
      const parsed = RejectBody.safeParse(await c.req.json().catch(() => undefined));
      reason = parsed.success ? parsed.data?.reason : undefined;
    }
    return c.json(
      await rejectFact(c.var.ctx, c.var.tenant.orgId, c.req.param("id"), actorOf(c), reason),
    );
  });

export default routes;
