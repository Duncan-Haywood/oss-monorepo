// OWNER: pipeline agent — /api/orgs/:orgId/applications (create, list, get, versions, flags, edit)

import { APPLICATION_STATUSES, type ApplicationStatus } from "@shared/enums";
import { ApplyQualityBody, QualityInterviewBody } from "@shared/quality";
import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  applicationCost,
  createApplication,
  editSection,
  loadApplication,
  OutcomeInput,
  recordOutcome,
  regenerate,
  resolveFlag,
  SectionEdit,
  withdrawApplication,
} from "../../services/pipeline";
import {
  applyQualitySuggestions,
  getApplicationQuality,
  startQualityInterview,
} from "../../services/pipeline/quality-actions";
import { getApplicationDetail, listApplications } from "../../services/pipeline/queries";
import type { AppEnv } from "../../types";

const CreateBody = z.object({
  opportunityId: z.string().min(1),
  projectId: z.string().min(1).nullish(),
  requestedAmountCents: z.number().int().positive().nullish(),
});

const ListQuery = z.object({
  /** One status or a comma-separated list. */
  status: z
    .string()
    .optional()
    .transform((s) =>
      (s ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter((x): x is ApplicationStatus =>
          (APPLICATION_STATUSES as readonly string[]).includes(x),
        ),
    ),
});

const RegenerateBody = z.object({
  sectionKey: z.string().min(1).optional(),
  instructions: z.string().max(5000).optional(),
});
const ResolveBody = z.object({ resolution: z.string().trim().min(1).max(5000) });

const routes = new Hono<AppEnv>()
  .post("/", requireRole("editor"), validate("json", CreateBody), async (c) => {
    const { orgId, userId } = c.var.tenant;
    const body = c.req.valid("json");
    const app = await createApplication(c.var.ctx, {
      orgId,
      opportunityId: body.opportunityId,
      projectId: body.projectId ?? null,
      requestedAmountCents: body.requestedAmountCents ?? null,
      startedBy: userId,
      requestId: c.var.requestId,
    });
    return c.json(app, 201);
  })
  .get("/", validate("query", ListQuery), async (c) => {
    const { status } = c.req.valid("query");
    const items = await listApplications(c.var.ctx, c.var.tenant.orgId, { statuses: status });
    return c.json({ items });
  })
  .get("/:id", async (c) => {
    return c.json(await getApplicationDetail(c.var.ctx, c.var.tenant.orgId, c.req.param("id")));
  })
  .get("/:id/cost", async (c) => {
    const ids = { orgId: c.var.tenant.orgId, applicationId: c.req.param("id") };
    await loadApplication(c.var.ctx, ids); // 404 for other tenants' ids
    return c.json(await applicationCost(c.var.ctx, ids));
  })
  // Funder rubric scoring (advisory; never blocks submission).
  .get("/:id/quality", async (c) => {
    const ids = { orgId: c.var.tenant.orgId, applicationId: c.req.param("id") };
    return c.json(await getApplicationQuality(c.var.ctx, ids));
  })
  .post(
    "/:id/quality/apply",
    requireRole("editor"),
    validate("json", ApplyQualityBody),
    async (c) => {
      const { orgId, userId } = c.var.tenant;
      const body = c.req.valid("json");
      const app = await applyQualitySuggestions(c.var.ctx, {
        orgId,
        applicationId: c.req.param("id"),
        sectionKey: body.sectionKey,
        suggestionIds: body.suggestionIds,
        userId,
        requestId: c.var.requestId,
      });
      return c.json(app);
    },
  )
  .post(
    "/:id/quality/interview",
    requireRole("editor"),
    validate("json", QualityInterviewBody),
    async (c) => {
      const { orgId, userId } = c.var.tenant;
      const result = await startQualityInterview(c.var.ctx, {
        orgId,
        applicationId: c.req.param("id"),
        suggestionIds: c.req.valid("json").suggestionIds,
        userId,
      });
      return c.json(result, 201);
    },
  )
  .patch(
    "/:id/sections/:sectionKey",
    requireRole("editor"),
    validate("json", SectionEdit),
    async (c) => {
      const { orgId, userId } = c.var.tenant;
      const app = await editSection(c.var.ctx, {
        orgId,
        applicationId: c.req.param("id"),
        sectionKey: c.req.param("sectionKey"),
        paragraphs: c.req.valid("json").paragraphs,
        userId,
        requestId: c.var.requestId,
      });
      return c.json(app);
    },
  )
  .post("/:id/regenerate", requireRole("editor"), validate("json", RegenerateBody), async (c) => {
    const { orgId, userId } = c.var.tenant;
    const body = c.req.valid("json");
    const app = await regenerate(c.var.ctx, {
      orgId,
      applicationId: c.req.param("id"),
      sectionKey: body.sectionKey,
      instructions: body.instructions,
      userId,
      requestId: c.var.requestId,
    });
    return c.json(app);
  })
  .post(
    "/:id/flags/:flagId/resolve",
    requireRole("editor"),
    validate("json", ResolveBody),
    async (c) => {
      const { orgId, userId } = c.var.tenant;
      const flag = await resolveFlag(c.var.ctx, {
        orgId,
        applicationId: c.req.param("id"),
        flagId: c.req.param("flagId"),
        resolution: c.req.valid("json").resolution,
        userId,
        requestId: c.var.requestId,
      });
      return c.json(flag);
    },
  )
  .post("/:id/withdraw", requireRole("editor"), async (c) => {
    const { orgId, userId } = c.var.tenant;
    const app = await withdrawApplication(c.var.ctx, {
      orgId,
      applicationId: c.req.param("id"),
      userId,
      requestId: c.var.requestId,
    });
    return c.json(app);
  })
  .post("/:id/outcome", requireRole("editor"), validate("json", OutcomeInput), async (c) => {
    const { orgId, userId } = c.var.tenant;
    const app = await recordOutcome(c.var.ctx, {
      orgId,
      applicationId: c.req.param("id"),
      ...c.req.valid("json"),
      userId,
      requestId: c.var.requestId,
    });
    return c.json(app);
  });

export default routes;
