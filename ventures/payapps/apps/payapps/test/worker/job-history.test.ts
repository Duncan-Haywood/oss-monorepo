// The job history (terms, schedule of values, opening balance, change orders) through the HTTP API
// on a real local D1: one row per change, newest first, with who did it; unchanged values and
// refused changes write nothing; a deleted change order keeps its history; the CSV; viewers read;
// another company sees nothing; the sample job writes none.
import type { JobEventDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant } from "./helpers";

async function job() {
  const t = await setupTenant("owner");
  const created = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects`, {
    method: "POST",
    as: t.userId,
    expect: 201,
    json: {
      name: "Elm St clinic",
      gcName: "Harbor Builders",
      originalContractSumCents: 10_000_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
    },
  });
  return { ...t, as: t.userId, base: `/api/orgs/${t.orgId}/projects/${created.id}` };
}

const history = (base: string, as: string) =>
  call<{ items: JobEventDto[] }>(`${base}/history`, { as }).then((r) => r.items);

describe("job history", () => {
  it("records the job's terms, schedule of values, opening balance and change orders", async () => {
    const t = await job();
    const as = t.as;
    await call(t.base, { method: "PATCH", as, json: { originalContractSumCents: 10_500_000 } });
    // Sending back unchanged values is not a change.
    await call(t.base, { method: "PATCH", as, json: { gcName: "Harbor Builders" } });
    const p = await call<ProjectDetailDto>(`${t.base}/sov-lines/bulk`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        lines: [
          { itemNumber: "1", description: "Rough-in", originalCents: 6_000_000 },
          { itemNumber: "2", description: "Trim", originalCents: 4_500_000 },
        ],
      },
    });
    const [rough, trim] = p.sovLines;
    await call(`${t.base}/sov-lines/${trim?.id}`, {
      method: "PATCH",
      as,
      json: { originalCents: 4_400_000, retainagePctBps: 0 },
    });
    // Reordering alone is not recorded.
    await call(`${t.base}/sov-lines/${trim?.id}`, { method: "PATCH", as, json: { sortOrder: 9 } });
    const bond = await call<ProjectDetailDto>(`${t.base}/sov-lines`, {
      method: "POST",
      as,
      expect: 201,
      json: { itemNumber: "3", description: "Bond", originalCents: 100_000 },
    });
    const bondId = bond.sovLines.find((l) => l.itemNumber === "3")?.id;
    await call(`${t.base}/sov-lines/${bondId}`, { method: "DELETE", as });
    await call(`${t.base}/opening`, {
      method: "PUT",
      as,
      json: {
        appNumber: 3,
        periodTo: "2026-03-31",
        previousCertificatesCents: 2_700_000,
        lines: [{ sovLineId: rough?.id, completedCents: 3_000_000 }],
      },
    });
    await call(`${t.base}/opening`, { method: "DELETE", as });

    const withCo = await call<ProjectDetailDto>(`${t.base}/change-orders`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        number: "CO-1",
        description: "Added panel",
        submittedOn: "2026-04-02",
        items: [
          { sovLineId: rough?.id, amountCents: 250_000 },
          { newLine: { itemNumber: "4", description: "Panel" }, amountCents: 800_000 },
        ],
      },
    });
    const co1 = withCo.changeOrders[0]?.id;
    await call(`${t.base}/change-orders/${co1}/schedule`, {
      method: "PUT",
      as,
      json: { scheduleDays: 5 },
    });
    // The same date again is not a change.
    await call(`${t.base}/change-orders/${co1}/sent`, {
      method: "PUT",
      as,
      json: { submittedOn: "2026-04-02" },
    });
    await call(`${t.base}/change-orders/${co1}/approve`, {
      method: "POST",
      as,
      json: { approvedOn: "2026-04-10" },
    });
    const withCo2 = await call<ProjectDetailDto>(`${t.base}/change-orders`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        number: "CO-2",
        description: "Deduct trim",
        items: [{ sovLineId: trim?.id, amountCents: -150_000 }],
      },
    });
    const co2 = withCo2.changeOrders.find((co) => co.number === "CO-2")?.id;
    await call(`${t.base}/change-orders/${co2}/sent`, {
      method: "PUT",
      as,
      json: { submittedOn: "2026-04-12" },
    });
    await call(`${t.base}/change-orders/${co2}/reject`, { method: "POST", as });
    const withCo3 = await call<ProjectDetailDto>(`${t.base}/change-orders`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        number: "CO-3",
        description: "Typo",
        scheduleDays: 0,
        items: [{ sovLineId: rough?.id, amountCents: 1_000 }],
      },
    });
    const co3 = withCo3.changeOrders.find((co) => co.number === "CO-3")?.id;
    await call(`${t.base}/change-orders/${co3}`, { method: "DELETE", as });

    const items = await history(t.base, as);
    expect(items.map((e) => e.text).reverse()).toEqual([
      "Job created with an original contract sum of $100,000.00",
      "Job terms changed: original contract sum (contract sum $100,000.00 to $105,000.00)",
      "2 lines added to the schedule of values, $105,000.00 in all",
      "Line 2 (Trim) changed: scheduled value $45,000.00 to $44,000.00; retainage each application's rate to 0%",
      "Line 3 (Bond) added to the schedule of values at $1,000.00",
      "Line 3 (Bond) deleted from the schedule of values ($1,000.00)",
      "Opening balance set from application #3 ending 2026-03-31 made elsewhere, line 6 $27,000.00",
      "Opening balance removed",
      "Change order CO-1 entered for $10,500.00: Added panel, sent to the GC 2026-04-02",
      "Change order CO-1: contract time 5 calendar days",
      "Change order CO-1 approved by the GC on 2026-04-10 for $10,500.00",
      "Change order CO-2 entered for ($1,500.00): Deduct trim",
      "Change order CO-2: sent to the GC 2026-04-12",
      "Change order CO-2 for ($1,500.00) marked rejected",
      "Change order CO-3 entered for $10.00: Typo, contract time no change in contract time",
      "Change order CO-3 for $10.00 deleted",
    ]);
    expect(items.every((e) => e.actor?.email.endsWith("@example.test"))).toBe(true);
    // Each change order's events name it, so one change order's history can be picked out.
    expect(items.filter((e) => e.subjectId === co1).map((e) => e.action)).toEqual([
      "change_order_approved",
      "change_order_time_changed",
      "change_order_created",
    ]);
    // ...and read on its own: CO-1's rows only, newest first; a deleted one is gone (404).
    const own = await call<{ items: JobEventDto[] }>(`${t.base}/change-orders/${co1}/history`, {
      as,
    }).then((r) => r.items);
    expect(own.map((e) => e.text)).toEqual([
      "Change order CO-1 approved by the GC on 2026-04-10 for $10,500.00",
      "Change order CO-1: contract time 5 calendar days",
      "Change order CO-1 entered for $10,500.00: Added panel, sent to the GC 2026-04-02",
    ]);
    const rejected = await call<{ items: JobEventDto[] }>(
      `${t.base}/change-orders/${co2}/history`,
      { as },
    ).then((r) => r.items);
    expect(rejected.map((e) => e.action)).toEqual([
      "change_order_rejected",
      "change_order_sent_changed",
      "change_order_created",
    ]);
    expect((await api(`${t.base}/change-orders/${co3}/history`, { as })).status).toBe(404);

    // CO-1's own CSV: oldest first, its rows only, named after it.
    const coCsv = await api(`${t.base}/change-orders/${co1}/history.csv`, { as });
    expect(coCsv.status).toBe(200);
    expect(coCsv.headers.get("Content-Disposition")).toBe(
      'attachment; filename="change-order-CO-1-history.csv"',
    );
    const coRows = (await coCsv.text()).trim().split("\r\n");
    expect(coRows[0]).toBe("When (UTC),About,What happened,By,Email");
    expect(coRows).toHaveLength(4);
    expect(coRows[1]).toContain("Change order CO-1 entered for $10,500.00");
    expect(coRows[3]).toContain("Change order CO-1 approved by the GC on 2026-04-10");
    expect((await api(`${t.base}/change-orders/${co3}/history.csv`, { as })).status).toBe(404);

    // CSV, oldest first, a header row and one row per event.
    const res = await api(`${t.base}/history.csv`, { as });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("job-history.csv");
    const rows = (await res.text()).trim().split("\r\n");
    expect(rows[0]).toBe("When (UTC),About,What happened,By,Email");
    expect(rows).toHaveLength(items.length + 1);
    expect(rows[1]).toContain(',Job,"Job created');
    expect(rows.at(-1)).toContain(",CO-3,Change order CO-3 for $10.00 deleted,");
  });

  it("is readable by viewers, written only by changes, and hidden from other companies", async () => {
    const t = await job();
    const viewer = await createTestUser();
    await addToOrg(t.orgId, viewer.id, "viewer");
    expect(await history(t.base, viewer.id)).toHaveLength(1);
    // Refused changes write nothing.
    const line = { itemNumber: "1", description: "Work", originalCents: 100 };
    expect(
      (await api(`${t.base}/sov-lines`, { method: "POST", as: viewer.id, json: line })).status,
    ).toBe(403);
    const missing = `${t.base}/change-orders/cor_missing/reject`;
    expect((await api(missing, { method: "POST", as: t.as })).status).toBe(404);
    expect((await api(`${t.base}/opening`, { method: "DELETE", as: t.as })).status).toBe(200);
    expect(await history(t.base, t.as)).toHaveLength(1);

    const other = await setupTenant("owner");
    expect((await api(`${t.base}/history`, { as: other.userId })).status).toBe(404);
    expect((await api(`${t.base}/history.csv`, { as: other.userId })).status).toBe(404);
    const coCsv = `${t.base}/change-orders/cor_any/history.csv`;
    expect((await api(coCsv, { as: other.userId })).status).toBe(404);

    // One change order's history: viewers read it; another company gets 404, also through its own
    // job path with this change order's id.
    const withCo = await call<ProjectDetailDto>(`${t.base}/change-orders`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: {
        number: "CO-1",
        description: "Extra outlet",
        items: [{ newLine: { itemNumber: "9", description: "Outlet" }, amountCents: 50_000 }],
      },
    });
    const coPath = `${t.base}/change-orders/${withCo.changeOrders[0]?.id}/history`;
    const asViewer = await call<{ items: JobEventDto[] }>(coPath, { as: viewer.id });
    expect(asViewer.items.map((e) => e.action)).toEqual(["change_order_created"]);
    expect((await api(coPath, { as: other.userId })).status).toBe(404);
    const otherJob = await call<ProjectDto>(`/api/orgs/${other.orgId}/projects`, {
      method: "POST",
      as: other.userId,
      expect: 201,
      json: { name: "Theirs", gcName: "GC", originalContractSumCents: 100 },
    });
    const crossPath = coPath.replace(t.base, `/api/orgs/${other.orgId}/projects/${otherJob.id}`);
    expect((await api(crossPath, { as: other.userId })).status).toBe(404);
  });

  it("writes nothing for the sample job", async () => {
    const t = await setupTenant("owner");
    const sample = await call<ProjectDto>(`/api/orgs/${t.orgId}/projects/sample`, {
      method: "POST",
      as: t.userId,
      expect: 201,
    });
    const base = `/api/orgs/${t.orgId}/projects/${sample.id}`;
    await call(base, { method: "PATCH", as: t.userId, json: { payTermsDays: 45 } });
    expect(await history(base, t.userId)).toEqual([]);
  });
});
