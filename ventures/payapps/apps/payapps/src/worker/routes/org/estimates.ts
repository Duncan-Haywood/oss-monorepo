// /api/orgs/:orgId/estimates: the company's bids (services/payapps/estimates.ts). Every member reads
// them and downloads the proposal PDF; editors add, change, price and delete them, and mark one won,
// which creates its job (counted against the plan's active jobs like any new job). Free on every plan;
// the cost budgets a won bid sets on its job need job costing (Crew and up) and are skipped without it.
import {
  estimateLinesSchema,
  estimateSchema,
  updateEstimateSchema,
  winEstimateSchema,
} from "@shared/api/schemas";
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import { proposalFileName, proposalPdf } from "../../services/export/estimate-pdf";
import {
  createEstimate,
  deleteEstimate,
  getEstimate,
  listEstimates,
  loadEstimateDocument,
  setEstimateLines,
  updateEstimate,
  winEstimate,
} from "../../services/payapps/estimates";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");

routes.get("/", async (c) => c.json(await listEstimates(c.var.ctx, c.var.tenant.orgId)));

routes.post("/", editor, validate("json", estimateSchema), async (c) =>
  c.json(await createEstimate(c.var.ctx, c.var.tenant, c.req.valid("json")), 201),
);

routes.get("/:estimateId", async (c) =>
  c.json(await getEstimate(c.var.ctx, c.var.tenant.orgId, c.req.param("estimateId"))),
);

routes.patch("/:estimateId", editor, validate("json", updateEstimateSchema), async (c) =>
  c.json(
    await updateEstimate(
      c.var.ctx,
      c.var.tenant.orgId,
      c.req.param("estimateId"),
      c.req.valid("json"),
    ),
  ),
);

routes.put("/:estimateId/lines", editor, validate("json", estimateLinesSchema), async (c) =>
  c.json(
    await setEstimateLines(
      c.var.ctx,
      c.var.tenant.orgId,
      c.req.param("estimateId"),
      c.req.valid("json"),
    ),
  ),
);

routes.post("/:estimateId/win", editor, validate("json", winEstimateSchema), async (c) =>
  c.json(
    await winEstimate(c.var.ctx, c.var.tenant, c.req.param("estimateId"), c.req.valid("json")),
    201,
  ),
);

routes.delete("/:estimateId", editor, async (c) => {
  await deleteEstimate(c.var.ctx, c.var.tenant.orgId, c.req.param("estimateId"));
  return c.json({ ok: true });
});

routes.get("/:estimateId/proposal.pdf", async (c) => {
  const doc = await loadEstimateDocument(c.var.ctx, c.var.tenant.orgId, c.req.param("estimateId"));
  return new Response(proposalPdf(doc).slice().buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${proposalFileName(doc)}"`,
      "Cache-Control": "no-store",
    },
  });
});

export default routes;
