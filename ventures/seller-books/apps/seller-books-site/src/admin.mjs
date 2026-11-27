// Owner-console API for the early-access list (packages/admin-metrics contract, read by apps/admin):
//
//   GET /seller-books/api/admin/metrics?days=30   → EarlyAccessMetrics (total, confirmed, unsubscribed,
//                                                   by day, by source page)
//   GET /seller-books/api/admin/accounts?limit=50 → AdminSignupsPage (newest sign-ups: email, source,
//                                                   confirmed, date)
//
// Unsubscribed rows are kept as suppression records (docs/EARLY_ACCESS.md), so they count in
// `total` and `unsubscribed`, and their `confirmed` is false.
//
// Gate: ONLY the console's service token, `Authorization: Bearer <ADMIN_SERVICE_TOKEN>`, or for /metrics only
// the agents' read-only `Bearer <ADMIN_METRICS_TOKEN>` (each a Worker
// secret of at least 32 characters, set by .github/workflows/set-admins.yml; unset = closed). The
// site has no user accounts. Every read writes admin_audit_log. Never returned: tokens, token or IP
// hashes, consent internals, form answers beyond the contract. The gate and series helpers are the
// shared TypeScript source (packages/admin-metrics/src), which both wrangler and node --test load.
import {
  ADMIN_CONTRACT_VERSION,
  ADMIN_METRICS_ACTOR,
  ADMIN_SERVICE_ACTOR,
  bearerToken,
  dayBuckets,
  serviceTokenScope,
  windowStart,
} from "../../../packages/admin-metrics/src/index.ts";
import { SITE_NAME } from "./content.mjs";

const PRODUCT = "seller-books-site";
const TABLE = "early_access_signups";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
const error = (status, code, message) => json(status, { error: { code, message } });

function intParam(raw, def, min, max) {
  if (raw === null || raw === "") return def;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

async function audit(env, actor, action, metadata, now) {
  await env.DB.prepare(
    "INSERT INTO admin_audit_log (id, actor_type, actor_id, action, metadata, created_at) VALUES (?, 'service', ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), actor, `admin.${action}`, JSON.stringify(metadata), now)
    .run();
}

/** `sub` is the path after `/seller-books/api/admin` (e.g. "/metrics"). */
export async function handleAdmin(request, env, sub, now = () => new Date()) {
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
  const at = now();

  if (sub === "/metrics") {
    const days = intParam(url.searchParams.get("days"), 30, 1, 366);
    if (days === null) return error(400, "bad_request", "days: 1-366");
    const since = windowStart(at, days).getTime();
    const totals = await env.DB.prepare(
      `SELECT count(*) AS total,
         coalesce(sum(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END), 0) AS confirmed,
         coalesce(sum(CASE WHEN status = 'unsubscribed' THEN 1 ELSE 0 END), 0) AS unsubscribed
       FROM ${TABLE}`,
    ).first();
    const recent = await env.DB.prepare(
      `SELECT created_at, status FROM ${TABLE} WHERE created_at >= ?`,
    )
      .bind(since)
      .all();
    const sources = await env.DB.prepare(
      `SELECT consent_source AS source, count(*) AS n FROM ${TABLE} GROUP BY consent_source ORDER BY n DESC, consent_source`,
    ).all();
    const byDay = dayBuckets(
      recent.results.map((r) => ({
        at: new Date(Number(r.created_at)),
        verified: r.status === "confirmed",
      })),
      at,
      days,
    );
    const body = {
      contractVersion: ADMIN_CONTRACT_VERSION,
      kind: "early_access",
      product: PRODUCT,
      productName: `${SITE_NAME} (site)`,
      generatedAt: at.toISOString(),
      windowDays: days,
      total: Number(totals?.total ?? 0),
      confirmed: Number(totals?.confirmed ?? 0),
      unsubscribed: Number(totals?.unsubscribed ?? 0),
      lastWindow: byDay.reduce((n, d) => n + d.total, 0),
      byDay,
      bySource: sources.results.map((r) => ({ source: r.source, count: Number(r.n) })),
    };
    await audit(env, actor, "metrics_read", { days }, at.getTime());
    return json(200, body);
  }

  if (sub === "/accounts") {
    if (scope !== "full") return error(403, "forbidden", "Aggregate metrics only");
    const limit = intParam(url.searchParams.get("limit"), 50, 1, 200);
    if (limit === null) return error(400, "bad_request", "limit: 1-200");
    if ((url.searchParams.get("list") ?? "recent") !== "recent")
      return error(400, "bad_request", "list: recent");
    const rows = await env.DB.prepare(
      `SELECT id, email, consent_source AS source, status, created_at FROM ${TABLE} ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
      .bind(limit)
      .all();
    const body = {
      contractVersion: ADMIN_CONTRACT_VERSION,
      kind: "early_access",
      product: PRODUCT,
      list: "recent",
      // The form collects no name.
      items: rows.results.map((r) => ({
        id: r.id,
        email: r.email,
        name: null,
        source: r.source,
        confirmed: r.status === "confirmed",
        createdAt: new Date(Number(r.created_at)).toISOString(),
      })),
      limit,
    };
    await audit(env, actor, "accounts_read", { limit, returned: body.items.length }, at.getTime());
    return json(200, body);
  }

  return error(404, "not_found", "Not found");
}
