// OWNER: prospecting — /api/orgs/:orgId/prospects (private-foundation prospects from IRS 990-PF data)
//   GET    /              ?status=new,researching|all &minFit= &approach= &state= &q=
//                         -> { items: (ProspectDto & { funder })[], lastRun }
//   POST   /refresh       (editor+, once per org per hour) -> 202 { queued: true, runId } | 429
//   GET    /:id           -> ProspectDto & { funder, funderFacts, filings, attribution }
//   PATCH  /:id           (editor+) { status?, notes?, nextStepAt? } -> ProspectDto & { funder }

import { Hono } from "hono";
import { z } from "zod";
import {
  PROSPECT_APPROACHES,
  PROSPECT_STATUSES,
  type ProspectStatus,
} from "../../db/schema/prospects";
import { badRequest } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  getProspectDetail,
  latestProspectRun,
  listProspects,
  requestProspectRefresh,
  updateProspect,
} from "../../services/prospecting";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

const listQuery = z.object({
  status: z.string().max(200).optional(),
  minFit: z.coerce.number().int().min(0).max(100).optional(),
  approach: z.enum(PROSPECT_APPROACHES).optional(),
  state: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .optional(),
  q: z.string().max(100).optional(),
});

function parseStatuses(raw: string | undefined): ProspectStatus[] | undefined {
  if (!raw || raw === "all") return undefined;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const bad = parts.filter((p) => !(PROSPECT_STATUSES as readonly string[]).includes(p));
  if (bad.length) throw badRequest(`Unknown prospect status: ${bad.join(", ")}`);
  return parts as ProspectStatus[];
}

routes.get("/", validate("query", listQuery), async (c) => {
  const q = c.req.valid("query");
  const orgId = c.var.tenant.orgId;
  const [items, lastRun] = await Promise.all([
    listProspects(c.var.ctx, orgId, {
      statuses: parseStatuses(q.status),
      minFit: q.minFit,
      approach: q.approach,
      state: q.state,
      q: q.q,
    }),
    latestProspectRun(c.var.ctx, orgId),
  ]);
  return c.json({ items, lastRun });
});

routes.post("/refresh", requireRole("editor"), async (c) => {
  const tenant = c.var.tenant;
  const res = await requestProspectRefresh(c.var.ctx, tenant.orgId, {
    userId: tenant.userId,
    requestId: c.var.requestId,
  });
  if (!res.queued) {
    c.header("Retry-After", String(res.retryAfterSeconds));
    return c.json(
      {
        error: {
          code: "rate_limited",
          message: "Foundation prospects can be refreshed once per hour.",
          details: { retryAfterSeconds: res.retryAfterSeconds },
        },
      },
      429,
    );
  }
  return c.json({ queued: true, runId: res.runId }, 202);
});

routes.get("/:id", async (c) => {
  const detail = await getProspectDetail(c.var.ctx, c.var.tenant.orgId, c.req.param("id"));
  return c.json(detail);
});

const patchBody = z
  .object({
    status: z.enum(PROSPECT_STATUSES).optional(),
    notes: z.string().max(10_000).optional(),
    nextStepAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: "Provide status, notes or nextStepAt",
  });

routes.patch("/:id", requireRole("editor"), validate("json", patchBody), async (c) => {
  const body = c.req.valid("json");
  const tenant = c.var.tenant;
  const updated = await updateProspect(
    c.var.ctx,
    tenant.orgId,
    c.req.param("id"),
    {
      status: body.status,
      notes: body.notes,
      nextStepAt:
        body.nextStepAt === undefined
          ? undefined
          : body.nextStepAt === null
            ? null
            : new Date(body.nextStepAt),
    },
    { userId: tenant.userId, requestId: c.var.requestId },
  );
  return c.json(updated);
});

export default routes;
