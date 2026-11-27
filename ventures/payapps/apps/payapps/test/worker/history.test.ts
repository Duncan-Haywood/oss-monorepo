// The history of a pay application through the HTTP API on a real local D1: each change is one row,
// newest first, with who did it; a deleted draft keeps its history on the job; the CSV; roles and
// tenancy (a member of another company sees nothing, a viewer reads but cannot change).
import type {
  PayAppDetailDto,
  PayAppEventDto,
  ProjectDetailDto,
  ProjectDto,
} from "@shared/api/types";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

// A $100,000 job at 10% retainage with one line; application #1 bills $50,000 (line 8 $45,000).
async function job() {
  const t = await setupTenant("owner");
  const as = t.userId;
  const created = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Elm St clinic",
      gcName: "Harbor Builders",
      originalContractSumCents: 10_000_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
    },
  });
  const base = `/api/orgs/${t.orgId}/projects/${created.id}`;
  const project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Work", originalCents: 10_000_000 }] },
  });
  return { ...t, as, base, sovLineId: project.sovLines[0]?.id ?? "" };
}

const history = (path: string, as: string) =>
  call<{ items: PayAppEventDto[] }>(`${path}/history`, { as }).then((r) => r.items);

describe("pay application history", () => {
  it("records each change with who made it, newest first", async () => {
    const t = await job();
    const app = await call<PayAppDetailDto>(`${t.base}/pay-apps`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
    });
    const path = `${t.base}/pay-apps/${app.id}`;
    await call(path, { method: "PATCH", as: t.as, json: { applicationDate: "2026-01-30" } });
    // Sending back an unchanged value is not a change.
    await call(path, { method: "PATCH", as: t.as, json: { applicationDate: "2026-01-30" } });
    await call(`${path}/lines`, {
      method: "PUT",
      as: t.as,
      json: {
        lines: [
          {
            sovLineId: t.sovLineId,
            workThisPeriodCents: 5_000_000,
            storedMaterialsCents: 0,
            retainageReleasedCents: 0,
          },
        ],
      },
    });
    await call(`${path}/submit`, { method: "POST", as: t.as });
    await call(`${path}/certify`, {
      method: "POST",
      as: t.as,
      json: { certifiedAmountCents: 4_400_000 },
    });
    await call(`${path}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 4_000_000, receivedOn: "2026-02-20", reference: "Check 1042" },
    });
    await call(`${path}/close-short`, {
      method: "POST",
      as: t.as,
      json: { reason: "backcharge", closedOn: "2026-02-21", note: "Cleanup" },
    });

    const items = await history(path, t.as);
    expect(items.map((e) => e.action)).toEqual([
      "closed_short",
      "payment_recorded",
      "certified",
      "submitted",
      "entries_saved",
      "details_changed",
      "created",
    ]);
    expect(items.map((e) => e.text)).toEqual([
      "Balance of $4,000.00 closed as backcharge on 2026-02-21: Cleanup",
      "Payment of $40,000.00 received 2026-02-20 (Check 1042) recorded",
      "Application #1 certified by the GC at $44,000.00",
      "Application #1 submitted for $45,000.00 (line 8)",
      "Application #1: entries saved, current payment due $45,000.00",
      "Application #1: changed application date",
      "Application #1 created as a draft",
    ]);
    expect(items[0]?.data.status).toBe("paid");
    expect(items.every((e) => e.actor?.email.endsWith("@example.test"))).toBe(true);
    expect(items.every((e) => e.payAppNumber === 1 && e.payAppId === app.id)).toBe(true);

    // Reopening and deleting the payment are recorded too, with the status they leave behind.
    await call(`${path}/close-short`, { method: "DELETE", as: t.as });
    const d = await call<PayAppDetailDto>(path, { as: t.as });
    await call(`${path}/payments/${d.payments[0]?.id}`, { method: "DELETE", as: t.as });
    const after = await history(path, t.as);
    expect(after.slice(0, 2).map((e) => e.text)).toEqual([
      "Payment of $40,000.00 received 2026-02-20 (Check 1042) deleted; application #1 reopened as certified",
      "Balance closed short reopened; application #1 is certified",
    ]);

    // CSV, oldest first, a header row and one row per event.
    const res = await api(`${path}/history.csv`, { as: t.as });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("pay-application-1-history.csv");
    const rows = (await res.text()).trim().split("\r\n");
    expect(rows[0]).toBe("When (UTC),Application,What happened,By,Email");
    expect(rows).toHaveLength(after.length + 1);
    expect(rows[1]).toContain("Application #1 created as a draft");
  });

  it("keeps a deleted draft's history on the job", async () => {
    const t = await job();
    const app = await call<PayAppDetailDto>(`${t.base}/pay-apps`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { periodFrom: "2026-03-01", periodTo: "2026-03-31", applicationDate: "2026-03-31" },
    });
    await call(`${t.base}/pay-apps/${app.id}`, { method: "DELETE", as: t.as });
    const items = await history(`${t.base}/pay-apps`, t.as);
    expect(items.map((e) => e.text)).toEqual([
      "Draft application #1 deleted",
      "Application #1 created as a draft",
    ]);
    // The application itself is gone.
    expect((await api(`${t.base}/pay-apps/${app.id}/history`, { as: t.as })).status).toBe(404);
  });

  it("is readable by viewers, written only by changes, and hidden from other companies", async () => {
    const t = await job();
    const app = await call<PayAppDetailDto>(`${t.base}/pay-apps`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
    });
    const path = `${t.base}/pay-apps/${app.id}`;
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    expect(await history(path, viewer.id)).toHaveLength(1);
    // A refused change writes nothing.
    expect((await api(`${path}/submit`, { method: "POST", as: viewer.id })).status).toBe(403);
    const backwards = { periodFrom: "2026-02-01", periodTo: "2026-01-31" };
    expect((await api(path, { method: "PATCH", as: t.as, json: backwards })).status).toBe(400);
    expect(await history(path, t.as)).toHaveLength(1);

    const other = await setupTenant("owner");
    expect((await api(`${path}/history`, { as: other.userId })).status).toBe(404);
    expect((await api(`${t.base}/pay-apps/history`, { as: other.userId })).status).toBe(404);
    expect((await api(`${path}/history.csv`, { as: other.userId })).status).toBe(404);
    // The other company's own job with the same ids in the path sees none of these rows.
    const theirs = await job();
    const swapped = `/api/orgs/${theirs.orgId}/projects/${t.base.split("/").at(-1)}/pay-apps`;
    expect((await api(`${swapped}/history`, { as: theirs.as })).status).toBe(200);
    expect(await history(swapped, theirs.as)).toEqual([]);
  });
});
