// Shop load and lead time (services/quotes/shop-load.ts): won quotes not shipped are the open jobs,
// each machine's hours a day turn them into booked days, and a new quote's lead time is planned
// behind them. Saving a job needs a won quote; hours a day need an admin; nothing crosses shops.
import type { QuoteDetailDto } from "@shared/api";
import type { CostInputs } from "@shared/costing";
import { describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

interface LoadDto {
  today: string;
  startOn: string;
  jobs: {
    id: string;
    label: string;
    finishOn: string | null;
    workingDays: number | null;
    hours: number;
    late: boolean;
    problems: string[];
  }[];
  machines: { id: string; hours: number; bookedDays: number; hoursPerDay: number | null }[];
}
interface LeadDto {
  openJobs: number;
  lines: {
    partNumber: string;
    breaks: {
      quantity: number;
      workingDays: number | null;
      hours: number;
      problems: string[];
      text: string | null;
    }[];
  }[];
}

async function quote(t: Tenant, partNumber: string, inputs: Partial<CostInputs>, send = true) {
  const q = await json<QuoteDetailDto>(
    api(t.path("/quotes"), { method: "POST", as: t.userId, json: { customerCompany: "Acme" } }),
    201,
  );
  await json(
    api(t.path(`/quotes/${q.id}/lines`), {
      method: "POST",
      as: t.userId,
      json: { partNumber, inputs },
    }),
    201,
  );
  if (send) await json(api(t.path(`/quotes/${q.id}/send`), { method: "POST", as: t.userId }));
  return json<QuoteDetailDto>(api(t.path(`/quotes/${q.id}`), { as: t.userId }));
}

const win = (t: Tenant, id: string) =>
  json(
    api(t.path(`/quotes/${id}/outcome`), {
      method: "POST",
      as: t.userId,
      json: { outcome: "won", poNumber: "PO-1" },
    }),
  );

const setHours = (t: Tenant, machineId: string, hoursPerDay: number | null, as = t.userId) =>
  api(t.path(`/shop-load/machines/${machineId}`), {
    method: "PUT",
    as,
    json: { hoursPerDay },
  });

const millOp = (machineId: string, setupMinutes: number, cycle: number | null) => ({
  machineId,
  label: "",
  setupMinutes,
  cycleMinutesPerPart: cycle,
});

describe("shop load", () => {
  it("books won quotes on the machines and plans a new quote behind them", async () => {
    const t = await setupTenant();
    const r = await seedRateCard(t);
    // Without hours a day, the job is listed but not planned.
    const won = await quote(t, "BRK-1", {
      quantities: [100],
      customerSuppliedMaterial: true,
      material: null,
      operations: [millOp(r.mill, 60, 4.2)],
    });
    await win(t, won.id);
    let load = await json<LoadDto>(api(t.path("/shop-load"), { as: t.userId }));
    expect(load.jobs).toHaveLength(1);
    expect(load.jobs[0]?.problems).toEqual(["Haas VF-2: set its hours per day"]);

    expect((await setHours(t, r.mill, 8)).status).toBe(200);
    load = await json<LoadDto>(api(t.path("/shop-load"), { as: t.userId }));
    // 60 + 100 × 4.2 = 480 min = 8 h = one 8-hour day.
    expect(load.jobs[0]).toMatchObject({ hours: 8, workingDays: 1, problems: [] });
    expect(load.machines.find((m) => m.id === r.mill)).toMatchObject({
      hours: 8,
      bookedDays: 1,
      hoursPerDay: 8,
    });

    // A draft quote: 10 parts at 24 min + 0 setup = 4 h → half a day after the full day booked.
    const draft = await quote(
      t,
      "NEW-1",
      {
        quantities: [10, 40],
        customerSuppliedMaterial: true,
        material: null,
        operations: [millOp(r.mill, 0, 24)],
      },
      false,
    );
    const lead = await json<LeadDto>(
      api(t.path(`/quotes/${draft.id}/lead-time`), { as: t.userId }),
    );
    expect(lead.openJobs).toBe(1);
    // 10 → ends at 1.5 days (day 2); 40 → 16 h = 2 days → ends at 3.0 (day 3).
    expect(lead.lines[0]?.breaks.map((b) => b.workingDays)).toEqual([2, 3]);
    expect(lead.lines[0]?.breaks[0]?.text).toBe("1 week ARO");

    // The won quote's own lead time leaves itself out of the backlog.
    const own = await json<LeadDto>(api(t.path(`/quotes/${won.id}/lead-time`), { as: t.userId }));
    expect(own.openJobs).toBe(0);
    expect(own.lines[0]?.breaks[0]?.workingDays).toBe(1);

    // Shipped: it leaves the load.
    const saved = await json<{ shippedOn: string | null }>(
      api(t.path(`/quotes/${won.id}/job`), {
        method: "PUT",
        as: t.userId,
        json: { dueOn: "2026-12-18", shippedOn: "2026-12-10" },
      }),
    );
    expect(saved.shippedOn).toBe("2026-12-10");
    load = await json<LoadDto>(api(t.path("/shop-load"), { as: t.userId }));
    expect(load.jobs).toHaveLength(0);
    expect(load.machines.find((m) => m.id === r.mill)?.hours).toBe(0);
  });

  it("asks for the quantity ordered on a multi-break win, and takes the saved one", async () => {
    const t = await setupTenant();
    const r = await seedRateCard(t);
    await setHours(t, r.mill, 8);
    const q = await quote(t, "SPC-220", {
      quantities: [10, 100],
      customerSuppliedMaterial: true,
      material: null,
      operations: [millOp(r.mill, 0, 4.8)],
    });
    await win(t, q.id);
    let load = await json<LoadDto>(api(t.path("/shop-load"), { as: t.userId }));
    expect(load.jobs[0]?.problems).toEqual(["SPC-220: save the quantity ordered"]);
    const lineId = q.lines[0]?.id as string;
    await json(
      api(t.path(`/quotes/${q.id}/job`), {
        method: "PUT",
        as: t.userId,
        json: { quantities: { [lineId]: 100 } },
      }),
    );
    load = await json<LoadDto>(api(t.path("/shop-load"), { as: t.userId }));
    // 100 × 4.8 = 480 min = 8 h.
    expect(load.jobs[0]).toMatchObject({ hours: 8, problems: [] });
  });

  it("refuses a job on a quote not won, bad input, the wrong roles and another shop", async () => {
    const t = await setupTenant();
    const r = await seedRateCard(t);
    const sent = await quote(t, "P-1", {
      quantities: [1],
      customerSuppliedMaterial: true,
      material: null,
      operations: [millOp(r.mill, 10, 1)],
    });
    const put = (id: string, body: unknown, as = t.userId) =>
      api(t.path(`/quotes/${id}/job`), { method: "PUT", as, json: body });
    expect((await put(sent.id, { dueOn: "2026-12-18" })).status).toBe(409);
    await win(t, sent.id);
    expect((await put(sent.id, { dueOn: "2026-02-30" })).status).toBe(400);
    expect((await put(sent.id, { quantities: { nope: 3 } })).status).toBe(400);
    expect((await put(sent.id, { dueOn: "2026-12-18", extra: 1 })).status).toBe(400);

    const viewer = await addMember(t.orgId, "viewer");
    expect((await put(sent.id, { dueOn: "2026-12-18" }, viewer)).status).toBe(403);
    expect((await api(t.path("/shop-load"), { as: viewer })).status).toBe(200);
    const estimator = await addMember(t.orgId, "estimator");
    expect((await setHours(t, r.mill, 8, estimator)).status).toBe(403);
    expect((await setHours(t, r.mill, 30)).status).toBe(400);
    expect((await setHours(t, r.mill, 0)).status).toBe(400);

    const other = await setupTenant();
    const theirs = await seedRateCard(other);
    // Another shop's machine and quote are not found from this shop.
    expect((await setHours(t, theirs.mill, 8)).status).toBe(404);
    expect((await api(other.path(`/quotes/${sent.id}/job`), { as: other.userId })).status).toBe(
      404,
    );
    expect(
      (await api(other.path(`/quotes/${sent.id}/lead-time`), { as: other.userId })).status,
    ).toBe(404);
    expect(
      (
        await api(other.path(`/quotes/${sent.id}/job`), {
          method: "PUT",
          as: other.userId,
          json: { dueOn: "2026-12-18" },
        })
      ).status,
    ).toBe(404);
    // And another shop's load never shows this shop's job.
    const theirLoad = await json<LoadDto>(api(other.path("/shop-load"), { as: other.userId }));
    expect(theirLoad.jobs).toHaveLength(0);
  });
});
