// Which of our pages sent each new account: POST /api/me/signup-source (once, while the account is
// new) and the `sources` counts in the owner's metrics (ids, statuses and page names only).
// Same behaviour as payapps' test/worker/signup-source.test.ts; the outcome here is a sent quote.
import type { ProductAdminMetrics, SignupSourceRow } from "@admin-metrics";
import { quotes, signupSources, user } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, createTestUser, setupTenant, testDb } from "./helpers";

const bearer = { Authorization: "Bearer test-admin-service-token-0123456789abcdef" };

/** api() that asserts the status and returns the parsed JSON body. */
async function call<T = unknown>(
  path: string,
  init: Parameters<typeof api>[1] & { expect?: number } = {},
): Promise<T> {
  const { expect: status = 200, ...rest } = init;
  const res = await api(path, rest);
  const text = await res.text();
  if (res.status !== status) throw new Error(`${path}: ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

async function storedSource(userId: string) {
  const row = await testDb()
    .select({ source: signupSources.source })
    .from(signupSources)
    .where(eq(signupSources.userId, userId))
    .get();
  return row?.source ?? null;
}

/** The shop sent one quote (the outcome the metrics count): a frozen, sent quote row. */
async function sentQuote(orgId: string) {
  await testDb()
    .insert(quotes)
    .values({
      id: newId("quo"),
      orgId,
      quoteNumber: 1001,
      status: "sent",
      customerCompany: "Secret Aerospace Customer",
      sentAt: new Date(),
    });
}

describe("POST /api/me/signup-source", () => {
  it("records the page once, normalized, and never replaces it", async () => {
    const u = await createTestUser();
    const first = await call("/api/me/signup-source", {
      method: "POST",
      as: u.id,
      json: { source: "Machine-Shop-Guides/CNC-Cycle-Time.html" },
    });
    expect(first).toEqual({
      recorded: true,
      source: "machine-shop-guides/cnc-cycle-time",
    });
    const again = await call("/api/me/signup-source", {
      method: "POST",
      as: u.id,
      json: { source: "jobshop-site/pricing" },
    });
    expect(again).toEqual({ recorded: false, reason: "already-recorded" });
    expect(await storedSource(u.id)).toBe("machine-shop-guides/cnc-cycle-time");
  });

  it("refuses a value that is not one of our page names, and needs a session", async () => {
    const u = await createTestUser();
    for (const source of ["https://evil.example/", "a/../b", "<b>x</b>", "x@y.z"]) {
      await call("/api/me/signup-source", {
        method: "POST",
        as: u.id,
        json: { source },
        expect: 400,
      });
    }
    expect(await storedSource(u.id)).toBeNull();
    await call("/api/me/signup-source", {
      method: "POST",
      json: { source: "machine-shop-guides" },
      expect: 401,
    });
  });

  it("ignores an account older than the window", async () => {
    const u = await createTestUser();
    await testDb()
      .update(user)
      .set({ createdAt: new Date(Date.now() - 15 * 86_400_000) })
      .where(eq(user.id, u.id));
    const res = await call("/api/me/signup-source", {
      method: "POST",
      as: u.id,
      json: { source: "machine-shop-guides" },
    });
    expect(res).toEqual({ recorded: false, reason: "account-not-new" });
    expect(await storedSource(u.id)).toBeNull();
  });
});

describe("owner metrics: sign-ups by source", () => {
  const row = (m: ProductAdminMetrics, source: string): SignupSourceRow =>
    m.sources?.rows.find((r) => r.source === source) ?? {
      source,
      site: "",
      signups: 0,
      lastWindow: 0,
      verified: 0,
      withCompany: 0,
      reachedOutcome: 0,
      paying: 0,
    };

  it("counts accounts per page and how far their shops got, without tenant content", async () => {
    const SRC = "jobshop-site/sources-test-page";
    const before = await call<ProductAdminMetrics>("/api/admin/metrics?days=7", {
      headers: bearer,
    });

    // One account from the page whose shop sent a quote; one whose shop did nothing yet; one
    // from the page with no shop; one with no source at all.
    const sender = await setupTenant();
    const idle = await setupTenant();
    const loose = await createTestUser();
    await setupTenant();
    for (const id of [sender.userId, idle.userId, loose.id]) {
      await call("/api/me/signup-source", { method: "POST", as: id, json: { source: SRC } });
    }
    await sentQuote(sender.orgId);

    const res = await api("/api/admin/metrics?days=7", { headers: bearer });
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain("Secret Aerospace Customer");
    expect(text).not.toContain(`${sender.userId}@example.test`);
    const after = JSON.parse(text) as ProductAdminMetrics;

    const r = row(after, SRC);
    const b = row(before, SRC);
    expect(r.site).toBe("jobshop-site");
    expect(r.signups - b.signups).toBe(3);
    expect(r.lastWindow - b.lastWindow).toBe(3);
    expect(r.withCompany - b.withCompany).toBe(2);
    expect(r.reachedOutcome - b.reachedOutcome).toBe(1);
    expect(r.paying - b.paying).toBe(0);
    expect(row(after, "(none)").signups - row(before, "(none)").signups).toBeGreaterThanOrEqual(1);
    // Every account is in exactly one row; "(none)" sorts last.
    const total = after.sources?.rows.reduce((n, x) => n + x.signups, 0);
    expect(total).toBe(after.signups.total);
    expect(after.sources?.rows.at(-1)?.source).toBe("(none)");
  });
});
