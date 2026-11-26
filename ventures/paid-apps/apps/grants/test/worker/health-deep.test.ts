import { applications, opportunities } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import {
  type DeepHealth,
  discoveryStatus,
  llmErrorStatus,
  spendStatus,
  THRESHOLDS,
  worstStatus,
} from "@worker/routes/health";
import { describe, expect, it } from "vitest";
import { api, setupTenant, testDb } from "./helpers";

const AUTH = { Authorization: "Bearer test-internal-token" };
const HOUR = 3_600_000;

const deep = (headers: Record<string, string> = AUTH, as?: string) =>
  api("/api/health/deep", { headers, as });

async function seedApplications(
  orgId: string,
  rows: { status: "drafting" | "verifying"; ageMs: number }[],
) {
  const db = testDb();
  const oppId = newId("opp");
  await db.insert(opportunities).values({
    id: oppId,
    source: "manual",
    sourceId: oppId,
    funderName: "Health Check Funder",
    title: "Health Check Opportunity",
  });
  const ids: string[] = [];
  for (const r of rows) {
    const id = newId("app");
    ids.push(id);
    const at = new Date(Date.now() - r.ageMs);
    await db.insert(applications).values({
      id,
      orgId,
      opportunityId: oppId,
      title: "Confidential Youth Program Application",
      status: r.status,
      createdAt: at,
      updatedAt: at,
    });
  }
  return ids;
}

const check = (body: DeepHealth, name: string) => body.checks.find((c) => c.name === name);

describe("GET /api/health/deep", () => {
  it("requires the internal bearer token", async () => {
    expect((await deep({})).status).toBe(401);
    expect((await deep({ Authorization: "Bearer wrong" })).status).toBe(401);
    expect((await deep({ Authorization: "test-internal-token" })).status).toBe(401);
    // A signed-in tenant user is not enough: only the platform token opens the deep check.
    const { userId } = await setupTenant();
    expect((await deep({}, userId)).status).toBe(401);
  });

  it("reports every check ok on an empty database", async () => {
    const res = await deep();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as DeepHealth;
    expect(body.checks.map((c) => c.name)).toEqual([
      "d1",
      "r2",
      "discovery",
      "stuck_applications",
      "stuck_documents",
      "llm_error_rate",
      "llm_spend",
    ]);
    for (const c of body.checks) {
      expect(c, c.name).toMatchObject({ status: "ok" });
      expect(typeof c.detail).toBe("string");
    }
    expect(body.status).toBe("ok");
  });

  it("warns on one application stuck in drafting, without leaking tenant data", async () => {
    const { orgId } = await setupTenant();
    const [stuckId, freshId] = await seedApplications(orgId, [
      { status: "drafting", ageMs: 3 * HOUR },
      { status: "drafting", ageMs: 10 * 60_000 }, // still within the 2h budget
    ]);
    const res = await deep();
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as DeepHealth;
    expect(body.status).toBe("warn");
    expect(check(body, "stuck_applications")).toMatchObject({ status: "warn" });
    expect(check(body, "stuck_applications")?.detail).toMatch(/^1 in drafting\/verifying/);
    for (const secret of [orgId, stuckId, freshId, "Confidential", "Health Check"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("fails with 503 once several applications are stuck", async () => {
    const { orgId } = await setupTenant();
    await seedApplications(
      orgId,
      Array.from({ length: THRESHOLDS.stuckFailCount }, () => ({
        status: "verifying" as const,
        ageMs: 5 * HOUR,
      })),
    );
    const res = await deep();
    expect(res.status).toBe(503);
    const body = (await res.json()) as DeepHealth;
    expect(body.status).toBe("fail");
    expect(check(body, "stuck_applications")).toMatchObject({ status: "fail" });
    expect(check(body, "d1")).toMatchObject({ status: "ok" });
  });

  it("keeps GET /api/health public", async () => {
    expect((await api("/api/health")).status).toBe(200);
  });
});

describe("deep health thresholds", () => {
  it("discovery age: warn after 30h, fail after 48h, ok before any run", () => {
    expect(discoveryStatus(null)).toBe("ok");
    expect(discoveryStatus(25 * HOUR)).toBe("ok");
    expect(discoveryStatus(31 * HOUR)).toBe("warn");
    expect(discoveryStatus(49 * HOUR)).toBe("fail");
  });

  it("LLM error rate: warn over 10%, fail over 50% only with at least 10 calls", () => {
    expect(llmErrorStatus(0, 0)).toBe("ok");
    expect(llmErrorStatus(20, 2)).toBe("ok");
    expect(llmErrorStatus(20, 3)).toBe("warn");
    expect(llmErrorStatus(4, 4)).toBe("warn");
    expect(llmErrorStatus(10, 6)).toBe("fail");
  });

  it("global spend: warn near the daily cap or a near-cap month, fail at the cap", () => {
    const cap = 200_000_000; // $200
    expect(spendStatus(0, 0, null, 10)).toBe("ok");
    expect(spendStatus(0, 0, 0, 10)).toBe("warn"); // kill switch
    expect(spendStatus(50e6, 500e6, cap, 10)).toBe("ok");
    expect(spendStatus(170e6, 500e6, cap, 10)).toBe("warn");
    expect(spendStatus(10e6, 1_700e6, cap, 10)).toBe("warn");
    expect(spendStatus(cap, cap, cap, 1)).toBe("fail");
  });

  it("overall status is the worst check", () => {
    expect(worstStatus([])).toBe("ok");
    expect(worstStatus(["ok", "warn", "ok"])).toBe("warn");
    expect(worstStatus(["warn", "fail", "ok"])).toBe("fail");
  });
});
