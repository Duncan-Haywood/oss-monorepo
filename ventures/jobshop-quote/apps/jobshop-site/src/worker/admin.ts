// Owner-console API for the early-access list (packages/admin-metrics contract, read by apps/admin):
//
//   GET {base}/api/admin/metrics?days=30   → EarlyAccessMetrics (count, by day, by source page)
//   GET {base}/api/admin/accounts?limit=50 → AdminSignupsPage (newest requests: email, name, source, date)
//
// Gate: ONLY the console's service token, `Authorization: Bearer <ADMIN_SERVICE_TOKEN>`, or for /metrics only
// the agents' read-only `Bearer <ADMIN_METRICS_TOKEN>` (each a Worker
// secret of at least 32 characters, set by .github/workflows/set-admins.yml; unset = closed). The
// site has no user accounts. Every read writes admin_audit_log. The list is single opt-in (no
// confirmation email yet, README "Email"), so `confirmed` is null, never a guess. Never returned:
// the IP hash, consent internals, or form answers beyond the contract.
import {
  ADMIN_CONTRACT_VERSION,
  ADMIN_METRICS_ACTOR,
  ADMIN_SERVICE_ACTOR,
  type AdminSignupsPage,
  bearerToken,
  dayBuckets,
  type EarlyAccessMetrics,
  serviceTokenScope,
  windowStart,
} from "@admin-metrics";
import { SITE_NAME } from "@site/config";
import type { Env } from "./env";

const PRODUCT = "jobshop-site";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
const error = (status: number, code: string, message: string) =>
  json(status, { error: { code, message } });

function intParam(raw: string | null, def: number, min: number, max: number): number | null {
  if (raw === null || raw === "") return def;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

async function audit(env: Env, actor: string, action: string, metadata: Record<string, unknown>) {
  await env.DB.prepare(
    "INSERT INTO admin_audit_log (id, actor_type, actor_id, action, metadata, created_at) VALUES (?, 'service', ?, ?, ?, ?)",
  )
    .bind(
      crypto.randomUUID(),
      actor,
      `admin.${action}`,
      JSON.stringify(metadata),
      new Date().toISOString(),
    )
    .run();
}

/** `sub` is the path after `{base}/api/admin`. */
export async function handleAdmin(
  request: Request,
  env: Env,
  sub: string,
  now: () => Date = () => new Date(),
): Promise<Response> {
  const presented = bearerToken(request.headers.get("Authorization"));
  if (!presented) return error(401, "unauthorized", "Service token required");
  const scope = await serviceTokenScope(presented, {
    serviceToken: env.ADMIN_SERVICE_TOKEN,
    metricsToken: env.ADMIN_METRICS_TOKEN,
  });
  if (!scope) {
    console.warn(JSON.stringify({ event: "admin.denied" }));
    return error(403, "forbidden", "Not allowed");
  }
  // ADMIN_METRICS_TOKEN (agents) reads aggregate metrics only, never the sign-up list (emails).
  const actor = scope === "metrics" ? ADMIN_METRICS_ACTOR : ADMIN_SERVICE_ACTOR;
  if (request.method !== "GET") return error(405, "method_not_allowed", "GET only");
  const url = new URL(request.url);

  if (sub === "/metrics") {
    const days = intParam(url.searchParams.get("days"), 30, 1, 366);
    if (days === null) return error(400, "bad_request", "days: 1-366");
    const at = now();
    const since = windowStart(at, days).toISOString();
    const [total, recent, sources] = await Promise.all([
      env.DB.prepare("SELECT count(*) AS n FROM early_access_requests").first<{ n: number }>(),
      env.DB.prepare("SELECT created_at FROM early_access_requests WHERE created_at >= ?")
        .bind(since)
        .all<{ created_at: string }>(),
      env.DB.prepare(
        "SELECT consent_source AS source, count(*) AS n FROM early_access_requests GROUP BY consent_source ORDER BY n DESC, consent_source",
      ).all<{ source: string; n: number }>(),
    ]);
    const byDay = dayBuckets(
      recent.results.map((r) => ({ at: new Date(r.created_at) })),
      at,
      days,
      false,
    );
    const body: EarlyAccessMetrics = {
      contractVersion: ADMIN_CONTRACT_VERSION,
      kind: "early_access",
      product: PRODUCT,
      productName: `${SITE_NAME} (site)`,
      generatedAt: at.toISOString(),
      windowDays: days,
      total: total?.n ?? 0,
      confirmed: null,
      unsubscribed: null,
      lastWindow: byDay.reduce((n, d) => n + d.total, 0),
      byDay,
      bySource: sources.results.map((r) => ({ source: r.source, count: r.n })),
    };
    await audit(env, actor, "metrics_read", { days });
    return json(200, body);
  }

  if (sub === "/accounts") {
    if (scope !== "full") return error(403, "forbidden", "Aggregate metrics only");
    const limit = intParam(url.searchParams.get("limit"), 50, 1, 200);
    if (limit === null) return error(400, "bad_request", "limit: 1-200");
    if ((url.searchParams.get("list") ?? "recent") !== "recent") {
      return error(400, "bad_request", "list: recent");
    }
    const rows = await env.DB.prepare(
      "SELECT id, email, name, consent_source, created_at FROM early_access_requests ORDER BY created_at DESC, id DESC LIMIT ?",
    )
      .bind(limit)
      .all<{
        id: string;
        email: string;
        name: string;
        consent_source: string;
        created_at: string;
      }>();
    const body: AdminSignupsPage = {
      contractVersion: ADMIN_CONTRACT_VERSION,
      kind: "early_access",
      product: PRODUCT,
      list: "recent",
      items: rows.results.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name || null,
        source: r.consent_source,
        confirmed: null,
        createdAt: new Date(r.created_at).toISOString(),
      })),
      limit,
    };
    await audit(env, actor, "accounts_read", { limit, returned: body.items.length });
    return json(200, body);
  }

  return error(404, "not_found", "Not found");
}
