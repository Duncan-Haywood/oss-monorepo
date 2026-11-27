// Owner-console API (/api/admin/*): service-token gate, counts, by-day and by-source series, no IP
// hash or answer leaks, and an audit row per read.
import { env, exports } from "cloudflare:workers";
import type { AdminSignupsPage, EarlyAccessMetrics } from "@admin-metrics";
import { beforeEach, describe, expect, it } from "vitest";

const worker = (exports as unknown as { default: Fetcher }).default;
const ORIGIN = "https://marisstella.app";
const TOKEN = "test-admin-service-token-0123456789abcdef";
const auth = { Authorization: `Bearer ${TOKEN}` };
const DAY = 86_400_000;

const get = (path: string, headers: Record<string, string> = {}) =>
  worker.fetch(`${ORIGIN}${path}`, { headers });

async function seed(email: string, source: string, at: Date) {
  await env.DB.prepare(
    `INSERT INTO early_access_requests (id, email, name, shop, role, processes, rfqs_per_week,
       consent_text_version, consent_source, consent_ip_hash, created_at, updated_at)
     VALUES (?, ?, 'Sam Rivera', 'Example Precision', 'owner', '[]', '20_50', 'v1', ?, 'iphash-secret', ?, ?)`,
  )
    .bind(crypto.randomUUID(), email, source, at.toISOString(), at.toISOString())
    .run();
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM early_access_requests").run();
  await env.DB.prepare("DELETE FROM admin_audit_log").run();
  const now = Date.now();
  await seed("a@example.test", "/early-access", new Date(now));
  await seed("b@example.test", "/early-access", new Date(now));
  await seed("c@example.test", "/pricing", new Date(now - 2 * DAY));
  await seed("d@example.test", "/pricing", new Date(now - 60 * DAY));
});

describe("admin gate", () => {
  it("refuses no token (401) and a wrong token (403), and audits nothing", async () => {
    expect((await get("/api/admin/metrics")).status).toBe(401);
    expect((await get("/api/admin/metrics", { Authorization: "Bearer wrong" })).status).toBe(403);
    expect((await get("/api/admin/accounts", { Authorization: `Bearer ${TOKEN}x` })).status).toBe(
      403,
    );
    const n = await env.DB.prepare("SELECT count(*) AS n FROM admin_audit_log").first<{
      n: number;
    }>();
    expect(n?.n).toBe(0);
  });
});

describe("read-only metrics token (agents)", () => {
  const metrics = { Authorization: `Bearer ${"test-admin-metrics-token-0123456789abcdef"}` };
  it("reads metrics (audited as metrics-agent) but never the request list", async () => {
    expect((await get("/api/admin/metrics", metrics)).status).toBe(200);
    expect((await get("/api/admin/accounts", metrics)).status).toBe(403);
    const rows = await env.DB.prepare("SELECT actor_id, action FROM admin_audit_log").all<{
      actor_id: string;
      action: string;
    }>();
    expect(rows.results).toEqual([{ actor_id: "metrics-agent", action: "admin.metrics_read" }]);
  });
});

describe("admin metrics", () => {
  it("counts total, by day and by source page; confirmed is null on a single opt-in list", async () => {
    const res = await get("/api/admin/metrics?days=7", auth);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const m = (await res.json()) as EarlyAccessMetrics;
    expect(m).toMatchObject({
      kind: "early_access",
      total: 4,
      confirmed: null,
      unsubscribed: null,
      lastWindow: 3,
    });
    expect(m.byDay).toHaveLength(7);
    expect(m.byDay.at(-1)).toMatchObject({ total: 2, verified: null });
    expect(m.byDay.at(-3)?.total).toBe(1);
    expect(m.bySource).toEqual([
      { source: "/early-access", count: 2 },
      { source: "/pricing", count: 2 },
    ]);
    const row = await env.DB.prepare("SELECT * FROM admin_audit_log").first<
      Record<string, unknown>
    >();
    expect(row).toMatchObject({
      actor_type: "service",
      actor_id: "admin-console",
      action: "admin.metrics_read",
    });
    expect((await get("/api/admin/metrics?days=999", auth)).status).toBe(400);
  });

  it("lists newest requests with only the contract's fields (no IP hash)", async () => {
    const page = (await (
      await get("/api/admin/accounts?limit=3", auth)
    ).json()) as AdminSignupsPage;
    expect(page.items).toHaveLength(3);
    expect(page.items[0]).toMatchObject({ name: "Sam Rivera", confirmed: null });
    expect(Object.keys(page.items[0] ?? {}).sort()).toEqual([
      "confirmed",
      "createdAt",
      "email",
      "id",
      "name",
      "source",
    ]);
    expect(JSON.stringify(page)).not.toMatch(/iphash|Example Precision|consent/i);
    const audits = await env.DB.prepare("SELECT action FROM admin_audit_log").all<{
      action: string;
    }>();
    expect(audits.results.map((r) => r.action)).toEqual(["admin.accounts_read"]);
    expect((await get("/api/admin/nope", auth)).status).toBe(404);
  });
});
