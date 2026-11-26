// OWNER: eligibility agent — /api/orgs/:orgId/eligibility (per-org eligibility checklist).
// Opportunity visibility (public catalog + this org's private imports) is enforced by the service.
import { ROLE_RANK } from "@shared/enums";
import { Hono } from "hono";
import { AppError, badRequest } from "../../lib/errors";
import { requireRole } from "../../middleware/tenant";
import { checkEligibility, getEligibility } from "../../services/eligibility";
import type { AppEnv } from "../../types";

const opportunityIdParam = (raw: string | undefined): string => {
  const id = raw?.trim() ?? "";
  if (!id || id.length > 64) throw badRequest("Invalid opportunity id");
  return id;
};

const routes = new Hono<AppEnv>()
  /** The stored check; computed on first request for editors+. Viewers get 404 not_checked. */
  .get("/:opportunityId", async (c) => {
    const { orgId, role } = c.var.tenant;
    const id = opportunityIdParam(c.req.param("opportunityId"));
    const stored = await getEligibility(c.var.ctx, orgId, id);
    if (stored) return c.json(stored);
    if (ROLE_RANK[role] < ROLE_RANK.editor) {
      throw new AppError(
        404,
        "not_checked",
        "Eligibility has not been checked yet. Ask an editor to run the check.",
      );
    }
    return c.json(await checkEligibility(c.var.ctx, orgId, id));
  })
  .post("/:opportunityId/recheck", requireRole("editor"), async (c) => {
    const id = opportunityIdParam(c.req.param("opportunityId"));
    return c.json(await checkEligibility(c.var.ctx, c.var.tenant.orgId, id));
  });

export default routes;
