// /api/orgs/:orgId/projects/:projectId/job-cost — one job's cost budgets, costs and job-cost report
// (services/payapps/job-cost.ts). Every member reads; editors on Crew and up change budgets, costs and
// commitments (purchase orders and subcontracts).
import {
  jobCostBudgetsSchema,
  jobCostCommitmentSchema,
  jobCostEntriesSchema,
  jobCostTypeBudgetsSchema,
  updateJobCostCommitmentSchema,
  updateJobCostEntrySchema,
} from "@shared/api/schemas";
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { assertJobCosting } from "../../services/billing";
import {
  addCommitment,
  addEntries,
  deleteCommitment,
  deleteEntry,
  getJobCost,
  jobCostCsv,
  setBudgets,
  setCostTypeBudgets,
  updateCommitment,
  updateEntry,
} from "../../services/payapps/job-cost";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");

const projectId = (c: { req: { param: (k: "projectId") => string | undefined } }) =>
  c.req.param("projectId") ?? "";

routes.get("/", async (c) => c.json(await getJobCost(c.var.ctx, c.var.tenant.orgId, projectId(c))));

routes.get("/job-cost.csv", async (c) => {
  const d = await getJobCost(c.var.ctx, c.var.tenant.orgId, projectId(c));
  const safe = d.projectName.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60) || "job";
  return new Response(jobCostCsv(d), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="job-cost-${safe}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});

routes.put("/budgets", editor, validate("json", jobCostBudgetsSchema), async (c) => {
  await assertJobCosting(c.var.ctx, c.var.tenant.orgId);
  await setBudgets(c.var.ctx, c.var.tenant, projectId(c), c.req.valid("json"));
  return c.json(await getJobCost(c.var.ctx, c.var.tenant.orgId, projectId(c)));
});

routes.put("/cost-type-budgets", editor, validate("json", jobCostTypeBudgetsSchema), async (c) => {
  await assertJobCosting(c.var.ctx, c.var.tenant.orgId);
  await setCostTypeBudgets(c.var.ctx, c.var.tenant, projectId(c), c.req.valid("json"));
  return c.json(await getJobCost(c.var.ctx, c.var.tenant.orgId, projectId(c)));
});

routes.post("/entries", editor, validate("json", jobCostEntriesSchema), async (c) => {
  await assertJobCosting(c.var.ctx, c.var.tenant.orgId);
  return c.json(await addEntries(c.var.ctx, c.var.tenant, projectId(c), c.req.valid("json")), 201);
});

routes.patch("/entries/:entryId", editor, validate("json", updateJobCostEntrySchema), async (c) => {
  await assertJobCosting(c.var.ctx, c.var.tenant.orgId);
  return c.json(
    await updateEntry(
      c.var.ctx,
      c.var.tenant.orgId,
      projectId(c),
      c.req.param("entryId"),
      c.req.valid("json"),
    ),
  );
});

// Deleting stays open after a downgrade, so a mistaken cost can always be removed.
routes.delete("/entries/:entryId", editor, async (c) => {
  await deleteEntry(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.param("entryId"));
  return c.json({ ok: true });
});

routes.post("/commitments", editor, validate("json", jobCostCommitmentSchema), async (c) => {
  await assertJobCosting(c.var.ctx, c.var.tenant.orgId);
  return c.json(
    await addCommitment(c.var.ctx, c.var.tenant, projectId(c), c.req.valid("json")),
    201,
  );
});

routes.patch(
  "/commitments/:commitmentId",
  editor,
  validate("json", updateJobCostCommitmentSchema),
  async (c) => {
    await assertJobCosting(c.var.ctx, c.var.tenant.orgId);
    await updateCommitment(
      c.var.ctx,
      c.var.tenant.orgId,
      projectId(c),
      c.req.param("commitmentId"),
      c.req.valid("json"),
    );
    return c.json({ ok: true });
  },
);

// Like a cost, a commitment can always be deleted, after a downgrade too.
routes.delete("/commitments/:commitmentId", editor, async (c) => {
  await deleteCommitment(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.param("commitmentId"));
  return c.json({ ok: true });
});

export default routes;
