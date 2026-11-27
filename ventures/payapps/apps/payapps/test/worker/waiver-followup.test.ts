// Unconditional lien waivers owed after payment, through the HTTP API: the pay-app waiver panel and
// the cash report (and its CSV) ask for the unconditional waiver once a paid application's
// conditional waiver went out, and stop once it is sent; on an application paid in part, for the
// money received only, never final. Utah, which has no unconditional form, is never asked.
import type {
  PayAppDetailDto,
  ProjectDetailDto,
  ProjectDto,
  WaiverDto,
  WaiverOverviewDto,
} from "@shared/api/types";
import type { CashReport } from "@shared/cash-report";
import { followUpInput } from "@worker/services/payapps/waivers";
import { describe, expect, it } from "vitest";
import { api, call, grantPlan, setupTenant } from "./helpers";

async function paidJob() {
  const { orgId, userId: as } = await setupTenant("owner");
  await grantPlan(orgId, "crew", "active");
  const p = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name: "Mesa Clinic TI",
      gcName: "Copper State Builders",
      originalContractSumCents: 10_000_000,
    },
  });
  const base = `/api/orgs/${orgId}/projects/${p.id}`;
  const d = await call<ProjectDetailDto>(`${base}/sov-lines`, {
    method: "POST",
    as,
    expect: 201,
    json: { itemNumber: "1", description: "Framing and drywall", originalCents: 10_000_000 },
  });
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: "2026-10-01", periodTo: "2026-10-31", applicationDate: "2026-10-31" },
  });
  const appPath = `${base}/pay-apps/${app.id}`;
  await call(`${appPath}/lines`, {
    method: "PUT",
    as,
    json: {
      lines: [
        {
          sovLineId: d.sovLines[0]?.id,
          workThisPeriodCents: 5_000_000,
          storedMaterialsCents: 0,
          retainageReleasedCents: 0,
        },
      ],
    },
  });
  await call(`${appPath}/submit`, { method: "POST", as });
  return { orgId, as, appPath, waivers: `${appPath}/waivers` };
}

async function track(
  t: { as: string; waivers: string },
  state: string,
  kind: string,
  amountCents = 4_500_000,
) {
  return call<WaiverDto>(t.waivers, {
    method: "POST",
    as: t.as,
    expect: 201,
    json: { state, kind, amountCents },
  });
}

const markSent = (t: { as: string; waivers: string }, id: string) =>
  call(`${t.waivers}/${id}`, { method: "PATCH", as: t.as, json: { status: "sent" } });

