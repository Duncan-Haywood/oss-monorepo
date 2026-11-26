// OWNER: submission agent — /api/orgs/:orgId/submissions, /followups, /dashboard

import { FOLLOWUP_STATUSES } from "@shared/enums";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { applications, followups, submissions } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { sha256Hex } from "../../lib/hash";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { confirmSubmission, packageKeys } from "../../services/submission";
import { getDashboard } from "../../services/submission/dashboard";
import { listFollowups, updateFollowup } from "../../services/submission/followups";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

routes.get(
  "/",
  validate("query", z.object({ applicationId: z.string().optional() })),
  async (c) => {
    const { orgId } = c.var.tenant;
    const { applicationId } = c.req.valid("query");
    const conds = [eq(submissions.orgId, orgId)];
    if (applicationId) conds.push(eq(submissions.applicationId, applicationId));
    const rows = await c.var.ctx.db
      .select({ s: submissions, appId: applications.id, appTitle: applications.title })
      .from(submissions)
      .innerJoin(
        applications,
        and(eq(applications.id, submissions.applicationId), eq(applications.orgId, orgId)),
      )
      .where(and(...conds))
      .orderBy(desc(submissions.createdAt))
      .limit(200)
      .all();
    return c.json({
      items: rows.map((r) => ({ ...r.s, application: { id: r.appId, title: r.appTitle } })),
    });
  },
);

routes.get("/dashboard", async (c) => {
  return c.json(await getDashboard(c.var.ctx, c.var.tenant.orgId));
});

routes.get(
  "/followups",
  validate(
    "query",
    z.object({
      status: z.enum(FOLLOWUP_STATUSES).optional(),
      applicationId: z.string().optional(),
    }),
  ),
  async (c) => {
    const q = c.req.valid("query");
    const items = await listFollowups(c.var.ctx, c.var.tenant.orgId, q);
    return c.json({ items });
  },
);

routes.patch(
  "/followups/:id",
  requireRole("editor"),
  validate(
    "json",
    z
      .object({
        status: z.enum(FOLLOWUP_STATUSES).optional(),
        notes: z.string().max(5000).optional(),
      })
      .refine((v) => v.status !== undefined || v.notes !== undefined, {
        message: "Provide status or notes",
      }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const row = await updateFollowup(c.var.ctx, {
      orgId: c.var.tenant.orgId,
      followupId: c.req.param("id"),
      userId: c.var.tenant.userId,
      status: body.status,
      notes: body.notes,
      requestId: c.var.requestId,
    });
    return c.json(row);
  },
);

async function loadSubmission(c: { var: AppEnv["Variables"] }, id: string) {
  const { orgId } = c.var.tenant;
  const row = await c.var.ctx.db
    .select()
    .from(submissions)
    .where(and(eq(submissions.id, id), eq(submissions.orgId, orgId)))
    .get();
  if (!row) throw notFound("Submission");
  return row;
}

routes.get("/:id", async (c) => {
  const { orgId } = c.var.tenant;
  const sub = await loadSubmission(c, c.req.param("id"));
  const db = c.var.ctx.db;
  const [app, fups] = await Promise.all([
    db
      .select({ id: applications.id, title: applications.title, status: applications.status })
      .from(applications)
      .where(and(eq(applications.id, sub.applicationId), eq(applications.orgId, orgId)))
      .get(),
    db
      .select()
      .from(followups)
      .where(and(eq(followups.orgId, orgId), eq(followups.submissionId, sub.id)))
      .all(),
  ]);
  return c.json({ ...sub, application: app ?? null, followups: fups });
});

routes.get(
  "/:id/package",
  validate(
    "query",
    z.object({ format: z.enum(["json", "md"]).optional(), download: z.string().optional() }),
  ),
  async (c) => {
    const { orgId } = c.var.tenant;
    const { format = "json", download } = c.req.valid("query");
    const sub = await loadSubmission(c, c.req.param("id"));
    const key = format === "md" ? packageKeys(orgId, sub.id).md : sub.packageR2Key;
    if (!key.startsWith(`orgs/${orgId}/`)) throw notFound("Package");
    const obj = await c.var.ctx.env.FILES.get(key);
    if (!obj) throw notFound("Package");
    const filename = `submission-${sub.id}.${format}`;
    const headers: Record<string, string> = {
      "Content-Type":
        format === "md" ? "text/markdown; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Package-Sha256": sub.packageSha256,
    };
    if (format === "json") {
      const body = await obj.text();
      const actual = await sha256Hex(body);
      headers["X-Package-Integrity"] = actual === sub.packageSha256 ? "verified" : "mismatch";
      if (actual !== sub.packageSha256) {
        c.var.ctx.logger.error("submission.package_hash_mismatch", { orgId, submissionId: sub.id });
      }
      return c.body(body, 200, headers);
    }
    return c.body(obj.body, 200, headers);
  },
);

// Reviewer+: whoever can approve a manual submission can also record that it was sent (audited
// as submission.confirmed / application.submitted by the service).
routes.post(
  "/:id/confirm",
  requireRole("reviewer"),
  validate(
    "json",
    z.object({ externalRef: z.string().trim().max(200).optional().nullable() }).default({}),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const row = await confirmSubmission(c.var.ctx, {
      orgId: c.var.tenant.orgId,
      submissionId: c.req.param("id"),
      userId: c.var.tenant.userId,
      externalRef: body.externalRef ?? null,
      requestId: c.var.requestId,
    });
    return c.json(row);
  },
);

export default routes;
