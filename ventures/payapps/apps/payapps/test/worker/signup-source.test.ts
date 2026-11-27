// Which of our pages sent each new account: POST /api/me/signup-source (once, while the account is
// new) and the `sources` counts in the owner's metrics (ids, statuses and page names only).
import type { ProductAdminMetrics, SignupSourceRow } from "@admin-metrics";
import type { PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { signupSources, user } from "@worker/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, call, createTestUser, setupTenant, testDb } from "./helpers";

const bearer = { Authorization: "Bearer test-admin-service-token-0123456789abcdef" };

async function storedSource(userId: string) {
  const row = await testDb()
    .select({ source: signupSources.source })
    .from(signupSources)
    .where(eq(signupSources.userId, userId))
    .get();
  return row?.source ?? null;
}

async function sendPayApp(orgId: string, as: string) {
  const job = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: { name: "Secret Clinic", gcName: "Harbor Builders", originalContractSumCents: 2_000_000 },
  });
  const base = `/api/orgs/${orgId}/projects/${job.id}`;
  const p = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Work", originalCents: 2_000_000 }] },
  });
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
  });
  await call(`${base}/pay-apps/${app.id}/lines`, {
    method: "PUT",
    as,
    json: {
      lines: [
        {
          sovLineId: p.sovLines[0]?.id ?? "",
          workThisPeriodCents: 1_000_000,
          storedMaterialsCents: 0,
          retainageReleasedCents: 0,
        },
      ],
    },
  });
  await call(`${base}/pay-apps/${app.id}/submit`, { method: "POST", as });
}

describe("POST /api/me/signup-source", () => {
  it("records the page once, normalized, and never replaces it", async () => {
    const u = await createTestUser();
    const first = await call("/api/me/signup-source", {
      method: "POST",
      as: u.id,
      json: { source: "Pay-App-Guides/Punch-List.html" },
    });
    expect(first).toEqual({ recorded: true, source: "pay-app-guides/punch-list" });
    const again = await call("/api/me/signup-source", {
      method: "POST",
      as: u.id,
      json: { source: "lien-waiver-checker" },
    });
    expect(again).toEqual({ recorded: false, reason: "already-recorded" });
    expect(await storedSource(u.id)).toBe("pay-app-guides/punch-list");
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
      json: { source: "pay-app-guides" },
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
      json: { source: "pay-app-guides" },
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

  it("counts accounts per page and how far their companies got, without tenant content", async () => {
    const SRC = "pay-app-guides/sources-test-page";
    const before = await call<ProductAdminMetrics>("/api/admin/metrics?days=7", {
      headers: bearer,
    });

    // One account from the page with a company that sent a pay app; one with a company that did
    // nothing yet; one from the page with no company; one with no source at all.
    const sent = await setupTenant("owner");
    const idle = await setupTenant("owner");
    const loose = await createTestUser();
    await setupTenant("owner");
    for (const id of [sent.userId, idle.userId, loose.id]) {
      await call("/api/me/signup-source", { method: "POST", as: id, json: { source: SRC } });
    }
    await sendPayApp(sent.orgId, sent.userId);

    const res = await api("/api/admin/metrics?days=7", { headers: bearer });
    const text = await res.text();
    expect(text).not.toContain("Secret Clinic");
    expect(text).not.toContain("Harbor Builders");
    expect(text).not.toContain(sent.user.email);
    const after = JSON.parse(text) as ProductAdminMetrics;

    const r = row(after, SRC);
    const b = row(before, SRC);
    expect(r.site).toBe("pay-app-guides");
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
