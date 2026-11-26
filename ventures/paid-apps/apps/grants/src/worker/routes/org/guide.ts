// OWNER: guide — GET /api/orgs/:orgId/guide: the getting-started checklist, computed from org data.
// Read-only; any member (viewer+) may call it. Mounted in app.ts as org.route("/guide", guideRoutes).
import { Hono } from "hono";
import { getGuide } from "../../services/guide";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

routes.get("/", async (c) => c.json(await getGuide(c.var.ctx, c.var.tenant.orgId)));

export default routes;
