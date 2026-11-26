// OWNER: approvals — /api/orgs/:orgId/approval-policies (who approves, delegations, status)
//   GET    /                              policy (rules + default rule)             viewer+
//   PUT    /                              { rules }                                 admin+
//   GET    /status/:applicationId         ApprovalStatusDto for the current version viewer+
//   GET    /delegations                   active + upcoming delegations             viewer+
//   POST   /delegations                   { fromUserId, toUserId, until }           reviewer+ (own) / admin+
//   DELETE /delegations/:id               end a delegation                          reviewer+ (involved) / admin+
import { ApprovalPolicyInput, DelegationInput } from "@shared/approvals";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { applications } from "../../db/schema";
import { conflict, notFound } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  createDelegation,
  evaluateApproval,
  getApprovalPolicy,
  listDelegations,
  revokeDelegation,
  saveApprovalPolicy,
  toApprovalStatusDto,
} from "../../services/approvals";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await getApprovalPolicy(c.var.ctx, c.var.tenant.orgId)))
  .put("/", requireRole("admin"), validate("json", ApprovalPolicyInput), async (c) => {
    const { orgId, userId } = c.var.tenant;
    const policy = await saveApprovalPolicy(c.var.ctx, {
      orgId,
      userId,
      requestId: c.var.requestId,
      ...c.req.valid("json"),
    });
    return c.json(policy);
  })
  .get("/status/:applicationId", async (c) => {
    const { orgId } = c.var.tenant;
    const app = await c.var.ctx.db
      .select({ currentVersionId: applications.currentVersionId })
      .from(applications)
      .where(and(eq(applications.id, c.req.param("applicationId")), eq(applications.orgId, orgId)))
      .get();
    if (!app) throw notFound("Application");
    if (!app.currentVersionId) throw conflict("There is no draft to approve yet");
    const evaluation = await evaluateApproval(c.var.ctx, {
      orgId,
      applicationId: c.req.param("applicationId"),
      versionId: app.currentVersionId,
    });
    return c.json(toApprovalStatusDto(evaluation));
  })
  .get("/delegations", async (c) => {
    return c.json({ items: await listDelegations(c.var.ctx, c.var.tenant.orgId) });
  })
  .post("/delegations", requireRole("reviewer"), validate("json", DelegationInput), async (c) => {
    const row = await createDelegation(
      c.var.ctx,
      c.var.tenant,
      c.req.valid("json"),
      c.var.requestId,
    );
    return c.json(row, 201);
  })
  .delete("/delegations/:id", requireRole("reviewer"), async (c) => {
    await revokeDelegation(c.var.ctx, c.var.tenant, c.req.param("id"), c.var.requestId);
    return c.json({ ok: true });
  });

export default routes;
