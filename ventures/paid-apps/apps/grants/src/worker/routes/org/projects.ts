// OWNER: knowledge agent — /api/orgs/:orgId/projects

import { PROJECT_STATUSES } from "@shared/enums";
import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  createProject,
  deleteProject,
  getProjectDetail,
  listProjects,
  updateProject,
} from "../../services/knowledge/projects";
import type { AppEnv } from "../../types";

const text = (max: number) => z.string().max(max);

const Fields = z.object({
  title: z.string().trim().min(1).max(200),
  summary: text(5000),
  problem: text(5000),
  approach: text(5000),
  populationServed: text(2000),
  location: text(500),
  budgetNeededCents: z.number().int().min(0).max(1e13).nullable(),
  timelineStart: z.string().max(60).nullable(),
  timelineEnd: z.string().max(60).nullable(),
  status: z.enum(PROJECT_STATUSES),
  priority: z.number().int().min(1).max(5),
});

const CreateBody = Fields.partial().required({ title: true });
const PatchBody = Fields.partial().strict();
const ListQuery = z.object({ status: z.enum(PROJECT_STATUSES).optional() });

const actorOf = (c: { var: AppEnv["Variables"] }) => ({
  userId: c.var.tenant.userId,
  requestId: c.var.requestId,
});

const routes = new Hono<AppEnv>()
  .get("/", validate("query", ListQuery), async (c) => {
    const items = await listProjects(c.var.ctx, c.var.tenant.orgId, c.req.valid("query"));
    return c.json({ items, nextCursor: null });
  })
  .post("/", requireRole("editor"), validate("json", CreateBody), async (c) => {
    const row = await createProject(c.var.ctx, c.var.tenant.orgId, c.req.valid("json"), actorOf(c));
    return c.json(row, 201);
  })
  .get("/:id", async (c) =>
    c.json(await getProjectDetail(c.var.ctx, c.var.tenant.orgId, c.req.param("id"))),
  )
  .patch("/:id", requireRole("editor"), validate("json", PatchBody), async (c) => {
    const row = await updateProject(
      c.var.ctx,
      c.var.tenant.orgId,
      c.req.param("id"),
      c.req.valid("json"),
      actorOf(c),
    );
    return c.json(row);
  })
  .delete("/:id", requireRole("editor"), async (c) => {
    await deleteProject(c.var.ctx, c.var.tenant.orgId, c.req.param("id"), actorOf(c));
    return c.json({ ok: true });
  });

export default routes;
