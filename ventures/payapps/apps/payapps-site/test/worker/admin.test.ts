// Owner-console API (/api/admin/*): service-token gate, counts, by-day and by-source series, no
// token or answer leaks, and an audit row per read.
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { AdminSignupsPage, EarlyAccessMetrics } from "@admin-metrics";
import { createApp, stripBasePath } from "@worker/app";
import { LogEmailSender } from "@worker/email";
import { beforeEach, describe, expect, it } from "vitest";

const SITE = "https://example.test/payapps";
const ORIGIN = "https://example.test";
const TOKEN = "test-admin-service-token-0123456789abcdef";
const NOW = new Date("2026-11-24T12:00:00Z");
const DAY = 86_400_000;

async function call(path: string, headers: Record<string, string> = {}) {
  const ctx = createExecutionContext();
  const app = createApp({ sender: () => new LogEmailSender(), now: () => NOW });
  const req = stripBasePath(new Request(`${ORIGIN}${path}`, { headers }), SITE);
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const auth = { Authorization: `Bearer ${TOKEN}` };

async function seed(email: string, status: "pending" | "confirmed", source: string, at: number) {
  await env.DB.prepare(
    `INSERT INTO early_access_signups (id, email, status, company, source, consent_version,
       confirm_token_hash, remove_token_hash, created_at, updated_at)
     VALUES (?, ?, ?, 'Acme', ?, 'v1', ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), email, status, source, `chash-${email}`, `rhash-${email}`, at, at)
    .run();
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM early_access_signups").run();
  await env.DB.prepare("DELETE FROM admin_audit_log").run();
  await seed("a@example.test", "confirmed", "/early-access", NOW.getTime() - 1000);
  await seed("b@example.test", "pending", "/early-access", NOW.getTime() - 1000);
  await seed("c@example.test", "confirmed", "/pricing", NOW.getTime() - 2 * DAY);
  await seed("d@example.test", "confirmed", "/pricing", NOW.getTime() - 60 * DAY);
});

describe("admin gate", () => {
  it("refuses no token (401) and a wrong token (403), under the base path too", async () => {
    expect((await call("/payapps/api/admin/metrics")).status).toBe(401);
    expect((await call("/api/admin/metrics", { Authorization: "Bearer wrong" })).status).toBe(403);
    expect((await call("/api/admin/accounts", { Authorization: `Bearer ${TOKEN}x` })).status).toBe(
      403,
    );
    const audits = await env.DB.prepare("SELECT count(*) AS n FROM admin_audit_log").first<{
      n: number;
    }>();
    expect(audits?.n).toBe(0);
  });
});

describe("read-only metrics token (agents)", () => {
  const metrics = { Authorization: "Bearer test-admin-metrics-token-0123456789abcdef" };
  it("reads metrics (audited as metrics-agent) but never the sign-up list", async () => {
    expect((await call("/api/admin/metrics", metrics)).status).toBe(200);
    expect((await call("/api/admin/accounts", metrics)).status).toBe(403);
    const rows = await env.DB.prepare("SELECT actor_id, action FROM admin_audit_log").all<{
      actor_id: string;
      action: string;
    }>();
    expect(rows.results).toEqual([{ actor_id: "metrics-agent", action: "admin.metrics_read" }]);
  });
});

describe("admin metrics", () => {
  it("counts total, confirmed, by day and by source page, and audits the read", async () => {
    const res = await call("/payapps/api/admin/metrics?days=7", auth);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const m = (await res.json()) as EarlyAccessMetrics;
    expect(m).toMatchObject({
      kind: "early_access",
      total: 4,
      confirmed: 3,
      unsubscribed: null,
      lastWindow: 3,
    });
    expect(m.byDay).toHaveLength(7);
    expect(m.byDay.at(-1)).toEqual({ day: "2026-11-24", total: 2, verified: 1 });
    expect(m.byDay.at(-3)).toEqual({ day: "2026-11-22", total: 1, verified: 1 });
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
    expect((await call("/api/admin/metrics?days=0", auth)).status).toBe(400);
  });

  it("lists the newest sign-ups with only the contract's fields", async () => {
    const res = await call("/api/admin/accounts?limit=2", auth);
    const page = (await res.json()) as AdminSignupsPage;
    expect(page.items).toHaveLength(2);
    expect(Object.keys(page.items[0] ?? {}).sort()).toEqual([
      "confirmed",
      "createdAt",
      "email",
      "id",
      "name",
      "source",
    ]);
    const text = JSON.stringify(page);
    expect(text).not.toMatch(/hash|token|Acme|consent/i);
    expect((await call("/api/admin/accounts?limit=201", auth)).status).toBe(400);
    const audits = await env.DB.prepare("SELECT action FROM admin_audit_log").all<{
      action: string;
    }>();
    expect(audits.results.map((r) => r.action)).toEqual(["admin.accounts_read"]);
  });
});
