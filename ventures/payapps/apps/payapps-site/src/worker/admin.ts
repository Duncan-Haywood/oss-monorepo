// Owner-console API for the early-access list (packages/admin-metrics contract, read by apps/admin):
//
//   GET /api/admin/metrics?days=30   → EarlyAccessMetrics (counts, confirmed, by day, by source page)
//   GET /api/admin/accounts?limit=50 → AdminSignupsPage (newest sign-ups: email, source, confirmed, date)
//
// Gate: ONLY the console's service token, `Authorization: Bearer <ADMIN_SERVICE_TOKEN>` (a Worker
// secret of at least 32 characters, set by .github/workflows/set-admins.yml; unset = closed). The
// site has no user accounts, so there is no session path. `Bearer <ADMIN_METRICS_TOKEN>` (agents)
// reads /metrics only; /accounts (emails) answers 403 to it. Every read writes admin_audit_log.
// Never returned: tokens, token hashes, consent internals, form answers beyond the contract.
import {
  ADMIN_CONTRACT_VERSION,
  ADMIN_METRICS_ACTOR,
  ADMIN_SERVICE_ACTOR,
  type AdminScope,
  type AdminSignupsPage,
  bearerToken,
  dayBuckets,
  type EarlyAccessMetrics,
  serviceTokenScope,
  windowStart,
} from "@admin-metrics";
import { PRODUCT_NAME } from "@shared/site";
import { type Context, Hono } from "hono";

type AdminEnv = {
  Bindings: CloudflareBindings & { ADMIN_SERVICE_TOKEN?: string; ADMIN_METRICS_TOKEN?: string };
  Variables: { adminScope: AdminScope };
};
type C = Context<AdminEnv>;

const PRODUCT = "payapps-site";

function intParam(raw: string | undefined, def: number, min: number, max: number): number | null {
  if (raw === undefined || raw === "") return def;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

async function audit(c: C, action: string, metadata: Record<string, unknown>) {
  await c.env.DB.prepare(
    "INSERT INTO admin_audit_log (id, actor_type, actor_id, action, metadata, created_at) VALUES (?, 'service', ?, ?, ?, ?)",
  )
    .bind(
      crypto.randomUUID(),
      c.var.adminScope === "metrics" ? ADMIN_METRICS_ACTOR : ADMIN_SERVICE_ACTOR,
      `admin.${action}`,
      JSON.stringify(metadata),
      Date.now(),
    )
    .run();
}

export function adminRoutes(now: () => Date) {
  const app = new Hono<AdminEnv>();

  app.use("*", async (c, next) => {
    const presented = bearerToken(c.req.header("Authorization"));
    if (!presented) {
      return c.json({ error: { code: "unauthorized", message: "Service token required" } }, 401);
    }
    const scope = await serviceTokenScope(presented, {
      serviceToken: c.env.ADMIN_SERVICE_TOKEN,
      metricsToken: c.env.ADMIN_METRICS_TOKEN,
    });
    if (!scope) {
      console.warn(JSON.stringify({ event: "admin.denied" }));
      return c.json({ error: { code: "forbidden", message: "Not allowed" } }, 403);
    }
    c.set("adminScope", scope);
    await next();
    c.res.headers.set("Cache-Control", "no-store");
  });

  app.get("/metrics", async (c) => {
    const days = intParam(c.req.query("days"), 30, 1, 366);
    if (days === null)
      return c.json({ error: { code: "bad_request", message: "days: 1-366" } }, 400);
    const at = now();
    const since = windowStart(at, days).getTime();
    const db = c.env.DB;
    const [totals, recent, sources] = await Promise.all([
      db
        .prepare(
          "SELECT count(*) AS total, sum(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed FROM early_access_signups",
        )
        .first<{ total: number; confirmed: number | null }>(),
      db
        .prepare("SELECT created_at, status FROM early_access_signups WHERE created_at >= ?")
        .bind(since)
        .all<{ created_at: number; status: string }>(),
      db
        .prepare(
          "SELECT source, count(*) AS n FROM early_access_signups GROUP BY source ORDER BY n DESC, source",
        )
        .all<{ source: string; n: number }>(),
    ]);
    const byDay = dayBuckets(
      recent.results.map((r) => ({
        at: new Date(r.created_at),
        verified: r.status === "confirmed",
      })),
      at,
      days,
    );
    const body: EarlyAccessMetrics = {
      contractVersion: ADMIN_CONTRACT_VERSION,
      kind: "early_access",
      product: PRODUCT,
      productName: `${PRODUCT_NAME} (site)`,
      generatedAt: at.toISOString(),
      windowDays: days,
      total: totals?.total ?? 0,
      confirmed: totals?.confirmed ?? 0,
      // A removal deletes the row, so there is no unsubscribed count to report.
      unsubscribed: null,
      lastWindow: byDay.reduce((n, d) => n + d.total, 0),
      byDay,
      bySource: sources.results.map((r) => ({ source: r.source, count: r.n })),
    };
    await audit(c, "metrics_read", { days });
    return c.json(body);
  });

  app.get("/accounts", async (c) => {
    // Emails: never for the read-only metrics token.
    if (c.var.adminScope !== "full") {
      return c.json({ error: { code: "forbidden", message: "Aggregate metrics only" } }, 403);
    }
    const limit = intParam(c.req.query("limit"), 50, 1, 200);
    if (limit === null)
      return c.json({ error: { code: "bad_request", message: "limit: 1-200" } }, 400);
    const list = c.req.query("list") ?? "recent";
    if (list !== "recent")
      return c.json({ error: { code: "bad_request", message: "list: recent" } }, 400);
    const rows = await c.env.DB.prepare(
      "SELECT id, email, source, status, created_at FROM early_access_signups ORDER BY created_at DESC, id DESC LIMIT ?",
    )
      .bind(limit)
      .all<{ id: string; email: string; source: string; status: string; created_at: number }>();
    const body: AdminSignupsPage = {
      contractVersion: ADMIN_CONTRACT_VERSION,
      kind: "early_access",
      product: PRODUCT,
      list: "recent",
      // The form collects no personal name (company is optional and not part of the contract).
      items: rows.results.map((r) => ({
        id: r.id,
        email: r.email,
        name: null,
        source: r.source,
        confirmed: r.status === "confirmed",
        createdAt: new Date(r.created_at).toISOString(),
      })),
      limit,
    };
    await audit(c, "accounts_read", { limit, returned: body.items.length });
    return c.json(body);
  });

  return app;
}
