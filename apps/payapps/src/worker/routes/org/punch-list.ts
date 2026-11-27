// /api/orgs/:orgId/projects/:projectId/punch-list: the job's punch list
// (services/payapps/punch-list.ts). Every member reads it and downloads the PDF and CSV; editors
// (who run the job's paperwork) add, change and delete. Free on every plan: it is rows of text and
// an on-request PDF.
import { punchItemSchema, punchItemsBulkSchema, updatePunchItemSchema } from "@shared/api/schemas";
import { Hono } from "hono";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  punchListCsv,
  punchListFileName,
  punchListPdf,
} from "../../services/export/punch-list-export";
import {
  createPunchItem,
  createPunchItems,
  deletePunchItem,
  listPunchItems,
  loadPunchListDocument,
  updatePunchItem,
} from "../../services/payapps/punch-list";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();
const editor = requireRole("editor");
const projectId = (c: { req: { param: (k: "projectId") => string | undefined } }) =>
  c.req.param("projectId") ?? "";
/** `?only=open` prints the items still to fix or awaiting back-check; anything else prints all. */
const scopeOf = (v: string | undefined) => (v === "open" ? "open" : "all");

routes.get("/", async (c) =>
  c.json(await listPunchItems(c.var.ctx, c.var.tenant.orgId, projectId(c))),
);

// Registered before "/:itemId" so the literal segments are never read as an item id.
routes.get("/punch-list.csv", async (c) => {
  const doc = await loadPunchListDocument(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    scopeOf(c.req.query("only")),
  );
  return new Response(punchListCsv(doc), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${punchListFileName(doc.project, "csv")}"`,
      "Cache-Control": "no-store",
    },
  });
});

routes.get("/punch-list.pdf", async (c) => {
  const doc = await loadPunchListDocument(
    c.var.ctx,
    c.var.tenant.orgId,
    projectId(c),
    scopeOf(c.req.query("only")),
  );
  return new Response(punchListPdf(doc).slice().buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${punchListFileName(doc.project, "pdf")}"`,
      "Cache-Control": "no-store",
    },
  });
});

routes.post("/bulk", editor, validate("json", punchItemsBulkSchema), async (c) =>
  c.json(
    await createPunchItems(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.valid("json").items),
    201,
  ),
);

routes.post("/", editor, validate("json", punchItemSchema), async (c) =>
  c.json(
    await createPunchItem(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.valid("json")),
    201,
  ),
);

routes.patch("/:itemId", editor, validate("json", updatePunchItemSchema), async (c) =>
  c.json(
    await updatePunchItem(
      c.var.ctx,
      c.var.tenant.orgId,
      projectId(c),
      c.req.param("itemId"),
      c.req.valid("json"),
    ),
  ),
);

routes.delete("/:itemId", editor, async (c) => {
  await deletePunchItem(c.var.ctx, c.var.tenant.orgId, projectId(c), c.req.param("itemId"));
  return c.json({ ok: true });
});

export default routes;