describe("unconditional waivers owed after payment", () => {
  it("asks once the application is paid, says 'unsent' for a saved draft, and stops once sent", async () => {
    const t = await paidJob();
    const cond = await track(t, "AZ", "conditional-progress");
    await markSent(t, cond.id);
    const cash = `/api/orgs/${t.orgId}/reports/cash`;

    // Submitted, not paid: nothing to ask yet.
    expect((await call<WaiverOverviewDto>(t.waivers, { as: t.as })).toSend).toEqual([]);
    expect((await call<CashReport>(cash, { as: t.as })).totals.waiversToSend).toBe(0);

    await call(`${t.appPath}/mark-paid`, { method: "POST", as: t.as });
    const o = await call<WaiverOverviewDto>(t.waivers, { as: t.as });
    expect(o.toSend).toEqual([
      expect.objectContaining({ number: 1, scope: "progress", state: "AZ", reason: "missing" }),
    ]);
    expect(o.suggestedKind).toBe("unconditional-progress");
    const r = await call<CashReport>(cash, { as: t.as });
    expect(r.totals.waiversToSend).toBe(1);
    expect(r.projects[0]?.actions.join(" ")).toMatch(
      /unconditional progress waiver for that payment/,
    );
    const csv = await (await api(`${cash}.csv`, { as: t.as })).text();
    expect(csv.split("\r\n")[0]).toMatch(
      /,Unconditional waivers to send,Pending change orders \(additions\),Pending change orders,Backcharged,/,
    );
    // The last column (waiting on the owner's payment) is blank on a job not on pay-when-paid terms.
    expect(csv).toMatch(/,#1 progress,0,,0,0,0,,\r\n/);

    const uncond = await track(t, "AZ", "unconditional-progress");
    expect((await call<WaiverOverviewDto>(t.waivers, { as: t.as })).toSend).toEqual([
      expect.objectContaining({ reason: "unsent" }),
    ]);
    await markSent(t, uncond.id);
    expect((await call<WaiverOverviewDto>(t.waivers, { as: t.as })).toSend).toEqual([]);
    expect((await call<CashReport>(cash, { as: t.as })).totals.waiversToSend).toBe(0);
  });

  it("never asks on a Utah job: its statute has no unconditional form", async () => {
    const t = await paidJob();
    const cond = await track(t, "UT", "conditional-progress");
    await markSent(t, cond.id);
    await call(`${t.appPath}/mark-paid`, { method: "POST", as: t.as });
    expect((await call<WaiverOverviewDto>(t.waivers, { as: t.as })).toSend).toEqual([]);
    expect(
      followUpInput({ kind: "conditional-final", status: "sent", state: "UT" }).noUnconditionalForm,
    ).toBe(true);
    expect(
      followUpInput({ kind: "conditional-final", status: "sent", state: "AZ" }).noUnconditionalForm,
    ).toBe(false);
  });

  it("after two checks, asks for the second check's unconditional waiver with its amount", async () => {
    const t = await paidJob();
    await markSent(t, (await track(t, "AZ", "conditional-progress")).id);
    // Line 8 is $45,000 (10% retainage on $50,000). First check: $30,000, its waiver sent.
    await call(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 3_000_000, receivedOn: "2026-11-10" },
    });
    await markSent(t, (await track(t, "AZ", "unconditional-progress", 3_000_000)).id);
    // Second check pays the balance: the application turns paid.
    await call(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 1_500_000, receivedOn: "2026-11-20" },
    });
    const o = await call<WaiverOverviewDto>(t.waivers, { as: t.as });
    expect(o.toSend).toEqual([
      expect.objectContaining({ scope: "progress", reason: "missing", remainingCents: 1_500_000 }),
    ]);
    expect(o.suggestedKind).toBe("unconditional-progress");
    expect(o.prefill.checkAmountCents).toBe(1_500_000);
    const cash = await call<CashReport>(`/api/orgs/${t.orgId}/reports/cash`, { as: t.as });
    expect(cash.totals.waiversToSend).toBe(1);
    expect(cash.projects[0]?.actions.join(" ")).toContain("$15,000.00");

    await markSent(t, (await track(t, "AZ", "unconditional-progress", 1_500_000)).id);
    expect((await call<WaiverOverviewDto>(t.waivers, { as: t.as })).toSend).toEqual([]);
    const after = await call<CashReport>(`/api/orgs/${t.orgId}/reports/cash`, { as: t.as });
    expect(after.totals.waiversToSend).toBe(0);
  });

  it("after a balance is closed short, asks for and prefills the unconditional waiver for the money received", async () => {
    const t = await paidJob();
    await markSent(t, (await track(t, "AZ", "conditional-progress")).id);
    await call(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 4_000_000, receivedOn: "2026-11-20" },
    });
    // Paid short and still open: the waiver asked for covers the $40,000 received, never the rest.
    expect((await call<WaiverOverviewDto>(t.waivers, { as: t.as })).toSend).toEqual([
      expect.objectContaining({ partial: true, remainingCents: 4_000_000 }),
    ]);
    await call(`${t.appPath}/close-short`, {
      method: "POST",
      as: t.as,
      json: { reason: "backcharge", closedOn: "2026-11-21" },
    });
    const o = await call<WaiverOverviewDto>(t.waivers, { as: t.as });
    expect(o.suggestedKind).toBe("unconditional-progress");
    expect(o.prefill).toMatchObject({ amountPaidCents: 4_000_000, checkAmountCents: 4_000_000 });
    // An unconditional waiver for the 40,000.00 received settles it.
    await markSent(t, (await track(t, "AZ", "unconditional-progress", 4_000_000)).id);
    expect((await call<WaiverOverviewDto>(t.waivers, { as: t.as })).toSend).toEqual([]);
  });

  it("on a partial check, asks for and prefills the unconditional progress waiver for that check only", async () => {
    const t = await paidJob();
    await markSent(t, (await track(t, "AZ", "conditional-progress")).id);
    await markSent(t, (await track(t, "AZ", "conditional-final")).id);
    // Line 8 is $45,000; the GC paid $30,000 and still owes $15,000.
    await call(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 3_000_000, receivedOn: "2026-11-10" },
    });
    const o = await call<WaiverOverviewDto>(t.waivers, { as: t.as });
    // Progress only: no final waiver while a balance is owed.
    expect(o.toSend).toEqual([
      {
        payAppId: expect.any(String),
        number: 1,
        scope: "progress",
        state: "AZ",
        reason: "missing",
        remainingCents: 3_000_000,
        partial: true,
      },
    ]);
    expect(o.suggestedKind).toBe("unconditional-progress");
    expect(o.prefill).toMatchObject({ checkAmountCents: 3_000_000, amountPaidCents: 3_000_000 });
    const cash = `/api/orgs/${t.orgId}/reports/cash`;
    const r = await call<CashReport>(cash, { as: t.as });
    expect(r.totals.waiversToSend).toBe(1);
    expect(r.projects[0]?.actions.join(" ")).toContain(
      "the unconditional progress waiver for the $30,000.00 received is next",
    );

    // Its waiver sent: nothing until the balance comes in, then only the second check's.
    await markSent(t, (await track(t, "AZ", "unconditional-progress", 3_000_000)).id);
    expect((await call<WaiverOverviewDto>(t.waivers, { as: t.as })).toSend).toEqual([]);
    expect((await call<CashReport>(cash, { as: t.as })).totals.waiversToSend).toBe(0);
    await call(`${t.appPath}/payments`, {
      method: "POST",
      as: t.as,
      expect: 201,
      json: { amountCents: 1_500_000, receivedOn: "2026-11-20" },
    });
    const after = await call<WaiverOverviewDto>(t.waivers, { as: t.as });
    expect(after.toSend.map((x) => [x.scope, x.remainingCents, x.partial])).toEqual([
      ["progress", 1_500_000, undefined],
      ["final", undefined, undefined],
    ]);
  });
});
