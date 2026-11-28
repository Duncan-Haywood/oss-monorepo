// Interest earned on a late payment, marked billed or waived through the HTTP API on a real local D1:
// the mark takes the application off the cash report's paid-late list, keeps the figure, lands in
// the history, refuses an application with nothing to mark and bad dates, and goes when a payment is
// deleted (the application reopens). Dates count back from today so the cash report's 365-day window
// never ages the fixture out.
import type {
  PayAppDetailDto,
  PayAppEventDto,
  ProjectDetailDto,
  ProjectDto,
} from "@shared/api/types";
import type { CashReport } from "@shared/cash-report";
import { describe, expect, it } from "vitest";
import { api, call, setupTenant } from "./helpers";

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

// A $100,000 job, net 30, 1.5% a month; #1 bills $50,000 (line 8 $45,000), dated 120 days ago, so
// due 90 days ago, and is paid in full 60 days ago: 30 days late.
async function paidLateJob(withRate = true) {
  const { orgId, userId: as } = await setupTenant("owner");
  const created = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Elm St clinic",
      gcName: "Harbor Builders",
      originalContractSumCents: 10_000_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
      payTermsDays: 30,
    },
  });
  const base = `/api/orgs/${orgId}/projects/${created.id}`;
  if (withRate) {
    await call(base, {
      method: "PATCH",
      as,
      json: { lateInterestBps: 150, lateInterestPer: "month" },
    });
  }
  const project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Work", originalCents: 10_000_000 }] },
  });
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: day(-150), periodTo: day(-120), applicationDate: day(-120) },
  });
  const appPath = `${base}/pay-apps/${app.id}`;
  await call(`${appPath}/lines`, {
    method: "PUT",
    as,
    json: {
      lines: [
        {
          sovLineId: project.sovLines[0]?.id ?? "",
          workThisPeriodCents: 5_000_000,
          storedMaterialsCents: 0,
          retainageReleasedCents: 0,
        },
      ],
    },
  });
  await call(`${appPath}/submit`, { method: "POST", as });
  const paid = await call<PayAppDetailDto>(`${appPath}/payments`, {
    method: "POST",
    as,
    expect: 201,
    json: { amountCents: 4_500_000, receivedOn: day(-60) },
  });
  return { orgId, as, base, appPath, paid };
}

const cash = (t: { orgId: string; as: string }) =>
  call<CashReport>(`/api/orgs/${t.orgId}/reports/cash`, { as: t.as });

describe("late-payment interest marked billed or waived", () => {
  it("moves the application off the to-do list, keeps the figure and logs it", async () => {
    const t = await paidLateJob();
    let r = await cash(t);
    const earned = r.projects[0]?.paidLate[0]?.interestCents ?? 0;
    // 4,500,000 x 0.015 x 30/30.
    expect(earned).toBe(67_500);
    expect(r.totals.paidLateInterestCents).toBe(67_500);

    await call(`${t.appPath}/late-interest`, {
      method: "PUT",
      as: t.as,
      json: { settlement: "billed", on: day(-10), note: "Invoice 1042" },
    });
    r = await cash(t);
    expect(r.projects[0]?.paidLate).toEqual([]);
    expect(r.totals.paidLateInterestCents).toBe(0);
    expect(r.totals.paidLateBilledCents).toBe(67_500);
    expect(r.projects[0]?.paidLateSettled[0]?.settled).toEqual({
      kind: "billed",
      on: day(-10),
      cents: 67_500,
      note: "Invoice 1042",
    });
    expect(r.projects[0]?.actions.join(" ")).not.toContain("paid 30 days late");

    const csv = await (await api(`/api/orgs/${t.orgId}/reports/cash.csv`, { as: t.as })).text();
    expect(csv).toContain(
      `#1 due ${day(-90)}, paid ${day(-60)} (30 days): 675 (billed ${day(-10)})`,
    );

    // Undo puts it back; waiving takes it off again without counting it as billed.
    await call(`${t.appPath}/late-interest`, {
      method: "PUT",
      as: t.as,
      json: { settlement: null },
    });
    r = await cash(t);
    expect(r.projects[0]?.paidLate).toHaveLength(1);
    await call(`${t.appPath}/late-interest`, {
      method: "PUT",
      as: t.as,
      json: { settlement: "waived", on: day(0) },
    });
    r = await cash(t);
    expect(r.projects[0]?.paidLate).toEqual([]);
    expect(r.totals.paidLateBilledCents).toBe(0);

    const items = await call<{ items: PayAppEventDto[] }>(`${t.appPath}/history`, {
      as: t.as,
    }).then((h) => h.items.map((e) => e.text));
    expect(items).toContain(
      `Interest of $675.00 earned by the late payment of application #1 marked billed to the GC on ${day(-10)}: Invoice 1042`,
    );
    expect(items).toContain(
      "Billed or waived mark on the late-payment interest of application #1 cleared; it is on the to-do list again",
    );
    expect(items).toContain(
      `Interest of $675.00 earned by the late payment of application #1 marked waived on ${day(0)}`,
    );
  });

  it("refuses an application with no interest earned, a future day and one before the payment", async () => {
    const none = await paidLateJob(false);
    await call(`${none.appPath}/late-interest`, {
      method: "PUT",
      as: none.as,
      expect: 409,
      json: { settlement: "billed", on: day(0) },
    });
    await call(`${none.appPath}/late-interest`, {
      method: "PUT",
      as: none.as,
      expect: 409,
      json: { settlement: null },
    });
    const t = await paidLateJob();
    await call(`${t.appPath}/late-interest`, {
      method: "PUT",
      as: t.as,
      expect: 409,
      json: { settlement: "billed", on: day(5) },
    });
    await call(`${t.appPath}/late-interest`, {
      method: "PUT",
      as: t.as,
      expect: 409,
      json: { settlement: "waived", on: day(-61) },
    });
    await call(`${t.appPath}/late-interest`, {
      method: "PUT",
      as: t.as,
      expect: 400,
      json: { settlement: "forgiven", on: day(0) },
    });
  });

  it("clears the mark when a payment is deleted and the application reopens", async () => {
    const t = await paidLateJob();
    await call(`${t.appPath}/late-interest`, {
      method: "PUT",
      as: t.as,
      json: { settlement: "billed", on: day(0) },
    });
    const paymentId = t.paid.payments[0]?.id ?? "";
    await call(`${t.appPath}/payments/${paymentId}`, { method: "DELETE", as: t.as });
    await call(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 4_500_000, receivedOn: day(-60) },
    });
    const r = await cash(t);
    expect(r.projects[0]?.paidLateSettled).toEqual([]);
    expect(r.projects[0]?.paidLate).toHaveLength(1);
  });
});
